using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using BuaStudentApi.Models;

namespace BuaStudentApi.Services
{
    public interface IJwtService
    {
        string GenerateToken(User user);
    }

    public class JwtService : IJwtService
    {
        private readonly IConfiguration _config;

        public JwtService(IConfiguration config)
        {
            _config = config;
        }

        public string GenerateToken(User user)
        {
            var secret = Environment.GetEnvironmentVariable("JWT_SECRET_KEY") 
                ?? _config["Jwt:SecretKey"] 
                ?? "BUA_Enterprise_Ultra_Secure_Secret_Key_2025_Long_Enough_256_Bits!";
            var issuer = Environment.GetEnvironmentVariable("JWT_ISSUER") 
                ?? _config["Jwt:Issuer"] 
                ?? "BuaStudentApi";
            var audience = Environment.GetEnvironmentVariable("JWT_AUDIENCE") 
                ?? _config["Jwt:Audience"] 
                ?? "BuaStudentApp";
            var expirationHours = _config.GetValue<int?>("Jwt:ExpirationHours") ?? 24;

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
            var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim("name", user.FullName),
                new Claim(ClaimTypes.Role, user.Role),
                new Claim("college", user.College ?? ""),
                new Claim("student_id", user.StudentId ?? ""),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            var token = new JwtSecurityToken(
                issuer: issuer,
                audience: audience,
                claims: claims,
                expires: DateTime.UtcNow.AddHours(expirationHours),
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
