using System;

namespace BuaStudentApi.Models
{
    public enum JobStatus
    {
        Pending,
        Processing,
        Completed,
        Failed
    }

    public class BackgroundJob
    {
        public string JobId { get; set; } = Guid.NewGuid().ToString();
        public string Type { get; set; } = string.Empty; // "photo", "bulk_import"
        public JobStatus Status { get; set; } = JobStatus.Pending;
        public int Progress { get; set; } = 0; // 0 - 100
        public object? Result { get; set; }
        public string? Error { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? CompletedAt { get; set; }
        public int? UserId { get; set; }
    }
}
