using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace BuaStudentApi.Middleware
{
    /// <summary>
    /// Enterprise-Grade Security Shield Middleware.
    /// 1. Method Guard – blocks TRACE, TRACK, CONNECT, DEBUG
    /// 2. Scanner / Bot Repellent – sqlmap, nikto, acunetix, etc.
    /// 3. Sensitive Probe Blocker – .env, .git, wp-login, phpmyadmin
    /// 4. Path Traversal / LFI Guard – ../, null bytes, encoded variants
    /// 5. SQLi / XSS Detection – URI query string + JSON request body
    /// 6. Brute Force Protection – 15 failures/10min → 15min IP block
    /// 7. Security Response Headers – CSP, HSTS, X-Frame-Options, etc.
    /// </summary>
    public class SecurityShieldMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<SecurityShieldMiddleware> _logger;

        // ── 1. Disallowed HTTP Methods ────────────────────────────────────────
        private static readonly HashSet<string> DisallowedMethods = new(StringComparer.OrdinalIgnoreCase)
        { "TRACE", "TRACK", "CONNECT", "DEBUG" };

        // ── 2. Malicious Scanner Signatures ──────────────────────────────────
        private static readonly Regex ScannerPattern = new(
            @"sqlmap|nikto|acunetix|nessus|havij|masscan|nmap|zgrab|gobuster|dirbuster|wpscan|burpcollaborator|arachni|netsparker|openvas|w3af|hydra|metasploit",
            RegexOptions.IgnoreCase | RegexOptions.Compiled);

        // ── 3. Sensitive Probe Targets ────────────────────────────────────────
        private static readonly Regex[] SensitiveProbePatterns =
        {
            new(@"(?:^|/)\.env(?:$|[/?#])", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"(?:^|/)\.git(?:$|[/?#])", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"(?:^|/)\.aws(?:$|[/?#])", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"(?:^|/)wp-(?:login|admin|config)\.php", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"(?:^|/)xmlrpc\.php", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"(?:^|/)eval-stdin\.php", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"(?:^|/)phpmyadmin", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"(?:^|/)web\.config", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"(?:^|/)id_rsa", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"(?:^|/)etc/passwd", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"(?:^|/)win\.ini", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"(?:^|/)shell\.php", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        };

        // ── 4. Path Traversal ─────────────────────────────────────────────────
        private static readonly Regex[] PathTraversalPatterns =
        {
            new(@"\.\.[/\\]", RegexOptions.Compiled),
            new(@"%2e%2e(?:%2f|%5c|[/\\])", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"%252e%252e", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"(?:\x00|%00)", RegexOptions.Compiled),
        };

        // ── 5. SQL Injection ──────────────────────────────────────────────────
        private static readonly Regex[] SqliPatterns =
        {
            new(@"\bUNION\b(?:\s+|/\*.*?\*/)+\bSELECT\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"\b(?:SLEEP|BENCHMARK|PG_SLEEP)\s*\(\s*\d+\s*\)", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"\bWAITFOR\s+DELAY\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"\bXP_CMDSHELL\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@";\s*(?:DROP|DELETE|TRUNCATE|ALTER)\s+(?:TABLE|DATABASE)\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"\binformation_schema\.(?:tables|columns|schemata)\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        };

        // ── 6. XSS ────────────────────────────────────────────────────────────
        private static readonly Regex[] XssPatterns =
        {
            new(@"<\s*script\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"javascript\s*:", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"vbscript\s*:", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"<\s*(?:iframe|embed|object)\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"<\s*svg\b[^>]*\bonload\s*=", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            new(@"data\s*:\s*text/html", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        };

        // ── 7. Brute Force State ──────────────────────────────────────────────
        private static readonly ConcurrentDictionary<string, BruteRecord> _bruteState = new();
        private const int MaxFailures = 15;
        private const int WindowSec = 600;    // 10 min sliding window
        private const int BlockSec = 900;     // 15 min block

        private static readonly HashSet<string> BruteProtectedPaths = new(StringComparer.OrdinalIgnoreCase)
        { "/api/auth/login" };

        private sealed class BruteRecord
        {
            public readonly Queue<long> Timestamps = new();
            public long BlockedUntil = 0;
            public readonly object Lck = new();
        }

        public SecurityShieldMiddleware(RequestDelegate next, ILogger<SecurityShieldMiddleware> logger)
        {
            _next = next;
            _logger = logger;
            // Periodic cleanup every 5 minutes
            _ = new Timer(_ => CleanupBruteState(), null, TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(5));
        }

        public async Task InvokeAsync(HttpContext ctx)
        {
            var ip = GetClientIp(ctx);
            var path = ctx.Request.Path.Value ?? string.Empty;
            var method = ctx.Request.Method;

            // 1. Method guard
            if (DisallowedMethods.Contains(method))
            {
                _logger.LogWarning("🚫 [SECURITY] Disallowed method {M} from {IP}", method, ip);
                ctx.Response.StatusCode = 405;
                return;
            }

            // 2. Scanner UA block
            var ua = ctx.Request.Headers.UserAgent.ToString();
            if (!string.IsNullOrEmpty(ua) && ScannerPattern.IsMatch(ua))
            {
                _logger.LogWarning("🚫 [SECURITY] Scanner UA '{UA}' from {IP}", ua[..Math.Min(60, ua.Length)], ip);
                ctx.Response.StatusCode = 403;
                await ctx.Response.WriteAsJsonAsync(new { error = "Access Denied" });
                return;
            }

            // 3. Sensitive path probe
            foreach (var probe in SensitiveProbePatterns)
            {
                if (probe.IsMatch(path))
                {
                    _logger.LogWarning("🚫 [SECURITY] Probe to '{P}' from {IP}", path, ip);
                    ctx.Response.StatusCode = 404;
                    return;
                }
            }

            // 4. Path traversal in URI
            var fullUri = path + ctx.Request.QueryString.Value;
            foreach (var pt in PathTraversalPatterns)
            {
                if (pt.IsMatch(fullUri))
                {
                    _logger.LogWarning("🚫 [SECURITY] Path traversal in '{U}' from {IP}", fullUri, ip);
                    ctx.Response.StatusCode = 400;
                    await ctx.Response.WriteAsJsonAsync(new { error = "طلب غير صالح: مسار غير مسموح به" });
                    return;
                }
            }

            // 5. Attack signatures in query string
            var qs = ctx.Request.QueryString.Value ?? string.Empty;
            if (!string.IsNullOrEmpty(qs))
            {
                var v = CheckAttackSig(qs);
                if (v != null)
                {
                    _logger.LogWarning("🚫 [SECURITY] {V} in query string from {IP}", v, ip);
                    ctx.Response.StatusCode = 400;
                    await ctx.Response.WriteAsJsonAsync(new { error = $"طلب غير صالح: {v}" });
                    return;
                }
            }

            // 6. Brute force check
            bool isAuthPost = BruteProtectedPaths.Contains(path) && method.Equals("POST", StringComparison.OrdinalIgnoreCase);
            if (isAuthPost && IsBlocked(ip))
            {
                _logger.LogWarning("🚫 [SECURITY] Brute force IP blocked: {IP}", ip);
                ctx.Response.StatusCode = 429;
                await ctx.Response.WriteAsJsonAsync(new
                {
                    success = false,
                    message = "تم تجميد الوصول مؤقتاً بسبب كثرة محاولات الدخول الفاشلة. يُرجى المحاولة مجدداً بعد 15 دقيقة."
                });
                return;
            }

            // 7. JSON body inspection (non-login endpoints only to avoid blocking valid password chars)
            if (!isAuthPost && ctx.Request.ContentLength > 0
                && ctx.Request.ContentType?.Contains("application/json", StringComparison.OrdinalIgnoreCase) == true)
            {
                ctx.Request.EnableBuffering();
                try
                {
                    using var reader = new StreamReader(ctx.Request.Body, Encoding.UTF8, leaveOpen: true);
                    var body = await reader.ReadToEndAsync();
                    ctx.Request.Body.Position = 0;

                    if (!string.IsNullOrEmpty(body) && body.Length < 100_000)
                    {
                        var v = CheckAttackSig(body);
                        if (v != null)
                        {
                            _logger.LogWarning("🚫 [SECURITY] {V} in request body from {IP}", v, ip);
                            ctx.Response.StatusCode = 400;
                            await ctx.Response.WriteAsJsonAsync(new { error = $"طلب غير صالح: {v}" });
                            return;
                        }
                    }
                }
                catch { /* ignore body read errors */ }
            }

            // 8. Security response headers
            ctx.Response.OnStarting(() =>
            {
                var h = ctx.Response.Headers;
                h.TryAdd("X-Frame-Options", "SAMEORIGIN");
                h.TryAdd("X-Content-Type-Options", "nosniff");
                h.TryAdd("X-XSS-Protection", "1; mode=block");
                h.TryAdd("Referrer-Policy", "strict-origin-when-cross-origin");
                h.TryAdd("Permissions-Policy", "geolocation=(), camera=(self), microphone=()");
                h.TryAdd("Content-Security-Policy",
                    "default-src 'self'; " +
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
                    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; " +
                    "font-src 'self' https://fonts.gstatic.com data:; " +
                    "img-src 'self' data: blob: https:; " +
                    "connect-src 'self' blob: ws: wss: http://localhost:* https:; " +
                    "frame-ancestors 'self';");
                if (ctx.Request.IsHttps)
                    h.TryAdd("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
                return Task.CompletedTask;
            });

            await _next(ctx);

            // 9. Post-request brute force recording
            if (isAuthPost)
            {
                var sc = ctx.Response.StatusCode;
                if (sc == 401 || sc == 403) RecordFailure(ip);
                else if (sc == 200) RecordSuccess(ip);
            }
        }

        // ── Private Helpers ───────────────────────────────────────────────────

        private static string GetClientIp(HttpContext ctx)
        {
            var fwd = ctx.Request.Headers["X-Forwarded-For"].ToString();
            if (!string.IsNullOrWhiteSpace(fwd))
                return fwd.Split(',')[0].Trim();
            return ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        }

        private static string? CheckAttackSig(string value)
        {
            foreach (var sqli in SqliPatterns)
                if (sqli.IsMatch(value)) return "SQL Injection signature detected";
            foreach (var xss in XssPatterns)
                if (xss.IsMatch(value)) return "XSS payload detected";
            foreach (var pt in PathTraversalPatterns)
                if (pt.IsMatch(value)) return "Path traversal attempt detected";
            return null;
        }

        private static bool IsBlocked(string ip)
        {
            if (!_bruteState.TryGetValue(ip, out var rec)) return false;
            lock (rec.Lck)
            {
                var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                if (rec.BlockedUntil > now) return true;
                // Slide window
                while (rec.Timestamps.Count > 0 && now - rec.Timestamps.Peek() > WindowSec)
                    rec.Timestamps.Dequeue();
                if (rec.Timestamps.Count >= MaxFailures)
                {
                    rec.BlockedUntil = now + BlockSec;
                    return true;
                }
                return false;
            }
        }

        private static void RecordFailure(string ip)
        {
            var rec = _bruteState.GetOrAdd(ip, _ => new BruteRecord());
            lock (rec.Lck)
            {
                var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                rec.Timestamps.Enqueue(now);
                if (rec.Timestamps.Count >= MaxFailures)
                    rec.BlockedUntil = now + BlockSec;
            }
        }

        private static void RecordSuccess(string ip)
        {
            _bruteState.TryRemove(ip, out _);
        }

        private static void CleanupBruteState()
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            foreach (var kv in _bruteState)
            {
                lock (kv.Value.Lck)
                {
                    if (kv.Value.BlockedUntil < now && kv.Value.Timestamps.Count == 0)
                        _bruteState.TryRemove(kv.Key, out _);
                }
            }
        }
    }
}

