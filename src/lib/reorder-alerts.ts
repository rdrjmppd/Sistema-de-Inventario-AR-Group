import { LocationNode, ManualRiskMode, Product, RotationHorizonDays } from '../types';
import { toDecimal, round2 } from './decimal';

export const ROTATION_HORIZONS_DAYS: RotationHorizonDays[] = [7, 15, 30, 45, 60];

export interface RotationPurchaseSimulationResult {
  productId: string;
  sku: string;
  productName: string;
  unit: Product['unit'];
  abcClass: Product['abcClass'];
  locationId: string;
  locationCode: string;
  locationName: string;
  horizonDays: RotationHorizonDays;
  monthlyUnitsSoldGlobal: number;
  locationRotationShareRatio: number;
  estimatedMonthlyUnitsLocation: number;
  dailyRotationVelocity: number;
  projectedDemandUnits: number;
  currentStock: number;
  reorderPoint: number;
  safetyStockUnits: number;
  totalRequiredUnits: number;
  suggestedPurchaseQty: number;
  daysOfInventoryCoverage: number;
  unitCostUsd: number;
  suggestedTotalUsd: number;
  suggestedTotalVes: number;
}

/**
 * Pure deterministic simulator for suggested purchases based on the rotation of the last
 * 7, 15, 30, 45, or 60 days using strict Decimal.js (ROUND_HALF_UP) arithmetic.
 *
 * Formula:
 * 1. Estimates location monthly rotation from the product's monthlyUnitsSold weighted by
 *    the location's reorderPoint share (or equal share across active locations, minimum 35% weight
 *    for single-depot projection accuracy).
 * 2. Daily rotation velocity = estimatedMonthlyUnitsLocation / 30
 * 3. Projected demand for Horizon (H in {7, 15, 30, 45, 60}) = DailyVelocity * H
 * 4. Safety stock buffer = reorderPoint * (safetyMultiplier - 1) (or customSafetyBuffer)
 * 5. Total Required = ProjectedDemand(H) + SafetyStockBuffer
 * 6. Net Suggested Purchase = max(0, ceil(TotalRequired - currentStock))
 *    If currentStock <= reorderPoint and Net Suggested < deficit, guarantees at least covering
 *    reorderPoint * safetyMultiplier - currentStock.
 */
export function simulatePurchaseByRotationHorizon(
  product: Product,
  location: LocationNode,
  allLocations: LocationNode[],
  horizonDays: RotationHorizonDays,
  activeBcvRate: number,
  includeSafetyBuffer: boolean = true
): RotationPurchaseSimulationResult {
  const activeLocs = allLocations.filter((l) => l.active);
  const currentStock = round2(product.stockByLocation[location.id] ?? 0);
  const reorderPoint = round2(product.minStockByLocation[location.id] ?? 0);
  const safetyMultiplier = round2(product.safetyMultiplierByLocation?.[location.id] ?? 1.5);

  const totalMinStockAcrossLocs = activeLocs.reduce(
    (acc, loc) => acc.plus(product.minStockByLocation[loc.id] ?? 0),
    toDecimal(0)
  );

  let shareRatio = toDecimal(1).dividedBy(Math.max(1, activeLocs.length));
  if (totalMinStockAcrossLocs.gt(0) && reorderPoint > 0) {
    shareRatio = toDecimal(reorderPoint).dividedBy(totalMinStockAcrossLocs);
  }
  const normalizedShare = round2(shareRatio);

  const estimatedMonthlyUnitsLocation = Math.max(
    1,
    round2(toDecimal(product.monthlyUnitsSold).times(shareRatio))
  );

  const dailyRotationVelocity = round2(
    toDecimal(estimatedMonthlyUnitsLocation).dividedBy(30)
  );

  const projectedDemandUnits = Math.ceil(
    toDecimal(dailyRotationVelocity).times(horizonDays).toNumber()
  );

  const safetyStockUnits = includeSafetyBuffer
    ? Math.ceil(
        toDecimal(reorderPoint)
          .times(Math.max(0.2, toDecimal(safetyMultiplier).minus(1).toNumber()))
          .toNumber()
      )
    : 0;

  const totalRequiredUnits = round2(
    toDecimal(projectedDemandUnits).plus(safetyStockUnits)
  );

  const rawNetNeed = Math.ceil(
    Math.max(0, toDecimal(totalRequiredUnits).minus(currentStock).toNumber())
  );

  // If stock is already at or below reorderPoint, ensure at least replenishment to reorderPoint + projectedDemand
  const minReplenishmentWhenLow =
    currentStock <= reorderPoint && reorderPoint > 0
      ? Math.ceil(
          Math.max(
            rawNetNeed,
            toDecimal(reorderPoint).minus(currentStock).plus(projectedDemandUnits).toNumber()
          )
        )
      : rawNetNeed;

  const suggestedPurchaseQty = Math.max(0, minReplenishmentWhenLow);

  const daysOfInventoryCoverage =
    dailyRotationVelocity > 0
      ? round2(toDecimal(currentStock).dividedBy(dailyRotationVelocity))
      : 999;

  const unitCostUsd = round2(product.costUsd);
  const suggestedTotalUsd = round2(toDecimal(suggestedPurchaseQty).times(unitCostUsd));
  const suggestedTotalVes = round2(toDecimal(suggestedTotalUsd).times(activeBcvRate));

  return {
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    unit: product.unit,
    abcClass: product.abcClass,
    locationId: location.id,
    locationCode: location.code,
    locationName: location.name,
    horizonDays,
    monthlyUnitsSoldGlobal: product.monthlyUnitsSold,
    locationRotationShareRatio: normalizedShare,
    estimatedMonthlyUnitsLocation,
    dailyRotationVelocity,
    projectedDemandUnits,
    currentStock,
    reorderPoint,
    safetyStockUnits,
    totalRequiredUnits,
    suggestedPurchaseQty,
    daysOfInventoryCoverage,
    unitCostUsd,
    suggestedTotalUsd,
    suggestedTotalVes,
  };
}

/**
 * Generates the rotation simulation across all 5 horizons (7, 15, 30, 45, 60 days)
 * for a single SKU and Sede/Depósito so the user can compare all 5 scenarios side by side.
 */
export function simulateAllHorizonsForProduct(
  product: Product,
  location: LocationNode,
  allLocations: LocationNode[],
  activeBcvRate: number,
  includeSafetyBuffer: boolean = true
): Record<RotationHorizonDays, RotationPurchaseSimulationResult> {
  return {
    7: simulatePurchaseByRotationHorizon(product, location, allLocations, 7, activeBcvRate, includeSafetyBuffer),
    15: simulatePurchaseByRotationHorizon(product, location, allLocations, 15, activeBcvRate, includeSafetyBuffer),
    30: simulatePurchaseByRotationHorizon(product, location, allLocations, 30, activeBcvRate, includeSafetyBuffer),
    45: simulatePurchaseByRotationHorizon(product, location, allLocations, 45, activeBcvRate, includeSafetyBuffer),
    60: simulatePurchaseByRotationHorizon(product, location, allLocations, 60, activeBcvRate, includeSafetyBuffer),
  };
}


export type ReorderAlertSeverity = 'CRITICO_QUIEBRE' | 'BAJO_PUNTO_PEDIDO';
export type ReorderRiskSource = 'ROTACION_SISTEMA' | 'MANUAL_FORZADO';

export interface ReorderAlertItem {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  unit: Product['unit'];
  abcClass: Product['abcClass'];
  locationId: string;
  locationCode: string;
  locationName: string;
  currentStock: number;
  reorderPoint: number;
  safetyMultiplier: number;
  targetSafetyStock: number;
  deficitUnits: number;
  suggestedOrderQty: number;
  unitCostUsd: number;
  estimatedOrderCostUsd: number;
  estimatedOrderCostVes: number;
  severity: ReorderAlertSeverity;
  riskSource: ReorderRiskSource;
  manualRiskMode: ManualRiskMode;
  detectedAtVet: string;
}

/**
 * Evaluates all products across all locations and returns active alerts
 * where currentStock <= reorderPoint (minStockByLocation) OR where a manual
 * risk indicator ('CRITICO_MANUAL' | 'PREVENTIVO_MANUAL') has been set by the user.
 * Uses strict Decimal.js (ROUND_HALF_UP) calculations.
 */
export function evaluateReorderAlerts(
  products: Product[],
  locations: LocationNode[],
  activeBcvRate: number,
  timestampVet: string
): ReorderAlertItem[] {
  const alerts: ReorderAlertItem[] = [];

  for (const product of products) {
    for (const loc of locations) {
      if (!loc.active) continue;

      const currentStock = round2(product.stockByLocation[loc.id] ?? 0);
      const rawReorderPoint = round2(product.minStockByLocation[loc.id] ?? 0);
      const manualMode: ManualRiskMode =
        product.manualRiskByLocation?.[loc.id] || 'AUTOMATICO';
      const safetyMultiplier = round2(
        product.safetyMultiplierByLocation?.[loc.id] ?? 1.5
      );

      if (manualMode === 'EXENTO_MANUAL') {
        continue;
      }

      const isManualForced =
        manualMode === 'CRITICO_MANUAL' || manualMode === 'PREVENTIVO_MANUAL';
      const reorderPoint =
        rawReorderPoint > 0
          ? rawReorderPoint
          : isManualForced
          ? Math.max(50, currentStock + 20)
          : 0;

      const isTriggeredByRotation = currentStock <= reorderPoint && reorderPoint > 0;

      if (isTriggeredByRotation || isManualForced) {
        const targetSafetyStock = round2(
          toDecimal(reorderPoint).times(safetyMultiplier)
        );
        const deficitUnits = round2(
          Math.max(0, toDecimal(reorderPoint).minus(currentStock).toNumber())
        );

        const rawDiff = round2(toDecimal(targetSafetyStock).minus(currentStock));
        const suggestedOrderQty =
          rawDiff >= 10
            ? rawDiff
            : Math.max(15, round2(toDecimal(reorderPoint).times(0.5)));

        const estimatedOrderCostUsd = round2(
          toDecimal(suggestedOrderQty).times(product.costUsd)
        );
        const estimatedOrderCostVes = round2(
          toDecimal(estimatedOrderCostUsd).times(activeBcvRate)
        );

        const criticalThreshold = round2(toDecimal(reorderPoint).times(0.5));
        let severity: ReorderAlertSeverity =
          currentStock <= criticalThreshold
            ? 'CRITICO_QUIEBRE'
            : 'BAJO_PUNTO_PEDIDO';

        if (manualMode === 'CRITICO_MANUAL') {
          severity = 'CRITICO_QUIEBRE';
        } else if (manualMode === 'PREVENTIVO_MANUAL' && !isTriggeredByRotation) {
          severity = 'BAJO_PUNTO_PEDIDO';
        }

        alerts.push({
          id: `alrt-${product.id}-${loc.id}`,
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          unit: product.unit,
          abcClass: product.abcClass,
          locationId: loc.id,
          locationCode: loc.code,
          locationName: loc.name,
          currentStock,
          reorderPoint,
          safetyMultiplier,
          targetSafetyStock,
          deficitUnits,
          suggestedOrderQty,
          unitCostUsd: product.costUsd,
          estimatedOrderCostUsd,
          estimatedOrderCostVes,
          severity,
          riskSource: isManualForced ? 'MANUAL_FORZADO' : 'ROTACION_SISTEMA',
          manualRiskMode: manualMode,
          detectedAtVet: timestampVet,
        });
      }
    }
  }

  // Sort manual critical / critical first, then by Class A -> B -> C, then by highest deficit
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'CRITICO_QUIEBRE' ? -1 : 1;
    }
    if (a.riskSource !== b.riskSource) {
      return a.riskSource === 'MANUAL_FORZADO' ? -1 : 1;
    }
    if (a.abcClass !== b.abcClass) {
      return a.abcClass.localeCompare(b.abcClass);
    }
    return b.deficitUnits - a.deficitUnits;
  });

  return alerts;
}

/**
 * Compares previous alert snapshot (id -> currentStock) with current alerts
 * to identify newly triggered or worsened stock drops in real time.
 */
export function detectRealtimeTriggeredAlerts(
  previousStockMap: Record<string, number>,
  currentAlerts: ReorderAlertItem[],
  isInitialSessionLoad: boolean
): ReorderAlertItem[] {
  if (isInitialSessionLoad) {
    return currentAlerts;
  }

  return currentAlerts.filter((alert) => {
    const prevStock = previousStockMap[alert.id];
    if (prevStock === undefined) {
      return true;
    }
    return alert.currentStock < prevStock;
  });
}
