import {
  FefoPerishableLot,
  InternalProductionOrder,
  Product,
  ProductionRecipeBom,
  StorageZone,
  TotpSecurityConfig,
} from '../types';
import { calculatePriceFromMargin, convertUsdToVes, round2, toDecimal } from './decimal';
import { consumeLotsStrictFefo } from './fefo-coldchain';
import { round3 } from './scale-barcode';
import { applyStockDeltaToZone, getLocationStockBreakdown } from './shelf-stock';

/**
 * Ejecuta una Orden de Producción Interna (BOM) consumiendo insumos de Cava (DEPOSITO) o Exhibición (ANAQUEL),
 * priorizando automáticamente los lotes más próximos a vencer (FEFO), calculando el costo absorbido exacto
 * con Decimal.js y dando de alta el producto elaborado en la zona de destino.
 */
export function executeInternalProductionOrder(params: {
  recipe: ProductionRecipeBom;
  batchesMultiplier: number;
  actualOutputQty?: number;
  locationId: string;
  locationName: string;
  targetOutputZone: StorageZone;
  products: Product[];
  fefoLots: FefoPerishableLot[];
  bcvRate: number;
  executedBy: string;
  executedAtVet: string;
  referenceDateIso?: string;
  managerCredentialForExpired?: string;
  totpConfig?: TotpSecurityConfig | null;
}): {
  orderRecord: InternalProductionOrder;
  updatedProducts: Product[];
  updatedFefoLots: FefoPerishableLot[];
} {
  const mult = toDecimal(params.batchesMultiplier);
  if (mult.lte(0)) {
    throw new Error('El multiplicador de tandas de producción debe ser mayor a cero.');
  }
  if (!params.recipe.ingredients || params.recipe.ingredients.length === 0) {
    throw new Error('La receta no contiene ingredientes o materia prima configurada.');
  }

  const expectedOut = round3(toDecimal(params.recipe.expectedOutputQty).times(mult));
  const actualOut =
    params.actualOutputQty !== undefined && params.actualOutputQty > 0
      ? round3(params.actualOutputQty)
      : expectedOut;

  if (actualOut <= 0) {
    throw new Error('El rendimiento final obtenido debe ser mayor a cero.');
  }

  let workingProducts = [...params.products];
  let workingLots = [...params.fefoLots];
  const allConsumedLots: string[] = [];
  let rawMaterialsCostDec = toDecimal(0);

  for (const ing of params.recipe.ingredients) {
    const reqQty = round3(toDecimal(ing.quantityRequiredPerBatch).times(mult));
    if (reqQty <= 0) continue;

    const pIdx = workingProducts.findIndex(
      (p) => p.id === ing.productId || p.sku.toUpperCase() === ing.sku.toUpperCase()
    );
    if (pIdx < 0) {
      throw new Error(`Materia prima no encontrada en catálogo: ${ing.productName} (${ing.sku}).`);
    }

    const srcProduct = workingProducts[pIdx];
    const breakdown = getLocationStockBreakdown(srcProduct, params.locationId);
    if (toDecimal(breakdown.total).lt(reqQty)) {
      throw new Error(
        `Stock insuficiente de ${srcProduct.name} en ${params.locationName}: requiere ${reqQty} ${srcProduct.unit}, disponible total ${breakdown.total} ${srcProduct.unit} (Cava: ${breakdown.deposit}, Exhibición: ${breakdown.shelf}).`
      );
    }

    // 1. Consumir primero lotes FEFO (prioriza los más próximos a vencer; bloquea vencidos sin autorización)
    const fefoRes = consumeLotsStrictFefo({
      lots: workingLots,
      productId: srcProduct.id,
      locationId: params.locationId,
      preferredZone: ing.preferredSourceZone,
      quantityNeeded: reqQty,
      referenceDateIso: params.referenceDateIso,
      managerCredentialForExpired: params.managerCredentialForExpired,
      totpConfig: params.totpConfig,
    });
    workingLots = fefoRes.updatedLots;
    allConsumedLots.push(...fefoRes.consumedLotCodes);

    // 2. Descontar del inventario por capas respetando la zona preferida y complementando con la otra zona de la misma sede si hace falta
    const primaryZone: StorageZone = ing.preferredSourceZone || 'DEPOSITO';
    const secondaryZone: StorageZone = primaryZone === 'DEPOSITO' ? 'ANAQUEL' : 'DEPOSITO';
    const availPrimary = primaryZone === 'DEPOSITO' ? breakdown.deposit : breakdown.shelf;

    const takePrimary = Math.min(availPrimary, reqQty);
    const takeSecondary = round3(toDecimal(reqQty).minus(takePrimary));

    let nextProd = srcProduct;
    if (takePrimary > 0) {
      nextProd = applyStockDeltaToZone(
        nextProd,
        params.locationId,
        -takePrimary,
        primaryZone,
        params.executedAtVet
      );
    }
    if (takeSecondary > 0) {
      nextProd = applyStockDeltaToZone(
        nextProd,
        params.locationId,
        -takeSecondary,
        secondaryZone,
        params.executedAtVet
      );
    }
    workingProducts[pIdx] = nextProd;

    // 3. Acumular costo exacto de materia prima
    const ingCost = toDecimal(reqQty).times(srcProduct.costUsd);
    rawMaterialsCostDec = rawMaterialsCostDec.plus(ingCost);
  }

  const rawMaterialsCostUsd = round2(rawMaterialsCostDec);
  const packagingCostUsd = round2(
    toDecimal(params.recipe.packagingAndCondimentsCostUsd).times(mult)
  );
  const totalBatchCostUsd = round2(
    toDecimal(rawMaterialsCostUsd).plus(packagingCostUsd)
  );
  const unitElaboratedCostUsd = round2(
    toDecimal(totalBatchCostUsd).dividedBy(actualOut)
  );
  const suggestedPvpUsd = calculatePriceFromMargin(
    unitElaboratedCostUsd,
    params.recipe.targetMarginPercent
  );
  const suggestedPvpVes = convertUsdToVes(suggestedPvpUsd, params.bcvRate);

  // 4. Dar entrada al producto elaborado terminado en la zona destino
  const outIdx = workingProducts.findIndex(
    (p) =>
      (params.recipe.outputProductId && p.id === params.recipe.outputProductId) ||
      p.sku.toUpperCase() === params.recipe.outputSku.toUpperCase()
  );

  if (outIdx >= 0) {
    const existingOut = workingProducts[outIdx];
    const updatedOut = applyStockDeltaToZone(
      {
        ...existingOut,
        costUsd: unitElaboratedCostUsd,
        targetMarginPercent: params.recipe.targetMarginPercent,
        priceUsd: suggestedPvpUsd,
      },
      params.locationId,
      actualOut,
      params.targetOutputZone,
      params.executedAtVet
    );
    workingProducts[outIdx] = updatedOut;
  } else {
    const newId = params.recipe.outputProductId || `prod-bom-${Date.now()}`;
    const createdBase: Product = {
      id: newId,
      sku: params.recipe.outputSku.toUpperCase(),
      barcode: `75999${String(Date.now()).slice(-8)}`,
      name: params.recipe.outputProductName,
      category:
        params.recipe.department === 'FRUVER'
          ? 'Frutas y Verduras'
          : params.recipe.department === 'CHARCUTERIA'
          ? 'Charcutería y Elaborados'
          : 'Carnicería y Proteínas',
      unit: params.recipe.outputUnit,
      costUsd: unitElaboratedCostUsd,
      targetMarginPercent: params.recipe.targetMarginPercent,
      priceUsd: suggestedPvpUsd,
      ivaRate: 0,
      stockByLocation: { [params.locationId]: 0 },
      minStockByLocation: { [params.locationId]: 5 },
      shelfStockByLocation: { [params.locationId]: 0 },
      minShelfByLocation: { [params.locationId]: 3 },
      monthlyUnitsSold: 30,
      abcClass: 'A',
      supplierId: 'PRODUCCION_INTERNA',
      lastUpdatedVet: params.executedAtVet,
    };
    const stockedNew = applyStockDeltaToZone(
      createdBase,
      params.locationId,
      actualOut,
      params.targetOutputZone,
      params.executedAtVet
    );
    workingProducts = [stockedNew, ...workingProducts];
  }

  const orderRecord: InternalProductionOrder = {
    id: `ord-bom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    orderCode: `OP-${params.recipe.code}-${String(Date.now()).slice(-5)}`,
    recipeId: params.recipe.id,
    recipeName: params.recipe.name,
    locationId: params.locationId,
    locationName: params.locationName,
    targetOutputZone: params.targetOutputZone,
    batchesMultiplier: round2(mult),
    actualOutputQty: actualOut,
    rawMaterialsCostUsd,
    packagingCostUsd,
    totalBatchCostUsd,
    unitElaboratedCostUsd,
    suggestedPvpUsd,
    suggestedPvpVes,
    fefoLotsConsumed: Array.from(new Set(allConsumedLots)),
    executedBy: params.executedBy,
    executedAtVet: params.executedAtVet,
  };

  return {
    orderRecord,
    updatedProducts: workingProducts,
    updatedFefoLots: workingLots,
  };
}
