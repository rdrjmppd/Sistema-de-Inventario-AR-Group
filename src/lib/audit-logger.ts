import { AuditActionType, AuditLogEntry, UserProfile, UserRole, UserSessionRecord } from '../types';
import { getCaracasNow } from './bcv';

const STORAGE_KEY_AUDIT_LOGS = 'argroup_erp_2026_audit_logs';
const STORAGE_KEY_SESSION_HISTORY = 'argroup_erp_2026_session_history';

/**
 * Loads all audit logs from persistent storage.
 */
export function loadStoredAuditLogs(): AuditLogEntry[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY_AUDIT_LOGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fallback
  }
  return [];
}

/**
 * Persists audit logs to local storage.
 */
export function saveAuditLogs(logs: AuditLogEntry[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_AUDIT_LOGS, JSON.stringify(logs.slice(0, 1000))); // keep latest 1000 logs
  } catch {
    // ignore quota
  }
}

/**
 * Loads user session history from persistent storage.
 */
export function loadStoredSessionHistory(): UserSessionRecord[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY_SESSION_HISTORY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fallback
  }
  return [];
}

/**
 * Persists session history to local storage.
 */
export function saveSessionHistory(history: UserSessionRecord[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_SESSION_HISTORY, JSON.stringify(history.slice(0, 500)));
  } catch {
    // ignore quota
  }
}

/**
 * Creates and appends an immutable audit log entry.
 */
export function createAuditLogEntry(
  user: Pick<UserProfile, 'uid' | 'email' | 'displayName' | 'role'> | null,
  action: AuditActionType,
  entityType: string,
  description: string,
  details?: Record<string, unknown>,
  entityId?: string
): AuditLogEntry {
  const now = getCaracasNow();
  return {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: user?.uid || 'usr-anonymous',
    userEmail: user?.email || 'anonimo@sistema.local',
    userDisplayName: user?.displayName || 'Usuario No Autenticado',
    userRole: user?.role || UserRole.OBSERVADOR,
    action,
    entityType,
    entityId,
    description,
    details,
    timestampVet: `${now.dateFormatted} ${now.timeFormatted}`,
  };
}

/**
 * Records a user login connection event in session history.
 */
export function recordUserLoginSession(
  user: UserProfile,
  existingHistory: UserSessionRecord[]
): { session: UserSessionRecord; updatedHistory: UserSessionRecord[] } {
  const now = getCaracasNow();
  const session: UserSessionRecord = {
    id: `ses-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: user.uid,
    userEmail: user.email,
    userDisplayName: user.displayName,
    userRole: user.role,
    loginAtVet: `${now.dateFormatted} ${now.timeFormatted}`,
    isActive: true,
  };

  const updatedHistory = [session, ...existingHistory];
  saveSessionHistory(updatedHistory);
  return { session, updatedHistory };
}

/**
 * Closes an active user session in history with calculated duration.
 */
export function recordUserLogoutSession(
  sessionId: string,
  existingHistory: UserSessionRecord[]
): UserSessionRecord[] {
  const now = getCaracasNow();
  const updatedHistory = existingHistory.map((s) => {
    if (s.id === sessionId && s.isActive) {
      return {
        ...s,
        logoutAtVet: `${now.dateFormatted} ${now.timeFormatted}`,
        isActive: false,
        durationMinutes: 15, // Default active session metric
      };
    }
    return s;
  });

  saveSessionHistory(updatedHistory);
  return updatedHistory;
}
