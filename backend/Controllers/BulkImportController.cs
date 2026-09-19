using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using BuaStudentApi.Data;
using BuaStudentApi.DTOs;
using BuaStudentApi.Models;
using BuaStudentApi.Services;

namespace BuaStudentApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "SuperAdmin,Admin,Officer,Staff,superadmin,admin,officer,staff")]
    public class BulkImportController : ControllerBase
    {
        private readonly IExcelImportService _excelService;
        private readonly IJobManagerService _jobManager;
        private readonly IServiceScopeFactory _scopeFactory;

        public BulkImportController(
            IExcelImportService excelService,
            IJobManagerService jobManager,
            IServiceScopeFactory scopeFactory)
        {
            _excelService = excelService;
            _jobManager = jobManager;
            _scopeFactory = scopeFactory;
        }

        [HttpPost("upload")]
        [RequestSizeLimit(35 * 1024 * 1024)] // 35 MB
        public async Task<IActionResult> Upload(
            [FromForm] IFormFile? file,
            [FromForm] string? collegeOverride,
            [FromForm] string? yearOverride,
            [FromForm] string duplicateHandling = "overwrite")
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { success = false, message = "يرجى تحديد ملف إكسل صالح" });

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (ext != ".xlsx" && ext != ".xls" && ext != ".csv")
                return BadRequest(new { success = false, message = "صيغة الملف غير مدعومة. الصيغ المسموحة: .xlsx, .xls, .csv" });

            var currentRole = User.FindFirstValue(ClaimTypes.Role) ?? "";
            var currentUserId = int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) ? uid : (int?)null;
            var userCollege = User.FindFirstValue("College");
            var userIp = HttpContext.Connection.RemoteIpAddress?.ToString();

            // Read file into memory buffer so we can process it in background
            byte[] fileBytes;
            using (var ms = new MemoryStream())
            {
                await file.CopyToAsync(ms);
                fileBytes = ms.ToArray();
            }

            var job = _jobManager.CreateJob("bulk_import", currentUserId);

            _ = Task.Run(async () =>
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                try
                {
                    await _jobManager.UpdateProgressAsync(job.JobId, 10, "جاري قراءة وتحليل ملف الإكسل...");

                    using var stream = new MemoryStream(fileBytes);
                    var parsedRows = _excelService.ParseFile(stream, file.FileName, userCollege, currentRole);

                    if (parsedRows == null || parsedRows.Count == 0)
                    {
                        await _jobManager.FailJobAsync(job.JobId, "لم يتم العثور على أي صفوف أو بيانات صالحة في الملف");
                        return;
                    }

                    var totalRows = parsedRows.Count;
                    await _jobManager.UpdateProgressAsync(job.JobId, 25, $"تم العثور على {totalRows} سجل. جاري التدقيق والتحميل لقاعدة البيانات...");

                    int createdCount = 0;
                    int updatedCount = 0;
                    int skippedCount = 0;
                    var errors = new List<string>();
                    var previewList = new List<BulkImportRowPreview>();

                    for (int i = 0; i < totalRows; i++)
                    {
                        var row = parsedRows[i];

                        if (string.IsNullOrWhiteSpace(row.StudentId) || string.IsNullOrWhiteSpace(row.FullName))
                        {
                            skippedCount++;
                            if (errors.Count < 50)
                                errors.Add($"الصف {row.RowNumber}: تم التجاهل لعدم وجود الرقم الجامعي أو الاسم");
                            continue;
                        }

                        var targetCollege = !string.IsNullOrWhiteSpace(collegeOverride)
                            ? collegeOverride.Trim()
                            : (!string.IsNullOrWhiteSpace(row.College) ? row.College.Trim() : (userCollege ?? "عام"));

                        var targetYear = !string.IsNullOrWhiteSpace(yearOverride)
                            ? yearOverride.Trim()
                            : (!string.IsNullOrWhiteSpace(row.Year) ? row.Year.Trim() : "2024-2025");

                        // Role restriction: Admin can only import into their college
                        if (currentRole == "Admin" && !string.IsNullOrWhiteSpace(userCollege) && targetCollege != userCollege)
                        {
                            skippedCount++;
                            if (errors.Count < 50)
                                errors.Add($"الصف {row.RowNumber}: غير مصرح لك باستيراد طلاب لكلية {targetCollege}");
                            continue;
                        }

                        var existingStudent = await db.Students.FirstOrDefaultAsync(s => s.StudentId == row.StudentId);

                        if (existingStudent != null)
                        {
                            if (duplicateHandling == "skip")
                            {
                                skippedCount++;
                                if (previewList.Count < 10)
                                    previewList.Add(new BulkImportRowPreview { Sid = row.StudentId, Name = row.FullName, Status = "تخطي (موجود مسبقاً)", Email = row.Email });
                                continue;
                            }

                            // Overwrite mode
                            existingStudent.FullName = row.FullName;
                            existingStudent.College = targetCollege;
                            existingStudent.Section = row.Section;
                            existingStudent.AcademicYear = targetYear;
                            if (!string.IsNullOrWhiteSpace(row.Email))
                                existingStudent.Email = row.Email;
                            if (!string.IsNullOrWhiteSpace(row.NationalId))
                                existingStudent.NationalId = row.NationalId;
                            if (!string.IsNullOrWhiteSpace(row.Mobile))
                                existingStudent.Mobile = row.Mobile;
                            existingStudent.UpdatedAt = DateTime.UtcNow;

                            updatedCount++;
                            if (previewList.Count < 10)
                                previewList.Add(new BulkImportRowPreview { Sid = row.StudentId, Name = row.FullName, Status = "مُحدّث", Email = row.Email });
                        }
                        else
                        {
                            // Create new student
                            var newStudent = new Student
                            {
                                StudentId = row.StudentId,
                                FullName = row.FullName,
                                College = targetCollege,
                                Section = row.Section,
                                AcademicYear = targetYear,
                                Email = row.Email ?? $"{row.StudentId}@bua.edu.eg",
                                NationalId = row.NationalId,
                                Mobile = row.Mobile,
                                CreatedAt = DateTime.UtcNow,
                                UpdatedAt = DateTime.UtcNow
                            };

                            db.Students.Add(newStudent);
                            createdCount++;
                            if (previewList.Count < 10)
                                previewList.Add(new BulkImportRowPreview { Sid = row.StudentId, Name = row.FullName, Status = "جديد", Email = row.Email });
                        }

                        // Broadcast progress every 100 rows or at the end
                        if (i % 100 == 0 || i == totalRows - 1)
                        {
                            int pct = 25 + (int)(70.0 * (i + 1) / totalRows);
                            await _jobManager.UpdateProgressAsync(job.JobId, pct, $"تمت معالجة {i + 1} من أصل {totalRows} طالب...");
                            await db.SaveChangesAsync();
                        }
                    }

                    // Audit Log
                    db.AuditLogs.Add(new AuditLog
                    {
                        UserId = currentUserId,
                        Action = "BULK_IMPORT",
                        Target = file.FileName,
                        Detail = $"استيراد: {createdCount} جديد، {updatedCount} تم التحديث، {skippedCount} تم التخطي من إجمالي {totalRows}",
                        Ip = userIp,
                        CreatedAt = DateTime.UtcNow
                    });
                    await db.SaveChangesAsync();

                    var finalResult = new BulkImportResultDto
                    {
                        Created = createdCount,
                        Skipped = skippedCount + updatedCount,
                        Errors = errors,
                        Preview = previewList
                    };

                    await _jobManager.CompleteJobAsync(job.JobId, new
                    {
                        total = totalRows,
                        created = createdCount,
                        updated = updatedCount,
                        skipped = skippedCount,
                        errors,
                        preview = previewList,
                        message = $"اكتمل الاستيراد بنجاح! تم إضافة {createdCount} طالب جديد، وتحديث {updatedCount} طالب، وتخطي {skippedCount}."
                    });
                }
                catch (Exception ex)
                {
                    await _jobManager.FailJobAsync(job.JobId, $"حدث خطأ أثناء تنفيذ الاستيراد: {ex.Message}");
                }
            });

            return Ok(new
            {
                success = true,
                jobId = job.JobId,
                message = "تم استلام الملف وبدء عملية الاستيراد الفوري في الخلفية"
            });
        }

        [HttpGet("status/{jobId}")]
        public IActionResult GetStatus(string jobId)
        {
            var job = _jobManager.GetJob(jobId);
            if (job == null)
                return NotFound(new { success = false, message = "المهمة غير موجودة" });

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

        [HttpGet("template")]
        [AllowAnonymous]
        public IActionResult DownloadTemplate()
        {
            using var workbook = new XLWorkbook();
            var worksheet = workbook.Worksheets.Add("الطلاب");
            worksheet.RightToLeft = true;

            // Headers
            string[] headers = new[]
            {
                "الرقم الجامعي",
                "اسم الطالب",
                "الكلية",
                "الفرقة الدراسية",
                "البريد الإلكتروني",
                "الرقم القومي",
                "رقم الهاتف"
            };

            for (int col = 0; col < headers.Length; col++)
            {
                var cell = worksheet.Cell(1, col + 1);
                cell.Value = headers[col];
                cell.Style.Font.Bold = true;
                cell.Style.Font.FontColor = XLColor.White;
                cell.Style.Fill.BackgroundColor = XLColor.FromArgb(26, 58, 107); // BUA Royal Navy
                cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            }
            worksheet.Row(1).Height = 28;

            // Sample rows
            var sampleData = new[]
            {
                new[] { "20240101", "أحمد محمد محمود السيد", "كلية  ذكاء اصطناعي وعلوم البيانات", "الفرقة الأولى", "ahmed.20240101@bua.edu.eg", "30101011234567", "01012345678" },
                new[] { "20240102", "سارة خالد عبد الرحمن حسن", "كلية الصيدلة فارما D", "الفرقة الثانية", "sara.20240102@bua.edu.eg", "30202021234568", "01123456789" },
                new[] { "20240103", "محمود إبراهيم علي حسن", "كلية طب الأسنان", "الفرقة الأولى", "mahmoud.20240103@bua.edu.eg", "30303031234569", "01234567890" }
            };

            for (int r = 0; r < sampleData.Length; r++)
            {
                for (int c = 0; c < sampleData[r].Length; c++)
                {
                    var cell = worksheet.Cell(r + 2, c + 1);
                    cell.Value = sampleData[r][c];
                    cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                }
                worksheet.Row(r + 2).Height = 22;
            }

            worksheet.Columns().AdjustToContents(15, 45);

            using var stream = new MemoryStream();
            workbook.SaveAs(stream);
            var content = stream.ToArray();

            return File(
                content,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "BUA_Students_Template.xlsx"
            );
        }
    }
}
