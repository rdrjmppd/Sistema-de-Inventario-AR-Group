import {
  ColdChainTemperatureLog,
  ColdEquipmentType,
  FefoAlertLevel,
  FefoPerishableLot,
  Product,
  StorageZone,
  TotpSecurityConfig,
} from '../types';
import { round2, toDecimal } from './decimal';
import { round3 } from './scale-barcode';
import { applyStockDeltaToZone } from './shelf-stock';
import { verifyManagerGovernanceAuth } from './totp-governance';

export const SADA_COLD_CHAIN_LIMITS: Record<
  ColdEquipmentType,
  { minCelsius: number; maxCelsius: number; label: string }
> = {
  CAVA_CARNICOS: { minCelsius: -2.0, maxCelsius: 4.0, label: 'Nevera / Cava Cárnicos Frescos' },
  CONGELADOR_PROTEINA: { minCelsius: -24.0, maxCelsius: -16.0, label: 'Cava Congelación Profunda' },
  VITRINA_EXHIBICION: { minCelsius: 0.0, maxCelsius: 5.0, label: 'Vitrina Refrigerada Piso de Venta' },
  CUARTO_FRIO_FRUVER: { minCelsius: 6.0, maxCelsius: 12.0, label: 'Cuarto Frío Frutas y Hortalizas' },
};

function parseIsoDayUtc(dateStr: string): number {
  const iso = String(dateStr || '').trim().slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const parsed = Date.parse(dateStr);
  return Number.isFinite(parsed) ? parsed : Date.UTC(2026, 9, 29);
}

export function computeDaysUntilExpiration(
  expirationDate: string,
  referenceDateIso: string = new Date().toISOString().slice(0, 10)
): number {
  const expMs = parseIsoDayUtc(expirationDate);
  const refMs = parseIsoDayUtc(referenceDateIso);
  return Math.round((expMs - refMs) / 86_400_000);
}

export function classifyFefoLotStatus(
  daysUntilExpiration: number,
  hasManagerOverride: boolean = false
): {
  alertLevel: FefoAlertLevel;
  suggestedDiscountPercent: number;
  suggestedAction: FefoPerishableLot['suggestedAction'];
  blockedForSale: boolean;
} {
  if (daysUntilExpiration < 0) {
    return {
      alertLevel: 'VENCIDO_BLOQUEADO',
      suggestedDiscountPercent: 100,
      suggestedAction: 'BLOQUEAR_Y_DESCARGAR',
      blockedForSale: !hasManagerOverride,
    };
  }
  if (daysUntilExpiration <= 3) {
    return {
      alertLevel: 'CRITICO_PROMOCION_1_3D',
      suggestedDiscountPercent: 25,
      suggestedAction: 'TRANSFORMAR_RECETA_O_PROMO',
      blockedForSale: false,
    };
  }
  if (daysUntilExpiration <= 7) {
    return {
      alertLevel: 'PREVENTIVO_4_7D',
      suggestedDiscountPercent: 10,
      suggestedAction: 'PRIORIZAR_SALIDA_EXHIBICION',
      blockedForSale: false,
    };
  }
  return {
    alertLevel: 'VIGENTE_OPTIMO',
    suggestedDiscountPercent: 0,
    suggestedAction: 'MANTENER_ROTACION',
    blockedForSale: false,
  };
}

export function createFefoPerishableLot(params: {
  lotCode?: string;
  product: Product;
  locationId: string;
  locationName: string;
  zone: StorageZone;
  quantity: number;
  receptionDate: string;
  expirationDate: string;
  referenceDateIso?: string;
}): FefoPerishableLot {
  const days = computeDaysUntilExpiration(params.expirationDate, params.referenceDateIso);
  const status = classifyFefoLotStatus(days, false);

  return {
    id: `fefo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    lotCode:
      (params.lotCode || '').trim() ||
      `LOT-FEFO-${params.product.sku.slice(0, 6)}-${params.expirationDate.replace(/-/g, '')}`,
    productId: params.product.id,
    sku: params.product.sku,
    productName: params.product.name,
    category: params.product.category,
    unit: params.product.unit,
    locationId: params.locationId,
    locationName: params.locationName,
    zone: params.zone,
    quantityRemaining: round3(params.quantity),
    unitCostUsd: round2(params.product.costUsd),
    receptionDate: params.receptionDate,
    expirationDate: params.expirationDate,
    daysUntilExpiration: days,
    ...status,
  };
}

/**
 * Ordena lotes estrictamente bajo regla FEFO (primero el que vence antes; en empate, el recepcionado antes).
 */
export function sortLotsByFefo(lots: FefoPerishableLot[]): FefoPerishableLot[] {
  return [...lots].sort((a, b) => {
    const expDiff = parseIsoDayUtc(a.expirationDate) - parseIsoDayUtc(b.expirationDate);
    if (expDiff !== 0) return expDiff;
    return parseIsoDayUtc(a.receptionDate) - parseIsoDayUtc(b.receptionDate);
  });
}

export function refreshFefoLotsStatuses(
  lots: FefoPerishableLot[],
  referenceDateIso: string = new Date().toISOString().slice(0, 10)
): FefoPerishableLot[] {
  return sortLotsByFefo(
    lots.map((lot) => {
      const days = computeDaysUntilExpiration(lot.expirationDate, referenceDateIso);
      const cls = classifyFefoLotStatus(days, Boolean(lot.managerOverrideAuthorizedBy));
      return {
        ...lot,
        daysUntilExpiration: days,
        ...cls,
      };
    })
  );
}

/**
 * Consume cantidad de lotes perecederos respetando FEFO estricto y bloqueando lotes vencidos
 * salvo que se suministre un Token TOTP de 6 dígitos o PIN Gerencial válido.
 */
export function consumeLotsStrictFefo(params: {
  lots: FefoPerishableLot[];
  productId: string;
  locationId: string;
  preferredZone?: StorageZone;
  quantityNeeded: number;
  referenceDateIso?: string;
  managerCredentialForExpired?: string;
  totpConfig?: TotpSecurityConfig | null;
}): {
  updatedLots: FefoPerishableLot[];
  consumedLotCodes: string[];
  quantitySatisfiedFromLots: number;
  untrackedRemainderQty: number;
  expiredOverrideUsedBy?: string;
} {
  const refreshed = refreshFefoLotsStatuses(params.lots, params.referenceDateIso);
  let remainingNeed = toDecimal(params.quantityNeeded);

  const matching = refreshed.filter(
    (l) => l.productId === params.productId && l.locationId === params.locationId && l.quantityRemaining > 0
  );

  // Ordenar: primero no vencidos por fecha de vencimiento (y zona preferida en empate), luego vencidos
  const orderedMatching = [...matching].sort((a, b) => {
    const aExp = a.daysUntilExpiration < 0 ? 1 : 0;
    const bExp = b.daysUntilExpiration < 0 ? 1 : 0;
    if (aExp !== bExp) return aExp - bExp;
    const expDiff = parseIsoDayUtc(a.expirationDate) - parseIsoDayUtc(b.expirationDate);
    if (expDiff !== 0) return expDiff;
    if (params.preferredZone) {
      if (a.zone === params.preferredZone && b.zone !== params.preferredZone) return -1;
      if (b.zone === params.preferredZone && a.zone !== params.preferredZone) return 1;
    }
    return 0;
  });

  let expiredOverrideUsedBy: string | undefined;
  const consumedById = new Map<string, number>();
  const consumedLotCodes: string[] = [];

  for (const lot of orderedMatching) {
    if (remainingNeed.lte(0)) break;

    if (lot.daysUntilExpiration < 0 && lot.blockedForSale) {
      if (!params.managerCredentialForExpired) {
        throw new Error(
          `BLOQUEO SANITARIO FEFO: El lote ${lot.lotCode} (${lot.productName}) venció el ${lot.expirationDate}. Se requiere Token TOTP o PIN Gerencial para autorizar su movimiento o proceda a Descargas/Bajas.`
        );
      }
      const auth = verifyManagerGovernanceAuth({
        submittedCredential: params.managerCredentialForExpired,
        totpConfig: params.totpConfig,
      });
      if (!auth.authorized) {
        throw new Error(
          `Autorización denegada para desbloquear lote vencido ${lot.lotCode}: Token TOTP o PIN inválido.`
        );
      }
      expiredOverrideUsedBy = auth.authorizedLabel;
    }

    const available = toDecimal(lot.quantityRemaining);
    const take = DecimalMin(available, remainingNeed);
    if (take.gt(0)) {
      consumedById.set(lot.id, round3(take));
      consumedLotCodes.push(lot.lotCode);
      remainingNeed = remainingNeed.minus(take);
    }
  }

  const updatedLots = refreshed.map((lot) => {
    const taken = consumedById.get(lot.id);
    if (!taken) return lot;
    const nextRem = round3(toDecimal(lot.quantityRemaining).minus(taken));
    return {
      ...lot,
      quantityRemaining: Math.max(0, nextRem),
      managerOverrideAuthorizedBy:
        lot.daysUntilExpiration < 0 && expiredOverrideUsedBy
          ? expiredOverrideUsedBy
          : lot.managerOverrideAuthorizedBy,
      blockedForSale:
        lot.daysUntilExpiration < 0 && expiredOverrideUsedBy ? false : lot.blockedForSale,
    };
  });

  const satisfied = round3(toDecimal(params.quantityNeeded).minus(remainingNeed));

  return {
    updatedLots,
    consumedLotCodes,
    quantitySatisfiedFromLots: satisfied,
    untrackedRemainderQty: round3(remainingNeed),
    expiredOverrideUsedBy,
  };
}

function DecimalMin(a: ReturnType<typeof toDecimal>, b: ReturnType<typeof toDecimal>) {
  return a.lte(b) ? a : b;
}

/**
 * Registra y evalúa una lectura térmica de cava/nevera/vitrina bajo normas de inocuidad SADA.
 */
export function buildColdChainTemperatureLog(params: {
  locationId: string;
  locationName: string;
  equipmentName: string;
  equipmentType: ColdEquipmentType;
  recordedTempCelsius: number;
  source?: ColdChainTemperatureLog['source'];
  recordedBy: string;
  recordedAtVet?: string;
  correctiveAction?: string;
}): ColdChainTemperatureLog {
  const limits = SADA_COLD_CHAIN_LIMITS[params.equipmentType];
  const temp = round2(params.recordedTempCelsius);
  const isOutOfRange = temp < limits.minCelsius || temp > limits.maxCelsius;

  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    locationId: params.locationId,
    locationName: params.locationName,
    equipmentName: params.equipmentName.trim() || limits.label,
    equipmentType: params.equipmentType,
    recordedTempCelsius: temp,
    minAllowedCelsius: limits.minCelsius,
    maxAllowedCelsius: limits.maxCelsius,
    isOutOfRange,
    source: params.source || 'MANUAL_SUPERVISOR',
    recordedBy: params.recordedBy,
    recordedAtVet: params.recordedAtVet || new Date().toISOString().slice(0, 16).replace('T', ' '),
    correctiveAction: params.correctiveAction?.trim(),
  };
}

/**
 * Traslada un lote FEFO desde Depósito/Cava hacia Exhibición/Anaquel priorizando su salida preventiva.
 */
export function moveFefoLotToShelf(params: {
  lotId: string;
  lots: FefoPerishableLot[];
  products: Product[];
  qtyToMove: number;
  updatedAtVet: string;
}): {
  updatedLots: FefoPerishableLot[];
  updatedProducts: Product[];
} {
  const targetLot = params.lots.find((l) => l.id === params.lotId);
  if (!targetLot) {
    throw new Error('Lote FEFO no encontrado.');
  }
  if (targetLot.blockedForSale) {
    throw new Error(`El lote ${targetLot.lotCode} se encuentra vencido y bloqueado para exhibición.`);
  }
  if (targetLot.zone === 'ANAQUEL') {
    throw new Error('El lote seleccionado ya se encuentra en Exhibición / Anaquel.');
  }
  const qty = round3(params.qtyToMove);
  if (qty <= 0 || qty > targetLot.quantityRemaining) {
    throw new Error('Cantidad inválida o superior al saldo disponible del lote en Cava.');
  }

  const nextLots: FefoPerishableLot[] = [];
  for (const l of params.lots) {
    if (l.id !== targetLot.id) {
      nextLots.push(l);
      continue;
    }
    const rem = round3(toDecimal(l.quantityRemaining).minus(qty));
    if (rem > 0) {
      nextLots.push({ ...l, quantityRemaining: rem });
      nextLots.push({
        ...l,
        id: `${l.id}-shelf-${Date.now()}`,
        zone: 'ANAQUEL',
        quantityRemaining: qty,
      });
    } else {
      nextLots.push({ ...l, zone: 'ANAQUEL' });
    }
  }

  const updatedProducts = params.products.map((p) => {
    if (p.id !== targetLot.productId) return p;
    // Reducir depósito y aumentar anaquel manteniendo Total constante:
    const afterSubDep = applyStockDeltaToZone(p, targetLot.locationId, -qty, 'DEPOSITO', params.updatedAtVet);
    return applyStockDeltaToZone(afterSubDep, targetLot.locationId, qty, 'ANAQUEL', params.updatedAtVet);
  });

  return {
    updatedLots: sortLotsByFefo(nextLots),
    updatedProducts,
  };
}
