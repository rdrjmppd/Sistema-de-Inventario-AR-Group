/**
 * Fruits & Vegetables Yield & Waste Control Engine (Rendimiento Frutas y Verduras)
 * Tracks agricultural lot receipt, biological decay, mechanical damage and salable net yield.
 * Mathematical Precision: Decimal.js with ROUND_HALF_UP.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import {
  FruverCategory,
  FruverLossCause,
  FruverWasteRecord,
  FruverBatchRecord,
  CreateFruverBatchInput,
  UserRole,
} from '../types';
import { toDecimal, round2, calculatePriceFromMargin } from './decimal';
import { getCaracasNow } from './bcv';

export const FRUVER_LOSS_CAUSE_LABELS: Record<FruverLossCause, { label: string; description: string }> = {
  DESHIDRATACION_PERDIDA_PESO: {
    label: 'Deshidratación y Pérdida Natural de Peso',
    description: 'Evaporación de humedad natural por temperatura ambiental y tiempo de almacenamiento.',
  },
  DANO_EXCESO_FRIO: {
    label: 'Quemadura por Exceso de Frío en Cava',
    description: 'Necrosis o ablandamiento de tejidos por temperaturas bajo el umbral crítico de la especie.',
  },
  DANO_EXCESO_CALOR: {
    label: 'Descomposición / Fermentación por Exceso de Calor',
    description: 'Maduración acelerada, fermentación de azúcares y pudrición por falta de ventilación/climatización.',
  },
  DANO_MECANICO_MANIPULACION: {
    label: 'Daño Mecánico por Estiba y Manipulación',
    description: 'Golpes, magulladuras, aplastamiento en cajas/cestas o manipulación ruda de clientes/personal.',
  },
  EXCESO_DIAS_EXPOSICION_ROTACION: {
    label: 'Exceso de Días en Piso de Venta (Baja Rotación)',
    description: 'Pérdida de frescura comercial por sobrepasar el ciclo de vida útil en anaquel sin rotación.',
  },
};

export const FRUVER_STANDARD_PRODUCTS: Array<{
  sku: string;
  name: string;
  category: FruverCategory;
  defaultCostUsdPerKg: number;
  expectedSalableYieldPercent: number;
  defaultTargetMarginPercent: number;
}> = [
  { sku: 'FRUV-TOM-PER', name: 'Tomate Perita Seleccionado', category: 'VERDURAS_HORTALIZAS', defaultCostUsdPerKg: 1.15, expectedSalableYieldPercent: 92, defaultTargetMarginPercent: 28 },
  { sku: 'FRUV-PAP-CRI', name: 'Papa Criolla Lavada Granel', category: 'TUBERCULOS_RAICES', defaultCostUsdPerKg: 0.95, expectedSalableYieldPercent: 94, defaultTargetMarginPercent: 26 },
  { sku: 'FRUV-CEB-AMA', name: 'Cebolla Amarilla Especial', category: 'VERDURAS_HORTALIZAS', defaultCostUsdPerKg: 0.85, expectedSalableYieldPercent: 93, defaultTargetMarginPercent: 27 },
  { sku: 'FRUV-PLA-VER', name: 'Plátano Verde Hartón', category: 'FRUTAS', defaultCostUsdPerKg: 0.65, expectedSalableYieldPercent: 96, defaultTargetMarginPercent: 25 },
  { sku: 'FRUV-PLA-MAD', name: 'Plátano Maduro de Primera', category: 'FRUTAS', defaultCostUsdPerKg: 0.70, expectedSalableYieldPercent: 90, defaultTargetMarginPercent: 28 },
  { sku: 'FRUV-ZAN-GRA', name: 'Zanahoria Granel Fresca', category: 'TUBERCULOS_RAICES', defaultCostUsdPerKg: 0.80, expectedSalableYieldPercent: 95, defaultTargetMarginPercent: 26 },
  { sku: 'FRUV-PIN-CRI', name: 'Piña Criolla Dulce', category: 'FRUTAS', defaultCostUsdPerKg: 0.75, expectedSalableYieldPercent: 91, defaultTargetMarginPercent: 30 },
  { sku: 'FRUV-LEC-CRI', name: 'Lechosa Criolla Madura', category: 'FRUTAS', defaultCostUsdPerKg: 0.60, expectedSalableYieldPercent: 88, defaultTargetMarginPercent: 30 },
  { sku: 'FRUV-CAM-MER', name: 'Cambur Manzano / Merideño', category: 'FRUTAS', defaultCostUsdPerKg: 0.55, expectedSalableYieldPercent: 89, defaultTargetMarginPercent: 28 },
  { sku: 'FRUV-PIM-ROJ', name: 'Pimentón Rojo Seleccionado', category: 'VERDURAS_HORTALIZAS', defaultCostUsdPerKg: 1.45, expectedSalableYieldPercent: 91, defaultTargetMarginPercent: 30 },
];

/**
 * Calculates agricultural lot net yield, waste losses and effective unit cost
 */
export function calculateFruverBatch(params: {
  input: CreateFruverBatchInput;
  bcvRate: number;
  locationName: string;
  supervisor: { uid: string; displayName: string; role: UserRole };
}): FruverBatchRecord {
  const { input, bcvRate, locationName, supervisor } = params;

  const initialWeight = toDecimal(input.initialWeightKg);
  const costKg = toDecimal(input.initialCostPerKgUsd);
  const totalBatchCostUsd = round2(initialWeight.times(costKg));

  let totalWasteKgDec = toDecimal(0);
  let totalWasteLossUsdDec = toDecimal(0);

  const calculatedWastes: FruverWasteRecord[] = input.wastes.map((w, idx) => {
    const wKg = toDecimal(w.weightKg);
    totalWasteKgDec = totalWasteKgDec.plus(wKg);

    const percentOfBatch = initialWeight.isZero()
      ? 0
      : round2(wKg.dividedBy(initialWeight).times(100));

    const lossUsd = round2(wKg.times(costKg));
    const lossVes = round2(toDecimal(lossUsd).times(bcvRate));
    totalWasteLossUsdDec = totalWasteLossUsdDec.plus(lossUsd);

    return {
      id: `fruv-waste-${idx + 1}`,
      cause: w.cause,
      causeLabel: FRUVER_LOSS_CAUSE_LABELS[w.cause]?.label || w.cause,
      weightKg: round2(wKg),
      percentOfBatch,
      lossCostUsd: lossUsd,
      lossCostVes: lossVes,
      notes: w.notes || '',
    };
  });

  const totalWasteKg = round2(totalWasteKgDec);
  const totalWasteLossUsd = round2(totalWasteLossUsdDec);
  const totalWasteLossVes = round2(toDecimal(totalWasteLossUsd).times(bcvRate));

  const wastePercent = initialWeight.isZero()
    ? 0
    : round2(totalWasteKgDec.dividedBy(initialWeight).times(100));

  const netSalableWeightKg = round2(toDecimal(initialWeight).minus(totalWasteKgDec));
  const netYieldPercent = initialWeight.isZero()
    ? 0
    : round2(toDecimal(netSalableWeightKg).dividedBy(initialWeight).times(100));

  // Effective cost per Kg shifts onto remaining salable weight
  const effectiveCostPerSalableKgUsd = netSalableWeightKg > 0
    ? round2(toDecimal(totalBatchCostUsd).dividedBy(netSalableWeightKg))
    : round2(costKg);

  const targetMargin = input.targetMarginPercent || 28;
  const suggestedPvpUsd = calculatePriceFromMargin(effectiveCostPerSalableKgUsd, targetMargin);
  const suggestedPvpVes = round2(toDecimal(suggestedPvpUsd).times(bcvRate));

  const caracasNow = getCaracasNow();
  const batchCode = `FRUV-${input.category.substring(0, 4)}-${caracasNow.dateFormatted.replace(/\//g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

  return {
    id: `fruv-batch-${Date.now()}`,
    batchCode,
    productId: input.productId,
    productSku: input.productSku,
    productName: input.productName,
    category: input.category,
    locationId: input.locationId,
    locationName,
    initialWeightKg: round2(initialWeight),
    initialCostPerKgUsd: round2(costKg),
    totalBatchCostUsd,
    wastes: calculatedWastes,
    totalWasteKg,
    wastePercent,
    totalWasteLossUsd,
    totalWasteLossVes,
    netSalableWeightKg,
    netYieldPercent,
    effectiveCostPerSalableKgUsd,
    suggestedPvpPerKgUsd: suggestedPvpUsd,
    suggestedPvpPerKgVes: suggestedPvpVes,
    bcvRateAtBatch: bcvRate,
    supervisorUserId: supervisor.uid,
    supervisorName: supervisor.displayName,
    supervisorRole: supervisor.role,
    createdAtVet: `${caracasNow.dateFormatted} ${caracasNow.timeFormatted}`,
    status: 'REGISTRADO',
  };
}
