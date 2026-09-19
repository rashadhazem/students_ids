import React, { useState } from 'react';
import { apiClient } from '../api/client';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ isOpen, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!currentPassword) {
      setStatusMsg({ text: 'يرجى إدخال كلمة المرور الحالية', isError: true });
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setStatusMsg({ text: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل', isError: true });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatusMsg({ text: 'كلمتا المرور الجديدتان غير متطابقتين', isError: true });
      return;
    }
    if (currentPassword === newPassword) {
      setStatusMsg({ text: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية', isError: true });
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword
      });

      if (res.data?.success) {
        setStatusMsg({ text: res.data.message || 'تم حفظ التغيير بنجاح ✓', isError: false });
        setTimeout(() => {
          onClose();
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setStatusMsg(null);
        }, 1500);
      } else {
        setStatusMsg({ text: res.data?.message || 'فشل تغيير كلمة المرور', isError: true });
      }
    } catch (err: any) {
      setStatusMsg({
        text: err.response?.data?.message || 'تعذر الاتصال بالخادم. تأكد من كلمة المرور الحالية.',
        isError: true
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bua-modal-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bua-modal">
        <h3 className="text-base font-bold text-navy mb-3">تغيير كلمة المرور</h3>

        {statusMsg && (
          <div
            className={`p-2.5 rounded-lg text-xs font-semibold mb-3 ${
              statusMsg.isError
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Current Password */}
          <div className="bua-field">
            <label>
              كلمة المرور الحالية <span className="text-red-600">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="كلمة المرور الحالية"
                className="bua-input pl-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute left-2.5 text-xs text-slate-500 hover:text-navy cursor-pointer"
                title="إظهار/إخفاء"
              >
                {showCurrent ? '🔒' : '👁'}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="bua-field">
            <label>
              كلمة المرور الجديدة <span className="text-red-600">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="8 أحرف على الأقل"
                className="bua-input pl-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute left-2.5 text-xs text-slate-500 hover:text-navy cursor-pointer"
                title="إظهار/إخفاء"
              >
                {showNew ? '🔒' : '👁'}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="bua-field">
            <label>
              تأكيد كلمة المرور الجديدة <span className="text-red-600">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="أعد كتابة كلمة المرور الجديدة"
                className="bua-input pl-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute left-2.5 text-xs text-slate-500 hover:text-navy cursor-pointer"
                title="إظهار/إخفاء"
              >
                {showConfirm ? '🔒' : '👁'}
              </button>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex gap-2 mt-5">
            <button
              type="button"
              onClick={onClose}
              className="bua-btn bua-btn-outline flex-1 text-xs"
              disabled={loading}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="bua-btn bua-btn-primary flex-1 text-xs"
              disabled={loading}
            >
              {loading ? 'جارٍ الحفظ…' : 'حفظ التغيير'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
