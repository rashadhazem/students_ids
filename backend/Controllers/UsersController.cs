using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BuaStudentApi.Data;
using BuaStudentApi.DTOs;
using BuaStudentApi.Models;

namespace BuaStudentApi.Controllers
{
    public class CreateUserRequest
    {
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string Role { get; set; } = "Officer";
        public string? College { get; set; }
        public string? StudentId { get; set; }
    }

    public class UpdateUserRequest
    {
        public string? Email { get; set; }
        public string? Role { get; set; }
        public string? College { get; set; }
        public bool? IsActive { get; set; }
    }

    public class AdminResetPasswordRequest
    {
        public string NewPassword { get; set; } = string.Empty;
    }

    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "SuperAdmin,Admin,superadmin,admin")]
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _context;

        public UsersController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetUsers(
            [FromQuery] string? search,
            [FromQuery] string? role,
            [FromQuery] string? college,
            [FromQuery] bool? isActive,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            var currentRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "";
            var isSuperAdmin = string.Equals(currentRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var currentCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;

            var query = _context.Users
                .Where(u => u.Role != "student" && u.Role != "Student")
                .AsQueryable();

            // Admin college isolation
            if (!isSuperAdmin && !string.IsNullOrWhiteSpace(currentCollege))
            {
                query = query.Where(u => u.College == currentCollege);
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim().ToLower();
                query = query.Where(u => u.Email.ToLower().Contains(s) ||
                                         u.FullName.ToLower().Contains(s) ||
                                         (u.StudentId != null && u.StudentId.Contains(s)));
            }

            if (!string.IsNullOrWhiteSpace(role))
            {
                query = query.Where(u => u.Role == role);
            }

            if (!string.IsNullOrWhiteSpace(college))
            {
                query = query.Where(u => u.College == college);
            }

            if (isActive.HasValue)
            {
                query = query.Where(u => u.IsActive == isActive.Value);
            }

            var totalCount = await query.CountAsync();
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 5, 100);

            var items = await query
                .OrderByDescending(u => u.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(u => new UserProfileDto
                {
                    Id = u.Id,
                    Username = u.Username,
                    Email = u.Email,
                    Role = u.Role,
                    College = u.College,
                    StudentId = u.StudentId,
                    IsActive = u.IsActive,
                    EmailVerified = u.EmailVerified,
                    LastLogin = u.LastLogin,
                    CreatedAt = u.CreatedAt
                })
                .ToListAsync();

            return Ok(new
            {
                success = true,
                totalCount,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling(totalCount / (double)pageSize),
                data = items
            });
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetUser(int id)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null)
                return NotFound(new { success = false, message = "المستخدم غير موجود" });

            var currentRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "";
            var isSuperAdmin = string.Equals(currentRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var currentCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;
            if (!isSuperAdmin && !string.IsNullOrWhiteSpace(currentCollege) && user.College != currentCollege)
                return StatusCode(403, new { success = false, message = "غير مصرح لك باستعراض بيانات هذا المستخدم" });

            return Ok(new
            {
                success = true,
                user = new UserProfileDto
                {
                    Id = user.Id,
                    Username = user.Username,
                    Email = user.Email,
                    Role = user.Role,
                    College = user.College,
                    StudentId = user.StudentId,
                    IsActive = user.IsActive,
                    EmailVerified = user.EmailVerified,
                    LastLogin = user.LastLogin,
                    CreatedAt = user.CreatedAt
                }
            });
        }

        [HttpPost]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
                return BadRequest(new { success = false, message = "اسم المستخدم وكلمة المرور مطلوبان" });

            var currentRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "";
            var isSuperAdmin = string.Equals(currentRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var currentCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;

            if (!isSuperAdmin)
            {
                if (string.Equals(request.Role, "superadmin", StringComparison.OrdinalIgnoreCase) || string.Equals(request.Role, "admin", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { success = false, message = "غير مصرح لك بإنشاء حساب مسؤول أو مدير نظام" });

                request.College = currentCollege;
            }

            var cleanUsername = request.Username.Trim();
            var cleanEmail = request.Email.Trim().ToLower();

            if (await _context.Users.AnyAsync(u => u.Email.ToLower() == cleanEmail))
                return BadRequest(new { success = false, message = "البريد الإلكتروني مسجل بالفعل" });

            if (!string.IsNullOrWhiteSpace(cleanEmail) && await _context.Users.AnyAsync(u => u.Email.ToLower() == cleanEmail))
                return BadRequest(new { success = false, message = "البريد الإلكتروني مسجل بالفعل لمستخدم آخر" });

            var user = new User
            {
                Username = cleanUsername,
                Email = cleanEmail,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                Role = request.Role,
                College = request.College,
                StudentId = request.StudentId,
                IsActive = true,
                EmailVerified = true,
                CreatedAt = DateTime.UtcNow
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                message = "تم إنشاء المستخدم بنجاح",
                userId = user.Id
            });
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateUserRequest request)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null)
                return NotFound(new { success = false, message = "المستخدم غير موجود" });

            var currentRole = User.FindFirstValue(ClaimTypes.Role) ?? "";
            var currentUserId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : 0;
            var currentCollege = User.FindFirstValue("College");

            if (currentRole == "Admin" && !string.IsNullOrWhiteSpace(currentCollege) && user.College != currentCollege)
                return Forbid();

            if (!string.IsNullOrWhiteSpace(request.Email))
            {
                var cleanEmail = request.Email.Trim().ToLower();
                var emailTaken = await _context.Users.AnyAsync(u => u.Id != id && u.Email.ToLower() == cleanEmail);
                if (emailTaken)
                    return BadRequest(new { success = false, message = "البريد الإلكتروني مستخدم بالفعل" });

                user.Email = cleanEmail;
            }

            if (!string.IsNullOrWhiteSpace(request.Role) && currentRole == "SuperAdmin")
            {
                // Protect last SuperAdmin
                if (user.Role == "SuperAdmin" && request.Role != "SuperAdmin")
                {
                    var superCount = await _context.Users.CountAsync(u => u.Role == "SuperAdmin");
                    if (superCount <= 1)
                        return BadRequest(new { success = false, message = "لا يمكن تغيير صلاحية آخر مدير نظام في المنظومة" });
                }
                user.Role = request.Role;
            }

            if (request.College != null)
                user.College = request.College;

            if (request.IsActive.HasValue)
            {
                if (id == currentUserId && !request.IsActive.Value)
                    return BadRequest(new { success = false, message = "لا يمكنك إلغاء تفعيل حسابك الحالي" });

                user.IsActive = request.IsActive.Value;
            }

            await _context.SaveChangesAsync();
            return Ok(new { success = true, message = "تم تحديث بيانات المستخدم بنجاح" });
        }

        [HttpPatch("{id}/toggle-active")]
        public async Task<IActionResult> ToggleActive(int id)
        {
            var currentUserId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : 0;
            if (id == currentUserId)
                return BadRequest(new { success = false, message = "لا يمكنك تعديل حالة حسابك النشط حالياً" });

            var user = await _context.Users.FindAsync(id);
            if (user == null)
                return NotFound(new { success = false, message = "المستخدم غير موجود" });

            user.IsActive = !user.IsActive;
            await _context.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                message = user.IsActive ? "تم تفعيل الحساب بنجاح" : "تم إيقاف الحساب بنجاح",
                isActive = user.IsActive
            });
        }

        [HttpPost("{id}/reset-password")]
        public async Task<IActionResult> ResetPassword(int id, [FromBody] AdminResetPasswordRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 6)
                return BadRequest(new { success = false, message = "كلمة المرور يجب ألا تقل عن 6 أحرف" });

            var user = await _context.Users.FindAsync(id);
            if (user == null)
                return NotFound(new { success = false, message = "المستخدم غير موجود" });

            var currentRole = User.FindFirstValue(ClaimTypes.Role) ?? "";
            var currentCollege = User.FindFirstValue("College");
            if (currentRole == "Admin" && !string.IsNullOrWhiteSpace(currentCollege) && user.College != currentCollege)
                return Forbid();

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            await _context.SaveChangesAsync();

            return Ok(new { success = true, message = "تمت إعادة تعيين كلمة المرور بنجاح" });
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "SuperAdmin")]
        public async Task<IActionResult> DeleteUser(int id)
        {
            var currentUserId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : 0;
            if (id == currentUserId)
                return BadRequest(new { success = false, message = "لا يمكنك حذف حسابك الشخصي" });

            var user = await _context.Users.FindAsync(id);
            if (user == null)
                return NotFound(new { success = false, message = "المستخدم غير موجود" });

            if (user.Role == "SuperAdmin")
            {
                var superCount = await _context.Users.CountAsync(u => u.Role == "SuperAdmin");
                if (superCount <= 1)
                    return BadRequest(new { success = false, message = "لا يمكن حذف آخر مدير نظام في المنظومة" });
            }

            _context.Users.Remove(user);
            await _context.SaveChangesAsync();

            return Ok(new { success = true, message = "تم حذف المستخدم بنجاح" });
        }
    }
}
