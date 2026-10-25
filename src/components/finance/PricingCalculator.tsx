import React, { useState, useEffect } from 'react';
import {
  Calculator,
  Clock,
  RefreshCw,
  CheckCircle2,
  Globe,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import {
  calculatePriceFromMargin,
  calculateGrossMarginPercent,
  convertUsdToVes,
  formatUsd,
  formatVes,
} from '../../lib/decimal';

export const PricingCalculator: React.FC = () => {
  const { products, updateProductPricing } = useInventory();
  const {
    bcvState,
    isSyncingBcv,
    bcvSyncError,
    refreshLiveBcvRate,
    updateRates,
    simulatedHourVet,
    setSimulatedHourVet,
  } = useFinance();

  const [spotInput, setSpotInput] = useState(bcvState.spotRateToday.toFixed(2));
  const [nextInput, setNextInput] = useState(bcvState.nextDayRateAfter5Pm.toFixed(2));
  const [selectedProdId, setSelectedProdId] = useState(products[0]?.id || '');
  const [customCost, setCustomCost] = useState(String(products[0]?.costUsd || 1.0));
  const [customMargin, setCustomMargin] = useState(
    String(products[0]?.targetMarginPercent || 28.0)
  );
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  useEffect(() => {
    setSpotInput(bcvState.spotRateToday.toFixed(2));
    setNextInput(bcvState.nextDayRateAfter5Pm.toFixed(2));
  }, [bcvState.spotRateToday, bcvState.nextDayRateAfter5Pm]);

  const handleLiveSyncClick = async () => {
    const res = await refreshLiveBcvRate(true);
    if (res.success) {
      setSavedBanner(
        `Conexión establecida con éxito (${res.providerSource} en ${res.latencyMs}ms). Tasa oficial BCV actualizada: Bs. ${res.activeRate.toFixed(2)} / USD.`
      );
      setTimeout(() => setSavedBanner(null), 5000);
    }
  };

  const handleRateUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const s = parseFloat(spotInput) || bcvState.spotRateToday;
    const n = parseFloat(nextInput) || bcvState.nextDayRateAfter5Pm;
    updateRates(s, n);
    setSavedBanner('Tasas BCV Spot y Post-5PM actualizadas en todo el ecosistema.');
    setTimeout(() => setSavedBanner(null), 3500);
  };

  const handleSelectProduct = (id: string) => {
    setSelectedProdId(id);
    const p = products.find((item) => item.id === id);
    if (p) {
      setCustomCost(String(p.costUsd));
      setCustomMargin(String(p.targetMarginPercent));
    }
  };

  const costNum = Math.max(0.01, parseFloat(customCost) || 0.01);
  const marginNum = Math.min(95, Math.max(1, parseFloat(customMargin) || 25));
  const computedPriceUsd = calculatePriceFromMargin(costNum, marginNum);
  const computedPriceVesSpot = convertUsdToVes(computedPriceUsd, bcvState.spotRateToday);
  const computedPriceVesAfter5Pm = convertUsdToVes(
    computedPriceUsd,
    bcvState.nextDayRateAfter5Pm
  );
  const computedPriceVesActive = convertUsdToVes(computedPriceUsd, bcvState.activeRate);

  const handleCommitProductPrice = () => {
    if (!selectedProdId) return;
    updateProductPricing(selectedProdId, costNum, marginNum);
    setSavedBanner('Nuevo costo y PVP indexado guardado en el Catálogo Maestro.');
    setTimeout(() => setSavedBanner(null), 3500);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-sky-600" />
            <h1 className="text-base font-bold text-slate-900">
              Conector API BCV en Tiempo Real & Ingeniería de Precios Multi-Moneda
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Sincronización directa con la plataforma oficial del Banco Central de Venezuela (
            <span className="font-mono text-slate-700">www.bcv.org.ve</span>) · Redondeo
            ROUND_HALF_UP.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isSyncingBcv}
            onClick={handleLiveSyncClick}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBcv ? 'animate-spin' : ''}`} />
            <span>
              {isSyncingBcv
                ? 'Sincronizando con www.bcv.org.ve...'
                : 'Actualizar Tasa Oficial BCV Ahora'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSimulatedHourVet(14)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition ${
              simulatedHourVet === 14
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            14:00 VET (Diurna)
          </button>
          <button
            type="button"
            onClick={() => setSimulatedHourVet(17)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition ${
              simulatedHourVet === 17
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            17:00 VET (5:00 PM BCV)
          </button>
          <button
            type="button"
            onClick={() => setSimulatedHourVet(null)}
            className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-600 border border-slate-300 hover:bg-slate-100"
          >
            Hora Real Caracas
          </button>
        </div>
      </div>

      {savedBanner && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedBanner}</span>
        </div>
      )}

      {bcvSyncError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{bcvSyncError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* BCV Rate Configuration & Live Telemetry Panel */}
        <form
          onSubmit={handleRateUpdate}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3 text-xs"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-emerald-600" />
              <span>Conector BCV en Vivo (VET UTC-4)</span>
            </h2>
            <Clock className="w-4 h-4 text-sky-600" />
          </div>

          <div
            className={`p-3 rounded-lg border ${
              bcvState.isAfter5PmVet
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-emerald-50 border-emerald-300 text-emerald-950'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase font-bold">
                {bcvState.rateSourceLabel}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-700">
                <ShieldCheck className="w-3.5 h-3.5" />
                EN LÍNEA
              </span>
            </div>
            <div className="text-xl font-mono font-bold mt-0.5">
              Bs. {bcvState.activeRate.toFixed(2)} / USD
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-black/10 space-y-0.5 text-[11px] font-mono">
              <div>
                Fuente: <strong>{bcvState.providerSource || 'www.bcv.org.ve'}</strong>
              </div>
              {bcvState.valueDateLabel && (
                <div>
                  Fecha Valor BCV: <strong>{bcvState.valueDateLabel}</strong>
                </div>
              )}
              {bcvState.eurRate && (
                <div>
                  Referencia Euro BCV: <strong>Bs. {bcvState.eurRate.toFixed(2)} / EUR</strong>
                </div>
              )}
              <div>
                Última Sincronización: <strong>{bcvState.lastSyncVet} VET</strong>
                {bcvState.latencyMs ? ` (${bcvState.latencyMs} ms)` : ''}
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Tasa BCV Vigente Diurna (&lt; 17:00 VET)
            </label>
            <input
              type="number"
              step="0.01"
              value={spotInput}
              onChange={(e) => setSpotInput(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Tasa BCV Publicada Portal www.bcv.org.ve (≥ 17:00 VET)
            </label>
            <input
              type="number"
              step="0.01"
              value={nextInput}
              onChange={(e) => setNextInput(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-amber-800 bg-amber-50/40"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isSyncingBcv}
              onClick={handleLiveSyncClick}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBcv ? 'animate-spin' : ''}`} />
              <span>Recargar desde BCV</span>
            </button>
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <span>Fijar Manualmente</span>
            </button>
          </div>
        </form>

        {/* Interactive Margin Simulator */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4 text-xs">
          <h2 className="font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
            Simulador de Estructura de Costos, Margen Bruto Real y Conversión Dual BCV
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <label className="block font-semibold text-slate-700 mb-1">
                Seleccionar SKU del Catálogo
              </label>
              <select
                value={selectedProdId}
                onChange={(e) => handleSelectProduct(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Costo de Reposición (USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={customCost}
                onChange={(e) => setCustomCost(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Margen Bruto Objetivo (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={customMargin}
                onChange={(e) => setCustomMargin(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono font-bold text-emerald-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-slate-900 text-white">
              <div className="text-[10px] font-mono uppercase text-slate-400">
                PVP Calculado (USD)
              </div>
              <div className="text-xl font-mono font-bold text-emerald-400 mt-1">
                {formatUsd(computedPriceUsd)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                Margen Verificado: {calculateGrossMarginPercent(costNum, computedPriceUsd)}%
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-mono uppercase text-slate-500">
                PVP Diurno (&lt;17:00) vs Portal BCV
              </div>
              <div className="text-xs font-mono font-semibold text-slate-700 mt-1">
                Spot: {formatVes(computedPriceVesSpot)}
              </div>
              <div className="text-xs font-mono font-bold text-amber-700 mt-0.5">
                Portal BCV: {formatVes(computedPriceVesAfter5Pm)}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
              <div className="text-[10px] font-mono uppercase text-sky-800 font-bold">
                PVP Activo en Caja POS (VES)
              </div>
              <div className="text-xl font-mono font-bold text-sky-900 mt-1">
                {formatVes(computedPriceVesActive)}
              </div>
              <div className="text-[10px] font-mono text-sky-700 mt-0.5">
                Tasa BCV aplicada: Bs. {bcvState.activeRate.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleCommitProductPrice}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold transition"
            >
              Guardar Nuevo Precio en el Catálogo Maestro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingCalculator;
