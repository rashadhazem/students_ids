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
using BuaStudentApi.Models;
using BuaStudentApi.Services;

namespace BuaStudentApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class JobsController : ControllerBase
    {
        private readonly IJobManagerService _jobManager;
        private readonly IPhotoService _photoService;
        private readonly AppDbContext _context;
        private readonly IWebHostEnvironment _env;
        private readonly IPhotoProcessingQueue _photoQueue;

        public JobsController(
            IJobManagerService jobManager,
            IPhotoService photoService,
            AppDbContext context,
            IWebHostEnvironment env,
            IPhotoProcessingQueue photoQueue)
        {
            _jobManager = jobManager;
            _photoService = photoService;
            _context = context;
            _env = env;
            _photoQueue = photoQueue;
        }

        [HttpGet("{jobId}")]
        [AllowAnonymous]
        public IActionResult GetJobStatus(string jobId)
        {
            var job = _jobManager.GetJob(jobId);
            if (job == null)
            {
                return NotFound(new
                {
                    success = false,
                    message = "المهمة غير موجودة"
                });
            }

            return Ok(new
            {
                success = true,
                jobId = job.JobId,
                type = job.Type,
                status = job.Status.ToString(),
                progress = job.Progress,
                result = job.Result,
                error = job.Error,
                createdAt = job.CreatedAt,
                completedAt = job.CompletedAt
            });
        }

        [HttpPost("photo/submit")]
        [Authorize]
        [RequestSizeLimit(15 * 1024 * 1024)]
        public async Task<IActionResult> SubmitPhotoJob(
            [FromForm] IFormFile? image,
            [FromForm] IFormFile? file,
            [FromForm] string? student_id,
            [FromForm] string? studentId,
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
            var uploaded = image ?? file;
            var targetSid = (!string.IsNullOrWhiteSpace(studentId) ? studentId : student_id)?.Trim();

            if (uploaded == null || uploaded.Length == 0)
                return BadRequest(new { success = false, message = "يرجى اختيار ملف الصورة" });

            if (string.IsNullOrWhiteSpace(targetSid))
                return BadRequest(new { success = false, message = "الرقم الجامعي مطلوب" });

            var currentRole = User.FindFirstValue(ClaimTypes.Role) ?? "";
            var currentUserId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : (int?)null;
            var currentCollege = User.FindFirstValue("College");
            var myStudentId = User.FindFirstValue("student_id");

            var student = await _context.Students.FirstOrDefaultAsync(s => s.StudentId == targetSid);
            if (student == null)
                return NotFound(new { success = false, message = $"الطالب {targetSid} غير موجود" });

            // RBAC checks
            if (currentRole.Equals("Student", StringComparison.OrdinalIgnoreCase))
            {
                if (!string.IsNullOrEmpty(myStudentId) && myStudentId != targetSid)
                    return Forbid();
            }
            else if (currentRole.Equals("Admin", StringComparison.OrdinalIgnoreCase))
            {
                if (!string.IsNullOrEmpty(currentCollege) && student.College != currentCollege)
                    return Forbid();
            }

            using var ms = new MemoryStream();
            await uploaded.CopyToAsync(ms);
            var rawBytes = ms.ToArray();

            var (isValid, msg) = _photoService.ValidateMagicBytes(rawBytes);
            if (!isValid)
                return BadRequest(new { success = false, message = msg });

            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var academicYear = student.AcademicYear ?? "2024-2025";
            var finalFlip = flipH || (!string.IsNullOrWhiteSpace(flip_h) && (flip_h == "1" || flip_h.Equals("true", StringComparison.OrdinalIgnoreCase)));
            var finalOx = offset_x != 0 ? offset_x : offsetX;
            var finalOy = offset_y != 0 ? offset_y : offsetY;
            var finalAutoCrop = autoCrop && (string.IsNullOrWhiteSpace(auto_crop) || auto_crop == "1" || auto_crop.Equals("true", StringComparison.OrdinalIgnoreCase));

            var job = _jobManager.CreateJob("photo", currentUserId);

            var item = new PhotoWorkItem
            {
                JobId = job.JobId,
                StudentId = targetSid,
                RawBytes = rawBytes,
                Zoom = zoom,
                Rotation = rotation,
                FlipH = finalFlip,
                OffsetX = finalOx,
                OffsetY = finalOy,
                AutoCrop = finalAutoCrop,
                AcademicYear = academicYear,
                College = student.College
            };

            var enqueued = await _photoQueue.EnqueueAsync(item);
            if (!enqueued)
            {
                await _jobManager.FailJobAsync(job.JobId, "طابور المعالجة ممتلئ حالياً بسبب الضغط الشديد");
                return StatusCode(503, new { success = false, message = "طابور المعالجة ممتلئ حالياً بسبب الضغط الشديد" });
            }

            return Accepted(new
            {
                success = true,
                asyncJob = true,
                jobId = job.JobId,
                queuePosition = _photoQueue.CurrentQueueLength,
                status = "Processing",
                message = "تم استلام صورتك وإدراجها في طابور المعالجة بنجاح"
            });
        }
    }
}
