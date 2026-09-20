import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(4);

  // Convert Arabic numerals to English numerals
  const toEngDigits = (str: string) => {
    return (str || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
  };

  useEffect(() => {
    if (successMsg) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            navigate('/login');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [successMsg, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanPassword = toEngDigits(password.trim());
    const cleanConfirm = toEngDigits(confirmPassword.trim());

    if (!token) {
      setErrorMsg('رمز استعادة كلمة المرور غير صالح أو مفقود.');
      return;
    }

    if (cleanPassword.length < 8) {
      setErrorMsg('يجب ألا تقل كلمة المرور عن 8 أحرف أو أرقام.');
      return;
    }

    if (cleanPassword !== cleanConfirm) {
      setErrorMsg('كلمة المرور وتأكيدها غير متطابقين.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/auth/reset-password', {
        token: token.trim(),
        password: cleanPassword,
        confirmPassword: cleanConfirm
      });

      if (res.data?.success) {
        setSuccessMsg(res.data.message || 'تم إعادة تعيين كلمة المرور بنجاح!');
      } else {
        setErrorMsg(res.data?.message || 'تعذر إعادة تعيين كلمة المرور. قد يكون الرابط منتهي الصلاحية.');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'حدث خطأ أثناء معالجة الطلب، يرجى المحاولة لاحقاً أو طلب رابط جديد.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
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
          background: 'radial-gradient(ellipse at 50% 30%, rgba(232,184,75,.09) 0%, transparent 60%)'
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
            className="p-[32px_28px_26px] text-center relative"
            style={{ background: 'linear-gradient(135deg, #0d1f3c 0%, #152e59 100%)' }}
          >
            <div className="w-[64px] h-[64px] bg-[rgba(232,184,75,.15)] border-2 border-[rgba(232,184,75,.4)] rounded-[20px] inline-flex items-center justify-center mb-3.5 shadow-[0_8px_24px_rgba(232,184,75,.2)]">
              <svg viewBox="0 0 24 24" className="w-8 h-8 fill-gold2">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
              </svg>
            </div>
            <h1 className="text-white text-[1.35rem] font-black tracking-tight m-0">
              إعادة تعيين كلمة المرور
            </h1>
            <p className="text-white/65 text-[0.82rem] mt-1.5 font-tajawal m-0">
              جامعة بدر بأسيوط – بوابة القيد الجامعي
            </p>
          </div>

          {/* Card Body */}
          <div className="p-7">
            {/* Missing Token Alert */}
            {!token && (
              <div className="text-center py-4">
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-xs font-tajawal leading-relaxed mb-5">
                  ⚠️ رابط استعادة كلمة المرور غير صالح أو مفقود. يرجى طلب رابط جديد من شاشة تسجيل الدخول.
                </div>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center p-3 px-6 rounded-xl font-bold text-sm bg-navy text-gold2 hover:bg-[#152e59] transition"
                >
                  العودة لتسجيل الدخول
                </Link>
              </div>
            )}

            {/* Success State */}
            {successMsg && (
              <div className="text-center py-3">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
                  ✓
                </div>
                <h3 className="text-base font-bold text-navy mb-2">تم بنجاح!</h3>
                <p className="text-xs text-slate-600 font-tajawal mb-5 leading-relaxed">
                  {successMsg}
                </p>
                <div className="text-xs text-slate-400 font-tajawal mb-4">
                  سيتم توجيهك تلقائياً إلى صفحة تسجيل الدخول خلال {countdown} ثوانٍ...
                </div>
                <Link
                  to="/login"
                  className="w-full p-3.5 rounded-xl font-bold text-sm text-navy flex items-center justify-center gap-2 shadow-lg transition"
                  style={{ background: 'linear-gradient(135deg, #c8941a, #e8b84b)' }}
                >
                  الانتقال لتسجيل الدخول الآن ←
                </Link>
              </div>
            )}

            {/* Form */}
            {token && !successMsg && (
              <>
                {errorMsg && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs mb-5 flex items-start gap-2.5 leading-relaxed font-tajawal">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current flex-shrink-0 mt-0.5">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                    </svg>
                    <div>{errorMsg}</div>
                  </div>
                )}

                <p className="text-xs text-slate-500 font-tajawal mb-4 text-right">
                  أدخل كلمة المرور الجديدة وتأكيدها للمتابعة:
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Field 1: New Password */}
                  <div>
                    <label className="text-[0.88rem] font-bold text-navy block mb-1.5 text-right">
                      كلمة المرور الجديدة
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => { setPassword(toEngDigits(e.target.value)); setErrorMsg(null); }}
                        required
                        autoFocus
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

                  {/* Field 2: Confirm Password */}
                  <div>
                    <label className="text-[0.88rem] font-bold text-navy block mb-1.5 text-right">
                      تأكيد كلمة المرور الجديدة
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(toEngDigits(e.target.value)); setErrorMsg(null); }}
                        required
                        placeholder="••••••••••••"
                        className="w-full p-[12px_14px_12px_42px] border-[1.5px] border-[#dce3ef] rounded-xl font-cairo text-sm text-navy bg-[#fbfcfe] outline-none transition focus:border-gold2 focus:shadow-[0_0_0_3px_rgba(200,148,26,.15)] focus:bg-white text-right"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-navy p-1 text-xs cursor-pointer border-0 bg-transparent"
                        title={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      >
                        {showConfirmPassword ? '🔒' : '👁'}
                      </button>
                    </div>
                  </div>

                  {/* Password Match Indicator */}
                  {password && confirmPassword && (
                    <div className={`text-xs font-tajawal flex items-center gap-1.5 ${password === confirmPassword ? 'text-emerald-600' : 'text-amber-600'}`}>
                      <span>{password === confirmPassword ? '✓ كلمتا المرور متطابقتان' : '⚠️ كلمتا المرور غير متطابقتين بعد'}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full p-3.5 rounded-xl font-bold text-[0.98rem] font-cairo cursor-pointer transition shadow-lg text-navy disabled:opacity-60 flex items-center justify-center gap-2 mt-5 hover:opacity-95 hover:-translate-y-0.5 active:translate-y-0"
                    style={{ background: 'linear-gradient(135deg, #c8941a, #e8b84b)' }}
                  >
                    {loading ? (
                      <span>جارٍ الحفظ وتحديث الحساب…</span>
                    ) : (
                      <>
                        <span>حفظ كلمة المرور الجديدة</span>
                        <span>←</span>
                      </>
                    )}
                  </button>

                  <div className="text-center pt-3 border-t border-slate-100 mt-4">
                    <Link
                      to="/login"
                      className="text-xs text-slate-500 hover:text-gold2 font-tajawal hover:underline"
                    >
                      العودة لتسجيل الدخول
                    </Link>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="text-white/35 text-[0.74rem] text-center mt-5 font-tajawal">
          <p>© 2026 جامعة بدر بأسيوط – كافة الحقوق محفوظة</p>
        </footer>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
