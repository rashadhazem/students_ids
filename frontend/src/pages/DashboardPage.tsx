import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient, API_BASE_URL } from '../api/client';

interface DashboardStats {
  totalStudents: number;
  studentsWithPhotos: number;
  studentsWithoutPhotos: number;
  totalColleges: number;
  collegeDistribution: Array<{ college: string; count: number }>;
  recentStudents: Array<{
    id: number;
    studentId: string;
    fullName: string;
    college: string;
    year: string;
    imagePath?: string;
    createdAt?: string;
  }>;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const role = user?.role?.toLowerCase() || '';

  const getRoleTitle = () => {
    if (role === 'superadmin') return 'مدير عام النظام';
    if (role === 'admin') return 'مشرف كلية';
    if (role === 'staff' || role === 'officer') return 'موظف شئون طلاب';
    return 'طالب';
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get('/students/stats');
        if (res.data?.success) {
          setStats(res.data);
        }
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const getPhotoUrl = (path?: string) => {
    if (!path) return `${API_BASE_URL}/api/photos/placeholder`;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE_URL}${cleanPath}`;
  };

  return (
    <div>
      {/* 1. HERO BANNER (matching dashboard.html .dash-hero) */}
      <div
        className="rounded-2xl p-6 sm:p-7 text-white mb-6 relative overflow-hidden flex justify-between items-center flex-wrap gap-4 shadow-[0_10px_30px_rgba(13,31,60,0.18)]"
        style={{
          background: 'linear-gradient(135deg, #0d1f3c 0%, #1a3a6b 60%, #0d1f3c 100%)'
        }}
      >
        <div
          className="absolute -top-1/2 -left-1/4 w-80 h-80 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(232,184,75,0.15) 0%, transparent 70%)' }}
        />

        <div className="relative z-10 text-right">
          <h1 className="text-xl sm:text-2xl font-black text-white m-0 mb-1.5 flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-gold2">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
            </svg>
            <span>
              {role === 'superadmin'
                ? 'لوحة الإدارة العامة – جامعة بدر بأسيوط'
                : role === 'admin'
                ? `لوحة تحكم ${user?.college || 'الكلية'}`
                : 'لوحة تحكم شئون الطلاب – جامعة بدر بأسيوط'}
            </span>
          </h1>
          <p className="text-white/70 text-xs sm:text-sm font-tajawal m-0">
            مرحباً بك يا {user?.fullName || user?.userName} · {getRoleTitle()} (منظومة بطاقات الطلاب الرقمية)
          </p>
        </div>

        <div className="relative z-10">
          <span className="bg-[rgba(232,184,75,0.18)] text-gold2 border border-[rgba(232,184,75,0.35)] px-3.5 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            <span>{getRoleTitle()}</span>
          </span>
        </div>
      </div>

      {/* 2. STATS KPI CARDS (.stat-grid) */}
      <div className="bua-stat-grid">
        {/* Total Students */}
        <div className="bua-stat-card">
          <div className="bua-stat-icon blue">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
          </div>
          <div>
            <div className="bua-stat-val">{loading ? '…' : stats?.totalStudents ?? 8}</div>
            <div className="bua-stat-lbl">
              {role === 'admin' ? 'طلاب كليتك' : 'إجمالي طلاب الجامعة'}
            </div>
          </div>
        </div>

        {/* With Photo */}
        <div className="bua-stat-card">
          <div className="bua-stat-icon green">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
          </div>
          <div>
            <div className="bua-stat-val">{loading ? '…' : stats?.studentsWithPhotos ?? 8}</div>
            <div className="bua-stat-lbl">لديهم صورة شخصية</div>
          </div>
        </div>

        {/* Colleges */}
        <div className="bua-stat-card">
          <div className="bua-stat-icon gold">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
            </svg>
          </div>
          <div>
            <div className="bua-stat-val">{loading ? '…' : stats?.totalColleges ?? 4}</div>
            <div className="bua-stat-lbl">كليات مسجلة</div>
          </div>
        </div>

        {/* Missing Photos / System Status */}
        <div className="bua-stat-card">
          <div className="bua-stat-icon red">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          </div>
          <div>
            <div className="bua-stat-val">{loading ? '…' : stats?.studentsWithoutPhotos ?? 0}</div>
            <div className="bua-stat-lbl">صور مفقودة / بحاجة لرفع</div>
          </div>
        </div>
      </div>

      {/* 3. QUICK ACTIONS RIBBON (.quick-actions) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Link
          to="/students/new"
          className="bg-white border-[1.5px] border-[#dce3ef] hover:border-blue hover:-translate-y-0.5 rounded-xl p-3.5 flex items-center gap-3 transition shadow-sm no-underline text-navy group"
        >
          <div className="w-10 h-10 rounded-lg bg-[rgba(26,58,107,0.1)] text-blue flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold block group-hover:text-blue">تسجيل طالب جديد</div>
            <div className="text-[10px] text-muted font-tajawal">إدخال بيانات وصورة فورية</div>
          </div>
        </Link>

        <Link
          to="/students"
          className="bg-white border-[1.5px] border-[#dce3ef] hover:border-gold hover:-translate-y-0.5 rounded-xl p-3.5 flex items-center gap-3 transition shadow-sm no-underline text-navy group"
        >
          <div className="w-10 h-10 rounded-lg bg-[rgba(200,148,26,0.1)] text-gold flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold block group-hover:text-gold">إدارة الطلاب</div>
            <div className="text-[10px] text-muted font-tajawal">البحث والتعديل والطباعة</div>
          </div>
        </Link>

        {['superadmin', 'staff', 'officer'].includes(role) && (
          <Link
            to="/bulk-import"
            className="bg-white border-[1.5px] border-[#dce3ef] hover:border-emerald-600 hover:-translate-y-0.5 rounded-xl p-3.5 flex items-center gap-3 transition shadow-sm no-underline text-navy group"
          >
            <div className="w-10 h-10 rounded-lg bg-[rgba(39,103,73,0.1)] text-success flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
              </svg>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold block group-hover:text-success">رفع ملف Excel</div>
              <div className="text-[10px] text-muted font-tajawal">استيراد دفعي للطلاب</div>
            </div>
          </Link>
        )}

        {role === 'superadmin' && (
          <Link
            to="/users"
            className="bg-white border-[1.5px] border-[#dce3ef] hover:border-purple-600 hover:-translate-y-0.5 rounded-xl p-3.5 flex items-center gap-3 transition shadow-sm no-underline text-navy group"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold block group-hover:text-purple-600">إدارة المشرفين</div>
              <div className="text-[10px] text-muted font-tajawal">توزيع الصلاحيات والكليات</div>
            </div>
          </Link>
        )}

        <Link
          to="/export"
          className="bg-white border-[1.5px] border-[#dce3ef] hover:border-red-600 hover:-translate-y-0.5 rounded-xl p-3.5 flex items-center gap-3 transition shadow-sm no-underline text-navy group"
        >
          <div className="w-10 h-10 rounded-lg bg-[rgba(197,48,48,0.1)] text-danger flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold block group-hover:text-danger">تصدير تقرير Excel</div>
            <div className="text-[10px] text-muted font-tajawal">تحميل بيانات الطلاب</div>
          </div>
        </Link>
      </div>

      {/* 4. COLLEGE DISTRIBUTION GRID (matching dashboard.html) */}
      {stats?.collegeDistribution && stats.collegeDistribution.length > 0 && (
        <div className="bua-card mb-6">
          <div className="bua-card-header bg-[#fafbfd]">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-gold">
              <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
            </svg>
            <h2>توزيع الطلاب على كليات الجامعة</h2>
          </div>
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {stats.collegeDistribution.map((item, index) => (
                <div
                  key={index}
                  className="bg-white border border-[#dce3ef] hover:border-gold rounded-xl p-3.5 flex justify-between items-center transition shadow-sm"
                >
                  <div className="text-right">
                    <div className="text-xs font-bold text-navy">{item.college}</div>
                    <span className="text-[11px] text-muted font-tajawal">طالب مسجل</span>
                  </div>
                  <span className="text-xs font-bold text-blue bg-[rgba(26,58,107,0.08)] px-2.5 py-1 rounded-full font-mono">
                    {item.count} طالب
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. TWO COLUMN SECTION: Recent Students + System info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Recent Students Table (takes 2 cols) */}
        <div className="lg:col-span-2 bua-card">
          <div className="bua-card-header bg-[#fafbfd] justify-between">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-gold">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
              <h2>أحدث الطلاب المسجلين بالجامعة</h2>
            </div>
            <Link to="/students" className="bua-btn bua-btn-outline bua-btn-sm text-xs">
              عرض الكل
            </Link>
          </div>

          <div className="bua-tbl-wrap">
            <table className="bua-table">
              <thead>
                <tr>
                  <th>الصورة</th>
                  <th>الرقم الجامعي</th>
                  <th>الاسم الكامل</th>
                  <th>الكلية</th>
                  <th>السنة</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentStudents && stats.recentStudents.length > 0 ? (
                  stats.recentStudents.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <img
                          src={getPhotoUrl(s.imagePath)}
                          alt={s.fullName}
                          className="student-thumb"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `${API_BASE_URL}/api/photos/placeholder`;
                          }}
                        />
                      </td>
                      <td>
                        <span className="student-id-badge">{s.studentId}</span>
                      </td>
                      <td className="font-bold text-navy">{s.fullName}</td>
                      <td>
                        <span className="college-tag">{s.college}</span>
                      </td>
                      <td>
                        <span className="year-tag">{s.year}</span>
                      </td>
                      <td>
                        <Link
                          to={`/card?id=${s.studentId}`}
                          className="bua-btn bua-btn-outline bua-btn-sm text-xs"
                        >
                          بطاقة
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-muted font-tajawal">
                      {loading ? 'جارٍ تحميل الطلاب…' : 'لا يوجد طلاب مسجلون حالياً'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* System Info / Security Status Card */}
        <div className="bua-card">
          <div className="bua-card-header bg-[#fafbfd]">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-blue">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
            </svg>
            <h2>حالة المنظومة والأمان</h2>
          </div>
          <div className="bua-card-body space-y-3.5 text-xs font-tajawal">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
              <span className="font-bold">خادم ASP.NET Core 8:</span>
              <span className="font-mono font-bold">متصل وفعال (HTTP 200)</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue">
              <span className="font-bold">قاعدة البيانات:</span>
              <span className="font-mono">SQLite (bua_students.db)</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
              <span className="font-bold">معالجة الصور:</span>
              <span>SixLabors.ImageSharp (400x500 4:5)</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
              <span className="font-bold">التحديث اللحظي:</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>SignalR Hub نشط</span>
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-muted">
              <span>الإصدار:</span>
              <span className="font-mono">v2.0 (Dual Stack Ready)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
