import React from 'react';
import { AlertTriangle, Clock, ShieldCheck, LogOut, CheckCircle } from 'lucide-react';

interface SessionTimeoutWarningModalProps {
  isOpen: boolean;
  secondsRemaining: number;
  onRenewSession: () => void;
  onLogoutNow: () => void;
}

export const SessionTimeoutWarningModal: React.FC<SessionTimeoutWarningModalProps> = ({
  isOpen,
  secondsRemaining,
  onRenewSession,
  onLogoutNow,
}) => {
  if (!isOpen) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isUrgent = secondsRemaining <= 30;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-amber-300 dark:border-amber-700/60 overflow-hidden flex flex-col p-6 space-y-5 text-center">
        {/* Glow Header */}
        <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-600/40 text-amber-600 dark:text-amber-400">
          <Clock className={`w-8 h-8 ${isUrgent ? 'animate-bounce text-rose-500' : 'animate-pulse'}`} />
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            Gobernanza de Sesiones RBAC
          </span>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
            ¿Sigues en tu estación de trabajo?
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Por política de seguridad de <strong>Hiper Abasto Polar, C.A.</strong>, tu sesión se cerrará automáticamente en:
          </p>
        </div>

        {/* Big Countdown Timer */}
        <div className={`p-4 rounded-2xl font-mono text-3xl sm:text-4xl font-black tracking-widest tabular-nums border transition-colors ${
          isUrgent
            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-800 animate-pulse'
            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
        }`}>
          {timeFormatted}
        </div>

        {/* Info Note on Draft Protection */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-[11px] text-slate-600 dark:text-slate-300 text-left flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <span>
            <strong>Protección de Datos:</strong> Tus borradores de formularios activos (como el <em>Arqueo y Cierre de Gastos</em>) se conservarán protegidos para ser restaurados cuando vuelvas a iniciar sesión.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onLogoutNow}
            className="w-full sm:w-auto px-4 py-3 min-h-[44px] text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Ahora</span>
          </button>

          <button
            type="button"
            onClick={onRenewSession}
            className="flex-1 w-full px-6 py-3.5 min-h-[44px] bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Mantener Sesión Activa</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionTimeoutWarningModal;
