import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  X,
  Clock,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  TrendingDown,
  Calendar,
  Percent,
} from 'lucide-react';
import { ExpenseRecord, ExpensePaymentRecord } from '../../types';
import {
  calculateEarlyPaymentDiscount,
  calculateOverduePenalty,
} from '../../lib/expenses-engine';
import { formatUsd, formatVes, round2, toDecimal } from '../../lib/decimal';
import { RegisterExpensePaymentInput } from '../../context/ExpenseContext';

interface ExpensePaymentModalProps {
  expense: ExpenseRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onRegisterPayment: (
    expenseId: string,
    input: RegisterExpensePaymentInput
  ) => { success: boolean; error?: string; paymentRecord?: ExpensePaymentRecord };
  currentUserName?: string;
}

export const ExpensePaymentModal: React.FC<ExpensePaymentModalProps> = ({
  expense,
  isOpen,
  onClose,
  onRegisterPayment,
  currentUserName,
}) => {
  const [amountUsdInput, setAmountUsdInput] = useState<string>('');
  const [method, setMethod] = useState<ExpensePaymentRecord['method']>('TRANSFERENCIA_VES');
  const [reference, setReference] = useState<string>('');
  const [applyEarlyDiscount, setApplyEarlyDiscount] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !expense) return null;

  // Evaluaciones de Pronto Pago y Mora
  const discountEval = useMemo(() => {
    return calculateEarlyPaymentDiscount(expense);
  }, [expense]);

  const penaltyEval = useMemo(() => {
    return calculateOverduePenalty(expense);
  }, [expense]);

  // Saldo pendiente
  const currentPaid = toDecimal(expense.paidAmountUsd);
  let effectiveTotalUsd = expense.netPayableUsd;

  if (discountEval.isEligible && applyEarlyDiscount) {
    effectiveTotalUsd = discountEval.discountedPayableUsd;
  } else if (penaltyEval.isOverdue) {
    effectiveTotalUsd = penaltyEval.totalWithPenaltyUsd;
  }

  const remainingBalanceUsd = round2(toDecimal(effectiveTotalUsd).minus(currentPaid));

  const handleSetFullPayment = () => {
    setAmountUsdInput(remainingBalanceUsd.toFixed(2));
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const amountNum = parseFloat(amountUsdInput);
    if (isNaN(amountNum) || amountNum <= 0) {
      setErrorMsg('Debe ingresar un monto válido mayor a 0.');
      return;
    }

    if (toDecimal(amountNum).greaterThan(toDecimal(remainingBalanceUsd))) {
      setErrorMsg(
        `El monto ingresado ($${amountNum.toFixed(2)}) supera el saldo pendiente ($${remainingBalanceUsd.toFixed(2)}).`
      );
      return;
    }

    if (!reference || reference.trim().length < 3) {
      setErrorMsg('Debe ingresar el número de referencia bancaria o comprobante.');
      return;
    }

    const res = onRegisterPayment(expense.id, {
      amountUsd: round2(amountNum),
      method,
      reference: reference.trim(),
      registeredBy: currentUserName || 'Analista de Tesorería',
      applyEarlyDiscount: discountEval.isEligible && applyEarlyDiscount,
    });

    if (!res.success) {
      setErrorMsg(res.error || 'Error al procesar pago.');
    } else {
      setSuccessMsg('¡Pago asentado exitosamente en el libro de gastos!');
      setTimeout(() => {
        setSuccessMsg(null);
        setAmountUsdInput('');
        setReference('');
        onClose();
      }, 1200);
    }
  };

  const currentEnteredUsd = parseFloat(amountUsdInput) || 0;
  const currentEnteredVes = round2(toDecimal(currentEnteredUsd).times(expense.bcvRate));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30">
              <CreditCard className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Asentar Pago o Abono de Gasto
              </h2>
              <p className="text-xs text-emerald-200">
                {expense.expenseCode} · {expense.beneficiaryName}
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
        <form onSubmit={handleRegister} className="p-5 sm:p-6 overflow-y-auto space-y-4 text-slate-700 dark:text-slate-200 text-sm">
          {/* Alerta de Descuento por Pronto Pago */}
          {discountEval.isEligible && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-3 transition-colors ${
                discountEval.isUrgent48h
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 animate-pulse'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              }`}
            >
              <Percent className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-wide">
                    {discountEval.isUrgent48h ? '¡Alerta Urgente Pronto Pago (<= 48h)!' : 'Oportunidad de Descuento por Pronto Pago'}
                  </span>
                  <span className="text-[11px] font-mono font-bold bg-emerald-200 dark:bg-emerald-800 px-2 py-0.5 rounded text-emerald-900 dark:text-emerald-100">
                    -{discountEval.discountPercent}% ($ {formatUsd(discountEval.discountAmountUsd)})
                  </span>
                </div>
                <p className="text-xs">
                  Vence el <strong>{expense.earlyPaymentDiscountDeadline}</strong> ({discountEval.daysRemaining} días restantes). Al aprovechar este descuento pagas únicamente <strong>${formatUsd(discountEval.discountedPayableUsd)} USD</strong>.
                </p>
                <label className="flex items-center gap-2 pt-1 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={applyEarlyDiscount}
                    onChange={(e) => setApplyEarlyDiscount(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-semibold">Aplicar descuento por pronto pago al saldo</span>
                </label>
              </div>
            </div>
          )}

          {/* Alerta de Mora si está vencido */}
          {penaltyEval.isOverdue && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl flex items-start gap-3 text-rose-900 dark:text-rose-200">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div className="flex-1 text-xs space-y-1">
                <span className="font-bold uppercase tracking-wide block">
                  Factura de Gasto Vencida (+{penaltyEval.daysOverdue} días)
                </span>
                <p>
                  Recargo por mora devengado: <strong>+${formatUsd(penaltyEval.penaltyAmountUsd)} USD</strong>. Total con mora: <strong>${formatUsd(penaltyEval.totalWithPenaltyUsd)} USD</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Resumen de Saldos */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-center">
            <div>
              <span className="text-[11px] text-slate-400 block">Total a Pagar</span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                ${formatUsd(effectiveTotalUsd)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">Abonado Previo</span>
              <span className="text-sm font-bold text-slate-500 tabular-nums">
                ${formatUsd(expense.paidAmountUsd)}
              </span>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-1">
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold block">
                Saldo Pendiente
              </span>
              <span className="text-sm font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                ${formatUsd(remainingBalanceUsd)}
              </span>
            </div>
          </div>

          {/* Monto del Pago */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Monto a Liquidar (USD):
              </label>
              <button
                type="button"
                onClick={handleSetFullPayment}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Pagar Saldo Completo (${formatUsd(remainingBalanceUsd)})
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-3 text-slate-400 font-bold">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={remainingBalanceUsd}
                required
                placeholder="0.00"
                value={amountUsdInput}
                onChange={(e) => setAmountUsdInput(e.target.value)}
                className="w-full pl-8 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-base font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {currentEnteredUsd > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-right tabular-nums">
                Equivalente oficial BCV (tasa {expense.bcvRate.toFixed(2)}): <strong className="text-slate-800 dark:text-slate-200">Bs. {formatVes(currentEnteredVes)}</strong>
              </p>
            )}
          </div>

          {/* Método de Pago */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Método de Pago:
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="TRANSFERENCIA_VES">Transferencia Bancaria (VES)</option>
              <option value="PAGO_MOVIL_VES">Pago Móvil Interbancario (VES)</option>
              <option value="EFECTIVO_USD">Efectivo Divisas Caja Chica (USD)</option>
              <option value="ZELLE_USD">Zelle Corporativo (USD)</option>
            </select>
          </div>

          {/* Referencia Bancaria */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              N° de Referencia / Comprobante / Recibo:
            </label>
            <input
              type="text"
              required
              placeholder="Ej. TR-9948210 ó EFECTIVO-CAJA-01"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
            />
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

          {/* Botones */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 min-h-[44px] text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Asentar Pago en Libro</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpensePaymentModal;
