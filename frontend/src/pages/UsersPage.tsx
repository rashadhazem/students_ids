import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';

const COLLEGES = [
  'كلية الطب البشري',
  'كلية طب الفم والأسنان',
  'كلية العلاج الطبيعي',
  'كلية الصيدلة فارما D',
  'كلية صيدلة اكلينيكية',
  'كلية التمريض',
  'كلية تكنولوجيا العلوم الصحية التطبيقية',
  'كلية الهندسة والتكنولوجيا',
  'كلية الذكاء الاصطناعي وإدارة البيانات',
  'كلية الفنون التطبيقية',
  'كلية الفنون التعبيرية والعلوم السينمائية',
  'كلية الإدارة والعلوم المالية والاقتصادية',
  'كلية اللغات والعلوم الإنسانية'
];

export const UsersPage: React.FC = () => {
  const { user: currentUser, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Add User Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('Officer');
  const [newCollege, setNewCollege] = useState('');

  // Reset Password Modal
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');

  const [modalError, setModalError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const showToast = (text: string, isError = false) => {
    setToastMsg({ text, isError });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/users?pageSize=50');
      if (res.data?.success) {
        setUsers(res.data.data || res.data.users || []);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    try {
      const res = await apiClient.post('/users', {
        username: newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
        college: newCollege || undefined
      });

      if (res.data?.success) {
        setShowAddModal(false);
        setNewUsername('');
        setNewEmail('');
        setNewPassword('');
        showToast('تمت إضافة المستخدم بنجاح ✓', false);
        fetchUsers();
      }
    } catch (err: any) {
      setModalError(err.response?.data?.message || 'فشل إضافة المستخدم');
    }
  };

  const handleToggleActive = async (id: number) => {
    try {
      await apiClient.patch(`/users/${id}/toggle-active`);
      showToast('تم تعديل حالة الحساب بنجاح ✓', false);
      fetchUsers();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'فشل تغيير حالة الحساب', true);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId || !resetNewPassword) return;

    try {
      await apiClient.post(`/users/${resetUserId}/reset-password`, {
        newPassword: resetNewPassword
      });
      setResetUserId(null);
      setResetNewPassword('');
      showToast('تم تحديث كلمة المرور بنجاح ✓', false);
    } catch (err: any) {
      showToast(err.response?.data?.message || 'فشل تحديث كلمة المرور', true);
    }
  };

  const handleDeleteUser = async (id: number, username: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${username}" نهائياً؟`)) return;

    try {
      await apiClient.delete(`/users/${id}`);
      showToast('تم حذف المستخدم بنجاح ✓', false);
      fetchUsers();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'فشل حذف المستخدم', true);
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

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
        <div className="text-right">
          <h1 className="text-lg sm:text-xl font-bold text-navy m-0">إدارة المستخدمين والمشرفين</h1>
          <p className="text-xs text-muted font-tajawal mt-0.5 m-0">
            التحكم في حسابات مسؤولي الكليات وموظفي شؤون الطلاب ومديري النظام
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="bua-btn bua-btn-primary bua-btn-sm"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          <span>إضافة مستخدم جديد</span>
        </button>
      </div>

      {/* Users Table Card */}
      <div className="bua-card">
        <div className="bua-card-header bg-[#fafbfd] justify-between">
          <h2>المستخدمون المسجلون بالمنظومة</h2>
          <span className="results-count font-bold">
            إجمالي: {users.length} مستخدم
          </span>
        </div>

        <div className="bua-tbl-wrap">
          <table className="bua-table">
            <thead>
              <tr>
                <th>المستخدم / الاسم</th>
                <th>البريد الإلكتروني</th>
                <th>الدور والصلاحية</th>
                <th>الكلية التابع لها</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted font-tajawal">
                    جارٍ تحميل قائمة المستخدمين…
                  </td>
                </tr>
              ) : users.length > 0 ? (
                users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="font-bold text-navy">{u.fullName || u.username}</div>
                      <div className="text-[10px] text-muted font-mono">{u.username}</div>
                    </td>
                    <td className="font-mono text-xs text-muted" dir="ltr">
                      {u.email}
                    </td>
                    <td>
                      <span className="year-tag">
                        {u.role === 'SuperAdmin'
                          ? 'المدير العام'
                          : u.role === 'Admin'
                          ? 'مشرف كلية'
                          : 'شئون طلاب'}
                      </span>
                    </td>
                    <td>
                      {u.college ? (
                        <span className="college-tag">{u.college}</span>
                      ) : (
                        <span className="text-xs text-muted font-tajawal">عام (كافة الكليات)</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(u.id)}
                        disabled={u.id === currentUser?.id}
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold cursor-pointer transition ${
                          u.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                            : 'bg-red-50 text-red-700 border border-red-300 hover:bg-red-100'
                        }`}
                      >
                        {u.isActive ? '● نشط' : '○ موقوف'}
                      </button>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setResetUserId(u.id)}
                          className="bua-btn bua-btn-outline bua-btn-sm text-xs"
                          title="إعادة تعيين كلمة المرور"
                        >
                          تغيير السر
                        </button>
                        {isSuperAdmin && u.id !== currentUser?.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            className="bua-btn bua-btn-danger bua-btn-sm text-xs"
                            title="حذف"
                          >
                            حذف
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted font-tajawal">
                    لا يوجد مستخدمون إضافيون
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="bua-modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <div className="bua-modal max-w-md">
            <h3 className="text-base font-bold text-navy mb-3">إضافة مستخدم جديد</h3>

            {modalError && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold mb-3">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="bua-field mb-2">
                <label>اسم المستخدم (لتسجيل الدخول)</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="مثال: dr_ahmed"
                  className="bua-input text-xs"
                  required
                />
              </div>

              <div className="bua-field mb-2">
                <label>البريد الإلكتروني الجامعي</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@bua.edu.eg"
                  className="bua-input text-xs text-left"
                  dir="ltr"
                  required
                />
              </div>

              <div className="bua-field mb-2">
                <label>كلمة المرور المبدئية</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bua-input text-xs text-left"
                  dir="ltr"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bua-field mb-2">
                  <label>الدور والصلاحية</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="bua-select text-xs"
                  >
                    <option value="Admin">مشرف كلية (Admin)</option>
                    <option value="Officer">موظف شئون طلاب (Staff)</option>
                    <option value="SuperAdmin">مدير عام (SuperAdmin)</option>
                  </select>
                </div>

                <div className="bua-field mb-2">
                  <label>الكلية التابع لها</label>
                  <select
                    value={newCollege}
                    onChange={(e) => setNewCollege(e.target.value)}
                    className="bua-select text-xs"
                  >
                    <option value="">جميع الكليات (عام)</option>
                    {COLLEGES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="bua-btn bua-btn-outline flex-1 text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bua-btn bua-btn-primary flex-1 text-xs"
                >
                  إنشاء الحساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetUserId && (
        <div className="bua-modal-bg" onClick={(e) => { if (e.target === e.currentTarget) setResetUserId(null); }}>
          <div className="bua-modal max-w-sm">
            <h3 className="text-base font-bold text-navy mb-2">إعادة تعيين كلمة المرور</h3>
            <p className="text-xs text-muted font-tajawal mb-4">
              أدخل كلمة المرور الجديدة للمستخدم المحدد
            </p>

            <form onSubmit={handleResetPassword}>
              <div className="bua-field mb-4">
                <label>كلمة المرور الجديدة</label>
                <input
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="8 أحرف على الأقل"
                  className="bua-input text-xs text-left"
                  dir="ltr"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setResetUserId(null)}
                  className="bua-btn bua-btn-outline flex-1 text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="bua-btn bua-btn-primary flex-1 text-xs"
                >
                  تأكيد التغيير
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
