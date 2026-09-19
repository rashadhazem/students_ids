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
}

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

  const displayYear = student.academicYear || student.year || '2024';

  const getLinkedInShareUrl = () => {
    const shareText = encodeURIComponent(
      `أنا مسجل رسمياً في جامعة بدر بأسيوط – ${student.college}! 🎓✨\nرقم الطالب: ${student.studentId}`
    );
    const shareUrl = encodeURIComponent(window.location.href);
    return `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}&summary=${shareText}`;
  };

  return (
    <div className="bua-id-card">
      {/* Decorative Gold Rings */}
      <div className="id-card-ring" />
      <div className="id-card-ring-sm" />

      {/* Front Card Header */}
      <div className="p-[20px_24px_16px] flex items-center justify-between border-b border-white/10 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-[42px] h-[42px] bg-[rgba(232,184,75,0.18)] border border-[rgba(232,184,75,0.4)] rounded-xl flex items-center justify-center shadow-[0_4px_12px_rgba(232,184,75,0.15)]">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-gold2">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
            </svg>
          </div>
          <div className="text-right">
            <div className="text-white text-xs font-bold font-cairo leading-tight">
              جامعة بدر بأسيوط
            </div>
            <div className="text-white/40 text-[10px] tracking-wider font-tajawal">
              BADR UNIVERSITY IN ASSIUT
            </div>
          </div>
        </div>

        <span className="text-[10px] font-bold text-gold2 bg-[rgba(232,184,75,0.12)] border border-[rgba(232,184,75,0.3)] px-2.5 py-1 rounded-full tracking-wider font-cairo">
          بطاقة جامعية ذكية
        </span>
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
              src={student.imagePath ? `${API_BASE_URL}/${student.imagePath}` : `${API_BASE_URL}/api/photos/placeholder`}
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
          <div className="text-white text-base font-bold leading-tight mb-2.5 line-clamp-2">
            {student.fullName}
          </div>

          <div className="flex items-center gap-1.5 mb-1.5">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-gold2 flex-shrink-0 opacity-80">
              <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
            </svg>
            <span className="text-xs text-white/70 font-tajawal truncate">
              {student.college}
            </span>
          </div>

          {student.section && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-gold2 flex-shrink-0 opacity-80">
                <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z" />
              </svg>
              <span className="text-xs text-white/70 font-tajawal truncate">
                القسم: {student.section}
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 mb-1.5">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-gold2 flex-shrink-0 opacity-80">
              <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z" />
            </svg>
            <span className="text-xs text-white/70 font-tajawal">
              سنة التسجيل: {student.year || '2024'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-gold2 flex-shrink-0 opacity-80">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm4.24 16L12 15.45 7.77 18l1.12-4.81-3.73-3.23 4.92-.42L12 5l1.92 4.53 4.92.42-3.73 3.23L16.23 18z" />
            </svg>
            <span className="text-xs text-white/70 font-tajawal">
              عضو مسجل رسمياً
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
        <span className="text-[11px] text-white/40 font-tajawal">
          صالح للعام الدراسي <strong className="text-white/70 font-bold">{displayYear} / 2025</strong>
        </span>
        <svg viewBox="0 0 24 24" className="w-7 h-7 fill-gold2 opacity-20">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
        </svg>
      </div>

      {/* Card Bottom Actions Row */}
      <div className="flex justify-between items-center px-6 pb-4 pt-0 gap-2 relative z-10 flex-wrap">
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
