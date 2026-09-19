using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using ClosedXML.Excel;
using ExcelDataReader;

namespace BuaStudentApi.Services
{
    public class ParsedStudentRow
    {
        public string StudentId { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Year { get; set; } = string.Empty;
        public string College { get; set; } = string.Empty;
        public string? Section { get; set; }
        public string? Email { get; set; }
        public string? NationalId { get; set; }
        public string? Mobile { get; set; }
        public int RowNumber { get; set; }
    }

    public interface IExcelImportService
    {
        List<ParsedStudentRow> ParseFile(Stream stream, string fileName, string? userCollege = null, string? userRole = null);
        string MatchCollegeName(string rawName, string? rawSection = null, string? userRole = null, string? userCollege = null);
        string ExtractAcademicYear(string rawYear, string studentId, string defaultYear);
    }

    public class ExcelImportService : IExcelImportService
    {
        public static readonly string[] Colleges = new[]
        {
            "كلية طب الأسنان",
            "كلية الصيدلة فارما D",
            "كلية صيدلة اكلينيكية",
            "كلية العلاج الطبيعي",
            "كلية الطب البيطري",
            "كلية تكنلوجيا علوم حيوية",
            "كلية العلوم الصحية التطبيقية",
            "كلية التمريض",
            "كلية  ذكاء اصطناعي وعلوم البيانات",
            "كلية بزنس وإدارة الأعمال",
            "كلية لغات وترجمة",
            "كلية الحقوق",
            "كلية الفنون الجميلة",
            "كلية الفنون التطبيقية"
        };

        private static readonly Dictionary<string, string[]> ColMap = new(StringComparer.OrdinalIgnoreCase)
        {
            ["student_id"] = new[]
            {
                "student code", "student_code", "studentcode", "كود الطالب", "كود_الطالب", "كود", "code",
                "student_id", "studentid", "student id", "id", "الرقم الجامعي", "الرقم_الجامعي",
                "رقم الطالب", "رقم_الطالب", "academic_id", "university_id", "رقم الجلوس", "رقم القيد"
            },
            ["full_name"] = new[]
            {
                "student name (ar)", "student name ar", "student_name_ar", "student name", "student_name",
                "اسم الطالب", "اسم_الطالب", "الاسم", "full_name", "fullname", "full name", "name",
                "الاسم بالكامل", "الاسم_بالكامل", "الاسم الكامل", "الاسم_الكامل", "الاسم رباعي", "اسم"
            },
            ["national_id"] = new[]
            {
                "national id", "national_id", "nationalid", "nid",
                "الرقم القومي", "الرقم_القومي", "القومي", "رقم قومي", "بطاقة الرقم القومي"
            },
            ["mobile"] = new[]
            {
                "student mobile", "student_mobile", "studentmobile", "mobile", "phone", "student phone",
                "رقم الموبايل", "رقم_الموبايل", "الموبايل", "رقم الهاتف", "رقم_الهاتف", "الهاتف", "موبايل", "هاتف", "تليفون"
            },
            ["year"] = new[]
            {
                "year", "السنة", "العام", "سنة", "عام",
                "الفرقة", "الفرقة الدراسية", "الفرقة_الدراسية", "فرقة",
                "المستوى", "المستوى الدراسي", "المستوى_الدراسي", "مستوى",
                "السنة الدراسية", "العام الدراسي", "academic_year", "level", "grade", "study_year"
            },
            ["college"] = new[]
            {
                "faculty name", "faculty_name", "faculty", "college", "الكلية", "كلية", "school"
            },
            ["section"] = new[]
            {
                "section name", "section_name", "section", "القسم", "الشعبة", "التخصص", "البرنامج", "department", "dept", "program"
            },
            ["email"] = new[]
            {
                "الايميل", "الإيميل", "البريد الالكتروني", "البريد الالكترونى",
                "البريد الإلكتروني", "البريد الإلكترونى", "البريد", "ايميل", "إيميل",
                "email", "e-mail", "mail", "email address",
                "بريد الطالب", "ايميل الطالب", "إيميل الطالب", "البريد الجامعي", "الايميل الجامعي"
            }
        };

        static ExcelImportService()
        {
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        }

        public List<ParsedStudentRow> ParseFile(Stream stream, string fileName, string? userCollege = null, string? userRole = null)
        {
            var ext = Path.GetExtension(fileName).ToLowerInvariant();
            List<List<string>> rawRows = new();

            if (ext == ".csv")
            {
                using var reader = new StreamReader(stream, Encoding.UTF8, true);
                string? line;
                while ((line = reader.ReadLine()) != null)
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    var cols = line.Split(',').Select(c => CleanExcelVal(c.Trim('\"', ' '))).ToList();
                    rawRows.Add(cols);
                }
            }
            else if (ext == ".xls")
            {
                using var reader = ExcelReaderFactory.CreateReader(stream);
                var result = reader.AsDataSet();
                if (result.Tables.Count > 0)
                {
                    var table = result.Tables[0];
                    foreach (DataRow r in table.Rows)
                    {
                        var cols = r.ItemArray.Select(CleanExcelVal).ToList();
                        rawRows.Add(cols);
                    }
                }
            }
            else // .xlsx
            {
                using var workbook = new XLWorkbook(stream);
                var worksheet = workbook.Worksheets.FirstOrDefault() ?? workbook.Worksheets.Add("Sheet1");
                int lastCol = worksheet.LastCellUsed()?.Address.ColumnNumber ?? 1;
                foreach (var row in worksheet.RowsUsed())
                {
                    var cols = new List<string>();
                    for (int c = 1; c <= lastCol; c++)
                    {
                        cols.Add(CleanExcelVal(row.Cell(c).GetString()));
                    }
                    rawRows.Add(cols);
                }
            }

            if (rawRows.Count == 0) return new List<ParsedStudentRow>();

            // Detect header among first 10 rows
            var allKeywords = new HashSet<string>(ColMap.Values.SelectMany(a => a).Select(NormalizeHeader));
            int bestHeaderIdx = 0;
            int maxMatches = 0;

            for (int i = 0; i < Math.Min(10, rawRows.Count); i++)
            {
                int matches = 0;
                foreach (var cell in rawRows[i])
                {
                    var norm = NormalizeHeader(cell);
                    if (!string.IsNullOrEmpty(norm) && allKeywords.Any(k => k == norm || k.Contains(norm) || norm.Contains(k)))
                    {
                        matches++;
                    }
                }
                if (matches > maxMatches)
                {
                    maxMatches = matches;
                    bestHeaderIdx = i;
                }
            }

            // Detect academic year from pre-header metadata rows (e.g. "Acadmic Year: 2026/2027")
            string preHeaderYear = "";
            for (int r = 0; r < bestHeaderIdx; r++)
            {
                foreach (var cell in rawRows[r])
                {
                    var m = Regex.Match(cell, @"(20\d{2}\s*[/ -]\s*20\d{2})");
                    if (m.Success)
                    {
                        preHeaderYear = m.Value.Replace(" ", "");
                        break;
                    }
                }
                if (!string.IsNullOrEmpty(preHeaderYear)) break;
            }

            var headers = rawRows[bestHeaderIdx].Select(h => h.Trim()).ToList();
            var parsed = new List<ParsedStudentRow>();
            string currentYearStr = !string.IsNullOrEmpty(preHeaderYear) ? preHeaderYear : DateTime.UtcNow.Year.ToString();

            for (int i = bestHeaderIdx + 1; i < rawRows.Count; i++)
            {
                var rowData = rawRows[i];
                if (!rowData.Any(c => !string.IsNullOrWhiteSpace(c))) continue;

                var rowDict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                for (int c = 0; c < headers.Count && c < rowData.Count; c++)
                {
                    if (!string.IsNullOrEmpty(headers[c]))
                    {
                        rowDict[headers[c]] = rowData[c];
                    }
                }

                var sid = ToEng(FindColumn(rowDict, ColMap["student_id"]));
                var name = FindColumn(rowDict, ColMap["full_name"]);
                var rawYear = FindColumn(rowDict, ColMap["year"]);
                var rawColl = FindColumn(rowDict, ColMap["college"]);
                var rawSection = FindColumn(rowDict, ColMap["section"]);
                var nationalId = ToEng(FindColumn(rowDict, ColMap["national_id"]));
                var mobile = ToEng(FindColumn(rowDict, ColMap["mobile"]));
                var email = ExtractEmail(rowDict);

                if (string.IsNullOrWhiteSpace(sid) || string.IsNullOrWhiteSpace(name))
                    continue;

                // Normalize mobile to standard 11-digit Egyptian format (e.g. 1014194361 -> 01014194361)
                if (!string.IsNullOrWhiteSpace(mobile))
                {
                    mobile = mobile.Trim();
                    if (mobile.Length == 10 && (mobile.StartsWith("10") || mobile.StartsWith("11") || mobile.StartsWith("12") || mobile.StartsWith("15")))
                    {
                        mobile = "0" + mobile;
                    }
                }

                // If email is empty, default to official university email format
                if (string.IsNullOrWhiteSpace(email))
                {
                    email = $"{sid}@bua.edu.eg";
                }

                var finalYear = ExtractAcademicYear(rawYear, sid, currentYearStr);
                var finalCollege = MatchCollegeName(rawColl, rawSection, userRole, userCollege);

                parsed.Add(new ParsedStudentRow
                {
                    StudentId = sid,
                    FullName = name,
                    Year = finalYear,
                    College = finalCollege,
                    Section = string.IsNullOrWhiteSpace(rawSection) ? null : rawSection.Trim(),
                    Email = email.ToLowerInvariant(),
                    NationalId = string.IsNullOrWhiteSpace(nationalId) ? null : nationalId.Trim(),
                    Mobile = string.IsNullOrWhiteSpace(mobile) ? null : mobile.Trim(),
                    RowNumber = i + 1
                });
            }

            return parsed;
        }

        private static string CleanExcelVal(object? v)
        {
            if (v == null) return string.Empty;
            var s = v.ToString()?.Trim() ?? string.Empty;
            if (s.EndsWith(".0") && s[..^2].All(char.IsDigit))
            {
                s = s[..^2];
            }
            return ToEng(s);
        }

        public static string ToEng(string? s)
        {
            if (string.IsNullOrEmpty(s)) return string.Empty;
            const string arabicNums = "٠١٢٣٤٥٦٧٨٩";
            const string englishNums = "0123456789";
            var sb = new StringBuilder(s.Length);
            foreach (var ch in s)
            {
                var idx = arabicNums.IndexOf(ch);
                sb.Append(idx >= 0 ? englishNums[idx] : ch);
            }
            return sb.ToString();
        }

        public static string NormalizeHeader(string? s)
        {
            if (string.IsNullOrWhiteSpace(s)) return string.Empty;
            var text = s.Trim().ToLowerInvariant().Replace('_', ' ');
            text = Regex.Replace(text, "[إأآا]", "ا");
            text = Regex.Replace(text, "[ىي]", "ي");
            text = text.Replace('ة', 'ه');
            text = Regex.Replace(text, "[\u064B-\u065F\u0670]", "");
            return Regex.Replace(text, @"\s+", " ").Trim();
        }

        private static string FindColumn(Dictionary<string, string> row, string[] aliases)
        {
            foreach (var a in aliases)
            {
                if (row.TryGetValue(a, out var val) && !string.IsNullOrWhiteSpace(val))
                    return val.Trim();
            }

            var normAliases = aliases.Select(NormalizeHeader).ToArray();
            foreach (var (k, v) in row)
            {
                var normK = NormalizeHeader(k);
                if (string.IsNullOrEmpty(normK)) continue;
                if (normAliases.Any(a => a == normK || a.Contains(normK) || normK.Contains(a)))
                {
                    if (!string.IsNullOrWhiteSpace(v)) return v.Trim();
                }
            }
            return string.Empty;
        }

        private static string ExtractEmail(Dictionary<string, string> row)
        {
            var direct = FindColumn(row, ColMap["email"]);
            if (!string.IsNullOrWhiteSpace(direct) && direct.Contains('@'))
                return direct.Trim();

            foreach (var (k, v) in row)
            {
                var normK = NormalizeHeader(k);
                if (normK.Contains("يميل") || normK.Contains("بريد") || normK.Contains("mail"))
                {
                    var val = CleanExcelVal(v).Trim();
                    if (!string.IsNullOrEmpty(val)) return val;
                }
            }

            foreach (var (_, v) in row)
            {
                var val = CleanExcelVal(v).Trim();
                if (val.Contains('@') && val.Contains('.') && !val.Contains(' ') && val.Length > 5)
                    return val;
                if (val.Contains(".bua.edu.eg") && !val.Contains('@'))
                    return val.Replace(".bua.edu.eg", "@bua.edu.eg");
            }

            return string.Empty;
        }

        public string ExtractAcademicYear(string rawYear, string studentId, string defaultYear)
        {
            if (!string.IsNullOrWhiteSpace(rawYear))
            {
                var m = Regex.Match(rawYear, @"(20\d{2})");
                if (m.Success) return m.Groups[1].Value;
            }
            if (!string.IsNullOrWhiteSpace(studentId) && studentId.Length >= 4)
            {
                var prefix = studentId[..4];
                if (int.TryParse(prefix, out var yr) && yr >= 2018 && yr <= DateTime.UtcNow.Year + 1)
                    return prefix;
            }
            return defaultYear;
        }

        public string MatchCollegeName(string rawName, string? rawSection = null, string? userRole = null, string? userCollege = null)
        {
            if (userRole == "admin" && !string.IsNullOrEmpty(userCollege))
                return userCollege;

            if (string.IsNullOrWhiteSpace(rawName))
                return Colleges[0];

            var normRaw = NormalizeHeader(rawName);
            var normSec = NormalizeHeader(rawSection);

            // Pharmacy: distinguish PharmD vs PharmD Clinical via section or college
            if (normRaw.Contains("pharm") || normRaw.Contains("صيدل"))
            {
                if (normSec.Contains("clinic") || normSec.Contains("اكلينيك") || normSec.Contains("إكلينيك") || normRaw.Contains("clinic") || normRaw.Contains("اكلينيك") || normRaw.Contains("إكلينيك"))
                    return "كلية صيدلة اكلينيكية";
                return "كلية الصيدلة فارما D";
            }

            // Health Sciences vs Applied Arts vs Fine Arts
            if (normRaw.Contains("health") || normRaw.Contains("صحي")) return "كلية العلوم الصحية التطبيقية";
            if (normRaw.Contains("applied arts") || normRaw.Contains("فنون تطبيقية")) return "كلية الفنون التطبيقية";
            if (normRaw.Contains("fine arts") || normRaw.Contains("فنون جميلة") || (normRaw.Contains("فنون") && !normRaw.Contains("تطبيق"))) return "كلية الفنون الجميلة";
            if (normRaw.Contains("اسنان") || normRaw.Contains("أسنان") || normRaw.Contains("dent") || normRaw.Contains("oral")) return "كلية طب الأسنان";
            if (normRaw.Contains("علاج") || normRaw.Contains("طبيعي") || normRaw.Contains("physio") || normRaw.Contains("physical")) return "كلية العلاج الطبيعي";
            if (normRaw.Contains("بيطر") || normRaw.Contains("vet")) return "كلية الطب البيطري";
            if (normRaw.Contains("حيو") || normRaw.Contains("bio")) return "كلية تكنلوجيا علوم حيوية";
            if (normRaw.Contains("تمريض") || normRaw.Contains("nurs")) return "كلية التمريض";
            if (normRaw.Contains("ذكاء") || normRaw.Contains("بيانات") || normRaw.Contains("حاسب") || normRaw.Contains("ai") || normRaw.Contains("data") || normRaw.Contains("artificial")) return "كلية  ذكاء اصطناعي وعلوم البيانات";
            if (normRaw.Contains("بزنس") || normRaw.Contains("اداره") || normRaw.Contains("إدارة") || normRaw.Contains("تجاره") || normRaw.Contains("business") || normRaw.Contains("financial") || normRaw.Contains("economic")) return "كلية بزنس وإدارة الأعمال";
            if (normRaw.Contains("لغات") || normRaw.Contains("ترجم") || normRaw.Contains("ترجمة") || normRaw.Contains("lang") || normRaw.Contains("translation")) return "كلية لغات وترجمة";
            if (normRaw.Contains("حقوق") || normRaw.Contains("قانون") || normRaw.Contains("law")) return "كلية الحقوق";

            foreach (var col in Colleges)
            {
                var normCol = NormalizeHeader(col);
                if (normCol == normRaw || normRaw.Contains(normCol) || normCol.Contains(normRaw))
                    return col;
            }

            return rawName.Trim();
        }
    }
}
