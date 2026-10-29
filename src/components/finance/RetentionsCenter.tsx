import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  Lock,
  Search,
  ShieldAlert,
  Stamp,
  X,
} from 'lucide-react';
import { TaxRetentionStatus, TaxRetentionType, TaxRetentionVoucher } from '../../types';
import { useFinance } from '../../context/FinanceContext';
import { useInventory } from '../../context/InventoryContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { formatUsd, formatVes, round2, toDecimal } from '../../lib/decimal';
import {
  exportQuincenalRetentionsPdf,
  exportRetentionVoucherPdf,
} from '../../lib/retention-pdf';

export const RetentionsCenter: React.FC = () => {
  const {
    retentionVouchers,
    updateRetentionVoucherStatus,
    voidRetentionVoucher,
  } = useFinance();
  const { logAuditEvent } = useInventory();
  const { config, setIsCompanyModalOpen } = useUIConfig();

  const [typeFilter, setTypeFilter] = useState<'ALL' | TaxRetentionType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TaxRetentionStatus>('ALL');
  const [periodFilter, setPeriodFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modal de Anulación con PIN Gerencial
  const [voidTarget, setVoidTarget] = useState<TaxRetentionVoucher | null>(null);
  const [voidPin, setVoidPin] = useState<string>('');
  const [voidReason, setVoidReason] = useState<string>('');

  const availablePeriods = useMemo(() => {
    const labels = new Set<string>();
    for (const v of retentionVouchers) {
      if (v.fortnightLabel) labels.add(v.fortnightLabel);
    }
    return Array.from(labels);
  }, [retentionVouchers]);

  const filteredVouchers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return retentionVouchers.filter((v) => {
      if (typeFilter !== 'ALL' && v.type !== typeFilter) return false;
      if (statusFilter !== 'ALL' && v.status !== statusFilter) return false;
      if (periodFilter !== 'ALL' && v.fortnightLabel !== periodFilter) return false;
      if (q) {
        const hit =
          v.voucherNumber.toLowerCase().includes(q) ||
          v.supplierName.toLowerCase().includes(q) ||
          v.supplierRif.toLowerCase().includes(q) ||
          v.invoiceNumber.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [retentionVouchers, typeFilter, statusFilter, periodFilter, searchQuery]);

  const summary = useMemo(() => {
    let ivaVes = toDecimal(0);
    let ivaUsd = toDecimal(0);
    let islrVes = toDecimal(0);
    let islrUsd = toDecimal(0);
    let pendingEnterarCount = 0;

    for (const v of filteredVouchers) {
      if (v.status === 'ANULADO') continue;
      if (v.type === 'IVA') {
        ivaVes = ivaVes.plus(v.retainedTotalVes);
        ivaUsd = ivaUsd.plus(v.retainedTotalUsd);
      } else {
        islrVes = islrVes.plus(v.retainedTotalVes);
        islrUsd = islrUsd.plus(v.retainedTotalUsd);
      }
      if (v.status !== 'ENTERADO_SENIAT') {
        pendingEnterarCount += 1;
      }
    }

    return {
      ivaVes: round2(ivaVes),
      ivaUsd: round2(ivaUsd),
      islrVes: round2(islrVes),
      islrUsd: round2(islrUsd),
      pendingEnterarCount,
    };
  }, [filteredVouchers]);

  const handleAdvanceStatus = (
    v: TaxRetentionVoucher,
    nextStatus: Exclude<TaxRetentionStatus, 'ANULADO'>
  ) => {
    const res = updateRetentionVoucherStatus(v.id, nextStatus);
    if (!res.success) {
      setFeedback({ type: 'err', text: res.error || 'Error al cambiar estado.' });
      return;
    }
    logAuditEvent(
      'TAX_RETENTION_STATUS_CHANGE',
      'TAX_RETENTION',
      `Comprobante ${v.type} N° ${v.voucherNumber} (${v.supplierName}) actualizado a estado ${nextStatus}.`,
      { voucherNumber: v.voucherNumber, type: v.type, newStatus: nextStatus },
      v.id
    );
    setFeedback({
      type: 'ok',
      text: `Comprobante ${v.voucherNumber} marcado como ${nextStatus}.`,
    });
  };

  const handleConfirmVoid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;

    const res = voidRetentionVoucher(voidTarget.id, voidPin, voidReason);
    if (!res.success) {
      setFeedback({ type: 'err', text: res.error || 'No se pudo anular el comprobante.' });
      return;
    }

    logAuditEvent(
      'TAX_RETENTION_VOID',
      'TAX_RETENTION',
      `Comprobante ${voidTarget.type} N° ${voidTarget.voucherNumber} ANULADO con PIN Gerencial. Motivo: "${voidReason}". Correlativo preservado sin reutilización.`,
      {
        voucherNumber: voidTarget.voucherNumber,
        type: voidTarget.type,
        retainedTotalVes: voidTarget.retainedTotalVes,
        retainedTotalUsd: voidTarget.retainedTotalUsd,
        reason: voidReason,
      },
      voidTarget.id
    );

    setFeedback({
      type: 'ok',
      text: `Comprobante ${voidTarget.voucherNumber} ANULADO correctamente. El saldo CxP del proveedor fue restituido.`,
    });
    setVoidTarget(null);
    setVoidPin('');
    setVoidReason('');
  };

  const cp = config.companyProfile;

  return (
    <div className="space-y-6">
      {/* Encabezado Fiscal */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-lg border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2">
              <Stamp className="w-3.5 h-3.5" />
              Sujeto Pasivo Especial · Agente de Retención SENIAT (IVA SNAT/2025/000054 & ISLR D. 1.808)
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Centro de Retenciones Tributarias y Comprobantes Oficiales PDF
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1">
              Emisión correlativa de 14 dígitos (`AAAAMM00000001`), liquidación en Bolívares a tasa oficial BCV con referencia USD y descarga inmediata con branding corporativo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsCompanyModalOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs sm:text-sm font-semibold transition"
            >
              <Building2 className="w-4 h-4 text-sky-400" />
              Parámetros Fiscales SPE
            </button>
            <button
              type="button"
              disabled={filteredVouchers.length === 0}
              onClick={() =>
                exportQuincenalRetentionsPdf(
                  filteredVouchers,
                  periodFilter === 'ALL' ? 'Consolidado General' : periodFilter,
                  cp
                )
              }
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs sm:text-sm font-bold shadow transition"
            >
              <Download className="w-4 h-4" />
              Relación Quincenal PDF
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl p-4 border flex items-center justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-black/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tarjetas KPI Tributarias */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase">
            IVA Retenido (SNAT/2025/000054)
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {formatVes(summary.ivaVes)}
          </div>
          <div className="text-xs font-semibold text-sky-700 mt-0.5 tabular-nums">
            Ref. {formatUsd(summary.ivaUsd)}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase">
            ISLR Retenido Servicios (D. 1.808)
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {formatVes(summary.islrVes)}
          </div>
          <div className="text-xs font-semibold text-indigo-700 mt-0.5 tabular-nums">
            Ref. {formatUsd(summary.islrUsd)}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-amber-700 uppercase">
            Pendientes por Enterar SENIAT
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-1.5 tabular-nums">
            {summary.pendingEnterarCount}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Comprobantes vigentes en curso quincenal
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="text-xs font-bold text-emerald-700 uppercase">
            Estatus Agente de Retención
          </div>
          <div className="text-sm font-bold text-slate-900 mt-1.5">
            IVA: {cp.isIvaRetentionAgent !== false ? `Activo (${cp.defaultIvaRetentionPercent || 75}%)` : 'Inactivo'} · ISLR:{' '}
            {cp.isIslrRetentionAgent !== false ? 'Activo' : 'Inactivo'}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            U.T. Vigente: Bs. {(cp.utValueVes || 9).toFixed(2)} · RIF {cp.rif}
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar N° comprobante, proveedor, RIF o factura..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'ALL' | TaxRetentionType)}
            className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white"
          >
            <option value="ALL">Impuesto: IVA + ISLR</option>
            <option value="IVA">Solo Retención IVA</option>
            <option value="ISLR">Solo Retención ISLR</option>
          </select>

          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white"
          >
            <option value="ALL">Todas las Quincenas</option>
            {availablePeriods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | TaxRetentionStatus)}
            className="min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white"
          >
            <option value="ALL">Todos los Estados</option>
            <option value="EMITIDO">Emitido</option>
            <option value="ENTREGADO">Entregado al Proveedor</option>
            <option value="ENTERADO_SENIAT">Enterado SENIAT</option>
            <option value="ANULADO">Anulado</option>
          </select>
        </div>
      </div>

      {/* Tabla Libro Auxiliar de Comprobantes */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredVouchers.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No se encontraron comprobantes de retención con los filtros seleccionados. Al registrar una factura gravada o de servicios en «Facturas & Auditoría OCR», los comprobantes se generan automáticamente.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600">
                  <th className="py-3 px-4">N° Comprobante (14 Dígitos)</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Proveedor / RIF</th>
                  <th className="py-3 px-4">Factura / Control</th>
                  <th className="py-3 px-4 text-right">Base Imp. (Bs.)</th>
                  <th className="py-3 px-4 text-center">% Ret.</th>
                  <th className="py-3 px-4 text-right">Retenido (Bs. / USD)</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones / PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVouchers.map((v) => (
                  <tr
                    key={v.id}
                    className={v.status === 'ANULADO' ? 'bg-rose-50/40 opacity-75' : 'hover:bg-slate-50/80'}
                  >
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-slate-900 tabular-nums">
                        {v.voucherNumber}
                      </div>
                      <div className="text-[11px] text-slate-500">{v.fortnightLabel}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          v.type === 'IVA'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {v.type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{v.supplierName}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {v.supplierRif} · {v.supplierTaxpayerType}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">
                      <div className="font-bold text-slate-800">{v.invoiceNumber}</div>
                      <div className="text-slate-500">Ctrl: {v.controlNumber}</div>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-medium">
                      {formatVes(v.taxableBaseVes)}
                    </td>
                    <td className="py-3 px-4 text-center font-bold tabular-nums">
                      {v.retentionPercentApplied}%
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      <div className="font-bold text-slate-900">
                        {formatVes(v.retainedTotalVes)}
                      </div>
                      <div className="text-xs text-emerald-700 font-semibold">
                        {formatUsd(v.retainedTotalUsd)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          v.status === 'ANULADO'
                            ? 'bg-rose-100 text-rose-800'
                            : v.status === 'ENTERADO_SENIAT'
                            ? 'bg-emerald-100 text-emerald-800'
                            : v.status === 'ENTREGADO'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => exportRetentionVoucherPdf(v, cp)}
                          className="min-h-[44px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          PDF Oficial
                        </button>

                        {v.status === 'EMITIDO' && (
                          <button
                            type="button"
                            onClick={() => handleAdvanceStatus(v, 'ENTREGADO')}
                            className="min-h-[44px] px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-semibold transition"
                          >
                            Entregado
                          </button>
                        )}

                        {v.status === 'ENTREGADO' && (
                          <button
                            type="button"
                            onClick={() => handleAdvanceStatus(v, 'ENTERADO_SENIAT')}
                            className="min-h-[44px] px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold inline-flex items-center gap-1 transition"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            Enterar SENIAT
                          </button>
                        )}

                        {v.status !== 'ANULADO' && (
                          <button
                            type="button"
                            onClick={() => {
                              setVoidTarget(v);
                              setVoidPin('');
                              setVoidReason('');
                            }}
                            className="min-h-[44px] px-2.5 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold transition"
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL ANULACIÓN FISCAL CON PIN GERENCIAL */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmVoid}
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-700 font-bold text-base">
                <ShieldAlert className="w-5 h-5" />
                Anular Comprobante SENIAT
              </div>
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
              <div className="font-bold font-mono">
                {voidTarget.type} N° {voidTarget.voucherNumber}
              </div>
              <div>
                Proveedor: <strong>{voidTarget.supplierName}</strong> ({voidTarget.supplierRif})
              </div>
              <div>
                El número correlativo quedará marcado como <strong>ANULADO</strong> (no se reutiliza) y se restituirán{' '}
                <strong>{formatUsd(voidTarget.retainedTotalUsd)}</strong> al saldo por pagar de la factura {voidTarget.invoiceNumber}.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Motivo Fiscal de Anulación
              </label>
              <input
                type="text"
                required
                minLength={5}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Ej. Nota de crédito / Error en datos de factura origen"
                className="w-full min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                PIN Gerencial (`203040`) o SuperAdmin (`102030`)
              </label>
              <input
                type="password"
                required
                value={voidPin}
                onChange={(e) => setVoidPin(e.target.value)}
                placeholder="Ingrese PIN autorizado..."
                className="w-full min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-mono"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                Confirmar Anulación Fiscal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default RetentionsCenter;
