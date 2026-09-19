using System;
using System.IO;
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

namespace BuaStudentApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PhotosController : ControllerBase
    {
        private readonly IPhotoService _photoService;
        private readonly IJobManagerService _jobManager;
        private readonly AppDbContext _context;
        private readonly IWebHostEnvironment _env;

        public PhotosController(
            IPhotoService photoService,
            IJobManagerService jobManager,
            AppDbContext context,
            IWebHostEnvironment env)
        {
            _photoService = photoService;
            _jobManager = jobManager;
            _context = context;
            _env = env;
        }

        [HttpPost("crop-preview")]
        [Authorize]
        [RequestSizeLimit(10 * 1024 * 1024)] // 10 MB limit
        public async Task<IActionResult> CropPreview(
            [FromForm] IFormFile? file,
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
            if (file == null || file.Length == 0)
                return BadRequest(new PhotoCropPreviewDto { Success = false, Message = "يرجى اختيار ملف صورة صالح" });

            if (file.Length > 8 * 1024 * 1024)
                return BadRequest(new PhotoCropPreviewDto { Success = false, Message = "حجم الصورة يتجاوز الحد الأقصى (8 ميجابايت)" });

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            var rawBytes = ms.ToArray();

            var (isValid, msg) = _photoService.ValidateMagicBytes(rawBytes);
            if (!isValid)
                return BadRequest(new PhotoCropPreviewDto { Success = false, Message = msg });

            var finalFlip = flipH || flip_h == "1" || string.Equals(flip_h, "true", StringComparison.OrdinalIgnoreCase);
            var finalOx = offset_x != 0 ? offset_x : offsetX;
            var finalOy = offset_y != 0 ? offset_y : offsetY;
            var finalAutoCrop = autoCrop;
            if (!string.IsNullOrEmpty(auto_crop))
            {
                finalAutoCrop = auto_crop == "1" || string.Equals(auto_crop, "true", StringComparison.OrdinalIgnoreCase);
            }

            try
            {
                var processed = await _photoService.ProcessPhotoAsync(rawBytes, zoom, rotation, finalFlip, finalOx, finalOy, finalAutoCrop, HttpContext.RequestAborted);
                var base64 = $"data:image/jpeg;base64,{Convert.ToBase64String(processed)}";

                return Ok(new PhotoCropPreviewDto
                {
                    Success = true,
                    Preview = base64,
                    Message = "تم توليد المعاينة بنجاح"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new PhotoCropPreviewDto { Success = false, Message = $"خطأ في معالجة الصورة: {ex.Message}" });
            }
        }

        [HttpPost("upload")]
        [Authorize]
        [RequestSizeLimit(15 * 1024 * 1024)]
        public async Task<IActionResult> Upload(
            [FromForm] IFormFile? file,
            [FromForm] string studentId,
            [FromForm] string? year,
            [FromForm] string? college,
            [FromForm] float zoom = 1.0f,
            [FromForm] int rotation = 0,
            [FromForm] string? flip_h = null,
            [FromForm] bool flipH = false,
            [FromForm] float offset_x = 0.0f,
            [FromForm] float offsetX = 0.0f,
            [FromForm] float offset_y = 0.0f,
            [FromForm] float offsetY = 0.0f,
            [FromForm] string? auto_crop = null,
            [FromForm] bool autoCrop = true,
            [FromForm] bool asyncJob = false)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new PhotoUploadResponseDto { Success = false, Message = "يرجى تحديد ملف الصورة" });

            if (string.IsNullOrWhiteSpace(studentId))
                return BadRequest(new PhotoUploadResponseDto { Success = false, Message = "رقم الطالب الجامعي مطلوب" });

            studentId = studentId.Trim();

            var currentRole = User.FindFirstValue(ClaimTypes.Role) ?? "";
            var currentUserId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : (int?)null;
            var currentCollege = User.FindFirstValue("College");

            var student = await _context.Students.FirstOrDefaultAsync(s => s.StudentId == studentId);
            if (student == null)
                return NotFound(new PhotoUploadResponseDto { Success = false, Message = $"الطالب صاحب الرقم {studentId} غير موجود" });

            // Role check: Admin can only modify within their college
            if (currentRole == "Admin" && !string.IsNullOrWhiteSpace(currentCollege) && student.College != currentCollege)
                return Forbid();

            // Student role can only modify their own photo
            if (currentRole == "Student" && student.UserId != currentUserId)
                return Forbid();

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            var rawBytes = ms.ToArray();

            var (isValid, msg) = _photoService.ValidateMagicBytes(rawBytes);
            if (!isValid)
                return BadRequest(new PhotoUploadResponseDto { Success = false, Message = msg });

            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var academicYear = !string.IsNullOrWhiteSpace(year) ? year : (student.AcademicYear ?? "2024-2025");
            var studentCollege = !string.IsNullOrWhiteSpace(college) ? college : student.College;

            var finalFlip = flipH || (Request.Form.TryGetValue("flip_h", out var fhVal) && (fhVal == "1" || fhVal == "true"));
            var finalOx = offsetX != 0 ? offsetX : (Request.Form.TryGetValue("offset_x", out var oxVal) && float.TryParse(oxVal, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var parsedOx) ? parsedOx : 0.0f);
            var finalOy = offsetY != 0 ? offsetY : (Request.Form.TryGetValue("offset_y", out var oyVal) && float.TryParse(oyVal, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var parsedOy) ? parsedOy : 0.0f);
            var finalAutoCrop = autoCrop;
            if (Request.Form.TryGetValue("auto_crop", out var acVal))
            {
                finalAutoCrop = acVal == "1" || acVal == "true";
            }

            if (asyncJob)
            {
                var job = _jobManager.CreateJob("photo", currentUserId);

                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _jobManager.UpdateProgressAsync(job.JobId, 30, "جاري معالجة أبعاد واقتصاص الصورة...");
                        var processedBytes = await _photoService.ProcessPhotoAsync(rawBytes, zoom, rotation, finalFlip, finalOx, finalOy, finalAutoCrop);

                        await _jobManager.UpdateProgressAsync(job.JobId, 70, "جاري حفظ الصورة وتحديث قاعدة البيانات...");
                        var relativePath = await _photoService.SavePhotoAsync(processedBytes, studentId, academicYear, studentCollege, webRoot);

                        student.ImagePath = relativePath;
                        student.UpdatedAt = DateTime.UtcNow;

                        _context.AuditLogs.Add(new AuditLog
                        {
                            UserId = currentUserId,
                            Action = "UPLOAD_PHOTO",
                            Target = studentId,
                            Detail = $"تم تحديث صورة الطالب {studentId} بنجاح",
                            Ip = HttpContext.Connection.RemoteIpAddress?.ToString(),
                            CreatedAt = DateTime.UtcNow
                        });

                        await _context.SaveChangesAsync();

                        await _jobManager.CompleteJobAsync(job.JobId, new
                        {
                            studentId,
                            imagePath = relativePath,
                            imageUrl = $"/{relativePath}"
                        });
                    }
                    catch (Exception ex)
                    {
                        await _jobManager.FailJobAsync(job.JobId, $"فشل في معالجة الصورة: {ex.Message}");
                    }
                });

                return Ok(new PhotoUploadResponseDto
                {
                    Success = true,
                    Message = "بدأت معالجة الصورة في الخلفية",
                    JobId = job.JobId,
                    AsyncJob = true
                });
            }

            try
            {
                var processedBytes = await _photoService.ProcessPhotoAsync(rawBytes, zoom, rotation, finalFlip, finalOx, finalOy, finalAutoCrop, HttpContext.RequestAborted);
                var relativePath = await _photoService.SavePhotoAsync(processedBytes, studentId, academicYear, studentCollege, webRoot);

                student.ImagePath = relativePath;
                student.UpdatedAt = DateTime.UtcNow;

                _context.AuditLogs.Add(new AuditLog
                {
                    UserId = currentUserId,
                    Action = "UPLOAD_PHOTO",
                    Target = studentId,
                    Detail = $"تم رفع وتحديث صورة الطالب {studentId}",
                    Ip = HttpContext.Connection.RemoteIpAddress?.ToString(),
                    CreatedAt = DateTime.UtcNow
                });

                await _context.SaveChangesAsync();

                return Ok(new PhotoUploadResponseDto
                {
                    Success = true,
                    Message = "تم حفظ صورة الطالب بنجاح",
                    ImagePath = relativePath,
                    ImageUrl = $"/{relativePath}",
                    AsyncJob = false
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new PhotoUploadResponseDto { Success = false, Message = $"حدث خطأ أثناء حفظ الصورة: {ex.Message}" });
            }
        }

        [HttpGet("placeholder")]
        [AllowAnonymous]
        public async Task<IActionResult> GetPlaceholder()
        {
            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var placeholderRel = await _photoService.EnsurePlaceholderAsync(webRoot);
            var absolute = Path.Combine(webRoot, placeholderRel);
            return PhysicalFile(absolute, "image/jpeg");
        }
    }
}
