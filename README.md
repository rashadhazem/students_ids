# 🎓 BUA Student Digital ID Card System
### منظومة بطاقات الطلاب الرقمية — جامعة بدر بأسيوط (BUA)

A high-performance, enterprise-grade digital student ID card management and issuance platform built for **Badr University in Assiut (BUA)**. The platform supports high-concurrency student self-service card issuance, administrative bulk imports, photo processing queues, and real-time validation.

---

## ⚡ Key Highlights & Architecture

- **High-Concurrency Ready:** Engineered to sustain **5,000+ concurrent users** during peak registration and exam seasons.
- **Channel-based Async Queues:** Built with .NET `System.Threading.Channels` and a **16-worker background processor pool** for non-blocking photo processing, cropping, and compression.
- **Sub-Millisecond Read Latency:** Built-in in-memory caching (`IMemoryCache`) serving student ID cards in `< 0.5ms` directly from RAM.
- **Zero-Setup Database Initialization:** Automatically provisions the SQLite schema, creates the uploads directory structure, and seeds the initial default SuperAdmin on first boot.

---

## 🛠️ Technology Stack

### Backend (.NET 8 API)
- **Framework:** .NET 8 Web API (C#)
- **ORM & Database:** Entity Framework Core with SQLite (configurable to PostgreSQL for cloud production)
- **Image Processing:** SixLabors.ImageSharp (automated aspect ratio normalization 4:5, 400×500 high-dpi print output, smart cropping)
- **Spreadsheet Processing:** ClosedXML (handles bulk Excel uploads of student rosters with smart college name normalization)
- **Security & Authentication:** JWT Bearer tokens, BCrypt password hashing, rate limiting, and custom security shield middleware
- **API Documentation:** Swagger / OpenAPI UI

### Frontend (React + Vite)
- **Framework:** React 18+ with TypeScript
- **Bundler & Dev Server:** Vite
- **Styling:** Tailwind CSS + Custom BUA Design System (Royal Navy `#0b1a30`, Gold `#c59b27`, Tajawal Arabic typography)
- **Routing:** React Router v6
- **Icons:** Lucide React
- **HTTP Client:** Axios with bearer interceptors

---

## 📋 Prerequisites

Ensure you have the following installed on your machine:
1. **[.NET 8.0 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)** or newer.
2. **[Node.js](https://nodejs.org/)** (v18.x, v20.x, or newer) and `npm`.
3. **[Git](https://git-scm.com/)**.

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/rashadhazem/students_ids.git
cd students_ids
```

---

### 2. Run the Backend API

Open a terminal window and navigate to the `backend` folder:

```bash
cd backend
dotnet restore
dotnet run --launch-profile http
```

- **API Base URL:** `http://localhost:5000`
- **Swagger Documentation:** `http://localhost:5000/swagger`
- **Database:** Auto-generated at `backend/bua_students.db` with default schemas and superadmin user.

---

### 3. Run the Frontend Client

Open a **second terminal window** and navigate to the `frontend` folder:

```bash
cd frontend
npm install
npm run dev
```

- **Frontend App URL:** `http://localhost:5173`

---

## 🔐 Default Admin Credentials

Upon initial launch, the system automatically seeds the default SuperAdmin account:

| Field | Value |
|---|---|
| **Email / Username** | `superadmin` OR `admin@bua.edu.eg` |
| **Password** | `Admin@123456` |
| **Role** | `SuperAdmin` (Full Administrative Privileges) |

> ⚠️ *Make sure to update the admin credentials after your initial deployment.*

---

## 📂 Project Structure

```text
students_ids/
├── backend/
│   ├── Controllers/          # API Controllers (Auth, Students, Export, BulkImport, Users)
│   ├── Data/                 # Entity Framework AppDbContext
│   ├── DTOs/                 # Request & Response Data Transfer Objects
│   ├── Middleware/           # SecurityShield & RateLimiting middlewares
│   ├── Models/               # Database entities (Student, User, etc.)
│   ├── Services/             # PhotoService, PhotoProcessingWorker, ExcelImportService
│   ├── appsettings.json      # Development configuration & connection strings
│   └── Program.cs            # App bootstrap & DI configuration
│
├── frontend/
│   ├── src/
│   │   ├── api/              # Axios client & endpoints
│   │   ├── components/       # Layout, Navbar, Sidebar, ProtectedRoute, etc.
│   │   ├── context/          # AuthContext & Session management
│   │   ├── pages/            # Dashboard, Students, Register, Export, Users, BulkImport
│   │   └── types/            # TypeScript interfaces & types
│   ├── package.json
│   └── vite.config.ts
│
├── .gitignore
└── README.md
```

---

## 🏫 Approved Faculties (الكليات المعتمدة)

The system is configured with all 14 official BUA faculties:
1. كلية طب الأسنان
2. كلية الصيدلة فارما D
3. كلية صيدلة اكلينيكية
4. كلية العلاج الطبيعي
5. كلية الطب البيطري
6. كلية تكنلوجيا علوم حيوية
7. كلية العلوم الصحية التطبيقية
8. كلية التمريض
9. كلية ذكاء اصطناعي وعلوم البيانات
10. كلية بزنس وإدارة الأعمال
11. كلية لغات وترجمة
12. كلية الحقوق
13. كلية الفنون الجميلة
14. كلية الفنون التطبيقية

---

## ❓ Troubleshooting

### 1. PowerShell Script Execution Policy Error
If running `npm` produces `File npm.ps1 cannot be loaded because running scripts is disabled`:
- **Option A:** Use standard Command Prompt (`cmd.exe`).
- **Option B:** Run this in PowerShell as Administrator:
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```

### 2. Port 5000 or 5173 is already in use
Check and kill the conflicting process on Windows:
```powershell
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

---

## 📄 License
Internal proprietary software for **Badr University in Assiut (BUA)**. All rights reserved.
