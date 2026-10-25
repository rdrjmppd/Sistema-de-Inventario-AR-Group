import React from 'react';
import {
  TrendingUp,
  Package,
  AlertTriangle,
  Wallet,
  ArrowRight,
  FileSpreadsheet,
  ScanLine,
  ShieldCheck,
  Building2,
  MapPin,
  Phone,
  Edit3,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import { useUIConfig } from '../../context/UIConfigContext';
import { NavigationTab } from '../../types';
import { toDecimal, round2, formatUsd, formatVes } from '../../lib/decimal';
import { DEFAULT_COMPANY_PROFILE } from '../../lib/excel-exporter';

interface AnalyticsDashboardProps {
  onNavigate: (tab: NavigationTab) => void;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ onNavigate }) => {
  const { products, locations, selectedLocationId, reorderAlerts } = useInventory();
  const { bcvState, invoices } = useFinance();
  const { config, setIsCompanyModalOpen } = useUIConfig();
  const company = config.companyProfile || DEFAULT_COMPANY_PROFILE;

  // Compute consolidated or location-filtered metrics with Decimal.js
  let totalCostUsd = toDecimal(0);
  let totalRetailUsd = toDecimal(0);
  let totalUnits = toDecimal(0);

  for (const p of products) {
    const qty =
      selectedLocationId === 'ALL'
        ? Object.values(p.stockByLocation).reduce((a, b) => a + b, 0)
        : p.stockByLocation[selectedLocationId] ?? 0;

    totalUnits = totalUnits.plus(qty);
    totalCostUsd = totalCostUsd.plus(toDecimal(qty).times(p.costUsd));
    totalRetailUsd = totalRetailUsd.plus(toDecimal(qty).times(p.priceUsd));
  }

  const lowStockCount =
    selectedLocationId === 'ALL'
      ? reorderAlerts.length
      : reorderAlerts.filter((a) => a.locationId === selectedLocationId).length;

  const costUsdNum = round2(totalCostUsd);
  const costVesNum = round2(totalCostUsd.times(bcvState.activeRate));
  const retailUsdNum = round2(totalRetailUsd);
  const potentialProfitUsd = round2(totalRetailUsd.minus(totalCostUsd));

  const pendingPayablesUsd = round2(
    invoices.reduce(
      (acc, inv) => acc.plus(toDecimal(inv.totalUsd).minus(inv.paidAmountUsd)),
      toDecimal(0)
    )
  );

  // Per-location bar distribution
  const locationBars = locations.map((loc) => {
    const valUsd = round2(
      products.reduce(
        (acc, p) =>
          acc.plus(toDecimal(p.stockByLocation[loc.id] ?? 0).times(p.costUsd)),
        toDecimal(0)
      )
    );
    const pct =
      costUsdNum > 0
        ? Math.min(100, Math.round((valUsd / costUsdNum) * 100))
        : 33;
    return { loc, valUsd, pct };
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Corporate Identity & Fiscal Letterhead Card (Main Panel Alignment) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-slate-900 text-sky-400 border border-slate-800 shrink-0 mt-0.5">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-sky-100 text-sky-900 font-bold border border-sky-200">
                EMPRESA TITULAR DEL INVENTARIO
              </span>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-900 text-emerald-400">
                RIF: {company.rif}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                Código SADA: {company.codigoSada}
              </span>
              {!company.isCustomConfigured && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  Modo Plantilla Genérica Activo
                </span>
              )}
            </div>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 mt-1 truncate">
              {company.razonSocial}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>{company.direccionFiscal}</span>
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                <Phone className="w-3 h-3 text-emerald-600 shrink-0" />
                <span>{company.telefono}</span>
              </span>
              <span className="text-[11px] text-slate-500">
                Responsable: <strong>{company.representanteLegal}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsCompanyModalOpen(true)}
            className="min-h-[40px] flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-sky-700 text-white text-xs font-bold transition shadow-2xs cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-sky-400" />
            <span>Datos de la Empresa (Razón Social / RIF)</span>
          </button>
        </div>
      </div>

      {/* Top Executive Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-5 border border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sky-400 text-xs font-mono uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4" />
            <span>Torre de Control Financiera &amp; Operativa Multi-Sede</span>
          </div>
          <h1 className="text-lg md:text-xl font-bold mt-1">
            Chrystal® Enterprise ERP — Inteligencia de Inventario y Costos en Tiempo Real
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Valorización dual protegida contra inflación cambiaria · Tasa activa BCV:{' '}
            <strong className="font-mono text-emerald-400">
              Bs. {bcvState.activeRate.toFixed(2)} / USD
            </strong>{' '}
            ({bcvState.rateSourceLabel}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('CHRYSTAL_IMPORT')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Importar Excel Chrystal®
          </button>
          <button
            type="button"
            onClick={() => onNavigate('INVOICES_OCR')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition shadow-xs"
          >
            <ScanLine className="w-4 h-4" />
            Auditar Factura OCR (4 Candados)
          </button>
        </div>
      </div>

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500">
            <span>Capital en Inventario (Costo)</span>
            <Package className="w-4 h-4 text-sky-600" />

          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 mt-1.5">
            {formatUsd(costUsdNum)}
          </div>
          <div className="text-xs font-mono text-sky-700 font-semibold mt-1">
            {formatVes(costVesNum)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500">
            <span>Valor Venta Proyectado (PVP)</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-mono font-bold text-slate-900 mt-1.5">
            {formatUsd(retailUsdNum)}
          </div>
          <div className="text-xs font-mono text-emerald-700 font-semibold mt-1">
            Utilidad Potencial: +{formatUsd(potentialProfitUsd)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500">
            <span>Cuentas por Pagar (CxP)</span>
            <Wallet className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-mono font-bold text-rose-700 mt-1.5">
            {formatUsd(pendingPayablesUsd)}
          </div>
          <div className="text-xs font-mono text-slate-500 mt-1">
            {invoices.length} facturas auditadas por OCR
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-500">
            <span>Alertas de Reorden / Quiebre</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-mono font-bold text-amber-700 mt-1.5">
            {lowStockCount} SKUs
          </div>
          <button
            type="button"
            onClick={() => onNavigate('PURCHASE_SUGGESTIONS')}
            className="text-xs font-semibold text-sky-600 hover:text-sky-500 flex items-center gap-1 mt-1"
          >
            <span>Ver Compras Sugeridas</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Middle Analytical Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Warehouse Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Distribución por Sede o Depósito
            </h2>
            <span className="text-[11px] font-mono text-slate-400">
              {round2(totalUnits)} Und. Totales
            </span>
          </div>

          <div className="space-y-3 pt-1">
            {locationBars.map(({ loc, valUsd, pct }) => (
              <div key={loc.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-800 truncate">
                    {loc.code} — {loc.name}
                  </span>
                  <span className="font-mono font-bold text-slate-900 whitespace-nowrap shrink-0">
                    {formatUsd(valUsd)} ({pct}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-600 rounded-full transition-all"
                    style={{ width: `${Math.max(8, pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Pareto Class A Products */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              SKUs Clase A (Alta Rotación Pareto 80%) & Indexación BCV
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('CATALOG')}
              className="text-xs font-semibold text-sky-600 hover:text-sky-500 flex items-center gap-1"
            >
              <span>Catálogo Completo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-200 text-[10px] font-mono uppercase">
                  <th className="py-2 px-3">SKU</th>
                  <th className="py-2 px-3">Producto</th>
                  <th className="py-2 px-3 text-right">Costo USD</th>
                  <th className="py-2 px-3 text-right">PVP USD</th>
                  <th className="py-2 px-3 text-right">PVP Bs. (BCV)</th>
                  <th className="py-2 px-3 text-right">Rotación / Mes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {products
                  .filter((p) => p.abcClass === 'A')
                  .slice(0, 5)
                  .map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">
                        {p.sku}
                      </td>
                      <td className="py-2 px-3 font-semibold text-slate-900">{p.name}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {formatUsd(p.costUsd)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold">
                        {formatUsd(p.priceUsd)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-sky-700">
                        {formatVes(round2(toDecimal(p.priceUsd).times(bcvState.activeRate)))}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-700 font-semibold">
                        {p.monthlyUnitsSold} {p.unit}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
