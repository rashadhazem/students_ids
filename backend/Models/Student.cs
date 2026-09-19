using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BuaStudentApi.Models
{
    [Table("students")]
    public class Student
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [MaxLength(30)]
        [Column("student_id")]
        public string StudentId { get; set; } = string.Empty;

        [Required]
        [MaxLength(150)]
        [Column("full_name")]
        public string FullName { get; set; } = string.Empty;

        [Required]
        [MaxLength(10)]
        [Column("year")]
        public string Year { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        [Column("college")]
        public string College { get; set; } = string.Empty;

        [MaxLength(100)]
        [Column("section")]
        public string? Section { get; set; }

        [MaxLength(30)]
        [Column("national_id")]
        public string? NationalId { get; set; }

        [MaxLength(30)]
        [Column("mobile")]
        public string? Mobile { get; set; }

        [MaxLength(150)]
        [Column("email")]
        public string? Email { get; set; }

        [Required]
        [MaxLength(255)]
        [Column("image_path")]
        public string ImagePath { get; set; } = string.Empty;

        [Column("user_id")]
        public int? UserId { get; set; }

        [ForeignKey("UserId")]
        public User? User { get; set; }

        [NotMapped]
        public string AcademicYear { get => Year; set => Year = value; }

        [Column("registered_by")]
        public int? RegisteredBy { get; set; }

        [ForeignKey("RegisteredBy")]
        public User? RegisteredByUser { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [Column("updated_at")]
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
