import React, { useState } from 'react';
import { API_BASE_URL } from '../api/client';
import { BUA_COLLEGES } from './RegisterStudentPage';

export const ExportPage: React.FC = () => {
  const [selectedCollege, setSelectedCollege] = useState('');
  const [selectedYear, setSelectedYear] = useState('');

  const handleExportExcel = async () => {
    const params = new URLSearchParams();
    if (selectedCollege) params.append('college', selectedCollege);
    if (selectedYear) params.append('year', selectedYear);
    const token = localStorage.getItem('bua_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/export/students-excel?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('فشل التصدير');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BUA_Students_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('تعذر تصدير الملف. تأكد من تسجيل الدخول.');
    }
  };

  const handleExportPhotosZip = async () => {
    const params = new URLSearchParams();
    if (selectedCollege) params.append('college', selectedCollege);
    if (selectedYear) params.append('year', selectedYear);
    const token = localStorage.getItem('bua_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/export/photos-zip?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('فشل التصدير');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BUA_Photos_${new Date().toISOString().slice(0,10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('تعذر تصدير الصور. تأكد من تسجيل الدخول.');
    }
  };


  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-right">
        <h1 className="text-lg sm:text-xl font-bold text-navy m-0">تصدير بيانات الطلاب والصور</h1>
        <p className="text-xs text-muted font-tajawal mt-0.5 m-0">
          تحميل بيانات الطلاب بصيغة Excel منسقة رسمياً، أو تحميل أرشيف مضغوط ZIP لجميع الصور الشخصية للطباعة
        </p>
      </div>

      {/* Filter Parameters */}
      <div className="bua-card p-5 space-y-4">
        <h3 className="text-sm font-bold text-navy m-0">تحديد نطاق التصدير</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-right">
          <div className="bua-field mb-0">
            <label>الكلية</label>
            <select
              value={selectedCollege}
              onChange={(e) => setSelectedCollege(e.target.value)}
              className="bua-select text-xs"
            >
              <option value="">جميع الكليات</option>
              {BUA_COLLEGES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="bua-field mb-0">
            <label>الفرقة / السنة الدراسية</label>
            <input
              type="text"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              placeholder="مثال: الفرقة الأولى (أو اترك فارغاً للكل)"
              className="bua-input text-xs"
            />
          </div>
        </div>
      </div>

      {/* Export Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Excel Export Card */}
        <div className="bua-card p-6 flex flex-col justify-between space-y-4 shadow-sm">
          <div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy mb-1">تقرير بيانات الطلاب (Excel)</h3>
            <p className="text-xs text-muted font-tajawal leading-relaxed">
              ملف إكسل رسمي (.xlsx) متوافق مع نظام BUA يحتوي على كافة بيانات الطلاب، أرقامهم الجامعية، كلياتهم، وحالة اعتماد بطاقاتهم.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="bua-btn bua-btn-success w-full text-xs font-bold shadow"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
            <span>تصدير ملف Excel</span>
          </button>
        </div>

        {/* Photos ZIP Export Card */}
        <div className="bua-card p-6 flex flex-col justify-between space-y-4 shadow-sm">
          <div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy mb-1">أرشيف صور الطلاب (ZIP)</h3>
            <p className="text-xs text-muted font-tajawal leading-relaxed">
              تحميل جميع الصور الشخصية المعتمدة (400×500) بدقة الطباعة ومصنفة داخل مجلدات حسب الكلية والرقم الجامعي.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportPhotosZip}
            className="bua-btn bua-btn-primary w-full text-xs font-bold shadow"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" />
            </svg>
            <span>تصدير صور الطلاب (ZIP)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
