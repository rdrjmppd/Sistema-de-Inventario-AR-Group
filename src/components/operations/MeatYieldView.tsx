/**
 * Meat Yield & Butchery Transformation View (Rendimiento Cárnico)
 * Supports Res, Cerdo, and Pollo carcass cross-inventory processing and yields.
 * Dual Export: export const MeatYieldView and export default MeatYieldView.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import React, { useState, useMemo } from 'react';
import {
  Layers,
  Scale,
  TrendingUp,
  AlertTriangle,
  Plus,
  FileSpreadsheet,
  CheckCircle2,
  Calculator,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import {
  MeatAnimalType,
  MeatCarcassPresentation,
  MeatYieldBatch,
  CreateMeatYieldBatchInput,
  UserRole,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import {
  RES_STANDARD_CUTS,
  CERDO_STANDARD_CUTS,
  POLLO_STANDARD_CUTS,
  MEAT_WASTE_LABELS,
  calculateMeatYieldBatch,
  projectCarcassRequirementForCutDemand,
} from '../../lib/meat-yield';

export const MeatYieldView: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { locations } = useInventory();
  const { bcvState } = useFinance();

  const [selectedAnimal, setSelectedAnimal] = useState<MeatAnimalType>('RES');
  const [selectedPresentation, setSelectedPresentation] = useState<MeatCarcassPresentation>('MEDIA_CANAL');
  const [selectedLocationId, setSelectedLocationId] = useState<string>(locations[0]?.id || 'loc-pzo-01');
  const [carcassWeight, setCarcassWeight] = useState<number>(220); // 220 Kg default
  const [carcassCostKg, setCarcassCostKg] = useState<number>(2.85); // $2.85/Kg default

  // Custom cuts weights state initialized from standard template
  const initialTemplate = useMemo(() => {
    return selectedAnimal === 'RES'
      ? RES_STANDARD_CUTS
      : selectedAnimal === 'CERDO'
      ? CERDO_STANDARD_CUTS
      : POLLO_STANDARD_CUTS;
  }, [selectedAnimal]);

  const [cutWeights, setCutWeights] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    RES_STANDARD_CUTS.forEach((c) => {
      map[c.cutName] = parseFloat(((220 * c.expectedYieldPercent) / 100).toFixed(2));
    });
    return map;
  });

  // Wastes state
  const [wasteWeights, setWasteWeights] = useState({
    mermaEvaporacion: 4.5,
    aserrinSierra: 2.2,
    huesoDesecho: 6.8,
  });

  // Future purchase projection calculator state
  const [projectionCutName, setProjectionCutName] = useState<string>('Lomito / Filet Mignon');
  const [targetDemandKg, setTargetDemandKg] = useState<number>(50);

  // Re-initialize weights on animal change
  const handleAnimalChange = (animal: MeatAnimalType) => {
    setSelectedAnimal(animal);
    const template =
      animal === 'RES'
        ? RES_STANDARD_CUTS
        : animal === 'CERDO'
        ? CERDO_STANDARD_CUTS
        : POLLO_STANDARD_CUTS;

    const defaultWeight = animal === 'RES' ? 220 : animal === 'CERDO' ? 95 : 25;
    const defaultCost = animal === 'RES' ? 2.85 : animal === 'CERDO' ? 3.40 : 2.10;
    setCarcassWeight(defaultWeight);
    setCarcassCostKg(defaultCost);

    const map: Record<string, number> = {};
    template.forEach((c) => {
      map[c.cutName] = parseFloat(((defaultWeight * c.expectedYieldPercent) / 100).toFixed(2));
    });
    setCutWeights(map);
    setProjectionCutName(template[0]?.cutName || '');
  };

  // Build live computed batch
  const computedBatch: MeatYieldBatch = useMemo(() => {
    const loc = locations.find((l) => l.id === selectedLocationId) || locations[0];
    const template =
      selectedAnimal === 'RES'
        ? RES_STANDARD_CUTS
        : selectedAnimal === 'CERDO'
        ? CERDO_STANDARD_CUTS
        : POLLO_STANDARD_CUTS;

    const cutsInput = template.map((c) => ({
      cutName: c.cutName,
      tier: c.tier,
      weightKg: cutWeights[c.cutName] || 0,
      relativeValueFactor: c.relativeValueFactor,
      targetMarginPercent: c.defaultTargetMarginPercent,
    }));

    const wastesInput = [
      {
        wasteType: 'MERMA_EVAPORACION_LIQUIDOS' as const,
        label: MEAT_WASTE_LABELS.MERMA_EVAPORACION_LIQUIDOS,
        weightKg: wasteWeights.mermaEvaporacion || 0,
      },
      {
        wasteType: 'ASERRIN_CORTE_SIERRA' as const,
        label: MEAT_WASTE_LABELS.ASERRIN_CORTE_SIERRA,
        weightKg: wasteWeights.aserrinSierra || 0,
      },
      {
        wasteType: 'HUESO_BLANCO_DESECHO' as const,
        label: MEAT_WASTE_LABELS.HUESO_BLANCO_DESECHO,
        weightKg: wasteWeights.huesoDesecho || 0,
      },
    ];

    const input: CreateMeatYieldBatchInput = {
      animalType: selectedAnimal,
      presentation: selectedPresentation,
      locationId: loc ? loc.id : 'loc-pzo-01',
      carcassWeightKg: carcassWeight || 1,
      carcassCostPerKgUsd: carcassCostKg || 1,
      cuts: cutsInput,
      wastes: wastesInput,
    };

    return calculateMeatYieldBatch({
      input,
      bcvRate: bcvState.activeRate,
      locationName: loc ? loc.name : 'Sede Principal',
      supervisor: {
        uid: user?.uid || 'usr-supervisor',
        displayName: user?.displayName || 'Supervisor Carnicería',
        role: user?.role || UserRole.SUPERVISOR_CARNICERIA,
      },
    });
  }, [
    selectedAnimal,
    selectedPresentation,
    selectedLocationId,
    carcassWeight,
    carcassCostKg,
    cutWeights,
    wasteWeights,
    locations,
    bcvState.activeRate,
    user,
  ]);

  // Purchase requirement projection calculation
  const purchaseProjection = useMemo(() => {
    return projectCarcassRequirementForCutDemand({
      animalType: selectedAnimal,
      cutName: projectionCutName,
      targetDemandKg: targetDemandKg || 1,
    });
  }, [selectedAnimal, projectionCutName, targetDemandKg]);

  const canEdit = hasPermission([
    UserRole.SUPERADMIN,
    UserRole.GERENTE,
    UserRole.ANALISTA,
    UserRole.SUPERVISOR_CARNICERIA,
  ]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-slate-900 border border-rose-900/40 rounded-2xl p-5 shadow-xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-rose-600/30 border border-rose-500/40 text-rose-400">
              <Layers className="w-5 h-5" />
            </span>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">
              Rendimiento Cárnico & Transformación de Despiece
            </h1>
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Cargas y descargas cruzadas para transformación de <strong>Res, Cerdo y Pollo</strong> entero en cortes comerciales, costeo por valor relativo y control exacto de mermas con precisión Decimal.js.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-mono">
            Tasa BCV: <strong>{bcvState.activeRate.toFixed(4)}</strong> VES
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-400/30 text-xs font-semibold">
            Modo Doble Firma
          </span>
        </div>
      </div>

      {/* Animal Selection Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => handleAnimalChange('RES')}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
            selectedAnimal === 'RES'
              ? 'bg-rose-700 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>🥩 Vacuno (Res)</span>
        </button>

        <button
          type="button"
          onClick={() => handleAnimalChange('CERDO')}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
            selectedAnimal === 'CERDO'
              ? 'bg-amber-600 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>🥓 Porcino (Cerdo)</span>
        </button>

        <button
          type="button"
          onClick={() => handleAnimalChange('POLLO')}
          className={`min-h-[44px] px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
            selectedAnimal === 'POLLO'
              ? 'bg-emerald-700 text-white shadow-md'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>🍗 Avícola (Pollo)</span>
        </button>
      </div>

      {/* Carcass Receipt & Batch Input Parameters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-xs">
        <div>
          <label className="block font-bold text-slate-700 mb-1">Sede / Depósito</label>
          <select
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-rose-500/30"
          >
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Presentación de Entrada</label>
          <select
            value={selectedPresentation}
            onChange={(e) => setSelectedPresentation(e.target.value as MeatCarcassPresentation)}
            disabled={!canEdit}
            className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 font-medium focus:ring-2 focus:ring-rose-500/30"
          >
            <option value="CANAL_COMPLETA">Canal Completa (Entera)</option>
            <option value="MEDIA_CANAL">Media Canal</option>
            <option value="CUARTO_DELANTERO">Cuarto Delantero</option>
            <option value="CUARTO_TRASERO">Cuarto Trasero</option>
            <option value="CERDO_CANAL">Cerdo Beneficiado en Canal</option>
            <option value="POLLO_BENEFICIADO_BULTO">Bulto / Cesta de Pollo</option>
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">
            Peso de la Canal / Lote (Kg)
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={carcassWeight}
              onChange={(e) => setCarcassWeight(Math.max(0.1, parseFloat(e.target.value) || 0))}
              disabled={!canEdit}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold font-mono focus:ring-2 focus:ring-rose-500/30"
            />
            <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-xs">Kg</span>
          </div>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">
            Costo Unitario Canal ($ USD / Kg)
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              value={carcassCostKg}
              onChange={(e) => setCarcassCostKg(Math.max(0.01, parseFloat(e.target.value) || 0))}
              disabled={!canEdit}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-bold font-mono focus:ring-2 focus:ring-rose-500/30"
            />
            <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-xs">USD</span>
          </div>
        </div>
      </div>

      {/* Financial & Yield Performance Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-sm border border-slate-800">
          <p className="text-slate-400 text-[11px] font-medium">Inversión Total en Canal</p>
          <p className="text-lg md:text-xl font-bold font-mono text-white mt-1">
            ${computedBatch.totalCarcassCostUsd.toFixed(2)}{' '}
            <span className="text-[10px] text-slate-400">USD</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Bs. {(computedBatch.totalCarcassCostUsd * bcvState.activeRate).toFixed(2)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-[11px] font-medium">Rendimiento Cortes Vendibles</p>
          <p className="text-lg md:text-xl font-bold font-mono text-emerald-600 mt-1">
            {computedBatch.cutsYieldPercent.toFixed(2)}%
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {computedBatch.totalCutsWeightKg.toFixed(2)} Kg en cortes
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-[11px] font-medium">Merma Total de Desposte</p>
          <p className="text-lg md:text-xl font-bold font-mono text-amber-600 mt-1">
            {computedBatch.wastePercent.toFixed(2)}%
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {computedBatch.totalWasteWeightKg.toFixed(2)} Kg de pérdida
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-slate-500 text-[11px] font-medium">Margen Proyectado Lote</p>
          <p className="text-lg md:text-xl font-bold font-mono text-sky-600 mt-1">
            {computedBatch.projectedMarginPercent.toFixed(2)}%
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            Utilidad: +${computedBatch.projectedGrossProfitUsd.toFixed(2)} USD
          </p>
        </div>
      </div>

      {/* Main Table: Cuts Breakdown & Relative Value Costing */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-xs">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Desglose de Cortes Obtenidos & PVP Sugerido
            </h3>
            <p className="text-[11px] text-slate-500">
              Ajusta los Kg pesados para recalcular el rendimiento y el costo asignado por valor comercial.
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
                <th className="py-2.5 px-3">Corte / Subproducto</th>
                <th className="py-2.5 px-3">Categoría</th>
                <th className="py-2.5 px-3 text-right">Peso (Kg)</th>
                <th className="py-2.5 px-3 text-right">Rend. %</th>
                <th className="py-2.5 px-3 text-right">Costo Asignado ($/Kg)</th>
                <th className="py-2.5 px-3 text-right">Margen %</th>
                <th className="py-2.5 px-3 text-right">PVP ($/Kg)</th>
                <th className="py-2.5 px-3 text-right">PVP (Bs./Kg)</th>
                <th className="py-2.5 px-3 text-right">Ingreso Proy. ($)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {computedBatch.cuts.map((cut) => (
                <tr key={cut.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-2.5 px-3 font-sans font-bold text-slate-800">
                    {cut.cutName}
                  </td>
                  <td className="py-2.5 px-3 font-sans text-[10px]">
                    <span
                      className={`px-2 py-0.5 rounded-full font-semibold ${
                        cut.tier === 'PRIMERA_ALTO_VALOR'
                          ? 'bg-rose-100 text-rose-800'
                          : cut.tier === 'SEGUNDA_CORTE_GUISO'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {cut.tier.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={cutWeights[cut.cutName] ?? cut.weightKg}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        setCutWeights((prev) => ({ ...prev, [cut.cutName]: val }));
                      }}
                      disabled={!canEdit}
                      className="w-20 px-2 py-1 text-right rounded border border-slate-300 font-bold bg-white"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-700">
                    {cut.yieldPercent.toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                    ${cut.allocatedCostPerKgUsd.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-600">
                    {cut.targetMarginPercent}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                    ${cut.retailPriceUsdPerKg.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-600">
                    Bs. {cut.retailPriceVesPerKg.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                    ${cut.projectedRevenueUsd.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mermas & Future Purchase Projection Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Wastes Classification Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-xs">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="font-bold text-slate-900">
              Desglose y Clasificación de Mermas No Aprovechables
            </h3>
          </div>

          <div className="space-y-3 font-mono">
            {computedBatch.wastes.map((waste) => (
              <div
                key={waste.id}
                className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200"
              >
                <div>
                  <p className="font-sans font-bold text-slate-800 text-xs">
                    {waste.label}
                  </p>
                  <p className="text-[10px] text-slate-500 font-sans">
                    {waste.wastePercent.toFixed(2)}% sobre peso en canal
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{waste.weightKg.toFixed(2)} Kg</p>
                  <p className="text-[10px] text-rose-600">-${waste.lossCostUsd.toFixed(2)} USD</p>
                </div>
              </div>
            ))}

            {computedBatch.unaccountedWeightKg !== 0 && (
              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between text-amber-900 font-sans">
                <span>Diferencia de pesaje no asignada:</span>
                <strong className="font-mono">
                  {computedBatch.unaccountedWeightKg > 0 ? '+' : ''}
                  {computedBatch.unaccountedWeightKg.toFixed(2)} Kg
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* Future Purchases Projection Calculator */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white rounded-2xl p-5 shadow-sm border border-slate-800 text-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
              <ShoppingBag className="w-4 h-4 text-rose-400" />
              <h3 className="font-bold text-white">
                Proyector Inteligente de Compras en Canal
              </h3>
            </div>

            <p className="text-slate-300 text-[11px] mb-4">
              Calcula cuántos Kg de canal completa necesitas comprar para cubrir la demanda proyectada de un corte específico sin generar sobrestock de mermas.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Corte Demandado
                </label>
                <select
                  value={projectionCutName}
                  onChange={(e) => setProjectionCutName(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs"
                >
                  {initialTemplate.map((t) => (
                    <option key={t.cutName} value={t.cutName}>
                      {t.cutName} ({t.expectedYieldPercent}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Kilos Requeridos
                </label>
                <input
                  type="number"
                  min="1"
                  value={targetDemandKg}
                  onChange={(e) => setTargetDemandKg(Math.max(1, parseFloat(e.target.value) || 0))}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-white font-mono font-bold"
                />
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-slate-800/80 rounded-xl border border-slate-700/80">
            <p className="text-[11px] text-slate-400">Canal en Pie / Beneficiada Sugerida:</p>
            <p className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
              {purchaseProjection.carcassNeededKg.toFixed(2)} Kg en Canal
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Rendimiento estándar estimado del corte: <strong>{purchaseProjection.cutYieldPercent}%</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeatYieldView;
