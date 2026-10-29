import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag,
  Calculator,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  Truck,
  ClipboardCheck,
  PlusCircle,
  ArrowUpRight,
  Sliders,
  Sparkles,
  PackageCheck,
  MessageSquareShare,
  ScanBarcode,
  TrendingUp,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import { useOperationsBrm } from '../../context/OperationsBrmContext';
import { Product, RotationHorizonDays, SupplierPurchaseOrder } from '../../types';
import { BarcodeScannerModal } from '../common/BarcodeScannerModal';
import {
  ROTATION_HORIZONS_DAYS,
  simulatePurchaseByRotationHorizon,
  simulateAllHorizonsForProduct,
} from '../../lib/reorder-alerts';
import { toDecimal, round2, formatUsd, formatVes } from '../../lib/decimal';

export const PurchaseOrdersCenter: React.FC = () => {
  const {
    products,
    locations,
    reorderAlerts,
    purchaseOrders,
    manualReceipts,
    draftPurchaseTarget,
    setDraftPurchaseTarget,
    createManualPurchaseOrder,
    confirmPurchaseOrderDelivery,
    registerPostPurchaseManualReceipt,
  } = useInventory();
  const { bcvState, suppliers } = useFinance();
  const { computeQuincenaDemandForecast, dispatchPurchaseOrderToSupplierBrm } =
    useOperationsBrm();
  const [isRecScannerOpen, setIsRecScannerOpen] = useState(false);

  // Selected SKU, Sede/Depósito and Rotation Horizon (7, 15, 30, 45, 60 days)
  const [selectedProductId, setSelectedProductId] = useState<string>(
    draftPurchaseTarget?.productId || reorderAlerts[0]?.productId || products[0]?.id || 'prd-002'
  );
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    draftPurchaseTarget?.locationId || reorderAlerts[0]?.locationId || locations[0]?.id || 'loc-pzo-01'
  );
  const [horizonDays, setHorizonDays] = useState<RotationHorizonDays>(
    draftPurchaseTarget?.preferredHorizonDays || 30
  );
  const [includeSafetyBuffer, setIncludeSafetyBuffer] = useState<boolean>(true);
  const [activeAlertId, setActiveAlertId] = useState<string | undefined>(
    draftPurchaseTarget?.alertId
  );

  // Manual Order Calculator state
  const [manualOrderQty, setManualOrderQty] = useState<string>('120');
  const [manualUnitCostUsd, setManualUnitCostUsd] = useState<string>('2.35');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    suppliers[0]?.id || 'sup-001'
  );
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Post-Purchase Manual Reception state
  const [isNewProductMode, setIsNewProductMode] = useState<boolean>(true);
  const [existingRecProductId, setExistingRecProductId] = useState<string>(
    products[0]?.id || 'prd-001'
  );
  const [recLocationId, setRecLocationId] = useState<string>(locations[0]?.id || 'loc-pzo-01');
  const [recOrderRef, setRecOrderRef] = useState<string>('ORD-2026-0101');
  const [recSku, setRecSku] = useState<string>('');
  const [recBarcode, setRecBarcode] = useState<string>('');
  const [recName, setRecName] = useState<string>('');
  const [recCategory, setRecCategory] = useState<string>('Víveres Secos');
  const [recUnit, setRecUnit] = useState<Product['unit']>('UND');
  const [recIva, setRecIva] = useState<0 | 8 | 16>(0);
  const [recCostUsd, setRecCostUsd] = useState<string>('1.85');
  const [recMarginPct, setRecMarginPct] = useState<string>('28');
  const [recQty, setRecQty] = useState<string>('150');
  const [recReorderPoint, setRecReorderPoint] = useState<string>('60');

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || products[0],
    [products, selectedProductId]
  );

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === selectedLocationId) || locations[0],
    [locations, selectedLocationId]
  );

  // Compute rotation simulation for all 5 horizons (7, 15, 30, 45, 60 days) on the selected SKU & Sede/Depósito
  const allHorizonsMap = useMemo(() => {
    if (!selectedProduct || !selectedLocation) return null;
    return simulateAllHorizonsForProduct(
      selectedProduct,
      selectedLocation,
      locations,
      bcvState.activeRate,
      includeSafetyBuffer
    );
  }, [selectedProduct, selectedLocation, locations, bcvState.activeRate, includeSafetyBuffer]);

  const currentSimulation = allHorizonsMap ? allHorizonsMap[horizonDays] : null;

  const quincenaForecast = useMemo(() => {
    if (!selectedProduct || !selectedLocation) return null;
    return computeQuincenaDemandForecast(selectedProduct.id, selectedLocation.id, horizonDays);
  }, [selectedProduct, selectedLocation, horizonDays, computeQuincenaDemandForecast]);

  const handleDispatchOrderViaBrm = async (po: SupplierPurchaseOrder) => {
    const res = await dispatchPurchaseOrderToSupplierBrm(po, false);
    if (!res.success) {
      setFeedback({
        type: 'err',
        text: res.error || 'No se pudo despachar la Orden de Compra por WhatsApp BRM.',
      });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Orden de Compra ${po.orderNumber} despachada por WhatsApp BRM a ${po.supplierName}.`,
    });
  };

  // Synchronize when redirected from an Alert ("Reponer / Recomprar en Compras")
  useEffect(() => {
    if (!draftPurchaseTarget) return;
    const targetProd = products.find((p) => p.id === draftPurchaseTarget.productId);
    const targetLoc = locations.find((l) => l.id === draftPurchaseTarget.locationId);
    if (targetProd && targetLoc) {
      setSelectedProductId(targetProd.id);
      setSelectedLocationId(targetLoc.id);
      setActiveAlertId(draftPurchaseTarget.alertId);
      const h = draftPurchaseTarget.preferredHorizonDays || horizonDays;
      if (draftPurchaseTarget.preferredHorizonDays) {
        setHorizonDays(draftPurchaseTarget.preferredHorizonDays);
      }
      const sim = simulatePurchaseByRotationHorizon(
        targetProd,
        targetLoc,
        locations,
        h,
        bcvState.activeRate,
        includeSafetyBuffer
      );
      const initialManualQty = Math.max(15, sim.suggestedPurchaseQty || 50);
      setManualOrderQty(String(initialManualQty));
      setManualUnitCostUsd(String(targetProd.costUsd));
      setSelectedSupplierId(targetProd.supplierId || suppliers[0]?.id || 'sup-001');
      setOrderNotes(
        `Reposición manual originada desde alerta de inventario en ${targetLoc.code} (Simulación ${h} días).`
      );
      setFeedback({
        type: 'ok',
        text: `SKU "${targetProd.sku} — ${targetProd.name}" cargado en la Calculadora Manual de Compras para ${targetLoc.code}. Simule la rotación (7, 15, 30, 45 o 60 días) y ajuste manualmente la cantidad exacta a solicitar antes de emitir el pedido.`,
      });
    }
  }, [draftPurchaseTarget]);

  // Update unit cost & suggested quantity when user switches SKU, Sede/Depósito, or Horizon (7, 15, 30, 45, 60 days)
  const handleSelectHorizon = (days: RotationHorizonDays) => {
    setHorizonDays(days);
    if (selectedProduct && selectedLocation) {
      const sim = simulatePurchaseByRotationHorizon(
        selectedProduct,
        selectedLocation,
        locations,
        days,
        bcvState.activeRate,
        includeSafetyBuffer
      );
      setManualOrderQty(String(Math.max(1, sim.suggestedPurchaseQty)));
    }
  };

  const handleLoadProductIntoCalculator = (
    productId: string,
    locationId: string,
    alertId?: string
  ) => {
    const prod = products.find((p) => p.id === productId);
    const loc = locations.find((l) => l.id === locationId);
    if (!prod || !loc) return;

    setSelectedProductId(prod.id);
    setSelectedLocationId(loc.id);
    setActiveAlertId(alertId);

    const sim = simulatePurchaseByRotationHorizon(
      prod,
      loc,
      locations,
      horizonDays,
      bcvState.activeRate,
      includeSafetyBuffer
    );
    setManualOrderQty(String(Math.max(1, sim.suggestedPurchaseQty || 25)));
    setManualUnitCostUsd(String(prod.costUsd));
    setSelectedSupplierId(prod.supplierId || suppliers[0]?.id || 'sup-001');
  };

  // Live Manual Order Financial Totals (Decimal.js)
  const parsedManualQty = Math.max(0, round2(parseFloat(manualOrderQty) || 0));
  const parsedUnitCost = Math.max(0.01, round2(parseFloat(manualUnitCostUsd) || 0));
  const manualTotalUsd = round2(toDecimal(parsedManualQty).times(parsedUnitCost));
  const manualTotalVes = round2(toDecimal(manualTotalUsd).times(bcvState.activeRate));

  const systemSuggestedQty = currentSimulation?.suggestedPurchaseQty ?? 0;
  const deltaVsSystem = round2(toDecimal(parsedManualQty).minus(systemSuggestedQty));

  const adjustManualQtyBy = (delta: number) => {
    const next = Math.max(1, round2(toDecimal(parsedManualQty).plus(delta)));
    setManualOrderQty(String(next));
  };

  const handleEmitManualOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !selectedLocation) return;

    const res = createManualPurchaseOrder({
      productId: selectedProduct.id,
      locationId: selectedLocation.id,
      supplierId: selectedSupplierId,
      orderedQty: parsedManualQty,
      unitCostUsd: parsedUnitCost,
      horizonDaysUsed: horizonDays,
      systemSuggestedQty,
      notes: orderNotes,
      alertId: activeAlertId,
    });

    if (!res.success || !res.order) {
      setFeedback({
        type: 'err',
        text: res.error || 'Error al emitir el pedido manual al proveedor.',
      });
      return;
    }

    setDraftPurchaseTarget(null);
    setActiveAlertId(undefined);
    setFeedback({
      type: 'ok',
      text: `Orden de Compra Manual ${res.order.orderNumber} generada en estado PENDIENTE DE ENTREGA: ${res.order.orderedQty} ${res.order.unit} de "${res.order.sku} — ${res.order.productName}" para ${res.order.locationCode} (Horizonte simulado: ${horizonDays} días · Sugerido sistema: ${systemSuggestedQty} ${res.order.unit}).`,
    });
  };

  const handleConfirmDelivery = (orderId: string) => {
    const res = confirmPurchaseOrderDelivery(orderId);
    if (!res.success || !res.order) {
      setFeedback({
        type: 'err',
        text: res.error || 'No se pudo confirmar la recepción del pedido.',
      });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Entrega confirmada para ${res.order.orderNumber}. Se sumaron +${res.order.receivedQty} ${res.order.unit} de "${res.order.productName}" al stock de ${res.order.locationCode}.`,
    });
  };

  const handleManualPostPurchaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = registerPostPurchaseManualReceipt({
      isNewProduct: isNewProductMode,
      existingProductId: existingRecProductId,
      sku: recSku,
      barcode: recBarcode,
      productName: recName,
      category: recCategory,
      unit: recUnit,
      ivaRate: recIva,
      targetMarginPercent: parseFloat(recMarginPct) || 28,
      locationId: recLocationId,
      qtyReceived: parseFloat(recQty) || 0,
      unitCostUsd: parseFloat(recCostUsd) || 1.0,
      reorderPoint: parseFloat(recReorderPoint) || 50,
      orderNumberRef: recOrderRef,
    });

    if (!res.success || !res.receipt) {
      setFeedback({
        type: 'err',
        text: res.error || 'Error registrando recepción manual de productos.',
      });
      return;
    }

    setFeedback({
      type: 'ok',
      text: `Recepción ${res.receipt.receiptCode} registrada: +${res.receipt.qtyReceived} ${res.receipt.unit} de "${res.receipt.sku} — ${res.receipt.productName}" ingresados en ${res.receipt.locationCode}.`,
    });
    if (isNewProductMode) {
      setRecSku('');
      setRecBarcode('');
      setRecName('');
    }
  };

  // Multi-SKU simulation matrix for the selected Sede/Depósito and Horizon (top 15 by priority/suggested need)
  const matrixRows = useMemo(() => {
    if (!selectedLocation) return [];
    const rows = products.map((prod) =>
      simulatePurchaseByRotationHorizon(
        prod,
        selectedLocation,
        locations,
        horizonDays,
        bcvState.activeRate,
        includeSafetyBuffer
      )
    );
    rows.sort((a, b) => {
      const aLow = a.currentStock <= a.reorderPoint ? 0 : 1;
      const bLow = b.currentStock <= b.reorderPoint ? 0 : 1;
      if (aLow !== bLow) return aLow - bLow;
      return b.suggestedPurchaseQty - a.suggestedPurchaseQty;
    });
    return rows.slice(0, 15);
  }, [products, selectedLocation, locations, horizonDays, bcvState.activeRate, includeSafetyBuffer]);

  const pendingOrdersCount = purchaseOrders.filter(
    (po) => po.status === 'PENDIENTE_ENTREGA'
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <ShoppingBag className="w-5 h-5 text-sky-600" />
            <h1 className="text-base font-bold text-slate-900">
              Central de Compras, Pedidos Manuales y Simulador de Rotación (7, 15, 30, 45 y 60 Días)
            </h1>
            <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200 font-mono text-[11px] font-bold">
              CÁLCULO MANUAL DETERMINISTA
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Sección dedicada exclusivamente a Compras: simule el sugerido según la rotación de los
            últimos <strong>7, 15, 30, 45 o 60 días</strong> y calcule manualmente el pedido exacto
            a solicitar más allá de la sugerencia del sistema.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-mono whitespace-nowrap">
            Horizonte Activo: <strong className="text-sky-400">{horizonDays} DÍAS</strong> · Pedidos
            Pendientes: <strong className="text-amber-400">{pendingOrdersCount}</strong> · Tasa BCV:{' '}
            <strong className="text-emerald-400">Bs. {bcvState.activeRate.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-rose-50 border-rose-200 text-rose-950'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
        </div>
      )}

      {/* MAIN WORKBENCH: 7/15/30/45/60 Day Rotation Simulator + Manual Purchase Order Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN (7 Cols): Rotation Simulator 7, 15, 30, 45, 60 Days */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-sky-600" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                1. Simulador de Compra Sugerida por Rotación (7, 15, 30, 45 o 60 Días)
              </h2>
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSafetyBuffer}
                onChange={(e) => setIncludeSafetyBuffer(e.target.checked)}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span>Incluir Colchón de Seguridad</span>
            </label>
          </div>

          {/* SKU & Sede/Depósito Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Producto / SKU a Analizar y Comprar
              </label>
              <select
                aria-label="Producto o SKU a Analizar"
                value={selectedProductId}
                onChange={(e) =>
                  handleLoadProductIntoCalculator(e.target.value, selectedLocationId)
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name} ({formatUsd(p.costUsd)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Sede o Depósito Destino
              </label>
              <select
                aria-label="Sede o Depósito Destino"
                value={selectedLocationId}
                onChange={(e) =>
                  handleLoadProductIntoCalculator(selectedProductId, e.target.value)
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium text-slate-900"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    [{loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 'Depósito' : 'Sede'}]{' '}
                    {loc.code} — {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 5 Horizon Selector Buttons: 7, 15, 30, 45, 60 Days */}
          {quincenaForecast && (
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-indigo-950">
                    Predicción Estacional Quincena Venezolana (15 y 30) &amp; Fin de Semana ({horizonDays}d)
                  </div>
                  <div className="text-indigo-800 tabular-nums">
                    Factor Pico: <strong>{quincenaForecast.quincenaMultiplier}×</strong> · Demanda Proyectada:{' '}
                    <strong>{quincenaForecast.projectedDemandHorizon} {selectedProduct?.unit}</strong> · Pedido Recomendado:{' '}
                    <strong>{quincenaForecast.recommendedOrderQty} {selectedProduct?.unit}</strong>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setManualOrderQty(String(Math.max(1, quincenaForecast.recommendedOrderQty)))
                }
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold shrink-0 cursor-pointer"
              >
                Aplicar Sugerido Quincena
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">
                Horizonte de Rotación para Proyección de Compra:
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                Seleccione 7, 15, 30, 45 o 60 días
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {ROTATION_HORIZONS_DAYS.map((days) => {
                const isSelected = horizonDays === days;
                const horizonSim = allHorizonsMap ? allHorizonsMap[days] : null;
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => handleSelectHorizon(days)}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-600 border-sky-600 text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-extrabold">{days} Días</div>
                    {horizonSim && (
                      <div
                        className={`text-[10px] font-mono mt-0.5 ${
                          isSelected ? 'text-sky-100 font-bold' : 'text-slate-500'
                        }`}
                      >
                        Sug: +{horizonSim.suggestedPurchaseQty} {horizonSim.unit}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Simulation Metrics Card for the Active Horizon */}
          {currentSimulation && (
            <div className="bg-slate-900 text-white rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-bold">
                    Diagnóstico de Rotación · Horizonte {currentSimulation.horizonDays} Días
                  </span>
                  <h3 className="text-sm font-bold text-white">
                    {currentSimulation.sku} — {currentSimulation.productName} (
                    {currentSimulation.locationCode})
                  </h3>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-mono text-xs font-bold">
                  Sugerido Sistema ({currentSimulation.horizonDays}d): +
                  {currentSimulation.suggestedPurchaseQty} {currentSimulation.unit}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
                <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-400 uppercase">Velocidad Diaria</div>
                  <div className="text-sm font-bold text-sky-300 mt-0.5">
                    {currentSimulation.dailyRotationVelocity} {currentSimulation.unit}/día
                  </div>
                  <div className="text-[10px] text-slate-500">
                    ~{currentSimulation.estimatedMonthlyUnitsLocation} {currentSimulation.unit}/mes
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-400 uppercase">
                    Demanda ({currentSimulation.horizonDays} Días)
                  </div>
                  <div className="text-sm font-bold text-amber-300 mt-0.5">
                    {currentSimulation.projectedDemandUnits} {currentSimulation.unit}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    +Seguridad: {currentSimulation.safetyStockUnits} {currentSimulation.unit}
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-400 uppercase">Stock en Sede</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {currentSimulation.currentStock} {currentSimulation.unit}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Mínimo: {currentSimulation.reorderPoint} ({currentSimulation.daysOfInventoryCoverage}d cob.)
                  </div>
                </div>

                <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-lg p-2.5">
                  <div className="text-[10px] text-emerald-300 uppercase">
                    Sugerido ({currentSimulation.horizonDays}d)
                  </div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">
                    +{currentSimulation.suggestedPurchaseQty} {currentSimulation.unit}
                  </div>
                  <div className="text-[10px] text-emerald-200">
                    {formatUsd(currentSimulation.suggestedTotalUsd)}
                  </div>
                </div>
              </div>

              {/* Comparative Table across 7, 15, 30, 45, and 60 days */}
              {allHorizonsMap && (
                <div className="pt-1">
                  <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
                    Comparativa Simultánea de Horizontes de Rotación (7, 15, 30, 45 y 60 Días):
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[11px] font-mono">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-1.5 px-2">Horizonte</th>
                          <th className="py-1.5 px-2 text-right">Demanda Proyectada</th>
                          <th className="py-1.5 px-2 text-right">Req. Total (+Seg)</th>
                          <th className="py-1.5 px-2 text-right">Stock Actual</th>
                          <th className="py-1.5 px-2 text-right">Sugerido Sistema</th>
                          <th className="py-1.5 px-2 text-right">Costo Sugerido</th>
                          <th className="py-1.5 px-2 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {ROTATION_HORIZONS_DAYS.map((h) => {
                          const row = allHorizonsMap[h];
                          const isCurrent = h === horizonDays;
                          return (
                            <tr
                              key={h}
                              className={isCurrent ? 'bg-sky-950/80 text-white' : 'text-slate-300'}
                            >
                              <td className="py-1.5 px-2 font-bold">
                                {h} días {isCurrent && '(Activo)'}
                              </td>
                              <td className="py-1.5 px-2 text-right">
                                {row.projectedDemandUnits} {row.unit}
                              </td>
                              <td className="py-1.5 px-2 text-right">
                                {row.totalRequiredUnits} {row.unit}
                              </td>
                              <td className="py-1.5 px-2 text-right">
                                {row.currentStock} {row.unit}
                              </td>
                              <td className="py-1.5 px-2 text-right font-bold text-emerald-400">
                                +{row.suggestedPurchaseQty} {row.unit}
                              </td>
                              <td className="py-1.5 px-2 text-right">
                                {formatUsd(row.suggestedTotalUsd)}
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setHorizonDays(h);
                                    setManualOrderQty(
                                      String(Math.max(1, row.suggestedPurchaseQty))
                                    );
                                  }}
                                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-sky-600 text-sky-300 hover:text-white text-[10px] font-bold transition cursor-pointer"
                                >
                                  Aplicar {h}d
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN (5 Cols): Manual Purchase Order Calculator */}
        <form
          onSubmit={handleEmitManualOrder}
          className="lg:col-span-5 bg-white border-2 border-sky-600/30 rounded-xl p-4 shadow-xs flex flex-col justify-between space-y-4 text-xs"
        >
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-sky-600" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  2. Calculadora de Pedido Manual al Proveedor
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px] font-bold">
                PERSONALIZABLE
              </span>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              Ajuste libremente la cantidad exacta que desea solicitar al proveedor, por encima o por
              debajo de la sugerencia del sistema para los <strong>{horizonDays} días</strong> de
              rotación simulados.
            </p>

            {/* Quantity Override Box */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="manual-order-qty-input"
                  className="font-bold text-slate-800 text-xs"
                >
                  Cantidad Manual a Solicitar ({selectedProduct?.unit || 'UND'}) *
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setManualOrderQty(String(Math.max(1, systemSuggestedQty || 20)))
                  }
                  className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-sky-700 hover:text-sky-600 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  Usar Sugerido {horizonDays}d ({systemSuggestedQty} {selectedProduct?.unit})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="manual-order-qty-input"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={manualOrderQty}
                  onChange={(e) => setManualOrderQty(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-sky-500 rounded-lg bg-white font-mono text-base font-extrabold text-slate-900"
                />
              </div>

              {/* Quick Stepper Adjustments */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[-50, -10, +10, +25, +50, +100].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => adjustManualQtyBy(step)}
                    className="px-2 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-mono text-[11px] font-bold text-slate-700 cursor-pointer"
                  >
                    {step > 0 ? `+${step}` : step}
                  </button>
                ))}
                <span className="ml-auto font-mono text-[11px] text-slate-600">
                  Dif. vs Sugerido:{' '}
                  <strong
                    className={
                      deltaVsSystem >= 0 ? 'text-emerald-700' : 'text-amber-700'
                    }
                  >
                    {deltaVsSystem >= 0 ? `+${deltaVsSystem}` : deltaVsSystem}{' '}
                    {selectedProduct?.unit}
                  </strong>
                </span>
              </div>
            </div>

            {/* Supplier & Unit Cost */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Proveedor Asignado *
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium"
                >
                  {suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name} ({sup.rif})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Costo Unitario Pactado (USD) *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={manualUnitCostUsd}
                  onChange={(e) => setManualUnitCostUsd(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Observaciones / Justificación del Cálculo Manual
              </label>
              <input
                type="text"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder={`Ej. Pedido ajustado manualmente tras simular rotación de ${horizonDays} días`}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg"
              />
            </div>

            {/* Financial Summary Box */}
            <div className="p-3 rounded-xl bg-slate-900 text-white font-mono space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  Sugerencia Sistema ({horizonDays} días): {systemSuggestedQty}{' '}
                  {selectedProduct?.unit}
                </span>
                <span>
                  Pedido Manual: <strong className="text-white">{parsedManualQty}</strong>{' '}
                  {selectedProduct?.unit}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                <span className="text-xs font-bold text-slate-300">Total Orden Manual:</span>
                <div className="text-right">
                  <div className="text-sm font-extrabold text-emerald-400">
                    {formatUsd(manualTotalUsd)}
                  </div>
                  <div className="text-[11px] text-sky-300">{formatVes(manualTotalVes)}</div>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center justify-center gap-2 transition shadow-sm cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Emitir Pedido Manual al Proveedor (Queda en PENDIENTE)</span>
          </button>
        </form>
      </div>

      {/* SECTION 3: Multi-SKU Rotation Simulation Table (7, 15, 30, 45, 60 Days) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              3. Matriz de Simulación de Sugeridos por Rotación ({horizonDays} Días) en{' '}
              {selectedLocation?.code} — {selectedLocation?.name}
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {ROTATION_HORIZONS_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleSelectHorizon(d)}
                className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition cursor-pointer ${
                  horizonDays === d
                    ? 'bg-sky-600 text-white'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                <th className="py-2.5 px-3">SKU / Producto</th>
                <th className="py-2.5 px-3 text-right">Rotación Diaria</th>
                <th className="py-2.5 px-3 text-right">Demanda ({horizonDays}d)</th>
                <th className="py-2.5 px-3 text-right">Stock Actual</th>
                <th className="py-2.5 px-3 text-right">Punto Pedido</th>
                <th className="py-2.5 px-3 text-right">Sugerido ({horizonDays}d)</th>
                <th className="py-2.5 px-3 text-right">Inversión Est.</th>
                <th className="py-2.5 px-3 text-center">Cálculo Manual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {matrixRows.map((row) => {
                const isSelectedRow = row.productId === selectedProductId;
                const isUnderMin = row.currentStock <= row.reorderPoint;
                return (
                  <tr
                    key={row.productId}
                    className={
                      isSelectedRow
                        ? 'bg-sky-50/70'
                        : isUnderMin
                        ? 'bg-amber-50/30 hover:bg-amber-50/60'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{row.productName}</div>
                      <div className="font-mono text-[10px] text-slate-500">
                        {row.sku} · Clase {row.abcClass}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                      {row.dailyRotationVelocity} {row.unit}/día
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                      {row.projectedDemandUnits} {row.unit}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-bold ${
                        isUnderMin ? 'text-rose-700' : 'text-slate-900'
                      }`}
                    >
                      {row.currentStock} {row.unit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                      {row.reorderPoint} {row.unit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 bg-emerald-50/60">
                      +{row.suggestedPurchaseQty} {row.unit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      <div className="font-bold text-slate-900">
                        {formatUsd(row.suggestedTotalUsd)}
                      </div>
                      <div className="text-[10px] text-sky-700">
                        {formatVes(row.suggestedTotalVes)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          handleLoadProductIntoCalculator(row.productId, row.locationId)
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-sky-600 text-white font-semibold text-[11px] transition cursor-pointer"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Cargar en Calculadora</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: Active Supplier Purchase Orders (PENDIENTE_ENTREGA -> RECIBIDO_CONFORME) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-sky-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              4. Órdenes de Compra Emitidas a Proveedores ({purchaseOrders.length} Totales ·{' '}
              {pendingOrdersCount} en Estado PENDIENTE DE ENTREGA)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            El pedido permanece en PENDIENTE hasta confirmar la recepción física de la mercancía
          </span>
        </div>

        {purchaseOrders.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No hay órdenes de compra registradas aún. Utilice la{' '}
            <strong>Calculadora de Pedido Manual</strong> superior para emitir un pedido.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                  <th className="py-2.5 px-3">N° Orden / Horizonte</th>
                  <th className="py-2.5 px-3">Proveedor</th>
                  <th className="py-2.5 px-3">Sede / Depósito</th>
                  <th className="py-2.5 px-3">SKU / Producto</th>
                  <th className="py-2.5 px-3 text-right">Sugerido vs. Pedido Manual</th>
                  <th className="py-2.5 px-3 text-right">Total USD / VES</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                  <th className="py-2.5 px-3 text-center">Recepción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {purchaseOrders.map((po) => {
                  const isPending = po.status === 'PENDIENTE_ENTREGA';
                  return (
                    <tr key={po.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono">
                        <div className="font-bold text-slate-900">{po.orderNumber}</div>
                        <div className="text-[10px] text-sky-700 font-semibold">
                          {po.horizonDaysUsed
                            ? `Rotación ${po.horizonDaysUsed} días`
                            : 'Reposición Manual'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">{po.supplierName}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {po.locationCode}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{po.productName}</div>
                        <div className="font-mono text-[10px] text-slate-500">{po.sku}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-bold text-slate-900">
                          Pedido: {po.orderedQty} {po.unit}
                        </div>
                        {po.systemSuggestedQty !== undefined && (
                          <div className="text-[10px] text-slate-500">
                            Sug. Sistema: {po.systemSuggestedQty} {po.unit}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-bold text-slate-900">{formatUsd(po.totalCostUsd)}</div>
                        <div className="text-[10px] text-sky-700">{formatVes(po.totalCostVes)}</div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            isPending
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          }`}
                        >
                          {isPending ? 'PENDIENTE DE ENTREGA' : 'RECIBIDO CONFORME'}
                        </span>
                      </td>
                       <td className="py-2.5 px-3 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              handleDispatchOrderViaBrm(po).catch(() => {});
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] transition cursor-pointer"
                            title="Enviar Orden de Compra al proveedor vía WhatsApp BRM"
                          >
                            <MessageSquareShare className="w-3.5 h-3.5 text-emerald-400" />
                            <span>WhatsApp BRM</span>
                          </button>
                          {isPending ? (
                            <button
                              type="button"
                              onClick={() => handleConfirmDelivery(po.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition shadow-xs cursor-pointer"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              <span>Confirmar Entrega</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-700 font-semibold">
                              <PackageCheck className="w-3.5 h-3.5" />+{po.receivedQty} {po.unit} en
                              stock
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 5: Manual Post-Purchase Product Reception */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <form
          onSubmit={handleManualPostPurchaseSubmit}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3 text-xs"
        >
          <div className="flex items-center justify-between gap-2 font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-emerald-600" />
              <span>5. Carga Manual Post-Pedido / Compra</span>
            </div>
            <button
              type="button"
              onClick={() => setIsRecScannerOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <ScanBarcode className="w-3.5 h-3.5" />
              Escanear PWA
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsNewProductMode(true)}
              className={`py-2 px-2.5 rounded-lg border font-bold text-center transition cursor-pointer ${
                isNewProductMode
                  ? 'bg-emerald-50 border-emerald-600 text-emerald-950'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Nuevo Producto (Nuevo SKU)
            </button>
            <button
              type="button"
              onClick={() => setIsNewProductMode(false)}
              className={`py-2 px-2.5 rounded-lg border font-bold text-center transition cursor-pointer ${
                !isNewProductMode
                  ? 'bg-sky-50 border-sky-600 text-sky-950'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              SKU Existente
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Sede o Depósito Receptor *
              </label>
              <select
                value={recLocationId}
                onChange={(e) => setRecLocationId(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code} — {loc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ref. Pedido / Factura
              </label>
              <input
                type="text"
                value={recOrderRef}
                onChange={(e) => setRecOrderRef(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          {isNewProductMode ? (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Código Nuevo SKU *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. CAF-PRE-250G"
                    value={recSku}
                    onChange={(e) => setRecSku(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Código EAN-13
                  </label>
                  <input
                    type="text"
                    placeholder="759100..."
                    value={recBarcode}
                    onChange={(e) => setRecBarcode(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Descripción del Nuevo Producto *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Café Gourmet Selección Especial 250g"
                  value={recName}
                  onChange={(e) => setRecName(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Producto Existente *
              </label>
              <select
                value={existingRecProductId}
                onChange={(e) => setExistingRecProductId(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cant. Recibida *</label>
              <input
                type="number"
                min="1"
                required
                value={recQty}
                onChange={(e) => setRecQty(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Costo Unit ($) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={recCostUsd}
                onChange={(e) => setRecCostUsd(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Punto Pedido</label>
              <input
                type="number"
                min="0"
                value={recReorderPoint}
                onChange={(e) => setRecReorderPoint(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Registrar Ingreso Post-Compra</span>
          </button>
        </form>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Bitácora de Recepciones Post-Pedido / Compra ({manualReceipts.length})
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              Actualización inmediata de Kardex y Catálogo Maestro
            </span>
          </div>

          {manualReceipts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Sin recepciones manuales registradas en esta sesión.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                    <th className="py-2.5 px-3">Recepción / Ref.</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3">SKU / Producto</th>
                    <th className="py-2.5 px-3">Sede / Depósito</th>
                    <th className="py-2.5 px-3 text-right">Cantidad</th>
                    <th className="py-2.5 px-3 text-right">Total USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {manualReceipts.map((rcp) => (
                    <tr key={rcp.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono">
                        <div className="font-bold text-slate-900">{rcp.receiptCode}</div>
                        <div className="text-[10px] text-slate-500">
                          Ref: {rcp.orderNumberRef}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {rcp.isNewProduct ? 'NUEVO SKU' : 'SKU EXISTENTE'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{rcp.productName}</div>
                        <div className="font-mono text-[10px] text-slate-500">{rcp.sku}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        {rcp.locationCode}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                        +{rcp.qtyReceived} {rcp.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatUsd(rcp.totalCostUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <BarcodeScannerModal
        isOpen={isRecScannerOpen}
        onClose={() => setIsRecScannerOpen(false)}
        title="Escáner PWA Recepción de Mercancía en Andén"
        products={products}
        locationId={recLocationId}
        defaultZone="DEPOSITO"
        onSelectSingleProduct={({ product, rawCode, effectiveQuantity }) => {
          if (product) {
            setIsNewProductMode(false);
            setExistingRecProductId(product.id);
            setRecQty(String(effectiveQuantity));
            setRecCostUsd(String(product.costUsd));
          } else {
            setIsNewProductMode(true);
            setRecBarcode(rawCode);
          }
          setIsRecScannerOpen(false);
        }}
      />
    </div>
  );
};

export default PurchaseOrdersCenter;
