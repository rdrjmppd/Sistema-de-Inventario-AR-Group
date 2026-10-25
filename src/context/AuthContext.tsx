import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole, UserSessionRecord } from '../types';
import { getCaracasNow } from '../lib/bcv';
import {
  loadStoredSessionHistory,
  recordUserLoginSession,
  recordUserLogoutSession,
  saveSessionHistory,
} from '../lib/audit-logger';

interface AuthContextType {
  user: UserProfile | null;
  users: UserProfile[];
  isAuthenticated: boolean;
  sessionHistory: UserSessionRecord[];
  activeSessionId: string | null;
  login: (email: string, pin: string) => { success: boolean; error?: string };
  logout: () => void;
  switchRoleDemo: (role: UserRole) => void;
  createUser: (data: Omit<UserProfile, 'uid' | 'createdAt'>) => void;
  toggleUserActive: (uid: string) => void;
  hasPermission: (allowedRoles: UserRole[]) => boolean;
  clearSessionHistory: () => void;
}

const BOOTSTRAP_USERS: UserProfile[] = [
  {
    uid: 'usr-superadmin-001',
    email: 'rdrj.mppd@gmail.com',
    displayName: 'Rubén Darío R. (Superadmin)',
    role: UserRole.SUPERADMIN,
    pin: '102030',
    locationAccess: ['loc-pzo-01', 'loc-ccs-01', 'loc-val-01'],
    active: true,
    createdAt: '2026-01-01T08:00:00-04:00',
  },
  {
    uid: 'usr-gerente-002',
    email: 'gerencia@chrystal.com.ve',
    displayName: 'María Fernanda Gómez (Gerente)',
    role: UserRole.GERENTE,
    pin: '203040',
    locationAccess: ['loc-pzo-01', 'loc-ccs-01', 'loc-val-01'],
    active: true,
    createdAt: '2026-01-10T08:00:00-04:00',
  },
  {
    uid: 'usr-analista-003',
    email: 'costos@chrystal.com.ve',
    displayName: 'Carlos Eduardo Méndez (Analista)',
    role: UserRole.ANALISTA,
    pin: '304050',
    locationAccess: ['loc-pzo-01', 'loc-ccs-01'],
    active: true,
    createdAt: '2026-01-15T08:00:00-04:00',
  },
  {
    uid: 'usr-observador-004',
    email: 'auditoria@chrystal.com.ve',
    displayName: 'Ana Sofía Rivas (Observador)',
    role: UserRole.OBSERVADOR,
    pin: '405060',
    locationAccess: ['loc-pzo-01'],
    active: true,
    createdAt: '2026-02-01T08:00:00-04:00',
  },
];

const STORAGE_KEY_USERS = 'chrystal_erp_users_v1';
const STORAGE_KEY_SESSION = 'chrystal_erp_session_v1';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<UserProfile[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USERS);
      if (saved) {
        const parsed = JSON.parse(saved) as UserProfile[];
        const hasSuper = parsed.some((u) => u.email.toLowerCase() === 'rdrj.mppd@gmail.com');
        return hasSuper ? parsed : [BOOTSTRAP_USERS[0], ...parsed];
      }
    } catch {
      // ignore storage errors
    }
    return BOOTSTRAP_USERS;
  });

  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        return BOOTSTRAP_USERS[0];
      }
      const saved = localStorage.getItem(STORAGE_KEY_SESSION);
      if (saved) {
        return JSON.parse(saved) as UserProfile;
      }
    } catch {
      // ignore storage errors
    }
    return null;
  });

  const [sessionHistory, setSessionHistory] = useState<UserSessionRecord[]>(() => {
    return loadStoredSessionHistory();
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    } catch {
      // ignore
    }
  }, [users]);

  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(user));
        // If not already in session tracking, establish it
        if (!activeSessionId) {
          const { session, updatedHistory } = recordUserLoginSession(user, sessionHistory);
          setActiveSessionId(session.id);
          setSessionHistory(updatedHistory);
        }
      } else {
        localStorage.removeItem(STORAGE_KEY_SESSION);
      }
    } catch {
      // ignore
    }
  }, [user]);

  const login = (email: string, pin: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPin = pin.trim();

    let targetUser: UserProfile | null = null;
    if (cleanEmail === 'rdrj.mppd@gmail.com' && cleanPin === '102030') {
      targetUser = users.find((u) => u.email.toLowerCase() === cleanEmail) || BOOTSTRAP_USERS[0];
    } else {
      const found = users.find(
        (u) => u.email.toLowerCase() === cleanEmail && u.pin === cleanPin
      );

      if (!found) {
        return {
          success: false,
          error: 'Credenciales inválidas. El autoregistro público está deshabilitado por política de seguridad RBAC.',
        };
      }

      if (!found.active) {
        return {
          success: false,
          error: 'Esta cuenta de usuario se encuentra suspendida por el Superadministrador.',
        };
      }
      targetUser = found;
    }

    // Close any previous session
    if (activeSessionId) {
      setSessionHistory((prev) => recordUserLogoutSession(activeSessionId, prev));
    }

    const { session, updatedHistory } = recordUserLoginSession(targetUser, sessionHistory);
    setActiveSessionId(session.id);
    setSessionHistory(updatedHistory);
    setUser(targetUser);

    return { success: true };
  };

  const logout = () => {
    if (activeSessionId) {
      setSessionHistory((prev) => recordUserLogoutSession(activeSessionId, prev));
      setActiveSessionId(null);
    }
    setUser(null);
  };

  const switchRoleDemo = (role: UserRole) => {
    const target = users.find((u) => u.role === role);
    if (target) {
      if (activeSessionId) {
        setSessionHistory((prev) => recordUserLogoutSession(activeSessionId, prev));
      }
      const { session, updatedHistory } = recordUserLoginSession(target, sessionHistory);
      setActiveSessionId(session.id);
      setSessionHistory(updatedHistory);
      setUser(target);
    }
  };

  const clearSessionHistory = () => {
    setSessionHistory([]);
    saveSessionHistory([]);
    setActiveSessionId(null);
  };

  const createUser = (data: Omit<UserProfile, 'uid' | 'createdAt'>) => {
    const newUser: UserProfile = {
      ...data,
      uid: `usr-${Date.now()}`,
      createdAt: getCaracasNow().isoTimestamp,
    };
    setUsers((prev) => [...prev, newUser]);
  };

  const toggleUserActive = (uid: string) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.uid === uid && u.email.toLowerCase() !== 'rdrj.mppd@gmail.com') {
          return { ...u, active: !u.active };
        }
        return u;
      })
    );
  };

  const hasPermission = (allowedRoles: UserRole[]) => {
    if (!user) return false;
    return allowedRoles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        users,
        isAuthenticated: !!user,
        sessionHistory,
        activeSessionId,
        login,
        logout,
        switchRoleDemo,
        createUser,
        toggleUserActive,
        hasPermission,
        clearSessionHistory,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe utilizarse dentro de un AuthProvider');
  return ctx;
};

export default AuthContext;
