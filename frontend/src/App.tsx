import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { StudentsPage } from './pages/StudentsPage';
import { RegisterStudentPage } from './pages/RegisterStudentPage';
import { BulkImportPage } from './pages/BulkImportPage';
import { StudentCardPage } from './pages/StudentCardPage';
import { UsersPage } from './pages/UsersPage';
import { AuditPage } from './pages/AuditPage';
import { ExportPage } from './pages/ExportPage';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode; allowedRoles?: string[] }> = ({
  children,
  allowedRoles
}) => {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1f3c] flex items-center justify-center text-gold2 text-sm font-semibold">
        جارٍ تهيئة المنظومة...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const role = user?.role?.toLowerCase() || '';

  // Students are NEVER allowed in admin views / dashboard: redirect directly to their card/photo upload page
  if (role === 'student' && (!allowedRoles || !allowedRoles.includes('student'))) {
    return <Navigate to={`/card${user?.studentId ? `?id=${user.studentId}` : ''}`} replace />;
  }

  if (allowedRoles && user) {
    const hasRole = allowedRoles.some(r => r.toLowerCase() === role) || role === 'superadmin';
    if (!hasRole) {
      if (role === 'student' || user.studentId) {
        return <Navigate to={`/card${user.studentId ? `?id=${user.studentId}` : ''}`} replace />;
      }
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};

// Main App Layout matching base.html
const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f0f4f9] text-[#1a2744] font-cairo">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="bua-main">
        <Navbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main className="bua-content">
          {children}
        </main>
        <footer className="py-4 px-6 text-[#6b7a99] text-xs font-tajawal border-t border-[#dce3ef] text-center bg-white">
          © 2026 جامعة بدر بأسيوط – جميع الحقوق محفوظة
        </footer>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Login */}
          <Route path="/login" element={<LoginPage />} />

          {/* Standalone Student Card (matching student_card.html full screen) */}
          <Route path="/card" element={<StudentCardPage />} />
          <Route path="/card/:id" element={<StudentCardPage />} />
          <Route path="/student/:id" element={<StudentCardPage />} />

          {/* Dashboard */}
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRoles={['superadmin', 'admin', 'officer', 'staff']}>
                <MainLayout>
                  <DashboardPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Students Directory */}
          <Route
            path="/students"
            element={
              <ProtectedRoute allowedRoles={['superadmin', 'admin', 'officer', 'staff']}>
                <MainLayout>
                  <StudentsPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Register New Student */}
          <Route
            path="/students/new"
            element={
              <ProtectedRoute allowedRoles={['superadmin', 'admin', 'officer', 'staff']}>
                <MainLayout>
                  <RegisterStudentPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Bulk Import */}
          <Route
            path="/bulk-import"
            element={
              <ProtectedRoute allowedRoles={['superadmin', 'admin', 'officer', 'staff']}>
                <MainLayout>
                  <BulkImportPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* User Management */}
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
                <MainLayout>
                  <UsersPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Security & Audit Logs */}
          <Route
            path="/audit"
            element={
              <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
                <MainLayout>
                  <AuditPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Export Center */}
          <Route
            path="/export"
            element={
              <ProtectedRoute allowedRoles={['superadmin', 'admin', 'officer', 'staff']}>
                <MainLayout>
                  <ExportPage />
                </MainLayout>
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;

