import {
  AuditActionType,
  AuditLogEntry,
  SessionStatus,
  UserProfile,
  UserRole,
  UserSessionRecord,
} from '../types';
import { getCaracasNow } from './bcv';

const STORAGE_KEY_AUDIT_LOGS = 'argroup_erp_2026_audit_logs';
const STORAGE_KEY_SESSION_HISTORY = 'argroup_erp_2026_session_history';

export const SESSION_INACTIVITY_TIMEOUT_MINUTES = 30;
export const SESSION_INACTIVITY_WARNING_MINUTES = 58;
export const SESSION_FORCE_LOGOUT_MINUTES = 60;
export const SESSION_HEARTBEAT_INTERVAL_MS = 60_000;
export const SESSION_FORCE_LOGOUT_REASON_KEY = 'chrystal_erp_logout_reason';
export const AUTH_BROADCAST_CHANNEL_NAME = 'chrystal_auth_channel';

/**
 * Formats current Caracas time as "DD/MM/YYYY HH:mm:ss".
 */
export function getFormattedCaracasNow(): string {
  const now = getCaracasNow();
  return `${now.dateFormatted} ${now.timeFormatted}`;
}

/**
 * Parses a VET timestamp string ("DD/MM/YYYY HH:mm:ss", "DD/MM/YYYY HH:mm", or ISO)
 * into epoch milliseconds for deterministic duration & inactivity calculations.
 */
export function parseVetTimestampMs(vetStr?: string): number | null {
  if (!vetStr || typeof vetStr !== 'string') return null;
  const trimmed = vetStr.trim();
  if (!trimmed) return null;

  // Match "DD/MM/YYYY HH:mm:ss" or "DD/MM/YYYY HH:mm"
  const dmyMatch = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hour = parseInt(dmyMatch[4] || '0', 10);
    const minute = parseInt(dmyMatch[5] || '0', 10);
    const second = parseInt(dmyMatch[6] || '0', 10);
    // Construct UTC timestamp offset by -04:00 (Caracas VET)
    return Date.UTC(year, month, day, hour + 4, minute, second);
  }

  const parsedIso = Date.parse(trimmed);
  return Number.isNaN(parsedIso) ? null : parsedIso;
}

/**
 * Calculates exact duration in minutes between two VET timestamps.
 */
export function calculateDurationMinutesBetweenVet(
  startVet: string,
  endVet: string
): number {
  const startMs = parseVetTimestampMs(startVet);
  const endMs = parseVetTimestampMs(endVet);
  if (startMs === null || endMs === null) return 1;
  const diffMinutes = Math.round(Math.max(0, endMs - startMs) / 60_000);
  return Math.max(1, diffMinutes);
}

/**
 * Normalizes legacy session records and seals duplicate/orphan zombie sessions
 * so that at most 1 non-finalized session exists per unique user.
 */
export function sanitizeZombieSessions(
  history: UserSessionRecord[],
  nowVet: string = getFormattedCaracasNow()
): UserSessionRecord[] {
  if (!Array.isArray(history) || history.length === 0) return [];

  const seenActiveUserKeys = new Set<string>();
  const nowMs = parseVetTimestampMs(nowVet);

  return history.map((raw) => {
    const loginAtVet = raw.loginAtVet || nowVet;
    const lastHeartbeatVet = raw.lastHeartbeatVet || raw.logoutAtVet || loginAtVet;
    const userKey = (raw.userId || raw.userEmail || '').toLowerCase();

    // Determine normalized status from raw fields
    let status: SessionStatus = raw.status
      ? raw.status
      : raw.isActive
        ? 'ACTIVA'
        : 'FINALIZADA';

    if (raw.logoutAtVet && status === 'ACTIVA') {
      status = 'FINALIZADA';
    }

    // Check if this session is an open/resumable candidate
    const isCandidateOpen = status === 'ACTIVA' || status === 'SUSPENDIDA' || raw.isActive === true;

    if (isCandidateOpen) {
      // Check if it is an ancient orphan session from a previous day (> 24 hours without heartbeat)
      const hbMs = parseVetTimestampMs(lastHeartbeatVet);
      const ageMinutes =
        nowMs !== null && hbMs !== null ? (nowMs - hbMs) / 60_000 : 0;

      if (seenActiveUserKeys.has(userKey) || ageMinutes > 24 * 60) {
        // Zombie session detected: seal it as FINALIZADA
        const sealedLogoutVet = raw.logoutAtVet || lastHeartbeatVet || loginAtVet;
        return {
          ...raw,
          loginAtVet,
          lastHeartbeatVet,
          logoutAtVet: sealedLogoutVet,
          durationMinutes:
            raw.durationMinutes ??
            calculateDurationMinutesBetweenVet(loginAtVet, sealedLogoutVet),
          status: 'FINALIZADA' as SessionStatus,
          isActive: false,
        };
      }

      // First legitimate open session for this user
      seenActiveUserKeys.add(userKey);

      // If inactive > 30 minutes, mark SUSPENDIDA until explicitly resumed
      if (ageMinutes > SESSION_INACTIVITY_TIMEOUT_MINUTES) {
        return {
          ...raw,
          loginAtVet,
          lastHeartbeatVet,
          status: 'SUSPENDIDA' as SessionStatus,
          isActive: false,
        };
      }

      return {
        ...raw,
        loginAtVet,
        lastHeartbeatVet,
        status: status === 'SUSPENDIDA' ? 'SUSPENDIDA' : 'ACTIVA',
        isActive: status !== 'SUSPENDIDA',
      };
    }

    // Already finalized session
    const sealedLogoutVet = raw.logoutAtVet || lastHeartbeatVet || loginAtVet;
    return {
      ...raw,
      loginAtVet,
      lastHeartbeatVet,
      logoutAtVet: sealedLogoutVet,
      durationMinutes:
        raw.durationMinutes ??
        calculateDurationMinutesBetweenVet(loginAtVet, sealedLogoutVet),
      status: 'FINALIZADA' as SessionStatus,
      isActive: false,
    };
  });
}

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
 * Loads user session history from persistent storage and automatically sanitizes zombie records.
 */
export function loadStoredSessionHistory(): UserSessionRecord[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY_SESSION_HISTORY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const sanitized = sanitizeZombieSessions(parsed);
        saveSessionHistory(sanitized);
        return sanitized;
      }
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
 * Continuity-aware session manager:
 * - Searches if the user already has a session in 'ACTIVA' or 'SUSPENDIDA' (or isActive === true).
 * - If found: Resumes the existing session (preserving its ID), updates lastHeartbeatVet, sets status = 'ACTIVA',
 *   and seals any duplicate zombie sessions for that user without adding a new row.
 * - If not found: Creates a single new session with status = 'ACTIVA'.
 */
export function recordOrResumeUserSession(
  user: UserProfile,
  existingHistory: UserSessionRecord[],
  customNowVet?: string
): { session: UserSessionRecord; updatedHistory: UserSessionRecord[]; resumed: boolean } {
  const nowStr = customNowVet || getFormattedCaracasNow();
  const sanitized = sanitizeZombieSessions(existingHistory, nowStr);

  const matchIndex = sanitized.findIndex(
    (s) =>
      (s.userId === user.uid || s.userEmail.toLowerCase() === user.email.toLowerCase()) &&
      (s.status === 'ACTIVA' || s.status === 'SUSPENDIDA' || s.isActive === true)
  );

  if (matchIndex >= 0) {
    const target = sanitized[matchIndex];
    const resumedSession: UserSessionRecord = {
      ...target,
      userId: user.uid,
      userEmail: user.email,
      userDisplayName: user.displayName,
      userRole: user.role,
      lastHeartbeatVet: nowStr,
      logoutAtVet: undefined,
      status: 'ACTIVA',
      isActive: true,
    };

    const updatedHistory = sanitized.map((s, idx) => {
      if (idx === matchIndex) {
        return resumedSession;
      }
      // Ensure no other session for the same user remains open
      if (
        (s.userId === user.uid || s.userEmail.toLowerCase() === user.email.toLowerCase()) &&
        (s.status !== 'FINALIZADA' || s.isActive)
      ) {
        const closedAt = s.logoutAtVet || s.lastHeartbeatVet || s.loginAtVet;
        return {
          ...s,
          logoutAtVet: closedAt,
          durationMinutes:
            s.durationMinutes ?? calculateDurationMinutesBetweenVet(s.loginAtVet, closedAt),
          status: 'FINALIZADA' as SessionStatus,
          isActive: false,
        };
      }
      return s;
    });

    saveSessionHistory(updatedHistory);
    return { session: resumedSession, updatedHistory, resumed: true };
  }

  const newSession: UserSessionRecord = {
    id: `ses-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId: user.uid,
    userEmail: user.email,
    userDisplayName: user.displayName,
    userRole: user.role,
    loginAtVet: nowStr,
    lastHeartbeatVet: nowStr,
    status: 'ACTIVA',
    isActive: true,
  };

  const updatedHistory = [newSession, ...sanitized];
  saveSessionHistory(updatedHistory);
  return { session: newSession, updatedHistory, resumed: false };
}

/**
 * Backward-compatible alias that delegates to recordOrResumeUserSession
 * so page reloads never duplicate active sessions.
 */
export function recordUserLoginSession(
  user: UserProfile,
  existingHistory: UserSessionRecord[],
  customNowVet?: string
): { session: UserSessionRecord; updatedHistory: UserSessionRecord[]; resumed: boolean } {
  return recordOrResumeUserSession(user, existingHistory, customNowVet);
}

/**
 * Evaluates the 30-minute inactivity timeout and heartbeat update for a session.
 * - If > 30 minutes (1800 seconds) have elapsed without heartbeat and resumeOnActivity is false,
 *   transitions the session to status: 'SUSPENDIDA' (isActive: false).
 * - If <= 30 minutes or resumeOnActivity is true, updates lastHeartbeatVet and keeps/restores status: 'ACTIVA'.
 */
export function evaluateSessionHeartbeat(
  sessionId: string,
  existingHistory: UserSessionRecord[],
  options?: {
    nowVet?: string;
    elapsedMinutesOverride?: number;
    resumeOnActivity?: boolean;
  }
): {
  updatedHistory: UserSessionRecord[];
  session: UserSessionRecord | null;
  statusChangedTo: SessionStatus | null;
} {
  const nowStr = options?.nowVet || getFormattedCaracasNow();
  const nowMs = parseVetTimestampMs(nowStr);
  let updatedSession: UserSessionRecord | null = null;
  let statusChangedTo: SessionStatus | null = null;

  const updatedHistory = existingHistory.map((s) => {
    if (s.id !== sessionId || s.status === 'FINALIZADA') {
      return s;
    }

    const lastHbMs = parseVetTimestampMs(s.lastHeartbeatVet || s.loginAtVet);
    const computedElapsedMin =
      options?.elapsedMinutesOverride !== undefined
        ? options.elapsedMinutesOverride
        : nowMs !== null && lastHbMs !== null
          ? (nowMs - lastHbMs) / 60_000
          : 0;

    if (
      computedElapsedMin > SESSION_INACTIVITY_TIMEOUT_MINUTES &&
      !options?.resumeOnActivity
    ) {
      if (s.status !== 'SUSPENDIDA') {
        statusChangedTo = 'SUSPENDIDA';
      }
      updatedSession = {
        ...s,
        status: 'SUSPENDIDA',
        isActive: false,
      };
      return updatedSession;
    }

    if (s.status === 'SUSPENDIDA') {
      statusChangedTo = 'ACTIVA';
    }
    updatedSession = {
      ...s,
      lastHeartbeatVet: nowStr,
      status: 'ACTIVA',
      isActive: true,
    };
    return updatedSession;
  });

  saveSessionHistory(updatedHistory);
  return { updatedHistory, session: updatedSession, statusChangedTo };
}

/**
 * Closes an active or suspended user session in history with exact calculated duration in minutes.
 */
export function recordUserLogoutSession(
  sessionId: string,
  existingHistory: UserSessionRecord[],
  customLogoutVet?: string
): UserSessionRecord[] {
  const logoutAtVet = customLogoutVet || getFormattedCaracasNow();
  const updatedHistory = existingHistory.map((s) => {
    if (s.id === sessionId && (s.isActive || s.status === 'ACTIVA' || s.status === 'SUSPENDIDA')) {
      const durationMinutes = calculateDurationMinutesBetweenVet(s.loginAtVet, logoutAtVet);
      return {
        ...s,
        lastHeartbeatVet: logoutAtVet,
        logoutAtVet,
        durationMinutes,
        status: 'FINALIZADA' as SessionStatus,
        isActive: false,
      };
    }
    return s;
  });

  saveSessionHistory(updatedHistory);
  return updatedHistory;
}

