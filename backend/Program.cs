using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
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

// 1. Database Configuration
var dbProvider = builder.Configuration["DatabaseProvider"] ?? "Sqlite";
var connectionString = builder.Configuration.GetConnectionString(
    dbProvider.Equals("Postgres", StringComparison.OrdinalIgnoreCase) ? "PostgresConnection" : "DefaultConnection");

builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (dbProvider.Equals("Postgres", StringComparison.OrdinalIgnoreCase))
    {
        options.UseNpgsql(connectionString);
    }
    else
    {
        options.UseSqlite(connectionString);
    }
});

// 2. High-Performance Caching & Concurrency Components
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<IDbWriteCoordinator, DbWriteCoordinator>();
builder.Services.AddSingleton<IPhotoProcessingQueue, PhotoProcessingQueue>();
builder.Services.AddHostedService<PhotoProcessingWorkerService>();

// 3. Application Core Services
builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IPhotoService, PhotoService>();
builder.Services.AddScoped<IExcelImportService, ExcelImportService>();
builder.Services.AddSingleton<IJobManagerService, JobManagerService>();

// 3. SignalR WebSockets
builder.Services.AddSignalR();

// 4. JWT Authentication
var jwtSecret = builder.Configuration["Jwt:SecretKey"] ?? "BUA_Enterprise_Ultra_Secure_Secret_Key_2025_Long_Enough_256_Bits!";
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "BuaStudentApi";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "BuaStudentApp";

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

    // Allow SignalR to read token from Query String (?access_token=...)
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
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// 5. CORS Policy
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? new[]
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

    // High Concurrency: Configure SQLite WAL mode & connection busy timeout
    if (!dbProvider.Equals("Postgres", StringComparison.OrdinalIgnoreCase))
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

app.UseRouting();
app.UseCors("AllowFrontend");
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

app.MapControllers();
app.MapHub<JobProgressHub>("/hubs/job-progress");

app.Run();
