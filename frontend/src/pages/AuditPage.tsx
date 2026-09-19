import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export const AuditPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [selectedAction, setSelectedAction] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchActions = async () => {
    try {
      const res = await apiClient.get('/audit/actions');
      if (res.data?.success) {
        setActions(res.data.data || []);
      }
    } catch { }
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedAction) params.append('action', selectedAction);
      if (search) params.append('search', search);
      params.append('page', page.toString());
      params.append('pageSize', '20');

      const res = await apiClient.get(`/audit?${params.toString()}`);
      if (res.data?.success) {
        setLogs(res.data.data || []);
        setTotalPages(res.data.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActions();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [page, selectedAction]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  return (
    <div>
      {/* Header */}
      <div className="text-right mb-5">
        <h1 className="text-lg sm:text-xl font-bold text-navy m-0">سجل العمليات والأمان</h1>
        <p className="text-xs text-muted font-tajawal mt-0.5 m-0">
          تتبع فوري وموثق لجميع إجراءات النظام، عمليات تسجيل الدخول، استيراد الملفات، وتعديلات البطاقات
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#dce3ef] shadow-sm mb-5">
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] text-right">
            <label className="text-xs font-semibold text-muted block mb-1">
              بحث في التفاصيل أو الهدف أو IP
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث هنا…"
              className="bua-input text-xs"
            />
          </div>

          <div className="w-56 text-right">
            <label className="text-xs font-semibold text-muted block mb-1">نوع العملية</label>
            <select
              value={selectedAction}
              onChange={(e) => { setSelectedAction(e.target.value); setPage(1); }}
              className="bua-select text-xs"
            >
              <option value="">جميع أنواع العمليات</option>
              {actions.map((act) => (
                <option key={act} value={act}>{act}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="bua-btn bua-btn-primary bua-btn-sm text-xs"
          >
            تطبيق الفلتر
          </button>
        </form>
      </div>

      {/* Logs Table Card */}
      <div className="bua-card">
        <div className="bua-card-header bg-[#fafbfd] justify-between">
          <h2>سجلات تدقيق النظام</h2>
          <span className="results-count font-bold">
            صفحة {page} من {totalPages}
          </span>
        </div>

        <div className="bua-tbl-wrap">
          <table className="bua-table">
            <thead>
              <tr>
                <th>التاريخ والوقت</th>
                <th>المستخدم</th>
                <th>العملية</th>
                <th>الهدف</th>
                <th>التفاصيل</th>
                <th>عنوان IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted font-tajawal">
                    جارٍ تحميل سجلات الأمان…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted font-tajawal">
                    لم يتم تسجيل أي عمليات مطابقة
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-muted font-mono text-[11px]" dir="ltr">
                      {new Date(log.createdAt).toLocaleString('ar-EG')}
                    </td>
                    <td>
                      {log.user ? (
                        <div>
                          <div className="font-bold text-navy">{log.user.username}</div>
                          <div className="text-[10px] text-muted">{log.user.role}</div>
                        </div>
                      ) : (
                        <span className="text-muted text-xs">نظام تلقائي</span>
                      )}
                    </td>
                    <td>
                      <span className="student-id-badge text-[10px]">
                        {log.action}
                      </span>
                    </td>
                    <td className="text-navy font-mono text-xs">
                      {log.target || '–'}
                    </td>
                    <td className="text-muted text-xs max-w-xs truncate">
                      {log.detail || '–'}
                    </td>
                    <td className="text-muted font-mono text-xs" dir="ltr">
                      {log.ip || '–'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 p-4 border-t border-[#f0f4f9]">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="bua-btn bua-btn-outline bua-btn-sm"
            >
              السابق
            </button>
            <span className="text-xs text-muted font-tajawal">
              صفحة {page} من {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="bua-btn bua-btn-outline bua-btn-sm"
            >
              التالي
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
