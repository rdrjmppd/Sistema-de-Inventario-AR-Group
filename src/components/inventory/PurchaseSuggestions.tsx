import React, { useState } from 'react';
import {
  ShoppingCart,
  AlertTriangle,
  CheckCircle2,
  Zap,
  PackagePlus,
  AlertOctagon,
  Sliders,
  Truck,
  ClipboardCheck,
  PlusCircle,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useFinance } from '../../context/FinanceContext';
import { useOperationsBrm } from '../../context/OperationsBrmContext';
import { ManualRiskMode, NavigationTab, Product } from '../../types';
import { toDecimal, round2, formatUsd, formatVes } from '../../lib/decimal';

interface PurchaseSuggestionsProps {
  onNavigate?: (tab: NavigationTab) => void;
}

export const PurchaseSuggestions: React.FC<PurchaseSuggestionsProps> = ({ onNavigate }) => {
  const {
    products,
    locations,
    reorderAlerts,
    purchaseOrders,
    manualReceipts,
    triggerRealtimeStockDropDemo,
    configureProductRiskIndicator,
    setDraftPurchaseTarget,
    createReplenishmentOrderFromAlert,
    confirmPurchaseOrderDelivery,
    registerPostPurchaseManualReceipt,
  } = useInventory();
  const { suppliers } = useFinance();
  const { computeQuincenaDemandForecast } = useOperationsBrm();

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // 1. Manual Risk Indicator Configuration state
  const [riskProductId, setRiskProductId] = useState<string>(products[0]?.id || 'prd-001');
  const [riskLocationId, setRiskLocationId] = useState<string>(locations[0]?.id || 'loc-pzo-01');
  const [manualRiskMode, setManualRiskMode] = useState<ManualRiskMode>('CRITICO_MANUAL');
  const [customReorderPoint, setCustomReorderPoint] = useState<string>('120');
  const [safetyMultiplier, setSafetyMultiplier] = useState<string>('1.5');

  // 2. Post-Purchase Manual Reception state (existing or brand new product arriving after order/purchase)
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

  const totalInvestmentUsd = round2(
    reorderAlerts.reduce((acc, s) => acc.plus(s.estimatedOrderCostUsd), toDecimal(0))
  );

  const pendingOrdersCount = purchaseOrders.filter(
    (po) => po.status === 'PENDIENTE_ENTREGA'
  ).length;

  const handleSaveManualRisk = (e: React.FormEvent) => {
    e.preventDefault();
    const targetProd = products.find((p) => p.id === riskProductId);
    const targetLoc = locations.find((l) => l.id === riskLocationId);
    if (!targetProd || !targetLoc) return;

    const rp = Math.max(0, parseFloat(customReorderPoint) || 0);
    const mult = Math.max(1.0, parseFloat(safetyMultiplier) || 1.5);

    configureProductRiskIndicator({
      productId: riskProductId,
      locationId: riskLocationId,
      manualRiskMode,
      reorderPoint: rp,
      safetyMultiplier: mult,
    });

    setFeedback({
      type: 'ok',
      text: `Indicador de riesgo actualizado para "${targetProd.sku} — ${targetProd.name}" en ${targetLoc.code}: Modo ${manualRiskMode} · Punto Pedido: ${rp} ${targetProd.unit} (${mult}× seguridad).`,
    });
  };

  const handleRedirectAlertToManualPurchase = (alertId: string) => {
    const alert = reorderAlerts.find((a) => a.id === alertId);
    if (!alert) return;

    setDraftPurchaseTarget({
      productId: alert.productId,
      locationId: alert.locationId,
      alertId: alert.id,
      preferredHorizonDays: 30,
    });

    if (onNavigate) {
      onNavigate('PURCHASE_ORDERS_CENTER');
      return;
    }

    const res = createReplenishmentOrderFromAlert(alertId);
    if (!res.success || !res.order) {
      setFeedback({
        type: 'err',
        text: res.error || 'No se pudo generar el pedido de reposición.',
      });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Orden de Pedido a Proveedor ${res.order.orderNumber} generada en estado PENDIENTE DE ENTREGA.`,
    });
  };

  const handleConfirmDelivery = (orderId: string) => {
    const res = confirmPurchaseOrderDelivery(orderId);
    if (!res.success || !res.order) {
      setFeedback({
        type: 'err',
        text: res.error || 'Error al confirmar entrega del pedido.',
      });
      return;
    }
    setFeedback({
      type: 'ok',
      text: `Entrega del pedido ${res.order.orderNumber} CONFIRMADA. Se ingresaron +${res.order.receivedQty} ${res.order.unit} de "${res.order.productName}" al inventario de ${res.order.locationCode} y se cerró la alerta de reposición.`,
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
      text: `Recepción ${res.receipt.receiptCode} asentada exitosamente: +${res.receipt.qtyReceived} ${res.receipt.unit} de "${res.receipt.sku} — ${res.receipt.productName}" incorporados en ${res.receipt.locationCode}.`,
    });
    if (isNewProductMode) {
      setRecSku('');
      setRecBarcode('');
      setRecName('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <ShoppingCart className="w-5 h-5 text-sky-600" />
            <h1 className="text-base font-bold text-slate-900">
              Gestión de Riesgo de Quiebre, Pedidos a Proveedor (Pendientes / Confirmados) y Carga
              Post-Compra
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure indicadores de riesgo manuales o automáticos, emita pedidos de reposición que
            permanecen en <strong>PENDIENTE</strong> hasta confirmar su entrega, y cargue nuevos
            productos recibidos post-compra.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => triggerRealtimeStockDropDemo()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-xs whitespace-nowrap cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Simular Caída de Stock en Vivo</span>
          </button>
          <div className="bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-mono whitespace-nowrap">
            Pedidos Pendientes: <strong className="text-amber-400">{pendingOrdersCount}</strong> ·
            Inversión Sugerida:{' '}
            <strong className="text-emerald-400">{formatUsd(totalInvestmentUsd)}</strong>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-rose-50 border-rose-200 text-rose-950'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* SECTION 1: Manual Risk Level & Specific Reorder Indicator Configuration */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              1. Configuración Manual de Nivel de Riesgo de Falla e Indicadores Específicos de
              Quiebre por SKU
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Permite fijar riesgo manual además del cálculo automático por rotación
          </span>
        </div>

        <form
          onSubmit={handleSaveManualRisk}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end text-xs"
        >
          <div className="lg:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">
              SKU / Producto a Monitorear
            </label>
            <select
              value={riskProductId}
              onChange={(e) => {
                const pid = e.target.value;
                setRiskProductId(pid);
                const found = products.find((p) => p.id === pid);
                if (found) {
                  setCustomReorderPoint(
                    String(found.minStockByLocation[riskLocationId] ?? 60)
                  );
                }
              }}
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
            <label className="block font-semibold text-slate-700 mb-1">Sede o Depósito</label>
            <select
              value={riskLocationId}
              onChange={(e) => setRiskLocationId(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-medium"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  [{loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 'Depósito' : 'Sede'}]{' '}
                  {loc.code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nivel de Riesgo de Falla
            </label>
            <select
              value={manualRiskMode}
              onChange={(e) => setManualRiskMode(e.target.value as ManualRiskMode)}
              className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white font-bold text-slate-900"
            >
              <option value="CRITICO_MANUAL">Riesgo Crítico Manual (Forzar)</option>
              <option value="PREVENTIVO_MANUAL">Alerta Preventiva Manual</option>
              <option value="AUTOMATICO">Automático por Rotación</option>
              <option value="EXENTO_MANUAL">Exento de Alerta</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Punto Pedido</label>
              <input
                type="number"
                min="0"
                value={customReorderPoint}
                onChange={(e) => setCustomReorderPoint(e.target.value)}
                className="w-full px-2 py-2 border border-slate-300 rounded-lg font-mono font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Factor Seg.</label>
              <select
                value={safetyMultiplier}
                onChange={(e) => setSafetyMultiplier(e.target.value)}
                className="w-full px-2 py-2 border border-slate-300 rounded-lg bg-white font-mono"
              >
                <option value="1.2">1.2× Min</option>
                <option value="1.5">1.5× Min</option>
                <option value="2.0">2.0× Min</option>
                <option value="2.5">2.5× Min</option>
              </select>
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold transition shadow-xs cursor-pointer"
            >
              Aplicar Indicador de Riesgo
            </button>
          </div>
        </form>

        {(() => {
          const fc = computeQuincenaDemandForecast(riskProductId, riskLocationId, 15);
          if (!fc) return null;
          return (
            <div className="p-3 rounded-xl bg-indigo-50/80 border border-indigo-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-indigo-950">
                <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  <strong>Pronóstico Quincenal (15d):</strong> Velocidad pico{' '}
                  <strong className="font-mono">{fc.quincenaMultiplier}×</strong> · Demanda estimada:{' '}
                  <strong className="font-mono">{fc.projectedDemandHorizon}</strong> · Pedido sugerido:{' '}
                  <strong className="font-mono text-indigo-700">{fc.recommendedOrderQty}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCustomReorderPoint(String(Math.max(10, Math.ceil(fc.projectedDemandHorizon))))}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] cursor-pointer"
              >
                Usar como Punto Pedido 15d
              </button>
            </div>
          );
        })()}
      </div>

      {/* SECTION 2: Active Risk Alerts -> Generate Pending Supplier Purchase Order */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            2. SKUs en Riesgo de Falla / Punto de Pedido ({reorderAlerts.length} Activos) — Emisión
            de Pedido a Proveedor
          </h2>
          <span className="text-[11px] font-mono text-slate-500">
            Al solicitar reposición se genera una Orden en PENDIENTE hasta confirmar entrega
          </span>
        </div>

        {reorderAlerts.length === 0 ? (
          <div className="p-6 text-center text-emerald-900 bg-emerald-50/50">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold">
              Todas las Sedes y Depósitos Operan Sobre el Punto de Pedido
            </h3>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                  <th className="py-2.5 px-3">Sede/Depósito & Origen Riesgo</th>
                  <th className="py-2.5 px-3">SKU / Producto</th>
                  <th className="py-2.5 px-3">Proveedor Asignado</th>
                  <th className="py-2.5 px-3 text-right">Stock Actual</th>
                  <th className="py-2.5 px-3 text-right">Punto Pedido</th>
                  <th className="py-2.5 px-3 text-right">Cantidad a Pedir</th>
                  <th className="py-2.5 px-3 text-right">Costo Est. (USD / VES)</th>
                  <th className="py-2.5 px-3 text-center">Estado / Solicitar Reposición</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {reorderAlerts.map((s) => {
                  const isCrit = s.severity === 'CRITICO_QUIEBRE';
                  const isManual = s.riskSource === 'MANUAL_FORZADO';
                  const supplier = suppliers[0]?.name || 'Alimentos Polar Comercial, C.A.';
                  const pendingOrder = purchaseOrders.find(
                    (po) =>
                      po.status === 'PENDIENTE_ENTREGA' &&
                      po.productId === s.productId &&
                      po.locationId === s.locationId
                  );

                  return (
                    <tr key={s.id} className="hover:bg-amber-50/30">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{s.locationCode}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              isCrit
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                            }`}
                          >
                            {isCrit ? 'CRÍTICO' : 'BAJO MÍNIMO'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              isManual
                                ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {isManual ? 'RIESGO MANUAL' : 'ROTACIÓN'}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{s.productName}</div>
                        <div className="font-mono text-[10px] text-slate-500">
                          {s.sku} · Seg: {s.safetyMultiplier}×
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{supplier}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-700 font-bold">
                        <span className="inline-flex items-center gap-1">
                          {isCrit ? (
                            <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          )}
                          {s.currentStock} {s.unit}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 font-semibold">
                        {s.reorderPoint} {s.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 bg-emerald-50/60">
                        +{s.suggestedOrderQty} {s.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-bold text-slate-900">
                          {formatUsd(s.estimatedOrderCostUsd)}
                        </div>
                        <div className="text-[10px] text-sky-700">
                          {formatVes(s.estimatedOrderCostVes)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {pendingOrder ? (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-mono text-[10px] font-bold flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              PENDIENTE ({pendingOrder.orderNumber})
                            </span>
                            <button
                              type="button"
                              onClick={() => handleConfirmDelivery(pendingOrder.id)}
                              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] cursor-pointer"
                            >
                              Confirmar Entrega
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRedirectAlertToManualPurchase(s.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[11px] transition cursor-pointer"
                            title="Dirigir a la sección de Compras para simular rotación (7-60d) y realizar el cálculo manual del pedido"
                          >
                            <PackagePlus className="w-3.5 h-3.5" />
                            <span>Reponer en Compras (Cálculo Manual)</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 3: Purchase Orders to Suppliers (PENDIENTE_ENTREGA -> RECIBIDO_CONFORME) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-sky-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              3. Bandeja de Pedidos a Proveedores ({purchaseOrders.length} Registrados ·{' '}
              {pendingOrdersCount} Pendientes de Confirmar Entrega)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            La reposición cierra e impacta el inventario únicamente al confirmar la recepción física
          </span>
        </div>

        {purchaseOrders.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Aún no se han emitido órdenes de pedido a proveedores. Pulse{' '}
            <strong>&ldquo;Generar Pedido (Pendiente)&rdquo;</strong> en cualquier alerta superior
            para crear un pedido.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                  <th className="py-2.5 px-3">N° Pedido / Fecha</th>
                  <th className="py-2.5 px-3">Proveedor</th>
                  <th className="py-2.5 px-3">Sede / Depósito</th>
                  <th className="py-2.5 px-3">SKU / Producto</th>
                  <th className="py-2.5 px-3 text-right">Cant. Pedida</th>
                  <th className="py-2.5 px-3 text-right">Total USD / VES</th>
                  <th className="py-2.5 px-3 text-center">Estado del Pedido</th>
                  <th className="py-2.5 px-3 text-center">Confirmación de Entrega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {purchaseOrders.map((po) => {
                  const isPending = po.status === 'PENDIENTE_ENTREGA';
                  return (
                    <tr key={po.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono">
                        <div className="font-bold text-slate-900">{po.orderNumber}</div>
                        <div className="text-[10px] text-slate-400">
                          {po.createdAtVet.slice(0, 16).replace('T', ' ')}
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
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {po.orderedQty} {po.unit}
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
                        {isPending ? (
                          <button
                            type="button"
                            onClick={() => handleConfirmDelivery(po.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition shadow-xs cursor-pointer"
                          >
                            <ClipboardCheck className="w-3.5 h-3.5" />
                            <span>Confirmar Entrega y Cerrar Reposición</span>
                          </button>
                        ) : (
                          <span className="font-mono text-[10px] text-emerald-700 font-semibold">
                            Recibido ({po.receivedQty} {po.unit}) el{' '}
                            {po.receivedAtVet?.slice(0, 16).replace('T', ' ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 4: Manual Post-Order / Post-Purchase Product Reception (New or Existing Products) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <form
          onSubmit={handleManualPostPurchaseSubmit}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3 text-xs"
        >
          <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
            <PlusCircle className="w-4 h-4 text-emerald-600" />
            <span>4. Carga Manual de Productos que Llegan Post-Pedido / Compra</span>
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
              SKU Existente en Catálogo
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
                    [{loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 'Depósito' : 'Sede'}]{' '}
                    {loc.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ref. Pedido / Factura Compra
              </label>
              <input
                type="text"
                value={recOrderRef}
                onChange={(e) => setRecOrderRef(e.target.value)}
                placeholder="Ej. ORD-2026-0101"
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
                    placeholder="Ej. ATU-MAR-500G"
                    value={recSku}
                    onChange={(e) => setRecSku(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg font-mono uppercase font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Código Barras EAN-13
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
                  Nombre del Nuevo Producto Recibido *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Atún Lomito Institucional Margarita 500g"
                  value={recName}
                  onChange={(e) => setRecName(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Categoría</label>
                  <input
                    type="text"
                    value={recCategory}
                    onChange={(e) => setRecCategory(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unidad</label>
                  <select
                    value={recUnit}
                    onChange={(e) => setRecUnit(e.target.value as Product['unit'])}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="UND">UND</option>
                    <option value="KG">KG</option>
                    <option value="LT">LT</option>
                    <option value="CAJA">CAJA</option>
                    <option value="BULTO">BULTO</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">IVA</label>
                  <select
                    value={recIva}
                    onChange={(e) => setRecIva(Number(e.target.value) as 0 | 8 | 16)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value={0}>0% Exento</option>
                    <option value={8}>8% Red.</option>
                    <option value={16}>16% Gen.</option>
                  </select>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Seleccionar Producto Existente en Catálogo *
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
              <label className="block font-semibold text-slate-700 mb-1">
                Cant. Recibida *
              </label>
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
              <label className="block font-semibold text-slate-700 mb-1">
                Costo Unit ($) *
              </label>
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
              <label className="block font-semibold text-slate-700 mb-1">
                Punto Pedido
              </label>
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
            <span>Registrar Ingreso de Mercancía Recibida</span>
          </button>
        </form>

        {/* Manual Post-Purchase Receipts History */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Bitácora de Recepciones Manuales Post-Pedido / Compra ({manualReceipts.length})
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              Incorporación directa al Catálogo Maestro y Kardex
            </span>
          </div>

          {manualReceipts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Utilice el formulario izquierdo para cargar productos nuevos o existentes que llegan
              al almacén después de un pedido o compra.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                    <th className="py-2.5 px-3">Recepción / Ref.</th>
                    <th className="py-2.5 px-3">Tipo Ingreso</th>
                    <th className="py-2.5 px-3">SKU / Producto</th>
                    <th className="py-2.5 px-3">Sede / Depósito</th>
                    <th className="py-2.5 px-3 text-right">Cantidad</th>
                    <th className="py-2.5 px-3 text-right">Total Costo USD</th>
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
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                            rcp.isNewProduct
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-sky-100 text-sky-800 border border-sky-200'
                          }`}
                        >
                          {rcp.isNewProduct ? 'NUEVO SKU' : 'RECEPCIÓN SKU'}
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
    </div>
  );
};

export default PurchaseSuggestions;
