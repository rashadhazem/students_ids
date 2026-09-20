import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiClient, API_BASE_URL } from '../api/client';

interface ImportRow {
  rowNumber?: number;
  sid?: string;
  name?: string;
  college?: string;
  status?: string;
  email?: string;
  reason?: string;
}

interface ImportResult {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  ignoredEmptyRows: number;
  errorCount: number;
  errors?: string[];
  passedRows?: ImportRow[];
  skippedRows?: ImportRow[];
  message?: string;
}

export const BulkImportPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<'passed' | 'skipped'>('passed');
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
              updatedCount: r.updated || 0,
              skippedCount: r.skipped || 0,
              ignoredEmptyRows: r.ignoredEmptyRows || 0,
              errorCount: (r.errors || []).length,
              errors: r.errors || [],
              passedRows: r.passedRows || [],
              skippedRows: r.skippedRows || [],
              message: r.message
            });
            if ((!r.passedRows || r.passedRows.length === 0) && (r.skippedRows && r.skippedRows.length > 0)) {
              setActiveResultTab('skipped');
            } else {
              setActiveResultTab('passed');
            }
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

  const handleDownloadTemplate = async () => {
    try {
      const res = await apiClient.get('/bulkimport/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'BUA_Students_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      window.open(`${API_BASE_URL}/api/bulkimport/template`, '_blank');
    }
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

          {/* Results Card (enhanced with passed and skipped row breakdown) */}
          {result && (
            <div className="bua-card mt-5">
              <div className="bua-card-header bg-[#fafbfd] flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-success">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                  <h2 className="text-base font-bold text-navy">تقرير تفصيلي لنتيجة الاستيراد</h2>
                </div>
                <span className="text-xs bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold">
                  إجمالي المفحوص: {result.totalRows} صف
                </span>
              </div>

              <div className="bua-card-body">
                {/* 4 KPI Counters */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4 text-center">
                  <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-200">
                    <div className="text-2xl font-black text-emerald-800 leading-none">
                      {result.createdCount}
                    </div>
                    <div className="text-[11px] font-bold text-emerald-700 font-tajawal mt-1">✓ طلاب جدد</div>
                  </div>

                  <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-200">
                    <div className="text-2xl font-black text-blue leading-none">
                      {result.updatedCount}
                    </div>
                    <div className="text-[11px] font-bold text-blue font-tajawal mt-1">⟳ تم التحديث</div>
                  </div>

                  <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-200">
                    <div className="text-2xl font-black text-amber-800 leading-none">
                      {result.skippedCount}
                    </div>
                    <div className="text-[11px] font-bold text-amber-700 font-tajawal mt-1">⚠️ تم تخطيها لملاحظات</div>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200">
                    <div className="text-2xl font-black text-slate-700 leading-none">
                      {result.ignoredEmptyRows}
                    </div>
                    <div className="text-[11px] font-bold text-slate-500 font-tajawal mt-1">ℹ️ صفوف فارغة أُهملت</div>
                  </div>
                </div>

                {/* Main Notification Banner */}
                {result.message && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold text-right mb-4 flex items-center gap-2">
                    <span className="text-base">✓</span>
                    <span>{result.message}</span>
                  </div>
                )}

                {/* Tab Switcher: Passed vs Skipped */}
                <div className="flex gap-2 border-b border-slate-200 mb-4 text-xs font-bold font-cairo">
                  <button
                    type="button"
                    onClick={() => setActiveResultTab('passed')}
                    className={`pb-2.5 px-3 border-b-2 -mb-[1px] transition cursor-pointer ${
                      activeResultTab === 'passed'
                        ? 'border-emerald-600 text-emerald-700 font-black'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    ✓ الصفوف المقبولة والمعتمدة ({result.passedRows?.length || 0})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveResultTab('skipped')}
                    className={`pb-2.5 px-3 border-b-2 -mb-[1px] transition cursor-pointer ${
                      activeResultTab === 'skipped'
                        ? 'border-amber-600 text-amber-700 font-black'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    ⚠️ الصفوف المستبعدة والملاحظات ({result.skippedRows?.length || 0})
                  </button>
                </div>

                {/* Tab Content: Passed Rows */}
                {activeResultTab === 'passed' && (
                  <div>
                    {(!result.passedRows || result.passedRows.length === 0) ? (
                      <div className="text-center py-6 text-xs text-slate-400 font-tajawal">
                        لا توجد صفوف جديدة تم اعتمادها في هذا الملف.
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto border border-slate-100 rounded-xl">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="p-2.5">رقم الصف</th>
                              <th className="p-2.5">كود الطالب</th>
                              <th className="p-2.5">اسم الطالب</th>
                              <th className="p-2.5">الكلية</th>
                              <th className="p-2.5">الحالة</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-tajawal">
                            {result.passedRows.map((r, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/70">
                                <td className="p-2.5 font-bold text-slate-600">الصف {r.rowNumber || idx + 1}</td>
                                <td className="p-2.5 font-mono font-bold text-navy">{r.sid}</td>
                                <td className="p-2.5 font-bold text-slate-800">{r.name}</td>
                                <td className="p-2.5 text-slate-600">{r.college || '—'}</td>
                                <td className="p-2.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      r.status?.includes('جديد')
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-blue-100 text-blue-800'
                                    }`}
                                  >
                                    {r.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Content: Skipped Rows with Reasons */}
                {activeResultTab === 'skipped' && (
                  <div>
                    {(!result.skippedRows || result.skippedRows.length === 0) ? (
                      <div className="text-center py-6 text-xs text-emerald-700 font-semibold font-tajawal bg-emerald-50/50 rounded-xl">
                        ✓ ممتاز! لم يتم استبعاد أي صف، جميع صفوف البيانات تم قبولها واعتمادها بنجاح.
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto space-y-2 text-xs font-tajawal">
                        {result.skippedRows.map((r, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-right flex items-start gap-2.5"
                          >
                            <span className="text-sm text-amber-600 font-bold mt-0.5">⚠️</span>
                            <div className="flex-1">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-bold text-amber-900 font-cairo">
                                  {r.rowNumber ? `الصف ${r.rowNumber} في الإكسل` : `سجل #${idx + 1}`}
                                </span>
                                <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-semibold">
                                  {r.status || 'تخطي'}
                                </span>
                              </div>
                              <p className="text-slate-700 m-0 leading-relaxed">
                                {r.reason || `تم تخطي الصف: ${r.sid} - ${r.name}`}
                              </p>
                              {(r.sid && r.sid !== '—') && (
                                <div className="text-[11px] text-slate-500 mt-1">
                                  كود الطالب: <span className="font-mono font-bold text-slate-700">{r.sid}</span> | الاسم: {r.name || 'غير محدد'}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
