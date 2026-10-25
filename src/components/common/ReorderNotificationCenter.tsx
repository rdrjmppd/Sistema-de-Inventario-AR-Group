import React, { useState } from 'react';
import {
  BellRing,
  AlertTriangle,
  AlertOctagon,
  X,
  ShoppingCart,
  CheckCheck,
  Zap,
  PackagePlus,
  Building2,
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { NavigationTab } from '../../types';
import { formatUsd, formatVes, toDecimal, round2 } from '../../lib/decimal';

interface ReorderNotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: NavigationTab) => void;
}

export const ReorderNotificationCenter: React.FC<ReorderNotificationCenterProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const {
    reorderAlerts,
    liveToastAlerts,
    locations,
    dismissToastAlert,
    dismissAllToasts,
    markAllAlertsAsRead,
    triggerRealtimeStockDropDemo,
    setDraftPurchaseTarget,
  } = useInventory();

  const [locationFilter, setLocationFilter] = useState<string>('ALL');

  const filteredAlerts = reorderAlerts.filter(
    (a) => locationFilter === 'ALL' || a.locationId === locationFilter
  );

  const totalInvestmentUsd = round2(
    filteredAlerts.reduce((acc, a) => acc.plus(a.estimatedOrderCostUsd), toDecimal(0))
  );

  const criticalCount = reorderAlerts.filter(
    (a) => a.severity === 'CRITICO_QUIEBRE'
  ).length;

  return (
    <>
      {/* Real-Time Floating Alert Toasts (triggered on session start or live stock drop) */}
      {liveToastAlerts.length > 0 && !isOpen && (
        <div
          role="region"
          aria-label="Notificaciones de Punto de Pedido en Tiempo Real"
          className="fixed bottom-14 right-4 z-40 w-full max-w-md space-y-2.5 pointer-events-none px-2 sm:px-0"
        >
          <div className="bg-slate-900/95 backdrop-blur-xs border border-amber-500/60 text-white rounded-xl p-3.5 shadow-2xl pointer-events-auto">
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                </span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Alerta en Tiempo Real · Punto de Pedido ({reorderAlerts.length} SKUs)
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Nivel de inventario bajo el umbral mínimo calculado en sedes activas.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={dismissAllToasts}
                title="Ocultar avisos flotantes"
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-2.5 space-y-2 max-h-60 overflow-y-auto pr-1">
              {liveToastAlerts.map((alert) => {
                const isCrit = alert.severity === 'CRITICO_QUIEBRE';
                return (
                  <div
                    key={alert.id}
                    className={`p-2.5 rounded-lg border text-xs flex items-start justify-between gap-2.5 ${
                      isCrit
                        ? 'bg-rose-950/70 border-rose-500/50 text-rose-100'
                        : 'bg-slate-950/80 border-amber-500/40 text-slate-100'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                            isCrit
                              ? 'bg-rose-500/30 text-rose-200 border border-rose-400/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                          }`}
                        >
                          {alert.locationCode}
                        </span>
                        <span className="font-bold text-white">{alert.productName}</span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-300">
                        Stock Actual:{' '}
                        <strong className="text-amber-300">
                          {alert.currentStock} {alert.unit}
                        </strong>{' '}
                        | Punto Pedido: <strong>{alert.reorderPoint}</strong> | Pedir:{' '}
                        <strong className="text-emerald-400">
                          +{alert.suggestedOrderQty} {alert.unit}
                        </strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => dismissToastAlert(alert.id)}
                      className="text-slate-400 hover:text-white p-0.5 shrink-0"
                      title="Descartar alerta"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={dismissAllToasts}
                className="text-[11px] font-mono text-slate-400 hover:text-slate-200"
              >
                Posponer avisos
              </button>
              <button
                type="button"
                onClick={() => {
                  if (liveToastAlerts[0]) {
                    setDraftPurchaseTarget({
                      productId: liveToastAlerts[0].productId,
                      locationId: liveToastAlerts[0].locationId,
                      alertId: liveToastAlerts[0].id,
                      preferredHorizonDays: 30,
                    });
                  }
                  dismissAllToasts();
                  onNavigate('PURCHASE_ORDERS_CENTER');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Ir a Compras (Cálculo Manual)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Modal / Drawer for Real-Time Reorder Point Alert Center */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full shadow-2xl overflow-hidden text-slate-900">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 shrink-0">
                  <BellRing className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-bold whitespace-nowrap">
                      Centro de Alertas de Punto de Pedido en Tiempo Real
                    </h2>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                      {reorderAlerts.length} ACTIVAS
                    </span>
                    {criticalCount > 0 && (
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-rose-500/30 text-rose-200 border border-rose-500/40 whitespace-nowrap">
                        {criticalCount} CRÍTICAS
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                    Monitoreo continuo multi-sede (PZO-01, CCS-01, VAL-01) con cálculo de
                    reposición 1.5× stock de seguridad.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => triggerRealtimeStockDropDemo()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition whitespace-nowrap shrink-0"
                >
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                  <span>Simular Caída de Stock en Vivo</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter & Summary Bar */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-500" />
                <span className="font-semibold text-slate-700">Filtrar por Sede:</span>
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium"
                >
                  <option value="ALL">Todas las Sedes ({reorderAlerts.length})</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.code} — {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-slate-600">
                  Reposición Estimada:{' '}
                  <strong className="text-slate-900">{formatUsd(totalInvestmentUsd)}</strong>
                </span>
                <button
                  type="button"
                  onClick={markAllAlertsAsRead}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Marcar todas como leídas
                </button>
              </div>
            </div>

            {/* Alerts Table */}
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-slate-200 text-[11px] font-mono uppercase">
                    <th className="py-2.5 px-3">Severidad / Sede</th>
                    <th className="py-2.5 px-3">SKU / Producto</th>
                    <th className="py-2.5 px-3 text-right">Stock Actual</th>
                    <th className="py-2.5 px-3 text-right">Punto Pedido</th>
                    <th className="py-2.5 px-3 text-right">Déficit</th>
                    <th className="py-2.5 px-3 text-right">Orden Sugerida</th>
                    <th className="py-2.5 px-3 text-right">Costo Est. (USD / VES)</th>
                    <th className="py-2.5 px-3 text-center">Acción Rápida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredAlerts.map((alert) => {
                    const isCrit = alert.severity === 'CRITICO_QUIEBRE';
                    return (
                      <tr
                        key={alert.id}
                        className={isCrit ? 'bg-rose-50/40 hover:bg-rose-50/80' : 'hover:bg-slate-50'}
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            {isCrit ? (
                              <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            )}
                            <div>
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                                  isCrit
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}
                              >
                                {isCrit ? 'CRÍTICO' : 'PUNTO PEDIDO'}
                              </span>
                              <div className="font-mono text-[10px] font-bold text-slate-600 mt-0.5">
                                {alert.locationCode}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{alert.productName}</div>
                          <div className="font-mono text-[10px] text-slate-500">
                            {alert.sku} · Clase {alert.abcClass}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">
                          {alert.currentStock} {alert.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          {alert.reorderPoint} {alert.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-amber-800">
                          -{alert.deficitUnits} {alert.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800 bg-emerald-50/60">
                          +{alert.suggestedOrderQty} {alert.unit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          <div className="font-bold text-slate-900">
                            {formatUsd(alert.estimatedOrderCostUsd)}
                          </div>
                          <div className="text-[10px] text-sky-700">
                            {formatVes(alert.estimatedOrderCostVes)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setDraftPurchaseTarget({
                                productId: alert.productId,
                                locationId: alert.locationId,
                                alertId: alert.id,
                                preferredHorizonDays: 30,
                              });
                              onClose();
                              onNavigate('PURCHASE_ORDERS_CENTER');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[11px] transition cursor-pointer"
                            title="Dirigir a la sección de Compras para simular rotación (7-60d) y calcular pedido manualmente"
                          >
                            <PackagePlus className="w-3.5 h-3.5" />
                            Reponer en Compras
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-slate-900 text-white flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono">
                Monitoreo activo en cada venta POS, transferencia SADA e importación Chrystal®
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigate('PURCHASE_ORDERS_CENTER');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  Ir a Central de Compras (7-60d)
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReorderNotificationCenter;
