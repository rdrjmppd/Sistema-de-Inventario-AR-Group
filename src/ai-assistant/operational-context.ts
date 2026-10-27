/**
 * Live Operational Context Builder for Chrystal ERP AI Assistant
 * Extracts real-time ERP operational state to ground the Assistant in the current truth.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import { Product, LocationNode, BcvRateState, InventoryDiscardRecord, UserProfile } from '../types';
import { LiveErpOperationalContext } from './types';
import { toDecimal, round2, formatUsd, formatVes } from '../lib/decimal';

export function buildLiveErpOperationalContext(params: {
  user: UserProfile | null;
  products: Product[];
  locations: LocationNode[];
  bcvState: BcvRateState;
  discards?: InventoryDiscardRecord[];
}): LiveErpOperationalContext {
  const { user, products = [], locations = [], bcvState, discards = [] } = params;

  const safeRate = bcvState?.activeRate && bcvState.activeRate > 0 ? bcvState.activeRate : 36.5;

  let totalUnitsAllDec = toDecimal(0);
  let totalValuationCostUsdDec = toDecimal(0);
  let totalValuationRetailUsdDec = toDecimal(0);
  let weightedMarginSumDec = toDecimal(0);

  const criticalStockoutSkus: LiveErpOperationalContext['criticalStockoutSkus'] = [];

  for (const p of products) {
    let skuTotalStockDec = toDecimal(0);
    let skuMinStockTotalDec = toDecimal(0);

    for (const loc of locations) {
      const locStock = p.stockByLocation?.[loc.id] ?? 0;
      const locMin = p.minStockByLocation?.[loc.id] ?? 0;
      skuTotalStockDec = skuTotalStockDec.plus(locStock);
      skuMinStockTotalDec = skuMinStockTotalDec.plus(locMin);
    }

    const currentStockNum = round2(skuTotalStockDec);
    const minStockNum = round2(skuMinStockTotalDec);

    totalUnitsAllDec = totalUnitsAllDec.plus(currentStockNum);
    const costTotal = toDecimal(currentStockNum).times(p.costUsd || 0);
    const retailTotal = toDecimal(currentStockNum).times(p.priceUsd || 0);

    totalValuationCostUsdDec = totalValuationCostUsdDec.plus(costTotal);
    totalValuationRetailUsdDec = totalValuationRetailUsdDec.plus(retailTotal);
    weightedMarginSumDec = weightedMarginSumDec.plus(
      toDecimal(p.targetMarginPercent || 0).times(currentStockNum)
    );

    if (minStockNum > 0 && currentStockNum <= minStockNum) {
      criticalStockoutSkus.push({
        sku: p.sku,
        name: p.name,
        currentStock: currentStockNum,
        minStock: minStockNum,
        deficit: round2(toDecimal(minStockNum).minus(currentStockNum)),
      });
    }
  }

  const totalUnitsAll = round2(totalUnitsAllDec);
  const totalValuationCostUsd = round2(totalValuationCostUsdDec);
  const totalValuationRetailUsd = round2(totalValuationRetailUsdDec);
  const totalValuationRetailVes = round2(toDecimal(totalValuationRetailUsd).times(safeRate));
  const weightedGrossMarginPercent =
    totalUnitsAll > 0 ? round2(weightedMarginSumDec.dividedBy(totalUnitsAll)) : 0;

  // Pending discards awaiting Manager signature
  const pendingDiscards = discards.filter((d) => d.status === 'PENDIENTE_AUTORIZACION');
  const pendingDiscardsTotalUsd = round2(
    pendingDiscards.reduce(
      (acc, d) =>
        acc.plus(
          toDecimal((d as any).totalCostUsd ?? (d as any).totalLossCostUsd ?? 0)
        ),
      toDecimal(0)
    )
  );

  const pendingDiscardsSummary = pendingDiscards.slice(0, 10).map((d) => ({
    referenceCode: d.referenceCode,
    sku: d.sku,
    productName: d.productName,
    locationName: d.locationName,
    quantity: (d as any).quantityDiscarded ?? (d as any).quantity ?? 0,
    lossUsd: (d as any).totalCostUsd ?? (d as any).totalLossCostUsd ?? 0,
    reason: d.reason,
  }));

  const locationsList = locations.map((l) => ({
    code: l.code,
    name: l.name,
    type: l.type,
    city: l.city,
  }));

  const topRotationSkus = [...products]
    .sort((a, b) => (b.monthlyUnitsSold || 0) - (a.monthlyUnitsSold || 0))
    .slice(0, 5)
    .map((p) => ({
      sku: p.sku,
      name: p.name,
      monthlyUnitsSold: p.monthlyUnitsSold || 0,
      abcClass: p.abcClass,
      category: p.category,
    }));

  return {
    activeUser: {
      uid: user?.uid || 'anon',
      displayName: user?.displayName || 'Usuario Operativo',
      email: user?.email || 'operador@hiperabastopolar.com',
      role: user?.role || ('ANALISTA' as any),
    },
    bcvState: {
      activeRate: safeRate,
      spotRateToday: bcvState?.spotRateToday || safeRate,
      nextDayRateAfter5Pm: bcvState?.nextDayRateAfter5Pm || safeRate,
      isAfter5PmVet: Boolean(bcvState?.isAfter5PmVet),
      rateSourceLabel: bcvState?.rateSourceLabel || 'BCV OFICIAL',
      caracasTimeFormatted: bcvState?.caracasTimeFormatted || '12:00:00',
      caracasDateFormatted: bcvState?.caracasDateFormatted || '26/10/2026',
    },
    metrics: {
      totalSkus: products.length,
      totalLocations: locations.length,
      totalUnitsAll,
      totalValuationCostUsd,
      totalValuationRetailUsd,
      totalValuationRetailVes,
      weightedGrossMarginPercent,
      atRiskSkusCount: criticalStockoutSkus.length,
      pendingDiscardsCount: pendingDiscards.length,
      pendingDiscardsTotalUsd,
    },
    criticalStockoutSkus,
    pendingDiscardsSummary,
    locationsList,
    topRotationSkus,
  };
}

export function formatLiveContextForPrompt(ctx: LiveErpOperationalContext): string {
  const stockoutText =
    ctx.criticalStockoutSkus.length > 0
      ? ctx.criticalStockoutSkus
          .slice(0, 8)
          .map(
            (s) =>
              `- [${s.sku}] ${s.name}: Stock Actual ${s.currentStock} und / Mínimo ${s.minStock} und (Déficit: ${s.deficit})`
          )
          .join('\n')
      : 'No hay productos en riesgo crítico de quiebre en este momento.';

  const discardsText =
    ctx.pendingDiscardsSummary.length > 0
      ? ctx.pendingDiscardsSummary
          .map(
            (d) =>
              `- Solicitud ${d.referenceCode}: ${d.quantity} und de ${d.productName} (${d.sku}) en ${d.locationName}. Pérdida: ${formatUsd(d.lossUsd)}. Motivo: ${d.reason}.`
          )
          .join('\n')
      : 'No hay solicitudes de baja pendientes por autorizar.';

  const rotationText =
    ctx.topRotationSkus && ctx.topRotationSkus.length > 0
      ? ctx.topRotationSkus
          .map(
            (r, i) =>
              `${i + 1}. [${r.sku}] ${r.name} (${r.category}) — ${r.monthlyUnitsSold} und/mes (Clase ${r.abcClass})`
          )
          .join('\n')
      : 'Sin datos históricos de rotación.';

  return `
ESTADO OPERATIVO EN VIVO DEL ERP (FUENTE DE VERDAD EN TIEMPO REAL):
- Usuario Activo en Sesión: ${ctx.activeUser.displayName} (${ctx.activeUser.email}) — Rol RBAC: ${ctx.activeUser.role}
- Fecha y Hora Legal VET: ${ctx.bcvState.caracasDateFormatted} ${ctx.bcvState.caracasTimeFormatted}
- Tasa Oficial BCV Activa: Bs. ${ctx.bcvState.activeRate.toFixed(4)} / USD (${ctx.bcvState.rateSourceLabel})
- Horario BCV: ${ctx.bcvState.isAfter5PmVet ? 'Posterior a 17:00 VET (Tasa del Día Siguiente)' : 'Horario Diurno Regular'}
- Resumen de Inventario:
  * Total SKUs Activos: ${ctx.metrics.totalSkus}
  * Total Sedes y Depósitos en Red: ${ctx.metrics.totalLocations}
  * Existencias Físicas Totales: ${ctx.metrics.totalUnitsAll} unidades
  * Valorización al Costo: ${formatUsd(ctx.metrics.totalValuationCostUsd)}
  * Valorización a Precio de Venta: ${formatUsd(ctx.metrics.totalValuationRetailUsd)} (Bs. ${formatVes(ctx.metrics.totalValuationRetailVes)})
  * Margen Bruto Promedio: ${ctx.metrics.weightedGrossMarginPercent}%
  * SKUs en Alarma Crítica de Quiebre: ${ctx.metrics.atRiskSkusCount}
- Top Productos de Mayor Rotación (Demanda Mensual):
${rotationText}
- Detalle de SKUs en Riesgo Crítico:
${stockoutText}
- Solicitudes de Bajas / Mermas Pendientes por Firma Gerencial (${ctx.metrics.pendingDiscardsCount} solicitudes — Total: ${formatUsd(ctx.metrics.pendingDiscardsTotalUsd)}):
${discardsText}
- Red Logística de Sedes: ${ctx.locationsList.map((l) => `${l.name} [${l.code}] (${l.type} - ${l.city})`).join(', ')}
`;
}
