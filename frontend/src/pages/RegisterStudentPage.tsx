import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export const BUA_COLLEGES = [
  'كلية الهندسة والتكنولوجيا',
  'كلية الصيدلة وتصنيع الدواء',
  'كلية طب الفم والأسنان',
  'كلية العلاج الطبيعي',
  'كلية التمريض',
  'كلية تكنولوجيا العلوم الصحية التطبيقية',
  'كلية الإدارة والعلوم المالية والاقتصادية',
  'كلية الفنون التطبيقية',
  'كلية اللغات والترجمة',
  'كلية الذكاء الاصطناعي وإدارة البيانات',
  'كلية التكنولوجيا الحيوية',
  'كلية الطب البيطري',
  'كلية الحقوق',
];

export const BUA_YEARS = [
  'الفرقة الأولى',
  'الفرقة الثانية',
  'الفرقة الثالثة',
  'الفرقة الرابعة',
  'الفرقة الخامسة',
  'الفرقة السادسة',
];

export const RegisterStudentPage: React.FC = () => {
  const navigate = useNavigate();
  const [fullName,    setFullName]    = useState('');
  const [studentId,   setStudentId]   = useState('');
  const [nationalId,  setNationalId]  = useState('');
  const [college,     setCollege]     = useState(BUA_COLLEGES[0]);
  const [year,        setYear]        = useState(BUA_YEARS[0]);
  const [email,       setEmail]       = useState('');
  const [phone,       setPhone]       = useState('');

  const [selectedFile,   setSelectedFile]   = useState<File | null>(null);
  const [editorOpen,     setEditorOpen]     = useState(false);
  const [rotation,       setRotation]       = useState(0);
  const [flipH,          setFlipH]          = useState(false);
  const [zoom,           setZoom]           = useState(100);
  const [offset,         setOffset]         = useState({ x: 0, y: 0 });
  const [isDragging,     setIsDragging]     = useState(false);
  const [dragStart,      setDragStart]      = useState({ x: 0, y: 0, ox: 0, oy: 0 });
  const [croppedDataUrl, setCroppedDataUrl] = useState<string | null>(null);
  const [loading,        setLoading]        = useState(false);
  const [errorMsg,       setErrorMsg]       = useState<string | null>(null);
  const [successMsg,     setSuccessMsg]     = useState<string | null>(null);

  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const imageRef     = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const toEngDigits = (s: string) =>
    s.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img    = imageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2 + offset.x, canvas.height / 2 + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    if (flipH) ctx.scale(-1, 1);
    const rad   = (rotation * Math.PI) / 180;
    const sin   = Math.abs(Math.sin(rad));
    const cos   = Math.abs(Math.cos(rad));
    const bbW   = img.width * cos + img.height * sin;
    const bbH   = img.width * sin + img.height * cos;
    const scale = (zoom / 100) * Math.max(canvas.width / bbW, canvas.height / bbH);
    ctx.drawImage(img, (-img.width * scale) / 2, (-img.height * scale) / 2, img.width * scale, img.height * scale);
    ctx.restore();
    setCroppedDataUrl(canvas.toDataURL('image/jpeg', 0.9));
  };

  useEffect(() => { drawCanvas(); }, [rotation, flipH, zoom, offset]);

  const handleFileSelect = (file: File) => {
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
      setErrorMsg('يُسمح فقط بصور JPG أو PNG أو WebP'); return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setRotation(0); setFlipH(false); setZoom(100); setOffset({ x: 0, y: 0 });
        setEditorOpen(true);
        setTimeout(drawCanvas, 50);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const validateForm = (): string | null => {
    const name  = fullName.trim();
    const sid   = toEngDigits(studentId.trim());
    const nid   = toEngDigits(nationalId.trim());
    const ph    = toEngDigits(phone.trim());
    if (name.split(/\s+/).filter(Boolean).length < 4)
      return 'يجب أن يكون الاسم رباعياً على الأقل (أربعة أجزاء)';
    if (!sid)
      return 'الرقم الجامعي مطلوب';
    if (!/^\d{8,12}$/.test(sid))
      return 'الرقم الجامعي يجب أن يكون بين 8 و 12 رقماً';
    if (!nid || !/^\d{14}$/.test(nid))
      return 'الرقم القومي يجب أن يكون 14 رقماً بالضبط';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return 'البريد الإلكتروني غير صحيح';
    if (ph && !/^(010|011|012|015)\d{8}$/.test(ph))
      return 'رقم الهاتف يجب أن يبدأ بـ 010/011/012/015 ويكون 11 رقماً';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null); setSuccessMsg(null);
    const ve = validateForm();
    if (ve) { setErrorMsg(ve); return; }
    setLoading(true);
    try {
      const sid = toEngDigits(studentId.trim());
      const nid = toEngDigits(nationalId.trim());
      const ph  = toEngDigits(phone.trim());
      const fd  = new FormData();
      fd.append('studentId',  sid);
      fd.append('fullName',   fullName.trim());
      fd.append('nationalId', nid);
      fd.append('college',    college);
      fd.append('year',       year);
      if (email) fd.append('email', email.trim().toLowerCase());
      if (ph)    fd.append('phone', ph);
      if (selectedFile) {
        fd.append('photo',    selectedFile);
        fd.append('rotation', rotation.toString());
        fd.append('flip_h',   flipH ? '1' : '0');
        fd.append('zoom',     (zoom / 100).toString());
        fd.append('offset_x', offset.x.toString());
        fd.append('offset_y', offset.y.toString());
      }
      const res = await apiClient.post('/students', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data?.success) {
        setSuccessMsg('✓ تم تسجيل الطالب بنجاح');
        setTimeout(() => navigate(`/card?id=${sid}`), 1200);
      } else {
        setErrorMsg(res.data?.message || 'فشل تسجيل الطالب');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'تعذر تسجيل الطالب — تحقق من عدم تكرار الرقم الجامعي أو الرقم القومي');
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg sm:text-xl font-bold text-navy m-0">تسجيل طالب جديد</h1>
        <Link to="/students" className="bua-btn bua-btn-outline bua-btn-sm text-xs">← رجوع لإدارة الطلاب</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bua-card">
          <div className="bua-card-body">
            {errorMsg   && <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold text-right leading-relaxed">⚠️ {errorMsg}</div>}
            {successMsg && <div className="p-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold text-right">{successMsg}</div>}

            <form onSubmit={handleSubmit} noValidate>

              <div className="text-xs font-bold text-muted uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-100 flex items-center gap-2">
                <span className="w-1 h-3.5 bg-gold rounded-sm inline-block" /><span>البيانات الشخصية</span>
              </div>

              <div className="bua-field">
                <label>الاسم الرباعي الكامل بالعربية <span className="text-red-600">*</span></label>
                <input type="text" value={fullName}
                  onChange={(e) => { setFullName(e.target.value); setErrorMsg(null); }}
                  placeholder="مثال: أحمد محمد محمود علي" className="bua-input text-sm" required />
                <p className="text-[11px] text-slate-400 mt-1 m-0 font-tajawal">الاسم + اسم الأب + اسم الجد + اسم العائلة</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="bua-field mb-0">
                  <label>الرقم القومي <span className="text-red-600">*</span><span className="text-[11px] text-slate-400 font-normal mr-1">(14 رقم)</span></label>
                  <input type="text" value={nationalId}
                    onChange={(e) => { setNationalId(toEngDigits(e.target.value)); setErrorMsg(null); }}
                    placeholder="30703210101010" className="bua-input text-sm text-left tracking-widest"
                    dir="ltr" maxLength={14} inputMode="numeric" required />
                </div>
                <div className="bua-field mb-0">
                  <label>رقم الهاتف المحمول</label>
                  <input type="tel" value={phone}
                    onChange={(e) => { setPhone(toEngDigits(e.target.value)); setErrorMsg(null); }}
                    placeholder="01012345678" className="bua-input text-sm text-left"
                    dir="ltr" maxLength={11} inputMode="numeric" />
                </div>
              </div>

              <div className="text-xs font-bold text-muted uppercase tracking-wider mb-3 mt-5 pb-1.5 border-b border-slate-100 flex items-center gap-2">
                <span className="w-1 h-3.5 bg-gold rounded-sm inline-block" /><span>البيانات الأكاديمية</span>
              </div>

              <div className="bua-field">
                <label>الرقم الجامعي <span className="text-red-600">*</span><span className="text-[11px] text-slate-400 font-normal mr-1">(8-12 رقم)</span></label>
                <input type="text" value={studentId}
                  onChange={(e) => { setStudentId(toEngDigits(e.target.value)); setErrorMsg(null); }}
                  placeholder="2026101001" className="bua-input text-sm text-left font-mono tracking-widest"
                  dir="ltr" maxLength={12} inputMode="numeric" required />
                <p className="text-[11px] text-slate-400 mt-1 m-0 font-tajawal">مثال: 2026 + رمز الكلية + تسلسل الطالب</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="bua-field mb-0">
                  <label>الكلية <span className="text-red-600">*</span></label>
                  <select value={college} onChange={(e) => setCollege(e.target.value)} className="bua-select text-xs" required>
                    {BUA_COLLEGES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="bua-field mb-0">
                  <label>الفرقة / السنة الدراسية <span className="text-red-600">*</span></label>
                  <select value={year} onChange={(e) => setYear(e.target.value)} className="bua-select text-xs" required>
                    {BUA_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div className="text-xs font-bold text-muted uppercase tracking-wider mb-3 mt-5 pb-1.5 border-b border-slate-100 flex items-center gap-2">
                <span className="w-1 h-3.5 bg-gold rounded-sm inline-block" /><span>البريد الإلكتروني</span>
              </div>

              <div className="bua-field mb-6">
                <label>البريد الإلكتروني الجامعي</label>
                <input type="email" value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrorMsg(null); }}
                  placeholder={`${studentId || 'الرقم'}.student@bua.edu.eg`}
                  className="bua-input text-sm text-left" dir="ltr" />
                <p className="text-[11px] text-slate-400 mt-1 m-0 font-tajawal">اختياري — يُستخدم لتسجيل دخول الطالب لاحقاً</p>
              </div>

              <button type="submit" disabled={loading}
                className="bua-btn bua-btn-primary w-full text-sm font-bold shadow-md disabled:opacity-50">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>
                <span>{loading ? 'جارٍ تسجيل الطالب وحفظ الصورة…' : 'حفظ وتسجيل الطالب'}</span>
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-5">
          <div className="bua-card">
            <div className="bua-card-header bg-[#fafbfd]">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-gold">
                <path d="M12 15.2A3.2 3.2 0 0 1 8.8 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 15.2 12 3.2 3.2 0 0 1 12 15.2M18.2 4H16.4L14.8 2H9.2L7.6 4H5.8C4.8 4 4 4.8 4 5.8v12.4C4 19.2 4.8 20 5.8 20h12.4c1 0 1.8-.8 1.8-1.8V5.8C20 4.8 19.2 4 18.2 4z" />
              </svg>
              <h2>الصورة الشخصية (4:5)</h2>
            </div>
            <div className="bua-card-body text-center">
              <div onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
                className="border-2 border-dashed border-[#c8d4e8] hover:border-blue rounded-xl p-5 text-center cursor-pointer transition bg-[#fafbfd] hover:bg-[#f0f4ff]">
                <span className="text-3xl block mb-2">📷</span>
                <p className="text-xs text-muted font-tajawal m-0"><strong className="text-blue">اختر أو اسحب صورة الطالب</strong></p>
                <p className="text-[10px] text-muted/70 mt-1 font-tajawal m-0">JPG / PNG / WebP · النسبة المثالية 4:5</p>
                <input type="file" ref={fileInputRef} accept=".jpg,.jpeg,.png,.webp" className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
              </div>

              {editorOpen && (
                <div className="mt-4">
                  <div className="w-[180px] aspect-[4/5] mx-auto rounded-xl overflow-hidden border-2 border-gold2/50 shadow-md bg-navy relative cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => { setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }); }}
                    onMouseMove={(e) => { if (!isDragging) return; setOffset({ x: dragStart.ox + (e.clientX - dragStart.x), y: dragStart.oy + (e.clientY - dragStart.y) }); }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}>
                    <canvas ref={canvasRef} width={180} height={225} className="w-full h-full block" />
                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-black/60 text-white/70 text-[9px] px-2 py-0.5 rounded-full font-tajawal pointer-events-none">اسحب للضبط</div>
                  </div>
                  <div className="flex gap-1 flex-wrap mt-3 justify-center">
                    <button type="button" onClick={() => setRotation(r => (r - 90) % 360)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-tajawal cursor-pointer">↺ يسار</button>
                    <button type="button" onClick={() => setRotation(r => (r + 90) % 360)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-tajawal cursor-pointer">↻ يمين</button>
                    <button type="button" onClick={() => setFlipH(v => !v)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-tajawal cursor-pointer">⇄ انعكاس</button>
                    <button type="button" onClick={() => { setRotation(0); setFlipH(false); setZoom(100); setOffset({ x: 0, y: 0 }); }}
                      className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-tajawal cursor-pointer">إعادة</button>
                  </div>
                  <div className="flex items-center gap-2 mt-2.5 px-2">
                    <span className="text-xs text-muted">−</span>
                    <input type="range" min={50} max={250} value={zoom} onChange={(e) => setZoom(parseInt(e.target.value))}
                      className="flex-1 accent-gold2 h-1 cursor-pointer" />
                    <span className="text-xs text-muted">+</span>
                    <span className="text-[10px] font-mono text-muted w-8">{zoom}%</span>
                  </div>
                </div>
              )}
              {!editorOpen && <p className="text-[11px] text-slate-400 mt-3 font-tajawal">الصورة اختيارية — يمكن رفعها لاحقاً</p>}
            </div>
          </div>

          <div className="rounded-2xl p-4 text-white relative overflow-hidden shadow-lg border border-white/10"
            style={{ background: 'linear-gradient(155deg, var(--navy) 0%, var(--blue) 100%)' }}>
            <div className="h-1 bg-gradient-to-r from-gold via-gold2 to-gold absolute top-0 left-0 right-0" />
            <p className="text-[10px] text-white/40 text-center font-tajawal mb-3 mt-1">معاينة مبدئية للبطاقة</p>
            <div className="flex items-center gap-3">
              <div className="w-16 h-20 rounded-lg overflow-hidden border-2 border-[rgba(232,184,75,0.4)] bg-navy flex-shrink-0">
                {croppedDataUrl
                  ? <img src={croppedDataUrl} alt="معاينة" className="w-full h-full object-cover object-top" />
                  : <div className="w-full h-full flex items-center justify-center text-white/20 text-2xl">👤</div>}
              </div>
              <div className="text-right flex-1 min-w-0">
                <div className="font-bold text-white text-xs leading-tight">{fullName || <span className="text-white/30 font-normal text-[11px]">الاسم الرباعي</span>}</div>
                <div className="text-[11px] text-gold2/80 font-tajawal mt-1 truncate">{college}</div>
                <div className="text-[10px] text-white/50 font-tajawal">{year}</div>
                <div className="font-mono text-gold2 text-xs font-bold mt-1.5 tracking-wider" dir="ltr">{studentId || '—'}</div>
                {nationalId && <div className="font-mono text-white/40 text-[10px] mt-0.5" dir="ltr">{nationalId}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};