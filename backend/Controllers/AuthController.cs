using System;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using BuaStudentApi.Data;
using BuaStudentApi.DTOs;
using BuaStudentApi.Models;
using BuaStudentApi.Services;

namespace BuaStudentApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IJwtService _jwtService;
        private readonly IEmailService _emailService;

        public AuthController(AppDbContext db, IJwtService jwtService, IEmailService emailService)
        {
            _db = db;
            _jwtService = jwtService;
            _emailService = emailService;
        }

        [HttpPost("login")]
        [EnableRateLimiting("login_limit")]  // Max 10 login attempts/min per IP
        public async Task<IActionResult> Login([FromBody] LoginRequestDto dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "بيانات غير صالحة" });

            var username = dto.Username.Trim().ToLowerInvariant();
            var password = dto.Password.Trim();

            // 1. Unified lookup: by email OR superadmin alias OR by student_id
            var user = await _db.Users.FirstOrDefaultAsync(u =>
                u.Email.ToLower() == username ||
                (u.Email.ToLower() == "admin@bua.edu.eg" && username == "superadmin") ||
                (u.StudentId != null && u.StudentId == username));

            // Fallback check: student_id matched via email pattern (e.g. 2026101001@bua.edu.eg)
            if (user == null && username.All(char.IsDigit))
            {
                var emailPattern = $"{username}@";
                user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower().StartsWith(emailPattern));
            }

            // 2. Student Authentication Check:
            // Students log in using their university email (which contains their student code) and National ID as password.
            // If the student's email was not initially stored in the DB, we match their code, verify National ID, and persist the email.
            if (user == null || !BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
            {
                Student? student = null;

                // A. Check if password matches a student's National ID directly
                if (!string.IsNullOrWhiteSpace(password))
                {
                    student = await _db.Students.FirstOrDefaultAsync(s => s.NationalId != null && s.NationalId.Trim() == password);
                }

                // B. If not found by National ID, extract student code sequence from the entered username/email
                if (student == null)
                {
                    var digitMatches = System.Text.RegularExpressions.Regex.Matches(username, @"\d+");
                    foreach (System.Text.RegularExpressions.Match m in digitMatches)
                    {
                        var potentialCode = m.Value;
                        student = await _db.Students.FirstOrDefaultAsync(s => s.StudentId == potentialCode);
                        if (student != null) break;
                    }
                }

                // C. Fallback: match by email or student ID directly
                if (student == null)
                {
                    student = await _db.Students.FirstOrDefaultAsync(s =>
                        (s.Email != null && s.Email.ToLower() == username) ||
                        (s.StudentId != null && s.StudentId == username) ||
                        (username.Contains("@") && s.StudentId != null && username.Contains(s.StudentId.ToLower()))
                    );
                }

                if (student != null)
                {
                    // Verify:
                    // 1) Student code exists inside the entered email (or exact student_id or email match)
                    bool codeMatchesEmail = !string.IsNullOrEmpty(student.StudentId) &&
                        (username.Contains(student.StudentId.ToLower()) || (username.All(char.IsDigit) && username == student.StudentId));
                    bool emailMatches = !string.IsNullOrEmpty(student.Email) && string.Equals(student.Email.Trim(), username, StringComparison.OrdinalIgnoreCase);

                    // 2) Password matches National ID strictly
                    bool isNationalIdMatch = !string.IsNullOrEmpty(student.NationalId) && student.NationalId.Trim() == password;

                    if ((codeMatchesEmail || emailMatches) && isNationalIdMatch)
                    {
                        // Save/persist the student's entered email in the database if provided with @
                        if (username.Contains("@"))
                        {
                            student.Email = username;
                        }

                        if (user == null)
                        {
                            user = await _db.Users.FirstOrDefaultAsync(u => u.StudentId == student.StudentId || (student.Email != null && u.Email.ToLower() == student.Email.ToLower()));
                        }

                        var activeEmail = username.Contains("@") ? username : (!string.IsNullOrEmpty(student.Email) ? student.Email : $"{student.StudentId}@bua.edu.eg");

                        if (user == null)
                        {
                            user = new User
                            {
                                Username = student.StudentId,
                                Email = activeEmail,
                                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
                                Role = "student",
                                College = student.College,
                                StudentId = student.StudentId,
                                FullName = student.FullName,
                                IsActive = true,
                                EmailVerified = true,
                                CreatedAt = DateTime.UtcNow
                            };
                            _db.Users.Add(user);
                            await _db.SaveChangesAsync();

                            student.UserId = user.Id;
                            await _db.SaveChangesAsync();
                        }
                        else
                        {
                            user.Email = activeEmail;
                            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(password);
                            if (student.UserId == null)
                            {
                                student.UserId = user.Id;
                            }
                            await _db.SaveChangesAsync();
                        }
                    }
                }
            }

            if (user == null || !BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
            {
                return Unauthorized(new { success = false, message = "بيانات الدخول غير صحيحة. تحقق من البريد الإلكتروني أو كلمة المرور." });
            }

            if (!user.IsActive)
            {
                return StatusCode(403, new { success = false, message = "تم تعطيل هذا الحساب. يرجى مراجعة إدارة النظام." });
            }

            if (!user.EmailVerified && !string.Equals(user.Role, "student", StringComparison.OrdinalIgnoreCase) && string.IsNullOrEmpty(user.StudentId))
            {
                return StatusCode(403, new
                {
                    success = false,
                    unverified = true,
                    unverifiedEmail = user.Email,
                    message = "لم يتم تفعيل الحساب بعد. يرجى فحص بريدك الإلكتروني والنقر على رابط التفعيل."
                });
            }

            // Log action
            _db.AuditLogs.Add(new AuditLog
            {
                UserId = user.Id,
                Action = "LOGIN",
                Target = user.Email,
                Detail = $"Role: {user.Role}",
                Ip = HttpContext.Connection.RemoteIpAddress?.ToString(),
                CreatedAt = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();

            var token = _jwtService.GenerateToken(user);

            Response.Cookies.Append("bua_access_token", token, new CookieOptions
            {
                HttpOnly = true,
                Secure = Request.IsHttps,
                SameSite = SameSiteMode.Lax,
                Expires = DateTimeOffset.UtcNow.AddHours(24)
            });

            return Ok(new AuthResponseDto
            {
                Success = true,
                Token = token,
                User = new UserProfileDto
                {
                    Id = user.Id,
                    Email = user.Email,
                    FullName = user.FullName,
                    Role = user.Role,
                    College = user.College,
                    StudentId = user.StudentId
                }
            });
        }

        [HttpPost("student-login")]
        [EnableRateLimiting("login_limit")]  // Max 10 attempts/min per IP
        public async Task<IActionResult> StudentLogin([FromBody] StudentLoginRequestDto dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "يرجى إدخال البريد الإلكتروني والرقم القومي" });

            // 1. Normalize inputs and convert any Arabic numerals to English digits
            var emailInput = ExcelImportService.ToEng(dto.Email).Trim().ToLowerInvariant();
            var nationalIdInput = ExcelImportService.ToEng(dto.NationalId).Trim();

            if (string.IsNullOrWhiteSpace(emailInput) || string.IsNullOrWhiteSpace(nationalIdInput))
            {
                return BadRequest(new { success = false, message = "يرجى كتابة البريد الإلكتروني والرقم القومي كاملاً" });
            }

            // 2. Find student by NationalId
            var student = await _db.Students.FirstOrDefaultAsync(s => s.NationalId != null && s.NationalId == nationalIdInput);
            if (student == null)
            {
                return Unauthorized(new { success = false, message = "الرقم القومي غير مسجل في المنظومة. يرجى مراجعة شؤون الطلاب." });
            }

            // 3. Verify that the Student Code (student.StudentId) matches or is contained in the entered email (e.g. mohammed.2023010080@bua.edu.eg)
            var studentCode = (student.StudentId ?? "").Trim().ToLowerInvariant();
            var codeMatch = System.Text.RegularExpressions.Regex.Match(emailInput, @"(\d+)");
            string extractedCode = codeMatch.Success ? codeMatch.Groups[1].Value : "";

            bool codeMatchesEmail = !string.IsNullOrEmpty(studentCode) && 
                (emailInput.Contains(studentCode) || (!string.IsNullOrEmpty(extractedCode) && (studentCode.Contains(extractedCode) || extractedCode.Contains(studentCode))));
            bool emailMatches = !string.IsNullOrEmpty(student.Email) && string.Equals(student.Email.Trim(), emailInput, StringComparison.OrdinalIgnoreCase);

            if (!codeMatchesEmail && !emailMatches)
            {
                return Unauthorized(new { success = false, message = "البريد الإلكتروني المدخل لا يتطابق مع كود الطالب المسجل لهذا الرقم القومي." });
            }

            // Sync student's active email with the entered official university email
            if (student.Email != emailInput)
            {
                student.Email = emailInput;
            }

            // 4. Ensure a User account exists for this student
            var user = await _db.Users.FirstOrDefaultAsync(u => u.StudentId == student.StudentId || u.Email.ToLower() == emailInput);
            if (user == null)
            {
                user = new User
                {
                    Username = student.StudentId,
                    Email = emailInput,
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(student.NationalId ?? student.StudentId),
                    Role = "student",
                    College = student.College,
                    StudentId = student.StudentId,
                    FullName = student.FullName,
                    IsActive = true,
                    EmailVerified = true,
                    CreatedAt = DateTime.UtcNow
                };
                _db.Users.Add(user);
                await _db.SaveChangesAsync();

                student.UserId = user.Id;
                await _db.SaveChangesAsync();
            }
            else
            {
                if (user.Email != emailInput)
                {
                    user.Email = emailInput;
                }
                if (student.UserId == null)
                {
                    student.UserId = user.Id;
                }
                await _db.SaveChangesAsync();
            }

            if (!user.IsActive)
            {
                return StatusCode(403, new { success = false, message = "تم تعطيل هذا الحساب. يرجى مراجعة إدارة شؤون الطلاب." });
            }

            // 5. Update last login & Audit log
            user.LastLogin = DateTime.UtcNow;
            _db.AuditLogs.Add(new AuditLog
            {
                UserId = user.Id,
                Action = "STUDENT_LOGIN",
                Target = student.StudentId,
                Detail = $"Student logged in with National ID and Email: {emailInput}",
                Ip = HttpContext.Connection.RemoteIpAddress?.ToString(),
                CreatedAt = DateTime.UtcNow
            });
            await _db.SaveChangesAsync();

            // 6. Generate JWT Token
            var token = _jwtService.GenerateToken(user);

            Response.Cookies.Append("bua_access_token", token, new CookieOptions
            {
                HttpOnly = true,
                Secure = Request.IsHttps,
                SameSite = SameSiteMode.Lax,
                Expires = DateTimeOffset.UtcNow.AddHours(24)
            });

            return Ok(new AuthResponseDto
            {
                Success = true,
                Token = token,
                User = new UserProfileDto
                {
                    Id = user.Id,
                    Email = user.Email,
                    FullName = student.FullName,
                    Role = "student",
                    College = student.College,
                    StudentId = student.StudentId
                }
            });
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequestDto dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "يرجى التحقق من صحة البيانات المدخلة" });

            var email = dto.Email.Trim().ToLowerInvariant();
            if (await _db.Users.AnyAsync(u => u.Email.ToLower() == email))
            {
                return Conflict(new { success = false, message = "هذا البريد مسجل مسبقاً في النظام" });
            }

            var studentId = dto.Year.Trim() + dto.Code.Trim();
            var verifyToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            var passwordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password);

            var user = new User
            {
                Email = email,
                PasswordHash = passwordHash,
                FullName = dto.FullName.Trim(),
                Role = "student",
                College = dto.College,
                StudentId = studentId,
                EmailVerified = false,
                IsActive = true,
                VerifyToken = verifyToken,
                CreatedAt = DateTime.UtcNow
            };

            _db.Users.Add(user);
            await _db.SaveChangesAsync();

            // Send verification email
            var verifyLink = $"{Request.Scheme}://{Request.Host}/api/auth/verify?token={verifyToken}";
            var emailHtml = _emailService.GetVerificationEmailHtml(user.FullName, verifyLink);
            await _emailService.SendEmailAsync(user.Email, "تفعيل حسابك في النظام الجامعي", emailHtml);

            return Ok(new
            {
                success = true,
                message = "تم إنشاء حسابك بنجاح! تم إرسال رابط التفعيل إلى بريدك الإلكتروني.",
                registeredEmail = user.Email
            });
        }

        [HttpGet("verify")]
        public async Task<IActionResult> VerifyEmail([FromQuery] string token)
        {
            if (string.IsNullOrWhiteSpace(token))
                return BadRequest("رمز التفعيل غير صالح");

            var user = await _db.Users.FirstOrDefaultAsync(u => u.VerifyToken == token);
            if (user == null)
                return NotFound("رابط التفعيل غير صالح أو منتهي الصلاحية");

            user.EmailVerified = true;
            user.VerifyToken = null;
            await _db.SaveChangesAsync();

            return Content("<div dir='rtl' style='font-family:Arial;text-align:center;padding:50px;'><h2>تم تفعيل حسابك بنجاح! ✓</h2><p>يمكنك الآن تسجيل الدخول إلى النظام.</p></div>", "text/html");
        }

        [HttpPost("change-password")]
        [Authorize]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDto dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "يرجى التحقق من المدخلات" });

            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(userIdClaim, out var userId))
                return Unauthorized();

            var user = await _db.Users.FindAsync(userId);
            if (user == null)
                return NotFound(new { success = false, message = "المستخدم غير موجود" });

            if (!BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, user.PasswordHash))
            {
                return BadRequest(new { success = false, message = "كلمة المرور الحالية غير صحيحة" });
            }

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
            await _db.SaveChangesAsync();

            return Ok(new { success = true, message = "تم تغيير كلمة المرور بنجاح ✓" });
        }

        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Email))
                return BadRequest(new { success = false, message = "يرجى إدخال البريد الإلكتروني" });

            var emailInput = ExcelImportService.ToEng(dto.Email).Trim().ToLowerInvariant();

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == emailInput || (u.StudentId != null && u.StudentId == emailInput));

            if (user == null && emailInput.All(char.IsDigit))
            {
                var student = await _db.Students.FirstOrDefaultAsync(s => s.StudentId == emailInput);
                if (student != null)
                {
                    user = await _db.Users.FirstOrDefaultAsync(u => u.StudentId == student.StudentId);
                }
            }

            if (user != null)
            {
                var resetToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
                user.ResetToken = resetToken;
                user.ResetExpires = DateTime.UtcNow.AddHours(1);
                await _db.SaveChangesAsync();

                var clientOrigin = Request.Headers["Origin"].FirstOrDefault() ?? $"{Request.Scheme}://{Request.Host}";
                var resetLink = $"{clientOrigin}/reset-password?token={resetToken}";

                var emailHtml = _emailService.GetPasswordResetEmailHtml(user.FullName, resetLink);
                await _emailService.SendEmailAsync(user.Email, "إعادة تعيين كلمة المرور - جامعة بدر بأسيوط", emailHtml);
            }

            return Ok(new
            {
                success = true,
                message = "إذا كان الحساب مسجلاً لدينا، فستصلك رسالة تحتوي على رابط استعادة كلمة المرور عبر بريدك الإلكتروني."
            });
        }

        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Token) || string.IsNullOrWhiteSpace(dto.Password))
                return BadRequest(new { success = false, message = "بيانات الاستعادة غير مكتملة" });

            if (dto.Password.Length < 6)
                return BadRequest(new { success = false, message = "كلمة المرور يجب ألا تقل عن 6 أحرف أو أرقام" });

            var user = await _db.Users.FirstOrDefaultAsync(u => u.ResetToken == dto.Token);
            if (user == null || (user.ResetExpires.HasValue && user.ResetExpires.Value < DateTime.UtcNow))
            {
                return BadRequest(new { success = false, message = "رابط استعادة كلمة المرور غير صالح أو منتهي الصلاحية" });
            }

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password.Trim());
            user.ResetToken = null;
            user.ResetExpires = null;
            await _db.SaveChangesAsync();

            return Ok(new { success = true, message = "تم تعيين كلمة المرور الجديدة بنجاح ✓ يمكنك الآن تسجيل الدخول بها." });
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<IActionResult> GetCurrentUser()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(userIdClaim, out var userId))
                return Unauthorized();

            var user = await _db.Users.FindAsync(userId);
            if (user == null)
                return NotFound();

            return Ok(new
            {
                success = true,
                user = new UserProfileDto
                {
                    Id = user.Id,
                    Email = user.Email,
                    FullName = user.FullName,
                    Role = user.Role,
                    College = user.College,
                    StudentId = user.StudentId,
                    IsActive = user.IsActive
                }
            });
        }

        [HttpPut("profile")]
        [Authorize]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileDto dto)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "يرجى التحقق من صحة البيانات المدخلة" });

            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(userIdClaim, out var userId))
                return Unauthorized();

            var user = await _db.Users.FindAsync(userId);
            if (user == null)
                return NotFound(new { success = false, message = "المستخدم غير موجود" });

            bool emailChanged = false;
            var newEmail = dto.Email.Trim().ToLowerInvariant();

            // Validate email change
            if (!string.Equals(user.Email, newEmail, StringComparison.OrdinalIgnoreCase))
            {
                var emailExists = await _db.Users.AnyAsync(u => u.Id != user.Id && u.Email.ToLower() == newEmail);
                if (emailExists)
                {
                    return Conflict(new { success = false, message = "البريد الإلكتروني الجديد مستخدم بالفعل بحساب آخر" });
                }

                user.Email = newEmail;
                user.Username = newEmail;
                emailChanged = true;

                // If user is a student, sync to student record
                if (!string.IsNullOrEmpty(user.StudentId))
                {
                    var student = await _db.Students.FirstOrDefaultAsync(s => s.StudentId == user.StudentId);
                    if (student != null)
                    {
                        student.Email = newEmail;
                    }
                }
            }

            // Update Full Name
            if (!string.IsNullOrWhiteSpace(dto.FullName))
            {
                user.FullName = dto.FullName.Trim();
                if (!string.IsNullOrEmpty(user.StudentId))
                {
                    var student = await _db.Students.FirstOrDefaultAsync(s => s.StudentId == user.StudentId);
                    if (student != null)
                    {
                        student.FullName = user.FullName;
                    }
                }
            }

            // Password change check
            bool passwordChanged = false;
            if (!string.IsNullOrWhiteSpace(dto.NewPassword))
            {
                if (string.IsNullOrWhiteSpace(dto.CurrentPassword))
                {
                    return BadRequest(new { success = false, message = "يرجى إدخال كلمة المرور الحالية لتأكيد التغيير" });
                }

                if (!BCrypt.Net.BCrypt.Verify(dto.CurrentPassword, user.PasswordHash))
                {
                    return BadRequest(new { success = false, message = "كلمة المرور الحالية غير صحيحة" });
                }

                if (dto.NewPassword != dto.ConfirmNewPassword)
                {
                    return BadRequest(new { success = false, message = "كلمة المرور الجديدة وتأكيدها غير متطابقين" });
                }

                // Password strength validation
                if (dto.NewPassword.Length < 8)
                {
                    return BadRequest(new { success = false, message = "كلمة المرور يجب أن لا تقل عن 8 أحرف" });
                }

                bool hasUpper = dto.NewPassword.Any(char.IsUpper);
                bool hasLower = dto.NewPassword.Any(char.IsLower);
                bool hasDigit = dto.NewPassword.Any(char.IsDigit);
                bool hasSpecial = System.Text.RegularExpressions.Regex.IsMatch(dto.NewPassword, @"[!@#$%^&*()_+\-=\[\]{};':""\\|,.<>\/?~`]");

                if (!hasUpper || !hasLower || !hasDigit || !hasSpecial)
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = "يجب أن تكون كلمة المرور قوية وتحتوي على: حرف كبير (A-Z)، حرف صغير (a-z)، رقم (0-9)، ورمز خاص (@, #, $, %, إلخ)."
                    });
                }

                user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.NewPassword);
                passwordChanged = true;
            }

            // Audit log
            _db.AuditLogs.Add(new AuditLog
            {
                UserId = user.Id,
                Action = "UPDATE_PROFILE",
                Target = user.Email,
                Detail = $"Updated profile (EmailChanged={emailChanged}, PasswordChanged={passwordChanged})",
                Ip = HttpContext.Connection.RemoteIpAddress?.ToString(),
                CreatedAt = DateTime.UtcNow
            });

            await _db.SaveChangesAsync();

            // Re-generate JWT token
            var token = _jwtService.GenerateToken(user);
            Response.Cookies.Append("bua_access_token", token, new CookieOptions
            {
                HttpOnly = true,
                Secure = Request.IsHttps,
                SameSite = SameSiteMode.Lax,
                Expires = DateTimeOffset.UtcNow.AddHours(24)
            });

            return Ok(new
            {
                success = true,
                message = "تم تحديث البيانات بنجاح ✓",
                token,
                user = new UserProfileDto
                {
                    Id = user.Id,
                    Email = user.Email,
                    FullName = user.FullName,
                    Role = user.Role,
                    College = user.College,
                    StudentId = user.StudentId,
                    IsActive = user.IsActive
                }
            });
        }

        [HttpPost("resend-verification")]
        public async Task<IActionResult> ResendVerification([FromBody] ResendVerificationDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Email))
                return BadRequest(new { success = false, message = "يرجى إدخال البريد الإلكتروني" });

            var email = dto.Email.Trim().ToLowerInvariant();
            var user = await _db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email);

            if (user == null)
            {
                return NotFound(new { success = false, message = "البريد الإلكتروني غير مسجل في النظام" });
            }

            if (user.EmailVerified)
            {
                return BadRequest(new { success = false, message = "هذا الحساب مفعل بالفعل، يمكنك تسجيل الدخول مباشرة" });
            }

            var verifyToken = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            user.VerifyToken = verifyToken;
            await _db.SaveChangesAsync();

            var verifyLink = $"{Request.Scheme}://{Request.Host}/api/auth/verify?token={verifyToken}";
            var emailHtml = _emailService.GetVerificationEmailHtml(user.FullName, verifyLink);
            await _emailService.SendEmailAsync(user.Email, "تفعيل حسابك في النظام الجامعي", emailHtml);

            return Ok(new { success = true, message = "تم إرسال رابط التفعيل الجديد بنجاح إلى بريدك الإلكتروني ✓" });
        }

        [HttpPost("logout")]
        public IActionResult Logout()
        {
            Response.Cookies.Delete("bua_access_token", new CookieOptions
            {
                HttpOnly = true,
                Secure = Request.IsHttps,
                SameSite = SameSiteMode.Lax
            });
            return Ok(new { success = true, message = "تم تسجيل الخروج بنجاح" });
        }
    }
}
