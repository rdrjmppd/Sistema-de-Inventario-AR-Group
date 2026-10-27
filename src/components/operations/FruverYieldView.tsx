/**
 * Fruits & Vegetables Yield & Waste Control View (Rendimiento Frutas y Verduras)
 * Tracks agricultural lot receipt, biological decay, mechanical damage, and salable net yield.
 * Dual Export: export const FruverYieldView and export default FruverYieldView.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import React, { useState, useMemo } from 'react';
import {
  Apple,
  TrendingDown,
  AlertOctagon,
  Scale,
  DollarSign,
  FileText,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  FruverCategory,
  FruverLossCause,
  FruverBatchRecord,
  CreateFruverBatchInput,
  UserRole,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import {
  FRUVER_LOSS_CAUSE_LABELS,
  FRUVER_STANDARD_PRODUCTS,
  calculateFruverBatch,
} from '../../lib/fruver-yield';

export const FruverYieldView: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { locations } = useInventory();
  const { bcvState } = useFinance();

  const [selectedProductSku, setSelectedProductSku] = useState<string>('FRUV-TOM-PER');
  const [selectedLocationId, setSelectedLocationId] = useState<string>(locations[0]?.id || 'loc-pzo-01');
  const [initialWeightKg, setInitialWeightKg] = useState<number>(100);
  const [costPerKgUsd, setCostPerKgUsd] = useState<number>(1.15);
  const [targetMarginPercent, setTargetMarginPercent] = useState<number>(28);

  // Waste weights by the 5 specific causes
  const [wastesByCause, setWastesByCause] = useState<Record<FruverLossCause, number>>({
    DESHIDRATACION_PERDIDA_PESO: 2.5,
    DANO_EXCESO_FRIO: 1.2,
    DANO_EXCESO_CALOR: 3.4,
    DANO_MECANICO_MANIPULACION: 1.8,
    EXCESO_DIAS_EXPOSICION_ROTACION: 0.8,
  });

  const selectedProduct = useMemo(() => {
    return (
      FRUVER_STANDARD_PRODUCTS.find((p) => p.sku === selectedProductSku) ||
      FRUVER_STANDARD_PRODUCTS[0]
    );
  }, [selectedProductSku]);

  const handleProductChange = (sku: string) => {
    setSelectedProductSku(sku);
    const prod = FRUVER_STANDARD_PRODUCTS.find((p) => p.sku === sku);
    if (prod) {
      setCostPerKgUsd(prod.defaultCostUsdPerKg);
      setTargetMarginPercent(prod.defaultTargetMarginPercent);
    }
  };

  const computedBatch: FruverBatchRecord = useMemo(() => {
    const loc = locations.find((l) => l.id === selectedLocationId) || locations[0];

    const wastesInput = (Object.keys(wastesByCause) as FruverLossCause[]).map((cause) => ({
      cause,
      weightKg: wastesByCause[cause] || 0,
      notes: FRUVER_LOSS_CAUSE_LABELS[cause]?.description || '',
    }));

    const input: CreateFruverBatchInput = {
      productId: `prd-${selectedProduct.sku}`,
      productSku: selectedProduct.sku,
      productName: selectedProduct.name,
      category: selectedProduct.category,
      locationId: loc ? loc.id : 'loc-pzo-01',
      initialWeightKg: initialWeightKg || 1,
      initialCostPerKgUsd: costPerKgUsd || 0.1,
      targetMarginPercent,
      wastes: wastesInput,
    };

    return calculateFruverBatch({
      input,
      bcvRate: bcvState.activeRate,
      locationName: loc ? loc.name : 'Sede Principal',
      supervisor: {
        uid: user?.uid || 'usr-supervisor',
        displayName: user?.displayName || 'Supervisor Fruver',
        role: user?.role || UserRole.SUPERVISOR_FRUVER,
      },
    });
  }, [
    selectedProduct,
    selectedLocationId,
    initialWeightKg,
    costPerKgUsd,
    targetMarginPercent,
    wastesByCause,
    locations,
    bcvState.activeRate,
    user,
  ]);

  const canEdit = hasPermission([
    UserRole.SUPERADMIN,
    UserRole.GERENTE,
    UserRole.ANALISTA,
    UserRole.SUPERVISOR_FRUVER,
  ]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-emerald-900/40 rounded-2xl p-5 shadow-xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-600/30 border border-emerald-500/40 text-emerald-400">
              <Apple className="w-5 h-5" />
            </span>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">
              Rendimiento & Control de Mermas de Frutas y Verduras
            </h1>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Cargas de lotes agrícolas, auditoría de <strong>5 causas de descomposición/merma</strong>, cálculo de rendimiento vendible neto y absorción de costo con precisión Decimal.js.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono">
            Tasa BCV: <strong>{bcvState.activeRate.toFixed(4)}</strong> VES
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-semibold">
            Fruver Agro
          </span>
        </div>
      </div>

      {/* Lot Parameters Card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-xs">
        <div>
          <label className="block font-bold text-slate-700 mb-1">Producto Agrícola</label>
          <select
            value={selectedProductSku}
            onChange={(e) => handleProductChange(e.target.value)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-bold focus:ring-2 focus:ring-emerald-500/30"
          >
            {FRUVER_STANDARD_PRODUCTS.map((prod) => (
              <option key={prod.sku} value={prod.sku}>
                {prod.name} ({prod.category})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Sede / Depósito</label>
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/30"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Peso Recibido Lote (Kg)</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={initialWeightKg}
              onChange={(e) => setInitialWeightKg(Math.max(0.1, parseFloat(e.target.value) || 0))}
              disabled={!canEdit}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold font-mono focus:ring-2 focus:ring-emerald-500/30"
            />
            <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-xs">Kg</span>
          </div>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Costo Unitario ($ USD / Kg)</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={costPerKgUsd}
              onChange={(e) => setCostPerKgUsd(Math.max(0.01, parseFloat(e.target.value) || 0))}
              disabled={!canEdit}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold font-mono focus:ring-2 focus:ring-emerald-500/30"
            />
            <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-xs">USD</span>
          </div>
        </div>
      </div>

      {/* Yield Metrics Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-sm border border-slate-800">
          <p className="text-slate-400 text-[11px] font-medium">Inversión Total en Lote</p>
          <p className="text-lg md:text-xl font-bold font-mono text-white mt-1">
            ${computedBatch.totalBatchCostUsd.toFixed(2)}{' '}
            <span className="text-[10px] text-slate-400">USD</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Bs. {(computedBatch.totalBatchCostUsd * bcvState.activeRate).toFixed(2)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-[11px] font-medium">Rendimiento Neto Vendible</p>
          <p className="text-lg md:text-xl font-bold font-mono text-emerald-600 mt-1">
            {computedBatch.netYieldPercent.toFixed(2)}%
          </p>
          <p className="text-[10px] text-slate-500 mt-1 font-bold">
            {computedBatch.netSalableWeightKg.toFixed(2)} Kg en piso de venta
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-[11px] font-medium">Merma Total Acumulada</p>
          <p className="text-lg md:text-xl font-bold font-mono text-rose-600 mt-1">
            {computedBatch.wastePercent.toFixed(2)}%
          </p>
          <p className="text-[10px] text-rose-600 mt-1 font-semibold">
            Pérdida: -${computedBatch.totalWasteLossUsd.toFixed(2)} USD (Bs. -{computedBatch.totalWasteLossVes.toFixed(2)})
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-[11px] font-medium">Costo Efectivo / PVP Sugerido</p>
          <p className="text-lg md:text-xl font-bold font-mono text-sky-700 mt-1">
            ${computedBatch.suggestedPvpPerKgUsd.toFixed(2)}{' '}
            <span className="text-[10px] text-slate-400">PVP/Kg</span>
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Costo absorbido: ${computedBatch.effectiveCostPerSalableKgUsd.toFixed(2)} / Kg
          </p>
        </div>
      </div>

      {/* 5 Causes of Agricultural Waste Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Auditoría y Clasificación de Mermas por 5 Causas Específicas
            </h3>
            <p className="text-[11px] text-slate-500">
              Registra los Kg descartados en cada rubro para medir el impacto financiero y la responsabilidad operativa.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
            Lote: {computedBatch.batchCode}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
                <th className="py-2.5 px-3">Causa de Merma / Descomposición</th>
                <th className="py-2.5 px-3">Descripción Operativa</th>
                <th className="py-2.5 px-3 text-right">Peso Merma (Kg)</th>
                <th className="py-2.5 px-3 text-right">% del Lote</th>
                <th className="py-2.5 px-3 text-right">Pérdida en Costo ($ USD)</th>
                <th className="py-2.5 px-3 text-right">Pérdida en Costo (VES)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {computedBatch.wastes.map((waste) => (
                <tr key={waste.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-3 font-sans font-bold text-slate-800">
                    {waste.causeLabel}
                  </td>
                  <td className="py-3 px-3 font-sans text-[11px] text-slate-500 max-w-xs">
                    {FRUVER_LOSS_CAUSE_LABELS[waste.cause]?.description}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={wastesByCause[waste.cause] ?? waste.weightKg}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        setWastesByCause((prev) => ({ ...prev, [waste.cause]: val }));
                      }}
                      disabled={!canEdit}
                      className="w-20 px-2 py-1 text-right rounded border border-slate-300 font-bold bg-white text-slate-900"
                    />
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700 font-semibold">
                    {waste.percentOfBatch.toFixed(2)}%
                  </td>
                  <td className="py-3 px-3 text-right font-bold text-rose-600">
                    -${waste.lossCostUsd.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-500">
                    Bs. -{waste.lossCostVes.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/80 font-bold border-t border-slate-200">
                <td className="py-2.5 px-3 text-slate-900" colSpan={2}>
                  Total Mermas del Lote:
                </td>
                <td className="py-2.5 px-3 text-right text-rose-700 font-mono">
                  {computedBatch.totalWasteKg.toFixed(2)} Kg
                </td>
                <td className="py-2.5 px-3 text-right text-rose-700 font-mono">
                  {computedBatch.wastePercent.toFixed(2)}%
                </td>
                <td className="py-2.5 px-3 text-right text-rose-700 font-mono">
                  -${computedBatch.totalWasteLossUsd.toFixed(2)}
                </td>
                <td className="py-2.5 px-3 text-right text-rose-700 font-mono">
                  Bs. -{computedBatch.totalWasteLossVes.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FruverYieldView;
