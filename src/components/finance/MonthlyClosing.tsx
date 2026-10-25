import React, { useState } from 'react';
import { Lock, FileText, CheckCircle2 } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { toDecimal, round2, formatUsd, formatVes } from '../../lib/decimal';
import { exportMonthlyClosurePdf } from '../../lib/pdf-exporter';

export const MonthlyClosing: React.FC = () => {
  const { closures, generateMonthlyClosure } = useFinance();
  const { products } = useInventory();
  const { user } = useAuth();
  const { config } = useUIConfig();

  const [period, setPeriod] = useState('2026-03');
  const [banner, setBanner] = useState<string | null>(null);

  const currentInventoryValuationUsd = round2(
    products.reduce((acc, p) => {
      const qty = Object.values(p.stockByLocation).reduce(
        (s, q) => s.plus(q),
        toDecimal(0)
      );
      return acc.plus(qty.times(p.costUsd));
    }, toDecimal(0))
  );

  const handleExecuteClosing = () => {
    const report = generateMonthlyClosure(
      period,
      currentInventoryValuationUsd,
      user?.email || 'rdrj.mppd@gmail.com'
    );
    setBanner(
      `Cierre Contable del período ${report.period} ejecutado y sellado con precisión Decimal.js.`
    );
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-sky-600" />
            <h1 className="text-base font-bold text-slate-900">
              Cierre Contable y Conciliación Mensual de Inventario Multi-Sede
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Congelamiento de saldos de inventario, cuentas por pagar y emisión de acta ejecutiva
            PDF.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white"
          />
          <button
            type="button"
            onClick={handleExecuteClosing}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
          >
            Ejecutar Cierre {period}
          </button>
        </div>
      </div>

      {banner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{banner}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {closures.map((cls) => (
          <div
            key={cls.id}
            className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  {cls.status}
                </span>
                <h2 className="text-base font-bold text-slate-900 mt-1">
                  Período Fiscal {cls.period}
                </h2>
                <p className="text-[11px] font-mono text-slate-400">
                  Sellado: {cls.closedAtVet.slice(0, 16).replace('T', ' ')} por {cls.closedBy}
                </p>
              </div>
              <button
                type="button"
                onClick={() => exportMonthlyClosurePdf(cls, config.companyProfile)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
              >
                <FileText className="w-3.5 h-3.5 text-sky-400" />
                Descargar Acta PDF
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50">
                <div className="text-[10px] font-mono uppercase text-slate-500">
                  Valoración Inventario (USD)
                </div>
                <div className="font-mono font-bold text-sm text-slate-900 mt-0.5">
                  {formatUsd(cls.inventoryValuationUsd)}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-sky-50/70">
                <div className="text-[10px] font-mono uppercase text-sky-700">
                  Valoración Inventario (VES)
                </div>
                <div className="font-mono font-bold text-sm text-sky-900 mt-0.5">
                  {formatVes(cls.inventoryValuationVes)}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50">
                <div className="text-[10px] font-mono uppercase text-slate-500">
                  Compras Auditadas OCR
                </div>
                <div className="font-mono font-bold text-sm text-slate-900 mt-0.5">
                  {formatUsd(cls.totalPurchasesUsd)}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-rose-50/60">
                <div className="text-[10px] font-mono uppercase text-rose-700">
                  CxP Pendientes al Cierre
                </div>
                <div className="font-mono font-bold text-sm text-rose-900 mt-0.5">
                  {formatUsd(cls.pendingPayablesUsd)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MonthlyClosing;
