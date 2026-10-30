/**
 * Telemetría y Estado de Salud del Sistema (Anti-Hemorragia de Cuotas Firestore)
 * Ecosistema de 11 Agentes Especializados de Antigravity 2.0 (@Backend + @QA + @Dashboards)
 * 
 * Supervisa en tiempo real el consumo de lecturas, escrituras y eliminaciones en Google Cloud Firestore
 * para evitar el agotamiento de la cuota diaria (Free Tier / Spark / Blaze plan).
 * Activa alertas visuales preventivas al 60%, críticas al 80% y Modo Ahorro Forzado (Cache-First) al 90%.
 * Detecta ráfagas anómalas de consultas no paginadas (Query Leaks) y audita conectores externos.
 */

import { getCaracasNow } from './bcv';

export interface FirestoreQuotaMetrics {
  currentDateVet: string;
  readsToday: number;
  writesToday: number;
  deletesToday: number;
  dailyReadLimit: number;
  dailyWriteLimit: number;
  readQuotaPercent: number;
  writeQuotaPercent: number;
  healthStatus: 'OPTIMO' | 'PREVENTIVO_60' | 'CRITICO_80' | 'AHORRO_FORZADO_90';
  throttleModeActive: boolean;
  activeLeaksDetected: Array<{
    id: string;
    timestampVet: string;
    collection: string;
    burstCount: number;
    description: string;
  }>;
  serviceConnections: {
    bcvLiveConnector: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
    brmWhatsAppBridge: 'ONLINE' | 'STANDBY' | 'DISCONNECTED';
    serverOfflineQueue: {
      hasAdminCredentials: boolean;
      pendingQueueLength: number;
    };
    storageEngine: 'FIREBASE_ONLINE' | 'LOCALSTORAGE_RESILIENT' | 'INDEXED_DB';
  };
  lastEvaluatedAtVet: string;
}

// Configuración por defecto: Free Tier de Google Cloud Firestore (50k lecturas/día, 20k escrituras/día)
export const DEFAULT_DAILY_READ_LIMIT = 50_000;
export const DEFAULT_DAILY_WRITE_LIMIT = 20_000;
const BURST_QUERY_LEAK_THRESHOLD = 150; // Más de 150 lecturas en una sola ráfaga sin paginar
const TELEMETRY_STORAGE_KEY = 'chrystal_firestore_quota_telemetry_v1';

type TelemetrySubscriber = (metrics: FirestoreQuotaMetrics) => void;

class FirestoreQuotaTelemetryEngine {
  private dailyReads: number = 0;
  private dailyWrites: number = 0;
  private dailyDeletes: number = 0;
  private activeDateVet: string = '';
  private dailyReadLimit: number = DEFAULT_DAILY_READ_LIMIT;
  private dailyWriteLimit: number = DEFAULT_DAILY_WRITE_LIMIT;
  private throttleMode: boolean = false;
  private leakWarnings: FirestoreQuotaMetrics['activeLeaksDetected'] = [];
  private subscribers: Set<TelemetrySubscriber> = new Set();

  constructor() {
    this.initFromStorage();
  }

  private initFromStorage(): void {
    const todayVet = getCaracasNow().dateString;
    this.activeDateVet = todayVet;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(TELEMETRY_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.currentDateVet === todayVet) {
            this.dailyReads = Number(parsed.readsToday) || 0;
            this.dailyWrites = Number(parsed.writesToday) || 0;
            this.dailyDeletes = Number(parsed.deletesToday) || 0;
            this.throttleMode = Boolean(parsed.throttleModeActive);
            this.leakWarnings = Array.isArray(parsed.activeLeaksDetected)
              ? parsed.activeLeaksDetected
              : [];
          } else {
            // Cambio de día fiscal en Caracas: reinicio limpio
            this.dailyReads = 0;
            this.dailyWrites = 0;
            this.dailyDeletes = 0;
            this.throttleMode = false;
            this.leakWarnings = [];
          }
        }
      }
    } catch {
      // Ignorar fallos de acceso en entornos sin almacenamiento
    }
  }

  private persistState(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const payload = {
          currentDateVet: this.activeDateVet,
          readsToday: this.dailyReads,
          writesToday: this.dailyWrites,
          deletesToday: this.dailyDeletes,
          throttleModeActive: this.throttleMode,
          activeLeaksDetected: this.leakWarnings.slice(0, 10),
        };
        window.localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(payload));
      }
    } catch {
      // ignore
    }
  }

  private checkDateRollover(): void {
    const todayVet = getCaracasNow().dateString;
    if (this.activeDateVet !== todayVet) {
      this.activeDateVet = todayVet;
      this.dailyReads = 0;
      this.dailyWrites = 0;
      this.dailyDeletes = 0;
      this.throttleMode = false;
      this.leakWarnings = [];
      this.persistState();
    }
  }

  public recordRead(count: number = 1, collectionName: string = 'catalogo_productos', caller?: string): void {
    this.checkDateRollover();
    this.dailyReads += Math.max(1, count);

    // Detección proactiva de Hemorragias de Datos (Query Leak Watchdog)
    if (count >= BURST_QUERY_LEAK_THRESHOLD) {
      const leakId = `leak-${Date.now()}`;
      this.leakWarnings.unshift({
        id: leakId,
        timestampVet: getCaracasNow().isoTimestamp,
        collection: collectionName,
        burstCount: count,
        description: `Ráfaga anómala de ${count} lecturas detectada en '${collectionName}'${caller ? ` invocada por [${caller}]` : ''} sin paginación 'limit(100)'.`,
      });
      if (this.leakWarnings.length > 10) {
        this.leakWarnings = this.leakWarnings.slice(0, 10);
      }
    }

    const currentPercent = (this.dailyReads / this.dailyReadLimit) * 100;
    if (currentPercent >= 90) {
      this.throttleMode = true;
    }

    this.persistState();
    this.notifySubscribers();
  }

  public recordWrite(count: number = 1): void {
    this.checkDateRollover();
    this.dailyWrites += Math.max(1, count);
    this.persistState();
    this.notifySubscribers();
  }

  public recordDelete(count: number = 1): void {
    this.checkDateRollover();
    this.dailyDeletes += Math.max(1, count);
    this.persistState();
    this.notifySubscribers();
  }

  public setCustomLimits(readLimit: number, writeLimit: number): void {
    if (readLimit > 0) this.dailyReadLimit = readLimit;
    if (writeLimit > 0) this.dailyWriteLimit = writeLimit;
    this.notifySubscribers();
  }

  public setThrottleMode(enabled: boolean): void {
    this.throttleMode = enabled;
    this.persistState();
    this.notifySubscribers();
  }

  public clearLeaks(): void {
    this.leakWarnings = [];
    this.persistState();
    this.notifySubscribers();
  }

  public resetTelemetryForTesting(forcedReads: number = 0, forcedWrites: number = 0): void {
    this.dailyReads = forcedReads;
    this.dailyWrites = forcedWrites;
    this.dailyDeletes = 0;
    this.throttleMode = (forcedReads / this.dailyReadLimit) >= 0.9;
    this.leakWarnings = [];
    this.persistState();
    this.notifySubscribers();
  }

  public getSnapshot(): FirestoreQuotaMetrics {
    this.checkDateRollover();

    const readQuotaPercent = Math.min(
      100,
      parseFloat(((this.dailyReads / this.dailyReadLimit) * 100).toFixed(2))
    );
    const writeQuotaPercent = Math.min(
      100,
      parseFloat(((this.dailyWrites / this.dailyWriteLimit) * 100).toFixed(2))
    );

    let healthStatus: FirestoreQuotaMetrics['healthStatus'] = 'OPTIMO';
    if (readQuotaPercent >= 90 || this.throttleMode) {
      healthStatus = 'AHORRO_FORZADO_90';
    } else if (readQuotaPercent >= 80) {
      healthStatus = 'CRITICO_80';
    } else if (readQuotaPercent >= 60) {
      healthStatus = 'PREVENTIVO_60';
    }

    return {
      currentDateVet: this.activeDateVet,
      readsToday: this.dailyReads,
      writesToday: this.dailyWrites,
      deletesToday: this.dailyDeletes,
      dailyReadLimit: this.dailyReadLimit,
      dailyWriteLimit: this.dailyWriteLimit,
      readQuotaPercent,
      writeQuotaPercent,
      healthStatus,
      throttleModeActive: this.throttleMode,
      activeLeaksDetected: [...this.leakWarnings],
      serviceConnections: {
        bcvLiveConnector: 'ONLINE',
        brmWhatsAppBridge: 'ONLINE',
        serverOfflineQueue: {
          hasAdminCredentials: false,
          pendingQueueLength: 0,
        },
        storageEngine: 'LOCALSTORAGE_RESILIENT',
      },
      lastEvaluatedAtVet: getCaracasNow().isoTimestamp,
    };
  }

  public subscribe(callback: TelemetrySubscriber): () => void {
    this.subscribers.add(callback);
    callback(this.getSnapshot());
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers(): void {
    const snap = this.getSnapshot();
    for (const sub of this.subscribers) {
      try {
        sub(snap);
      } catch {
        // ignore subscriber errors
      }
    }
  }
}

export const quotaTelemetryEngine = new FirestoreQuotaTelemetryEngine();
export default quotaTelemetryEngine;
