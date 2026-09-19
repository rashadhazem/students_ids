import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { StudentCard, StudentCardData } from '../components/StudentCard';
import { PhotoCropperModal } from '../components/PhotoCropperModal';

export const StudentCardPage: React.FC = () => {
  const { id: paramId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const queryId = searchParams.get('id');
  const studentIdentifier = paramId || queryId;

  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [student, setStudent] = useState<StudentCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Photo Cropper Modal State
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, ox: 0, oy: 0 });
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Comparison State
  const [oldPhotoUrl, setOldPhotoUrl] = useState<string | null>(null);
  const [newPhotoUrl, setNewPhotoUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (text: string, isError = false) => {
    setToastMsg({ text, isError });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchStudent = async (sid: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiClient.get(`/students/card/${sid}`);
      if (res.data?.success && res.data?.student) {
        setStudent(res.data.student);
      } else {
        setErrorMsg(res.data?.message || 'لم يتم العثور على بيانات الطالب');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'تعذر تحميل بيانات بطاقة الطالب');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (studentIdentifier) {
      fetchStudent(studentIdentifier);
    } else if (user?.studentId) {
      fetchStudent(user.studentId);
    } else {
      // Default to first student for demonstration
      fetchStudent('2024001001');
    }
  }, [studentIdentifier, user]);

  // Determine if viewer can edit: Admin or same student
  const canEdit =
    user?.role?.toLowerCase() === 'superadmin' ||
    user?.role?.toLowerCase() === 'admin' ||
    user?.role?.toLowerCase() === 'staff' ||
    (user?.studentId && student?.studentId && user.studentId === student.studentId);

  // Canvas drawing routine matching Python student_card.html Math.max cover-fit
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

    // Cover fit (Math.max) ensures no empty dark bands or blank gaps
    const scale = (zoom / 100) * Math.max(canvas.width / bbW, canvas.height / bbH);
    ctx.drawImage(img, (-img.width * scale) / 2, (-img.height * scale) / 2, img.width * scale, img.height * scale);
    ctx.restore();
  };

  useEffect(() => {
    drawCanvas();
  }, [rotation, flipH, zoom, offset]);

  const handleFileSelect = (file: File) => {
    if (!file) return;
    if (!file.type.match(/^image\/(jpeg|jpg|png)$/i) && !file.name.match(/\.(jpe?g|png)$/i)) {
      showToast('يُسمح فقط بصور JPG / JPEG / PNG', true);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast('حجم الصورة يتجاوز الحد المسموح (8 MB)', true);
      return;
    }

    setSelectedFile(file);
    setIsCropperOpen(true);
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

  const handleSavePhoto = async () => {
    if (!student?.studentId) return;

    setSavingPhoto(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('image', selectedFile);
      }
      formData.append('rotation', rotation.toString());
      formData.append('flip_h', flipH ? '1' : '0');
      formData.append('zoom', (zoom / 100).toString());
      formData.append('offset_x', offset.x.toString());
      formData.append('offset_y', offset.y.toString());
      formData.append('auto_crop', '1');

      const res = await apiClient.post(`/students/${student.studentId}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(pct);
          }
        }
      });

      if (res.data?.success) {
        const photoUrl = res.data.url || res.data.new_url;
        const timestamped = photoUrl + (photoUrl.includes('?') ? '&' : '?') + 't=' + Date.now();

        // Save comparison view
        setOldPhotoUrl(student.imagePath || null);
        setNewPhotoUrl(timestamped);

        // Update card student object
        setStudent(prev => prev ? { ...prev, imagePath: timestamped } : prev);

        setSelectedFile(null);
        showToast('تم اعتماد صورتك وقصها بالذكاء الاصطناعي وتحديث البطاقة بنجاح ✓', false);
      } else {
        showToast(res.data?.message || 'فشل تحديث الصورة', true);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'تعذر حفظ الصورة، حاول مرة أخرى', true);
    } finally {
      setSavingPhoto(false);
      setUploadProgress(null);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div
      className="min-h-screen py-10 px-4 flex flex-col items-center justify-center relative font-cairo text-white"
      style={{
        background: 'linear-gradient(135deg, #0a1628 0%, #1a3a6b 50%, #0a1628 100%)'
      }}
    >
      {/* Background Radial Lights */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at 15% 40%, rgba(200,148,26,.1) 0%, transparent 50%),
            radial-gradient(ellipse at 85% 70%, rgba(26,58,107,.35) 0%, transparent 50%)
          `
        }}
      />

      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl font-semibold text-xs shadow-2xl flex items-center gap-2 ${
            toastMsg.isError ? 'bg-red-700 text-white' : 'bg-emerald-700 text-white'
          }`}
        >
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Top Controls Bar for Navigation */}
      {isAuthenticated && (
        <div className="w-full max-w-[480px] flex justify-between items-center mb-4 z-10 text-xs">
          {user?.role?.toLowerCase() !== 'student' ? (
            <button
              onClick={() => navigate('/')}
              className="text-gold2 hover:text-white transition flex items-center gap-1 cursor-pointer bg-transparent border-0 p-0 font-cairo"
            >
              ← العودة للوحة التحكم
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              <span className="text-gold2 font-bold font-cairo text-xs">
                بوابة رفع صورة الطالب
              </span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="text-white/60 hover:text-red-400 transition cursor-pointer bg-transparent border-0 p-0 font-cairo flex items-center gap-1"
          >
            تسجيل الخروج ⎋
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-gold2 font-semibold text-sm animate-pulse z-10">
          جارٍ استرجاع بطاقة الطالب…
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <div className="bg-red-950/80 border border-red-700 text-red-200 p-4 rounded-xl text-xs max-w-sm text-center mb-6 z-10">
          {errorMsg}
        </div>
      )}

      {/* Main Student Card Display */}
      {student && (
        <div className="flex flex-col items-center gap-6 w-full max-w-[480px] z-10">
          <StudentCard
            student={student}
            canEdit={canEdit}
            onOpenQuickUpload={() => setIsCropperOpen(true)}
            isLoggedIn={isAuthenticated}
            onLogout={handleLogout}
          />

          {/* Hidden File Input for Instant Upload */}
          <input
            type="file"
            ref={fileInputRef}
            accept=".jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
              e.target.value = '';
            }}
          />

          {/* ⚠️ IMPORTANT DISCLAIMER BOX (Matching Python template) */}
          <div className="bua-disclaimer-box">
            <div className="w-9 h-9 rounded-xl bg-red-600/15 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-red-500">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
            </div>
            <div className="flex-1 text-right">
              <div className="text-[0.88rem] font-bold text-red-400 mb-1.5">
                ⚠️ تنبيه مهم: هذه ليست وثيقة هوية رسمية
              </div>
              <div className="text-xs text-white/70 leading-relaxed font-tajawal mb-2">
                <strong>هذه البطاقة هي عرض رقمي فقط لمعلومات الطالب والصورة</strong>، وليست وثيقة هوية رسمية أو معترف بها.
              </div>
              <ul className="text-[11px] text-white/60 leading-relaxed font-tajawal pr-4 list-disc space-y-1">
                <li>✗ هذه البطاقة <strong>ليست</strong> وثيقة هوية رسمية</li>
                <li>✗ لا يمكنها أن تحل محل أي وثيقة هوية رسمية</li>
                <li>✗ يجب عدم تقديمها لأي جهة حكومية أو تعليمية أو إدارية</li>
                <li>✓ الغرض الوحيد منها: عرض بيانات الطالب والتحقق من صحة الصورة</li>
                <li>✓ إذا كانت صورتك غير واضحة أو غير صحيحة، يمكنك تحديثها من هنا</li>
              </ul>
            </div>
          </div>

          {/* ══ PHOTO UPDATE PANEL ══ */}
          {canEdit && (
            <div
              className="w-full rounded-2xl p-5 border border-white/10 shadow-2xl"
              style={{
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(10px)'
              }}
            >
              <h3 className="text-sm font-bold text-white/90 flex items-center gap-2 mb-3.5 text-right">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-gold2">
                  <path d="M12 15.2A3.2 3.2 0 0 1 8.8 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 15.2 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 15.2 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 12 15.2M18.2 4H16.4L14.8 2H9.2L7.6 4H5.8C4.8 4 4 4.8 4 5.8v12.4C4 19.2 4.8 20 5.8 20h12.4c1 0 1.8-.8 1.8-1.8V5.8C20 4.8 19.2 4 18.2 4z" />
                </svg>
                <span>رفع وتحديث صورتك الشخصية</span>
              </h3>

              {/* Comparison View (after save) */}
              {oldPhotoUrl && newPhotoUrl && (
                <div className="flex gap-3 mb-4">
                  <div className="flex-1 text-center">
                    <img
                      src={oldPhotoUrl}
                      alt="القديمة"
                      className="w-full aspect-[4/5] object-cover object-top rounded-lg border-2 border-white/15 bg-navy"
                    />
                    <div className="text-[11px] text-white/45 mt-1.5 font-tajawal">الصورة السابقة</div>
                  </div>
                  <div className="flex-1 text-center">
                    <img
                      src={newPhotoUrl}
                      alt="الجديدة"
                      className="w-full aspect-[4/5] object-cover object-top rounded-lg border-2 border-emerald-400 bg-navy shadow-lg"
                    />
                    <div className="text-[11px] text-emerald-400 font-bold mt-1.5 font-tajawal">تم اعتمادها وقص الوجه ✓</div>
                  </div>
                </div>
              )}

              {/* Upload Drop Zone */}
              <div
                onClick={() => setIsCropperOpen(true)}
                className="border-2 border-dashed border-white/20 hover:border-gold2/50 rounded-xl p-5 text-center cursor-pointer transition bg-white/[0.02] hover:bg-gold2/[0.04] group"
              >
                <span className="text-3xl block mb-2 group-hover:scale-110 transition-transform">📸</span>
                <p className="text-sm text-white font-bold font-cairo m-0">
                  اضغط هنا لاختيار صورتك الشخصية وقصها
                </p>
                <p className="text-[11px] text-gold2/90 mt-1.5 font-tajawal m-0">
                  ✨ معالج تفاعلي: تكبير، تدوير، قلب الصورة، وقص الوجه بالذكاء الاصطناعي
                </p>
                <p className="text-[10px] text-white/40 mt-1 font-tajawal m-0">
                  يُقبل ملفات JPEG / JPG / PNG · حجم أقصى 8 MB
                </p>
              </div>

              {/* Instant Auto-Crop & Save Confirmation Area */}
              {selectedFile && (
                <div className="mt-4 p-4 rounded-xl border border-gold2/30 bg-black/30 text-center">
                  <div className="text-xs text-white/90 font-bold mb-1">
                    الملف المحدد: <span className="text-gold2">{selectedFile.name}</span>
                  </div>
                  <div className="text-[11px] text-white/60 mb-3 font-tajawal">
                    جاهز للاعتماد والقص التلقائي على الوجه بأبعاد (400×500)
                  </div>

                  {/* Open Interactive Cropper Button */}
                  <div className="flex gap-2 justify-center mb-3">
                    <button
                      type="button"
                      onClick={() => setIsCropperOpen(true)}
                      className="px-4 py-2 rounded-xl bg-gold2/20 hover:bg-gold2/30 text-gold2 border border-gold2/40 text-xs font-bold font-cairo cursor-pointer flex items-center gap-1.5"
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                        <path d="M12 15.2A3.2 3.2 0 0 1 8.8 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 15.2 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 15.2 12 3.2 3.2 0 0 1 12 8.8 3.2 3.2 0 0 1 12 15.2M18.2 4H16.4L14.8 2H9.2L7.6 4H5.8C4.8 4 4 4.8 4 5.8v12.4C4 19.2 4.8 20 5.8 20h12.4c1 0 1.8-.8 1.8-1.8V5.8C20 4.8 19.2 4 18.2 4z" />
                      </svg>
                      <span>فتح محرر وقص الصورة (تكبير / قلب / تدوير)</span>
                    </button>
                  </div>

                  {/* Upload Progress Bar if active */}
                  {savingPhoto && uploadProgress !== null && (
                    <div className="mb-3 w-full bg-white/10 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gold2 h-2 transition-all duration-300 rounded-full"
                        style={{ width: `${Math.max(5, uploadProgress)}%` }}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSavePhoto}
                    disabled={savingPhoto}
                    className="w-full py-3 rounded-xl font-bold text-sm text-navy cursor-pointer transition shadow-xl flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #c8941a, #e8b84b)' }}
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                    <span>
                      {savingPhoto
                        ? uploadProgress !== null && uploadProgress < 100
                          ? `جارٍ رفع الصورة (${uploadProgress}%)…`
                          : 'جارٍ المعالجة وقص الوجه وتحديث البطاقة…'
                        : 'اعتماد وحفظ الصورة الآن ✓'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PHOTO CROPPER & VIEWER MODAL (In front of student with zoom, flip, rotate, and face centering) */}
      {student && (
        <PhotoCropperModal
          isOpen={isCropperOpen}
          onClose={() => {
            setIsCropperOpen(false);
            setSelectedFile(null);
          }}
          studentId={student.studentId}
          year={student.academicYear || student.year || '2026/2027'}
          college={student.college}
          initialFile={selectedFile}
          onSuccess={(newImgPath) => {
            const timestamped = newImgPath + (newImgPath.includes('?') ? '&' : '?') + 't=' + Date.now();
            setOldPhotoUrl(student.imagePath || null);
            setNewPhotoUrl(timestamped);
            setStudent(prev => prev ? { ...prev, imagePath: timestamped } : prev);
            setIsCropperOpen(false);
            setSelectedFile(null);
            showToast('تم اعتماد صورتك وقص الوجه وتحديث البطاقة بنجاح ✓', false);
          }}
        />
      )}

      {/* Footer */}
      <footer className="mt-8 text-white/30 text-xs font-tajawal text-center z-10">
        © 2026 جامعة بدر بأسيوط – جميع الحقوق محفوظة
      </footer>
    </div>
  );
};
