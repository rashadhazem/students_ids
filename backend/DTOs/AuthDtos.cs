using System.ComponentModel.DataAnnotations;

namespace BuaStudentApi.DTOs
{
    public class LoginRequestDto
    {
        [Required(ErrorMessage = "يرجى إدخال اسم المستخدم أو البريد الإلكتروني")]
        public string Username { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى إدخال كلمة المرور")]
        public string Password { get; set; } = string.Empty;
    }

    public class StudentLoginRequestDto
    {
        [Required(ErrorMessage = "يرجى إدخال البريد الإلكتروني الجامعي")]
        public string Email { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى إدخال الرقم القومي")]
        public string NationalId { get; set; } = string.Empty;
    }

    public class RegisterRequestDto
    {
        [Required(ErrorMessage = "يرجى إدخال الاسم الكامل")]
        public string FullName { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى اختيار سنة القيد")]
        public string Year { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى إدخال كود الطالب")]
        public string Code { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى اختيار الكلية")]
        public string College { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى إدخال البريد الإلكتروني")]
        [EmailAddress(ErrorMessage = "صيغة البريد الإلكتروني غير صحيحة")]
        public string Email { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى إدخال كلمة المرور")]
        [MinLength(8, ErrorMessage = "كلمة المرور يجب أن تكون 8 أحرف على الأقل")]
        public string Password { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى تأكيد كلمة المرور")]
        [Compare("Password", ErrorMessage = "كلمتا المرور غير متطابقتين")]
        public string ConfirmPassword { get; set; } = string.Empty;
    }

    public class ChangePasswordDto
    {
        [Required(ErrorMessage = "يرجى إدخال كلمة المرور الحالية")]
        public string CurrentPassword { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى إدخال كلمة المرور الجديدة")]
        [MinLength(8, ErrorMessage = "كلمة المرور يجب أن تكون 8 أحرف على الأقل")]
        public string NewPassword { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى تأكيد كلمة المرور")]
        [Compare("NewPassword", ErrorMessage = "كلمتا المرور غير متطابقتين")]
        public string ConfirmPassword { get; set; } = string.Empty;
    }

    public class UpdateProfileDto
    {
        [Required(ErrorMessage = "يرجى إدخال الاسم الكامل")]
        public string FullName { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى إدخال البريد الإلكتروني")]
        [EmailAddress(ErrorMessage = "صيغة البريد الإلكتروني غير صحيحة")]
        public string Email { get; set; } = string.Empty;

        public string? CurrentPassword { get; set; }
        public string? NewPassword { get; set; }
        public string? ConfirmNewPassword { get; set; }
    }

    public class ResendVerificationDto
    {
        [Required(ErrorMessage = "يرجى إدخال البريد الإلكتروني")]
        [EmailAddress(ErrorMessage = "صيغة البريد الإلكتروني غير صحيحة")]
        public string Email { get; set; } = string.Empty;
    }

    public class ForgotPasswordDto
    {
        [Required(ErrorMessage = "يرجى إدخال البريد الإلكتروني")]
        [EmailAddress(ErrorMessage = "صيغة البريد غير صالحة")]
        public string Email { get; set; } = string.Empty;
    }

    public class ResetPasswordDto
    {
        [Required]
        public string Token { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى إدخال كلمة المرور")]
        [MinLength(8, ErrorMessage = "كلمة المرور يجب أن تكون 8 أحرف على الأقل")]
        public string Password { get; set; } = string.Empty;

        [Required(ErrorMessage = "يرجى تأكيد كلمة المرور")]
        [Compare("Password", ErrorMessage = "كلمتا المرور غير متطابقتين")]
        public string ConfirmPassword { get; set; } = string.Empty;
    }

    public class UserProfileDto
    {
        public int Id { get; set; }
        public string Email { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public string Username { get => Email; set { if (string.IsNullOrEmpty(Email)) Email = value; } }
        public string Role { get; set; } = string.Empty;
        public string? College { get; set; }
        public string? StudentId { get; set; }
        public bool IsActive { get; set; } = true;
        public bool EmailVerified { get; set; } = false;
        public DateTime? LastLogin { get; set; }
        public DateTime? CreatedAt { get; set; }
    }

    public class AuthResponseDto
    {
        public bool Success { get; set; }
        public string? Message { get; set; }
        public string? Token { get; set; }
        public UserProfileDto? User { get; set; }
    }
}
