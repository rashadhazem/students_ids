import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminProfileModal: React.FC<AdminProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, updateCurrentUser } = useAuth();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setEmail(user.email || '');
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  // Password strength checks
  const hasLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasDigit = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(newPassword);

  const strengthScore = [hasLength, hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    if (!fullName.trim()) {
      setStatusMsg({ text: 'يرجى إدخال الاسم بالكامل', isError: true });
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setStatusMsg({ text: 'يرجى إدخال بريد إلكتروني صحيح', isError: true });
      return;
    }

    if (showPasswordFields) {
      if (!currentPassword) {
        setStatusMsg({ text: 'يرجى إدخال كلمة المرور الحالية لتأكيد التغيير', isError: true });
        return;
      }
      if (strengthScore < 4) {
        setStatusMsg({
          text: 'كلمة المرور يجب أن تكون قوية (8 أحرف، حرف كبير، حرف صغير، رقم، ورمز خاص)',
          isError: true,
        });
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setStatusMsg({ text: 'كلمة المرور الجديدة وتأكيدها غير متطابقين', isError: true });
        return;
      }
    }

    setLoading(true);
    try {
      const payload: any = {
        fullName: fullName.trim(),
        email: email.trim(),
      };

      if (showPasswordFields && newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
        payload.confirmNewPassword = confirmNewPassword;
      }

      const res = await apiClient.put('/auth/profile', payload);

      if (res.data?.success) {
        setStatusMsg({ text: res.data.message || 'تم تحديث بيانات الحساب بنجاح ✓', isError: false });
        if (res.data.user) {
          updateCurrentUser(res.data.user, res.data.token);
        }
        setTimeout(() => {
          onClose();
          setShowPasswordFields(false);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmNewPassword('');
          setStatusMsg(null);
        }, 1200);
      } else {
        setStatusMsg({ text: res.data?.message || 'فشل التحديث', isError: true });
      }
    } catch (err: any) {
      setStatusMsg({
        text: err.response?.data?.message || 'تعذر حفظ التغييرات. تأكد من صحة البيانات.',
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="bua-modal-bg"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bua-modal max-w-[500px]">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center text-navy font-bold text-sm">
              ⚙️
            </div>
            <h3 className="text-base font-bold text-navy m-0">تعديل بيانات الحساب والأمان</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer bg-transparent border-0"
          >
            ✕
          </button>
        </div>

        {statusMsg && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold mb-4 ${
              statusMsg.isError
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-right">
          {/* Full Name */}
          <div className="bua-field">
            <label className="text-xs font-bold text-slate-700 block mb-1">
              الاسم الكامل <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="bua-input text-xs"
              placeholder="مثال: مدير النظام"
              required
            />
          </div>

          {/* Email Address */}
          <div className="bua-field">
            <label className="text-xs font-bold text-slate-700 block mb-1">
              البريد الإلكتروني للادمن <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bua-input text-xs"
              placeholder="admin@bua.edu.eg"
              required
            />
            <span className="text-[10px] text-gray-500 mt-1 block">
              💡 يُستخدم لتسجيل الدخول واستلام الإشعارات وتفعيل الحساب.
            </span>
          </div>

          {/* College (Read-only) */}
          {user?.college && (
            <div className="bua-field">
              <label className="text-xs font-bold text-slate-700 block mb-1">الكلية التابع لها</label>
              <input
                type="text"
                value={user.college}
                disabled
                className="bua-input text-xs bg-gray-100 text-gray-600 cursor-not-allowed font-medium"
              />
            </div>
          )}

          {/* Toggle Password Change */}
          <div className="pt-2 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setShowPasswordFields(!showPasswordFields)}
              className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
            >
              <span>{showPasswordFields ? '▼ إخفاء تغيير كلمة المرور' : '◀ تغيير كلمة المرور'}</span>
              <span className="text-[11px] text-gray-400">({showPasswordFields ? 'انقر للإلغاء' : 'اختياري'})</span>
            </button>
          </div>

          {showPasswordFields && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 mt-2">
              {/* Current Password */}
              <div className="bua-field">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  كلمة المرور الحالية <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور الحالية للتأكيد"
                    className="bua-input text-xs pl-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs bg-transparent border-0 cursor-pointer"
                  >
                    {showCurrentPw ? '👁️' : '🔒'}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="bua-field">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  كلمة المرور الجديدة <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="كلمة المرور الجديدة القوية"
                    className="bua-input text-xs pl-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs bg-transparent border-0 cursor-pointer"
                  >
                    {showNewPw ? '👁️' : '🔒'}
                  </button>
                </div>

                {/* Password Strength Checklist */}
                {newPassword && (
                  <div className="mt-2 text-[10px] space-y-0.5 font-tajawal bg-white p-2 rounded-lg border border-gray-200">
                    <div className="font-bold text-gray-600 mb-1">شروط الأمان العالي:</div>
                    <div className={hasLength ? 'text-emerald-700 font-bold' : 'text-gray-400'}>
                      {hasLength ? '✓' : '○'} 8 أحرف على الأقل
                    </div>
                    <div className={hasUpper ? 'text-emerald-700 font-bold' : 'text-gray-400'}>
                      {hasUpper ? '✓' : '○'} حرف كبير بالإنجليزية (A-Z)
                    </div>
                    <div className={hasLower ? 'text-emerald-700 font-bold' : 'text-gray-400'}>
                      {hasLower ? '✓' : '○'} حرف صغير بالإنجليزية (a-z)
                    </div>
                    <div className={hasDigit ? 'text-emerald-700 font-bold' : 'text-gray-400'}>
                      {hasDigit ? '✓' : '○'} رقم على الأقل (0-9)
                    </div>
                    <div className={hasSpecial ? 'text-emerald-700 font-bold' : 'text-gray-400'}>
                      {hasSpecial ? '✓' : '○'} رمز خاص (@, #, $, %, إلخ)
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm New Password */}
              <div className="bua-field">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  تأكيد كلمة المرور الجديدة <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="أعد كتابة كلمة المرور الجديدة"
                    className="bua-input text-xs pl-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs bg-transparent border-0 cursor-pointer"
                  >
                    {showConfirmPw ? '👁️' : '🔒'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="bua-btn bua-btn-ghost bua-btn-sm text-xs cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bua-btn bua-btn-primary bua-btn-sm text-xs cursor-pointer flex items-center gap-1.5"
            >
              {loading ? (
                <span>جارٍ الحفظ…</span>
              ) : (
                <>
                  <span>حفظ التعديلات ✓</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
