using Microsoft.EntityFrameworkCore;
using BuaStudentApi.Models;

namespace BuaStudentApi.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<User> Users => Set<User>();
        public DbSet<Student> Students => Set<Student>();
        public DbSet<StudentIdHistory> StudentIdHistories => Set<StudentIdHistory>();
        public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Users indexes & constraints
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasIndex(u => u.Email).IsUnique();
                entity.HasIndex(u => u.StudentId);
            });

            // Students indexes & constraints
            modelBuilder.Entity<Student>(entity =>
            {
                entity.HasIndex(s => s.StudentId).IsUnique();
                entity.HasIndex(s => s.NationalId);
                entity.HasIndex(s => s.College);
                entity.HasIndex(s => s.Year);
            });

            // StudentIdHistory indexes
            modelBuilder.Entity<StudentIdHistory>(entity =>
            {
                entity.HasIndex(h => h.OldStudentId);
                entity.HasIndex(h => h.NewStudentId);
            });

            // AuditLog indexes
            modelBuilder.Entity<AuditLog>(entity =>
            {
                entity.HasIndex(a => a.CreatedAt);
                entity.HasIndex(a => a.Target);
            });
        }
    }
}
