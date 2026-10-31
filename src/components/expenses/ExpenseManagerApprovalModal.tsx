import React, { useState } from 'react';
import {
  ShieldCheck,
  X,
  AlertTriangle,
  Lock,
  CheckCircle2,
  XCircle,
  Calendar,
  DollarSign,
  User,
  Building,
} from 'lucide-react';
import { ExpenseRecord } from '../../types';
import { EXPENSE_CATEGORIES_METADATA } from '../../lib/expenses-engine';
import { formatUsd, formatVes } from '../../lib/decimal';

interface ExpenseManagerApprovalModalProps {
  expense: ExpenseRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (expenseId: string, pin: string) => { success: boolean; error?: string };
  onReject: (expenseId: string, pin: string, reason: string) => { success: boolean; error?: string };
}

export const ExpenseManagerApprovalModal: React.FC<ExpenseManagerApprovalModalProps> = ({
  expense,
  isOpen,
  onClose,
  onApprove,
  onReject,
}) => {
  const [pin, setPin] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !expense) return null;

  const handleApprove = () => {
    setErrorMsg(null);
    if (!pin || pin.trim().length !== 6) {
      setErrorMsg('Debe ingresar un PIN gerencial válido de 6 dígitos.');
      return;
    }

    const res = onApprove(expense.id, pin.trim());
    if (!res.success) {
      setErrorMsg(res.error || 'Error al autorizar gasto.');
    } else {
      setSuccessMsg('Gasto operativo autorizado exitosamente por Gerencia.');
      setTimeout(() => {
        setSuccessMsg(null);
        setPin('');
        onClose();
      }, 1200);
    }
  };

  const handleReject = () => {
    setErrorMsg(null);
    if (!pin || pin.trim().length !== 6) {
      setErrorMsg('Debe ingresar su PIN gerencial de 6 dígitos para firmar el rechazo.');
      return;
    }
    if (!rejectionReason || rejectionReason.trim().length < 5) {
      setErrorMsg('Debe proporcionar un motivo detallado del rechazo (mínimo 5 caracteres).');
      return;
    }

    const res = onReject(expense.id, pin.trim(), rejectionReason.trim());
    if (!res.success) {
      setErrorMsg(res.error || 'Error al rechazar gasto.');
    } else {
      setSuccessMsg('Gasto rechazado y registrado en la auditoría inmutable.');
      setTimeout(() => {
        setSuccessMsg(null);
        setPin('');
        setIsRejecting(false);
        setRejectionReason('');
        onClose();
      }, 1200);
    }
  };

  const categoryMeta = EXPENSE_CATEGORIES_METADATA[expense.category];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-700 via-amber-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 rounded-xl border border-amber-400/30">
              <ShieldCheck className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Aprobación Gerencial de Gasto (&gt; $100 USD)
              </h2>
              <p className="text-xs text-amber-200">
                Gobernanza de Doble Firma RBAC con PIN de Seguridad
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-slate-700 dark:text-slate-200 text-sm">
          {/* Card Resumen de Gasto */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                  {expense.voucherType} · {expense.voucherNumber}
                </span>
                <h3 className="font-bold text-base text-slate-900 dark:text-white mt-1">
                  {expense.beneficiaryName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  RIF/C.I.: {expense.beneficiaryRif} · {expense.beneficiaryType}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Total a Liquidar</span>
                <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
                  ${formatUsd(expense.netPayableUsd)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 block tabular-nums">
                  Bs. {formatVes(expense.amountVes)}
                </span>
              </div>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900/70 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <span className="font-semibold block text-slate-400 text-[11px] mb-1">
                Concepto / Rubro: {categoryMeta?.label || expense.category}
              </span>
              {expense.description}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200 dark:border-slate-700/60">
              <div>
                <span className="text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Emisión: {expense.issueDate}
                </span>
                {expense.dueDate && (
                  <span className="text-slate-400 flex items-center gap-1 mt-0.5">
                    Vencimiento: {expense.dueDate} ({expense.creditDays} días)
                  </span>
                )}
              </div>
              <div>
                <span className="text-slate-400 flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> Precargado por:
                </span>
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {expense.preloadedByName}
                </span>
              </div>
            </div>
          </div>

          {/* Estado de Aprobación */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Este gasto supera el límite operativo de <strong>$100.00 USD</strong>. Debe ser formalmente ratificado por el Gerente General mediante PIN de seguridad de 6 dígitos.
            </span>
          </div>

          {/* Formulario de Justificación de Rechazo */}
          {isRejecting ? (
            <div className="space-y-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl">
              <label className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                <XCircle className="w-4 h-4" /> Motivo del Rechazo Gerencial:
              </label>
              <textarea
                rows={3}
                placeholder="Indique las razones del rechazo (ej. Sobrecosto, servicio no ejecutado a satisfacción, duplicidad)..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full p-2.5 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-lg text-xs outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          ) : null}

          {/* Input PIN */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-amber-600" />
              PIN de Autorización Gerencial (6 dígitos):
            </label>
            <input
              type="password"
              maxLength={6}
              placeholder="••••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-center text-lg tracking-widest text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
            />
            <p className="text-[11px] text-slate-400 text-center">
              PIN Maestro de Demostración: <span className="font-mono font-bold text-amber-600">203040</span>
            </p>
          </div>

          {/* Mensajes de Alerta */}
          {errorMsg && (
            <div className="p-3 bg-rose-100 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          {!isRejecting ? (
            <button
              type="button"
              onClick={() => setIsRejecting(true)}
              className="px-3.5 py-2.5 min-h-[44px] text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              <span>Rechazar Gasto...</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsRejecting(false)}
              className="px-3.5 py-2.5 min-h-[44px] text-xs font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancelar Rechazo
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cerrar
            </button>

            {isRejecting ? (
              <button
                type="button"
                onClick={handleReject}
                className="px-5 py-2.5 min-h-[44px] text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                <span>Confirmar Rechazo Definitivo</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleApprove}
                className="px-5 py-2.5 min-h-[44px] text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Autorizar con Firma Digital</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpenseManagerApprovalModal;
