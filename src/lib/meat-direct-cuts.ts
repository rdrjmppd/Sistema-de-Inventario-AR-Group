/**
 * Motor Financiero de Compra de Cortes Directos Cárnicos (Pieza Final sin Desposte)
 * Soporta Costo Asignado Manual por SKU (sin forzar CPP automático), merma de escurrido,
 * comparador de rentabilidad frente a Canal/Desposte y enrutamiento a Nevera/Cava o Exhibición.
 * Exactitud Matemática: Decimal.js con ROUND_HALF_UP.
 * Copyright Oficial: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import {
  CreateMeatDirectCutPurchaseInput,
  MeatAnimalType,
  MeatCutCostComparison,
  MeatDirectCutLine,
  MeatDirectCutPurchase,
  MeatYieldBatch,
  Product,
  UserRole,
} from '../types';
import {
  calculateGrossMarginPercent,
  calculatePriceFromMargin,
  convertUsdToVes,
  round2,
  toDecimal,
} from './decimal';
import { getCaracasNow } from './bcv';

export function buildStandardDirectCutSku(
  animalType: MeatAnimalType,
  cutName: string
): string {
  const prefix =
    animalType === 'RES' ? 'RES' : animalType === 'CERDO' ? 'CER' : 'POL';
  const normalized = cutName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 14);
  return `CAR-${prefix}-${normalized || 'CORTE'}`;
}

/**
 * Compara el costo efectivo por Kg de un corte comprado directo contra el costo
 * asignado del mismo corte en el último lote de desposte por canal disponible.
 */
export function compareDirectVsCarcassCost(params: {
  cutName: string;
  animalType: MeatAnimalType;
  directEffectiveCostPerKgUsd: number;
  manualAssignedCostUsd: number;
  carcassBatches: MeatYieldBatch[];
}): MeatCutCostComparison | null {
  const {
    cutName,
    animalType,
    directEffectiveCostPerKgUsd,
    manualAssignedCostUsd,
    carcassBatches,
  } = params;

  const target = cutName.trim().toLowerCase();
  if (!target || !carcassBatches || carcassBatches.length === 0) {
    return null;
  }

  let matchedCarcassCost: number | null = null;

  for (const batch of carcassBatches) {
    if (batch.animalType !== animalType) continue;
    const foundCut = batch.cuts.find((c) => {
      const candidate = c.cutName.trim().toLowerCase();
      return (
        candidate === target ||
        candidate.includes(target) ||
        target.includes(candidate)
      );
    });
    if (foundCut && foundCut.allocatedCostPerKgUsd > 0) {
      matchedCarcassCost = round2(foundCut.allocatedCostPerKgUsd);
      break;
    }
  }

  if (matchedCarcassCost === null || matchedCarcassCost <= 0) {
    return null;
  }

  const directCost = round2(directEffectiveCostPerKgUsd);
  const deltaUsdPerKg = round2(toDecimal(directCost).minus(matchedCarcassCost));
  const deltaPercent = round2(
    toDecimal(deltaUsdPerKg).dividedBy(matchedCarcassCost).times(100)
  );

  let recommendation: MeatCutCostComparison['recommendation'] = 'PARIDAD_COSTO';
  if (deltaUsdPerKg < -0.05) {
    recommendation = 'CONVIENE_CORTE_DIRECTO';
  } else if (deltaUsdPerKg > 0.05) {
    recommendation = 'CONVIENE_CANAL_DESPOSTE';
  }

  return {
    cutName,
    animalType,
    directEffectiveCostPerKgUsd: directCost,
    manualAssignedCostUsd: round2(manualAssignedCostUsd),
    carcassAllocatedCostPerKgUsd: matchedCarcassCost,
    deltaUsdPerKg,
    deltaPercent,
    recommendation,
  };
}

/**
 * Calcula una compra de cortes directos (pieza lista para venta) con Costo Asignado Manual.
 * Regla de Negocio Confirmada: NO aplica Costo Promedio Ponderado automático; respeta el
 * manualAssignedCostUsd indicado por el usuario (o usa el costo efectivo real como valor inicial).
 */
export function calculateMeatDirectCutPurchase(params: {
  input: CreateMeatDirectCutPurchaseInput;
  bcvRate: number;
  locationName: string;
  actor: { uid: string; displayName: string; role: UserRole };
  carcassBatches?: MeatYieldBatch[];
}): MeatDirectCutPurchase {
  const { input, bcvRate, locationName, actor, carcassBatches = [] } = params;
  const safeRate = bcvRate > 0 ? bcvRate : 36.5;

  if (!input.lines || input.lines.length === 0) {
    throw new Error('Debe incluir al menos un corte directo en la recepción.');
  }

  let totalReceivedDec = toDecimal(0);
  let totalShrinkageDec = toDecimal(0);
  let totalNetSalableDec = toDecimal(0);
  let totalPurchaseCostDec = toDecimal(0);
  let totalProjectedRevDec = toDecimal(0);

  const calculatedLines: MeatDirectCutLine[] = input.lines.map((line, idx) => {
    const receivedKg = round2(line.receivedWeightKg);
    const shrinkageKg = round2(line.shrinkageKg ?? 0);

    if (receivedKg <= 0) {
      throw new Error(`El peso recibido de "${line.cutName}" debe ser mayor a 0 Kg.`);
    }
    if (shrinkageKg < 0 || shrinkageKg >= receivedKg) {
      throw new Error(
        `La merma de recepción de "${line.cutName}" (${shrinkageKg} Kg) debe ser menor al peso recibido (${receivedKg} Kg).`
      );
    }
    if (line.purchaseCostPerKgUsd <= 0) {
      throw new Error(`El costo de compra $/Kg de "${line.cutName}" debe ser mayor a 0.`);
    }

    const netSalableWeightKg = round2(toDecimal(receivedKg).minus(shrinkageKg));
    const purchaseCostPerKgUsd = round2(line.purchaseCostPerKgUsd);
    const lineInvoiceCostUsd = round2(toDecimal(receivedKg).times(purchaseCostPerKgUsd));
    const effectivePurchaseCostPerKgUsd = round2(
      toDecimal(lineInvoiceCostUsd).dividedBy(netSalableWeightKg)
    );

    // Costo asignado manual: respeta el valor explícito del usuario o pre-asigna el costo efectivo real
    const manualAssignedCostUsd =
      line.manualAssignedCostUsd !== undefined && line.manualAssignedCostUsd > 0
        ? round2(line.manualAssignedCostUsd)
        : effectivePurchaseCostPerKgUsd;

    const targetMarginPercent = round2(line.targetMarginPercent);
    const retailPriceUsdPerKg = calculatePriceFromMargin(
      manualAssignedCostUsd,
      targetMarginPercent
    );
    const retailPriceVesPerKg = convertUsdToVes(retailPriceUsdPerKg, safeRate);
    const projectedRevenueUsd = round2(
      toDecimal(netSalableWeightKg).times(retailPriceUsdPerKg)
    );

    const comparison = compareDirectVsCarcassCost({
      cutName: line.cutName,
      animalType: line.animalType,
      directEffectiveCostPerKgUsd: effectivePurchaseCostPerKgUsd,
      manualAssignedCostUsd,
      carcassBatches,
    });

    const carcassRef =
      line.carcassReferenceCostPerKgUsd !== undefined && line.carcassReferenceCostPerKgUsd > 0
        ? round2(line.carcassReferenceCostPerKgUsd)
        : comparison?.carcassAllocatedCostPerKgUsd;

    const costDeltaVsCarcassUsd =
      carcassRef !== undefined
        ? round2(toDecimal(effectivePurchaseCostPerKgUsd).minus(carcassRef))
        : undefined;

    totalReceivedDec = totalReceivedDec.plus(receivedKg);
    totalShrinkageDec = totalShrinkageDec.plus(shrinkageKg);
    totalNetSalableDec = totalNetSalableDec.plus(netSalableWeightKg);
    totalPurchaseCostDec = totalPurchaseCostDec.plus(lineInvoiceCostUsd);
    totalProjectedRevDec = totalProjectedRevDec.plus(projectedRevenueUsd);

    const sku =
      line.sku && line.sku.trim().length > 0
        ? line.sku.trim().toUpperCase()
        : buildStandardDirectCutSku(line.animalType, line.cutName);

    return {
      id: `dcut-${idx + 1}`,
      sku,
      cutName: line.cutName.trim(),
      animalType: line.animalType,
      tier: line.tier,
      receivedWeightKg: receivedKg,
      shrinkageKg,
      netSalableWeightKg,
      purchaseCostPerKgUsd,
      lineInvoiceCostUsd,
      effectivePurchaseCostPerKgUsd,
      manualAssignedCostUsd,
      targetMarginPercent,
      retailPriceUsdPerKg,
      retailPriceVesPerKg,
      projectedRevenueUsd,
      carcassReferenceCostPerKgUsd: carcassRef,
      costDeltaVsCarcassUsd,
    };
  });

  const totalReceivedWeightKg = round2(totalReceivedDec);
  const totalShrinkageKg = round2(totalShrinkageDec);
  const totalNetSalableWeightKg = round2(totalNetSalableDec);
  const totalPurchaseCostUsd = round2(totalPurchaseCostDec);
  const totalProjectedRevenueUsd = round2(totalProjectedRevDec);
  const projectedGrossProfitUsd = round2(
    toDecimal(totalProjectedRevenueUsd).minus(totalPurchaseCostUsd)
  );
  const projectedMarginPercent = calculateGrossMarginPercent(
    totalPurchaseCostUsd,
    totalProjectedRevenueUsd
  );

  const caracasNow = getCaracasNow();
  const trimmedCode = input.batchCode?.trim();
  const batchCode =
    trimmedCode && trimmedCode.length > 0
      ? trimmedCode.toUpperCase()
      : `CDIR-${caracasNow.dateFormatted.replace(/\//g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

  return {
    id: `direct-meat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    batchCode,
    invoiceOrGuideRef: input.invoiceOrGuideRef.trim() || batchCode,
    sadaGuide: input.sadaGuide?.trim() || undefined,
    receptionDate: input.receptionDate || caracasNow.dateFormatted,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    locationId: input.locationId,
    locationName,
    targetZone: input.targetZone || 'DEPOSITO',
    cavaOriginNote: input.cavaOriginNote?.trim() || undefined,
    lines: calculatedLines,
    totalReceivedWeightKg,
    totalShrinkageKg,
    totalNetSalableWeightKg,
    totalPurchaseCostUsd,
    totalProjectedRevenueUsd,
    projectedGrossProfitUsd,
    projectedMarginPercent,
    bcvRateAtPurchase: safeRate,
    inventoryLoaded: false,
    createdByUserId: actor.uid,
    createdByName: actor.displayName,
    createdByRole: actor.role,
    createdAtVet: `${caracasNow.dateFormatted} ${caracasNow.timeFormatted}`,
    status: 'REGISTRADO',
  };
}

/**
 * Aplica los cortes directos al catálogo maestro respetando:
 * 1) Costo Asignado Manual (sin sobre-escribir con promedio ponderado automático).
 * 2) Zona de destino:
 *    - 'DEPOSITO' (Nevera/Cava en sede o cava externa): incrementa stockByLocation; anaquel intacto.
 *    - 'ANAQUEL' (Directo a Exhibición/Vitrina): incrementa tanto stockByLocation como shelfStockByLocation.
 */
export function applyDirectCutPurchaseToCatalog(params: {
  purchase: MeatDirectCutPurchase;
  products: Product[];
  locationIds: string[];
  updatedAtVet: string;
}): {
  updatedProducts: Product[];
  createdProductsCount: number;
  updatedProductsCount: number;
} {
  const { purchase, products, locationIds, updatedAtVet } = params;
  const nextProducts: Product[] = products.map((p) => ({
    ...p,
    stockByLocation: { ...p.stockByLocation },
    minStockByLocation: { ...p.minStockByLocation },
    shelfStockByLocation: { ...(p.shelfStockByLocation || {}) },
    minShelfByLocation: { ...(p.minShelfByLocation || {}) },
  }));

  let createdProductsCount = 0;
  let updatedProductsCount = 0;

  const allLocIds = Array.from(
    new Set([...locationIds, purchase.locationId].filter(Boolean))
  );

  for (const line of purchase.lines) {
    const existingIdx = nextProducts.findIndex(
      (p) =>
        p.sku.toUpperCase() === line.sku.toUpperCase() ||
        p.name.trim().toLowerCase() === line.cutName.trim().toLowerCase()
    );

    if (existingIdx >= 0) {
      const existing = nextProducts[existingIdx];
      const prevTotal = round2(existing.stockByLocation[purchase.locationId] ?? 0);
      const prevShelf = Math.min(
        prevTotal,
        Math.max(0, round2(existing.shelfStockByLocation?.[purchase.locationId] ?? 0))
      );

      const newTotal = round2(toDecimal(prevTotal).plus(line.netSalableWeightKg));
      const newShelf =
        purchase.targetZone === 'ANAQUEL'
          ? Math.min(newTotal, round2(toDecimal(prevShelf).plus(line.netSalableWeightKg)))
          : prevShelf;

      nextProducts[existingIdx] = {
        ...existing,
        costUsd: round2(line.manualAssignedCostUsd),
        targetMarginPercent: round2(line.targetMarginPercent),
        priceUsd: round2(line.retailPriceUsdPerKg),
        supplierId: purchase.supplierId || existing.supplierId,
        lastCostOrigin: 'CORTE_DIRECTO',
        stockByLocation: {
          ...existing.stockByLocation,
          [purchase.locationId]: newTotal,
        },
        shelfStockByLocation: {
          ...(existing.shelfStockByLocation || {}),
          [purchase.locationId]: newShelf,
        },
        lastUpdatedVet: updatedAtVet,
      };
      updatedProductsCount += 1;
    } else {
      const stockMap: Record<string, number> = {};
      const minStockMap: Record<string, number> = {};
      const shelfMap: Record<string, number> = {};
      const minShelfMap: Record<string, number> = {};

      for (const locId of allLocIds) {
        const isTarget = locId === purchase.locationId;
        stockMap[locId] = isTarget ? round2(line.netSalableWeightKg) : 0;
        minStockMap[locId] = isTarget ? 15 : 5;
        shelfMap[locId] =
          isTarget && purchase.targetZone === 'ANAQUEL'
            ? round2(line.netSalableWeightKg)
            : 0;
        minShelfMap[locId] = isTarget ? 8 : 0;
      }

      const newProd: Product = {
        id: `prod-dcut-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        sku: line.sku,
        barcode: `759${Math.floor(1000000000 + Math.random() * 8999999999)}`,
        name: line.cutName,
        category: 'Carnicería',
        unit: 'KG',
        costUsd: round2(line.manualAssignedCostUsd),
        targetMarginPercent: round2(line.targetMarginPercent),
        priceUsd: round2(line.retailPriceUsdPerKg),
        ivaRate: 0,
        stockByLocation: stockMap,
        minStockByLocation: minStockMap,
        shelfStockByLocation: shelfMap,
        minShelfByLocation: minShelfMap,
        lastCostOrigin: 'CORTE_DIRECTO',
        monthlyUnitsSold: round2(toDecimal(line.netSalableWeightKg).times(2)),
        abcClass: line.tier === 'PRIMERA_ALTO_VALOR' ? 'A' : 'B',
        supplierId: purchase.supplierId || 'sup-01',
        lastUpdatedVet: updatedAtVet,
      };
      nextProducts.unshift(newProd);
      createdProductsCount += 1;
    }
  }

  return {
    updatedProducts: nextProducts,
    createdProductsCount,
    updatedProductsCount,
  };
}
