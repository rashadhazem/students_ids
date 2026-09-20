using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BuaStudentApi.Data;

namespace BuaStudentApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "SuperAdmin,Admin,Officer,Staff,superadmin,admin,officer,staff")]
    public class ExportController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IWebHostEnvironment _env;

        public ExportController(AppDbContext context, IWebHostEnvironment env)
        {
            _context = context;
            _env = env;
        }

        [HttpGet("students-excel")]
        [HttpGet("excel")]
        public async Task<IActionResult> ExportStudentsExcel(
            [FromQuery] string? college,
            [FromQuery] string? year,
            [FromQuery] string? search)
        {
            var currentRole = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSuperAdmin = string.Equals(currentRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var currentCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;

            var query = _context.Students.AsQueryable();

            if (!isSuperAdmin && !string.IsNullOrWhiteSpace(currentCollege))
            {
                query = query.Where(s => s.College == currentCollege);
            }
            else if (!string.IsNullOrWhiteSpace(college))
            {
                query = query.Where(s => s.College == college);
            }

            if (!string.IsNullOrWhiteSpace(year))
            {
                query = query.Where(s => s.Year == year);
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                var q = search.Trim().ToLower();
                query = query.Where(s => s.StudentId.Contains(q) || s.FullName.ToLower().Contains(q) || (s.Email != null && s.Email.ToLower().Contains(q)) || (s.NationalId != null && s.NationalId.Contains(q)));
            }

            var students = await query.OrderBy(s => s.College).ThenBy(s => s.StudentId).ToListAsync();

            using var workbook = new XLWorkbook();
            var worksheet = workbook.Worksheets.Add("بيانات الطلاب");
            worksheet.RightToLeft = true;

            string[] headers = new[]
            {
                "م",
                "الرقم الجامعي",
                "اسم الطالب",
                "الرقم القومي",
                "رقم الهاتف",
                "الكلية",
                "الفرقة الدراسية",
                "القسم / الشعبة",
                "البريد الإلكتروني",
                "الصورة الشخصية",
                "تاريخ الإضافة"
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

            for (int r = 0; r < students.Count; r++)
            {
                var s = students[r];
                var rowIdx = r + 2;

                worksheet.Cell(rowIdx, 1).Value = r + 1;
                worksheet.Cell(rowIdx, 2).Value = s.StudentId;
                worksheet.Cell(rowIdx, 3).Value = s.FullName;
                worksheet.Cell(rowIdx, 4).Value = s.NationalId ?? "-";
                worksheet.Cell(rowIdx, 5).Value = s.Mobile ?? "-";
                worksheet.Cell(rowIdx, 6).Value = s.College;
                worksheet.Cell(rowIdx, 7).Value = s.Year ?? "-";
                worksheet.Cell(rowIdx, 8).Value = s.Section ?? "-";
                worksheet.Cell(rowIdx, 9).Value = s.Email ?? "-";
                worksheet.Cell(rowIdx, 10).Value = (!string.IsNullOrWhiteSpace(s.ImagePath) && !s.ImagePath.Contains("placeholder")) ? "تم الرفع" : "صورة افتراضية";
                worksheet.Cell(rowIdx, 11).Value = s.CreatedAt.ToString("yyyy-MM-dd HH:mm");

                if (r % 2 == 1)
                {
                    worksheet.Row(rowIdx).Style.Fill.BackgroundColor = XLColor.FromArgb(248, 250, 252);
                }
                worksheet.Row(rowIdx).Height = 22;
            }

            worksheet.Columns().AdjustToContents(10, 50);

            using var stream = new MemoryStream();
            workbook.SaveAs(stream);
            var content = stream.ToArray();

            var fileName = $"BUA_Students_{DateTime.Now:yyyyMMdd_HHmm}.xlsx";
            return File(content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        [HttpGet("photos-zip")]
        public async Task<IActionResult> ExportPhotosZip(
            [FromQuery] string? college,
            [FromQuery] string? year)
        {
            var currentRole = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSuperAdmin = string.Equals(currentRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var currentCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;

            var query = _context.Students.Where(s => !string.IsNullOrEmpty(s.ImagePath) && !s.ImagePath.Contains("placeholder"));

            if (!isSuperAdmin && !string.IsNullOrWhiteSpace(currentCollege))
            {
                query = query.Where(s => s.College == currentCollege);
            }
            else if (!string.IsNullOrWhiteSpace(college))
            {
                query = query.Where(s => s.College == college);
            }

            if (!string.IsNullOrWhiteSpace(year))
            {
                query = query.Where(s => s.Year == year);
            }

            var studentsWithPhotos = await query.Select(s => new { s.StudentId, s.ImagePath, s.FullName, s.College, s.Year }).ToListAsync();

            if (studentsWithPhotos.Count == 0)
            {
                return BadRequest(new { success = false, message = "لم يتم العثور على أي صور شخصية معتمدة للطلاب المطابقين للبحث" });
            }

            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");

            using var memoryStream = new MemoryStream();
            using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, true))
            {
                var addedEntries = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                foreach (var s in studentsWithPhotos)
                {
                    if (string.IsNullOrEmpty(s.ImagePath)) continue;
                    var fullPath = Path.Combine(webRoot, s.ImagePath.Replace('/', Path.DirectorySeparatorChar));

                    if (System.IO.File.Exists(fullPath))
                    {
                        // 1. Year folder (e.g. "2026", "2025")
                        string yearFolder = "2026";
                        if (!string.IsNullOrWhiteSpace(s.Year))
                        {
                            var ym = System.Text.RegularExpressions.Regex.Match(s.Year, @"(20\d{2})");
                            if (ym.Success)
                            {
                                yearFolder = ym.Value;
                            }
                            else
                            {
                                yearFolder = System.Text.RegularExpressions.Regex.Replace(s.Year.Trim(), @"[\s/\\:*?""<>|]+", "_");
                            }
                        }
                        else if (!string.IsNullOrWhiteSpace(s.StudentId) && s.StudentId.Length >= 4 && int.TryParse(s.StudentId[..4], out var y) && y >= 2018 && y <= DateTime.UtcNow.Year + 2)
                        {
                            yearFolder = y.ToString();
                        }

                        // 2. College folder
                        var collegeFolder = string.IsNullOrWhiteSpace(s.College) ? "عام" : System.Text.RegularExpressions.Regex.Replace(s.College.Trim(), @"[\s/\\:*?""<>|]+", "_");

                        // 3. File name: ID only
                        var cleanId = string.IsNullOrWhiteSpace(s.StudentId) ? Path.GetFileNameWithoutExtension(fullPath) : s.StudentId.Trim();
                        var ext = Path.GetExtension(fullPath);
                        if (string.IsNullOrEmpty(ext)) ext = ".jpg";

                        var entryName = $"{yearFolder}/{collegeFolder}/{cleanId}{ext}";
                        if (addedEntries.Add(entryName))
                        {
                            var entry = archive.CreateEntry(entryName, CompressionLevel.Fastest);
                            using var entryStream = entry.Open();
                            using var fileStream = System.IO.File.OpenRead(fullPath);
                            await fileStream.CopyToAsync(entryStream);
                        }
                    }
                }
            }

            memoryStream.Position = 0;
            var zipFileName = $"BUA_Photos_{DateTime.Now:yyyyMMdd_HHmm}.zip";
            return File(memoryStream.ToArray(), "application/zip", zipFileName);
        }
    }
}
