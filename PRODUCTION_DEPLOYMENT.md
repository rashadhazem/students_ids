# دليل تشغيل النظام على بيئة الإنتاج (Production Deployment Guide)
## جامعة بدر - بوابة شؤون الطلاب والبطاقات الرقمية (BUA Student Affairs & ID Card Platform)

---

### 1. المتطلبات الأساسية (Prerequisites)
1. **قاعدة البيانات:** PostgreSQL 15+ تعمل ومجهزة بقاعدة بيانات `bua_db` ومستخدم `bua_user`.
2. **بيئة التشغيل:** .NET 8.0 SDK / Runtime.
3. **بيئة الذكاء الاصطناعي:** Python 3.10+ مع مكتبات `opencv-python` و `mediapipe` أو خدمة الاقتصاص الذكي `smart_cropper_service.py` على منفذ `5005`.
4. **خادم الويب العكسي (Reverse Proxy):** Nginx أو Cloudflare مع شهادة SSL (HTTPS).

---

### 2. إعداد قاعدة البيانات (PostgreSQL)
تم نقل وتبديل قاعدة البيانات بالكامل إلى **PostgreSQL** مع ترحيل كافة سجلات الطلاب (4,526 طالب) والمستخدمين وسجلات التدقيق (Audit Logs).

**بيانات الاتصال:**
- **Host:** `localhost` (أو اسم سيرفر DB في بيئة الإنتاج)
- **Port:** `5432`
- **Database:** `bua_db`
- **Username:** `bua_user`
- **Connection String:**
  ```text
  Host=localhost;Port=5432;Database=bua_db;Username=bua_user;Password=bua_password;Maximum Pool Size=100;Connection Lifetime=300;
  ```

---

### 3. متغيرات البيئة للإنتاج (Environment Variables)
في بيئة الإنتاج، يُنصح بتمرير المتغيرات الحساسة عبر Environment Variables بدلاً من كتابتها داخل الملفات:

| المتغير | الوصف | القيمة المقترحة |
| :--- | :--- | :--- |
| `ASPNETCORE_ENVIRONMENT` | بيئة التشغيل | `Production` |
| `JWT_SECRET_KEY` | المفتاح السري لتشفير التوكن (256-bit) | مفتاح سري عشوائي معقد طويل |
| `JWT_ISSUER` | مصدر التوكن | `BuaStudentApi` |
| `JWT_AUDIENCE` | جمهور التوكن | `BuaStudentApp` |
| `ALLOWED_ORIGINS` | النطاقات المسموح لها بالاتصال (CORS) | `https://student.bua.edu.eg,https://portal.bua.edu.eg` |
| `ConnectionStrings__PostgresConnection` | نص الاتصال بقاعدة البيانات | نص اتصال PostgreSQL |

---

### 4. طبقات الأمان المحققة (Security Hardening Checklist)
- [x] **PostgreSQL Primary Database:** استخدام محرك PostgreSQL عالي الأداء مع DbContext Pooling وفهارس سريعة لـ `national_id`, `student_id`, `college`, `year`.
- [x] **اعتماد الرقم القومي الصارم ككلمة مرور:** لا يمكن لأي طالب الدخول إلا بكود الطالب/البريد الجامعي والرقم القومي المكون من 14 رقماً (تم إلغاء أي bypass قديم).
- [x] **حماية ملفات الصور ومسارات السيرفر (Path Traversal Protection):** تعقيم كامل لمدخلات أسماء الطلاب وسنوات الدراسة لمنع الهروب خارج مجلد `uploads/`.
- [x] **تأمين التوكن عبر HttpOnly Cookie:** إرسال كوكيز `bua_access_token` بخصائص `HttpOnly=true`, `SameSite=Lax`, `Secure=true` لحماية الجلسة من هجمات XSS.
- [x] **عزل مشرفي الكليات (Multi-Tenant College Isolation):** منع أي مشرف من رؤية أو تعديل أو تصدير بيانات طلاب خارج كليته نهائياً.
- [x] **الدرع الأمني الشامل (SecurityShieldMiddleware):**
  - كشف ومكافحة برامج الفحص الآلي (sqlmap, nikto, nmap, dirbuster).
  - حجب الاستعلامات الخبيثة وحقن SQL و XSS في الـ Query String والـ Request Body.
  - الحماية التلقائية من هجمات القوة الغاشمة (Brute Force Auto-Freeze: حظر الـ IP لمدة 15 دقيقة عند تكرار 15 محاولة فاشلة).
- [x] **معدل الطلبات والتحديد (Rate Limiting):**
  - حد أقصى 10 محاولات تسجيل دخول لكل دقيقة لكل IP.
  - حد أقصى 5 عمليات رفع صور لكل دقيقة.
  - حد أقصى 120 طلب عام لكل دقيقة.
- [x] **دعم البروكسي العكسي (Forwarded Headers):** تمرير الترويسات الحقيقية `X-Forwarded-For` و `X-Forwarded-Proto` لتشغيل Rate Limiting و IP Logging بدقة خلف Nginx / Cloudflare.

---

### 5. إعداد Nginx Reverse Proxy (مثال)
```nginx
server {
    listen 80;
    server_name student.bua.edu.eg;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name student.bua.edu.eg;

    ssl_certificate /etc/letsencrypt/live/student.bua.edu.eg/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/student.bua.edu.eg/privkey.pem;

    client_max_body_size 25M;

    # الواجهة الأمامية (Frontend Build)
    location / {
        root /var/www/bua_frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # مسار الـ API والخدمات الخلفية
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection keep-alive;
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # مسار SignalR WebSockets
    location /hubs/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # مسار الصور المرفوعة
    location /uploads/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }
}
```

---

### 6. تشغيل النظام كخدمة (Systemd Service)
```ini
[Unit]
Description=BUA Student Affairs .NET Backend Service
After=network.target postgresql.service

[Service]
WorkingDirectory=/var/www/bua_backend
ExecStart=/usr/bin/dotnet /var/www/bua_backend/BuaStudentApi.dll
Restart=always
RestartSec=10
KillSignal=SIGINT
SyslogIdentifier=bua-student-api
User=www-data
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=DOTNET_PRINT_TELEMETRY_MESSAGE=false
Environment=JWT_SECRET_KEY=YOUR_ENTERPRISE_LONG_SECRET_KEY_256_BITS!

[Install]
WantedBy=multi-user.target
```
