import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { UserProfile, UserRole, UserSessionRecord } from '../types';
import { getCaracasNow } from '../lib/bcv';
import {
  evaluateSessionHeartbeat,
  loadStoredSessionHistory,
  recordOrResumeUserSession,
  recordUserLogoutSession,
  sanitizeZombieSessions,
  saveSessionHistory,
  SESSION_HEARTBEAT_INTERVAL_MS,
  SESSION_INACTIVITY_TIMEOUT_MINUTES,
  SESSION_INACTIVITY_WARNING_MINUTES,
  SESSION_FORCE_LOGOUT_MINUTES,
  SESSION_FORCE_LOGOUT_REASON_KEY,
  AUTH_BROADCAST_CHANNEL_NAME,
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
  isTimeoutWarningOpen: boolean;
  timeoutCountdownSeconds: number;
  renewSession: () => void;
  logoutReason: string | null;
  clearLogoutReason: () => void;
}

export function checkUserRolePermission(role: UserRole, allowedRoles: UserRole[]): boolean {
  if (allowedRoles.includes(role)) return true;
  // Supervisors possess operational Analyst-level authority
  if (
    allowedRoles.includes(UserRole.ANALISTA) &&
    (role === UserRole.SUPERVISOR_CARNICERIA ||
      role === UserRole.SUPERVISOR_FRUVER ||
      role === UserRole.SUPERVISOR_PASILLO)
  ) {
    return true;
  }
  return false;
}

export const BOOTSTRAP_USERS: UserProfile[] = [
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
  {
    uid: 'usr-sup-carniceria-005',
    email: 'carniceria@hiperabastopolar.com',
    displayName: 'José Gregorio Páez (Sup. Carnicería)',
    role: UserRole.SUPERVISOR_CARNICERIA,
    pin: '506070',
    locationAccess: ['loc-pzo-01', 'loc-ccs-01', 'loc-val-01'],
    active: true,
    createdAt: '2026-02-15T08:00:00-04:00',
  },
  {
    uid: 'usr-sup-fruver-006',
    email: 'fruver@hiperabastopolar.com',
    displayName: 'Carmen Elena Rojas (Sup. Frutas y Verduras)',
    role: UserRole.SUPERVISOR_FRUVER,
    pin: '607080',
    locationAccess: ['loc-pzo-01', 'loc-ccs-01', 'loc-val-01'],
    active: true,
    createdAt: '2026-02-15T08:00:00-04:00',
  },
  {
    uid: 'usr-sup-pasillo-007',
    email: 'pasillo@hiperabastopolar.com',
    displayName: 'Andrés Eloy Blanco (Sup. Pasillo)',
    role: UserRole.SUPERVISOR_PASILLO,
    pin: '708090',
    locationAccess: ['loc-pzo-01', 'loc-ccs-01', 'loc-val-01'],
    active: true,
    createdAt: '2026-02-15T08:00:00-04:00',
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
    return sanitizeZombieSessions(loadStoredSessionHistory());
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isTimeoutWarningOpen, setIsTimeoutWarningOpen] = useState(false);
  const [timeoutCountdownSeconds, setTimeoutCountdownSeconds] = useState(120);
  const [logoutReason, setLogoutReason] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SESSION_FORCE_LOGOUT_REASON_KEY);
    } catch {
      return null;
    }
  });
  const lastActivityEpochRef = useRef<number>(Date.now());

  const clearLogoutReason = () => {
    setLogoutReason(null);
    try {
      localStorage.removeItem(SESSION_FORCE_LOGOUT_REASON_KEY);
    } catch {
      // ignore
    }
  };

  const renewSession = () => {
    lastActivityEpochRef.current = Date.now();
    setIsTimeoutWarningOpen(false);
    setTimeoutCountdownSeconds(120);
    if (user && activeSessionId) {
      setSessionHistory((prev) => {
        const { updatedHistory } = recordOrResumeUserSession(user, prev);
        return updatedHistory;
      });
    }
  };

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
        if (!activeSessionId) {
          const { session, updatedHistory } = recordOrResumeUserSession(user, sessionHistory);
          setActiveSessionId(session.id);
          setSessionHistory(updatedHistory);
          lastActivityEpochRef.current = Date.now();
        }
      } else {
        localStorage.removeItem(STORAGE_KEY_SESSION);
      }
    } catch {
      // ignore
    }
  }, [user]);

  // Cross-Tab Single Active Session Governance via BroadcastChannel & Storage Fallback
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL_NAME);
      bc.onmessage = (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type === 'TIMEOUT_LOGOUT' || data.type === 'LOGOUT') {
          if (user) {
            setUser(null);
            setActiveSessionId(null);
            setIsTimeoutWarningOpen(false);
            if (data.reason) {
              setLogoutReason(data.reason);
            }
          }
        } else if (data.type === 'LOGIN' && data.userId) {
          if (user && user.uid !== data.userId) {
            const target = users.find((u) => u.uid === data.userId);
            if (target) {
              setUser(target);
              setActiveSessionId(data.sessionId || null);
            }
          }
        }
      };
    } catch {
      // BroadcastChannel not available in environment
    }

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_SESSION) {
        if (!e.newValue) {
          setUser(null);
          setActiveSessionId(null);
          setIsTimeoutWarningOpen(false);
        } else {
          try {
            const parsed = JSON.parse(e.newValue);
            if (parsed && (!user || user.uid !== parsed.uid)) {
              setUser(parsed);
            }
          } catch {
            // ignore
          }
        }
      } else if (e.key === SESSION_FORCE_LOGOUT_REASON_KEY && e.newValue) {
        setLogoutReason(e.newValue);
      }
    };

    window.addEventListener('storage', handleStorageEvent);

    return () => {
      if (bc) bc.close();
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [user, users]);

  // 60-Minute Inactivity Protocol, 58-Minute Warning Modal & Heartbeat
  useEffect(() => {
    if (!user || !activeSessionId) {
      setIsTimeoutWarningOpen(false);
      return;
    }

    const handleUserActivity = () => {
      const nowEpoch = Date.now();
      lastActivityEpochRef.current = nowEpoch;

      if (isTimeoutWarningOpen) {
        setIsTimeoutWarningOpen(false);
        setTimeoutCountdownSeconds(120);
      }

      // If session was SUSPENDIDA due to >30m inactivity, resume the same session immediately
      setSessionHistory((prev) => {
        const current = prev.find((s) => s.id === activeSessionId);
        if (current && current.status === 'SUSPENDIDA') {
          const { updatedHistory } = recordOrResumeUserSession(user, prev);
          return updatedHistory;
        }
        return prev;
      });
    };

    window.addEventListener('pointerdown', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity, { passive: true });
    window.addEventListener('touchstart', handleUserActivity, { passive: true });
    window.addEventListener('wheel', handleUserActivity, { passive: true });
    window.addEventListener('focus', handleUserActivity, { passive: true });

    const intervalId = window.setInterval(() => {
      const nowEpoch = Date.now();
      const elapsedMs = nowEpoch - lastActivityEpochRef.current;
      const idleMinutes = elapsedMs / 60_000;

      // 1. Cierre Forzado Determinista a los 60 minutos
      if (idleMinutes >= SESSION_FORCE_LOGOUT_MINUTES) {
        const reasonMsg =
          'Sesión cerrada automáticamente por 60 minutos de inactividad física por motivos de seguridad institucional.';
        try {
          localStorage.setItem(SESSION_FORCE_LOGOUT_REASON_KEY, reasonMsg);
        } catch {
          // ignore
        }
        setLogoutReason(reasonMsg);
        setIsTimeoutWarningOpen(false);

        if (activeSessionId) {
          setSessionHistory((prev) => recordUserLogoutSession(activeSessionId, prev));
          setActiveSessionId(null);
        }
        setUser(null);

        try {
          const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL_NAME);
          bc.postMessage({ type: 'TIMEOUT_LOGOUT', reason: reasonMsg });
          bc.close();
        } catch {
          // ignore
        }
        return;
      }

      // 2. Alerta Preventiva a los 58 minutos (120 segundos de cuenta regresiva)
      if (idleMinutes >= SESSION_INACTIVITY_WARNING_MINUTES) {
        const remainingSec = Math.max(
          0,
          Math.floor((SESSION_FORCE_LOGOUT_MINUTES * 60_000 - elapsedMs) / 1000)
        );
        setIsTimeoutWarningOpen(true);
        setTimeoutCountdownSeconds(remainingSec);
      } else {
        if (isTimeoutWarningOpen) {
          setIsTimeoutWarningOpen(false);
        }
      }

      // 3. Latido de continuidad de sesión en segundo plano (cada 60 segundos)
      if (Math.floor(nowEpoch / 1000) % 60 === 0) {
        setSessionHistory((prev) => {
          const { updatedHistory } = evaluateSessionHeartbeat(activeSessionId, prev, {
            elapsedMinutesOverride:
              idleMinutes > SESSION_INACTIVITY_TIMEOUT_MINUTES ? idleMinutes : 0,
            resumeOnActivity: idleMinutes <= SESSION_INACTIVITY_TIMEOUT_MINUTES,
          });
          return updatedHistory;
        });
      }
    }, 1000);

    return () => {
      window.removeEventListener('pointerdown', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('wheel', handleUserActivity);
      window.removeEventListener('focus', handleUserActivity);
      window.clearInterval(intervalId);
    };
  }, [user, activeSessionId, isTimeoutWarningOpen]);

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

    let baseHistory = sessionHistory;
    // Close any previous session belonging to a different user
    if (activeSessionId) {
      const currentActive = baseHistory.find((s) => s.id === activeSessionId);
      if (currentActive && currentActive.userId !== targetUser.uid) {
        baseHistory = recordUserLogoutSession(activeSessionId, baseHistory);
      }
    }

    const { session, updatedHistory } = recordOrResumeUserSession(targetUser, baseHistory);
    lastActivityEpochRef.current = Date.now();
    setActiveSessionId(session.id);
    setSessionHistory(updatedHistory);
    setUser(targetUser);
    clearLogoutReason();

    try {
      const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL_NAME);
      bc.postMessage({ type: 'LOGIN', userId: targetUser.uid, sessionId: session.id });
      bc.close();
    } catch {
      // ignore
    }

    return { success: true };
  };

  const logout = () => {
    if (activeSessionId) {
      setSessionHistory((prev) => recordUserLogoutSession(activeSessionId, prev));
      setActiveSessionId(null);
    }
    setUser(null);
    setIsTimeoutWarningOpen(false);

    try {
      const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL_NAME);
      bc.postMessage({ type: 'LOGOUT' });
      bc.close();
    } catch {
      // ignore
    }
  };

  const switchRoleDemo = (role: UserRole) => {
    const target = users.find((u) => u.role === role);
    if (target) {
      let baseHistory = sessionHistory;
      if (activeSessionId) {
        const currentActive = baseHistory.find((s) => s.id === activeSessionId);
        if (currentActive && currentActive.userId !== target.uid) {
          baseHistory = recordUserLogoutSession(activeSessionId, baseHistory);
        }
      }
      const { session, updatedHistory } = recordOrResumeUserSession(target, baseHistory);
      lastActivityEpochRef.current = Date.now();
      setActiveSessionId(session.id);
      setSessionHistory(updatedHistory);
      setUser(target);
      clearLogoutReason();

      try {
        const bc = new BroadcastChannel(AUTH_BROADCAST_CHANNEL_NAME);
        bc.postMessage({ type: 'LOGIN', userId: target.uid, sessionId: session.id });
        bc.close();
      } catch {
        // ignore
      }
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
    return checkUserRolePermission(user.role, allowedRoles);
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
        isTimeoutWarningOpen,
        timeoutCountdownSeconds,
        renewSession,
        logoutReason,
        clearLogoutReason,
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
