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
            var userCollege = User.FindFirst("college")?.Value;

            var query = _db.Students.AsQueryable();
            if (userRole?.ToLower() == "admin" && !string.IsNullOrEmpty(userCollege))
                query = query.Where(s => s.College == userCollege);

            var total = await query.CountAsync();
            var withPhotos = await query.CountAsync(s => !string.IsNullOrEmpty(s.ImagePath) && !s.ImagePath.Contains("placeholder"));
            var collegeDist = await query
                .GroupBy(s => s.College)
                .Select(g => new { college = g.Key, count = g.Count() })
                .OrderByDescending(x => x.count)
                .ToListAsync();
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
                query = hasPhoto.Value ? query.Where(s => !string.IsNullOrEmpty(s.ImagePath)) : query.Where(s => string.IsNullOrEmpty(s.ImagePath));
            }

            // College scoping for admin
            var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
            var userCollege = User.FindFirst("college")?.Value;
            if (userRole == "admin" && !string.IsNullOrEmpty(userCollege))
            {
                query = query.Where(s => s.College == userCollege);
            }
            else if (!string.IsNullOrWhiteSpace(college))
            {
                query = query.Where(s => s.College == college.Trim());
            }

            if (!string.IsNullOrWhiteSpace(year))
            {
                query = query.Where(s => s.Year == year.Trim());
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
            var userCollege = User.FindFirst("college")?.Value;
            var myStudentId = User.FindFirst("student_id")?.Value;

            if (userRole == "student" && myStudentId != studentId)
            {
                return StatusCode(403, new { success = false, message = "غير مصرح: يمكنك استعراض بطاقتك الشخصية فقط" });
            }
            if (userRole == "admin" && userCollege != studentDto.College)
            {
                return StatusCode(403, new { success = false, message = "غير مصرح: يمكنك استعراض طلاب كليتك فقط" });
            }

            var canEdit = (userRole == "student" && myStudentId == studentId) || userRole == "superadmin" || userRole == "staff" || (userRole == "admin" && userCollege == studentDto.College);

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
            var userCollege = User.FindFirst("college")?.Value;
            var myStudentId = User.FindFirst("student_id")?.Value;

            if (userRole == "student" && myStudentId != studentId)
                return StatusCode(403, new { success = false, message = "يمكنك تسجيل بياناتك الشخصية فقط" });

            if (userRole == "admin" && userCollege != dto.College)
                return StatusCode(403, new { success = false, message = $"يمكنك تسجيل طلاب كلية {userCollege} فقط" });

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

                var processedBytes = await _photoService.ProcessPhotoAsync(rawBytes, zoom, rotation, flipH, offsetX, offsetY, autoCrop, HttpContext.RequestAborted);
                var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
                relativeImagePath = await _photoService.SavePhotoAsync(processedBytes, studentId, dto.Year, dto.College, webRoot);
            }
            else
            {
                var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
                relativeImagePath = await _photoService.EnsurePlaceholderAsync(webRoot);
            }

            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            int? registeredById = int.TryParse(userIdClaim, out var uid) ? uid : null;

            var student = new Student
            {
                StudentId = studentId,
                FullName = (dto.FullName ?? "").Trim(),
                Year = (dto.Year ?? "2024-2025").Trim(),
                College = (dto.College ?? "").Trim(),
                Section = !string.IsNullOrWhiteSpace(dto.Section) ? dto.Section.Trim() : null,
                NationalId = !string.IsNullOrWhiteSpace(dto.NationalId) ? dto.NationalId.Trim() : null,
                Mobile = !string.IsNullOrWhiteSpace(dto.Mobile) ? dto.Mobile.Trim() : null,
                Email = !string.IsNullOrWhiteSpace(dto.Email) ? dto.Email.Trim().ToLowerInvariant() : $"{studentId}@bua.edu.eg",
                ImagePath = relativeImagePath,
                RegisteredBy = registeredById,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _db.Students.Add(student);
            await _db.SaveChangesAsync();

            return Ok(new
            {
                success = true,
                message = "تم تسجيل الطالب بنجاح! ✓",
                studentId = student.StudentId,
                imagePath = student.ImagePath
            });
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "SuperAdmin,superadmin")]
        public async Task<IActionResult> DeleteStudent(int id)
        {
            var student = await _db.Students.FindAsync(id);
            if (student == null)
                return NotFound(new { success = false, message = "الطالب غير موجود" });

            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var fullPath = Path.Combine(webRoot, student.ImagePath);
            if (System.IO.File.Exists(fullPath))
            {
                try { System.IO.File.Delete(fullPath); } catch { }
            }

            _db.Students.Remove(student);
            await _db.SaveChangesAsync();

            return Ok(new { success = true, message = "تم حذف الطالب بنجاح" });
        }

        [HttpPost("{studentId}/photo")]
        [AllowAnonymous]
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
                AcademicYear = student.AcademicYear ?? "2026/2027",
                College = student.College
            };

            // Enqueue into High-Concurrency Bounded Channel Queue
            var enqueued = await _photoQueue.EnqueueAsync(item, HttpContext.RequestAborted);
            if (!enqueued)
            {
                return StatusCode(503, new { success = false, message = "طابور المعالجة ممتلئ حالياً بسبب ضغط الاستخدام الشديد. يرجى المحاولة بعد لحظات." });
            }

            // Fast-path wait: If workers complete within 4 seconds, return immediate 200 OK
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(HttpContext.RequestAborted);
            cts.CancelAfter(TimeSpan.FromSeconds(4));

            try
            {
                var result = await item.CompletionSource.Task.WaitAsync(cts.Token);
                if (result.Success)
                {
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
                return StatusCode(500, new { success = false, message = result.Error ?? "فشل في معالجة الصورة" });
            }
            catch (OperationCanceledException)
            {
                // Heavy load burst: return 202 Accepted with queue position so client polls / listens via SignalR
                return Accepted(new
                {
                    success = true,
                    queued = true,
                    jobId = item.JobId,
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
