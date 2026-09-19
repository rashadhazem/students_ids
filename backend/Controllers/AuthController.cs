using System;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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

            if (user == null || !BCrypt.Net.BCrypt.Verify(password, user.PasswordHash))
            {
                return Unauthorized(new { success = false, message = "بيانات الدخول غير صحيحة. تحقق من اسم المستخدم أو كلمة المرور." });
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
    }
}
