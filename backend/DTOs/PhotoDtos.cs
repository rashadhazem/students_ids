using System.Collections.Generic;

namespace BuaStudentApi.DTOs
{
    public class PhotoCropPreviewDto
    {
        public bool Success { get; set; }
        public string? Preview { get; set; }
        public string? Message { get; set; }
    }

    public class PhotoUploadResponseDto
    {
        public bool Success { get; set; }
        public string? Message { get; set; }
        public string? ImagePath { get; set; }
        public string? ImageUrl { get; set; }
        public string? JobId { get; set; }
        public bool AsyncJob { get; set; }
    }

    public class BulkImportRowPreview
    {
        public string Sid { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string? Email { get; set; }
    }

    public class BulkImportResultDto
    {
        public int Created { get; set; } = 0;
        public int Skipped { get; set; } = 0;
        public List<string> Errors { get; set; } = new();
        public List<BulkImportRowPreview> Preview { get; set; } = new();
    }
}
