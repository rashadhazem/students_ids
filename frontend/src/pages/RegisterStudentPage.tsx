import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export const RegisterStudentPage: React.FC = () => {
  const navigate = useNavigate();

  // Form State
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [seatNumber, setSeatNumber] = useState('');
  const [college, setCollege] = useState('كلية الهندسة والتكنولوجيا');
  const [year, setYear] = useState('الفرقة الأولى');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Image Editor State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, ox: 0, oy: 0 });
  const [croppedDataUrl, setCroppedDataUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Generate suggested student ID
  useEffect(() => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setStudentId(`202400${randomSuffix}`);
  }, []);

  const collegesList = [
    'كلية الهندسة والتكنولوجيا',
    'كلية الصيدلة وتصنيع الدواء',
    'كلية طب الفم والأسنان',
    'كلية العلاج الطبيعي',
    'كلية التمريض',
    'كلية تكنولوجيا العلوم الصحية التطبيقية',
    'كلية الإدارة والعلوم المالية والاقتصادية',
    'كلية الفنون التطبيقية'
  ];

  const yearsList = ['الفرقة الأولى', 'الفرقة الثانية', 'الفرقة الثالثة', 'الفرقة الرابعة', 'الفرقة الخامسة'];

  // Canvas drawing routine
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    ctx.translate(canvas.width / 2 + offset.x, canvas.height / 2 + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    if (flipH) ctx.scale(-1, 1);

    const rad = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const bbW = img.width * cos + img.height * sin;
    const bbH = img.width * sin + img.height * cos;

    // Cover-fit
    const scale = (zoom / 100) * Math.max(canvas.width / bbW, canvas.height / bbH);
    ctx.drawImage(img, (-img.width * scale) / 2, (-img.height * scale) / 2, img.width * scale, img.height * scale);
    ctx.restore();

    setCroppedDataUrl(canvas.toDataURL('image/jpeg', 0.9));
  };

  useEffect(() => {
    drawCanvas();
  }, [rotation, flipH, zoom, offset]);

  const handleFileSelect = (file: File) => {
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|jpg)$/i) && !file.name.match(/\.(jpe?g)$/i)) {
      setErrorMsg('يُسمح فقط بصور JPG / JPEG');
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setRotation(0);
        setFlipH(false);
        setZoom(100);
        setOffset({ x: 0, y: 0 });
        setEditorOpen(true);
        setTimeout(drawCanvas, 50);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: dragStart.ox + (e.clientX - dragStart.x),
      y: dragStart.oy + (e.clientY - dragStart.y)
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !studentId.trim() || !college) {
      setErrorMsg('يرجى ملء جميع الحقول الإلزامية');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append('studentId', studentId.trim());
      formData.append('fullName', fullName.trim());
      formData.append('college', college);
      formData.append('year', year);
      if (nationalId) formData.append('nationalId', nationalId.trim());
      if (seatNumber) formData.append('seatNumber', seatNumber.trim());
      if (email) formData.append('email', email.trim());
      if (phone) formData.append('phone', phone.trim());

      if (selectedFile) {
        formData.append('photo', selectedFile);
        formData.append('rotation', rotation.toString());
        formData.append('flip_h', flipH ? '1' : '0');
        formData.append('zoom', (zoom / 100).toString());
        formData.append('offset_x', offset.x.toString());
        formData.append('offset_y', offset.y.toString());
      }

      const res = await apiClient.post('/students', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data?.success) {
        setSuccessMsg('تم تسجيل الطالب بنجاح وتوليد بطاقته الرقمية ✓');
        setTimeout(() => {
          navigate(`/card?id=${studentId}`);
        }, 1200);
      } else {
        setErrorMsg(res.data?.message || 'فشل تسجيل الطالب');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'تعذر تسجيل الطالب. تأكد من عدم تكرار الرقم الجامعي.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Top Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg sm:text-xl font-bold text-navy m-0">تسجيل طالب جديد</h1>
        <Link to="/students" className="bua-btn bua-btn-outline bua-btn-sm text-xs">
          ← رجوع لإدارة الطلاب
        </Link>
      </div>

      {/* 2-Column Grid (matching register.html) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (8 cols): Form Fields */}
        <div className="lg:col-span-7 bua-card">
          <div className="bua-card-body">
            {/* Suggested Student ID Preview Box */}
            <div
              className="rounded-xl p-3.5 mb-5 flex justify-between items-center text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg, var(--navy) 0%, var(--blue) 100%)' }}
            >
              <div className="text-right">
                <span className="text-xs text-white/60 block font-tajawal">الرقم الجامعي للملف</span>
                <span className="font-mono font-bold text-gold2 text-lg tracking-widest" dir="ltr">
                  {studentId || '2024001001'}
                </span>
              </div>
              <span className="text-[11px] bg-[rgba(232,184,75,0.2)] text-gold2 px-2.5 py-1 rounded-full font-semibold">
                توليد آلي
              </span>
            </div>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold text-right">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold text-right">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Section 1: Basic Information */}
              <div className="text-xs font-bold text-muted uppercase tracking-wider mb-3 pb-1 border-b border-slate-100 flex items-center gap-2">
                <span className="w-1 h-3.5 bg-gold rounded-sm inline-block" />
                <span>البيانات الأساسية</span>
              </div>

              <div className="bua-field">
                <label>
                  الاسم الكامل للطالب (رباعي بالعربية) <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="مثال: أحمد محمد محمود علي"
                  className="bua-input text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="bua-field mb-0">
                  <label>الرقم القومي (14 رقماً)</label>
                  <input
                    type="text"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    placeholder="29901010101010"
                    className="bua-input text-xs text-left"
                    dir="ltr"
                  />
                </div>
                <div className="bua-field mb-0">
                  <label>رقم الجلوس</label>
                  <input
                    type="text"
                    value={seatNumber}
                    onChange={(e) => setSeatNumber(e.target.value)}
                    placeholder="مثال: 10452"
                    className="bua-input text-xs text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Section 2: Academic Information */}
              <div className="text-xs font-bold text-muted uppercase tracking-wider mb-3 mt-5 pb-1 border-b border-slate-100 flex items-center gap-2">
                <span className="w-1 h-3.5 bg-gold rounded-sm inline-block" />
                <span>البيانات الأكاديمية</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="bua-field mb-0">
                  <label>الكلية <span className="text-red-600">*</span></label>
                  <select
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                    className="bua-select text-xs"
                    required
                  >
                    {collegesList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="bua-field mb-0">
                  <label>السنة / الفرقة <span className="text-red-600">*</span></label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="bua-select text-xs"
                    required
                  >
                    {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              {/* Section 3: Contact Details */}
              <div className="text-xs font-bold text-muted uppercase tracking-wider mb-3 mt-5 pb-1 border-b border-slate-100 flex items-center gap-2">
                <span className="w-1 h-3.5 bg-gold rounded-sm inline-block" />
                <span>بيانات التواصل</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <div className="bua-field mb-0">
                  <label>البريد الإلكتروني الجامعي</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@bua.edu.eg"
                    className="bua-input text-xs text-left"
                    dir="ltr"
                  />
                </div>
                <div className="bua-field mb-0">
                  <label>رقم الهاتف المحمول</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01012345678"
                    className="bua-input text-xs text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="bua-btn bua-btn-primary w-full text-sm font-bold shadow-md disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
                <span>{loading ? 'جارٍ تسجيل الطالب وحفظ الصورة…' : 'حفظ وتسجيل الطالب'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Live Image Editor & Card Preview */}
        <div className="lg:col-span-5 space-y-5">
          {/* Photo Cropper Card */}
          <div className="bua-card">
            <div className="bua-card-header bg-[#fafbfd]">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-gold">
                <path d="M12 15.2A3.2 3.2 0 0 1 8.8 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 15.2 12 3.2 3.2 0 0 1 12 15.2M18.2 4H16.4L14.8 2H9.2L7.6 4H5.8C4.8 4 4 4.8 4 5.8v12.4C4 19.2 4.8 20 5.8 20h12.4c1 0 1.8-.8 1.8-1.8V5.8C20 4.8 19.2 4 18.2 4z" />
              </svg>
              <h2>الصورة الشخصية للطالب (4:5)</h2>
            </div>
            <div className="bua-card-body text-center">
              {/* Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#c8d4e8] hover:border-blue rounded-xl p-5 text-center cursor-pointer transition bg-[#fafbfd] hover:bg-[#f0f4ff]"
              >
                <span className="text-2xl block mb-1">📷</span>
                <p className="text-xs text-muted font-tajawal m-0">
                  <strong className="text-blue">اختر أو اسحب صورة الطالب</strong>
                </p>
                <p className="text-[10px] text-muted/70 mt-1 font-tajawal m-0">
                  JPG فقط · مقاس 4:5 للبطاقة الجامعية
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                  }}
                />
              </div>

              {/* Canvas Editor */}
              {editorOpen && (
                <div className="mt-4">
                  <div
                    className="w-[180px] aspect-[4/5] mx-auto rounded-xl overflow-hidden border-2 border-gold2/50 shadow-md bg-navy relative cursor-grab active:cursor-grabbing"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                  >
                    <canvas
                      ref={canvasRef}
                      width={180}
                      height={225}
                      className="w-full h-full block"
                    />
                    <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-black/60 text-white/70 text-[9px] px-2 py-0.5 rounded-full font-tajawal whitespace-nowrap pointer-events-none">
                      اسحب للضبط
                    </div>
                  </div>

                  {/* Tools */}
                  <div className="flex gap-1 flex-wrap mt-2.5 justify-center">
                    <button
                      type="button"
                      onClick={() => setRotation(r => (r - 90) % 360)}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-tajawal cursor-pointer"
                    >
                      90° يسار
                    </button>
                    <button
                      type="button"
                      onClick={() => setRotation(r => (r + 90) % 360)}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-tajawal cursor-pointer"
                    >
                      90° يمين
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlipH(!flipH)}
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-tajawal cursor-pointer"
                    >
                      انعكاس
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRotation(0);
                        setFlipH(false);
                        setZoom(100);
                        setOffset({ x: 0, y: 0 });
                      }}
                      className="px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-tajawal cursor-pointer"
                    >
                      إعادة
                    </button>
                  </div>

                  {/* Zoom Slider */}
                  <div className="flex items-center gap-2 mt-2 px-2">
                    <span className="text-xs text-muted">−</span>
                    <input
                      type="range"
                      min={50}
                      max={250}
                      value={zoom}
                      onChange={(e) => setZoom(parseInt(e.target.value))}
                      className="flex-1 accent-gold2 h-1 cursor-pointer"
                    />
                    <span className="text-xs text-muted">+</span>
                    <span className="text-[10px] font-mono text-muted w-8">{zoom}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Real-time Mini Card Preview (matching register.html .preview-id-card) */}
          <div
            className="rounded-2xl p-4 text-white relative overflow-hidden shadow-lg border border-white/10"
            style={{ background: 'linear-gradient(155deg, var(--navy) 0%, var(--blue) 100%)' }}
          >
            <div className="h-1 bg-gradient-to-r from-gold via-gold2 to-gold absolute top-0 left-0 right-0" />

            <div className="flex items-center gap-3 mt-1">
              <div className="w-16 h-20 rounded-lg overflow-hidden border-2 border-[rgba(232,184,75,0.4)] bg-navy flex-shrink-0">
                {croppedDataUrl ? (
                  <img src={croppedDataUrl} alt="معاينة" className="w-full h-full object-cover object-top" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">
                    صورة
                  </div>
                )}
              </div>

              <div className="text-right flex-1 min-w-0">
                <div className="font-bold text-white text-xs truncate">
                  {fullName || 'اسم الطالب يظهر هنا'}
                </div>
                <div className="text-[11px] text-white/60 font-tajawal mt-1 truncate">
                  {college}
                </div>
                <div className="text-[10px] text-white/50 font-tajawal">
                  {year}
                </div>
                <div className="font-mono text-gold2 text-xs font-bold mt-1.5 tracking-wider" dir="ltr">
                  {studentId}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
