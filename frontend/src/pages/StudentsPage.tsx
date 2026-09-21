import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiClient, API_BASE_URL } from '../api/client';
import { PhotoCropperModal } from '../components/PhotoCropperModal';
import { getAcademicLevelInfo } from '../components/StudentCard';
import { BUA_COLLEGES, BUA_YEARS } from './RegisterStudentPage';

export const BUA_YEARS_FILTER = [
  { value: '2026', label: 'الفرقة الأولى (2026)' },
  { value: '2025', label: 'الفرقة الثانية (2025)' },
  { value: '2024', label: 'الفرقة الثالثة (2024)' },
  { value: '2023', label: 'الفرقة الرابعة (2023)' },
  { value: '2022', label: 'الفرقة الخامسة (2022)' },
  { value: '2021', label: 'الفرقة السادسة (2021)' },
];

interface Student {
  id: number;
  studentId: string;
  fullName: string;
  college: string;
  section?: string;
  year: string;
  nationalId?: string;
  mobile?: string;
  seatNumber?: string;
  email?: string;
  phone?: string;
  imagePath?: string;
  createdAt?: string;
}

export const StudentsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSupervisor = user?.role?.toLowerCase() !== 'superadmin' && !!user?.college;

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Filters matching admin_panel.html
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCollege, setSelectedCollege] = useState(user?.college && user?.role?.toLowerCase() !== 'superadmin' ? user.college : '');
  const [selectedYear, setSelectedYear] = useState('');
  const [photoFilter, setPhotoFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Active Tab: 'students' | 'users' | 'audit'
  const [activeTab, setActiveTab] = useState<'students' | 'users' | 'audit'>('students');

  // Edit Modal State
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState<Partial<Student>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete Modal State
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Photo Cropper Modal State
  const [croppingStudent, setCroppingStudent] = useState<Student | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const showToast = (text: string, isError = false) => {
    setToastMsg({ text, isError });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // BUA_COLLEGES and BUA_YEARS imported from RegisterStudentPage

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const params: any = {
        page: currentPage,
        pageSize: pageSize
      };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (selectedCollege) params.college = selectedCollege;
      if (selectedYear) params.year = selectedYear;
      if (photoFilter) params.hasPhoto = photoFilter === 'with';

      const res = await apiClient.get('/students', { params });
      if (res.data?.success) {
        setStudents(res.data.items || res.data.students || []);
        setTotalCount(res.data.totalCount || res.data.total || 0);
      }
    } catch (err: any) {
      showToast('تعذر تحميل قائمة الطلاب', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSupervisor && user?.college) {
      setSelectedCollege(user.college);
    }
  }, [user, isSupervisor]);

  useEffect(() => {
    fetchStudents();
  }, [currentPage, selectedCollege, selectedYear, photoFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchStudents();
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    if (!isSupervisor) {
      setSelectedCollege('');
    }
    setSelectedYear('');
    setPhotoFilter('');
    setCurrentPage(1);
  };

  const getPhotoUrl = (path?: string) => {
    if (!path) return `${API_BASE_URL}/api/photos/placeholder`;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE_URL}${cleanPath}`;
  };

  // Open Edit Modal
  const openEditModal = (s: Student) => {
    setEditingStudent(s);
    setEditForm({ ...s });
  };

  // Save Edit Student
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    setSavingEdit(true);
    try {
      const res = await apiClient.put(`/students/${editingStudent.id}`, editForm);
      if (res.data?.success) {
        showToast('تم تعديل بيانات الطالب بنجاح ✓', false);
        setEditingStudent(null);
        fetchStudents();
      } else {
        showToast(res.data?.message || 'فشل التعديل', true);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'خطأ أثناء التعديل', true);
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete Student
  const handleConfirmDelete = async () => {
    if (!deletingStudent) return;
    setIsDeleting(true);
    try {
      const res = await apiClient.delete(`/students/${deletingStudent.id}`);
      if (res.data?.success) {
        showToast('تم حذف الطالب بنجاح ✓', false);
        setDeletingStudent(null);
        fetchStudents();
      } else {
        showToast(res.data?.message || 'فشل الحذف', true);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'خطأ أثناء الحذف', true);
    } finally {
      setIsDeleting(false);
    }
  };

  // Download Photos ZIP
  const handleDownloadZip = async () => {
    try {
      const c = isSupervisor && user?.college ? user.college : selectedCollege;
      const params = new URLSearchParams();
      if (c) params.append('college', c);
      showToast('جاري تجهيز وتحميل ملف الصور المضغوط...', false);

      const res = await apiClient.get(`/export/photos-zip?${params.toString()}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `students_photos_${c || 'all'}_${Date.now()}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast('تم تحميل صور الطلاب بنجاح ✓', false);
    } catch (err: any) {
      showToast(err.response?.data?.message || 'فشل تحميل ملف الصور', true);
    }
  };

  // Export Excel
  const handleExportExcel = async () => {
    try {
      const c = isSupervisor && user?.college ? user.college : selectedCollege;
      const params = new URLSearchParams();
      if (c) params.append('college', c);
      if (selectedYear) params.append('year', selectedYear);
      if (searchQuery) params.append('search', searchQuery);
      showToast('جاري تصدير ملف Excel...', false);

      const res = await apiClient.get(`/export/students-excel?${params.toString()}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `students_${c || 'all'}_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast('تم تحميل ملف Excel بنجاح ✓', false);
    } catch (err: any) {
      showToast(err.response?.data?.message || 'فشل تصدير ملف Excel', true);
    }
  };

  return (
    <div>
      {/* Toast Alert */}
      {toastMsg && (
        <div
          className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl font-semibold text-xs shadow-2xl flex items-center gap-2 ${
            toastMsg.isError ? 'bg-red-700 text-white' : 'bg-emerald-700 text-white'
          }`}
        >
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Topbar Actions matching admin_panel.html */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <span className="results-count font-bold" id="total-badge">
            إجمالي: {totalCount} طالب
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportExcel}
            className="bua-btn bua-btn-success bua-btn-sm"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
            </svg>
            <span>تصدير Excel</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadZip}
            className="bua-btn bua-btn-primary bua-btn-sm"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" />
            </svg>
            <span>تحميل صور الطلاب (ZIP)</span>
          </button>
        </div>
      </div>

      {/* Tabs navigation matching admin_panel.html */}
      <div className="flex gap-2 border-b-2 border-[#dce3ef] mb-5">
        <button
          type="button"
          onClick={() => setActiveTab('students')}
          className={`pb-2.5 px-4 text-sm font-bold border-b-2 -mb-[2px] transition cursor-pointer font-cairo ${
            activeTab === 'students'
              ? 'text-blue border-blue'
              : 'text-muted border-transparent hover:text-navy'
          }`}
        >
          قائمة الطلاب
        </button>

        {user?.role?.toLowerCase() === 'superadmin' && (
          <button
            type="button"
            onClick={() => navigate('/users')}
            className="pb-2.5 px-4 text-sm font-bold border-b-2 -mb-[2px] text-muted border-transparent hover:text-navy transition cursor-pointer font-cairo"
          >
            المستخدمون والمشرفون
          </button>
        )}

        {['superadmin', 'admin'].includes(user?.role?.toLowerCase() || '') && (
          <button
            type="button"
            onClick={() => navigate('/audit')}
            className="pb-2.5 px-4 text-sm font-bold border-b-2 -mb-[2px] text-muted border-transparent hover:text-navy transition cursor-pointer font-cairo"
          >
            سجل العمليات
          </button>
        )}
      </div>

      {/* Filter Bar (matching .filter-bar in admin_panel.html) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#dce3ef] shadow-sm mb-5">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-end gap-3">
          {/* Search Query */}
          <div className="flex-1 min-w-[170px] text-right">
            <label className="text-xs font-semibold text-muted block mb-1">بحث بالاسم أو الرقم</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث هنا…"
              className="bua-input text-xs"
            />
          </div>

          {/* Year Filter */}
          <div className="w-48 text-right">
            <label className="text-xs font-semibold text-muted block mb-1">السنة / الفرقة</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bua-select text-xs"
            >
              <option value="">كل الفرق / السنوات</option>
              {BUA_YEARS_FILTER.map((y) => (
                <option key={y.value} value={y.value}>{y.label}</option>
              ))}
            </select>
          </div>

          {/* College Filter */}
          <div className="w-56 text-right">
            <label className="text-xs font-semibold text-muted block mb-1">الكلية</label>
            {isSupervisor ? (
              <div>
                <input
                  type="text"
                  value={user?.college || selectedCollege}
                  disabled
                  className="bua-input text-xs bg-slate-100 text-slate-700 cursor-not-allowed font-semibold border-slate-300"
                />
                <span className="text-[10px] text-blue-700 font-semibold mt-0.5 block">🔒 كليتك المسندة</span>
              </div>
            ) : (
              <select
                value={selectedCollege}
                onChange={(e) => setSelectedCollege(e.target.value)}
                className="bua-select text-xs"
              >
                <option value="">كل الكليات</option>
                {BUA_COLLEGES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>

          {/* Photo Filter */}
          <div className="w-36 text-right">
            <label className="text-xs font-semibold text-muted block mb-1">حالة الصورة</label>
            <select
              value={photoFilter}
              onChange={(e) => setPhotoFilter(e.target.value)}
              className="bua-select text-xs"
            >
              <option value="">الكل</option>
              <option value="with">مع صورة فقط</option>
              <option value="without">بدون صورة</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button type="submit" className="bua-btn bua-btn-primary bua-btn-sm text-xs">
              بحث
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="bua-btn bua-btn-outline bua-btn-sm text-xs"
            >
              مسح
            </button>
          </div>
        </form>
      </div>

      {/* Students Table Card */}
      <div className="bua-card">
        <div className="bua-card-header justify-between bg-[#fafbfd]">
          <div className="flex items-center gap-2">
            <h2>الطلاب المسجلون</h2>
          </div>
          <span className="results-count" id="results-count">
            {students.length} من أصل {totalCount} طالب
          </span>
        </div>

        <div className="bua-tbl-wrap">
          <table className="bua-table">
            <thead>
              <tr>
                <th>الصورة</th>
                <th>الاسم الكامل</th>
                <th>الرقم الجامعي</th>
                <th>الفرقة الدراسية</th>
                <th>الكلية</th>
                <th>البريد والتليفون</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted font-tajawal">
                    <div className="inline-block w-8 h-8 border-2 border-blue border-t-transparent rounded-full animate-spin mb-2" />
                    <div>جارٍ تحميل بيانات الطلاب…</div>
                  </td>
                </tr>
              ) : students.length > 0 ? (
                students.map((s) => {
                  const levelInfo = getAcademicLevelInfo(s.studentId, s.year);
                  return (
                    <tr key={s.id}>
                      <td>
                        <img
                          src={getPhotoUrl(s.imagePath)}
                          alt={s.fullName}
                          className="student-thumb cursor-pointer hover:opacity-80 hover:ring-2 hover:ring-blue transition"
                          title="انقر لتغيير أو اقتصاص الصورة"
                          onClick={() => setCroppingStudent(s)}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `${API_BASE_URL}/api/photos/placeholder`;
                          }}
                        />
                      </td>
                      <td>
                        <div className="font-bold text-navy">{s.fullName}</div>
                        {s.section && (
                          <div className="text-[11px] text-muted">{s.section}</div>
                        )}
                      </td>
                      <td className="text-muted text-xs font-mono font-bold" dir="ltr">
                        {s.studentId}
                      </td>
                      <td>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[rgba(26,58,107,0.08)] text-[#1a3a6b] border border-[rgba(26,58,107,0.18)] font-cairo">
                          {levelInfo.name}
                        </span>
                      </td>
                      <td>
                        <span className="college-tag">{s.college}</span>
                      </td>
                      <td className="text-muted text-xs font-mono" dir="ltr">
                        <div>{s.email || '–'}</div>
                        <div className="text-[11px] text-slate-400">{s.mobile || s.phone || ''}</div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link
                            to={`/card?id=${s.studentId}`}
                            className="bua-btn bua-btn-outline bua-btn-sm text-xs"
                            title="عرض البطاقة"
                          >
                            بطاقة
                          </Link>
                          <button
                            type="button"
                            onClick={() => setCroppingStudent(s)}
                            className="bua-btn bua-btn-outline bua-btn-sm text-xs text-amber-600 hover:bg-amber-50"
                            title="تعديل واقتصاص الصورة"
                          >
                            صورة
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(s)}
                            className="bua-btn bua-btn-primary bua-btn-sm text-xs"
                            title="تعديل"
                          >
                            تعديل
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingStudent(s)}
                            className="bua-btn bua-btn-danger bua-btn-sm text-xs"
                            title="حذف"
                          >
                            حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted font-tajawal">
                    <svg viewBox="0 0 24 24" className="w-12 h-12 fill-slate-300 mx-auto mb-2">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                    </svg>
                    <div>لا توجد نتائج مطابقة لبحثك</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalCount > pageSize && (
          <div className="flex justify-center items-center gap-2 p-4 border-t border-[#f0f4f9]">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="bua-btn bua-btn-outline bua-btn-sm"
            >
              السابق
            </button>
            <span className="text-xs text-muted font-tajawal">
              صفحة {currentPage} من {Math.ceil(totalCount / pageSize)}
            </span>
            <button
              disabled={currentPage >= Math.ceil(totalCount / pageSize)}
              onClick={() => setCurrentPage(p => p + 1)}
              className="bua-btn bua-btn-outline bua-btn-sm"
            >
              التالي
            </button>
          </div>
        )}
      </div>

      {/* EDIT STUDENT MODAL */}
      {editingStudent && (
        <div className="bua-modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setEditingStudent(null); }}>
          <div className="bua-modal max-w-lg">
            <h3 className="text-base font-bold text-navy mb-3">
              تعديل بيانات الطالب ({editingStudent.studentId})
            </h3>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="bua-field mb-2">
                <label>الاسم الكامل</label>
                <input
                  type="text"
                  value={editForm.fullName || ''}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="bua-input text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bua-field mb-2">
                  <label>الرقم القومي</label>
                  <input
                    type="text"
                    value={editForm.nationalId || ''}
                    onChange={(e) => setEditForm({ ...editForm, nationalId: e.target.value })}
                    className="bua-input text-xs"
                  />
                </div>
                <div className="bua-field mb-2">
                  <label>السكشن / الشعبة</label>
                  <input
                    type="text"
                    value={editForm.section || ''}
                    onChange={(e) => setEditForm({ ...editForm, section: e.target.value })}
                    className="bua-input text-xs"
                    placeholder="مثال: سكشن 1 أو أ"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bua-field mb-2">
                  <label>الكلية</label>
                  {isSupervisor ? (
                    <div>
                      <input
                        type="text"
                        value={user?.college || editForm.college || ''}
                        disabled
                        className="bua-input text-xs bg-slate-100 text-slate-700 cursor-not-allowed font-semibold border-slate-300"
                      />
                      <span className="text-[10px] text-blue-700 font-semibold mt-0.5 block">🔒 لا يمكن تغيير كلية الطالب</span>
                    </div>
                  ) : (
                    <select
                      value={editForm.college || ''}
                      onChange={(e) => setEditForm({ ...editForm, college: e.target.value })}
                      className="bua-select text-xs"
                      required
                    >
                      {BUA_COLLEGES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
                <div className="bua-field mb-2">
                  <label>السنة / الفرقة</label>
                  <select
                    value={editForm.year || ''}
                    onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                    className="bua-select text-xs"
                    required
                  >
                    {BUA_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bua-field mb-2">
                  <label>البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={editForm.email || ''}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="bua-input text-xs"
                    dir="ltr"
                  />
                </div>
                <div className="bua-field mb-2">
                  <label>رقم الهاتف</label>
                  <input
                    type="text"
                    value={editForm.mobile || editForm.phone || ''}
                    onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value, phone: e.target.value })}
                    className="bua-input text-xs"
                    dir="ltr"
                    placeholder="01012345678"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="bua-btn bua-btn-outline flex-1 text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="bua-btn bua-btn-primary flex-1 text-xs"
                >
                  {savingEdit ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingStudent && (
        <div className="bua-modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setDeletingStudent(null); }}>
          <div className="bua-modal text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-navy mb-2">تأكيد حذف الطالب</h3>
            <p className="text-xs text-muted font-tajawal mb-4">
              هل أنت متأكد من رغبتك في حذف بيانات الطالب <strong>{deletingStudent.fullName}</strong> ({deletingStudent.studentId})؟
              <br />لا يمكن التراجع عن هذا الإجراء.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeletingStudent(null)}
                className="bua-btn bua-btn-outline flex-1 text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="bua-btn bua-btn-danger flex-1 text-xs"
              >
                {isDeleting ? 'جارٍ الحذف…' : 'تأكيد الحذف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHOTO CROPPER MODAL */}
      {croppingStudent && (
        <PhotoCropperModal
          isOpen={!!croppingStudent}
          onClose={() => setCroppingStudent(null)}
          studentId={croppingStudent.studentId}
          year={croppingStudent.year}
          college={croppingStudent.college}
          onSuccess={(newImagePath) => {
            showToast('تم تحديث واقتصاص صورة الطالب بنجاح ✓', false);
            setStudents(prev =>
              prev.map(item => item.id === croppingStudent.id ? { ...item, imagePath: newImagePath } : item)
            );
            setCroppingStudent(null);
          }}
        />
      )}
    </div>
  );
};
