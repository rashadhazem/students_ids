using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace BuaStudentApi.DTOs
{
    public class StudentDto
    {
        public int Id { get; set; }
        public string StudentId { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Year { get; set; } = string.Empty;
        public string College { get; set; } = string.Empty;
        public string? Section { get; set; }
        public string? Email { get; set; }
        public string? NationalId { get; set; }
        public string? Mobile { get; set; }
        public string ImagePath { get; set; } = string.Empty;
        public string? ImageUrl { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    public class StudentListResponseDto
    {
        public bool Success { get; set; } = true;
        public List<StudentDto> Students { get; set; } = new();
        public List<StudentDto> Data => Students;
        public int Total { get; set; }
        public int TotalCount => Total;
        public int Page { get; set; }
        public int Pages { get; set; }
        public int TotalPages => Pages;
    }

    public class StudentCreateDto
    {
        [Required(ErrorMessage = "يرجى إدخال اسم الطالب الكامل")]
        public string FullName { get; set; } = string.Empty;

        public string Year { get; set; } = "2024-2025";

        public string? Code { get; set; }

        public string? StudentId { get; set; }

        [Required(ErrorMessage = "يرجى اختيار الكلية")]
        public string College { get; set; } = string.Empty;

        public string? Section { get; set; }

        public string? NationalId { get; set; }

        public string? Mobile { get; set; }

        public string? Email { get; set; }

        public float Zoom { get; set; } = 1.0f;
        public int Rotation { get; set; } = 0;
        public bool FlipH { get; set; } = false;
        public float OffsetX { get; set; } = 0.0f;
        public float OffsetY { get; set; } = 0.0f;
        public bool AutoCrop { get; set; } = true;
    }

    public class StudentEditDto
    {
        [Required(ErrorMessage = "يرجى إدخال اسم الطالب الكامل")]
        public string FullName { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى إدخال الرقم الجامعي")]
        public string StudentId { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى تحديد سنة القيد")]
        public string Year { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى اختيار الكلية")]
        public string College { get; set; } = string.Empty;

        public string? Section { get; set; }

        public string? NationalId { get; set; }

        public string? Mobile { get; set; }

        [Required(ErrorMessage = "يرجى إدخال البريد الإلكتروني")]
        [EmailAddress(ErrorMessage = "صيغة البريد الإلكتروني غير صحيحة")]
        public string Email { get; set; } = string.Empty;
    }
}
