import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Forgot password modal
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<string | null>(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Convert Arabic numerals to English numerals
  const toEngDigits = (str: string) => {
    return (str || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = toEngDigits(email.trim().toLowerCase());
    const cleanPassword = toEngDigits(password.trim());

    if (!cleanEmail) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني');
      return;
    }
    if (!cleanPassword) {
      setErrorMsg('يرجى إدخال كلمة المرور');
      return;
    }

    setLoading(true);
    const res = await login({ username: cleanEmail, password: cleanPassword });
    setLoading(false);

    if (res.success) {
      const role = res.user?.role?.toLowerCase() || '';
      if (role === 'student' || res.user?.studentId) {
        navigate(`/card${res.user.studentId ? `?id=${res.user.studentId}` : ''}`);
      } else {
        navigate('/');
      }
    } else {
      setErrorMsg(res.message || 'البريد الإلكتروني أو كلمة المرور غير صحيحة، يرجى المحاولة مجدداً');
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;

    try {
      await apiClient.post('/auth/forgot-password', { email: forgotEmail });
      setForgotStatus('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح.');
    } catch {
      setForgotStatus('إذا كان البريد مسجلاً بالمنظومة، فسيتم إرسال رابط الاستعادة.');
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative"
      style={{
        background: 'linear-gradient(135deg, #071428 0%, #0d1f3c 45%, #1a3a6b 100%)',
        fontFamily: "'Cairo', sans-serif"
      }}
    >
      {/* Background Radial Glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 40%, rgba(232,184,75,.09) 0%, transparent 60%)'
        }}
      />

      <div className="w-full max-w-[440px] relative z-10">
        {/* Main Card */}
        <div
          className="bg-white rounded-[24px] overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.45)] border border-white/10"
          style={{ animation: 'slideUp .4s ease-out' }}
        >
          {/* Card Top Header */}
          <div
            className="p-[32px_28px_26px] text-center relative"
            style={{ background: 'linear-gradient(135deg, #0d1f3c 0%, #152e59 100%)' }}
          >
            <div className="w-[64px] h-[64px] bg-[rgba(232,184,75,.15)] border-2 border-[rgba(232,184,75,.4)] rounded-[20px] inline-flex items-center justify-center mb-3.5 shadow-[0_8px_24px_rgba(232,184,75,.2)]">
              <svg viewBox="0 0 24 24" className="w-8 h-8 fill-gold2">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
              </svg>
            </div>
            <h1 className="text-white text-[1.35rem] font-black tracking-tight m-0">
              تسجيل الدخول
            </h1>
            <p className="text-white/65 text-[0.82rem] mt-1.5 font-tajawal m-0">
              جامعة بدر بأسيوط – منظومة بطاقات الطلاب الرقمية
            </p>
          </div>

          {/* Form Content */}
          <div className="p-7">
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs mb-5 flex items-start gap-2.5 leading-relaxed">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0 mt-0.5">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                <div className="font-tajawal">{errorMsg}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Field 1: البريد الإلكتروني */}
              <div>
                <label className="text-[0.88rem] font-bold text-navy block mb-1.5 text-right">
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => { setEmail(toEngDigits(e.target.value)); setErrorMsg(null); }}
                    required
                    autoFocus
                    placeholder="example@bua.edu.eg"
                    className="w-full p-[12px_14px_12px_42px] border-[1.5px] border-[#dce3ef] rounded-xl font-cairo text-sm text-navy bg-[#fbfcfe] outline-none transition focus:border-gold2 focus:shadow-[0_0_0_3px_rgba(200,148,26,.15)] focus:bg-white text-right"
                    dir="ltr"
                  />
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                  </svg>
                </div>
              </div>

              {/* Field 2: كلمة المرور */}
              <div>
                <label className="text-[0.88rem] font-bold text-navy block mb-1.5 text-right">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(toEngDigits(e.target.value)); setErrorMsg(null); }}
                    required
                    placeholder="••••••••••••"
                    className="w-full p-[12px_14px_12px_42px] border-[1.5px] border-[#dce3ef] rounded-xl font-cairo text-sm text-navy bg-[#fbfcfe] outline-none transition focus:border-gold2 focus:shadow-[0_0_0_3px_rgba(200,148,26,.15)] focus:bg-white text-right"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-navy p-1 text-xs cursor-pointer border-0 bg-transparent"
                    title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? '🔒' : '👁'}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full p-3.5 rounded-xl font-bold text-[0.98rem] font-cairo cursor-pointer transition shadow-lg text-navy disabled:opacity-60 flex items-center justify-center gap-2 mt-5 hover:opacity-95 hover:-translate-y-0.5 active:translate-y-0"
                style={{ background: 'linear-gradient(135deg, #c8941a, #e8b84b)' }}
              >
                {loading ? (
                  <span>جارٍ التحقق وتأكيد الدخول…</span>
                ) : (
                  <>
                    <span>تسجيل الدخول</span>
                    <span>←</span>
                  </>
                )}
              </button>

              {/* Links Row */}
              <div className="flex justify-between items-center pt-3 border-t border-slate-100 flex-wrap gap-2 text-xs font-tajawal mt-3">
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-slate-500 hover:text-gold2 hover:underline cursor-pointer bg-transparent border-0 p-0"
                >
                  نسيت كلمة المرور؟
                </button>
                <span className="text-slate-400">
                  بوابة معتمدة للطلاب والإدارة
                </span>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-white/35 text-[0.74rem] text-center mt-5 font-tajawal">
          <p>© 2026 جامعة بدر بأسيوط – كافة الحقوق محفوظة</p>
        </footer>
      </div>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div className="bua-modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setShowForgot(false); }}>
          <div className="bua-modal">
            <h3 className="text-base font-bold text-navy mb-2">استعادة كلمة المرور</h3>
            <p className="text-xs text-muted font-tajawal mb-4">
              أدخل بريدك الإلكتروني الجامعي المسجل لإرسال رابط تعيين كلمة المرور
            </p>

            {forgotStatus && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold mb-3 font-tajawal">
                {forgotStatus}
              </div>
            )}

            <form onSubmit={handleForgotSubmit}>
              <div className="bua-field">
                <label>البريد الإلكتروني</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@bua.edu.eg"
                  className="bua-input text-left"
                  dir="ltr"
                  required
                />
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="bua-btn bua-btn-outline flex-1 text-xs"
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  className="bua-btn bua-btn-primary flex-1 text-xs"
                >
                  إرسال الرابط
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
