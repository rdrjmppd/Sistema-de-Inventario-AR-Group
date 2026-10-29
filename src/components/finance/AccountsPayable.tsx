import React, { useState } from 'react';
import { Wallet, CheckCircle2, AlertCircle, DollarSign, FileDown } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { AccountsPayablePayment } from '../../types';
import { toDecimal, round2, formatUsd, formatVes } from '../../lib/decimal';
import { exportRetentionVoucherPdf } from '../../lib/retention-pdf';

export const AccountsPayable: React.FC = () => {
  const { invoices, payments, retentionVouchers, bcvState, registerInvoicePayment } = useFinance();
  const { user } = useAuth();
  const { config } = useUIConfig();

  const openInvoices = invoices.filter((i) => i.status !== 'PAGADA');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(openInvoices[0]?.id || '');
  const [amountUsd, setAmountUsd] = useState('250.00');
  const [method, setMethod] =
    useState<AccountsPayablePayment['method']>('TRANSFERENCIA_VES');
  const [reference, setReference] = useState('Banesco-PagoMovil-7741');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const totalPendingUsd = round2(
    invoices.reduce((acc, inv) => {
      const effectivePayable = inv.netPayableUsd ?? inv.totalUsd;
      const rem = Math.max(0, round2(toDecimal(effectivePayable).minus(inv.paidAmountUsd)));
      return acc.plus(rem);
    }, toDecimal(0))
  );
  const totalPendingVes = round2(toDecimal(totalPendingUsd).times(bcvState.activeRate));

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceId) return;
    const val = parseFloat(amountUsd) || 0;
    const res = registerInvoicePayment(
      selectedInvoiceId,
      val,
      method,
      reference,
      user?.email || 'rdrj.mppd@gmail.com'
    );
    if (!res.success) {
      setFeedback({ type: 'err', text: res.error || 'Error al procesar abono.' });
    } else {
      setFeedback({
        type: 'ok',
        text: `Abono por ${formatUsd(val)} registrado a tasa BCV Bs. ${bcvState.activeRate.toFixed(2)}.`,
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-sky-600" />
            <h1 className="text-base font-bold text-slate-900">
              Cuentas por Pagar (CxP), Abonos Parciales & Indexación Cambiaria BCV
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Control de vencimientos y liquidación en Bolívares al tipo de cambio vigente en el
            instante del pago.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg text-right">
            <div className="text-[10px] font-mono uppercase text-rose-700">
              Deuda Total Exigible (USD)
            </div>
            <div className="font-mono font-bold text-sm text-rose-900">
              {formatUsd(totalPendingUsd)}
            </div>
          </div>
          <div className="bg-sky-50 border border-sky-200 px-3 py-1.5 rounded-lg text-right">
            <div className="text-[10px] font-mono uppercase text-sky-700">
              Equivalente Hoy (VES)
            </div>
            <div className="font-mono font-bold text-sm text-sky-900">
              {formatVes(totalPendingVes)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Payment Form */}
        <form
          onSubmit={handlePayment}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3 text-xs"
        >
          <h2 className="font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
            Registrar Abono o Liquidación
          </h2>

          {feedback && (
            <div
              className={`p-3 rounded-lg flex items-center gap-2 ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border border-rose-200'
              }`}
            >
              {feedback.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Seleccionar Factura con Saldo Pendiente
            </label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => setSelectedInvoiceId(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium"
            >
              {openInvoices.map((inv) => {
                const netPayable = inv.netPayableUsd ?? inv.totalUsd;
                const rem = Math.max(
                  0,
                  round2(toDecimal(netPayable).minus(inv.paidAmountUsd))
                );
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — {inv.supplierName} (Neto pendiente: ${rem.toFixed(2)})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Monto a Abonar (USD)</label>
            <input
              type="number"
              step="0.01"
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono font-bold"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Instrumento de Pago
            </label>
            <select
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as AccountsPayablePayment['method'])
              }
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="TRANSFERENCIA_VES">Transferencia Bancaria Nacional (VES BCV)</option>
              <option value="PAGO_MOVIL_VES">Pago Móvil Interbancario (VES BCV)</option>
              <option value="ZELLE_USD">Divisas Electrónicas / Zelle (USD)</option>
              <option value="EFECTIVO_USD">Efectivo Custodia Tesorería (USD)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Referencia Bancaria / Comprobante
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={openInvoices.length === 0}
            className="w-full min-h-[44px] py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <DollarSign className="w-4 h-4" />
            Ejecutar Pago a Tasa BCV Vigente
          </button>
        </form>

        {/* Invoices & Payments Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Estado de Cuenta por Factura, Retenciones SENIAT y Neto Exigible
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                  <th className="py-2.5 px-3">Factura / Vencimiento</th>
                  <th className="py-2.5 px-3">Proveedor</th>
                  <th className="py-2.5 px-3 text-right">Total Factura</th>
                  <th className="py-2.5 px-3 text-right">Retenido SENIAT</th>
                  <th className="py-2.5 px-3 text-right">Neto Proveedor</th>
                  <th className="py-2.5 px-3 text-right">Abonado</th>
                  <th className="py-2.5 px-3 text-right">Saldo Pendiente</th>
                  <th className="py-2.5 px-3 text-center">Estatus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {invoices.map((inv) => {
                  const netPayable = inv.netPayableUsd ?? inv.totalUsd;
                  const totalRetained = inv.totalRetainedUsd ?? 0;
                  const pending = Math.max(
                    0,
                    round2(toDecimal(netPayable).minus(inv.paidAmountUsd))
                  );
                  const ivaVoucher = retentionVouchers.find(
                    (v) => v.id === inv.ivaRetentionId || (v.invoiceId === inv.id && v.type === 'IVA')
                  );
                  const islrVoucher = retentionVouchers.find(
                    (v) =>
                      v.id === inv.islrRetentionId || (v.invoiceId === inv.id && v.type === 'ISLR')
                  );

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono">
                        <div className="font-bold text-slate-900">{inv.invoiceNumber}</div>
                        <div className="text-[10px] text-slate-500">Vence: {inv.dueDate}</div>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        <div>{inv.supplierName}</div>
                        {(ivaVoucher || islrVoucher) && (
                          <div className="flex items-center gap-1 mt-1">
                            {ivaVoucher && (
                              <button
                                type="button"
                                onClick={() =>
                                  exportRetentionVoucherPdf(ivaVoucher, config.companyProfile)
                                }
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-sky-300 font-mono text-[9px] font-bold cursor-pointer"
                                title={`PDF Retención IVA #${ivaVoucher.voucherNumber}`}
                              >
                                <FileDown className="w-2.5 h-2.5" />
                                IVA
                              </button>
                            )}
                            {islrVoucher && (
                              <button
                                type="button"
                                onClick={() =>
                                  exportRetentionVoucherPdf(islrVoucher, config.companyProfile)
                                }
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-mono text-[9px] font-bold cursor-pointer"
                                title={`PDF Retención ISLR #${islrVoucher.voucherNumber}`}
                              >
                                <FileDown className="w-2.5 h-2.5" />
                                ISLR
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatUsd(inv.totalUsd)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700 tabular-nums">
                        {totalRetained > 0 ? `-${formatUsd(totalRetained)}` : '$0.00'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatUsd(netPayable)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold tabular-nums">
                        {formatUsd(inv.paidAmountUsd)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700 tabular-nums">
                        {formatUsd(pending)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            inv.status === 'PAGADA'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.status === 'VENCIDA'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <h4 className="text-[11px] font-mono uppercase text-slate-500 font-bold mb-2">
              Últimos Pagos Liquidados ({payments.length})
            </h4>
            <div className="space-y-1.5">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between bg-white px-3 py-1.5 rounded border border-slate-200 text-xs font-mono"
                >
                  <span>
                    Ref: <strong>{p.reference}</strong> ({p.method})
                  </span>
                  <span>
                    {formatUsd(p.amountUsd)} →{' '}
                    <strong className="text-sky-700">{formatVes(p.amountVes)}</strong> (BCV{' '}
                    {p.bcvRateUsed})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountsPayable;
