using System;
using System.Net;
using System.Threading.Tasks;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MimeKit;

namespace BuaStudentApi.Services
{
    public interface IEmailService
    {
        Task SendEmailAsync(string to, string subject, string htmlContent);
        string GetVerificationEmailHtml(string name, string link);
        string GetPasswordResetEmailHtml(string name, string link);
        string GetWelcomeStudentEmailHtml(string name, string studentId, string loginEmail, string tempPassword, string cardLink);
    }

    public class EmailService : IEmailService
    {
        private readonly IConfiguration _config;
        private readonly ILogger<EmailService> _logger;

        public EmailService(IConfiguration config, ILogger<EmailService> logger)
        {
            _config = config;
            _logger = logger;
        }

        public async Task SendEmailAsync(string to, string subject, string htmlContent)
        {
            var server = _config["MAIL_SERVER"] ?? _config["Mail:Server"] ?? _config["EmailSettings:SmtpHost"] ?? "smtp.gmail.com";
            var portStr = _config["MAIL_PORT"] ?? _config["Mail:Port"] ?? _config["EmailSettings:SmtpPort"];
            var port = int.TryParse(portStr, out var p) ? p : 465;
            var username = _config["MAIL_USERNAME"] ?? _config["Mail:Username"] ?? _config["EmailSettings:SmtpUser"];
            var rawPassword = _config["MAIL_PASSWORD"] ?? _config["Mail:Password"] ?? _config["EmailSettings:SmtpPass"];
            var password = rawPassword != null ? rawPassword.Replace(" ", "").Trim() : "";
            var from = _config["MAIL_DEFAULT_SENDER"] ?? _config["Mail:From"] ?? _config["EmailSettings:SenderEmail"] ?? username ?? "student.affairs.bua@gmail.com";
            var senderName = _config["EmailSettings:SenderName"] ?? "جامعة بدر بأسيوط - شؤون الطلاب";

            var sslStr = _config["MAIL_USE_SSL"] ?? _config["EmailSettings:EnableSsl"];
            bool useSsl = port == 465;
            if (!string.IsNullOrEmpty(sslStr) && bool.TryParse(sslStr, out var parsedSsl))
            {
                useSsl = parsedSsl;
            }

            if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
            {
                _logger.LogWarning("Email sending skipped: SMTP credentials not configured. Target: {To}, Subject: {Subject}", to, subject);
                return;
            }

            try
            {
                var message = new MimeMessage();
                message.From.Add(new MailboxAddress(senderName, from));
                message.To.Add(new MailboxAddress("", to));
                message.Subject = subject;

                var bodyBuilder = new BodyBuilder { HtmlBody = htmlContent };
                message.Body = bodyBuilder.ToMessageBody();

                using var client = new SmtpClient();
                // Gmail SSL on port 465 requires SslOnConnect; port 587 requires StartTls
                var socketOption = (useSsl || port == 465) ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls;

                await client.ConnectAsync(server, port, socketOption);
                await client.AuthenticateAsync(username, password);
                await client.SendAsync(message);
                await client.DisconnectAsync(true);
                _logger.LogInformation("Email sent successfully to {To} via {Server}:{Port} (SSL={UseSsl})", to, server, port, socketOption == SecureSocketOptions.SslOnConnect);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send email to {To} via {Server}:{Port}", to, server, port);
            }
        }

        public string GetVerificationEmailHtml(string name, string link)
        {
            var safeName = WebUtility.HtmlEncode(name);
            var safeLink = WebUtility.HtmlEncode(link);
            return $@"
<div dir=""rtl"" style=""font-family:Cairo,Arial;max-width:520px;margin:auto"">
  <div style=""background:#0d1f3c;padding:28px;border-radius:14px 14px 0 0;text-align:center"">
    <h2 style=""color:#e8b84b;margin:0"">تأكيد البريد الإلكتروني</h2>
  </div>
  <div style=""background:#f0f4f9;padding:28px;border-radius:0 0 14px 14px"">
    <p>أهلاً <strong>{safeName}</strong>،</p>
    <p>انقر على الزر أدناه لتفعيل حسابك في نظام القيد الجامعي:</p>
    <a href=""{safeLink}"" style=""display:inline-block;background:#0d1f3c;color:#e8b84b;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0"">تفعيل الحساب</a>
    <p style=""color:#888;font-size:.85rem"">الرابط صالح لمدة 24 ساعة</p>
  </div>
</div>";
        }

        public string GetPasswordResetEmailHtml(string name, string link)
        {
            var safeName = WebUtility.HtmlEncode(name);
            var safeLink = WebUtility.HtmlEncode(link);
            return $@"
<div dir=""rtl"" style=""font-family:Cairo,Arial;max-width:520px;margin:auto"">
  <div style=""background:#c53030;padding:28px;border-radius:14px 14px 0 0;text-align:center"">
    <h2 style=""color:#fff;margin:0"">إعادة تعيين كلمة المرور</h2>
  </div>
  <div style=""background:#f0f4f9;padding:28px;border-radius:0 0 14px 14px"">
    <p>أهلاً <strong>{safeName}</strong>،</p>
    <p>انقر على الزر أدناه لإعادة تعيين كلمة مرورك:</p>
    <a href=""{safeLink}"" style=""display:inline-block;background:#c53030;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;margin:16px 0"">إعادة التعيين</a>
    <p style=""color:#888;font-size:.85rem"">الرابط صالح لمدة ساعة واحدة فقط. إذا لم تطلب ذلك، يُرجى تجاهل هذا البريد.</p>
  </div>
</div>";
        }

        public string GetWelcomeStudentEmailHtml(string name, string studentId, string loginEmail, string tempPassword, string cardLink)
        {
            var safeName = WebUtility.HtmlEncode(name);
            var safeSid = WebUtility.HtmlEncode(studentId);
            var safeLogin = WebUtility.HtmlEncode(loginEmail);
            var safePw = WebUtility.HtmlEncode(tempPassword);
            var safeLink = WebUtility.HtmlEncode(cardLink);

            return $@"
<div dir=""rtl"" style=""font-family:Cairo,Arial;max-width:540px;margin:auto"">
  <div style=""background:linear-gradient(135deg,#0d1f3c,#1a3a6b);padding:30px;border-radius:14px 14px 0 0;text-align:center"">
    <h1 style=""color:#e8b84b;margin:0;font-size:1.4rem"">&#127891; مرحباً بك في جامعة بدر بأسيوط</h1>
  </div>
  <div style=""background:#f0f4f9;padding:28px;border-radius:0 0 14px 14px"">
    <p style=""font-size:1rem"">أهلاً <strong>{safeName}</strong>،</p>
    <p style=""margin-top:8px;color:#444"">تم تسجيلك بنجاح في نظام البطاقات والقيد الجامعي.</p>

    <div style=""background:#0d1f3c;border-radius:10px;padding:16px;margin:16px 0"">
      <p style=""color:rgba(255,255,255,.5);font-size:.8rem;margin-bottom:8px;text-align:center"">الرقم الجامعي</p>
      <p style=""color:#e8b84b;font-family:monospace;font-size:1.5rem;font-weight:700;letter-spacing:3px;text-align:center"">{safeSid}</p>
    </div>

    <div style=""background:#fff;border:1px solid #dce3ef;border-radius:10px;padding:16px;margin:14px 0"">
      <p style=""font-weight:700;color:#1a2744;margin-bottom:10px"">بيانات تسجيل الدخول:</p>
      <p style=""font-size:.88rem;color:#444;margin-bottom:5px"">البريد الجامعي / اسم المستخدم: <strong style=""direction:ltr;display:inline-block"">{safeLogin}</strong></p>
      <p style=""font-size:.88rem;color:#444"">كلمة المرور المؤقتة: <strong style=""font-family:monospace;letter-spacing:1px"">{safePw}</strong></p>
      <p style=""font-size:.75rem;color:#c53030;margin-top:8px"">* يُنصح بتغيير كلمة المرور فور تسجيل الدخول الأول</p>
    </div>

    <a href=""{safeLink}"" style=""display:inline-block;background:#1a3a6b;color:#e8b84b;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;margin:10px 0"">
      عرض بطاقة الهوية الجامعية
    </a>
  </div>
</div>";
        }
    }
}
