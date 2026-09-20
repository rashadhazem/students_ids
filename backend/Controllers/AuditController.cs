using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using BuaStudentApi.Data;

namespace BuaStudentApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "SuperAdmin,Admin,superadmin,admin")]
    public class AuditController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AuditController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetAuditLogs(
            [FromQuery] string? action,
            [FromQuery] string? search,
            [FromQuery] int? userId,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 25)
        {
            var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSuperAdmin = string.Equals(userRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var userCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;

            var query = _context.AuditLogs.Include(a => a.User).AsQueryable();

            if (!isSuperAdmin && !string.IsNullOrEmpty(userCollege))
            {
                var collegeStudentIds = _context.Students.Where(s => s.College == userCollege).Select(s => s.StudentId);
                query = query.Where(a =>
                    (a.User != null && a.User.College == userCollege) ||
                    (a.Target != null && collegeStudentIds.Contains(a.Target)) ||
                    (a.Detail != null && a.Detail.Contains(userCollege)));
            }

            if (!string.IsNullOrWhiteSpace(action))
            {
                query = query.Where(a => a.Action == action);
            }

            if (userId.HasValue)
            {
                query = query.Where(a => a.UserId == userId.Value);
            }

            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim().ToLower();
                query = query.Where(a =>
                    (a.Target != null && a.Target.ToLower().Contains(s)) ||
                    (a.Detail != null && a.Detail.ToLower().Contains(s)) ||
                    (a.Ip != null && a.Ip.Contains(s)) ||
                    (a.User != null && (a.User.Email.ToLower().Contains(s) || a.User.FullName.ToLower().Contains(s))));
            }

            if (fromDate.HasValue)
            {
                query = query.Where(a => a.CreatedAt >= fromDate.Value);
            }

            if (toDate.HasValue)
            {
                query = query.Where(a => a.CreatedAt <= toDate.Value);
            }

            var totalCount = await query.CountAsync();
            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 5, 100);

            var items = await query
                .OrderByDescending(a => a.CreatedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(a => new
                {
                    a.Id,
                    a.Action,
                    a.Target,
                    a.Detail,
                    a.Ip,
                    a.CreatedAt,
                    User = a.User == null ? null : new
                    {
                        a.User.Id,
                        username = a.User.Email,
                        a.User.FullName,
                        a.User.Role,
                        a.User.College
                    }
                })
                .ToListAsync();

            return Ok(new
            {
                success = true,
                totalCount,
                page,
                pageSize,
                totalPages = (int)Math.Ceiling(totalCount / (double)pageSize),
                data = items
            });
        }

        [HttpGet("actions")]
        public async Task<IActionResult> GetDistinctActions()
        {
            var userRole = User.FindFirst(ClaimTypes.Role)?.Value;
            var isSuperAdmin = string.Equals(userRole, "superadmin", StringComparison.OrdinalIgnoreCase);
            var userCollege = User.FindFirst("college")?.Value ?? User.FindFirst("College")?.Value;

            var query = _context.AuditLogs.AsQueryable();

            if (!isSuperAdmin && !string.IsNullOrEmpty(userCollege))
            {
                var collegeStudentIds = _context.Students.Where(s => s.College == userCollege).Select(s => s.StudentId);
                query = query.Where(a =>
                    (a.User != null && a.User.College == userCollege) ||
                    (a.Target != null && collegeStudentIds.Contains(a.Target)) ||
                    (a.Detail != null && a.Detail.Contains(userCollege)));
            }

            var actions = await query
                .Select(a => a.Action)
                .Distinct()
                .OrderBy(a => a)
                .ToListAsync();

            return Ok(new { success = true, data = actions });
        }
    }
}
