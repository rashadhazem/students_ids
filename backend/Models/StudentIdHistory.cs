using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BuaStudentApi.Models
{
    [Table("student_id_history")]
    public class StudentIdHistory
    {
        [Key]
        [Column("id")]
        public int Id { get; set; }

        [Required]
        [MaxLength(30)]
        [Column("old_student_id")]
        public string OldStudentId { get; set; } = string.Empty;

        [Required]
        [MaxLength(30)]
        [Column("new_student_id")]
        public string NewStudentId { get; set; } = string.Empty;

        [Column("changed_at")]
        public DateTime ChangedAt { get; set; } = DateTime.UtcNow;

        [Column("changed_by")]
        public int? ChangedBy { get; set; }

        [ForeignKey("ChangedBy")]
        public User? ChangedByUser { get; set; }
    }
}
