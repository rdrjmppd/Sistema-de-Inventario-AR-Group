import React, { useState, useMemo } from 'react';
import {
  Wallet,
  TrendingUp,
  AlertTriangle,
  Calendar,
  DollarSign,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  Clock,
  ArrowRight,
  Sliders,
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import {
  calculateConservativeCashFlowProjection,
  ConservativeCashFlowProjectionResult,
} from '../../lib/cash-flow-projector';
import { formatUsd, formatVes } from '../../lib/decimal';

export const CashFlowProjectionsWidget: React.FC = () => {
  const { invoices, retentionVouchers, bcvState } = useFinance();

  const [availableUsd, setAvailableUsd] = useState<number>(4500.0);
  const [availableVes, setAvailableVes] = useState<number>(185000.0);
  const [bcvSlippagePercent, setBcvSlippagePercent] = useState<number>(0);
  const [showAdjustDrawer, setShowAdjustDrawer] = useState<boolean>(false);

  // Proyección matemática pura conservadora estricta (Opción B)
  const projection: ConservativeCashFlowProjectionResult = useMemo(() => {
    return calculateConservativeCashFlowProjection({
      availableCashUsd: availableUsd,
      availableCashVes: availableVes,
      activeBcvRate: bcvState.activeRate,
      invoices,
      retentionVouchers,
      bcvSlippagePercent,
    });
  }, [availableUsd, availableVes, bcvState.activeRate, invoices, retentionVouchers, bcvSlippagePercent]);

  const runwayBadgeClass =
    projection.cashRunwayStatus === 'VERDE_SOLVENTE'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : projection.cashRunwayStatus === 'AMARILLO_ALERTA'
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
      {/* Header Ejecutivo */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Flujo de Caja Bimonetario Real Proyectado (USD / VES)
                </h3>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${runwayBadgeClass}`}>
                  {projection.cashRunwayStatus === 'VERDE_SOLVENTE'
                    ? `Cobertura: ${projection.cashRunwayDays} días (Solvente)`
                    : projection.cashRunwayStatus === 'AMARILLO_ALERTA'
                    ? `Cobertura: ${projection.cashRunwayDays} días (Atención)`
                    : `Déficit Inminente: ${projection.cashRunwayDays} días`}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Modelo Conservador Estricto: Liquidez bancaria real vs. Cuentas por Pagar y Provisiones SENIAT.
              </p>
            </div>
          </div>
        </div>

        {/* Controles de Simulación de Deslizamiento BCV */}
        <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
          <span className="text-[11px] font-semibold text-slate-600 px-2 flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-slate-400" /> Tasa:
          </span>
          {[0, 2, 5, 10].map((pct) => (
            <button
              key={pct}
              onClick={() => setBcvSlippagePercent(pct)}
              className={`min-h-[36px] px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                bcvSlippagePercent === pct
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              {pct === 0 ? 'BCV Oficial' : `+${pct}%`}
            </button>
          ))}
          <button
            onClick={() => setShowAdjustDrawer(!showAdjustDrawer)}
            className="min-h-[36px] px-2.5 py-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium underline ml-1"
          >
            {showAdjustDrawer ? 'Ocultar Saldo' : 'Ajustar Saldo'}
          </button>
        </div>
      </div>

      {/* Cajón Plegable para Ajuste Manual de Saldos Disponibles */}
      {showAdjustDrawer && (
        <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Disponibilidad Total en Dólares (Efectivo + Bancos USD):
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-bold">$</span>
              <input
                type="number"
                value={availableUsd}
                onChange={(e) => setAvailableUsd(parseFloat(e.target.value) || 0)}
                className="w-full pl-7 pr-3 py-1.5 border border-slate-300 rounded-md bg-white font-mono font-semibold"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Disponibilidad Total en Bolívares (Efectivo + Bancos VES):
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-bold">Bs.</span>
              <input
                type="number"
                value={availableVes}
                onChange={(e) => setAvailableVes(parseFloat(e.target.value) || 0)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded-md bg-white font-mono font-semibold"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tarjetas Principales de Posición de Caja */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Liquidez Total */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 flex items-center justify-between">
            <span>Liquidez Real Disponible</span>
            <span className="text-[10px] font-bold text-slate-400">Hoy</span>
          </div>
          <div className="mt-1 font-mono font-extrabold text-lg text-slate-900 tabular-nums">
            {formatUsd(projection.currentAvailableLiquidity.consolidatedTotalUsd)}
          </div>
          <div className="text-xs font-mono text-slate-500 tabular-nums">
            ≈ {formatVes(projection.currentAvailableLiquidity.consolidatedTotalVes)}
          </div>
        </div>

        {/* 2. Compromisos Proveedores */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 flex items-center justify-between">
            <span>Cuentas por Pagar (30d)</span>
            <span className="text-[10px] font-bold text-rose-500">
              {projection.supplierObligations.overdueUsd > 0 ? 'Con Vencidos' : 'Al Día'}
            </span>
          </div>
          <div className="mt-1 font-mono font-extrabold text-lg text-rose-600 tabular-nums">
            -{formatUsd(projection.supplierObligations.totalPendingUsd)}
          </div>
          <div className="text-xs font-mono text-slate-500 tabular-nums">
            ≈ -{formatVes(projection.supplierObligations.totalPendingVes)}
          </div>
        </div>

        {/* 3. Provisión Quincenal SENIAT */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-xs font-semibold text-slate-500 flex items-center justify-between">
            <span>Provisión Fiscal SENIAT</span>
            <span className="text-[10px] font-bold text-amber-600">
              Corte: {projection.seniatFiscalObligations.nextQuincenaDeadlineVet}
            </span>
          </div>
          <div className="mt-1 font-mono font-extrabold text-lg text-amber-600 tabular-nums">
            -{formatVes(projection.seniatFiscalObligations.totalSeniatVes)}
          </div>
          <div className="text-xs font-mono text-slate-500 tabular-nums">
            ≈ -{formatUsd(projection.seniatFiscalObligations.totalSeniatUsd)}
          </div>
        </div>

        {/* 4. Balance Neto a 30 Días */}
        <div
          className={`p-3 rounded-xl border ${
            projection.horizons[3]?.isDeficit
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <div className="text-xs font-semibold flex items-center justify-between opacity-80">
            <span>Balance Neto a 30 Días</span>
            <span className="text-[10px] font-bold">
              {projection.horizons[3]?.isDeficit ? 'Déficit Proyectado' : 'Superávit'}
            </span>
          </div>
          <div className="mt-1 font-mono font-extrabold text-lg tabular-nums">
            {formatUsd(projection.horizons[3]?.projectedNetBalanceUsd || 0)}
          </div>
          <div className="text-xs font-mono opacity-80 tabular-nums">
            ≈ {formatVes(projection.horizons[3]?.projectedNetBalanceVes || 0)}
          </div>
        </div>
      </div>

      {/* Tabla Desglosada por Horizontes Temporales */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-3">Horizonte Temporal</th>
              <th className="py-2.5 px-3 text-right">Egresos Proveedores</th>
              <th className="py-2.5 px-3 text-right">Provisión SENIAT</th>
              <th className="py-2.5 px-3 text-right">Total Egresos (USD)</th>
              <th className="py-2.5 px-3 text-right">Balance Neto Proyectado</th>
              <th className="py-2.5 px-3 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projection.horizons.map((h, i) => (
              <tr key={i} className="hover:bg-slate-50/60 font-medium">
                <td className="py-2.5 px-3 font-semibold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {h.periodLabel}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                  {formatUsd(h.supplierOutflowUsd)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700">
                  {h.seniatTaxOutflowUsd > 0 ? formatUsd(h.seniatTaxOutflowUsd) : '—'}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-rose-600">
                  -{formatUsd(h.totalOutflowUsd)}
                </td>
                <td
                  className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold ${
                    h.isDeficit ? 'text-rose-600' : 'text-emerald-700'
                  }`}
                >
                  {formatUsd(h.projectedNetBalanceUsd)}
                </td>
                <td className="py-2.5 px-3 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      h.isDeficit ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {h.isDeficit ? 'Déficit' : 'Cubierto'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recomendaciones Directivas del Asistente Financiero */}
      {projection.recommendations.length > 0 && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
          <div className="font-bold text-slate-900 flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-4 h-4 text-indigo-600" /> Diagnóstico Financiero de Liquidez:
          </div>
          {projection.recommendations.map((rec, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-slate-600">
              <span className="text-indigo-500 font-bold">•</span>
              <span>{rec}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CashFlowProjectionsWidget;
