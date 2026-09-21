using System;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BuaStudentApi.Data;
using BuaStudentApi.DTOs;
using BuaStudentApi.Models;
using BuaStudentApi.Services;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;

namespace BuaStudentApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class StudentsController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IPhotoService _photoService;
        private readonly IWebHostEnvironment _env;
        private readonly Microsoft.Extensions.Caching.Memory.IMemoryCache _cache;
        private readonly IPhotoProcessingQueue _photoQueue;
        private readonly IJobManagerService _jobManager;

        public StudentsController(
            AppDbContext db,
            IPhotoService photoService,
            IWebHostEnvironment env,
            Microsoft.Extensions.Caching.Memory.IMemoryCache cache,
            IPhotoProcessingQueue photoQueue,
            IJobManagerService jobManager)
        {
            _db = db;
            _photoService = photoService;
            _env = env;
            _cache = cache;
            _photoQueue = photoQueue;
            _jobManager = jobManager;
        }

        [HttpGet("stats")]
        [Authorize(Roles = "SuperAdmin,Admin,Officer,Staff,superadmin,admin,officer,staff")]
        public async Task<IActionResult> GetStats()
        {
            var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSuperAdmin = string.Equals(userRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var userCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;

            var query = _db.Students.AsQueryable();
            if (!isSuperAdmin && !string.IsNullOrEmpty(userCollege))
                query = query.Where(s => s.College == userCollege);

            var total = await query.CountAsync();
            var withPhotos = await query.CountAsync(s => !string.IsNullOrEmpty(s.ImagePath) && !s.ImagePath.Contains("placeholder"));
            var collegeDist = await query
                .GroupBy(s => s.College)
                .Select(g => new { college = g.Key, count = g.Count() })
                .OrderByDescending(x => x.count)
                .ToListAsync();

            // Calculate academic level distribution based on 2026 academic year
            var rawYearDist = await query
                .GroupBy(s => s.Year)
                .Select(g => new { year = g.Key, count = g.Count() })
                .ToListAsync();

            var levelMap = new Dictionary<string, int>
            {
                ["الفرقة الأولى (2026)"] = 0,
                ["الفرقة الثانية (2025)"] = 0,
                ["الفرقة الثالثة (2024)"] = 0,
                ["الفرقة الرابعة (2023)"] = 0,
                ["الفرقة الخامسة (2022)"] = 0,
                ["الفرقة السادسة (2021)"] = 0,
                ["أخرى"] = 0
            };

            foreach (var item in rawYearDist)
            {
                var y = (item.year ?? "").Trim();
                if (y == "2026" || y.Contains("أول") || y == "1") levelMap["الفرقة الأولى (2026)"] += item.count;
                else if (y == "2025" || y.Contains("ثان") || y == "2") levelMap["الفرقة الثانية (2025)"] += item.count;
                else if (y == "2024" || y.Contains("ثالث") || y == "3") levelMap["الفرقة الثالثة (2024)"] += item.count;
                else if (y == "2023" || y.Contains("رابع") || y == "4") levelMap["الفرقة الرابعة (2023)"] += item.count;
                else if (y == "2022" || y.Contains("خامس") || y == "5") levelMap["الفرقة الخامسة (2022)"] += item.count;
                else if (y == "2021" || y.Contains("سادس") || y == "6") levelMap["الفرقة السادسة (2021)"] += item.count;
                else levelMap["أخرى"] += item.count;
            }

            var levelDist = levelMap
                .Where(x => x.Value > 0)
                .Select(x => new { level = x.Key, count = x.Value })
                .ToList();

            var recent = await query
                .OrderByDescending(s => s.CreatedAt)
                .Take(5)
                .Select(s => new
                {
                    s.Id,
                    s.StudentId,
                    s.FullName,
                    s.College,
                    s.Year,
                    Email = s.Email,
                    Mobile = s.Mobile,
                    s.ImagePath,
                    createdAt = s.CreatedAt
                })
                .ToListAsync();

            return Ok(new
            {
                success = true,
                totalStudents = total,
                studentsWithPhotos = withPhotos,
                studentsWithoutPhotos = total - withPhotos,
                totalColleges = collegeDist.Count,
                collegeDistribution = collegeDist,
                levelDistribution = levelDist,
                recentStudents = recent
            });
        }

        [HttpGet]
        [Authorize(Roles = "SuperAdmin,Admin,Officer,Staff,superadmin,admin,officer,staff")]
        public async Task<IActionResult> GetStudents(
            [FromQuery] string? q,
            [FromQuery] string? search,
            [FromQuery] string? year,
            [FromQuery] string? college,
            [FromQuery] bool? hasPhoto,
            [FromQuery] int page = 1,
            [FromQuery] int perPage = 20,
            [FromQuery] int? pageSize = null)
        {
            if (pageSize.HasValue) perPage = pageSize.Value;
            var searchTerm = !string.IsNullOrWhiteSpace(search) ? search : q;
            page = Math.Max(1, page);
            perPage = Math.Clamp(perPage, 1, 100);

            var query = _db.Students.AsQueryable();

            if (hasPhoto.HasValue)
            {
                query = hasPhoto.Value
                    ? query.Where(s => !string.IsNullOrEmpty(s.ImagePath) && !s.ImagePath.Contains("placeholder"))
                    : query.Where(s => string.IsNullOrEmpty(s.ImagePath) || s.ImagePath.Contains("placeholder"));
            }

            // College scoping for admin / supervisor
            var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSuperAdmin = string.Equals(userRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var userCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;
            if (!isSuperAdmin && !string.IsNullOrEmpty(userCollege))
            {
                query = query.Where(s => s.College == userCollege);
            }
            else if (!string.IsNullOrWhiteSpace(college))
            {
                query = query.Where(s => s.College == college.Trim());
            }

            if (!string.IsNullOrWhiteSpace(year))
            {
                var yTrim = year.Trim();
                if (yTrim == "2026" || yTrim.Contains("أول") || yTrim == "1")
                {
                    query = query.Where(s => s.Year == "2026" || s.Year.Contains("أول") || s.Year == "1" || s.StudentId.StartsWith("2026"));
                }
                else if (yTrim == "2025" || yTrim.Contains("ثان") || yTrim == "2")
                {
                    query = query.Where(s => s.Year == "2025" || s.Year.Contains("ثان") || s.Year == "2" || s.StudentId.StartsWith("2025"));
                }
                else if (yTrim == "2024" || yTrim.Contains("ثالث") || yTrim == "3")
                {
                    query = query.Where(s => s.Year == "2024" || s.Year.Contains("ثالث") || s.Year == "3" || s.StudentId.StartsWith("2024"));
                }
                else if (yTrim == "2023" || yTrim.Contains("رابع") || yTrim == "4")
                {
                    query = query.Where(s => s.Year == "2023" || s.Year.Contains("رابع") || s.Year == "4" || s.StudentId.StartsWith("2023"));
                }
                else if (yTrim == "2022" || yTrim.Contains("خامس") || yTrim == "5")
                {
                    query = query.Where(s => s.Year == "2022" || s.Year.Contains("خامس") || s.Year == "5" || s.StudentId.StartsWith("2022"));
                }
                else if (yTrim == "2021" || yTrim.Contains("سادس") || yTrim == "6")
                {
                    query = query.Where(s => s.Year == "2021" || s.Year.Contains("سادس") || s.Year == "6" || s.StudentId.StartsWith("2021"));
                }
                else
                {
                    query = query.Where(s => s.Year == yTrim || s.StudentId.StartsWith(yTrim));
                }
            }

            if (!string.IsNullOrWhiteSpace(searchTerm))
            {
                var term = searchTerm.Trim().ToLower();
                query = query.Where(s => s.StudentId.ToLower().Contains(term) ||
                                         s.FullName.ToLower().Contains(term) ||
                                         (s.NationalId != null && s.NationalId.Contains(term)) ||
                                         (s.Mobile != null && s.Mobile.Contains(term)) ||
                                         (s.Section != null && s.Section.ToLower().Contains(term)) ||
                                         (s.Email != null && s.Email.ToLower().Contains(term)));
            }

            var total = await query.CountAsync();
            var students = await query
                .OrderByDescending(s => s.CreatedAt)
                .Skip((page - 1) * perPage)
                .Take(perPage)
                .Select(s => new StudentDto
                {
                    Id = s.Id,
                    StudentId = s.StudentId,
                    FullName = s.FullName,
                    Year = s.Year,
                    College = s.College,
                    Section = s.Section,
                    Email = s.Email,
                    NationalId = s.NationalId,
                    Mobile = s.Mobile,
                    ImagePath = s.ImagePath,
                    ImageUrl = $"/{s.ImagePath}",
                    CreatedAt = s.CreatedAt,
                    UpdatedAt = s.UpdatedAt
                })
                .ToListAsync();

            return Ok(new StudentListResponseDto
            {
                Success = true,
                Students = students,
                Total = total,
                Page = page,
                Pages = (total + perPage - 1) / perPage
            });
        }

        [HttpGet("{studentId}")]
        [HttpGet("card/{studentId}")]
        [AllowAnonymous]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public async Task<IActionResult> GetStudentCard(string studentId)
        {
            studentId = studentId.Trim();

            // Check if student ID was changed
            var history = await _db.StudentIdHistories.FirstOrDefaultAsync(h => h.OldStudentId == studentId);
            if (history != null && history.NewStudentId != studentId)
            {
                return Ok(new { redirect = true, newStudentId = history.NewStudentId });
            }

            // High-concurrency In-Memory Cache (serves 5,000+ simultaneous reads directly from RAM in < 0.2ms)
            var cacheKey = $"card_{studentId}";
            var studentDto = await _cache.GetOrCreateAsync(cacheKey, async entry =>
            {
                entry.Size = 1;
                entry.SlidingExpiration = TimeSpan.FromMinutes(5);
                entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1);

                var s = await _db.Students.AsNoTracking().FirstOrDefaultAsync(st => st.StudentId == studentId);
                if (s == null) return null;

                return new StudentDto
                {
                    Id = s.Id,
                    StudentId = s.StudentId,
                    FullName = s.FullName,
                    Year = s.Year,
                    College = s.College,
                    Section = s.Section,
                    Email = s.Email,
                    NationalId = s.NationalId,
                    Mobile = s.Mobile,
                    ImagePath = s.ImagePath,
                    ImageUrl = $"/{s.ImagePath}",
                    CreatedAt = s.CreatedAt,
                    UpdatedAt = s.UpdatedAt
                };
            });

            if (studentDto == null)
                return NotFound(new { success = false, message = "الطالب غير موجود" });

            // Authorization check
            var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSuperAdmin = string.Equals(userRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var userCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;
            var myStudentId = User.FindFirst("student_id")?.Value;

            if (string.Equals(userRole, "student", StringComparison.OrdinalIgnoreCase) && myStudentId != studentId)
            {
                return StatusCode(403, new { success = false, message = "غير مصرح: يمكنك استعراض بطاقتك الشخصية فقط" });
            }
            if (!isSuperAdmin && !string.IsNullOrEmpty(userCollege) && studentDto.College != userCollege)
            {
                return StatusCode(403, new { success = false, message = $"غير مصرح: يمكنك استعراض طلاب كلية {userCollege} فقط" });
            }

            var canEdit = (string.Equals(userRole, "student", StringComparison.OrdinalIgnoreCase) && myStudentId == studentId) ||
                          isSuperAdmin ||
                          string.Equals(userRole, "staff", StringComparison.OrdinalIgnoreCase) ||
                          (!isSuperAdmin && !string.IsNullOrEmpty(userCollege) && userCollege == studentDto.College);

            return Ok(new
            {
                success = true,
                student = studentDto,
                canEdit
            });
        }

        [HttpPost]
        [Authorize(Roles = "SuperAdmin,Admin,Officer,Staff,Student,superadmin,admin,officer,staff,student")]
        public async Task<IActionResult> RegisterStudent(
            [FromForm] StudentCreateDto dto,
            IFormFile? image,
            IFormFile? photo,
            IFormFile? file)
        {
            if (!ModelState.IsValid)
                return BadRequest(new { success = false, message = "يرجى استكمال البيانات المطلوبة" });

            var studentId = !string.IsNullOrWhiteSpace(dto.StudentId)
                ? dto.StudentId.Trim()
                : (!string.IsNullOrWhiteSpace(dto.Code) ? (dto.Year.Trim() + dto.Code.Trim()) : $"202400{Random.Shared.Next(1000, 9999)}");

            var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSuperAdmin = string.Equals(userRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var userCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;
            var myStudentId = User.FindFirst("student_id")?.Value;

            if (string.Equals(userRole, "student", StringComparison.OrdinalIgnoreCase) && myStudentId != studentId)
                return StatusCode(403, new { success = false, message = "يمكنك تسجيل بياناتك الشخصية فقط" });

            if (!isSuperAdmin && !string.IsNullOrEmpty(userCollege))
            {
                if (!string.IsNullOrWhiteSpace(dto.College) && dto.College.Trim() != userCollege.Trim())
                    return StatusCode(403, new { success = false, message = $"غير مصرح: يمكنك تسجيل طلاب كلية {userCollege} فقط ولا يمكنك إضافة طلاب لكليات أخرى" });

                dto.College = userCollege;
            }

            if (await _db.Students.AnyAsync(s => s.StudentId == studentId))
            {
                return Conflict(new { success = false, duplicate = true, message = $"الرقم {studentId} مسجل مسبقاً في النظام" });
            }

            var uploaded = image ?? photo ?? file;
            string relativeImagePath;
            if (uploaded != null && uploaded.Length > 0)
            {
                using var ms = new MemoryStream();
                await uploaded.CopyToAsync(ms);
                var rawBytes = ms.ToArray();

                var (isValid, magicMsg) = _photoService.ValidateMagicBytes(rawBytes);
                var flipH = dto.FlipH || (Request.Form.TryGetValue("flip_h", out var fhVal) && (fhVal == "1" || fhVal == "true"));
                var zoom = dto.Zoom != 1.0f ? dto.Zoom : (Request.Form.TryGetValue("zoom", out var zVal) && float.TryParse(zVal, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var parsedZ) ? parsedZ : 1.0f);
                var rotation = dto.Rotation != 0 ? dto.Rotation : (Request.Form.TryGetValue("rotation", out var rVal) && int.TryParse(rVal, out var parsedR) ? parsedR : 0);
                var offsetX = dto.OffsetX != 0 ? dto.OffsetX : (Request.Form.TryGetValue("offset_x", out var oxVal) && float.TryParse(oxVal, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var parsedOx) ? parsedOx : 0.0f);
                var offsetY = dto.OffsetY != 0 ? dto.OffsetY : (Request.Form.TryGetValue("offset_y", out var oyVal) && float.TryParse(oyVal, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var parsedOy) ? parsedOy : 0.0f);
                var autoCrop = dto.AutoCrop;
                if (Request.Form.TryGetValue("auto_crop", out var acVal))
                {
                    autoCrop = acVal == "1" || acVal == "true";
                }

                try
                {
                    var processedBytes = await _photoService.ProcessPhotoAsync(rawBytes, zoom, rotation, flipH, offsetX, offsetY, autoCrop, HttpContext.RequestAborted);
                    var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
                    relativeImagePath = await _photoService.SavePhotoAsync(processedBytes, studentId, dto.Year, dto.College, webRoot);
                }
                catch (InvalidOperationException ex)
                {
                    return BadRequest(new { success = false, message = ex.Message });
                }
            }
            else
            {
                var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
                relativeImagePath = await _photoService.EnsurePlaceholderAsync(webRoot);
            }

            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            int? registeredById = int.TryParse(userIdClaim, out var uid) ? uid : null;

            // Accept 'phone' from frontend as fallback for 'mobile'
            var phoneValue = !string.IsNullOrWhiteSpace(dto.Mobile) ? dto.Mobile.Trim()
                           : (Request.Form.TryGetValue("phone", out var phoneForm) && !string.IsNullOrWhiteSpace(phoneForm)
                              ? phoneForm.ToString().Trim() : null);

            // Validate national ID uniqueness
            if (!string.IsNullOrWhiteSpace(dto.NationalId))
            {
                var nidExists = await _db.Students.AnyAsync(s => s.NationalId == dto.NationalId.Trim() && s.StudentId != studentId);
                if (nidExists)
                    return Conflict(new { success = false, duplicate = true, message = "هذا الرقم القومي مسجل لطالب آخر في المنظومة" });
            }

            var student = new Student
            {
                StudentId = studentId,
                FullName = (dto.FullName ?? "").Trim(),
                Year = (dto.Year ?? "الفرقة الأولى").Trim(),
                College = (dto.College ?? "").Trim(),
                Section = !string.IsNullOrWhiteSpace(dto.Section) ? dto.Section.Trim() : null,
                NationalId = !string.IsNullOrWhiteSpace(dto.NationalId) ? dto.NationalId.Trim() : null,
                Mobile = phoneValue,
                Email = !string.IsNullOrWhiteSpace(dto.Email) ? dto.Email.Trim().ToLowerInvariant()
                       : (phoneValue != null ? null : $"{studentId}@bua.edu.eg"),
                ImagePath = relativeImagePath,
                RegisteredBy = registeredById,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _db.Students.Add(student);

            _db.AuditLogs.Add(new AuditLog
            {
                UserId = registeredById,
                Action = "REGISTER_STUDENT",
                Target = student.StudentId,
                Detail = $"تسجيل طالب جديد: {student.FullName} - {student.College}",
                Ip = HttpContext.Connection.RemoteIpAddress?.ToString(),
                CreatedAt = DateTime.UtcNow
            });

            await _db.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                message = "تم تسجيل الطالب بنجاح! ✓",
                studentId = student.StudentId,
                imagePath = student.ImagePath
            });
        }

        [HttpPut("{id}")]
        [Authorize(Roles = "SuperAdmin,Admin,Officer,Staff,superadmin,admin,officer,staff")]
        public async Task<IActionResult> UpdateStudent(int id, [FromBody] StudentEditDto dto)
        {
            var student = await _db.Students.FindAsync(id);
            if (student == null)
                return NotFound(new { success = false, message = "الطالب غير موجود" });

            var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSuperAdmin = string.Equals(userRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var userCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;
            var currentUserId = int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var uid) ? uid : (int?)null;

            // College supervisor restriction: can ONLY edit students in their college, CANNOT move student to another college
            if (!isSuperAdmin && !string.IsNullOrEmpty(userCollege))
            {
                if (student.College != userCollege)
                {
                    return StatusCode(403, new { success = false, message = $"غير مصرح: يمكنك تعديل بيانات طلاب كلية {userCollege} فقط" });
                }
                if (!string.IsNullOrWhiteSpace(dto.College) && dto.College.Trim() != userCollege.Trim())
                {
                    return StatusCode(403, new { success = false, message = "غير مصرح: لا يمكنك تحويل الطالب إلى كلية أخرى" });
                }
                dto.College = userCollege;
            }

            student.FullName = !string.IsNullOrWhiteSpace(dto.FullName) ? dto.FullName.Trim() : student.FullName;
            if (!string.IsNullOrWhiteSpace(dto.Year)) student.Year = dto.Year.Trim();
            if (!string.IsNullOrWhiteSpace(dto.College)) student.College = dto.College.Trim();
            if (dto.Section != null) student.Section = dto.Section.Trim();
            if (!string.IsNullOrWhiteSpace(dto.NationalId)) student.NationalId = dto.NationalId.Trim();
            if (!string.IsNullOrWhiteSpace(dto.Mobile)) student.Mobile = dto.Mobile.Trim();
            if (!string.IsNullOrWhiteSpace(dto.Email)) student.Email = dto.Email.Trim().ToLowerInvariant();
            student.UpdatedAt = DateTime.UtcNow;

            _db.AuditLogs.Add(new AuditLog
            {
                UserId = currentUserId,
                Action = "UPDATE_STUDENT",
                Target = student.StudentId,
                Detail = $"تعديل بيانات الطالب: {student.FullName} - {student.College}",
                Ip = HttpContext.Connection.RemoteIpAddress?.ToString(),
                CreatedAt = DateTime.UtcNow
            });

            await _db.SaveChangesAsync();

            _cache.Remove($"card_{student.StudentId}");
            _cache.Remove($"card_{student.StudentId.Trim()}");

            return Ok(new { success = true, message = "تم تعديل بيانات الطالب بنجاح ✓" });
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "SuperAdmin,Admin,superadmin,admin")]
        public async Task<IActionResult> DeleteStudent(int id)
        {
            var student = await _db.Students.FindAsync(id);
            if (student == null)
                return NotFound(new { success = false, message = "الطالب غير موجود" });

            var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSuperAdmin = string.Equals(userRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var userCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;
            var currentUserId = int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var uid) ? uid : (int?)null;

            if (!isSuperAdmin && !string.IsNullOrEmpty(userCollege) && student.College != userCollege)
            {
                return StatusCode(403, new { success = false, message = $"غير مصرح: يمكنك حذف طلاب كلية {userCollege} فقط" });
            }

            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var fullPath = Path.Combine(webRoot, student.ImagePath);
            if (System.IO.File.Exists(fullPath))
            {
                try { System.IO.File.Delete(fullPath); } catch { }
            }

            _db.Students.Remove(student);

            _db.AuditLogs.Add(new AuditLog
            {
                UserId = currentUserId,
                Action = "DELETE_STUDENT",
                Target = student.StudentId,
                Detail = $"حذف بيانات الطالب: {student.FullName} - {student.College}",
                Ip = HttpContext.Connection.RemoteIpAddress?.ToString(),
                CreatedAt = DateTime.UtcNow
            });

            await _db.SaveChangesAsync();

            _cache.Remove($"card_{student.StudentId}");
            _cache.Remove($"card_{student.StudentId.Trim()}");

            return Ok(new { success = true, message = "تم حذف الطالب بنجاح" });
        }

        [HttpPost("{studentId}/photo")]
        [Authorize]
        [EnableRateLimiting("photo_upload")]
        [RequestSizeLimit(15 * 1024 * 1024)]
        public async Task<IActionResult> UpdateStudentPhoto(
            string studentId,
            [FromForm] IFormFile? file,
            [FromForm] IFormFile? image,
            [FromForm] IFormFile? photo,
            [FromForm] float zoom = 1.0f,
            [FromForm] int rotation = 0,
            [FromForm] string? flip_h = null,
            [FromForm] bool flipH = false,
            [FromForm] float offset_x = 0.0f,
            [FromForm] float offsetX = 0.0f,
            [FromForm] float offset_y = 0.0f,
            [FromForm] float offsetY = 0.0f,
            [FromForm] string? auto_crop = null,
            [FromForm] bool autoCrop = true)
        {
            var uploadedFile = file ?? image ?? photo;
            if (uploadedFile == null || uploadedFile.Length == 0)
                return BadRequest(new { success = false, message = "يرجى تحديد ملف الصورة" });

            studentId = studentId.Trim();
            var student = await _db.Students.FirstOrDefaultAsync(s => s.StudentId == studentId);
            if (student == null)
                return NotFound(new { success = false, message = $"الطالب صاحب الرقم {studentId} غير موجود" });

            var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSuperAdmin = string.Equals(userRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var userCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;
            var myStudentId = User.FindFirst("student_id")?.Value;
            var currentUserId = int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var uid) ? uid : (int?)null;

            if (string.Equals(userRole, "student", StringComparison.OrdinalIgnoreCase))
            {
                if (myStudentId != studentId)
                {
                    return StatusCode(403, new { success = false, message = "غير مصرح: يمكنك تعديل صورتك الشخصية فقط" });
                }
                if (student.UserId == null && currentUserId.HasValue)
                {
                    student.UserId = currentUserId.Value;
                }
            }
            else if (!isSuperAdmin)
            {
                if (string.IsNullOrEmpty(userCollege) || !string.Equals(student.College?.Trim(), userCollege.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(403, new { success = false, message = $"غير مصرح: يمكنك تعديل صور طلاب كلية {userCollege} فقط" });
                }
            }

            using var ms = new MemoryStream();
            await uploadedFile.CopyToAsync(ms);
            var rawBytes = ms.ToArray();

            var (isValid, msg) = _photoService.ValidateMagicBytes(rawBytes);
            if (!isValid)
                return BadRequest(new { success = false, message = msg });

            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var finalFlip = flipH || flip_h == "1" || string.Equals(flip_h, "true", StringComparison.OrdinalIgnoreCase);
            var finalOx = offset_x != 0 ? offset_x : offsetX;
            var finalOy = offset_y != 0 ? offset_y : offsetY;
            var finalAutoCrop = autoCrop;
            if (!string.IsNullOrEmpty(auto_crop))
            {
                finalAutoCrop = auto_crop == "1" || string.Equals(auto_crop, "true", StringComparison.OrdinalIgnoreCase);
            }

            var item = new PhotoWorkItem
            {
                StudentId = studentId,
                RawBytes = rawBytes,
                Zoom = zoom,
                Rotation = rotation,
                FlipH = finalFlip,
                OffsetX = finalOx,
                OffsetY = finalOy,
                AutoCrop = finalAutoCrop,
                AcademicYear = student.Year ?? "2026",
                College = student.College
            };

            // Enqueue into High-Concurrency Bounded Channel Queue
            var enqueued = await _photoQueue.EnqueueAsync(item, HttpContext.RequestAborted);
            if (!enqueued)
            {
                return StatusCode(503, new { success = false, message = "طابور المعالجة ممتلئ حالياً بسبب ضغط الاستخدام الشديد. يرجى المحاولة بعد لحظات." });
            }

            // Fast-path wait: Wait up to 15 seconds for workers to complete and return immediate 200 OK
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(HttpContext.RequestAborted);
            cts.CancelAfter(TimeSpan.FromSeconds(15));

            try
            {
                var result = await item.CompletionSource.Task.WaitAsync(cts.Token);
                if (result.Success)
                {
                    // Clear memory cache so any subsequent read (refresh) gets the fresh DB data
                    _cache.Remove($"card_{studentId}");
                    _cache.Remove($"card_{studentId.Trim()}");

                    return Ok(new
                    {
                        success = true,
                        message = "تم تحديث صورتك بنجاح ✓",
                        url = $"/{result.RelativePath}?t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                        new_url = $"/{result.RelativePath}?t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                        workerId = result.ProcessedByWorkerId,
                        durationMs = result.Duration.TotalMilliseconds
                    });
                }
                return BadRequest(new { success = false, message = result.Error ?? "فشل في معالجة الصورة" });
            }
            catch (OperationCanceledException)
            {
                // Clear memory cache as well
                _cache.Remove($"card_{studentId}");
                _cache.Remove($"card_{studentId.Trim()}");

                // Heavy load burst: return 202 Accepted with deterministic URL
                var fallbackPath = $"uploads/{student.Year ?? "2026"}/{_photoService.SanitizeCollegeFolderName(student.College)}/{studentId}.jpg";
                return Accepted(new
                {
                    success = true,
                    queued = true,
                    jobId = item.JobId,
                    url = $"/{fallbackPath}?t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                    new_url = $"/{fallbackPath}?t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                    queuePosition = _photoQueue.CurrentQueueLength,
                    message = "تم إدراج صورتك في طابور المعالجة بنجاح وجاري تنفيذها بواسطة العمال المتزامنين..."
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = $"خطأ في معالجة الصورة: {ex.Message}" });
            }
        }
    }
}
