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

        [HttpGet("template")]
        [AllowAnonymous]
        public IActionResult DownloadTemplate()
        {
            using var workbook = new XLWorkbook();
            var worksheet = workbook.Worksheets.Add("نموذج استيراد الطلاب");
            worksheet.RightToLeft = true;

            string[] headers = new[]
            {
                "كود الطالب",
                "اسم الطالب",
                "الرقم القومي",
                "رقم الهاتف",
                "البريد الإلكتروني",
                "الكلية",
                "الفرقة الدراسية",
                "القسم / الشعبة"
            };

            for (int i = 0; i < headers.Length; i++)
            {
                var cell = worksheet.Cell(1, i + 1);
                cell.Value = headers[i];
                cell.Style.Font.Bold = true;
                cell.Style.Font.FontColor = XLColor.White;
                cell.Style.Fill.BackgroundColor = XLColor.FromArgb(26, 58, 107);
                cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            }
            worksheet.Row(1).Height = 28;

            // Add sample row
            worksheet.Cell(2, 1).SetValue("2024001001");
            worksheet.Cell(2, 2).SetValue("محمد أحمد محمود علي");
            worksheet.Cell(2, 3).SetValue("30501012501234");
            worksheet.Cell(2, 4).SetValue("01012345678");
            worksheet.Cell(2, 5).SetValue("mohamed.2024001001@bua.edu.eg");
            worksheet.Cell(2, 6).SetValue("كلية  ذكاء اصطناعي وعلوم البيانات");
            worksheet.Cell(2, 7).SetValue("الفرقة الأولى");
            worksheet.Cell(2, 8).SetValue("عام");

            worksheet.Columns().AdjustToContents(15, 45);

            using var stream = new MemoryStream();
            workbook.SaveAs(stream);
            var content = stream.ToArray();

            return File(content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "BUA_Students_Template.xlsx");
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

            var currentRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "";
            var isSuperAdmin = string.Equals(currentRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var currentUserId = int.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var uid) ? uid : (int?)null;
            var userCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;
            var userIp = HttpContext.Connection.RemoteIpAddress?.ToString();

            if (!isSuperAdmin && !string.IsNullOrWhiteSpace(userCollege))
            {
                collegeOverride = userCollege;
            }

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
                    var parseResult = _excelService.ParseFileAdvanced(stream, file.FileName, userCollege, currentRole);
                    var parsedRows = parseResult.ValidRows;
                    var skippedList = new List<BulkImportRowPreview>(parseResult.SkippedRows);
                    var passedList = new List<BulkImportRowPreview>();
                    int emptyRowsCount = parseResult.IgnoredEmptyRows;

                    if ((parsedRows == null || parsedRows.Count == 0) && skippedList.Count == 0)
                    {
                        await _jobManager.FailJobAsync(job.JobId, "لم يتم العثور على أي صفوف أو بيانات صالحة في الملف");
                        return;
                    }

                    var totalRows = parsedRows.Count;
                    await _jobManager.UpdateProgressAsync(job.JobId, 25, $"تم فحص {parseResult.TotalInspectedRows} صف. جاري التدقيق والتحميل لقاعدة البيانات...");

                    int createdCount = 0;
                    int updatedCount = 0;
                    int skippedCount = skippedList.Count;

                    for (int i = 0; i < totalRows; i++)
                    {
                        var row = parsedRows[i];

                        var targetCollege = (!isSuperAdmin && !string.IsNullOrWhiteSpace(userCollege))
                            ? userCollege
                            : (!string.IsNullOrWhiteSpace(collegeOverride)
                                ? collegeOverride.Trim()
                                : (!string.IsNullOrWhiteSpace(row.College) ? row.College.Trim() : (userCollege ?? "عام")));

                        var targetYear = !string.IsNullOrWhiteSpace(yearOverride)
                            ? yearOverride.Trim()
                            : (!string.IsNullOrWhiteSpace(row.Year) ? row.Year.Trim() : "2024-2025");

                        // Role restriction: Supervisor can only import into their college
                        if (!isSuperAdmin && !string.IsNullOrWhiteSpace(userCollege) && !string.IsNullOrWhiteSpace(row.College) && row.College.Trim() != userCollege)
                        {
                            skippedCount++;
                            skippedList.Add(new BulkImportRowPreview
                            {
                                RowNumber = row.RowNumber,
                                Sid = row.StudentId,
                                Name = row.FullName,
                                College = row.College,
                                Status = "تخطي (صلاحيات الكلية)",
                                Reason = $"الصف {row.RowNumber}: غير مصرح لك باستيراد طلاب لكلية {row.College} (مسموح لكلية {userCollege} فقط)"
                            });
                            continue;
                        }

                        var existingStudent = await db.Students.FirstOrDefaultAsync(s => s.StudentId == row.StudentId);

                        if (existingStudent != null)
                        {
                            if (duplicateHandling == "skip")
                            {
                                skippedCount++;
                                skippedList.Add(new BulkImportRowPreview
                                {
                                    RowNumber = row.RowNumber,
                                    Sid = row.StudentId,
                                    Name = row.FullName,
                                    College = targetCollege,
                                    Status = "تخطي (موجود مسبقاً)",
                                    Reason = $"الصف {row.RowNumber}: الطالب ({row.FullName}) مسجل مسبقاً في المنظومة بنفس الكود ({row.StudentId})"
                                });
                                continue;
                            }

                            // Overwrite mode
                            existingStudent.FullName = row.FullName;
                            existingStudent.College = targetCollege;
                            existingStudent.Section = row.Section;
                            existingStudent.Year = targetYear;
                            if (!string.IsNullOrWhiteSpace(row.Email))
                                existingStudent.Email = row.Email;
                            if (!string.IsNullOrWhiteSpace(row.NationalId))
                                existingStudent.NationalId = row.NationalId;
                            if (!string.IsNullOrWhiteSpace(row.Mobile))
                                existingStudent.Mobile = row.Mobile;
                            existingStudent.UpdatedAt = DateTime.UtcNow;

                            updatedCount++;
                            passedList.Add(new BulkImportRowPreview
                            {
                                RowNumber = row.RowNumber,
                                Sid = row.StudentId,
                                Name = row.FullName,
                                College = targetCollege,
                                Status = "تم التحديث",
                                Email = row.Email
                            });
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
                                Year = targetYear,
                                Email = row.Email ?? $"{row.StudentId}@bua.edu.eg",
                                NationalId = row.NationalId,
                                Mobile = row.Mobile,
                                CreatedAt = DateTime.UtcNow,
                                UpdatedAt = DateTime.UtcNow
                            };

                            db.Students.Add(newStudent);
                            createdCount++;
                            passedList.Add(new BulkImportRowPreview
                            {
                                RowNumber = row.RowNumber,
                                Sid = row.StudentId,
                                Name = row.FullName,
                                College = targetCollege,
                                Status = "جديد (تمت الإضافة)",
                                Email = row.Email
                            });
                        }

                        // Broadcast progress every 50 rows or at the end
                        if (i % 50 == 0 || i == totalRows - 1)
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
                        Detail = $"استيراد: {createdCount} جديد، {updatedCount} تم التحديث، {skippedCount} تم التخطي، {emptyRowsCount} فارغ من إجمالي {parseResult.TotalInspectedRows}",
                        Ip = userIp,
                        CreatedAt = DateTime.UtcNow
                    });
                    await db.SaveChangesAsync();

                    var errorMessages = skippedList.Select(s => s.Reason ?? $"{s.Sid} - {s.Status}").ToList();

                    var message = $"اكتملت المعالجة بنجاح! تم إضافة {createdCount} طالب جديد، وتحديث {updatedCount}، وتخطي {skippedCount} صف، وتجاهل {emptyRowsCount} صف فارغ تلقائياً.";

                    await _jobManager.CompleteJobAsync(job.JobId, new BulkImportResultDto
                    {
                        Total = parseResult.TotalInspectedRows,
                        Created = createdCount,
                        Updated = updatedCount,
                        Skipped = skippedCount,
                        IgnoredEmptyRows = emptyRowsCount,
                        Errors = errorMessages,
                        PassedRows = passedList,
                        SkippedRows = skippedList,
                        Preview = passedList.Take(15).Concat(skippedList.Take(15)).ToList(),
                        Message = message
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
    }
}
