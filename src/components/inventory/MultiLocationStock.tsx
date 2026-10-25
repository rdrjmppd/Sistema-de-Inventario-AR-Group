import React, { useState, useMemo } from 'react';
import {
  Boxes,
  Building2,
  Warehouse,
  AlertCircle,
  CheckCircle2,
  Plus,
  ChevronDown,
  RotateCcw,
  Trash2,
  Lock,
  FileSpreadsheet,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { toDecimal, round2, formatUsd, formatVes } from '../../lib/decimal';
import { CATALOG_BATCH_SIZE, getCatalogBatchSlice } from '../../lib/catalog-pagination';
import { exportInventoryDualSheetExcel } from '../../lib/excel-exporter';

export const MultiLocationStock: React.FC = () => {
  const { products, locations, setIsAddLocationModalOpen, setLocationToDelete } = useInventory();
  const { bcvState } = useFinance();
  const { user } = useAuth();

  const [visibleCount, setVisibleCount] = useState<number>(CATALOG_BATCH_SIZE);

  const canManageLocations =
    user?.role === UserRole.SUPERADMIN || user?.role === UserRole.GERENTE;

  const batchSlice = useMemo(() => {
    return getCatalogBatchSlice(products, visibleCount, CATALOG_BATCH_SIZE);
  }, [products, visibleCount]);

  const locationSummaries = locations.map((loc) => {
    let totalUnits = toDecimal(0);
    let totalCostUsd = toDecimal(0);
    let totalRetailUsd = toDecimal(0);
    let alertsCount = 0;

    for (const p of products) {
      const qty = p.stockByLocation[loc.id] ?? 0;
      const minQty = p.minStockByLocation[loc.id] ?? 0;
      const manualMode = p.manualRiskByLocation?.[loc.id] || 'AUTOMATICO';
      if (
        manualMode !== 'EXENTO_MANUAL' &&
        ((qty <= minQty && minQty > 0) ||
          manualMode === 'CRITICO_MANUAL' ||
          manualMode === 'PREVENTIVO_MANUAL')
      ) {
        alertsCount++;
      }
      totalUnits = totalUnits.plus(qty);
      totalCostUsd = totalCostUsd.plus(toDecimal(qty).times(p.costUsd));
      totalRetailUsd = totalRetailUsd.plus(toDecimal(qty).times(p.priceUsd));
    }

    const costUsdNum = round2(totalCostUsd);
    const costVesNum = round2(totalCostUsd.times(bcvState.activeRate));

    return {
      loc,
      totalUnits: round2(totalUnits),
      costUsdNum,
      costVesNum,
      retailUsdNum: round2(totalRetailUsd),
      alertsCount,
    };
  });

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Boxes className="w-5 h-5 text-sky-600 shrink-0" />
            <h1 className="text-sm sm:text-base font-bold text-slate-900">
              Matriz de Existencias y Valorización por Sede o Depósito ({locations.length} Activos)
            </h1>
            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 font-mono text-[10px] font-bold">
              ALTA / BAJA CON CÓDIGO DE AUTORIZACIÓN (SUPERADMIN · GERENTE)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Control simultáneo de inventario físico en Sedes específicas y Depósitos logísticos con
            valorización financiera exacta en USD y Bolívares (BCV).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => exportInventoryDualSheetExcel(products, locations, bcvState)}
            className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold transition shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Exportar Sabana Producto/Celda (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={() => setIsAddLocationModalOpen(true)}
            className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Añadir Sede o Depósito</span>
          </button>
        </div>
      </div>

      {/* Location / Depot Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {locationSummaries.map((item) => {
          const isDepot = item.loc.type === 'DEPOSITO' || item.loc.type === 'CEDIS';
          return (
            <div
              key={item.loc.id}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`p-2 rounded-lg ${
                      isDepot ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-900 text-sky-400'
                    }`}
                  >
                    {isDepot ? (
                      <Warehouse className="w-4 h-4" />
                    ) : (
                      <Building2 className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isDepot
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-sky-100 text-sky-800 border border-sky-200'
                      }`}
                    >
                      {item.loc.code} · {isDepot ? 'DEPÓSITO' : 'SEDE'}
                    </span>
                    <h2 className="text-xs font-bold text-slate-900 mt-0.5">{item.loc.name}</h2>
                    <p className="text-[11px] text-slate-500">
                      {item.loc.city} · Resp: {item.loc.manager}
                    </p>
                  </div>
                </div>

                {locations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLocationToDelete(item.loc)}
                    title={
                      canManageLocations
                        ? `Eliminar ${item.loc.code} con código de autorización`
                        : 'Solo SUPERADMIN o GERENTE pueden eliminar Sedes o Depósitos'
                    }
                    className={`p-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition shrink-0 cursor-pointer ${
                      canManageLocations
                        ? 'border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                  >
                    {canManageLocations ? (
                      <Trash2 className="w-3.5 h-3.5" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" />
                    )}
                    <span>Eliminar</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                <div className="bg-slate-50 p-2.5 rounded-lg">
                  <div className="text-[10px] uppercase text-slate-500 font-mono">
                    Costo Inventario (USD)
                  </div>
                  <div className="font-mono font-bold text-sm text-slate-900 mt-0.5">
                    {formatUsd(item.costUsdNum)}
                  </div>
                </div>
                <div className="bg-sky-50/70 p-2.5 rounded-lg">
                  <div className="text-[10px] uppercase text-sky-700 font-mono">
                    Valoración BCV (VES)
                  </div>
                  <div className="font-mono font-bold text-sm text-sky-800 mt-0.5">
                    {formatVes(item.costVesNum)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1 text-slate-600">
                <span>
                  Unidades Totales:{' '}
                  <strong className="font-mono text-slate-900">{item.totalUnits}</strong>
                </span>
                {item.alertsCount > 0 ? (
                  <span className="flex items-center gap-1 text-amber-700 font-semibold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {item.alertsCount} SKUs en riesgo / reorden
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Stock Óptimo
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Quick '+' Card to Add Another Sede or Depósito */}
        <button
          type="button"
          onClick={() => setIsAddLocationModalOpen(true)}
          className="border-2 border-dashed border-slate-300 hover:border-sky-500 hover:bg-sky-50/40 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-slate-600 hover:text-sky-800 transition min-h-[160px] cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </div>
          <div className="text-xs font-bold">Añadir Nueva Sede o Depósito</div>
          <div className="text-[11px] text-slate-500 text-center max-w-xs">
            Requiere Código de Autorización / PIN de usuario nivel SUPERADMIN o GERENTE.
          </div>
        </button>
      </div>

      {/* Dynamic Cross-Location Matrix Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Comparativa Desglosada por Sede o Depósito ({batchSlice.visibleCount} de{' '}
            {batchSlice.totalItems} SKUs)
          </h3>
          <span className="text-[11px] font-mono text-slate-500">
            Cálculo exacto Decimal.js (ROUND_HALF_UP)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                <th className="py-2.5 px-3">SKU</th>
                <th className="py-2.5 px-3">Producto</th>
                {locations.map((loc) => (
                  <th key={loc.id} className="py-2.5 px-3 text-right whitespace-nowrap">
                    {loc.code} ({loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 'Depósito' : 'Sede'})
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right">Total Consolidado</th>
                <th className="py-2.5 px-3 text-right">Valor Total (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {batchSlice.visibleItems.map((p) => {
                const total = locations.reduce(
                  (acc, loc) => round2(toDecimal(acc).plus(p.stockByLocation[loc.id] ?? 0)),
                  0
                );
                const totalValUsd = round2(toDecimal(total).times(p.costUsd));

                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{p.sku}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{p.name}</td>
                    {locations.map((loc) => {
                      const locQty = p.stockByLocation[loc.id] ?? 0;
                      const locMin = p.minStockByLocation[loc.id] ?? 0;
                      const isLow = locQty <= locMin && locMin > 0;
                      return (
                        <td key={loc.id} className="py-2.5 px-3 text-right font-mono">
                          <span className={isLow ? 'text-amber-700 font-bold' : 'text-slate-700'}>
                            {locQty} {p.unit}
                          </span>
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50">
                      {total} {p.unit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                      {formatUsd(totalValUsd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Batch Pagination Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs font-mono text-slate-600">
            Mostrando {batchSlice.visibleCount} de {batchSlice.totalItems} productos en matriz
            multi-sede/depósito
          </span>
          <div className="flex items-center gap-2">
            {batchSlice.visibleCount > CATALOG_BATCH_SIZE && (
              <button
                type="button"
                onClick={() => setVisibleCount(CATALOG_BATCH_SIZE)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Contraer a 20</span>
              </button>
            )}
            {batchSlice.hasMore && (
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + CATALOG_BATCH_SIZE)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition cursor-pointer"
              >
                <span>Continuar (+{batchSlice.nextBatchSize} productos)</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiLocationStock;
