using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;

namespace BuaStudentApi.Services
{
    public interface IPhotoService
    {
        (bool IsValid, string Message) ValidateMagicBytes(byte[] data);
        byte[] ProcessPhoto(byte[] rawBytes, float zoom = 1.0f, int rotation = 0, bool flipH = false, float offsetX = 0.0f, float offsetY = 0.0f, bool autoCrop = true);
        Task<byte[]> ProcessPhotoAsync(byte[] rawBytes, float zoom = 1.0f, int rotation = 0, bool flipH = false, float offsetX = 0.0f, float offsetY = 0.0f, bool autoCrop = true, System.Threading.CancellationToken cancellationToken = default);
        Task<string> SavePhotoAsync(byte[] processedBytes, string studentId, string year, string college, string webRootPath);
        Task<string> EnsurePlaceholderAsync(string webRootPath);
        string SanitizeCollegeFolderName(string college);
    }

    public class PhotoService : IPhotoService
    {
        public const int TargetWidth = 400;
        public const int TargetHeight = 500;
        public const int JpegQuality = 88;

        // Throttles concurrent heavy AI Python processes to prevent memory exhaustion and CPU thrashing
        // under heavy bursts (e.g. 5000 concurrent students)
        private static readonly System.Threading.SemaphoreSlim _aiConcurrencyThrottle = new System.Threading.SemaphoreSlim(Math.Max(2, Environment.ProcessorCount * 2));

        public (bool IsValid, string Message) ValidateMagicBytes(byte[] data)
        {
            if (data == null || data.Length < 8)
                return (false, "الملف المرفوع فارغ أو تالف");

            // JPEG magic: FF D8 FF
            if (data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF)
                return (true, "image/jpeg");

            // PNG magic: 89 50 4E 47 0D 0A 1A 0A
            if (data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47)
                return (true, "image/png");

            return (false, "نوع الملف غير صالح. يُسمح فقط بملفات الصور الحقيقية (JPEG / PNG)");
        }

        public byte[] ProcessPhoto(byte[] rawBytes, float zoom = 1.0f, int rotation = 0, bool flipH = false, float offsetX = 0.0f, float offsetY = 0.0f, bool autoCrop = true)
        {
            return ProcessPhotoAsync(rawBytes, zoom, rotation, flipH, offsetX, offsetY, autoCrop).GetAwaiter().GetResult();
        }

        private static readonly System.Net.Http.HttpClient _aiCropperClient = new System.Net.Http.HttpClient
        {
            Timeout = TimeSpan.FromSeconds(4)
        };

        public async Task<byte[]> ProcessPhotoAsync(byte[] rawBytes, float zoom = 1.0f, int rotation = 0, bool flipH = false, float offsetX = 0.0f, float offsetY = 0.0f, bool autoCrop = true, System.Threading.CancellationToken cancellationToken = default)
        {
            // 1. Primary: High-Precision AI YuNet Microservice (resident in RAM, ~130ms, exact face & shoulders framing)
            try
            {
                var aiBytes = await TryCallAiCropperMicroserviceAsync(rawBytes, zoom, rotation, flipH, offsetX, offsetY, autoCrop, cancellationToken);
                if (aiBytes != null && aiBytes.Length > 100)
                {
                    return aiBytes;
                }
            }
            catch (InvalidOperationException)
            {
                // Strict validation error: rethrow immediately to prevent fallback crop
                throw;
            }

            // 2. Secondary fallback: Local Python CLI using YuNet
            try
            {
                var cliBytes = await TryCallAiCropperCliAsync(rawBytes, zoom, rotation, flipH, offsetX, offsetY, autoCrop, cancellationToken);
                if (cliBytes != null && cliBytes.Length > 100)
                {
                    return cliBytes;
                }
            }
            catch (InvalidOperationException)
            {
                // Strict validation error: rethrow immediately to prevent fallback crop
                throw;
            }

            // 3. Fallback using ImageSharp (< 20ms) only when AI service is offline
            return await Task.Run(() => ProcessImageWithImageSharp(rawBytes, zoom, rotation, flipH, offsetX, offsetY, autoCrop), cancellationToken);
        }

        private async Task<byte[]?> TryCallAiCropperMicroserviceAsync(byte[] rawBytes, float zoom, int rotation, bool flipH, float offsetX, float offsetY, bool autoCrop, System.Threading.CancellationToken cancellationToken)
        {
            try
            {
                using var req = new System.Net.Http.HttpRequestMessage(System.Net.Http.HttpMethod.Post, "http://127.0.0.1:5005/crop");
                req.Content = new System.Net.Http.ByteArrayContent(rawBytes);
                req.Headers.Add("X-Crop-Zoom", zoom.ToString(System.Globalization.CultureInfo.InvariantCulture));
                req.Headers.Add("X-Crop-Rotation", rotation.ToString());
                req.Headers.Add("X-Crop-FlipH", flipH ? "true" : "false");
                req.Headers.Add("X-Crop-OffsetX", offsetX.ToString(System.Globalization.CultureInfo.InvariantCulture));
                req.Headers.Add("X-Crop-OffsetY", offsetY.ToString(System.Globalization.CultureInfo.InvariantCulture));
                req.Headers.Add("X-Crop-AutoCrop", autoCrop ? "true" : "false");

                using var resp = await _aiCropperClient.SendAsync(req, cancellationToken);
                if (resp.IsSuccessStatusCode)
                {
                    return await resp.Content.ReadAsByteArrayAsync(cancellationToken);
                }

                if (resp.StatusCode == System.Net.HttpStatusCode.UnprocessableEntity ||
                    resp.StatusCode == System.Net.HttpStatusCode.BadRequest)
                {
                    var errorMsg = await resp.Content.ReadAsStringAsync(cancellationToken);
                    if (!string.IsNullOrWhiteSpace(errorMsg))
                    {
                        throw new InvalidOperationException(errorMsg.Trim());
                    }
                }
            }
            catch (InvalidOperationException)
            {
                throw;
            }
            catch
            {
                // Fallback to CLI or ImageSharp on offline connection or server crash
            }
            return null;
        }

        private async Task<byte[]?> TryCallAiCropperCliAsync(byte[] rawBytes, float zoom, int rotation, bool flipH, float offsetX, float offsetY, bool autoCrop, System.Threading.CancellationToken cancellationToken)
        {
            string? tempIn = null;
            string? tempOut = null;
            try
            {
                var candidatePaths = new[]
                {
                    Path.Combine(AppContext.BaseDirectory, "ai", "smart_cropper_cli.py"),
                    Path.Combine(Directory.GetCurrentDirectory(), "ai", "smart_cropper_cli.py"),
                    Path.Combine(Directory.GetCurrentDirectory(), "backend", "ai", "smart_cropper_cli.py")
                };

                var cliScript = candidatePaths.FirstOrDefault(System.IO.File.Exists);
                if (cliScript == null) return null;

                tempIn = Path.Combine(Path.GetTempPath(), $"bua_in_{Guid.NewGuid():N}.jpg");
                tempOut = Path.Combine(Path.GetTempPath(), $"bua_out_{Guid.NewGuid():N}.jpg");
                await System.IO.File.WriteAllBytesAsync(tempIn, rawBytes, cancellationToken);

                var zStr = zoom.ToString(System.Globalization.CultureInfo.InvariantCulture);
                var oxStr = offsetX.ToString(System.Globalization.CultureInfo.InvariantCulture);
                var oyStr = offsetY.ToString(System.Globalization.CultureInfo.InvariantCulture);
                var fhStr = flipH ? "true" : "false";
                var acStr = autoCrop ? "true" : "false";

                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "python",
                    Arguments = $"\"{cliScript}\" \"{tempIn}\" \"{tempOut}\" {zStr} {rotation} {fhStr} {oxStr} {oyStr} {acStr}",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                using var proc = System.Diagnostics.Process.Start(psi);
                if (proc != null)
                {
                    using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    cts.CancelAfter(TimeSpan.FromSeconds(5));
                    await proc.WaitForExitAsync(cts.Token);

                    if (proc.ExitCode == 2)
                    {
                        var stdErr = await proc.StandardError.ReadToEndAsync(cts.Token);
                        var cleanMsg = stdErr.Replace("VALIDATION_ERROR:", "").Trim();
                        throw new InvalidOperationException(string.IsNullOrWhiteSpace(cleanMsg) ? "فشل التحقق من الصورة" : cleanMsg);
                    }

                    if (proc.ExitCode == 0 && System.IO.File.Exists(tempOut))
                    {
                        return await System.IO.File.ReadAllBytesAsync(tempOut, cancellationToken);
                    }
                }
            }
            catch (InvalidOperationException)
            {
                throw;
            }
            catch
            {
                // Fallback to ImageSharp
            }
            finally
            {
                if (tempIn != null && System.IO.File.Exists(tempIn)) try { System.IO.File.Delete(tempIn); } catch { }
                if (tempOut != null && System.IO.File.Exists(tempOut)) try { System.IO.File.Delete(tempOut); } catch { }
            }
            return null;
        }

        private byte[] ProcessImageWithImageSharp(byte[] rawBytes, float zoom, int rotation, bool flipH, float offsetX, float offsetY, bool autoCrop)
        {
            using var image = Image.Load(rawBytes);

            image.Mutate(ctx =>
            {
                // 0. Auto-orient based on EXIF orientation metadata
                ctx.AutoOrient();

                // 1. Rotation
                if (rotation != 0)
                {
                    ctx.Rotate(rotation);
                }

                // 2. Horizontal Flip
                if (flipH)
                {
                    ctx.Flip(FlipMode.Horizontal);
                }

                // 3. Zoom & Pan / Head-Focused Crop
                zoom = Math.Clamp(zoom, 0.1f, 10.0f);
                int currentW = ctx.GetCurrentSize().Width;
                int currentH = ctx.GetCurrentSize().Height;

                if (autoCrop || zoom != 1.0f || offsetX != 0.0f || offsetY != 0.0f)
                {
                    // Target aspect ratio is 400:500 = 0.8 (Official ID card standard)
                    float targetAspect = (float)TargetWidth / TargetHeight;
                    float currentAspect = (float)currentW / currentH;

                    int cropW = currentW;
                    int cropH = currentH;

                    if (autoCrop)
                    {
                        // Close-up Biometric ID Framing (Face + Shoulders strictly):
                        // Eliminates chest, torso, waist, arms and wide backgrounds
                        if (currentAspect > targetAspect)
                        {
                            // Wide / Landscape photo: focus tightly on the upper 55% where the head & shoulders are
                            cropH = (int)(currentH * 0.55f / zoom);
                            cropW = (int)(cropH * targetAspect);
                            if (cropW > currentW)
                            {
                                cropW = currentW;
                                cropH = (int)(cropW / targetAspect);
                            }
                        }
                        else
                        {
                            // Portrait / Vertical photo: focus tightly on the upper 38% (face + collar/shoulders)
                            cropH = (int)(currentH * 0.38f / zoom);
                            cropW = (int)(cropH * targetAspect);
                            if (cropW > currentW)
                            {
                                cropW = currentW;
                                cropH = (int)(cropW / targetAspect);
                            }
                        }
                    }
                    else
                    {
                        // Manual cropper custom zoom
                        if (currentAspect > targetAspect)
                        {
                            cropW = (int)(currentH * targetAspect / zoom);
                            cropH = (int)(currentH / zoom);
                        }
                        else
                        {
                            cropW = (int)(currentW / zoom);
                            cropH = (int)(currentW / targetAspect / zoom);
                        }
                    }

                    cropW = Math.Clamp(cropW, 10, currentW);
                    cropH = Math.Clamp(cropH, 10, currentH);

                    // Vertical alignment: Eyes & Head at upper 30%, Shoulders resting at lower 25%
                    float defaultCenterYRatio = autoCrop ? (currentAspect > targetAspect ? 0.32f : 0.24f) : 0.50f;
                    int centerX = (int)(currentW * 0.50f + offsetX * currentW * 0.50f);
                    int centerY = (int)(currentH * defaultCenterYRatio + offsetY * currentH * 0.50f);

                    int startX = Math.Clamp(centerX - cropW / 2, 0, Math.Max(0, currentW - cropW));
                    int startY = Math.Clamp(centerY - cropH / 2, 0, Math.Max(0, currentH - cropH));

                    ctx.Crop(new Rectangle(startX, startY, cropW, cropH));
                }

                // 4. Resize to exact official ID card standard 400x500
                ctx.Resize(new ResizeOptions
                {
                    Size = new Size(TargetWidth, TargetHeight),
                    Mode = ResizeMode.Stretch
                });
            });

            using var ms = new MemoryStream();
            image.SaveAsJpeg(ms, new JpegEncoder { Quality = JpegQuality });
            return ms.ToArray();
        }

        private static string? FindFileUpwards(string fileName, int maxLevels = 5)
        {
            var current = new DirectoryInfo(AppContext.BaseDirectory);
            for (int i = 0; i < maxLevels && current != null; i++)
            {
                var candidate = Path.Combine(current.FullName, fileName);
                if (File.Exists(candidate)) return candidate;
                current = current.Parent;
            }

            current = new DirectoryInfo(Directory.GetCurrentDirectory());
            for (int i = 0; i < maxLevels && current != null; i++)
            {
                var candidate = Path.Combine(current.FullName, fileName);
                if (File.Exists(candidate)) return candidate;
                current = current.Parent;
            }
            return null;
        }

        private async Task<byte[]?> TryAiFaceCropAsync(byte[] rawBytes, float zoom, int rotation, bool flipH, float offsetX, float offsetY, bool autoCrop, System.Threading.CancellationToken cancellationToken = default)
        {
            // If under massive concurrent load (e.g. 5,000 students), only wait up to 2.5 seconds for an AI worker slot.
            // If all slots are busy, seamlessly fall back to the 15ms in-memory ImageSharp head cropper so the student NEVER gets a timeout error.
            bool acquired = false;
            try
            {
                acquired = await _aiConcurrencyThrottle.WaitAsync(TimeSpan.FromSeconds(2.5), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                return null;
            }

            if (!acquired)
            {
                // Fall back instantly to ImageSharp
                return null;
            }

            string? tempIn = null;
            string? tempOut = null;
            try
            {
                var pyCandidates = new[]
                {
                    @"D:\BUA\id site\dev\student_v2\venv\Scripts\python.exe",
                    FindFileUpwards(@"venv\Scripts\python.exe"),
                    Path.Combine(AppContext.BaseDirectory, @"..\..\..\..\venv\Scripts\python.exe"),
                    Path.Combine(AppContext.BaseDirectory, @"..\..\..\venv\Scripts\python.exe"),
                    @"python.exe",
                    @"python"
                };

                var scriptCandidates = new[]
                {
                    @"D:\BUA\id site\dev\student_v2\smart_cropper_cli.py",
                    FindFileUpwards("smart_cropper_cli.py"),
                    Path.Combine(AppContext.BaseDirectory, @"..\..\..\..\smart_cropper_cli.py"),
                    Path.Combine(AppContext.BaseDirectory, @"..\..\..\smart_cropper_cli.py"),
                    Path.Combine(Directory.GetCurrentDirectory(), "smart_cropper_cli.py")
                };

                string? pythonExe = pyCandidates.FirstOrDefault(p => !string.IsNullOrEmpty(p) && File.Exists(p)) ?? "python";
                string? scriptPath = scriptCandidates.FirstOrDefault(p => !string.IsNullOrEmpty(p) && File.Exists(p));

                if (string.IsNullOrEmpty(scriptPath))
                    return null;

                tempIn = Path.Combine(Path.GetTempPath(), $"bua_in_{Guid.NewGuid():N}.jpg");
                tempOut = Path.Combine(Path.GetTempPath(), $"bua_out_{Guid.NewGuid():N}.jpg");

                await File.WriteAllBytesAsync(tempIn, rawBytes, cancellationToken);

                var inv = System.Globalization.CultureInfo.InvariantCulture;
                var startInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = pythonExe,
                    Arguments = $"\"{scriptPath}\" \"{tempIn}\" \"{tempOut}\" {zoom.ToString("F2", inv)} {rotation} {(flipH ? "true" : "false")} {offsetX.ToString("F2", inv)} {offsetY.ToString("F2", inv)} {(autoCrop ? "true" : "false")}",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var process = new System.Diagnostics.Process { StartInfo = startInfo };
                if (process.Start())
                {
                    using var timeoutCts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(8));
                    using var linkedCts = System.Threading.CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

                    try
                    {
                        await process.WaitForExitAsync(linkedCts.Token);

                        if (process.ExitCode == 0 && File.Exists(tempOut))
                        {
                            var croppedBytes = await File.ReadAllBytesAsync(tempOut, cancellationToken);
                            if (croppedBytes.Length > 500)
                            {
                                return croppedBytes;
                            }
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        try { if (!process.HasExited) process.Kill(); } catch { }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[PhotoService] Face cropper warning: {ex.Message}");
            }
            finally
            {
                _aiConcurrencyThrottle.Release();
                try { if (tempIn != null && File.Exists(tempIn)) File.Delete(tempIn); } catch { }
                try { if (tempOut != null && File.Exists(tempOut)) File.Delete(tempOut); } catch { }
            }

            return null;
        }

        public async Task<string> SavePhotoAsync(byte[] processedBytes, string studentId, string year, string college, string webRootPath)
        {
            var cleanStudentId = Regex.Replace(studentId ?? "", @"[^a-zA-Z0-9_-]", "").Trim();
            if (string.IsNullOrEmpty(cleanStudentId))
            {
                cleanStudentId = Guid.NewGuid().ToString("N");
            }
            // Determine year folder (extract 4-digit year or clean year string)
            string cleanYear = "2026";
            if (!string.IsNullOrWhiteSpace(year))
            {
                var ym = Regex.Match(year, @"(20\d{2})");
                if (ym.Success)
                {
                    cleanYear = ym.Value;
                }
                else
                {
                    cleanYear = Regex.Replace(year.Trim(), @"[\s/\\:*?""<>|]+", "_");
                }
            }
            else if (cleanStudentId.Length >= 4 && int.TryParse(cleanStudentId[..4], out var y) && y >= 2018 && y <= DateTime.UtcNow.Year + 2)
            {
                cleanYear = y.ToString();
            }

            var collegeFolder = SanitizeCollegeFolderName(college);
            var relativeDir = Path.Combine("uploads", cleanYear, collegeFolder);
            var absoluteDir = Path.Combine(webRootPath, relativeDir);

            Directory.CreateDirectory(absoluteDir);

            var fileName = $"{cleanStudentId}.jpg";
            var absolutePath = Path.Combine(absoluteDir, fileName);

            await File.WriteAllBytesAsync(absolutePath, processedBytes);
            return Path.Combine(relativeDir, fileName).Replace('\\', '/');
        }

        public async Task<string> EnsurePlaceholderAsync(string webRootPath)
        {
            var relativePath = "uploads/placeholder.jpg";
            var absolutePath = Path.Combine(webRootPath, relativePath);
            var dir = Path.GetDirectoryName(absolutePath);
            if (!string.IsNullOrEmpty(dir))
            {
                Directory.CreateDirectory(dir);
            }

            if (!File.Exists(absolutePath))
            {
                using var image = new Image<SixLabors.ImageSharp.PixelFormats.Rgb24>(TargetWidth, TargetHeight);
                image.Mutate(ctx =>
                {
                    ctx.BackgroundColor(Color.FromRgb(26, 58, 107)); // BUA Dark Navy
                });
                await image.SaveAsJpegAsync(absolutePath, new JpegEncoder { Quality = JpegQuality });
            }

            return relativePath;
        }

        public string SanitizeCollegeFolderName(string college)
        {
            if (string.IsNullOrWhiteSpace(college))
                return "عام";

            var clean = Regex.Replace(college.Trim(), @"[\s/\\:*?""<>|]+", "_");
            return clean.Trim('_');
        }
    }
}
