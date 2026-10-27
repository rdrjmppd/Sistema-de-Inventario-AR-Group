/**
 * Meat Yield & Butchery Transformation Engine (Rendimiento Cárnico)
 * Supports Res (Bovino), Cerdo (Porcino) and Pollo (Beneficiado) cross inventory yields.
 * Mathematical Precision: Decimal.js with ROUND_HALF_UP.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import {
  MeatAnimalType,
  MeatCarcassPresentation,
  MeatCutItem,
  MeatWasteItem,
  MeatWasteType,
  MeatYieldBatch,
  CreateMeatYieldBatchInput,
  UserRole,
} from '../types';
import { toDecimal, round2, calculatePriceFromMargin } from './decimal';
import { getCaracasNow } from './bcv';

export interface StandardCutTemplate {
  cutName: string;
  tier: MeatCutItem['tier'];
  expectedYieldPercent: number;
  relativeValueFactor: number;
  defaultTargetMarginPercent: number;
}

export const RES_STANDARD_CUTS: StandardCutTemplate[] = [
  { cutName: 'Lomito / Filet Mignon', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 1.8, relativeValueFactor: 2.6, defaultTargetMarginPercent: 32 },
  { cutName: 'Solomo de Cuerito', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 3.5, relativeValueFactor: 2.3, defaultTargetMarginPercent: 30 },
  { cutName: 'Punta Trasera', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 1.6, relativeValueFactor: 2.5, defaultTargetMarginPercent: 32 },
  { cutName: 'Pulpa Negra', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 5.8, relativeValueFactor: 1.8, defaultTargetMarginPercent: 28 },
  { cutName: 'Chocozuela', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 4.8, relativeValueFactor: 1.7, defaultTargetMarginPercent: 27 },
  { cutName: 'Pollo de Res', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 4.2, relativeValueFactor: 1.6, defaultTargetMarginPercent: 26 },
  { cutName: 'Gancho / Ganso', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 4.0, relativeValueFactor: 1.6, defaultTargetMarginPercent: 26 },
  { cutName: 'Carne Molida Especial', tier: 'SEGUNDA_CORTE_GUISO', expectedYieldPercent: 12.0, relativeValueFactor: 1.25, defaultTargetMarginPercent: 25 },
  { cutName: 'Falda / Ropa Vieja', tier: 'SEGUNDA_CORTE_GUISO', expectedYieldPercent: 5.5, relativeValueFactor: 1.35, defaultTargetMarginPercent: 26 },
  { cutName: 'Lagarto con Hueso', tier: 'SEGUNDA_CORTE_GUISO', expectedYieldPercent: 6.2, relativeValueFactor: 0.95, defaultTargetMarginPercent: 22 },
  { cutName: 'Costilla de Res', tier: 'TERCERA_SOPA_HUESO', expectedYieldPercent: 9.5, relativeValueFactor: 0.75, defaultTargetMarginPercent: 20 },
  { cutName: 'Hueso Blanco / Rojo Sopa', tier: 'TERCERA_SOPA_HUESO', expectedYieldPercent: 16.5, relativeValueFactor: 0.15, defaultTargetMarginPercent: 15 },
  { cutName: 'Grasa / Sebo Comercial', tier: 'SUBPRODUCTO_GRASA', expectedYieldPercent: 10.0, relativeValueFactor: 0.10, defaultTargetMarginPercent: 10 },
];

export const CERDO_STANDARD_CUTS: StandardCutTemplate[] = [
  { cutName: 'Pernil de Cerdo', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 26.5, relativeValueFactor: 1.55, defaultTargetMarginPercent: 28 },
  { cutName: 'Chuleta de Cerdo Fresca', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 18.5, relativeValueFactor: 1.65, defaultTargetMarginPercent: 30 },
  { cutName: 'Lomo de Cerdo', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 9.2, relativeValueFactor: 1.75, defaultTargetMarginPercent: 30 },
  { cutName: 'Costilla de Cerdo', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 10.5, relativeValueFactor: 1.45, defaultTargetMarginPercent: 28 },
  { cutName: 'Carne de Cerdo p/ Guisar', tier: 'SEGUNDA_CORTE_GUISO', expectedYieldPercent: 10.0, relativeValueFactor: 1.15, defaultTargetMarginPercent: 25 },
  { cutName: 'Tocino / Panceta Fresca', tier: 'SUBPRODUCTO_GRASA', expectedYieldPercent: 11.5, relativeValueFactor: 0.85, defaultTargetMarginPercent: 22 },
  { cutName: 'Hueso / Cabeza / Patas', tier: 'TERCERA_SOPA_HUESO', expectedYieldPercent: 9.8, relativeValueFactor: 0.25, defaultTargetMarginPercent: 15 },
];

export const POLLO_STANDARD_CUTS: StandardCutTemplate[] = [
  { cutName: 'Pechuga con Hueso', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 31.0, relativeValueFactor: 1.65, defaultTargetMarginPercent: 28 },
  { cutName: 'Milanesa / Filet Pechuga', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 22.0, relativeValueFactor: 2.15, defaultTargetMarginPercent: 30 },
  { cutName: 'Muslo con Contramuslo', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 29.5, relativeValueFactor: 1.25, defaultTargetMarginPercent: 25 },
  { cutName: 'Alas de Pollo', tier: 'PRIMERA_ALTO_VALOR', expectedYieldPercent: 11.2, relativeValueFactor: 1.35, defaultTargetMarginPercent: 26 },
  { cutName: 'Menudencias (Molleja/Hígado)', tier: 'SEGUNDA_CORTE_GUISO', expectedYieldPercent: 6.5, relativeValueFactor: 0.65, defaultTargetMarginPercent: 20 },
  { cutName: 'Carapacho / Hueso Sopa', tier: 'TERCERA_SOPA_HUESO', expectedYieldPercent: 15.0, relativeValueFactor: 0.20, defaultTargetMarginPercent: 15 },
];

export const MEAT_WASTE_LABELS: Record<MeatWasteType, string> = {
  HUESO_BLANCO_DESECHO: 'Hueso Blanco No Aprovechable (Desecho)',
  GRASA_SEBO_DESECHO: 'Grasa y Sebo Excedente (Desecho)',
  MERMA_EVAPORACION_LIQUIDOS: 'Merma por Líquidos y Evaporación en Cava',
  ASERRIN_CORTE_SIERRA: 'Merma por Aserrín de Corte en Sierra',
  OTRA_MERMA_DESPOSTE: 'Otras Mermas de Manipulación y Limpieza',
};

/**
 * Calculates butchery transformation with relative value allocated costing
 */
export function calculateMeatYieldBatch(params: {
  input: CreateMeatYieldBatchInput;
  bcvRate: number;
  locationName: string;
  supervisor: { uid: string; displayName: string; role: UserRole };
}): MeatYieldBatch {
  const { input, bcvRate, locationName, supervisor } = params;
  const carcassWeight = toDecimal(input.carcassWeightKg);
  const carcassCostKg = toDecimal(input.carcassCostPerKgUsd);
  const totalCarcassCost = round2(carcassWeight.times(carcassCostKg));

  // 1. Calculate weighted sum for value-based cost allocation
  let sumWeightTimesFactor = toDecimal(0);
  for (const c of input.cuts) {
    const w = toDecimal(c.weightKg);
    const f = toDecimal(c.relativeValueFactor || 1);
    sumWeightTimesFactor = sumWeightTimesFactor.plus(w.times(f));
  }

  // Base factor unit cost
  const baseCostPerFactorUnit = sumWeightTimesFactor.isZero()
    ? toDecimal(0)
    : toDecimal(totalCarcassCost).dividedBy(sumWeightTimesFactor);

  let totalCutsWeightDec = toDecimal(0);
  let totalRevenueDec = toDecimal(0);

  const calculatedCuts: MeatCutItem[] = input.cuts.map((c, idx) => {
    const w = toDecimal(c.weightKg);
    totalCutsWeightDec = totalCutsWeightDec.plus(w);

    const yieldPercent = carcassWeight.isZero()
      ? 0
      : round2(w.dividedBy(carcassWeight).times(100));

    // Allocated cost per Kg based on relative commercial value
    const cutCostPerKg = round2(baseCostPerFactorUnit.times(c.relativeValueFactor || 1));
    const retailPriceUsd = calculatePriceFromMargin(cutCostPerKg, c.targetMarginPercent);
    const retailPriceVes = round2(toDecimal(retailPriceUsd).times(bcvRate));
    const projectedRev = round2(w.times(retailPriceUsd));
    totalRevenueDec = totalRevenueDec.plus(projectedRev);

    return {
      id: `cut-${idx + 1}`,
      cutName: c.cutName,
      tier: c.tier,
      weightKg: round2(w),
      yieldPercent,
      relativeValueFactor: c.relativeValueFactor,
      allocatedCostPerKgUsd: cutCostPerKg,
      targetMarginPercent: c.targetMarginPercent,
      retailPriceUsdPerKg: retailPriceUsd,
      retailPriceVesPerKg: retailPriceVes,
      projectedRevenueUsd: projectedRev,
    };
  });

  // 2. Wastes and operational loss
  let totalWasteWeightDec = toDecimal(0);
  const calculatedWastes: MeatWasteItem[] = input.wastes.map((w, idx) => {
    const wWeight = toDecimal(w.weightKg);
    totalWasteWeightDec = totalWasteWeightDec.plus(wWeight);

    const wastePercent = carcassWeight.isZero()
      ? 0
      : round2(wWeight.dividedBy(carcassWeight).times(100));

    // Loss valued at carcass base purchase cost
    const lossCostUsd = round2(wWeight.times(carcassCostKg));

    return {
      id: `waste-${idx + 1}`,
      wasteType: w.wasteType,
      label: w.label || MEAT_WASTE_LABELS[w.wasteType] || 'Merma',
      weightKg: round2(wWeight),
      wastePercent,
      lossCostUsd,
    };
  });

  const totalCutsWeightKg = round2(totalCutsWeightDec);
  const totalWasteWeightKg = round2(totalWasteWeightDec);
  const cutsYieldPercent = carcassWeight.isZero()
    ? 0
    : round2(totalCutsWeightDec.dividedBy(carcassWeight).times(100));
  const wastePercent = carcassWeight.isZero()
    ? 0
    : round2(totalWasteWeightDec.dividedBy(carcassWeight).times(100));

  const unaccountedWeightKg = round2(
    carcassWeight.minus(totalCutsWeightDec).minus(totalWasteWeightDec)
  );

  const projectedTotalRevenueUsd = round2(totalRevenueDec);
  const projectedGrossProfitUsd = round2(
    toDecimal(projectedTotalRevenueUsd).minus(totalCarcassCost)
  );
  const projectedMarginPercent = projectedTotalRevenueUsd > 0
    ? round2(
        toDecimal(projectedGrossProfitUsd)
          .dividedBy(projectedTotalRevenueUsd)
          .times(100)
      )
    : 0;

  const caracasNow = getCaracasNow();
  const trimmedCustom = input.customBatchCode?.trim();
  const batchCode = trimmedCustom && trimmedCustom.length > 0
    ? trimmedCustom
    : `DESP-${input.animalType.substring(0, 3)}-${caracasNow.dateFormatted.replace(/\//g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

  return {
    id: `batch-${Date.now()}`,
    batchCode,
    customBatchCode: trimmedCustom || undefined,
    receptionDate: input.receptionDate || caracasNow.dateFormatted,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    inventoryLoaded: false,
    animalType: input.animalType,
    presentation: input.presentation,
    locationId: input.locationId,
    locationName,
    carcassWeightKg: round2(carcassWeight),
    carcassCostPerKgUsd: round2(carcassCostKg),
    totalCarcassCostUsd: totalCarcassCost,
    cuts: calculatedCuts,
    totalCutsWeightKg,
    cutsYieldPercent,
    wastes: calculatedWastes,
    totalWasteWeightKg,
    wastePercent,
    unaccountedWeightKg,
    projectedTotalRevenueUsd,
    projectedGrossProfitUsd,
    projectedMarginPercent,
    bcvRateAtBatch: bcvRate,
    supervisorUserId: supervisor.uid,
    supervisorName: supervisor.displayName,
    supervisorRole: supervisor.role,
    createdAtVet: `${caracasNow.dateFormatted} ${caracasNow.timeFormatted}`,
    status: 'REGISTRADO',
  };
}

/**
 * Calculates how many Kg of whole animal carcass are required to fulfill a target demand of a cut.
 */
export function projectCarcassRequirementForCutDemand(params: {
  animalType: MeatAnimalType;
  cutName: string;
  targetDemandKg: number;
  customHistoricalYieldPercent?: number;
}): { carcassNeededKg: number; cutYieldPercent: number } {
  const { animalType, cutName, targetDemandKg, customHistoricalYieldPercent } = params;

  let templateYield = 5.0; // default safe fallback
  const templates =
    animalType === 'RES'
      ? RES_STANDARD_CUTS
      : animalType === 'CERDO'
      ? CERDO_STANDARD_CUTS
      : POLLO_STANDARD_CUTS;

  const found = templates.find((t) => t.cutName.toLowerCase().includes(cutName.toLowerCase()));
  if (found) {
    templateYield = found.expectedYieldPercent;
  }

  const effectiveYield = customHistoricalYieldPercent || templateYield;
  const yieldRatio = toDecimal(effectiveYield).dividedBy(100);

  const carcassNeeded = yieldRatio.isZero()
    ? 0
    : round2(toDecimal(targetDemandKg).dividedBy(yieldRatio));

  return {
    carcassNeededKg: carcassNeeded,
    cutYieldPercent: effectiveYield,
  };
}
