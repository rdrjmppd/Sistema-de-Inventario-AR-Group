import React, { useState } from 'react';
import {
  CheckCircle2,
  ChefHat,
  Factory,
  Layers,
  Play,
  Plus,
  AlertTriangle,
} from 'lucide-react';
import { ProductionRecipeBom, StorageZone } from '../../types';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import { useOperationsBrm } from '../../context/OperationsBrmContext';
import { calculatePriceFromMargin, convertUsdToVes, round2, toDecimal } from '../../lib/decimal';

export const ProductionRecipesView: React.FC = () => {
  const { products, locations, selectedLocationId } = useInventory();
  const { bcvState } = useFinance();
  const {
    productionRecipes,
    productionOrders,
    saveProductionRecipe,
    executeProductionRecipeOrder,
  } = useOperationsBrm();

  const [selectedRecipeId, setSelectedRecipeId] = useState(
    productionRecipes[0]?.id || ''
  );
  const [batchesMultiplier, setBatchesMultiplier] = useState('5');
  const [actualOutputQty, setActualOutputQty] = useState('');
  const [locationId, setLocationId] = useState(
    selectedLocationId || locations[0]?.id || ''
  );
  const [targetZone, setTargetZone] = useState<StorageZone>('ANAQUEL');
  const [managerCred, setManagerCred] = useState('');
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Creador rápido de nueva receta BOM
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [newCode, setNewCode] = useState('BOM-CHOR-ESP');
  const [newName, setNewName] = useState('Chorizo Artesanal de la Casa (Kg)');
  const [newDept, setNewDept] =
    useState<ProductionRecipeBom['department']>('CARNICERIA');
  const [newOutSku, setNewOutSku] = useState('ELAB-CHORIZO-KG');
  const [newRawProductId, setNewRawProductId] = useState(products[0]?.id || '');
  const [newRawQty, setNewRawQty] = useState('1.10');
  const [newRawZone, setNewRawZone] = useState<StorageZone>('DEPOSITO');
  const [newPackCost, setNewPackCost] = useState('0.80');
  const [newMargin, setNewMargin] = useState('38');

  const activeRecipe =
    productionRecipes.find((r) => r.id === selectedRecipeId) ||
    productionRecipes[0];

  const handleRunProduction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRecipe) return;
    const res = executeProductionRecipeOrder({
      recipeId: activeRecipe.id,
      batchesMultiplier: Number(batchesMultiplier) || 1,
      actualOutputQty: actualOutputQty ? Number(actualOutputQty) : undefined,
      locationId: locationId || locations[0]?.id || '',
      targetOutputZone: targetZone,
      managerCredentialForExpired: managerCred || undefined,
    });
    if (!res.success) {
      setBanner({ type: 'err', text: res.error || 'Error ejecutando orden.' });
      return;
    }
    setActualOutputQty('');
    setManagerCred('');
    setBanner({
      type: 'ok',
      text: `Orden ${res.order?.orderCode} completada: +${res.order?.actualOutputQty} cargados en ${targetZone === 'ANAQUEL' ? 'Exhibición' : 'Cava'} | Costo Unitario: $${res.order?.unitElaboratedCostUsd.toFixed(2)} | PVP: $${res.order?.suggestedPvpUsd.toFixed(2)}.`,
    });
  };

  const handleCreateRecipe = (e: React.FormEvent) => {
    e.preventDefault();
    const rawProd = products.find((p) => p.id === newRawProductId) || products[0];
    if (!rawProd) return;

    const created = saveProductionRecipe({
      code: newCode.trim().toUpperCase(),
      name: newName.trim(),
      department: newDept,
      outputSku: newOutSku.trim().toUpperCase(),
      outputProductName: newName.trim(),
      outputUnit: rawProd.unit,
      expectedOutputQty: 1,
      packagingAndCondimentsCostUsd: Number(newPackCost) || 0,
      targetMarginPercent: Number(newMargin) || 35,
      ingredients: [
        {
          productId: rawProd.id,
          sku: rawProd.sku,
          productName: rawProd.name,
          unit: rawProd.unit,
          quantityRequiredPerBatch: Number(newRawQty) || 1,
          preferredSourceZone: newRawZone,
        },
      ],
      active: true,
    });
    setSelectedRecipeId(created.id);
    setShowNewRecipe(false);
    setBanner({
      type: 'ok',
      text: `Receta ${created.code} guardada y lista para producción interna.`,
    });
  };

  // Estimación previa en vivo Decimal.js
  let previewUnitCostUsd = 0;
  let previewPvpUsd = 0;
  if (activeRecipe) {
    const rawSum = activeRecipe.ingredients.reduce((acc, ing) => {
      const p = products.find((x) => x.id === ing.productId);
      return acc.plus(toDecimal(p?.costUsd || 0).times(ing.quantityRequiredPerBatch));
    }, toDecimal(0));
    const batchCost = rawSum.plus(activeRecipe.packagingAndCondimentsCostUsd);
    previewUnitCostUsd =
      activeRecipe.expectedOutputQty > 0
        ? round2(batchCost.dividedBy(activeRecipe.expectedOutputQty))
        : 0;
    previewPvpUsd = calculatePriceFromMargin(
      previewUnitCostUsd,
      activeRecipe.targetMarginPercent
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-amber-400" />
            Recetario de Transformación Interna (BOM) & Subproductos
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Convierte recortes y perecederos de Cava o Exhibición (prioridad FEFO) en productos elaborados de alto margen con costeo exacto Decimal.js.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowNewRecipe((v) => !v)}
          className="min-h-[44px] px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {showNewRecipe ? 'Ocultar Editor BOM' : 'Nueva Receta BOM'}
        </button>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            banner.type === 'ok'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
          }`}
        >
          <span className="flex items-center gap-2">
            {banner.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            {banner.text}
          </span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-slate-400 hover:text-white px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {showNewRecipe && (
        <form
          onSubmit={handleCreateRecipe}
          className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs"
        >
          <div>
            <label className="block text-slate-400 mb-1">Código Receta</label>
            <input
              type="text"
              required
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Nombre Producto Elaborado</label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">SKU Terminado Destino</label>
            <input
              type="text"
              required
              value={newOutSku}
              onChange={(e) => setNewOutSku(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Departamento</label>
            <select
              value={newDept}
              onChange={(e) =>
                setNewDept(e.target.value as ProductionRecipeBom['department'])
              }
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
            >
              <option value="CARNICERIA">Carnicería</option>
              <option value="CHARCUTERIA">Charcutería</option>
              <option value="FRUVER">Fruver Procesados</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Insumo Base Principal</label>
            <select
              value={newRawProductId}
              onChange={(e) => setNewRawProductId(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Cant. Insumo por Unidad</label>
            <input
              type="number"
              step="0.01"
              value={newRawQty}
              onChange={(e) => setNewRawQty(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono tabular-nums"
            />
          </div>
          <div>
            <label className="block text-slate-400 mb-1">Zona Origen Preferida</label>
            <select
              value={newRawZone}
              onChange={(e) => setNewRawZone(e.target.value as StorageZone)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
            >
              <option value="DEPOSITO">Cava / Depósito</option>
              <option value="ANAQUEL">Exhibición / Anaquel</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 mb-1">Empaque ($)</label>
              <input
                type="number"
                step="0.01"
                value={newPackCost}
                onChange={(e) => setNewPackCost(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Margen %</label>
              <input
                type="number"
                step="1"
                value={newMargin}
                onChange={(e) => setNewMargin(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
              />
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
            <button
              type="submit"
              className="min-h-[44px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
            >
              Guardar Ficha Técnica BOM
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Panel Ejecutor de Orden de Producción */}
        <form
          onSubmit={handleRunProduction}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs"
        >
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Factory className="w-4 h-4 text-emerald-400" />
            Ejecutar Orden de Producción Interna
          </h3>

          <div>
            <label className="block text-slate-400 mb-1">Receta Seleccionada</label>
            <select
              value={activeRecipe?.id || ''}
              onChange={(e) => setSelectedRecipeId(e.target.value)}
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
            >
              {productionRecipes.map((r) => (
                <option key={r.id} value={r.id}>
                  [{r.department}] {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 mb-1">Sede Productora</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Zona Destino Elaborado</label>
              <select
                value={targetZone}
                onChange={(e) => setTargetZone(e.target.value as StorageZone)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
              >
                <option value="ANAQUEL">Directo a Exhibición</option>
                <option value="DEPOSITO">Guardar en Cava / Depósito</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 mb-1">Tandas / Multiplicador</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={batchesMultiplier}
                onChange={(e) => setBatchesMultiplier(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono tabular-nums"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Rendimiento Real (Opcional)</label>
              <input
                type="number"
                step="0.01"
                value={actualOutputQty}
                onChange={(e) => setActualOutputQty(e.target.value)}
                placeholder="Auto según BOM"
                className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono tabular-nums"
              />
            </div>
          </div>

          {activeRecipe && (
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Costo Unitario Estimado:</span>
                <span className="font-mono font-bold text-amber-300 tabular-nums">
                  ${previewUnitCostUsd.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">PVP Sugerido ({activeRecipe.targetMarginPercent}%):</span>
                <span className="font-mono font-bold text-emerald-400 tabular-nums">
                  ${previewPvpUsd.toFixed(2)} / Bs.{' '}
                  {convertUsdToVes(previewPvpUsd, bcvState.activeRate).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-slate-400 mb-1">
              Token TOTP / PIN (Solo si requiere consumir lote vencido)
            </label>
            <input
              type="password"
              value={managerCred}
              onChange={(e) => setManagerCred(e.target.value)}
              placeholder="Dejar en blanco en lotes vigentes"
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
            />
          </div>

          <button
            type="submit"
            className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4" />
            Procesar Transformación y Cargar Stock
          </button>
        </form>

        {/* Bitácora de Órdenes de Producción Ejecutadas */}
        <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              Historial de Órdenes de Producción Interna ({productionOrders.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <th className="p-3">Orden / Fecha</th>
                  <th className="p-3">Receta Elaborada</th>
                  <th className="p-3">Sede & Destino</th>
                  <th className="p-3 text-right">Producido</th>
                  <th className="p-3 text-right">Costo Unit.</th>
                  <th className="p-3 text-right">PVP USD / Bs.</th>
                </tr>
              </thead>
              <tbody>
                {productionOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      Aún no se han ejecutado órdenes de transformación en esta sesión. Seleccione una receta a la izquierda para producir.
                    </td>
                  </tr>
                ) : (
                  productionOrders.map((ord) => (
                    <tr key={ord.id} className="border-b border-slate-800/70">
                      <td className="p-3">
                        <div className="font-mono font-bold text-sky-300">{ord.orderCode}</div>
                        <div className="text-[10px] text-slate-400">{ord.executedAtVet}</div>
                      </td>
                      <td className="p-3">
                        <div className="text-white font-semibold">{ord.recipeName}</div>
                        {ord.fefoLotsConsumed.length > 0 && (
                          <div className="text-[10px] text-amber-300">
                            FEFO consumido: {ord.fefoLotsConsumed.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="text-slate-200">{ord.locationName}</div>
                        <span className="text-[10px] text-emerald-400 font-bold">
                          {ord.targetOutputZone}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-white tabular-nums">
                        {ord.actualOutputQty}
                      </td>
                      <td className="p-3 text-right font-mono text-amber-300 tabular-nums">
                        ${ord.unitElaboratedCostUsd.toFixed(2)}
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-400 font-bold tabular-nums">
                        ${ord.suggestedPvpUsd.toFixed(2)}
                        <div className="text-[10px] text-slate-400">
                          Bs. {ord.suggestedPvpVes.toFixed(2)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductionRecipesView;
