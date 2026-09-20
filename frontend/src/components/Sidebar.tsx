import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChangePasswordModal } from './ChangePasswordModal';
import { AdminProfileModal } from './AdminProfileModal';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showChangePw, setShowChangePw] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const role = user?.role?.toLowerCase() || '';

  const getRoleBadge = (r: string) => {
    if (r === 'superadmin') return 'المدير العام';
    if (r === 'admin') return 'مشرف كلية';
    if (r === 'staff' || r === 'officer') return 'موظف شئون طلاب';
    if (r === 'student') return 'طالب';
    return r;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
        />
      )}

      <aside
        className={`bua-sidebar transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="sb-brand">
          <div className="logo">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-gold2">
              <path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
            </svg>
          </div>
          <h2>نظام تسجيل الطلاب</h2>
          <p>جامعة بدر بأسيوط</p>
        </div>

        {/* Navigation Menu */}
        <nav className="sb-nav">
          <div className="sb-section">القائمة</div>

          {/* Dashboard */}
          <NavLink
            to="/"
            end
            onClick={onClose}
            className={({ isActive }) => `sb-link ${isActive ? 'active' : ''}`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0">
              <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
            </svg>
            <span>الرئيسية</span>
          </NavLink>

          {/* Register Student */}
          {['superadmin', 'admin', 'staff', 'officer'].includes(role) && (
            <NavLink
              to="/students/new"
              onClick={onClose}
              className={({ isActive }) => `sb-link ${isActive ? 'active' : ''}`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0">
                <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
              <span>تسجيل طالب</span>
            </NavLink>
          )}

          {/* Students Management */}
          {['superadmin', 'admin', 'staff', 'officer'].includes(role) && (
            <NavLink
              to="/students"
              onClick={onClose}
              className={({ isActive }) => `sb-link ${isActive ? 'active' : ''}`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
              <span>إدارة الطلاب</span>
            </NavLink>
          )}

          {/* Export Excel */}
          {['superadmin', 'admin', 'staff', 'officer'].includes(role) && (
            <NavLink
              to="/export"
              onClick={onClose}
              className={({ isActive }) => `sb-link ${isActive ? 'active' : ''}`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
              <span>تصدير Excel</span>
            </NavLink>
          )}

          {/* Bulk Import */}
          {['superadmin', 'staff', 'officer'].includes(role) && (
            <NavLink
              to="/bulk-import"
              onClick={onClose}
              className={({ isActive }) => `sb-link ${isActive ? 'active' : ''}`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0">
                <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
              </svg>
              <span>رفع ملف Excel</span>
            </NavLink>
          )}

          {/* Admin sections */}
          {['superadmin', 'admin'].includes(role) && (
            <>
              <div className="sb-section">
                {role === 'admin' ? 'نشاطات الكلية' : 'إدارة النظام'}
              </div>

              {role === 'superadmin' && (
                <NavLink
                  to="/users"
                  onClick={onClose}
                  className={({ isActive }) => `sb-link ${isActive ? 'active' : ''}`}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  <span>إدارة المشرفين</span>
                </NavLink>
              )}

              <NavLink
                to="/audit"
                onClick={onClose}
                className={({ isActive }) => `sb-link ${isActive ? 'active' : ''}`}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0">
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                </svg>
                <span>{role === 'admin' ? 'سجل عمليات طلاب الكلية' : 'سجل العمليات'}</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Footer User Profile & Actions */}
        <div className="sb-footer">
          {user && (
            <div className="sb-user">
              <div className="sb-avatar">
                {user.fullName ? user.fullName[0] : (user.userName ? user.userName[0] : 'U')}
              </div>
              <div className="sb-user-info min-w-0">
                <span className="text-white text-xs font-semibold truncate block">
                  {user.fullName || user.userName}
                </span>
                <small className="text-white/40 text-[10px] font-tajawal truncate block">
                  {user.email || user.studentId}
                </small>
                <span className="sb-role-badge">
                  {getRoleBadge(role)}
                </span>
              </div>
            </div>
          )}

          {['superadmin', 'admin', 'staff', 'officer'].includes(role) && (
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="btn-logout mb-2 cursor-pointer"
              style={{
                background: 'rgba(232,184,75,.15)',
                color: 'var(--gold2)',
                borderColor: 'rgba(232,184,75,.35)'
              }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
              <span>تعديل حسابي والبريد</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowChangePw(true)}
            className="btn-logout mb-2 cursor-pointer"
            style={{
              background: 'rgba(232,184,75,.12)',
              color: 'var(--gold2)',
              borderColor: 'rgba(232,184,75,.25)'
            }}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
            </svg>
            <span>تغيير كلمة المرور</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="btn-logout cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Global Admin Profile & Email Modal */}
      <AdminProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />

      {/* Global Change Password Modal */}
      <ChangePasswordModal
        isOpen={showChangePw}
        onClose={() => setShowChangePw(false)}
      />
    </>
  );
};
