using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BuaStudentApi.Models
{
    [Table("audit_log")]
    public class AuditLog
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Column("user_id")]
        public int? UserId { get; set; }

        [ForeignKey("UserId")]
        public User? User { get; set; }

        [Required]
        [MaxLength(50)]
        [Column("action")]
        public string Action { get; set; } = string.Empty;

        [MaxLength(100)]
        [Column("target")]
        public string? Target { get; set; }

        [Column("detail")]
        public string? Detail { get; set; }

        [MaxLength(50)]
        [Column("ip")]
        public string? Ip { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
