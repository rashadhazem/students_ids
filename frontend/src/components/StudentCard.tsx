import React from 'react';
import { API_BASE_URL } from '../api/client';

export interface StudentCardData {
  id?: number;
  studentId: string;
  fullName: string;
  college: string;
  section?: string;
  year?: string;
  academicYear?: string;
  imagePath?: string;
  nationalId?: string;
  mobile?: string;
  email?: string;
  updatedAt?: string;
}

export const getAcademicLevelInfo = (studentId?: string, year?: string) => {
  const sid = (studentId || '').trim();
  if (sid.length >= 4) {
    const yr = parseInt(sid.substring(0, 4), 10);
    if (yr >= 2000 && yr <= 2099) {
      const level = (2026 - yr) + 1;
      switch (level) {
        case 1: return { name: 'الفرقة الأولى', level: 1, year: '2026', en: '1st Year' };
        case 2: return { name: 'الفرقة الثانية', level: 2, year: '2025', en: '2nd Year' };
        case 3: return { name: 'الفرقة الثالثة', level: 3, year: '2024', en: '3rd Year' };
        case 4: return { name: 'الفرقة الرابعة', level: 4, year: '2023', en: '4th Year' };
        case 5: return { name: 'الفرقة الخامسة', level: 5, year: '2022', en: '5th Year' };
        case 6: return { name: 'الفرقة السادسة', level: 6, year: '2021', en: '6th Year' };
        default: return { name: `دفعة ${yr}`, level, year: `${yr}`, en: `Class of ${yr}` };
      }
    }
  }
  const y = (year || '').trim();
  if (y.includes('أول') || y === '1' || y === '2026') return { name: 'الفرقة الأولى', level: 1, year: '2026', en: '1st Year' };
  if (y.includes('ثان') || y === '2' || y === '2025') return { name: 'الفرقة الثانية', level: 2, year: '2025', en: '2nd Year' };
  if (y.includes('ثالث') || y === '3' || y === '2024') return { name: 'الفرقة الثالثة', level: 3, year: '2024', en: '3rd Year' };
  if (y.includes('رابع') || y === '4' || y === '2023') return { name: 'الفرقة الرابعة', level: 4, year: '2023', en: '4th Year' };
  if (y.includes('خامس') || y === '5' || y === '2022') return { name: 'الفرقة الخامسة', level: 5, year: '2022', en: '5th Year' };
  if (y.includes('سادس') || y === '6' || y === '2021') return { name: 'الفرقة السادسة', level: 6, year: '2021', en: '6th Year' };
  return { name: y || 'الفرقة الأولى', level: 1, year: '2026', en: '1st Year' };
};

interface StudentCardProps {
  student: StudentCardData;
  canEdit?: boolean;
  onOpenQuickUpload?: () => void;
  onOpenChangePw?: () => void;
  isLoggedIn?: boolean;
  onLogout?: () => void;
}

export const StudentCard: React.FC<StudentCardProps> = ({
  student,
  canEdit = false,
  onOpenQuickUpload,
  onOpenChangePw,
  isLoggedIn = false,
  onLogout
}) => {
  // Deterministic heights for barcode based on studentId characters
  const barcodeHeights = React.useMemo(() => {
    const chars = student.studentId || 'BUA2024';
    return Array.from({ length: 32 }, (_, i) => {
      const code = chars.charCodeAt(i % chars.length);
      return 18 + (code % 22);
    });
  }, [student.studentId]);

  const levelInfo = React.useMemo(() => {
    return getAcademicLevelInfo(student.studentId, student.academicYear || student.year);
  }, [student.studentId, student.academicYear, student.year]);

  const getLinkedInShareUrl = () => {
    const shareText = encodeURIComponent(
      `أنا مسجل رسمياً في جامعة بدر بأسيوط – ${student.college} (${levelInfo.name})! 🎓✨\nرقم الطالب: ${student.studentId}`
    );
    const shareUrl = encodeURIComponent(window.location.href);
    return `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}&summary=${shareText}`;
  };

  // Robust image URL calculation preventing double slashes and browser cache stale
  const photoUrl = React.useMemo(() => {
    if (!student.imagePath || !student.imagePath.trim()) {
      return `${API_BASE_URL}/api/photos/placeholder`;
    }
    const cleanPath = student.imagePath.trim();
    let url: string;
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://') || cleanPath.startsWith('blob:') || cleanPath.startsWith('data:')) {
      url = cleanPath;
    } else {
      url = `${API_BASE_URL}/${cleanPath.replace(/^\/+/, '')}`;
    }
    if (!url.includes('t=') && !url.includes('v=')) {
      const v = student.updatedAt ? new Date(student.updatedAt).getTime() : Date.now();
      url += (url.includes('?') ? '&' : '?') + `v=${v}`;
    }
    return url;
  }, [student.imagePath, student.updatedAt]);

  return (
    <div
      className="printable-card w-full max-w-[440px] rounded-[24px] overflow-hidden relative shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-[rgba(232,184,75,0.25)] transition-all duration-300 hover:shadow-[0_24px_60px_rgba(0,0,0,0.65)] hover:border-[rgba(232,184,75,0.4)]"
      style={{
        background: 'linear-gradient(145deg, #0f2546 0%, #163768 50%, #0d1f3c 100%)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
      }}
    >
      {/* Front Card Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-white/10 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold2/15 border border-gold2/30 flex items-center justify-center shadow-inner">
            <span className="text-xl select-none">🏛️</span>
          </div>
          <div className="text-right">
            <div className="text-white font-bold text-sm tracking-wide font-cairo">
              جامعة بدر بأسيوط
            </div>
            <div className="text-white/40 text-[10px] tracking-wider font-tajawal">
              BADR UNIVERSITY IN ASSIUT
            </div>
          </div>
        </div>
      </div>

      {/* Front Card Body */}
      <div className="p-6 flex items-start gap-5 relative z-10">
        {/* Photo Container with Badge */}
        <div className="relative flex-shrink-0">
          <div
            onClick={canEdit ? onOpenQuickUpload : undefined}
            className={`w-[100px] h-[125px] rounded-[14px] overflow-hidden border-2 border-[rgba(232,184,75,0.5)] bg-[#0d1f3c] shadow-[0_8px_24px_rgba(0,0,0,0.35)] relative group ${
              canEdit ? 'cursor-pointer' : ''
            }`}
          >
            <img
              src={photoUrl}
              alt={student.fullName}
              className="w-full h-full object-cover object-top block transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `${API_BASE_URL}/api/photos/placeholder`;
              }}
            />

            {canEdit && (
              <div className="absolute inset-0 bg-navy/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-[14px]">
                <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white">
                  <path d="M12 15.2A3.2 3.2 0 0 1 8.8 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 15.2 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 15.2 12 3.2 3.2 0 0 1 12 15.2M18.2 4H16.4L14.8 2H9.2L7.6 4H5.8C4.8 4 4 4.8 4 5.8v12.4C4 19.2 4.8 20 5.8 20h12.4c1 0 1.8-.8 1.8-1.8V5.8C20 4.8 19.2 4 18.2 4z" />
                </svg>
              </div>
            )}
          </div>

          {/* Verification Badge */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-emerald-700 border-2 border-navy w-5 h-5 rounded-full flex items-center justify-center shadow">
            <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
          </div>
        </div>

        {/* Info Column */}
        <div className="flex-1 text-right min-w-0">
          <div className="text-white text-base font-bold leading-tight mb-2 line-clamp-2">
            {student.fullName}
          </div>

          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-gold2 flex-shrink-0 opacity-80">
              <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
            </svg>
            <span className="text-xs text-white/90 font-bold font-tajawal truncate">
              {student.college}
            </span>
          </div>

          {/* Academic Level Badge */}
          <div className="mb-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[rgba(232,184,75,0.18)] border border-[rgba(232,184,75,0.4)] text-[#f3cf7a] text-[11px] font-bold font-tajawal">
              <span>🎓</span>
              <span>{levelInfo.name}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 mb-1.5" dir="ltr">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-gold2 flex-shrink-0 opacity-80">
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
            <span className="text-[11px] text-white/80 font-mono truncate">
              {student.email || (student.studentId ? `${student.studentId}@bua.edu.eg` : '–')}
            </span>
          </div>

          <div className="flex items-center gap-1.5" dir="ltr">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-gold2 flex-shrink-0 opacity-80">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
            <span className="text-[11px] text-white/80 font-mono">
              {student.mobile || '–'}
            </span>
          </div>
        </div>
      </div>

      {/* Monospace Student ID Strip */}
      <div className="id-strip-box">
        <div className="text-right">
          <div className="text-[11px] text-white/40 tracking-wide font-tajawal">
            رقم الطالب الجامعي
          </div>
          <div className="id-number-val">
            {student.studentId}
          </div>
        </div>

        {/* Barcode Lines */}
        <div className="flex items-center gap-[2px] opacity-75">
          {barcodeHeights.map((h, i) => (
            <span
              key={i}
              className="inline-block w-[2px] bg-[rgba(232,184,75,0.55)] rounded-sm"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      </div>

      {/* Card Validity Footer */}
      <div className="p-[14px_24px_18px] flex items-center justify-between relative z-10">
        <span className="text-[11px] text-white/50 font-tajawal">
          صالح للعام الجامعي: <strong className="text-gold2 font-bold font-mono">2025 / 2026</strong> · <span className="text-white/85 font-semibold">{levelInfo.name}</span>
        </span>
        <svg viewBox="0 0 24 24" className="w-7 h-7 fill-gold2 opacity-20">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
        </svg>
      </div>

      {/* Card Bottom Actions Row */}
      <div className="no-print flex justify-between items-center px-6 pb-4 pt-0 gap-2 relative z-10 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit ? (
            <button
              type="button"
              onClick={onOpenQuickUpload}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[rgba(232,184,75,.4)] bg-[rgba(232,184,75,.15)] text-white text-xs font-bold hover:bg-[rgba(232,184,75,.25)] transition cursor-pointer font-cairo"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-gold2">
                <path d="M12 15.2A3.2 3.2 0 0 1 8.8 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 15.2 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 15.2 12 3.2 3.2 0 0 1 12 15.2M18.2 4H16.4L14.8 2H9.2L7.6 4H5.8C4.8 4 4 4.8 4 5.8v12.4C4 19.2 4.8 20 5.8 20h12.4c1 0 1.8-.8 1.8-1.8V5.8C20 4.8 19.2 4 18.2 4z" />
              </svg>
              <span>رفع / تغيير صورتك</span>
            </button>
          ) : (
            <a
              href={getLinkedInShareUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-[#0a66c2] hover:bg-[#0859a8] text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow transition cursor-pointer font-cairo"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-white">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.64c-.92 0-1.67.75-1.67 1.67s.75 1.67 1.67 1.67 1.67-.75 1.67-1.67-.75-1.67-1.67-1.67z" />
              </svg>
              <span>مشاركة على LinkedIn</span>
            </a>
          )}
        </div>

        {isLoggedIn ? (
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[rgba(232,184,75,.4)] bg-[rgba(232,184,75,.14)] text-white text-xs font-bold hover:bg-[rgba(232,184,75,.28)] transition cursor-pointer font-cairo"
          >
            تسجيل خروج
          </button>
        ) : (
          <a
            href="/login"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[rgba(232,184,75,.4)] bg-[rgba(232,184,75,.14)] text-white text-xs font-bold hover:bg-[rgba(232,184,75,.28)] transition cursor-pointer font-cairo text-decoration-none"
          >
            تسجيل الدخول
          </a>
        )}
      </div>
    </div>
  );
};
