/**
 * Motor de Control Sincerado de Inventario: Depósito / Cava ↔ Anaquel / Exhibición
 * Arquitectura Cero Colisiones:
 *   - Product.stockByLocation[locId] = TOTAL físico de la sede.
 *   - Product.shelfStockByLocation[locId] = Existencia en Exhibición / Anaquel (0 <= anaquel <= total).
 *   - Depósito / Nevera / Cava = TOTAL - ANAQUEL (derivado exacto sin desincronización).
 * Exactitud Matemática: Decimal.js con ROUND_HALF_UP.
 * Copyright Oficial: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import {
  LocationStockBreakdown,
  PhysicalCountReconciliationInput,
  PhysicalCountReconciliationResult,
  Product,
  ShelfMovementRecord,
  ShelfReplenishmentSuggestion,
  StorageZone,
  UserRole,
  TotpSecurityConfig,
} from '../types';
import { Decimal, round2, toDecimal } from './decimal';
import { verifyManagerGovernanceAuth } from './totp-governance';

export const DEFAULT_MANAGER_AUTHORIZATION_PINS = ['102030', '203040'];

/**
 * Desglosa de forma determinista el stock de un producto en una sede en:
 * Total, Anaquel/Exhibición y Depósito/Cava, garantizando el invariante 0 <= shelf <= total.
 */
export function getLocationStockBreakdown(
  product: Pick<Product, 'stockByLocation' | 'shelfStockByLocation' | 'minShelfByLocation'>,
  locationId: string
): LocationStockBreakdown {
  const rawTotal = round2(product.stockByLocation?.[locationId] ?? 0);
  const total = Math.max(0, rawTotal);

  const rawShelf = round2(product.shelfStockByLocation?.[locationId] ?? 0);
  const shelf = Math.min(total, Math.max(0, rawShelf));

  const deposit = Math.max(0, round2(toDecimal(total).minus(shelf)));
  const minShelf = Math.max(0, round2(product.minShelfByLocation?.[locationId] ?? 0));

  const isShelfLow = minShelf > 0 ? shelf < minShelf : total > 0 && shelf === 0;
  const shelfCoveragePercent =
    minShelf > 0
      ? round2(toDecimal(shelf).dividedBy(minShelf).times(100))
      : total > 0 && shelf === 0
      ? 0
      : 100;

  return {
    locationId,
    total,
    shelf,
    deposit,
    minShelf,
    isShelfLow,
    shelfCoveragePercent,
  };
}

/**
 * Aplica una entrada o ajuste al stock de una sede indicando la zona de destino:
 * - 'DEPOSITO': suma al total dejando intacto el anaquel (aumenta el depósito/cava).
 * - 'ANAQUEL': suma tanto al total como al anaquel (ingreso directo a exhibición).
 */
export function applyStockDeltaToZone(
  product: Product,
  locationId: string,
  deltaQty: number,
  zone: StorageZone = 'DEPOSITO',
  updatedAtVet?: string
): Product {
  const breakdown = getLocationStockBreakdown(product, locationId);
  const delta = round2(deltaQty);
  const newTotal = Math.max(0, round2(toDecimal(breakdown.total).plus(delta)));

  let newShelf = breakdown.shelf;
  if (zone === 'ANAQUEL') {
    newShelf = Math.min(newTotal, Math.max(0, round2(toDecimal(breakdown.shelf).plus(delta))));
  } else {
    newShelf = Math.min(newTotal, breakdown.shelf);
  }

  return {
    ...product,
    stockByLocation: {
      ...product.stockByLocation,
      [locationId]: newTotal,
    },
    shelfStockByLocation: {
      ...(product.shelfStockByLocation || {}),
      [locationId]: newShelf,
    },
    lastUpdatedVet: updatedAtVet || product.lastUpdatedVet,
  };
}

/**
 * Reposición interna: Depósito / Cava -> Anaquel / Exhibición en la misma sede.
 * El stock total de la sede permanece idéntico; cambia la ubicación interna.
 */
export function replenishShelfFromDeposit(params: {
  product: Product;
  locationId: string;
  locationName: string;
  quantity: number;
  actor: { uid: string; displayName: string; role: UserRole };
  notes?: string;
  timestampVet: string;
}): { updatedProduct: Product; movement: ShelfMovementRecord } {
  const { product, locationId, locationName, quantity, actor, notes, timestampVet } = params;
  const qty = round2(quantity);

  if (qty <= 0) {
    throw new Error('La cantidad a reponer en anaquel debe ser mayor a cero.');
  }

  const before = getLocationStockBreakdown(product, locationId);
  if (qty > before.deposit) {
    throw new Error(
      `Existencia insuficiente en Depósito/Cava (${before.deposit} ${product.unit} disponibles para pasar a exhibición).`
    );
  }

  const shelfAfter = round2(toDecimal(before.shelf).plus(qty));
  const depositAfter = round2(toDecimal(before.total).minus(shelfAfter));

  const updatedProduct: Product = {
    ...product,
    shelfStockByLocation: {
      ...(product.shelfStockByLocation || {}),
      [locationId]: shelfAfter,
    },
    lastUpdatedVet: timestampVet,
  };

  const movement: ShelfMovementRecord = {
    id: `shf-mov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    referenceCode: `REP-${Date.now().toString().slice(-6)}`,
    movementType: 'REPLENISH_TO_SHELF',
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    unit: product.unit,
    fromLocationId: locationId,
    fromLocationName: locationName,
    fromZone: 'DEPOSITO',
    toLocationId: locationId,
    toLocationName: locationName,
    toZone: 'ANAQUEL',
    quantity: qty,
    shelfBefore: before.shelf,
    shelfAfter,
    depositBefore: before.deposit,
    depositAfter,
    totalAfter: before.total,
    notes: notes?.trim() || 'Reposición interna Depósito → Anaquel',
    performedByUserId: actor.uid,
    performedByName: actor.displayName,
    performedByRole: actor.role,
    timestampVet,
  };

  return { updatedProduct, movement };
}

/**
 * Retorno interno: Anaquel / Exhibición -> Depósito / Nevera / Cava en la misma sede.
 */
export function returnShelfToDeposit(params: {
  product: Product;
  locationId: string;
  locationName: string;
  quantity: number;
  actor: { uid: string; displayName: string; role: UserRole };
  notes?: string;
  timestampVet: string;
}): { updatedProduct: Product; movement: ShelfMovementRecord } {
  const { product, locationId, locationName, quantity, actor, notes, timestampVet } = params;
  const qty = round2(quantity);

  if (qty <= 0) {
    throw new Error('La cantidad a retornar a depósito/cava debe ser mayor a cero.');
  }

  const before = getLocationStockBreakdown(product, locationId);
  if (qty > before.shelf) {
    throw new Error(
      `Existencia insuficiente en Anaquel/Exhibición (${before.shelf} ${product.unit} disponibles).`
    );
  }

  const shelfAfter = round2(toDecimal(before.shelf).minus(qty));
  const depositAfter = round2(toDecimal(before.total).minus(shelfAfter));

  const updatedProduct: Product = {
    ...product,
    shelfStockByLocation: {
      ...(product.shelfStockByLocation || {}),
      [locationId]: shelfAfter,
    },
    lastUpdatedVet: timestampVet,
  };

  const movement: ShelfMovementRecord = {
    id: `shf-mov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    referenceCode: `RET-${Date.now().toString().slice(-6)}`,
    movementType: 'RETURN_TO_DEPOSIT',
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    unit: product.unit,
    fromLocationId: locationId,
    fromLocationName: locationName,
    fromZone: 'ANAQUEL',
    toLocationId: locationId,
    toLocationName: locationName,
    toZone: 'DEPOSITO',
    quantity: qty,
    shelfBefore: before.shelf,
    shelfAfter,
    depositBefore: before.deposit,
    depositAfter,
    totalAfter: before.total,
    notes: notes?.trim() || 'Retorno interno Anaquel → Depósito/Cava',
    performedByUserId: actor.uid,
    performedByName: actor.displayName,
    performedByRole: actor.role,
    timestampVet,
  };

  return { updatedProduct, movement };
}

/**
 * Traslado con conciencia de zona e inter-sede:
 * Soporta específicamente el caso cárnico: Nevera/Cava en Sede A (DEPOSITO) -> Exhibición en Sede B (ANAQUEL),
 * así como Depósito A -> Depósito B, Anaquel A -> Exhibición B, etc.
 */
export function transferStockBetweenZonesAndLocations(params: {
  product: Product;
  fromLocationId: string;
  fromLocationName: string;
  fromZone: StorageZone;
  toLocationId: string;
  toLocationName: string;
  toZone: StorageZone;
  quantity: number;
  actor: { uid: string; displayName: string; role: UserRole };
  notes?: string;
  timestampVet: string;
}): { updatedProduct: Product; movement: ShelfMovementRecord } {
  const {
    product,
    fromLocationId,
    fromLocationName,
    fromZone,
    toLocationId,
    toLocationName,
    toZone,
    quantity,
    actor,
    notes,
    timestampVet,
  } = params;

  const qty = round2(quantity);
  if (qty <= 0) {
    throw new Error('La cantidad a trasladar debe ser mayor a cero.');
  }

  if (fromLocationId === toLocationId && fromZone === toZone) {
    throw new Error('El origen y el destino tienen la misma sede y zona.');
  }

  if (fromLocationId === toLocationId) {
    return fromZone === 'DEPOSITO'
      ? replenishShelfFromDeposit({
          product,
          locationId: fromLocationId,
          locationName: fromLocationName,
          quantity: qty,
          actor,
          notes,
          timestampVet,
        })
      : returnShelfToDeposit({
          product,
          locationId: fromLocationId,
          locationName: fromLocationName,
          quantity: qty,
          actor,
          notes,
          timestampVet,
        });
  }

  const originBefore = getLocationStockBreakdown(product, fromLocationId);
  const destBefore = getLocationStockBreakdown(product, toLocationId);

  const availableInOriginZone =
    fromZone === 'DEPOSITO' ? originBefore.deposit : originBefore.shelf;

  if (qty > availableInOriginZone) {
    const zoneLabel = fromZone === 'DEPOSITO' ? 'Depósito/Cava' : 'Anaquel/Exhibición';
    throw new Error(
      `Stock insuficiente en ${zoneLabel} de ${fromLocationName} (${availableInOriginZone} ${product.unit} disponibles).`
    );
  }

  const originTotalAfter = round2(toDecimal(originBefore.total).minus(qty));
  const originShelfAfter =
    fromZone === 'ANAQUEL'
      ? Math.max(0, round2(toDecimal(originBefore.shelf).minus(qty)))
      : Math.min(originTotalAfter, originBefore.shelf);

  const destTotalAfter = round2(toDecimal(destBefore.total).plus(qty));
  const destShelfAfter =
    toZone === 'ANAQUEL'
      ? Math.min(destTotalAfter, round2(toDecimal(destBefore.shelf).plus(qty)))
      : destBefore.shelf;

  const destDepositAfter = round2(toDecimal(destTotalAfter).minus(destShelfAfter));

  const updatedProduct: Product = {
    ...product,
    stockByLocation: {
      ...product.stockByLocation,
      [fromLocationId]: originTotalAfter,
      [toLocationId]: destTotalAfter,
    },
    shelfStockByLocation: {
      ...(product.shelfStockByLocation || {}),
      [fromLocationId]: originShelfAfter,
      [toLocationId]: destShelfAfter,
    },
    lastUpdatedVet: timestampVet,
  };

  const movement: ShelfMovementRecord = {
    id: `shf-mov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    referenceCode: `CAV-${Date.now().toString().slice(-6)}`,
    movementType: 'CAVA_TO_EXHIBICION',
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    unit: product.unit,
    fromLocationId,
    fromLocationName,
    fromZone,
    toLocationId,
    toLocationName,
    toZone,
    quantity: qty,
    shelfBefore: destBefore.shelf,
    shelfAfter: destShelfAfter,
    depositBefore: destBefore.deposit,
    depositAfter: destDepositAfter,
    totalAfter: destTotalAfter,
    notes:
      notes?.trim() ||
      `Traslado ${fromLocationName} (${fromZone}) → ${toLocationName} (${toZone})`,
    performedByUserId: actor.uid,
    performedByName: actor.displayName,
    performedByRole: actor.role,
    timestampVet,
  };

  return { updatedProduct, movement };
}

/**
 * Descuento por Venta POS:
 * Regla Confirmada #4: Descuenta primero de Anaquel/Exhibición. Si no alcanza,
 * descuenta la diferencia del Depósito y genera alerta de faltante en anaquel.
 */
export function deductPosSaleShelfFirst(params: {
  product: Product;
  locationId: string;
  qtySold: number;
  updatedAtVet: string;
}): {
  updatedProduct: Product;
  deductedFromShelf: number;
  deductedFromDeposit: number;
  hadShelfShortfall: boolean;
} {
  const { product, locationId, qtySold, updatedAtVet } = params;
  const qty = round2(qtySold);

  if (qty <= 0) {
    throw new Error('La cantidad vendida en POS debe ser mayor a cero.');
  }

  const before = getLocationStockBreakdown(product, locationId);
  if (qty > before.total) {
    throw new Error(
      `Stock total insuficiente para ${product.sku} en sede (${before.total} disponibles, solicitado ${qty}).`
    );
  }

  const deductedFromShelf = round2(Decimal.min(before.shelf, qty));
  const deductedFromDeposit = round2(toDecimal(qty).minus(deductedFromShelf));
  const hadShelfShortfall = deductedFromDeposit > 0;

  const newTotal = round2(toDecimal(before.total).minus(qty));
  const newShelf = round2(toDecimal(before.shelf).minus(deductedFromShelf));

  const updatedProduct: Product = {
    ...product,
    stockByLocation: {
      ...product.stockByLocation,
      [locationId]: newTotal,
    },
    shelfStockByLocation: {
      ...(product.shelfStockByLocation || {}),
      [locationId]: newShelf,
    },
    lastUpdatedVet: updatedAtVet,
  };

  return {
    updatedProduct,
    deductedFromShelf,
    deductedFromDeposit,
    hadShelfShortfall,
  };
}

/**
 * Evalúa la tolerancia de conteo físico (Regla Confirmada #6):
 * Diferencias de hasta ±2% o ±1 unidad se ajustan sin PIN; por encima exigen PIN de gerente.
 */
export function evaluatePhysicalCountTolerance(params: {
  systemDeposit: number;
  systemShelf: number;
  countedDeposit: number;
  countedShelf: number;
}): {
  requiresManagerPin: boolean;
  systemTotal: number;
  countedTotal: number;
  depositDiff: number;
  shelfDiff: number;
  totalDiff: number;
  relativeDiffPercent: number;
} {
  const sysDep = round2(params.systemDeposit);
  const sysShf = round2(params.systemShelf);
  const cntDep = round2(params.countedDeposit);
  const cntShf = round2(params.countedShelf);

  const systemTotal = round2(toDecimal(sysDep).plus(sysShf));
  const countedTotal = round2(toDecimal(cntDep).plus(cntShf));

  const depositDiff = round2(toDecimal(cntDep).minus(sysDep));
  const shelfDiff = round2(toDecimal(cntShf).minus(sysShf));
  const totalDiff = round2(toDecimal(countedTotal).minus(systemTotal));

  const absTotalDiff = Math.abs(totalDiff);
  const relativeDiffPercent =
    systemTotal > 0
      ? round2(toDecimal(absTotalDiff).dividedBy(systemTotal).times(100))
      : absTotalDiff === 0
      ? 0
      : 100;

  // Dentro de tolerancia si |totalDiff| <= 1 unidad O |totalDiff| / systemTotal <= 2%
  const withinTolerance = absTotalDiff <= 1 || relativeDiffPercent <= 2;

  return {
    requiresManagerPin: !withinTolerance,
    systemTotal,
    countedTotal,
    depositDiff,
    shelfDiff,
    totalDiff,
    relativeDiffPercent,
  };
}

/**
 * Ejecuta la sinceración física de Depósito y Anaquel aplicando validación de PIN Gerencial
 * cuando la desviación supera ±2% y ±1 unidad.
 */
export function reconcileLocationPhysicalCount(params: {
  product: Product;
  locationName: string;
  input: PhysicalCountReconciliationInput;
  actor: { uid: string; displayName: string; role: UserRole; pin?: string };
  validManagerPins?: string[];
  totpConfig?: TotpSecurityConfig | null;
  timestampVet: string;
}): PhysicalCountReconciliationResult {
  const {
    product,
    locationName,
    input,
    actor,
    validManagerPins = DEFAULT_MANAGER_AUTHORIZATION_PINS,
    totpConfig,
    timestampVet,
  } = params;

  const countedDeposit = round2(input.countedDepositQty);
  const countedShelf = round2(input.countedShelfQty);

  if (countedDeposit < 0 || countedShelf < 0) {
    throw new Error('Las cantidades contadas en Depósito y Anaquel no pueden ser negativas.');
  }
  if (!input.notes || input.notes.trim().length < 3) {
    throw new Error('Debe indicar una nota o acta breve para la sinceración de inventario.');
  }

  const before = getLocationStockBreakdown(product, input.locationId);
  const tolerance = evaluatePhysicalCountTolerance({
    systemDeposit: before.deposit,
    systemShelf: before.shelf,
    countedDeposit,
    countedShelf,
  });

  let pinAuthorizedBy: string | undefined;

  if (tolerance.requiresManagerPin) {
    const allowedPins = new Set<string>(validManagerPins);
    if (
      (actor.role === UserRole.SUPERADMIN || actor.role === UserRole.GERENTE) &&
      actor.pin
    ) {
      allowedPins.add(actor.pin);
    }

    const suppliedPin = (input.managerPin || '').trim();
    const totpCheck = verifyManagerGovernanceAuth({
      submittedCredential: suppliedPin,
      totpConfig,
      validFallbackPins: Array.from(allowedPins),
    });
    if (!suppliedPin || !totpCheck.authorized) {
      throw new Error(
        `La diferencia de conteo (${tolerance.totalDiff > 0 ? '+' : ''}${tolerance.totalDiff} ${product.unit} / ${tolerance.relativeDiffPercent}%) supera la tolerancia de ±2% o ±1 unidad. Ingrese un Token TOTP dinámico o PIN de Gerente válido.`
      );
    }
    pinAuthorizedBy = `${actor.displayName} (${totpCheck.methodUsed === 'MANAGER_PIN_FALLBACK' ? 'PIN' : 'TOTP'})`;
  }

  const updatedProduct: Product = {
    ...product,
    stockByLocation: {
      ...product.stockByLocation,
      [input.locationId]: tolerance.countedTotal,
    },
    shelfStockByLocation: {
      ...(product.shelfStockByLocation || {}),
      [input.locationId]: countedShelf,
    },
    lastUpdatedVet: timestampVet,
  };

  const movementRecord: ShelfMovementRecord = {
    id: `shf-sync-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    referenceCode: `SINC-${Date.now().toString().slice(-6)}`,
    movementType: 'PHYSICAL_COUNT_SYNC',
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    unit: product.unit,
    fromLocationId: input.locationId,
    fromLocationName: locationName,
    fromZone: 'DEPOSITO',
    toLocationId: input.locationId,
    toLocationName: locationName,
    toZone: 'ANAQUEL',
    quantity: Math.abs(tolerance.totalDiff),
    shelfBefore: before.shelf,
    shelfAfter: countedShelf,
    depositBefore: before.deposit,
    depositAfter: countedDeposit,
    totalAfter: tolerance.countedTotal,
    notes: input.notes.trim(),
    performedByUserId: actor.uid,
    performedByName: actor.displayName,
    performedByRole: actor.role,
    managerPinValidated: tolerance.requiresManagerPin,
    timestampVet,
  };

  return {
    updatedProduct,
    movementRecord,
    systemDepositBefore: before.deposit,
    systemShelfBefore: before.shelf,
    systemTotalBefore: before.total,
    countedTotalAfter: tolerance.countedTotal,
    depositDiff: tolerance.depositDiff,
    shelfDiff: tolerance.shelfDiff,
    totalDiff: tolerance.totalDiff,
    requiresManagerPin: tolerance.requiresManagerPin,
    pinAuthorizedBy,
  };
}

/**
 * Construye la Lista Sugerida de Reposición (Pick List) de Depósito -> Anaquel para una sede.
 */
export function buildShelfReplenishmentPickList(
  products: Product[],
  locationId: string
): ShelfReplenishmentSuggestion[] {
  const suggestions: ShelfReplenishmentSuggestion[] = [];

  for (const p of products) {
    const b = getLocationStockBreakdown(p, locationId);
    const effectiveTarget = b.minShelf > 0 ? b.minShelf : b.total > 0 ? Math.min(b.total, 5) : 0;

    if (b.shelf < effectiveTarget && b.deposit > 0) {
      const needed = round2(toDecimal(effectiveTarget).minus(b.shelf));
      const suggestedMoveQty = round2(Decimal.min(b.deposit, needed));
      const deficitAfterDeposit = Math.max(0, round2(toDecimal(needed).minus(suggestedMoveQty)));

      if (suggestedMoveQty > 0) {
        suggestions.push({
          productId: p.id,
          sku: p.sku,
          productName: p.name,
          category: p.category,
          unit: p.unit,
          locationId,
          currentShelf: b.shelf,
          minShelf: effectiveTarget,
          availableDeposit: b.deposit,
          suggestedMoveQty,
          deficitAfterDeposit,
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.suggestedMoveQty - a.suggestedMoveQty);
}
