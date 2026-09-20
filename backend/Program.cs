using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.RateLimiting;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using BuaStudentApi.Data;
using BuaStudentApi.Hubs;
using BuaStudentApi.Middleware;
using BuaStudentApi.Models;
using BuaStudentApi.Services;

// High Concurrency ThreadPool Tuning for 5,000+ Simultaneous Students
System.Threading.ThreadPool.SetMinThreads(Math.Max(350, Environment.ProcessorCount * 50), Math.Max(350, Environment.ProcessorCount * 50));

var builder = WebApplication.CreateBuilder(args);

// Configure Kestrel High-Throughput & Non-Blocking Uploads
builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.Limits.MaxConcurrentConnections = 15000;
    serverOptions.Limits.MaxConcurrentUpgradedConnections = 15000;
    serverOptions.Limits.MaxRequestBodySize = 25 * 1024 * 1024; // 25MB max upload
    serverOptions.Limits.MinRequestBodyDataRate = null; // Prevent timeouts during heavy concurrent photo uploads
});

// 1. Database Configuration — Use DbContext Pooling for 5,000+ concurrent requests
var dbProvider = builder.Configuration["DatabaseProvider"] ?? "Sqlite";
var connectionString = builder.Configuration.GetConnectionString(
    dbProvider.Equals("Postgres", StringComparison.OrdinalIgnoreCase) ? "PostgresConnection" : "DefaultConnection");

// DbContext pooling reuses context instances instead of creating new ones per request
// Pool size = 1024 means up to 1024 contexts can be reused simultaneously without allocations
builder.Services.AddDbContextPool<AppDbContext>(options =>
{
    if (dbProvider.Equals("Postgres", StringComparison.OrdinalIgnoreCase))
    {
        options.UseNpgsql(connectionString);
    }
    else
    {
        options.UseSqlite(connectionString,
            sqliteOpts => sqliteOpts.CommandTimeout(30));
    }
}, poolSize: 256);

// 2. High-Performance Caching & Concurrency Components
builder.Services.AddMemoryCache(opts =>
{
    opts.SizeLimit = 50_000;               // Max 50k cached student card entries
    opts.CompactionPercentage = 0.20;      // Evict 20% when limit reached
    opts.ExpirationScanFrequency = TimeSpan.FromMinutes(2);
});
builder.Services.AddSingleton<IDbWriteCoordinator, DbWriteCoordinator>();
builder.Services.AddSingleton<IPhotoProcessingQueue, PhotoProcessingQueue>();
builder.Services.AddHostedService<PhotoProcessingWorkerService>();

// 2b. Response Compression — reduces bandwidth 60-80% for API JSON responses
builder.Services.AddResponseCompression(opts =>
{
    opts.EnableForHttps = true;
    opts.Providers.Add<BrotliCompressionProvider>();
    opts.Providers.Add<GzipCompressionProvider>();
    opts.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat([
        "application/json",
        "image/svg+xml",
        "text/plain"
    ]);
});
builder.Services.Configure<BrotliCompressionProviderOptions>(opts => opts.Level = System.IO.Compression.CompressionLevel.Fastest);
builder.Services.Configure<GzipCompressionProviderOptions>(opts => opts.Level = System.IO.Compression.CompressionLevel.Fastest);

// 2c. Rate Limiter — Enterprise concurrency protection for 5,000+ students
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsync(
            "{\"success\":false,\"message\":\"الخادم مشغول حالياً بسبب الضغط الكثيف. يرجى الانتظار لحظة والمحاولة مجدداً.\"}",
            token);
    };

    // Policy 1: Global concurrency limiter — max 6,000 concurrent requests total
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetConcurrencyLimiter("global", _ => new ConcurrencyLimiterOptions
        {
            PermitLimit = 6000,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 2000   // Allow 2000 more to queue instead of rejecting immediately
        }));

    // Policy 2: Per-IP fixed window — 120 requests/minute per IP (generous for students)
    options.AddPolicy("per_ip", ctx =>
    {
        var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(ip, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 120,
            Window = TimeSpan.FromMinutes(1),
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 20
        });
    });

    // Policy 3: Login endpoint — 10 attempts/minute per IP (prevents brute force)
    options.AddPolicy("login_limit", ctx =>
    {
        var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter($"login_{ip}", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 0      // No queuing for login — reject immediately
        });
    });

    // Policy 4: Photo upload — 5 uploads/minute per IP (photo processing is CPU-heavy)
    options.AddPolicy("photo_upload", ctx =>
    {
        var ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter($"photo_{ip}", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(1),
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
            QueueLimit = 3
        });
    });
});

// 3. Application Core Services
builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IPhotoService, PhotoService>();
builder.Services.AddScoped<IExcelImportService, ExcelImportService>();
builder.Services.AddSingleton<IJobManagerService, JobManagerService>();

// 3. SignalR WebSockets
builder.Services.AddSignalR();

// 4. JWT Authentication
var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET_KEY") 
    ?? builder.Configuration["Jwt:SecretKey"] 
    ?? "BUA_Enterprise_Ultra_Secure_Secret_Key_2025_Long_Enough_256_Bits!";
var jwtIssuer = Environment.GetEnvironmentVariable("JWT_ISSUER") 
    ?? builder.Configuration["Jwt:Issuer"] 
    ?? "BuaStudentApi";
var jwtAudience = Environment.GetEnvironmentVariable("JWT_AUDIENCE") 
    ?? builder.Configuration["Jwt:Audience"] 
    ?? "BuaStudentApp";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ValidateIssuer = true,
        ValidIssuer = jwtIssuer,
        ValidateAudience = true,
        ValidAudience = jwtAudience,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };

    // Allow SignalR to read token from Query String (?access_token=...) or HttpOnly Cookie
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
            {
                context.Token = accessToken;
            }
            else if (string.IsNullOrEmpty(context.Token) && context.Request.Cookies.TryGetValue("bua_access_token", out var cookieToken) && !string.IsNullOrEmpty(cookieToken))
            {
                context.Token = cookieToken;
            }
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// 5. CORS Policy
var envAllowedOrigins = Environment.GetEnvironmentVariable("ALLOWED_ORIGINS")?
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
var allowedOrigins = envAllowedOrigins ?? builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? new[]
{
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000"
};

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// 6. Swagger OpenAPI with Bearer Auth
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "جامعة بدر - بوابة شؤون والبطاقات الرقمية للطلاب API",
        Version = "v1",
        Description = "Enterprise REST API & SignalR Hub for Badr University Student Affairs & ID Card Generation"
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\"",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// 7. Seed Database & Assets on Startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var photoService = scope.ServiceProvider.GetRequiredService<IPhotoService>();
    var env = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();

    // Ensure database tables exist
    db.Database.EnsureCreated();

    // High Concurrency: Database optimizations
    if (dbProvider.Equals("Postgres", StringComparison.OrdinalIgnoreCase))
    {
        try
        {
            db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS ix_students_national_id ON students(national_id);");
            db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS ix_students_section ON students(section);");
            db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS ix_students_college ON students(college);");
            db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS ix_students_year ON students(year);");
            db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS ix_users_student_id ON users(student_id);");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[PostgreSQL Index Warning]: {ex.Message}");
        }
    }
    else
    {
        try
        {
            db.Database.ExecuteSqlRaw("PRAGMA journal_mode = WAL;");
            db.Database.ExecuteSqlRaw("PRAGMA synchronous = NORMAL;");
            db.Database.ExecuteSqlRaw("PRAGMA busy_timeout = 30000;");
            db.Database.ExecuteSqlRaw("PRAGMA cache_size = -64000;");
            db.Database.ExecuteSqlRaw("PRAGMA temp_store = MEMORY;");

            // Ensure national_id, mobile, and section columns exist on students table
            try
            {
                db.Database.ExecuteSqlRaw("ALTER TABLE students ADD COLUMN national_id TEXT;");
            }
            catch { /* Column already exists */ }
            try
            {
                db.Database.ExecuteSqlRaw("ALTER TABLE students ADD COLUMN mobile TEXT;");
            }
            catch { /* Column already exists */ }
            try
            {
                db.Database.ExecuteSqlRaw("ALTER TABLE students ADD COLUMN section TEXT;");
            }
            catch { /* Column already exists */ }
            try
            {
                db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS IX_students_national_id ON students(national_id);");
                db.Database.ExecuteSqlRaw("CREATE INDEX IF NOT EXISTS IX_students_section ON students(section);");
            }
            catch { }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Database WAL Optimization Warning]: {ex.Message}");
        }
    }

    // Ensure WebRoot and uploads directory exists
    var webRoot = env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
    if (!Directory.Exists(webRoot))
    {
        Directory.CreateDirectory(webRoot);
    }
    var uploadsDir = Path.Combine(webRoot, "uploads");
    if (!Directory.Exists(uploadsDir))
    {
        Directory.CreateDirectory(uploadsDir);
    }

    // Ensure default placeholder image
    try
    {
        photoService.EnsurePlaceholderAsync(webRoot).GetAwaiter().GetResult();
    }
    catch { /* Ignore if already exists or during build */ }

    // Seed SuperAdmin if not existing
    if (!db.Users.Any(u => u.Role == "SuperAdmin"))
    {
        var adminUser = new User
        {
            Username = "superadmin",
            Email = "admin@bua.edu.eg",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin@123456"),
            Role = "SuperAdmin",
            College = null,
            IsActive = true,
            EmailVerified = true,
            CreatedAt = DateTime.UtcNow
        };
        db.Users.Add(adminUser);
        db.SaveChanges();
    }
}

// 8. Middleware Pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Health endpoint — used by load balancers and monitoring systems
app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    timestamp = DateTime.UtcNow,
    uptime = (DateTime.UtcNow - System.Diagnostics.Process.GetCurrentProcess().StartTime.ToUniversalTime()).ToString(@"d\.hh\:mm\:ss")
})).AllowAnonymous();

// Forwarded Headers for Reverse Proxy (Nginx, Cloudflare, etc.)
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto
});

app.UseResponseCompression();  // Must be before any response-writing middleware
app.UseRouting();
app.UseCors("AllowFrontend");
app.UseRateLimiter();           // Global rate limiter after CORS
app.UseMiddleware<SecurityShieldMiddleware>();

// Enable static file serving for uploaded photos
var wwwrootPath = app.Environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
if (!Directory.Exists(wwwrootPath))
{
    Directory.CreateDirectory(wwwrootPath);
}

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(wwwrootPath),
    RequestPath = ""
});

app.UseAuthentication();
app.UseAuthorization();

// Apply per-IP rate limit to all API endpoints
app.MapControllers().RequireRateLimiting("per_ip");
app.MapHub<JobProgressHub>("/hubs/job-progress");

app.Run();
