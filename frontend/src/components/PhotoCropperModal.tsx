import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Upload, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  RotateCcw, 
  FlipHorizontal, 
  Check, 
  Eye,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { apiClient } from '../api/client';

interface PhotoCropperModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  year?: string;
  college?: string;
  initialFile?: File | null;
  onSuccess: (imagePath: string) => void;
}

export const PhotoCropperModal: React.FC<PhotoCropperModalProps> = ({
  isOpen,
  onClose,
  studentId,
  year = '2024-2025',
  college = 'عام',
  initialFile = null,
  onSuccess
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [rawPreview, setRawPreview] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1.35);
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [serverPreview, setServerPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; ox: number; oy: number }>({ x: 0, y: 0, ox: 0, oy: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialFile && isOpen) {
      setFile(initialFile);
      setRawPreview(URL.createObjectURL(initialFile));
      setServerPreview(null);
      setErrorMsg(null);
      setZoom(1.35);
      setRotation(0);
      setFlipH(false);
      setOffset({ x: 0, y: 0 });
    }
  }, [initialFile, isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setRawPreview(URL.createObjectURL(selected));
      setServerPreview(null);
      setErrorMsg(null);
      setZoom(1.35);
      setRotation(0);
      setFlipH(false);
      setOffset({ x: 0, y: 0 });
    }
  };

  const handleRotate = (deg: number) => {
    setRotation(prev => (prev + deg + 360) % 360);
    setServerPreview(null);
  };

  const handleFlip = () => {
    setFlipH(prev => !prev);
    setServerPreview(null);
  };

  const handleZoomChange = (newZoom: number) => {
    setZoom(Math.max(0.5, Math.min(3.0, newZoom)));
    setServerPreview(null);
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
    setServerPreview(null);
  };

  const handleMouseUp = () => setIsDragging(false);

  // Request high-precision server-side ImageSharp preview
  const handleGeneratePreview = async () => {
    if (!file) return;
    setLoadingPreview(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('zoom', zoom.toString());
      formData.append('rotation', rotation.toString());
      formData.append('flipH', flipH.toString());
      // Convert pixel offset in 200px crop box to normalized -1.0 to 1.0
      formData.append('offsetX', (offset.x / 100.0).toString());
      formData.append('offsetY', (offset.y / 125.0).toString());
      formData.append('autoCrop', 'true');

      const res = await apiClient.post('/photos/crop-preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data?.success && res.data?.preview) {
        setServerPreview(res.data.preview);
      } else {
        setErrorMsg(res.data?.message || 'فشل توليد المعاينة');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'حدث خطأ في معالجة الصورة');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Final upload to student's record
  const handleSavePhoto = async () => {
    if (!file) return;
    setUploading(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('image', file);
      formData.append('studentId', studentId);
      formData.append('year', year);
      formData.append('college', college);
      formData.append('zoom', zoom.toString());
      formData.append('rotation', rotation.toString());
      formData.append('flipH', flipH.toString());
      formData.append('flip_h', flipH ? '1' : '0');
      formData.append('offsetX', (offset.x / 100.0).toString());
      formData.append('offset_x', (offset.x / 100.0).toString());
      formData.append('offsetY', (offset.y / 125.0).toString());
      formData.append('offset_y', (offset.y / 125.0).toString());
      formData.append('autoCrop', 'true');
      formData.append('auto_crop', '1');

      let res;
      try {
        res = await apiClient.post(`/students/${studentId}/photo`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } catch (firstErr: any) {
        if (firstErr.response?.status === 400 || firstErr.response?.status === 422) {
          throw firstErr;
        }
        try {
          res = await apiClient.post('/photos/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        } catch {
          throw firstErr;
        }
      }

      if (res?.data?.success) {
        const imagePath = res.data.url || res.data.new_url || res.data.imagePath || res.data.imageUrl || `/uploads/${year}/${studentId}.jpg`;
        try {
          onSuccess(imagePath);
        } catch (cbErr) {
          console.error('onSuccess callback error:', cbErr);
        }
        onClose();
      } else {
        setErrorMsg(res?.data?.message || 'فشل حفظ الصورة');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'حدث خطأ أثناء حفظ الصورة في المنظومة');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 space-x-reverse">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">معالج واقتصاص صورة الطالب</h3>
              <p className="text-xs text-slate-400">الرقم الجامعي: <span className="text-amber-400 font-mono">{studentId}</span></p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Always rendered file input so 'Change Photo' button works anywhere */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
            accept="image/jpeg,image/png,image/jpg"
            className="hidden"
          />

          {errorMsg && (
            <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-center space-x-2 space-x-reverse">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!rawPreview ? (
            /* File Dropzone */
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-amber-500/80 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer bg-slate-800/30 hover:bg-slate-800/60 transition group text-center"
            >
              <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mb-4 group-hover:scale-110 transition shadow-inner">
                <Upload className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">اختر صورة الطالب أو اسحبها هنا</h4>
              <p className="text-xs text-slate-400 max-w-sm">
                الأنواع المدعومة: JPEG، PNG بحجم أقصى 8 ميجابايت. سيتم ضبط الأبعاد تلقائياً إلى 400×500 بكسل بنسبة البطاقة الرسمية.
              </p>
            </div>
          ) : (
            /* Cropper Editor */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                {/* Visual crop workspace */}
                <div 
                  className="relative w-[240px] h-[300px] rounded-xl overflow-hidden border-2 border-amber-500 shadow-2xl bg-slate-950 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchStart={(e) => {
                    if (e.touches[0]) {
                      setIsDragging(true);
                      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY, ox: offset.x, oy: offset.y });
                    }
                  }}
                  onTouchMove={(e) => {
                    if (!isDragging || !e.touches[0]) return;
                    setOffset({
                      x: dragStart.ox + (e.touches[0].clientX - dragStart.x),
                      y: dragStart.oy + (e.touches[0].clientY - dragStart.y)
                    });
                    setServerPreview(null);
                  }}
                  onTouchEnd={() => setIsDragging(false)}
                >
                  <div
                    className="w-full h-full flex items-center justify-center pointer-events-none"
                    style={{
                      transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1})`,
                      transition: isDragging ? 'none' : 'transform 0.15s ease'
                    }}
                  >
                    <img
                      src={rawPreview}
                      alt="Raw Preview"
                      className="max-w-none w-full h-full object-cover pointer-events-none select-none"
                      draggable={false}
                    />
                  </div>

                  {/* Biometric Face & Shoulders Guide Overlay */}
                  <div className="absolute inset-0 pointer-events-none border border-amber-400/30 rounded-lg flex flex-col items-center justify-start pt-5 overflow-hidden">
                    {/* Head / Face Oval */}
                    <div className="w-24 h-32 border-2 border-dashed border-amber-400/60 rounded-full mb-1 shadow-[0_0_15px_rgba(245,158,11,0.2)] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400/40"></div>
                    </div>
                    {/* Shoulders Arc Guide */}
                    <div className="w-48 h-10 border-t-2 border-dashed border-amber-400/50 rounded-t-[50%] mb-1"></div>
                    <div className="text-[10px] font-semibold text-amber-300 bg-slate-950/80 px-2.5 py-0.5 rounded-full border border-amber-500/30 shadow">
                      إطار الوجه والأكتاف الرسمي
                    </div>
                  </div>
                </div>

                {/* Live Processed Output Preview if requested */}
                {serverPreview && (
                  <div className="flex flex-col items-center">
                    <div className="text-xs font-semibold text-emerald-400 mb-2 flex items-center space-x-1 space-x-reverse">
                      <Check className="w-3.5 h-3.5" />
                      <span>المعاينة النهائية (400×500)</span>
                    </div>
                    <div className="w-[140px] h-[175px] rounded-xl overflow-hidden border-2 border-emerald-500 shadow-xl bg-slate-950">
                      <img src={serverPreview} alt="Processed" className="w-full h-full object-cover" />
                    </div>
                  </div>
                )}
              </div>

              {/* Controls Toolbar */}
              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-4">
                {/* Zoom Presets */}
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400 ml-1">أوضاع التقريب:</span>
                  <button
                    type="button"
                    onClick={() => { handleZoomChange(1.35); setOffset({ x: 0, y: 0 }); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      Math.abs(zoom - 1.35) < 0.05 
                        ? 'bg-amber-500 text-slate-950 shadow-md' 
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                  >
                    🎯 الوجه والأكتاف (135%)
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleZoomChange(1.65); setOffset({ x: 0, y: 0 }); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      Math.abs(zoom - 1.65) < 0.05 
                        ? 'bg-amber-500 text-slate-950 shadow-md' 
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                  >
                    🔍 تقريب أكثر (165%)
                  </button>
                  <button
                    type="button"
                    onClick={() => { handleZoomChange(1.0); setOffset({ x: 0, y: 0 }); }}
                    className={`px-2.5 py-1 rounded-lg text-xs transition ${
                      Math.abs(zoom - 1.0) < 0.05 
                        ? 'bg-amber-500 text-slate-950' 
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    كامل الصورة (100%)
                  </button>
                </div>

                {/* Zoom Slider */}
                <div className="flex items-center space-x-3 space-x-reverse">
                  <ZoomOut className="w-4 h-4 text-slate-400" />
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.05"
                    value={zoom}
                    onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                    className="flex-1 accent-amber-500 cursor-pointer"
                  />
                  <ZoomIn className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-mono text-amber-400 w-10 text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                </div>

                {/* Transform Action Buttons */}
                <div className="flex items-center justify-center space-x-3 space-x-reverse">
                  <button
                    type="button"
                    onClick={() => handleRotate(-90)}
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs flex items-center space-x-1 space-x-reverse transition"
                    title="دوران 90 درجة يساراً"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-400" />
                    <span>دوران يسار</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRotate(90)}
                    className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs flex items-center space-x-1 space-x-reverse transition"
                    title="دوران 90 درجة يميناً"
                  >
                    <RotateCw className="w-4 h-4 text-amber-400" />
                    <span>دوران يمين</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFlip}
                    className={`p-2 rounded-lg text-xs flex items-center space-x-1 space-x-reverse transition ${
                      flipH ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                    title="انعكاس أفقي"
                  >
                    <FlipHorizontal className="w-4 h-4 text-amber-400" />
                    <span>انعكاس أفقي</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-amber-300 text-xs font-bold flex items-center space-x-1.5 space-x-reverse transition border border-slate-600 hover:border-amber-400/50 cursor-pointer shadow-sm"
                    title="اختيار صورة أخرى من جهازك"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>تغيير الصورة</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            إلغاء
          </button>

          {rawPreview && (
            <div className="flex items-center space-x-3 space-x-reverse">
              <button
                type="button"
                onClick={handleGeneratePreview}
                disabled={loadingPreview}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 flex items-center space-x-1.5 space-x-reverse transition"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{loadingPreview ? 'جاري المعاينة...' : 'معاينة دقيقة'}</span>
              </button>

              <button
                type="button"
                onClick={handleSavePhoto}
                disabled={uploading}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 flex items-center space-x-1.5 space-x-reverse shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{uploading ? 'جاري الحفظ...' : 'اعتماد وحفظ الصورة'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
