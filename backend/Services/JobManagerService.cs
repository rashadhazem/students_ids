using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using BuaStudentApi.Hubs;
using BuaStudentApi.Models;

namespace BuaStudentApi.Services
{
    public interface IJobManagerService
    {
        BackgroundJob CreateJob(string type, int? userId = null);
        BackgroundJob? GetJob(string jobId);
        Task UpdateProgressAsync(string jobId, int progress, string? message = null, object? data = null);
        Task CompleteJobAsync(string jobId, object result);
        Task FailJobAsync(string jobId, string error);
    }

    public class JobManagerService : IJobManagerService
    {
        private readonly ConcurrentDictionary<string, BackgroundJob> _jobs = new();
        private readonly IHubContext<JobProgressHub> _hubContext;

        public JobManagerService(IHubContext<JobProgressHub> hubContext)
        {
            _hubContext = hubContext;
        }

        public BackgroundJob CreateJob(string type, int? userId = null)
        {
            var job = new BackgroundJob
            {
                JobId = Guid.NewGuid().ToString("N"),
                Type = type,
                Status = JobStatus.Pending,
                Progress = 0,
                UserId = userId,
                CreatedAt = DateTime.UtcNow
            };
            _jobs[job.JobId] = job;
            return job;
        }

        public BackgroundJob? GetJob(string jobId)
        {
            _jobs.TryGetValue(jobId, out var job);
            return job;
        }

        public async Task UpdateProgressAsync(string jobId, int progress, string? message = null, object? data = null)
        {
            if (_jobs.TryGetValue(jobId, out var job))
            {
                job.Status = JobStatus.Processing;
                job.Progress = Math.Clamp(progress, 0, 100);

                await _hubContext.Clients.Group($"job_{jobId}").SendAsync("ProgressUpdated", new
                {
                    jobId,
                    progress = job.Progress,
                    status = job.Status.ToString(),
                    message,
                    data
                });
            }
        }

        public async Task CompleteJobAsync(string jobId, object result)
        {
            if (_jobs.TryGetValue(jobId, out var job))
            {
                job.Status = JobStatus.Completed;
                job.Progress = 100;
                job.Result = result;
                job.CompletedAt = DateTime.UtcNow;

                await _hubContext.Clients.Group($"job_{jobId}").SendAsync("JobCompleted", new
                {
                    jobId,
                    status = "Completed",
                    progress = 100,
                    result
                });
            }
        }

        public async Task FailJobAsync(string jobId, string error)
        {
            if (_jobs.TryGetValue(jobId, out var job))
            {
                job.Status = JobStatus.Failed;
                job.Error = error;
                job.CompletedAt = DateTime.UtcNow;

                await _hubContext.Clients.Group($"job_{jobId}").SendAsync("JobFailed", new
                {
                    jobId,
                    status = "Failed",
                    error
                });
            }
        }
    }
}
