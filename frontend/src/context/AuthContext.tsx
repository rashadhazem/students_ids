import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export interface UserProfile {
  id: number;
  email: string;
  fullName: string;
  username?: string;
  userName?: string;
  role: 'superadmin' | 'admin' | 'officer' | 'student' | string;
  college?: string | null;
  studentId?: string | null;
  isActive?: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  login: (credentials: { username: string; password: string }) => Promise<{ success: boolean; message?: string; user?: UserProfile }>;
  studentLogin: (credentials: { email: string; nationalId: string }) => Promise<{ success: boolean; message?: string; user?: UserProfile }>;
  logout: () => void;
  updateCurrentUser: (newUser: UserProfile, newToken?: string) => void;
  loading: boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isStudent: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('bua_token'));
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('bua_token');
      if (!savedToken) {
        setLoading(false);
        return;
      }

      try {
        const res = await apiClient.get('/auth/me');
        if (res.data?.success && res.data?.user) {
          setUser(res.data.user);
          setToken(savedToken);
        } else {
          logout();
        }
      } catch (err) {
        console.error('Failed to verify session:', err);
        logout();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async ({ username, password }: { username: string; password: string }) => {
    try {
      const res = await apiClient.post('/auth/login', { username, password });
      if (res.data?.success && res.data?.token) {
        localStorage.setItem('bua_token', res.data.token);
        localStorage.setItem('bua_user', JSON.stringify(res.data.user));
        setToken(res.data.token);
        setUser(res.data.user);
        return { success: true, user: res.data.user };
      }
      return { success: false, message: res.data?.message || 'فشل تسجيل الدخول' };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.message || 'فشل تسجيل الدخول، تحقق من البيانات المدخلة'
      };
    }
  };

  const studentLogin = async ({ email, nationalId }: { email: string; nationalId: string }) => {
    try {
      const res = await apiClient.post('/auth/student-login', { email, nationalId });
      if (res.data?.success && res.data?.token) {
        localStorage.setItem('bua_token', res.data.token);
        localStorage.setItem('bua_user', JSON.stringify(res.data.user));
        setToken(res.data.token);
        setUser(res.data.user);
        return { success: true, user: res.data.user };
      }
      return { success: false, message: res.data?.message || 'بيانات الدخول غير صحيحة' };
    } catch (err: any) {
      return {
        success: false,
        message: err.response?.data?.message || 'تعذر تسجيل الدخول، تأكد من الرقم القومي والبريد الجامعي'
      };
    }
  };

  const updateCurrentUser = (newUser: UserProfile, newToken?: string) => {
    setUser(newUser);
    localStorage.setItem('bua_user', JSON.stringify(newUser));
    if (newToken) {
      setToken(newToken);
      localStorage.setItem('bua_token', newToken);
    }
  };

  const logout = () => {
    localStorage.removeItem('bua_token');
    localStorage.removeItem('bua_user');
    setToken(null);
    setUser(null);
  };

  const normalizedRole = user?.role?.toLowerCase() || '';
  const isSuperAdmin = normalizedRole === 'superadmin';
  const isAdmin = isSuperAdmin || normalizedRole === 'admin';
  const isStaff = isAdmin || normalizedRole === 'officer' || normalizedRole === 'staff';
  const isStudent = normalizedRole === 'student';

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        studentLogin,
        logout,
        updateCurrentUser,
        loading,
        isAuthenticated: !!user,
        isSuperAdmin,
        isAdmin,
        isStaff,
        isStudent
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
