import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu } from 'lucide-react';

interface NavbarProps {
  onToggleSidebar?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const { user } = useAuth();
  const location = useLocation();

  const getPageTitle = (path: string) => {
    if (path === '/') return 'لوحة التحكم الرئيسية';
    if (path === '/students') return 'إدارة الطلاب';
    if (path === '/students/new') return 'تسجيل طالب جديد';
    if (path === '/bulk-import') return 'استيراد بيانات الطلاب (Excel)';
    if (path === '/export') return 'تصدير بيانات الطلاب';
    if (path === '/users') return 'إدارة المشرفين والمستخدمين';
    if (path === '/audit') return 'سجل العمليات والأمان';
    if (path.startsWith('/card')) return 'بطاقة الطالب الرقمية';
    return 'جامعة بدر بأسيوط';
  };

  return (
    <header className="bua-topbar">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:text-navy hover:bg-slate-100 transition cursor-pointer"
            title="القائمة"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-sm sm:text-base font-bold text-navy m-0">
          {getPageTitle(location.pathname)}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {user?.college && (
          <span className="college-tag hidden sm:inline-block">
            {user.college}
          </span>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs font-tajawal text-muted hidden md:inline-block">
            {user?.fullName || user?.userName}
          </span>
          <div className="w-8 h-8 rounded-full bg-[rgba(26,58,107,0.1)] text-blue font-bold text-xs flex items-center justify-center border border-[#dce3ef]">
            {user?.fullName ? user.fullName[0] : 'U'}
          </div>
        </div>
      </div>
    </header>
  );
};
