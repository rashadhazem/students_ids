using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BuaStudentApi.Models
{
    [Table("users")]
    public class User
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [MaxLength(150)]
        [Column("email")]
        public string Email { get; set; } = string.Empty;

        [NotMapped]
        public string Username { get => Email; set { if (string.IsNullOrEmpty(Email)) Email = value; } }

        [Required]
        [Column("password_hash")]
        public string PasswordHash { get; set; } = string.Empty;

        [Required]
        [MaxLength(150)]
        [Column("full_name")]
        public string FullName { get; set; } = string.Empty;

        [Required]
        [MaxLength(20)]
        [Column("role")]
        public string Role { get; set; } = "student"; // superadmin, admin, staff, student

        [MaxLength(100)]
        [Column("college")]
        public string? College { get; set; }

        [MaxLength(30)]
        [Column("student_id")]
        public string? StudentId { get; set; }

        [Column("is_active")]
        public bool IsActive { get; set; } = true;

        [Column("email_verified")]
        public bool EmailVerified { get; set; } = false;

        [MaxLength(100)]
        [Column("verify_token")]
        public string? VerifyToken { get; set; }

        [MaxLength(100)]
        [Column("reset_token")]
        public string? ResetToken { get; set; }

        [Column("reset_expires")]
        public DateTime? ResetExpires { get; set; }

        [Column("last_login")]
        public DateTime? LastLogin { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
