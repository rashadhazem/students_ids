using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using BuaStudentApi.Data;

namespace BuaStudentApi.Services
{
    public class PhotoProcessingWorkerService : BackgroundService
    {
        private readonly IPhotoProcessingQueue _queue;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IJobManagerService _jobManager;
        private readonly IDbWriteCoordinator _dbWriteCoordinator;
        private readonly IMemoryCache _memoryCache;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<PhotoProcessingWorkerService> _logger;

        // Number of concurrent parallel worker tasks (e.g. 4 - 8 workers)
        private readonly int _workerCount;

        public PhotoProcessingWorkerService(
            IPhotoProcessingQueue queue,
            IServiceScopeFactory scopeFactory,
            IJobManagerService jobManager,
            IDbWriteCoordinator dbWriteCoordinator,
            IMemoryCache memoryCache,
            IWebHostEnvironment env,
            ILogger<PhotoProcessingWorkerService> logger)
        {
            _queue = queue;
            _scopeFactory = scopeFactory;
            _jobManager = jobManager;
            _dbWriteCoordinator = dbWriteCoordinator;
            _memoryCache = memoryCache;
            _env = env;
            _logger = logger;

            // Determine optimal number of concurrent workers matching hardware threads
            _workerCount = Math.Clamp(Environment.ProcessorCount * 2, 4, 16);
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[PhotoQueueWorkerPool]: Starting {WorkerCount} concurrent worker threads for 5,000+ student capacity...", _workerCount);

            var workerTasks = new Task[_workerCount];
            for (int i = 0; i < _workerCount; i++)
            {
                int workerId = i + 1;
                workerTasks[i] = Task.Run(() => RunWorkerLoopAsync(workerId, stoppingToken), stoppingToken);
            }

            await Task.WhenAll(workerTasks);
        }

        private async Task RunWorkerLoopAsync(int workerId, CancellationToken stoppingToken)
        {
            _logger.LogInformation("[Worker #{WorkerId}]: Online and waiting for queued photo jobs.", workerId);

            try
            {
                await foreach (var item in _queue.ReadAllAsync(stoppingToken))
                {
                    _queue.IncrementActiveWorkers();
                    var sw = Stopwatch.StartNew();

                    try
                    {
                        await ProcessSingleItemAsync(item, workerId, stoppingToken);
                        sw.Stop();

                        item.CompletionSource.TrySetResult(new PhotoProcessResult
                        {
                            Success = true,
                            RelativePath = item.AcademicYear, // populated in method
                            ProcessedByWorkerId = workerId,
                            Duration = sw.Elapsed
                        });
                    }
                    catch (Exception ex)
                    {
                        sw.Stop();
                        _logger.LogError(ex, "[Worker #{WorkerId}]: Failed processing photo for student {StudentId}", workerId, item.StudentId);

                        await _jobManager.FailJobAsync(item.JobId, $"فشل في معالجة الصورة: {ex.Message}");

                        item.CompletionSource.TrySetResult(new PhotoProcessResult
                        {
                            Success = false,
                            Error = ex.Message,
                            ProcessedByWorkerId = workerId,
                            Duration = sw.Elapsed
                        });
                    }
                    finally
                    {
                        _queue.DecrementActiveWorkers();
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Graceful shutdown
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Worker #{WorkerId}]: Worker loop terminated unexpectedly.", workerId);
            }

            _logger.LogInformation("[Worker #{WorkerId}]: Stopped.", workerId);
        }

        private async Task ProcessSingleItemAsync(PhotoWorkItem item, int workerId, CancellationToken stoppingToken)
        {
            await _jobManager.UpdateProgressAsync(item.JobId, 25, $"العامل #{workerId}: جاري قص الوجه ومحاذاة الأبعاد بالذكاء الاصطناعي...");

            using var scope = _scopeFactory.CreateScope();
            var photoService = scope.ServiceProvider.GetRequiredService<IPhotoService>();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            // 1. Process image bytes using YuNet Deep Learning ONNX face detection + ImageSharp
            var processedBytes = await photoService.ProcessPhotoAsync(
                item.RawBytes,
                item.Zoom,
                item.Rotation,
                item.FlipH,
                item.OffsetX,
                item.OffsetY,
                item.AutoCrop,
                stoppingToken);

            await _jobManager.UpdateProgressAsync(item.JobId, 65, $"العامل #{workerId}: جاري حفظ الصورة الرسمية على السيرفر...");

            // 2. Save image to disk
            var webRoot = _env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
            var relativePath = await photoService.SavePhotoAsync(
                processedBytes,
                item.StudentId,
                item.AcademicYear,
                item.College ?? "عام",
                webRoot);

            item.AcademicYear = relativePath; // Carry relative path

            await _jobManager.UpdateProgressAsync(item.JobId, 85, $"العامل #{workerId}: جاري التحديث في قاعدة البيانات...");

            // 3. Serialize SQLite write safely via DbWriteCoordinator
            await _dbWriteCoordinator.ExecuteWriteAsync(async () =>
            {
                var student = await db.Students.FirstOrDefaultAsync(s => s.StudentId == item.StudentId, stoppingToken);
                if (student != null)
                {
                    student.ImagePath = relativePath;
                    student.UpdatedAt = DateTime.UtcNow;
                    await db.SaveChangesAsync(stoppingToken);
                }
            }, stoppingToken);

            // 4. Invalidate memory cache so next read returns updated photo
            _memoryCache.Remove($"card_{item.StudentId}");

            // 5. Complete job notification
            var fullUrl = $"/{relativePath}?t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
            await _jobManager.CompleteJobAsync(item.JobId, new
            {
                studentId = item.StudentId,
                imagePath = relativePath,
                url = fullUrl,
                new_url = fullUrl,
                workerId,
                message = "تم اعتماد وقص وحفظ صورتك بنجاح ✓"
            });
        }
    }
}
