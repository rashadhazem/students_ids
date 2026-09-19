import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';

export const LoginPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'student' | 'staff'>('student');

  // Student Login State (Email + National ID, NO Password!)
  const [studentEmail, setStudentEmail] = useState('');
  const [nationalId, setNationalId] = useState('');

  // Staff Login State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Forgot password modal
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<string | null>(null);

  const { login, studentLogin } = useAuth();
  const navigate = useNavigate();

  // Convert Arabic numerals to English numerals
  const toEngDigits = (str: string) => {
    return (str || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = toEngDigits(studentEmail.trim().toLowerCase());
    const cleanNid = toEngDigits(nationalId.trim());

    if (!cleanEmail) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني الجامعي المتضمن لكود الطالب');
      return;
    }
    if (!cleanNid) {
      setErrorMsg('يرجى إدخال الرقم القومي المكون من 14 رقماً');
      return;
    }

    setLoading(true);
    const res = await studentLogin({ email: cleanEmail, nationalId: cleanNid });
    setLoading(false);

    if (res.success) {
      const sid = res.user?.studentId;
      navigate(`/card${sid ? `?id=${sid}` : ''}`);
    } else {
      setErrorMsg(res.message || 'بيانات الدخول غير صحيحة، يرجى التأكد من الرقم القومي والبريد الجامعي');
    }
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanId = toEngDigits(identifier.trim());
    if (!cleanId) {
      setErrorMsg('يرجى إدخال اسم المستخدم أو البريد الإلكتروني');
      return;
    }
    if (!password) {
      setErrorMsg('يرجى إدخال كلمة المرور');
      return;
    }

    setLoading(true);
    const res = await login({ username: cleanId, password });
    setLoading(false);

    if (res.success) {
      const role = res.user?.role?.toLowerCase() || '';
      if (role === 'student' || res.user?.studentId) {
        navigate(`/card${res.user.studentId ? `?id=${res.user.studentId}` : ''}`);
      } else {
        navigate('/');
      }
    } else {
      setErrorMsg(res.message || 'بيانات الدخول غير صحيحة، يرجى المحاولة مجدداً');
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

      <div className="w-full max-w-[460px] relative z-10">
        {/* Main Card */}
        <div
          className="bg-white rounded-[24px] overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.45)] border border-white/10"
          style={{ animation: 'slideUp .4s ease-out' }}
        >
          {/* Card Top Header */}
          <div
            className="p-[30px_28px_22px] text-center relative"
            style={{ background: 'linear-gradient(135deg, #0d1f3c 0%, #152e59 100%)' }}
          >
            <div className="w-[60px] h-[60px] bg-[rgba(232,184,75,.15)] border-2 border-[rgba(232,184,75,.4)] rounded-[18px] inline-flex items-center justify-center mb-3 shadow-[0_8px_24px_rgba(232,184,75,.2)]">
              <svg viewBox="0 0 24 24" className="w-7 h-7 fill-gold2">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
              </svg>
            </div>
            <h1 className="text-white text-[1.3rem] font-black tracking-tight m-0">
              بوابة تسجيل الدخول الموحدة
            </h1>
            <p className="text-white/65 text-[0.8rem] mt-1 font-tajawal">
              جامعة بدر بأسيوط – نظام بطاقات الطلاب الذكية
            </p>

            {/* Portal Type Tabs */}
            <div className="flex bg-black/30 p-1.5 rounded-xl border border-white/10 mt-4 gap-1">
              <button
                type="button"
                onClick={() => { setActiveTab('student'); setErrorMsg(null); }}
                className={`flex-1 py-2.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
                  activeTab === 'student'
                    ? 'bg-gold2 text-navy shadow-md font-black'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span>🎓</span>
                  <span>تسجيل دخول الطلاب</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('staff'); setErrorMsg(null); }}
                className={`flex-1 py-2.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
                  activeTab === 'staff'
                    ? 'bg-white/20 text-white shadow-md font-black'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span>🛡️</span>
                  <span>المشرفين والمستخدمين</span>
                </div>
              </button>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-7">
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs mb-4 flex items-start gap-2.5 leading-relaxed">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0 mt-0.5">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                <div>{errorMsg}</div>
              </div>
            )}

            {/* STUDENT LOGIN TAB */}
            {activeTab === 'student' ? (
              <form onSubmit={handleStudentSubmit}>
                <div className="bg-amber-50 border border-amber-200/70 rounded-xl p-3 mb-4 text-[0.78rem] text-amber-900 leading-relaxed font-tajawal">
                  <strong>دخول فوري للطلاب:</strong> أدخل بريدك الإلكتروني الجامعي المتضمن كود الطالب ورقمك القومي للاعتماد ورفع صورتك الشخصية فوراً.
                </div>

                {/* University Email with Student Code */}
                <div className="mb-4">
                  <label className="text-[0.84rem] font-bold text-navy block mb-1.5 text-right">
                    البريد الإلكتروني الجامعي (المتضمن كود الطالب)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={studentEmail}
                      onChange={(e) => { setStudentEmail(toEngDigits(e.target.value)); setErrorMsg(null); }}
                      required
                      autoFocus
                      placeholder="مثال: mohammed.2023010080@bua.edu.eg"
                      className="w-full p-[12px_14px_12px_42px] border-[1.5px] border-[#dce3ef] rounded-xl font-cairo text-sm text-navy bg-[#fbfcfe] outline-none transition focus:border-gold2 focus:shadow-[0_0_0_3px_rgba(200,148,26,.15)] focus:bg-white text-right"
                      dir="ltr"
                    />
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                    </svg>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 text-right font-tajawal m-0">
                    💡 البريد الجامعي الرسمي: name.code@bua.edu.eg (يحتوي على كود الطالب)
                  </p>
                </div>

                {/* National ID (Passwordless) */}
                <div className="mb-5">
                  <label className="text-[0.84rem] font-bold text-navy block mb-1.5 text-right">
                    الرقم القومي للطالب (14 رقم)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={nationalId}
                      onChange={(e) => { setNationalId(toEngDigits(e.target.value)); setErrorMsg(null); }}
                      required
                      maxLength={14}
                      placeholder="30703212503156"
                      className="w-full p-[12px_14px_12px_42px] border-[1.5px] border-[#dce3ef] rounded-xl font-cairo text-sm text-navy bg-[#fbfcfe] outline-none transition focus:border-gold2 focus:shadow-[0_0_0_3px_rgba(200,148,26,.15)] focus:bg-white text-right"
                      dir="ltr"
                    />
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                    </svg>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 text-right font-tajawal m-0">
                    🔒 التحقق عبر الرقم القومي الرسمي المسجل بشؤون الطلاب
                  </p>
                </div>

                {/* Submit Student Login */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full p-3.5 rounded-xl font-bold text-[0.98rem] font-cairo cursor-pointer transition shadow-lg text-navy disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #c8941a, #e8b84b)' }}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z" />
                  </svg>
                  <span>{loading ? 'جارٍ التحقق من الهوية…' : 'دخول الطالب واستعراض البطاقة ←'}</span>
                </button>
              </form>
            ) : (
              /* STAFF & ADMIN LOGIN TAB */
              <form onSubmit={handleStaffSubmit}>
                <div className="bg-[#f1f5f9] border border-[#e2e8f0] rounded-xl p-2.5 mb-4 text-[0.78rem] text-[#475569] flex items-center gap-2 leading-relaxed">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-blue flex-shrink-0">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                  </svg>
                  <div>
                    <strong>بوابة الإدارة:</strong> مخصصة لمسؤولي الكليات وموظفي شؤون الطلاب بكلمة المرور.
                  </div>
                </div>

                {/* Identifier Field */}
                <div className="mb-4">
                  <label className="text-[0.84rem] font-bold text-navy block mb-1.5 text-right">
                    اسم المستخدم أو البريد الإلكتروني
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => { setIdentifier(toEngDigits(e.target.value)); setErrorMsg(null); }}
                      required
                      autoFocus
                      placeholder="superadmin أو admin@bua.edu.eg"
                      className="w-full p-[12px_14px_12px_42px] border-[1.5px] border-[#dce3ef] rounded-xl font-cairo text-sm text-navy bg-[#fbfcfe] outline-none transition focus:border-blue focus:shadow-[0_0_0_3px_rgba(26,58,107,.12)] focus:bg-white text-right"
                      dir="ltr"
                    />
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </div>
                </div>

                {/* Password Field */}
                <div className="mb-5">
                  <label className="text-[0.84rem] font-bold text-navy block mb-1.5 text-right">
                    كلمة المرور
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full p-[12px_14px_12px_42px] border-[1.5px] border-[#dce3ef] rounded-xl font-cairo text-sm text-navy bg-[#fbfcfe] outline-none transition focus:border-blue focus:shadow-[0_0_0_3px_rgba(26,58,107,.12)] focus:bg-white text-right"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-navy p-1 text-xs cursor-pointer"
                      title="إظهار / إخفاء كلمة المرور"
                    >
                      {showPassword ? '🔒' : '👁'}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full p-3.5 rounded-xl text-white font-bold text-[0.98rem] font-cairo cursor-pointer transition shadow-[0_6px_18px_rgba(13,31,60,.25)] hover:opacity-95 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #0d1f3c 0%, #1a3a6b 100%)' }}
                >
                  {loading ? 'جارٍ التحقق وتأكيد الدخول…' : 'تسجيل دخول الإدارة ←'}
                </button>

                {/* Links Row */}
                <div className="flex justify-between items-center mt-4 pt-3.5 border-t border-slate-100 flex-wrap gap-2 text-xs font-tajawal">
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="text-slate-500 hover:text-blue hover:underline cursor-pointer bg-transparent border-0 p-0"
                  >
                    نسيت كلمة المرور؟
                  </button>
                  <span className="text-slate-400">
                    بوابة شؤون الطلاب المعتمدة
                  </span>
                </div>
              </form>
            )}
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
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold mb-3">
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
