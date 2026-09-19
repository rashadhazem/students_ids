import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiClient, API_BASE_URL } from '../api/client';

interface ImportResult {
  totalRows: number;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  errors?: string[];
  skippedDetails?: string[];
  message?: string;
}

export const BulkImportPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      selectFile(e.dataTransfer.files[0]);
    }
  };

  const selectFile = (selected: File) => {
    const ext = selected.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      setErrorMsg('يُسمح فقط بملفات Excel (.xlsx, .xls) أو CSV');
      return;
    }
    setFile(selected);
    setErrorMsg(null);
    setResult(null);
    setProgress(0);
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setErrorMsg(null);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // POST to /api/bulkimport/upload – returns jobId immediately
      const uploadRes = await apiClient.post('/bulkimport/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 30) / progressEvent.total);
            setProgress(10 + pct);
          }
        }
      });

      if (!uploadRes.data?.success || !uploadRes.data?.jobId) {
        setErrorMsg(uploadRes.data?.message || 'فشل رفع الملف');
        setImporting(false);
        return;
      }

      const jobId = uploadRes.data.jobId;
      setProgress(40);

      // Poll for job completion
      let attempts = 0;
      const maxAttempts = 60; // 60 * 2s = 2 minutes max
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const statusRes = await apiClient.get(`/bulkimport/status/${jobId}`);
          const job = statusRes.data;

          if (job?.progress) {
            setProgress(Math.min(40 + Math.round(job.progress * 0.6), 98));
          }

          if (job?.status === 'Completed') {
            clearInterval(pollInterval);
            setProgress(100);
            const r = job.result || {};
            setResult({
              totalRows: r.total || 0,
              createdCount: r.created || 0,
              skippedCount: (r.skipped || 0) + (r.updated || 0),
              errorCount: (r.errors || []).length,
              errors: r.errors || [],
              skippedDetails: r.preview?.map((p: any) => `${p.sid} – ${p.name}: ${p.status}`) || [],
              message: r.message
            });
            setImporting(false);
          } else if (job?.status === 'Failed') {
            clearInterval(pollInterval);
            setErrorMsg(job.error || 'فشل الاستيراد');
            setImporting(false);
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setErrorMsg('انتهت مهلة الاستيراد. يرجى المحاولة مجدداً بملف أصغر.');
            setImporting(false);
          }
        } catch {
          // silently retry
        }
      }, 2000);

    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'تعذر استيراد الملف. تأكد من صحة الأعمدة.');
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    window.open(`${API_BASE_URL}/api/bulkimport/template`, '_blank');
  };


  return (
    <div>
      {/* Top Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-lg sm:text-xl font-bold text-navy m-0">استيراد بيانات الطلاب</h1>
        <Link to="/students" className="bua-btn bua-btn-outline bua-btn-sm text-xs">
          ← رجوع لإدارة الطلاب
        </Link>
      </div>

      {/* 2-Column Grid (matching bulk_import.html) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT COLUMN: Upload & Results */}
        <div>
          <div className="bua-card mb-5">
            <div className="bua-card-header bg-[#fafbfd]">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-gold">
                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
              </svg>
              <h2>رفع ملف البيانات</h2>
            </div>

            <div className="bua-card-body">
              {/* Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
                  isDragOver
                    ? 'border-blue bg-[#f0f4ff]'
                    : file
                    ? 'border-emerald-400 bg-emerald-50/40'
                    : 'border-[#c8d4e8] bg-[#fafbfd] hover:border-blue hover:bg-[#f0f4ff]'
                }`}
              >
                <span className="text-4xl block mb-2">📊</span>
                <p className="text-sm text-muted font-tajawal m-0">
                  <strong className="text-blue">انقر لاختيار الملف</strong> أو اسحبه هنا
                </p>
                <p className="text-xs text-muted/70 mt-1 font-tajawal m-0">
                  ملفات Excel (.xlsx, .xls) أو CSV – يدعم حتى 5000 طالب
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) selectFile(e.target.files[0]);
                  }}
                />
              </div>

              {/* Selected File Badge */}
              {file && (
                <div className="mt-3.5 p-3 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-emerald-700 flex-shrink-0">
                    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" />
                  </svg>
                  <div className="text-right flex-1 min-w-0">
                    <strong className="text-xs text-emerald-900 block truncate">{file.name}</strong>
                    <span className="text-[11px] text-muted font-tajawal">
                      {(file.size / 1024).toFixed(1)} كيلوبايت
                    </span>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {errorMsg && (
                <div className="mt-3.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold text-right">
                  {errorMsg}
                </div>
              )}

              {/* Progress Bar */}
              {importing && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted font-tajawal mb-1">
                    <span>جارٍ المعالجة واستخراج الحسابات…</span>
                    <span className="font-bold">{progress}%</span>
                  </div>
                  <div className="bg-[#f0f4f9] rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${progress}%`,
                        background: 'linear-gradient(90deg, var(--blue), var(--gold2))'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Import Button */}
              <button
                type="button"
                onClick={handleImport}
                disabled={!file || importing}
                className="bua-btn bua-btn-primary w-full mt-4 text-sm font-bold shadow-md disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                  <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
                </svg>
                <span>{importing ? 'جارٍ الاستيراد…' : 'استيراد البيانات'}</span>
              </button>
            </div>
          </div>

          {/* Results Card (matching bulk_import.html) */}
          {result && (
            <div className="bua-card">
              <div className="bua-card-header bg-[#fafbfd]">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-success">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
                <h2>نتيجة الاستيراد</h2>
              </div>
              <div className="bua-card-body">
                {/* 3 KPI Counters */}
                <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                  <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200">
                    <div className="text-2xl font-black text-emerald-800 leading-none">
                      {result.createdCount}
                    </div>
                    <div className="text-[11px] text-muted font-tajawal mt-1">تم الإنشاء</div>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                    <div className="text-2xl font-black text-amber-800 leading-none">
                      {result.skippedCount}
                    </div>
                    <div className="text-[11px] text-muted font-tajawal mt-1">تم التخطي</div>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 border border-red-200">
                    <div className="text-2xl font-black text-red-800 leading-none">
                      {result.errorCount}
                    </div>
                    <div className="text-[11px] text-muted font-tajawal mt-1">أخطاء</div>
                  </div>
                </div>

                {/* Details List */}
                <div className="max-h-60 overflow-y-auto space-y-2 text-xs font-tajawal">
                  {result.message && (
                    <div className="p-2 rounded bg-emerald-50 text-emerald-800 font-semibold text-right">
                      ✓ {result.message}
                    </div>
                  )}

                  {result.skippedDetails?.map((skip, i) => (
                    <div key={i} className="p-2 rounded bg-amber-50 text-amber-800 text-right">
                      ⚠️ {skip}
                    </div>
                  ))}

                  {result.errors?.map((err, i) => (
                    <div key={i} className="p-2 rounded bg-red-50 text-red-800 text-right">
                      ✗ {err}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Guide & Template */}
        <div>
          <div className="bua-card mb-5">
            <div className="bua-card-header bg-[#fafbfd]">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-blue">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
              </svg>
              <h2>كيف تستخدم الاستيراد</h2>
            </div>
            <div className="bua-card-body space-y-3.5 text-right">
              {/* Step 1 */}
              <div className="flex items-start gap-3 pb-3 border-b border-[#f0f4f9]">
                <div className="w-6 h-6 rounded-full bg-blue text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                  ١
                </div>
                <div className="text-xs">
                  <strong className="block font-bold text-navy mb-0.5">حمّل قالب Excel</strong>
                  <span className="text-muted font-tajawal">
                    اضغط الزر أدناه لتحميل ملف جاهز بالأعمدة المعتمدة والمتوافقة.
                  </span>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3 pb-3 border-b border-[#f0f4f9]">
                <div className="w-6 h-6 rounded-full bg-blue text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                  ٢
                </div>
                <div className="text-xs">
                  <strong className="block font-bold text-navy mb-0.5">أضف بيانات الطلاب</strong>
                  <span className="text-muted font-tajawal">
                    كل سطر = طالب واحد. الأعمدة: رقم الطالب، الاسم الكامل، الكلية، السنة، البريد (اختياري).
                  </span>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                  ٣
                </div>
                <div className="text-xs">
                  <strong className="block font-bold text-navy mb-0.5">ارفع الملف</strong>
                  <span className="text-muted font-tajawal">
                    النظام يُنشئ حسابات الطلاب والبطاقات تلقائياً وبسرعة فائقة.
                  </span>
                </div>
              </div>

              {/* Download Template Action */}
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="bua-btn bua-btn-outline w-full mt-4 text-xs font-bold"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
                <span>تحميل نموذج Excel الفارغ (.xlsx)</span>
              </button>
            </div>
          </div>

          {/* Sample Table Preview (matching official university Excel format) */}
          <div className="bua-card">
            <div className="bua-card-header bg-[#fafbfd]">
              <h2>معاينة شكل أعمدة شيت الجامعة المعتمد</h2>
            </div>
            <div className="bua-tbl-wrap">
              <table className="bua-table text-xs">
                <thead>
                  <tr className="bg-navy text-gold2">
                    <th className="!bg-navy !text-gold2">Student Code</th>
                    <th className="!bg-navy !text-gold2">Student Name (AR)</th>
                    <th className="!bg-navy !text-gold2">Faculty Name</th>
                    <th className="!bg-navy !text-gold2">Section Name</th>
                    <th className="!bg-navy !text-gold2">Student Mobile</th>
                    <th className="!bg-navy !text-gold2">National Id</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-muted text-[11px]" dir="ltr">
                  <tr>
                    <td>202600001479</td>
                    <td dir="rtl">جاكوب جوزيف جرجس عزيز</td>
                    <td>Faculty of Applied Arts</td>
                    <td>General</td>
                    <td>01014194361</td>
                    <td>30703212503156</td>
                  </tr>
                  <tr>
                    <td>2023010080</td>
                    <td dir="rtl">محمد أحمد محمود</td>
                    <td>Faculty of Pharmacy</td>
                    <td>PharmD Clinical</td>
                    <td>01098765432</td>
                    <td>30401012500123</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-amber-50/60 border-t border-amber-200/60 text-[11px] text-amber-900 text-right font-tajawal">
              💡 <strong>ملاحظة هامة:</strong> النظام يتعرف تلقائياً على أعمدة شيت شؤون الطلاب الرسمي كما هي بدون أي تعديل، ويقوم بتوزيع الكليات والأقسام وتعيين الحسابات فورياً.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
