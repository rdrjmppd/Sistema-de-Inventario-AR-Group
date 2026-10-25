import {
  LocationNode,
  PostPurchaseManualReceipt,
  Product,
  SalesSyncEvent,
  StockTransfer,
  SupplierPurchaseOrder,
  UserProfile,
  UserRole,
} from '../types';
import { round2, toDecimal } from './decimal';

export interface ProductOrderReceiptHistoryEntry {
  id: string;
  orderNumber: string;
  receiptCode: string;
  productId: string;
  sku: string;
  productName: string;
  unit: Product['unit'];
  locationId: string;
  locationCode: string;
  locationName: string;
  supplierName: string;
  orderDate: string; // YYYY-MM-DD
  receiptDate: string | null; // YYYY-MM-DD or null if pending
  leadTimeDays: number | null;
  orderedQty: number;
  receivedQty: number;
  unitCostUsd: number;
  totalCostUsd: number;
  totalCostVes: number;
  status: 'RECIBIDO_CONFORME' | 'PENDIENTE_ENTREGA' | 'RECEPCION_DIRECTA';
}

export interface ProductRotationHistoryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  productId: string;
  sku: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  movementType: 'VENTA_POS' | 'DESPACHO_MAYOR' | 'TRANSFERENCIA_SADA';
  documentRef: string;
  unitsRotated: number;
  unitPriceUsd: number;
  totalRevenueUsd: number;
  totalRevenueVes: number;
}

export interface ProductHistoryReportResult {
  productId: string;
  sku: string;
  productName: string;
  fromDate: string;
  toDate: string;
  daysInRange: number;
  locationFilterId: string;
  rotationEntries: ProductRotationHistoryEntry[];
  orderReceiptEntries: ProductOrderReceiptHistoryEntry[];
  summary: {
    totalUnitsRotated: number;
    avgDailyRotation: number;
    totalRotationRevenueUsd: number;
    totalRotationRevenueVes: number;
    totalOrdersCount: number;
    totalOrderedUnits: number;
    totalReceivedUnits: number;
    totalOrderCostUsd: number;
    totalOrderCostVes: number;
    avgLeadTimeDays: number;
  };
}

function addDaysToIsoDate(baseDateStr: string, offsetDays: number): string {
  const parts = baseDateStr.split('-').map(Number);
  const year = parts[0] || 2026;
  const month = (parts[1] || 10) - 1;
  const day = parts[2] || 24;
  const dt = new Date(Date.UTC(year, month, day));
  dt.setUTCDate(dt.getUTCDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
}

function diffDaysBetweenIsoDates(startStr: string, endStr: string): number {
  const sParts = startStr.split('-').map(Number);
  const eParts = endStr.split('-').map(Number);
  const sDate = Date.UTC(sParts[0] || 2026, (sParts[1] || 1) - 1, sParts[2] || 1);
  const eDate = Date.UTC(eParts[0] || 2026, (eParts[1] || 1) - 1, eParts[2] || 1);
  return Math.max(1, Math.round((eDate - sDate) / (1000 * 60 * 60 * 24)) + 1);
}

/**
 * Builds and filters the complete Rotation History + Order & Reception Dates Ledger
 * for any selected Product across a customizable [fromDate, toDate] range and optional Sede/Depósito.
 * Uses strict Decimal.js (ROUND_HALF_UP) arithmetic.
 */
export function buildAndFilterProductHistoryReport(params: {
  product: Product;
  locations: LocationNode[];
  purchaseOrders?: SupplierPurchaseOrder[];
  manualReceipts?: PostPurchaseManualReceipt[];
  salesEvents?: SalesSyncEvent[];
  transfers?: StockTransfer[];
  fromDate: string;
  toDate: string;
  locationFilterId?: string;
  activeBcvRate: number;
  referenceEndDate?: string;
}): ProductHistoryReportResult {
  const {
    product,
    locations,
    purchaseOrders = [],
    manualReceipts = [],
    salesEvents = [],
    transfers = [],
    fromDate,
    toDate,
    locationFilterId = 'ALL',
    activeBcvRate,
    referenceEndDate = '2026-10-24',
  } = params;

  const normalizedFrom = fromDate <= toDate ? fromDate : toDate;
  const normalizedTo = fromDate <= toDate ? toDate : fromDate;
  const daysInRange = diffDaysBetweenIsoDates(normalizedFrom, normalizedTo);

  const activeLocs = locations.length > 0 ? locations : [];
  // Deterministic seed based on SKU characters so every SKU has consistent historical records
  const skuSeed = product.sku
    .split('')
    .reduce((acc, ch, idx) => acc + ch.charCodeAt(0) * (idx + 1), 0);

  const allRotationEntries: ProductRotationHistoryEntry[] = [];
  const allOrderReceiptEntries: ProductOrderReceiptHistoryEntry[] = [];

  // 1. Include live POS sales events from session if any match this product
  for (const evt of salesEvents) {
    const evtDate = evt.timestampVet.slice(0, 10);
    const locObj = activeLocs.find((l) => l.id === evt.locationId) || activeLocs[0];
    for (const item of evt.items) {
      if (item.sku.toUpperCase() === product.sku.toUpperCase()) {
        const revUsd = round2(toDecimal(item.qtySold).times(item.unitPriceUsd));
        allRotationEntries.push({
          id: `rot-live-${evt.id}`,
          date: evtDate,
          productId: product.id,
          sku: product.sku,
          locationId: locObj?.id || evt.locationId,
          locationCode: locObj?.code || 'PZO-01',
          locationName: locObj?.name || 'Sede Operativa',
          movementType: 'VENTA_POS',
          documentRef: evt.externalPosId,
          unitsRotated: round2(item.qtySold),
          unitPriceUsd: round2(item.unitPriceUsd),
          totalRevenueUsd: revUsd,
          totalRevenueVes: round2(toDecimal(revUsd).times(activeBcvRate)),
        });
      }
    }
  }

  // 2. Include live SADA transfers from session for this product
  for (const trf of transfers) {
    if (trf.productId === product.id || trf.sku === product.sku) {
      const trfDate = trf.createdAtVet.slice(0, 10);
      const fromLoc = activeLocs.find((l) => l.id === trf.fromLocationId) || activeLocs[0];
      const revUsd = round2(toDecimal(trf.quantity).times(product.priceUsd));
      allRotationEntries.push({
        id: `rot-trf-${trf.id}`,
        date: trfDate,
        productId: product.id,
        sku: product.sku,
        locationId: fromLoc?.id || trf.fromLocationId,
        locationCode: fromLoc?.code || 'VAL-01',
        locationName: fromLoc?.name || 'Depósito Central',
        movementType: 'TRANSFERENCIA_SADA',
        documentRef: trf.reference,
        unitsRotated: round2(trf.quantity),
        unitPriceUsd: round2(product.priceUsd),
        totalRevenueUsd: revUsd,
        totalRevenueVes: round2(toDecimal(revUsd).times(activeBcvRate)),
      });
    }
  }

  // 3. Generate deterministic historical rotation ledger over the last 90 days ending at referenceEndDate
  const baseDailyUnits = Math.max(
    2,
    Math.round(toDecimal(product.monthlyUnitsSold).dividedBy(30).toNumber())
  );

  const rotationDayOffsets = [
    0, -1, -2, -4, -6, -8, -11, -14, -17, -21, -25, -29, -34, -39, -44, -50, -56, -63, -72, -84,
  ];

  rotationDayOffsets.forEach((offset, idx) => {
    const entryDate = addDaysToIsoDate(referenceEndDate, offset);
    const locIndex = (skuSeed + idx) % Math.max(1, activeLocs.length);
    const loc = activeLocs[locIndex] || {
      id: 'loc-pzo-01',
      code: 'PZO-01',
      name: 'Sede Principal Alta Vista',
    };
    const waveFactor = 0.75 + (((skuSeed + idx * 7) % 9) * 0.12);
    const qtyRotated = Math.max(
      1,
      Math.round(toDecimal(baseDailyUnits).times(waveFactor).toNumber())
    );
    const movType: ProductRotationHistoryEntry['movementType'] =
      idx % 5 === 0
        ? 'DESPACHO_MAYOR'
        : idx % 7 === 0
        ? 'TRANSFERENCIA_SADA'
        : 'VENTA_POS';
    const docPrefix =
      movType === 'VENTA_POS'
        ? 'POS-Z'
        : movType === 'DESPACHO_MAYOR'
        ? 'FAC-MAY'
        : 'GUIA-SADA';
    const revUsd = round2(toDecimal(qtyRotated).times(product.priceUsd));

    allRotationEntries.push({
      id: `rot-hist-${product.id}-${idx}`,
      date: entryDate,
      productId: product.id,
      sku: product.sku,
      locationId: loc.id,
      locationCode: loc.code,
      locationName: loc.name,
      movementType: movType,
      documentRef: `${docPrefix}-${String(20400 + ((skuSeed + idx * 13) % 8900)).padStart(5, '0')}`,
      unitsRotated: qtyRotated,
      unitPriceUsd: round2(product.priceUsd),
      totalRevenueUsd: revUsd,
      totalRevenueVes: round2(toDecimal(revUsd).times(activeBcvRate)),
    });
  });

  // 4. Include live Purchase Orders & Manual Receipts from session for this product
  for (const po of purchaseOrders) {
    if (po.productId === product.id || po.sku.toUpperCase() === product.sku.toUpperCase()) {
      const ordDate = po.createdAtVet.slice(0, 10);
      const recDate = po.receivedAtVet ? po.receivedAtVet.slice(0, 10) : null;
      const leadDays =
        recDate && ordDate ? Math.max(0, diffDaysBetweenIsoDates(ordDate, recDate) - 1) : null;
      allOrderReceiptEntries.push({
        id: `po-live-${po.id}`,
        orderNumber: po.orderNumber,
        receiptCode: po.status === 'RECIBIDO_CONFORME' ? `REC-${po.orderNumber.slice(-4)}` : 'EN TRÁNSITO',
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        unit: product.unit,
        locationId: po.locationId,
        locationCode: po.locationCode,
        locationName: po.locationName,
        supplierName: po.supplierName,
        orderDate: ordDate,
        receiptDate: recDate,
        leadTimeDays: leadDays,
        orderedQty: round2(po.orderedQty),
        receivedQty: round2(po.receivedQty ?? 0),
        unitCostUsd: round2(po.unitCostUsd),
        totalCostUsd: round2(po.totalCostUsd),
        totalCostVes: round2(toDecimal(po.totalCostUsd).times(activeBcvRate)),
        status: po.status,
      });
    }
  }

  for (const rcp of manualReceipts) {
    if (rcp.productId === product.id || rcp.sku.toUpperCase() === product.sku.toUpperCase()) {
      const rDate = rcp.receivedAtVet.slice(0, 10);
      const locObj = activeLocs.find((l) => l.id === rcp.locationId);
      allOrderReceiptEntries.push({
        id: `rcp-live-${rcp.id}`,
        orderNumber: rcp.orderNumberRef || 'COMPRA-DIRECTA',
        receiptCode: rcp.receiptCode,
        productId: product.id,
        sku: product.sku,
        productName: product.name,
        unit: product.unit,
        locationId: rcp.locationId,
        locationCode: rcp.locationCode,
        locationName: locObj?.name || rcp.locationCode,
        supplierName: 'Recepción Directa Almacén',
        orderDate: rDate,
        receiptDate: rDate,
        leadTimeDays: 0,
        orderedQty: round2(rcp.qtyReceived),
        receivedQty: round2(rcp.qtyReceived),
        unitCostUsd: round2(rcp.unitCostUsd),
        totalCostUsd: round2(rcp.totalCostUsd),
        totalCostVes: round2(toDecimal(rcp.totalCostUsd).times(activeBcvRate)),
        status: 'RECEPCION_DIRECTA',
      });
    }
  }

  // 5. Generate deterministic historical Purchase Order & Reception Dates for this SKU
  const supplierNames = [
    'Alimentos Polar Comercial, C.A.',
    'Distribuidora Lácteos Los Andes, C.A.',
    'Consorcio Mayorista Víveres del Centro, C.A.',
  ];
  const historicalPurchaseSchedules = [
    { orderOffset: -5, leadTime: 3, qtyMult: 0.35 },
    { orderOffset: -16, leadTime: 4, qtyMult: 0.45 },
    { orderOffset: -28, leadTime: 3, qtyMult: 0.5 },
    { orderOffset: -42, leadTime: 5, qtyMult: 0.55 },
    { orderOffset: -58, leadTime: 4, qtyMult: 0.6 },
    { orderOffset: -78, leadTime: 6, qtyMult: 0.5 },
  ];

  historicalPurchaseSchedules.forEach((sched, idx) => {
    const orderDate = addDaysToIsoDate(referenceEndDate, sched.orderOffset);
    const receiptDate = addDaysToIsoDate(orderDate, sched.leadTime);
    const locIndex = (skuSeed + idx) % Math.max(1, activeLocs.length);
    const loc = activeLocs[locIndex] || {
      id: 'loc-pzo-01',
      code: 'PZO-01',
      name: 'Sede Principal Alta Vista',
    };
    const supName = supplierNames[(skuSeed + idx) % supplierNames.length];
    const orderedQty = Math.max(
      25,
      Math.round(toDecimal(product.monthlyUnitsSold).times(sched.qtyMult).toNumber() / 10) * 10
    );
    const totalUsd = round2(toDecimal(orderedQty).times(product.costUsd));
    const totalVes = round2(toDecimal(totalUsd).times(activeBcvRate));

    allOrderReceiptEntries.push({
      id: `po-hist-${product.id}-${idx}`,
      orderNumber: `ORD-2026-${String(1020 + ((skuSeed + idx * 19) % 850)).padStart(4, '0')}`,
      receiptCode: `REC-2026-${String(4100 + ((skuSeed + idx * 23) % 850)).padStart(4, '0')}`,
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      unit: product.unit,
      locationId: loc.id,
      locationCode: loc.code,
      locationName: loc.name,
      supplierName: supName,
      orderDate,
      receiptDate,
      leadTimeDays: sched.leadTime,
      orderedQty,
      receivedQty: orderedQty,
      unitCostUsd: round2(product.costUsd),
      totalCostUsd: totalUsd,
      totalCostVes: totalVes,
      status: 'RECIBIDO_CONFORME',
    });
  });

  // 6. Filter by [normalizedFrom, normalizedTo] and optional locationFilterId
  const filteredRotations = allRotationEntries
    .filter((entry) => {
      const matchLoc = locationFilterId === 'ALL' || entry.locationId === locationFilterId;
      const matchDate = entry.date >= normalizedFrom && entry.date <= normalizedTo;
      return matchLoc && matchDate;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const filteredOrders = allOrderReceiptEntries
    .filter((entry) => {
      const matchLoc = locationFilterId === 'ALL' || entry.locationId === locationFilterId;
      const orderInWindow =
        entry.orderDate >= normalizedFrom && entry.orderDate <= normalizedTo;
      const receiptInWindow =
        entry.receiptDate !== null &&
        entry.receiptDate >= normalizedFrom &&
        entry.receiptDate <= normalizedTo;
      return matchLoc && (orderInWindow || receiptInWindow);
    })
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate));

  // 7. Compute Decimal.js summary KPIs
  const totalUnitsRotated = round2(
    filteredRotations.reduce((acc, r) => acc.plus(r.unitsRotated), toDecimal(0))
  );
  const totalRotationRevenueUsd = round2(
    filteredRotations.reduce((acc, r) => acc.plus(r.totalRevenueUsd), toDecimal(0))
  );
  const totalRotationRevenueVes = round2(
    toDecimal(totalRotationRevenueUsd).times(activeBcvRate)
  );
  const avgDailyRotation = round2(
    toDecimal(totalUnitsRotated).dividedBy(Math.max(1, daysInRange))
  );

  const totalOrderedUnits = round2(
    filteredOrders.reduce((acc, o) => acc.plus(o.orderedQty), toDecimal(0))
  );
  const totalReceivedUnits = round2(
    filteredOrders.reduce((acc, o) => acc.plus(o.receivedQty), toDecimal(0))
  );
  const totalOrderCostUsd = round2(
    filteredOrders.reduce((acc, o) => acc.plus(o.totalCostUsd), toDecimal(0))
  );
  const totalOrderCostVes = round2(toDecimal(totalOrderCostUsd).times(activeBcvRate));

  const completedWithLead = filteredOrders.filter(
    (o) => typeof o.leadTimeDays === 'number' && o.leadTimeDays >= 0
  );
  const avgLeadTimeDays =
    completedWithLead.length > 0
      ? round2(
          completedWithLead
            .reduce((acc, o) => acc.plus(o.leadTimeDays || 0), toDecimal(0))
            .dividedBy(completedWithLead.length)
        )
      : 0;

  return {
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    fromDate: normalizedFrom,
    toDate: normalizedTo,
    daysInRange,
    locationFilterId,
    rotationEntries: filteredRotations,
    orderReceiptEntries: filteredOrders,
    summary: {
      totalUnitsRotated,
      avgDailyRotation,
      totalRotationRevenueUsd,
      totalRotationRevenueVes,
      totalOrdersCount: filteredOrders.length,
      totalOrderedUnits,
      totalReceivedUnits,
      totalOrderCostUsd,
      totalOrderCostVes,
      avgLeadTimeDays,
    },
  };
}


export const CATALOG_BATCH_SIZE = 20;

export interface CatalogBatchSliceResult<T> {
  visibleItems: T[];
  visibleCount: number;
  totalItems: number;
  hasMore: boolean;
  remainingItems: number;
  nextBatchSize: number;
  currentBatchNumber: number;
  totalBatches: number;
}

/**
 * Pure deterministic batch slicer for the Master Multi-Location Catalog.
 * Prevents DOM & memory collapse by rendering items in progressive batches of 20.
 */
export function getCatalogBatchSlice<T>(
  items: T[],
  requestedVisibleCount: number = CATALOG_BATCH_SIZE,
  batchSize: number = CATALOG_BATCH_SIZE
): CatalogBatchSliceResult<T> {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const totalItems = items.length;
  const normalizedVisible = Math.max(
    safeBatchSize,
    Math.floor(requestedVisibleCount || safeBatchSize)
  );
  const effectiveVisibleCount = Math.min(totalItems, normalizedVisible);
  const visibleItems = items.slice(0, effectiveVisibleCount);
  const remainingItems = Math.max(0, totalItems - effectiveVisibleCount);
  const hasMore = remainingItems > 0;
  const nextBatchSize = Math.min(safeBatchSize, remainingItems);
  const totalBatches = Math.max(1, Math.ceil(totalItems / safeBatchSize));
  const currentBatchNumber = Math.min(
    totalBatches,
    Math.max(1, Math.ceil(effectiveVisibleCount / safeBatchSize))
  );

  return {
    visibleItems,
    visibleCount: effectiveVisibleCount,
    totalItems,
    hasMore,
    remainingItems,
    nextBatchSize,
    currentBatchNumber,
    totalBatches,
  };
}

/**
 * Validates that the active user is SUPERADMIN or GERENTE and has re-entered their valid PIN / authorization code.
 */
export function verifyLocationGovernanceAuth(
  user: Pick<UserProfile, 'role' | 'pin' | 'displayName'> | null,
  enteredAuthCode: string
): { authorized: boolean; error?: string } {
  if (!user) {
    return {
      authorized: false,
      error: 'No existe una sesión activa para autorizar esta operación.',
    };
  }

  if (user.role !== UserRole.SUPERADMIN && user.role !== UserRole.GERENTE) {
    return {
      authorized: false,
      error: `Acceso denegado: Su rol actual (${user.role}) no tiene potestad. Solo SUPERADMIN o GERENTE pueden crear o eliminar Sedes o Depósitos.`,
    };
  }

  const cleanCode = (enteredAuthCode || '').trim();
  if (!cleanCode) {
    return {
      authorized: false,
      error: 'Debe ingresar su Código de Autorización / PIN de sesión activa para confirmar.',
    };
  }

  if (cleanCode !== user.pin.trim()) {
    return {
      authorized: false,
      error: 'Código de Autorización / PIN inválido para la cuenta activa. Operación rechazada.',
    };
  }

  return { authorized: true };
}

export interface CreateLocationNodeInput {
  code: string;
  name: string;
  city: string;
  type: LocationNode['type'];
  manager: string;
  authCode?: string;
}

export function createNewLocationOrDepot(
  input: CreateLocationNodeInput,
  existingLocations: LocationNode[],
  activeUser?: Pick<UserProfile, 'role' | 'pin' | 'displayName'> | null
): { success: boolean; location?: LocationNode; error?: string } {
  if (activeUser !== undefined) {
    const authCheck = verifyLocationGovernanceAuth(activeUser, input.authCode || '');
    if (!authCheck.authorized) {
      return { success: false, error: authCheck.error };
    }
  }

  const cleanCode = input.code.trim().toUpperCase().replace(/\s+/g, '-');
  const cleanName = input.name.trim();
  const cleanCity = input.city.trim() || 'Venezuela';
  const cleanManager = input.manager.trim() || 'Coordinación de Operaciones';

  if (!cleanCode || cleanCode.length < 2) {
    return {
      success: false,
      error: 'El código de la Sede o Depósito debe tener al menos 2 caracteres (ej. CCS-02 o DEP-01).',
    };
  }

  if (!cleanName || cleanName.length < 3) {
    return {
      success: false,
      error: 'El nombre de la Sede o Depósito es obligatorio.',
    };
  }

  const codeCollision = existingLocations.some(
    (loc) => loc.code.trim().toUpperCase() === cleanCode
  );
  if (codeCollision) {
    return {
      success: false,
      error: `Ya existe una Sede o Depósito registrado con el código ${cleanCode}.`,
    };
  }

  const slug = cleanCode.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const idCandidate = `loc-${slug}-${Date.now().toString(36).slice(-4)}`;

  const newLocation: LocationNode = {
    id: idCandidate,
    code: cleanCode,
    name: cleanName,
    city: cleanCity,
    type: input.type,
    manager: cleanManager,
    active: true,
  };

  return {
    success: true,
    location: newLocation,
  };
}

export function deleteLocationOrDepotWithAuth(
  locationId: string,
  existingLocations: LocationNode[],
  activeUser: Pick<UserProfile, 'role' | 'pin' | 'displayName'> | null,
  enteredAuthCode: string
): {
  success: boolean;
  deletedLocation?: LocationNode;
  remainingLocations?: LocationNode[];
  error?: string;
} {
  const authCheck = verifyLocationGovernanceAuth(activeUser, enteredAuthCode);
  if (!authCheck.authorized) {
    return { success: false, error: authCheck.error };
  }

  if (existingLocations.length <= 1) {
    return {
      success: false,
      error: 'No se puede eliminar la última Sede o Depósito activo del ecosistema ERP.',
    };
  }

  const target = existingLocations.find((loc) => loc.id === locationId);
  if (!target) {
    return {
      success: false,
      error: 'La Sede o Depósito especificado no existe.',
    };
  }

  const remainingLocations = existingLocations.filter((loc) => loc.id !== locationId);
  return {
    success: true,
    deletedLocation: target,
    remainingLocations,
  };
}

/**
 * Ensures every product has initialized stockByLocation and minStockByLocation keys
 * for all registered Sedes and Depósitos, preventing undefined NaN or key collisions.
 */
export function syncProductStockMapsForLocations(
  products: Product[],
  locations: LocationNode[],
  defaultMinStock: number = 40
): Product[] {
  return products.map((product) => {
    const nextStock: Record<string, number> = { ...product.stockByLocation };
    const nextMinStock: Record<string, number> = { ...product.minStockByLocation };
    let mutated = false;

    for (const loc of locations) {
      if (typeof nextStock[loc.id] !== 'number' || Number.isNaN(nextStock[loc.id])) {
        nextStock[loc.id] = 0;
        mutated = true;
      } else {
        nextStock[loc.id] = round2(toDecimal(nextStock[loc.id]));
      }

      if (typeof nextMinStock[loc.id] !== 'number' || Number.isNaN(nextMinStock[loc.id])) {
        nextMinStock[loc.id] = defaultMinStock;
        mutated = true;
      } else {
        nextMinStock[loc.id] = round2(toDecimal(nextMinStock[loc.id]));
      }
    }

    if (!mutated) return product;
    return {
      ...product,
      stockByLocation: nextStock,
      minStockByLocation: nextMinStock,
    };
  });
}

export function removeLocationFromProductStockMaps(
  products: Product[],
  deletedLocationId: string
): Product[] {
  return products.map((product) => {
    const nextStock = { ...product.stockByLocation };
    const nextMinStock = { ...product.minStockByLocation };
    const nextManualRisk = product.manualRiskByLocation
      ? { ...product.manualRiskByLocation }
      : undefined;
    const nextSafetyMult = product.safetyMultiplierByLocation
      ? { ...product.safetyMultiplierByLocation }
      : undefined;

    delete nextStock[deletedLocationId];
    delete nextMinStock[deletedLocationId];
    if (nextManualRisk) delete nextManualRisk[deletedLocationId];
    if (nextSafetyMult) delete nextSafetyMult[deletedLocationId];

    return {
      ...product,
      stockByLocation: nextStock,
      minStockByLocation: nextMinStock,
      manualRiskByLocation: nextManualRisk,
      safetyMultiplierByLocation: nextSafetyMult,
    };
  });
}
