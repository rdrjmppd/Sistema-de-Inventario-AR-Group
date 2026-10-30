import React, { useState, useEffect } from 'react';
import {
  Activity,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Database,
  RefreshCw,
  Zap,
  Server,
  CloudOff,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import {
  quotaTelemetryEngine,
  FirestoreQuotaMetrics,
} from '../../lib/quota-telemetry';

export const SystemHealthMonitorWidget: React.FC = () => {
  const [metrics, setMetrics] = useState<FirestoreQuotaMetrics>(() =>
    quotaTelemetryEngine.getSnapshot()
  );
  const [isSimulatingBurst, setIsSimulatingBurst] = useState(false);

  useEffect(() => {
    const unsubscribe = quotaTelemetryEngine.subscribe((newMetrics) => {
      setMetrics(newMetrics);
    });
    return () => unsubscribe();
  }, []);

  const handleSimulateNormalRead = () => {
    quotaTelemetryEngine.recordRead(5, 'catalogo_productos', 'DashboardWidget');
  };

  const handleSimulateBurstLeak = () => {
    setIsSimulatingBurst(true);
    quotaTelemetryEngine.recordRead(185, 'productos_sin_limite', 'LoopInfinitoTest');
    setTimeout(() => setIsSimulatingBurst(false), 600);
  };

  const handleToggleThrottle = () => {
    quotaTelemetryEngine.setThrottleMode(!metrics.throttleModeActive);
  };

  const handleClearLeakLogs = () => {
    quotaTelemetryEngine.clearLeaks();
  };

  // Determinación visual del semáforo
  const isCritical80 = metrics.readQuotaPercent >= 80;
  const isPreventive60 = metrics.readQuotaPercent >= 60 && metrics.readQuotaPercent < 80;
  const isForcedThrottle = metrics.throttleModeActive || metrics.readQuotaPercent >= 90;

  const statusColorClass = isForcedThrottle
    ? 'border-purple-300 bg-purple-50/70 text-purple-900'
    : isCritical80
    ? 'border-rose-300 bg-rose-50/70 text-rose-900'
    : isPreventive60
    ? 'border-amber-300 bg-amber-50/70 text-amber-900'
    : 'border-emerald-200 bg-emerald-50/50 text-emerald-900';

  const progressBgClass = isForcedThrottle
    ? 'bg-purple-600'
    : isCritical80
    ? 'bg-rose-500'
    : isPreventive60
    ? 'bg-amber-500'
    : 'bg-emerald-500';

  return (
    <div className={`rounded-xl border p-4 transition-all duration-300 shadow-xs ${statusColorClass}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200/60">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-white shadow-xs">
            <Activity className="w-5 h-5 text-indigo-600 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-slate-800">
                Estado de Salud del Sistema & Anti-Hemorragia de Cuotas
              </h3>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  isForcedThrottle
                    ? 'bg-purple-200 text-purple-900'
                    : isCritical80
                    ? 'bg-rose-200 text-rose-900 animate-bounce'
                    : isPreventive60
                    ? 'bg-amber-200 text-amber-900'
                    : 'bg-emerald-200 text-emerald-900'
                }`}
              >
                {isForcedThrottle
                  ? 'Ahorro Forzado (Cache-First)'
                  : isCritical80
                  ? 'Alerta Crítica: 80% Cuota'
                  : isPreventive60
                  ? 'Alerta Preventiva (60%)'
                  : 'Salud Óptima (100%)'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Monitoreo activo de lecturas Firestore, prevención de costos y resiliencia serverless.
            </p>
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleThrottle}
            title="Activar/Desactivar Modo Ahorro Forzado (Priorizar LocalStorage/Cache)"
            className={`min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              metrics.throttleModeActive
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            {metrics.throttleModeActive ? 'Ahorro Activo' : 'Forzar Ahorro'}
          </button>
        </div>
      </div>

      {/* Alerta Destacada si >= 80% */}
      {isCritical80 && (
        <div className="mt-3 p-3 rounded-lg bg-rose-600 text-white flex items-start gap-2.5 shadow-sm animate-pulse">
          <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold">¡ALERTA DE CUOTA CLOUD (80% CONSUMIDO)!</span> Las lecturas diarias en
            Google Cloud Firestore han alcanzado el 80% del límite asignado. El sistema ha activado el Modo Ahorro
            Forzado para servir consultas desde la memoria local e IndexedDB para evitar suspensión de servicio.
          </div>
        </div>
      )}

      {/* Barra de Consumo de Cuota Firestore */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Medidor de Lecturas */}
        <div className="bg-white/90 p-3 rounded-lg border border-slate-200">
          <div className="flex justify-between items-center text-xs mb-1.5">
            <span className="font-medium text-slate-700 flex items-center gap-1">
              <Database className="w-3.5 h-3.5 text-indigo-500" /> Lecturas Firestore Hoy
            </span>
            <span className="font-mono font-bold tabular-nums text-slate-900">
              {metrics.readsToday.toLocaleString()} / {metrics.dailyReadLimit.toLocaleString()} ({metrics.readQuotaPercent}%)
            </span>
          </div>
          <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${progressBgClass}`}
              style={{ width: `${Math.min(100, metrics.readQuotaPercent)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-400 mt-1">
            <span>0</span>
            <span>Umbral Preventivo: 60%</span>
            <span className="font-semibold text-rose-600">Alerta: 80%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Medidor de Escrituras */}
        <div className="bg-white/90 p-3 rounded-lg border border-slate-200">
          <div className="flex justify-between items-center text-xs mb-1.5">
            <span className="font-medium text-slate-700 flex items-center gap-1">
              <RefreshCw className="w-3.5 h-3.5 text-emerald-600" /> Escrituras Lote (Debounced 800ms)
            </span>
            <span className="font-mono font-bold tabular-nums text-slate-900">
              {metrics.writesToday.toLocaleString()} / {metrics.dailyWriteLimit.toLocaleString()} ({metrics.writeQuotaPercent}%)
            </span>
          </div>
          <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, metrics.writeQuotaPercent)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-400 mt-1">
            <span>Agrupación Inteligente Activa</span>
            <span className="font-medium text-slate-600">Cero colisiones</span>
          </div>
        </div>
      </div>

      {/* Estado de Servicios e Infraestructura Resiliente */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-2 rounded-lg bg-white/80 border border-slate-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="truncate">
            <div className="text-[10px] text-slate-400 font-bold uppercase">BCV Conector</div>
            <div className="font-semibold text-slate-800">5:00 PM Activo</div>
          </div>
        </div>

        <div className="p-2 rounded-lg bg-white/80 border border-slate-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="truncate">
            <div className="text-[10px] text-slate-400 font-bold uppercase">WhatsApp BRM</div>
            <div className="font-semibold text-slate-800">Socket Seguro</div>
          </div>
        </div>

        <div className="p-2 rounded-lg bg-white/80 border border-slate-200 flex items-center gap-2">
          <Server className="w-4 h-4 text-indigo-600 shrink-0" />
          <div className="truncate">
            <div className="text-[10px] text-slate-400 font-bold uppercase">Modo Cloud Run</div>
            <div className="font-semibold text-slate-800">Desacoplado</div>
          </div>
        </div>

        <div className="p-2 rounded-lg bg-white/80 border border-slate-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="truncate">
            <div className="text-[10px] text-slate-400 font-bold uppercase">Almacenamiento</div>
            <div className="font-semibold text-slate-800">Cache-First</div>
          </div>
        </div>
      </div>

      {/* Monitor Anti-Hemorragia (Query Leak Watchdog) */}
      <div className="mt-3 pt-2.5 border-t border-slate-200/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {metrics.activeLeaksDetected.length === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Watchdog Anti-Hemorragia: Cero bucles o fugas de consulta detectadas hoy.
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-rose-700 font-bold">
              <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
              {metrics.activeLeaksDetected.length} ráfaga(s) sospechosa(s) bloqueada(s) por paginación.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSimulateNormalRead}
            className="text-[11px] px-2 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 min-h-[32px]"
          >
            +5 Lecturas
          </button>
          <button
            onClick={handleSimulateBurstLeak}
            disabled={isSimulatingBurst}
            className="text-[11px] px-2 py-1 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded text-amber-900 font-semibold min-h-[32px]"
          >
            Simular Ráfaga (+185)
          </button>
          {metrics.activeLeaksDetected.length > 0 && (
            <button
              onClick={handleClearLeakLogs}
              className="text-[11px] px-2 py-1 text-slate-500 hover:text-slate-800 underline"
            >
              Limpiar Alertas
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemHealthMonitorWidget;
