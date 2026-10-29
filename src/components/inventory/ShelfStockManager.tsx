import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  History,
  Lock,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Store,
  X,
} from 'lucide-react';
import { Product, StorageZone } from '../../types';
import { useInventory } from '../../context/InventoryContext';
import {
  buildShelfReplenishmentPickList,
  evaluatePhysicalCountTolerance,
  getLocationStockBreakdown,
} from '../../lib/shelf-stock';
import { round2, toDecimal } from '../../lib/decimal';

type SubViewTab = 'MATRIX' | 'CAVA_TRANSFER' | 'PICK_LIST' | 'HISTORY';

export const ShelfStockManager: React.FC = () => {
  const {
    locations,
    products,
    selectedLocationId,
    setIsAddLocationModalOpen,
    shelfMovements,
    posShelfShortfallBanner,
    dismissPosShelfShortfallBanner,
    replenishShelf,
    returnFromShelf,
    executeZoneStockTransfer,
    updateMinShelfThreshold,
    reconcileShelfAndDepositCount,
  } = useInventory();

  const [activeLocationId, setActiveLocationId] = useState<string>(() => {
    if (selectedLocationId && selectedLocationId !== 'ALL') return selectedLocationId;
    return locations[0]?.id || 'loc-pzo-01';
  });
  const [subTab, setSubTab] = useState<SubViewTab>('MATRIX');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'COLD_CHAIN' | 'LOW_SHELF'>('ALL');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modal: Reposición o Retorno rápido en misma sede
  const [moveModal, setMoveModal] = useState<{
    product: Product;
    direction: 'TO_SHELF' | 'TO_DEPOSIT';
  } | null>(null);
  const [moveQty, setMoveQty] = useState<string>('10');
  const [moveNotes, setMoveNotes] = useState<string>('');

  // Modal: Sinceración Física (Conteo Depósito + Conteo Anaquel)
  const [syncModalProduct, setSyncModalProduct] = useState<Product | null>(null);
  const [countedDepositStr, setCountedDepositStr] = useState<string>('0');
  const [countedShelfStr, setCountedShelfStr] = useState<string>('0');
  const [syncNotes, setSyncNotes] = useState<string>('Conteo físico cíclico de depósito y piso de venta');
  const [syncManagerPin, setSyncManagerPin] = useState<string>('');

  // Formulario: Traslado Nevera/Cava (Sede A) -> Exhibición/Anaquel (Sede B)
  const [cavaFromLocId, setCavaFromLocId] = useState<string>(() => {
    const depot = locations.find(
      (l) => l.type === 'FRIGORIFICO' || l.type === 'DEPOSITO' || l.type === 'CEDIS'
    );
    return depot?.id || locations[locations.length - 1]?.id || 'loc-val-01';
  });
  const [cavaFromZone, setCavaFromZone] = useState<StorageZone>('DEPOSITO');
  const [cavaToLocId, setCavaToLocId] = useState<string>(() => locations[0]?.id || 'loc-pzo-01');
  const [cavaToZone, setCavaToZone] = useState<StorageZone>('ANAQUEL');
  const [cavaProductId, setCavaProductId] = useState<string>(() => products[0]?.id || '');
  const [cavaQtyStr, setCavaQtyStr] = useState<string>('15');
  const [cavaNotes, setCavaNotes] = useState<string>(
    'Despacho desde Nevera/Cava frigorífica hacia Exhibición de Carnicería / Piso de Venta'
  );

  const activeLocation = useMemo(
    () => locations.find((l) => l.id === activeLocationId) || locations[0],
    [locations, activeLocationId]
  );

  // KPIs de la sede seleccionada
  const kpis = useMemo(() => {
    let totalDeposit = toDecimal(0);
    let totalShelf = toDecimal(0);
    let lowShelfCount = 0;

    for (const p of products) {
      const b = getLocationStockBreakdown(p, activeLocation?.id || '');
      totalDeposit = totalDeposit.plus(b.deposit);
      totalShelf = totalShelf.plus(b.shelf);
      if (b.isShelfLow) lowShelfCount += 1;
    }

    return {
      totalDeposit: round2(totalDeposit),
      totalShelf: round2(totalShelf),
      totalCombined: round2(totalDeposit.plus(totalShelf)),
      lowShelfCount,
    };
  }, [products, activeLocation]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        const hit =
          p.sku.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (categoryFilter === 'COLD_CHAIN') {
        const cat = p.category.toLowerCase();
        return (
          cat.includes('carn') ||
          cat.includes('láct') ||
          cat.includes('lact') ||
          cat.includes('fru') ||
          cat.includes('refrig') ||
          cat.includes('charc')
        );
      }
      if (categoryFilter === 'LOW_SHELF') {
        return getLocationStockBreakdown(p, activeLocation?.id || '').isShelfLow;
      }
      return true;
    });
  }, [products, searchQuery, categoryFilter, activeLocation]);

  const pickList = useMemo(
    () => buildShelfReplenishmentPickList(products, activeLocation?.id || ''),
    [products, activeLocation]
  );

  const openMoveModal = (product: Product, direction: 'TO_SHELF' | 'TO_DEPOSIT') => {
    const b = getLocationStockBreakdown(product, activeLocation.id);
    const defaultMove =
      direction === 'TO_SHELF'
        ? Math.max(1, Math.min(b.deposit, Math.max(5, b.minShelf - b.shelf)))
        : Math.max(1, Math.min(b.shelf, 5));
    setMoveModal({ product, direction });
    setMoveQty(String(round2(defaultMove)));
    setMoveNotes('');
  };

  const handleConfirmMove = (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveModal || !activeLocation) return;
    const qty = Number(moveQty);
    const res =
      moveModal.direction === 'TO_SHELF'
        ? replenishShelf(moveModal.product.id, activeLocation.id, qty, moveNotes)
        : returnFromShelf(moveModal.product.id, activeLocation.id, qty, moveNotes);

    if (!res.success) {
      setFeedback({ type: 'err', text: res.error || 'No se pudo completar el movimiento.' });
      return;
    }

    setFeedback({
      type: 'ok',
      text:
        moveModal.direction === 'TO_SHELF'
          ? `Reposición ejecutada: +${qty} ${moveModal.product.unit} de ${moveModal.product.sku} pasados a Exhibición/Anaquel.`
          : `Retorno ejecutado: ${qty} ${moveModal.product.unit} de ${moveModal.product.sku} resguardados en Depósito/Cava.`,
    });
    setMoveModal(null);
  };

  const openSyncModal = (product: Product) => {
    const b = getLocationStockBreakdown(product, activeLocation.id);
    setSyncModalProduct(product);
    setCountedDepositStr(String(b.deposit));
    setCountedShelfStr(String(b.shelf));
    setSyncNotes('Sinceración física de existencias Depósito y Anaquel');
    setSyncManagerPin('');
  };

  const liveSyncTolerance = useMemo(() => {
    if (!syncModalProduct || !activeLocation) return null;
    const b = getLocationStockBreakdown(syncModalProduct, activeLocation.id);
    return evaluatePhysicalCountTolerance({
      systemDeposit: b.deposit,
      systemShelf: b.shelf,
      countedDeposit: Number(countedDepositStr) || 0,
      countedShelf: Number(countedShelfStr) || 0,
    });
  }, [syncModalProduct, activeLocation, countedDepositStr, countedShelfStr]);

  const handleConfirmSync = (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncModalProduct || !activeLocation) return;

    const res = reconcileShelfAndDepositCount({
      productId: syncModalProduct.id,
      locationId: activeLocation.id,
      countedDepositQty: Number(countedDepositStr),
      countedShelfQty: Number(countedShelfStr),
      notes: syncNotes,
      managerPin: syncManagerPin,
    });

    if (!res.success) {
      setFeedback({ type: 'err', text: res.error || 'Error en sinceración física.' });
      return;
    }

    setFeedback({
      type: 'ok',
      text: `Sinceración física aplicada para ${syncModalProduct.sku} en ${activeLocation.code}. Nuevo Total: ${res.result?.countedTotalAfter} ${syncModalProduct.unit}.`,
    });
    setSyncModalProduct(null);
  };

  const handleExecuteCavaTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const res = executeZoneStockTransfer({
      productId: cavaProductId,
      fromLocationId: cavaFromLocId,
      fromZone: cavaFromZone,
      toLocationId: cavaToLocId,
      toZone: cavaToZone,
      quantity: Number(cavaQtyStr),
      notes: cavaNotes,
    });

    if (!res.success) {
      setFeedback({ type: 'err', text: res.error || 'Error al ejecutar traslado por zona.' });
      return;
    }

    setFeedback({
      type: 'ok',
      text: `Traslado ${res.movement?.referenceCode} completado: ${res.movement?.quantity} ${res.movement?.unit} de ${res.movement?.sku} enviados desde ${res.movement?.fromLocationName} (${cavaFromZone}) hacia ${res.movement?.toLocationName} (${cavaToZone}).`,
    });
  };

  const handleBulkPickListReplenish = () => {
    if (!activeLocation || pickList.length === 0) return;
    let movedCount = 0;
    for (const item of pickList) {
      const r = replenishShelf(
        item.productId,
        activeLocation.id,
        item.suggestedMoveQty,
        'Reposición masiva automática según Pick List'
      );
      if (r.success) movedCount += 1;
    }
    setFeedback({
      type: 'ok',
      text: `Pick List ejecutado con éxito: ${movedCount} SKUs abastecidos desde Depósito hacia Exhibición/Anaquel en ${activeLocation.code}.`,
    });
  };

  const selectedCavaProduct = products.find((p) => p.id === cavaProductId) || products[0];
  const cavaOriginBreakdown = selectedCavaProduct
    ? getLocationStockBreakdown(selectedCavaProduct, cavaFromLocId)
    : null;

  return (
    <div className="space-y-6">
      {/* Encabezado Ejecutivo */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-lg border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs font-semibold mb-2">
              <Store className="w-3.5 h-3.5" />
              Control Sincerado de Ubicación · Depósito / Cava ↔ Anaquel / Exhibición
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Inventario Sincerado: Depósito, Cava Frigorífica y Piso de Venta
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1">
              Separa con exactitud qué cantidad está resguardada en Depósito/Nevera-Cava y qué cantidad está exhibida en Anaquel, sin alterar los saldos maestros por sede.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={activeLocation?.id || ''}
              onChange={(e) => setActiveLocationId(e.target.value)}
              className="min-h-[44px] bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name} ({loc.type})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsAddLocationModalOpen(true)}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs sm:text-sm font-semibold transition"
            >
              <Plus className="w-4 h-4" />
              Nueva Sede / Cava
            </button>
          </div>
        </div>
      </div>

      {/* Alerta POS en Vivo si una venta agotó anaquel */}
      {posShelfShortfallBanner && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-amber-900 font-medium">
              {posShelfShortfallBanner}
            </div>
          </div>
          <button
            type="button"
            onClick={dismissPosShelfShortfallBanner}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-amber-700 hover:bg-amber-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-xl p-4 border flex items-center justify-between gap-3 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
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

      {/* Tarjetas KPI de Lectura Rápida (<5s) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase">
            <span>Resguardo Depósito / Cava</span>
            <Boxes className="w-4 h-4 text-slate-700" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5 tabular-nums">
            {kpis.totalDeposit.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Unidades/Kg en almacén trasero o cava frigorífica ({activeLocation?.code})
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-sky-700 uppercase">
            <span>Exhibición / Anaquel</span>
            <Store className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-sky-700 mt-1.5 tabular-nums">
            {kpis.totalShelf.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Disponibles en vitrina y góndolas para venta inmediata POS
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-700 uppercase">
            <span>SKUs Anaquel Bajo Mínimo</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-1.5 tabular-nums">
            {kpis.lowShelfCount}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {pickList.length} SKUs tienen respaldo en depósito listo para subir a piso
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 uppercase">
            <span>Total Físico Sede ({activeLocation?.code})</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1.5 tabular-nums">
            {kpis.totalCombined.toLocaleString('es-VE', { maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Invariante exacto: Depósito + Anaquel = Total Sede
          </p>
        </div>
      </div>

      {/* Pestañas de Operación */}
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
        <button
          type="button"
          onClick={() => setSubTab('MATRIX')}
          className={`min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition ${
            subTab === 'MATRIX'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          Matriz Depósito ↔ Anaquel
        </button>

        <button
          type="button"
          onClick={() => setSubTab('CAVA_TRANSFER')}
          className={`min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition ${
            subTab === 'CAVA_TRANSFER'
              ? 'bg-sky-700 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Snowflake className="w-4 h-4" />
          Traslado Nevera/Cava (Otra Sede) → Exhibición
        </button>

        <button
          type="button"
          onClick={() => setSubTab('PICK_LIST')}
          className={`min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition ${
            subTab === 'PICK_LIST'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          Pick List de Reposición ({pickList.length})
        </button>

        <button
          type="button"
          onClick={() => setSubTab('HISTORY')}
          className={`min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition ${
            subTab === 'HISTORY'
              ? 'bg-slate-900 text-white shadow'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          Bitácora Sincerada ({shelfMovements.length})
        </button>
      </div>

      {/* SUB-VISTA 1: MATRIZ DEPÓSITO ↔ ANAQUEL */}
      {subTab === 'MATRIX' && activeLocation && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar SKU, producto o categoría..."
                className="w-full min-h-[44px] pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
              {(
                [
                  { id: 'ALL', label: 'Todos los SKUs' },
                  { id: 'COLD_CHAIN', label: 'Carnicería / Frío / Fruver' },
                  { id: 'LOW_SHELF', label: 'Anaquel Bajo Mínimo' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setCategoryFilter(f.id)}
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    categoryFilter === f.id
                      ? 'bg-sky-50 border-sky-500 text-sky-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">SKU / Producto</th>
                  <th className="py-3 px-4 text-right">Depósito / Cava</th>
                  <th className="py-3 px-4 text-right">Anaquel / Exhibición</th>
                  <th className="py-3 px-4 text-right">Mín. Exhibición</th>
                  <th className="py-3 px-4 text-right">Total Sede</th>
                  <th className="py-3 px-4 text-center">Estado Piso</th>
                  <th className="py-3 px-4 text-right">Acciones de Ubicación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {filteredProducts.map((p) => {
                  const b = getLocationStockBreakdown(p, activeLocation.id);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {p.sku} · {p.category} ({p.unit})
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-800 tabular-nums">
                        {b.deposit.toLocaleString('es-VE', { maximumFractionDigits: 2 })} {p.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-sky-700 tabular-nums">
                        {b.shelf.toLocaleString('es-VE', { maximumFractionDigits: 2 })} {p.unit}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={b.minShelf}
                          onChange={(e) =>
                            updateMinShelfThreshold(
                              p.id,
                              activeLocation.id,
                              Number(e.target.value)
                            )
                          }
                          className="w-20 min-h-[40px] text-right px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold tabular-nums focus:ring-2 focus:ring-sky-500"
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                        {b.total.toLocaleString('es-VE', { maximumFractionDigits: 2 })} {p.unit}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {b.isShelfLow ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                            Reponer ({b.shelfCoveragePercent}%)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            Abastecido
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={b.deposit <= 0}
                            onClick={() => openMoveModal(p, 'TO_SHELF')}
                            className="min-h-[44px] px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold transition"
                          >
                            Subir a Anaquel
                          </button>
                          <button
                            type="button"
                            disabled={b.shelf <= 0}
                            onClick={() => openMoveModal(p, 'TO_DEPOSIT')}
                            className="min-h-[44px] px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-xs font-semibold transition"
                          >
                            A Cava/Dep.
                          </button>
                          <button
                            type="button"
                            onClick={() => openSyncModal(p)}
                            className="min-h-[44px] px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold inline-flex items-center gap-1 transition"
                          >
                            <ClipboardCheck className="w-3.5 h-3.5" />
                            Sincerar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-VISTA 2: TRASLADO NEVERA/CAVA (OTRA SEDE) -> EXHIBICIÓN */}
      {subTab === 'CAVA_TRANSFER' && (
        <form
          onSubmit={handleExecuteCavaTransfer}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5"
        >
          <div className="flex items-start gap-3 pb-4 border-b border-slate-100">
            <div className="p-2.5 rounded-xl bg-sky-100 text-sky-700">
              <Snowflake className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Despacho Cadena de Frío: Nevera / Cava (Sede A) → Exhibición / Vitrina (Sede B)
              </h2>
              <p className="text-xs sm:text-sm text-slate-500">
                Diseñado para Carnicería, Charcutería y Fruver cuando la mercancía refrigerada reposa en una Cava/Depósito de otra sede y pasa directo a la vitrina de exhibición de la tienda.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="text-xs font-bold uppercase text-slate-600">
                1. Origen (Nevera / Cava / Sede Remitente)
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sede / Cava Origen
                </label>
                <select
                  value={cavaFromLocId}
                  onChange={(e) => setCavaFromLocId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} — {l.name} ({l.type})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ubicación Interna de Salida
                </label>
                <select
                  value={cavaFromZone}
                  onChange={(e) => setCavaFromZone(e.target.value as StorageZone)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                >
                  <option value="DEPOSITO">❄️ Depósito / Nevera / Cava Frigorífica</option>
                  <option value="ANAQUEL">🏪 Anaquel / Exhibición</option>
                </select>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-sky-50/60 border border-sky-200 space-y-3">
              <div className="text-xs font-bold uppercase text-sky-800">
                2. Destino (Tienda / Vitrina de Exhibición)
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sede Destino
                </label>
                <select
                  value={cavaToLocId}
                  onChange={(e) => setCavaToLocId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} — {l.name} ({l.type})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ubicación Interna de Recepción
                </label>
                <select
                  value={cavaToZone}
                  onChange={(e) => setCavaToZone(e.target.value as StorageZone)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                >
                  <option value="ANAQUEL">🥩 Directo a Exhibición / Vitrina / Anaquel</option>
                  <option value="DEPOSITO">📦 Resguardo en Depósito / Cava de Tienda</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Producto / Corte Cárnico a Trasladar
              </label>
              <select
                value={cavaProductId}
                onChange={(e) => setCavaProductId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
              >
                {products.map((p) => {
                  const b = getLocationStockBreakdown(p, cavaFromLocId);
                  const avail = cavaFromZone === 'DEPOSITO' ? b.deposit : b.shelf;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name} ({p.category}) · Disp. zona origen: {avail} {p.unit}
                    </option>
                  );
                })}
              </select>
              {cavaOriginBreakdown && selectedCavaProduct && (
                <div className="mt-1.5 text-xs text-slate-600 tabular-nums">
                  Disponible en origen — Depósito/Cava:{' '}
                  <strong>{cavaOriginBreakdown.deposit} {selectedCavaProduct.unit}</strong> · Exhibición:{' '}
                  <strong>{cavaOriginBreakdown.shelf} {selectedCavaProduct.unit}</strong>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cantidad ({selectedCavaProduct?.unit || 'KG'})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={cavaQtyStr}
                onChange={(e) => setCavaQtyStr(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Guía Interna / Observación Cadena de Frío
            </label>
            <input
              type="text"
              value={cavaNotes}
              onChange={(e) => setCavaNotes(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-sm font-bold inline-flex items-center gap-2 shadow-sm transition"
            >
              Ejecutar Traslado Sincronizado
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* SUB-VISTA 3: PICK LIST SUGERIDO */}
      {subTab === 'PICK_LIST' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Lista Sugerida de Reposición a Piso ({activeLocation?.name})
              </h2>
              <p className="text-xs text-slate-500">
                SKUs cuyo anaquel está por debajo del frente mínimo pero cuentan con existencia inmediata en el depósito de la sede.
              </p>
            </div>
            <button
              type="button"
              disabled={pickList.length === 0}
              onClick={handleBulkPickListReplenish}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition"
            >
              <Sparkles className="w-4 h-4" />
              Abastecer Todo el Pick List ({pickList.length})
            </button>
          </div>

          {pickList.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Todos los anaqueles con respaldo en depósito están óptimamente abastecidos en esta sede.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600">
                    <th className="py-2.5 px-4">SKU / Producto</th>
                    <th className="py-2.5 px-4 text-right">Anaquel Actual</th>
                    <th className="py-2.5 px-4 text-right">Frente Mínimo</th>
                    <th className="py-2.5 px-4 text-right">Disp. Depósito</th>
                    <th className="py-2.5 px-4 text-right">Sugerido Subir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pickList.map((item) => (
                    <tr key={item.productId}>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {item.productName}{' '}
                        <span className="text-xs text-slate-500 font-mono">({item.sku})</span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-amber-700 font-bold tabular-nums">
                        {item.currentShelf} {item.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        {item.minShelf} {item.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums">
                        {item.availableDeposit} {item.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-emerald-700 tabular-nums">
                        +{item.suggestedMoveQty} {item.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-VISTA 4: HISTORIAL AUDITADO */}
      {subTab === 'HISTORY' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">
              Bitácora Inmutable de Movimientos Depósito / Cava ↔ Anaquel y Sinceraciones
            </h2>
          </div>
          {shelfMovements.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Aún no se han registrado movimientos internos o sinceraciones en esta sesión.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase text-slate-600">
                    <th className="py-2.5 px-4">Ref / Fecha VET</th>
                    <th className="py-2.5 px-4">Operación</th>
                    <th className="py-2.5 px-4">Producto</th>
                    <th className="py-2.5 px-4">Ruta de Zona</th>
                    <th className="py-2.5 px-4 text-right">Cant.</th>
                    <th className="py-2.5 px-4 text-right">Saldo Destino (Dep / Anaq)</th>
                    <th className="py-2.5 px-4">Operador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shelfMovements.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2.5 px-4 font-mono text-xs">
                        <div className="font-bold text-slate-900">{m.referenceCode}</div>
                        <div className="text-slate-500">{m.timestampVet}</div>
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-800">
                        {m.movementType}
                        {m.managerPinValidated && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px]">
                            PIN GERENTE
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-slate-900">{m.productName}</div>
                        <div className="text-xs text-slate-500 font-mono">{m.sku}</div>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700">
                        {m.fromLocationName} ({m.fromZone}) → {m.toLocationName} ({m.toZone})
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold tabular-nums">
                        {m.quantity} {m.unit}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-xs">
                        Dep: <strong>{m.depositAfter}</strong> · Anaq: <strong>{m.shelfAfter}</strong>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">{m.performedByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL REPOSICIÓN / RETORNO RÁPIDO */}
      {moveModal && activeLocation && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmMove}
            className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {moveModal.direction === 'TO_SHELF'
                  ? 'Reponer de Depósito/Cava → Anaquel'
                  : 'Retornar de Anaquel → Depósito/Cava'}
              </h3>
              <button
                type="button"
                onClick={() => setMoveModal(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-slate-900">
                {moveModal.product.name} ({moveModal.product.sku})
              </div>
              {(() => {
                const b = getLocationStockBreakdown(moveModal.product, activeLocation.id);
                return (
                  <div className="text-slate-600 tabular-nums">
                    Depósito/Cava: <strong>{b.deposit}</strong> · Anaquel:{' '}
                    <strong>{b.shelf}</strong> · Total: <strong>{b.total}</strong>{' '}
                    {moveModal.product.unit}
                  </div>
                );
              })()}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cantidad a mover ({moveModal.product.unit})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={moveQty}
                onChange={(e) => setMoveQty(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-bold tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Observación (Opcional)
              </label>
              <input
                type="text"
                value={moveNotes}
                onChange={(e) => setMoveNotes(e.target.value)}
                placeholder="Ej. Reposición turno mañana"
                className="w-full min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMoveModal(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold"
              >
                Confirmar Movimiento
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL SINCERACIÓN FÍSICA (±2% o ±1 unidad sin PIN / mayor con PIN Gerente) */}
      {syncModalProduct && activeLocation && liveSyncTolerance && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmSync}
            className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Sinceración Física de Existencias ({activeLocation.code})
              </h3>
              <button
                type="button"
                onClick={() => setSyncModalProduct(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="font-bold text-slate-900">
                {syncModalProduct.name} ({syncModalProduct.sku})
              </div>
              <div className="text-slate-600 mt-1 tabular-nums">
                Sistema Actual → Total: <strong>{liveSyncTolerance.systemTotal}</strong>{' '}
                {syncModalProduct.unit}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Conteo Físico Depósito / Cava ({syncModalProduct.unit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={countedDepositStr}
                  onChange={(e) => setCountedDepositStr(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Conteo Físico Anaquel / Vitrina ({syncModalProduct.unit})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={countedShelfStr}
                  onChange={(e) => setCountedShelfStr(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold tabular-nums"
                />
              </div>
            </div>

            <div
              className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                liveSyncTolerance.requiresManagerPin
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                {liveSyncTolerance.requiresManagerPin ? (
                  <>
                    <Lock className="w-4 h-4 text-amber-700" />
                    Diferencia supera ±2% y ±1 unidad: requiere PIN Gerencial
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Dentro de tolerancia (±2% o ±1 unidad): ajuste directo sin PIN
                  </>
                )}
              </div>
              <div className="tabular-nums">
                Nuevo Total Contado: <strong>{liveSyncTolerance.countedTotal}</strong> ·
                Variación Neta:{' '}
                <strong>
                  {liveSyncTolerance.totalDiff > 0 ? '+' : ''}
                  {liveSyncTolerance.totalDiff} {syncModalProduct.unit} (
                  {liveSyncTolerance.relativeDiffPercent}%)
                </strong>
              </div>
            </div>

            {liveSyncTolerance.requiresManagerPin && (
              <div>
                <label className="block text-xs font-semibold text-amber-900 mb-1">
                  PIN de Autorización Gerente (`203040`) o SuperAdmin (`102030`)
                </label>
                <input
                  type="password"
                  required
                  value={syncManagerPin}
                  onChange={(e) => setSyncManagerPin(e.target.value)}
                  placeholder="Ingrese PIN gerencial..."
                  className="w-full min-h-[44px] px-3.5 py-2 border border-amber-400 rounded-xl text-sm font-mono"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Acta / Motivo de Sinceración
              </label>
              <input
                type="text"
                required
                value={syncNotes}
                onChange={(e) => setSyncNotes(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSyncModalProduct(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
              >
                Aplicar Sinceración Física
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ShelfStockManager;
