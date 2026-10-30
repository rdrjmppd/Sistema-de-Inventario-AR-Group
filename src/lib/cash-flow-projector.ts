/**
 * Motor de Proyección de Flujo de Caja Bimonetario Conservador Estricto (USD / VES)
 * Ecosistema de 11 Agentes Especializados de Antigravity 2.0 (@Finanzas + @QA)
 * 
 * Basado en la Decisión Estratégica Opción B:
 * Considera ÚNICAMENTE la liquidez real disponible en tesorería y bancos versus
 * los compromisos de Cuentas por Pagar a Proveedores y las Provisiones Fiscales SENIAT
 * quincenales, sin asumir ventas futuras no recaudadas.
 * 
 * Cumple con la Línea Roja Universal: Aritmética decimal exacta con Decimal.js (ROUND_HALF_UP).
 */

import { toDecimal, round2 } from './decimal';
import { getCaracasNow } from './bcv';
import { PurchaseInvoice, TaxRetentionVoucher } from '../types';

export interface CashFlowHorizonBreakdown {
  periodLabel: string;
  horizonDays: number;
  supplierOutflowUsd: number;
  supplierOutflowVes: number;
  seniatTaxOutflowUsd: number;
  seniatTaxOutflowVes: number;
  totalOutflowUsd: number;
  totalOutflowVes: number;
  projectedNetBalanceUsd: number;
  projectedNetBalanceVes: number;
  isDeficit: boolean;
}

export interface ConservativeCashFlowProjectionResult {
  asOfDateVet: string;
  activeBcvRate: number;
  simulatedBcvRate: number;
  slippagePercentApplied: number;
  currentAvailableLiquidity: {
    usdAvailable: number;
    vesAvailable: number;
    consolidatedTotalUsd: number;
    consolidatedTotalVes: number;
  };
  supplierObligations: {
    overdueUsd: number;
    overdueVes: number;
    horizon7dUsd: number;
    horizon7dVes: number;
    horizon15dUsd: number;
    horizon15dVes: number;
    horizon30dUsd: number;
    horizon30dVes: number;
    horizonOver30dUsd: number;
    horizonOver30dVes: number;
    totalPendingUsd: number;
    totalPendingVes: number;
  };
  seniatFiscalObligations: {
    nextQuincenaDeadlineVet: string;
    ivaPendingUsd: number;
    ivaPendingVes: number;
    islrPendingUsd: number;
    islrPendingVes: number;
    totalSeniatUsd: number;
    totalSeniatVes: number;
  };
  horizons: CashFlowHorizonBreakdown[];
  cashRunwayDays: number;
  cashRunwayStatus: 'VERDE_SOLVENTE' | 'AMARILLO_ALERTA' | 'ROJO_DEFICIT';
  recommendations: string[];
}

export interface CashFlowCalculationParams {
  availableCashUsd: number;
  availableCashVes: number;
  activeBcvRate: number;
  invoices: PurchaseInvoice[];
  retentionVouchers: TaxRetentionVoucher[];
  bcvSlippagePercent?: number; // e.g. 0, 2, 5, 10
}

/**
 * Calcula la próxima fecha de corte fiscal del SENIAT en Caracas (Día 15 o último día del mes)
 */
export function getNextSeniatQuincenaDeadline(refDateString?: string): string {
  const ref = refDateString ? new Date(refDateString) : new Date();
  const year = ref.getFullYear();
  const month = ref.getMonth(); // 0-based
  const day = ref.getDate();

  if (day <= 15) {
    const d = new Date(year, month, 15);
    return d.toISOString().slice(0, 10);
  } else {
    // Último día del mes corriente
    const lastDay = new Date(year, month + 1, 0).getDate();
    const d = new Date(year, month, lastDay);
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Motor central de Flujo de Caja Bimonetario Conservador Estricto
 */
export function calculateConservativeCashFlowProjection({
  availableCashUsd,
  availableCashVes,
  activeBcvRate,
  invoices,
  retentionVouchers,
  bcvSlippagePercent = 0,
}: CashFlowCalculationParams): ConservativeCashFlowProjectionResult {
  const vetNow = getCaracasNow();
  const todayStr = vetNow.dateString;
  const rateDec = toDecimal(Math.max(0.0001, activeBcvRate));
  
  // Tasa con deslizamiento simulado (ej. +5% de devaluación esperada)
  const slippageMultiplier = toDecimal(1).plus(toDecimal(bcvSlippagePercent).dividedBy(100));
  const simRateDec = rateDec.times(slippageMultiplier);
  const simRateNum = round2(simRateDec);

  // 1. Liquidez Inicial Disponible
  const cashUsdDec = toDecimal(Math.max(0, availableCashUsd));
  const cashVesDec = toDecimal(Math.max(0, availableCashVes));
  const cashVesInUsdDec = cashVesDec.dividedBy(rateDec);
  const consolidatedUsdDec = cashUsdDec.plus(cashVesInUsdDec);
  const consolidatedVesDec = consolidatedUsdDec.times(rateDec);

  // 2. Clasificación de Cuentas por Pagar a Proveedores
  let overdueUsdDec = toDecimal(0);
  let h7UsdDec = toDecimal(0);
  let h15UsdDec = toDecimal(0);
  let h30UsdDec = toDecimal(0);
  let hOver30UsdDec = toDecimal(0);

  const todayDate = new Date(todayStr);

  for (const inv of invoices) {
    if (inv.status === 'PAGADA') continue;
    
    // Saldo pendiente neto de la factura
    const totalInv = toDecimal(inv.totalUsd || 0);
    const paidInv = toDecimal(inv.paidAmountUsd || 0);
    const pendingInv = totalInv.minus(paidInv);
    if (pendingInv.lte(0)) continue;

    const dueDate = inv.dueDate ? new Date(inv.dueDate) : todayDate;
    const diffTime = dueDate.getTime() - todayDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      overdueUsdDec = overdueUsdDec.plus(pendingInv);
    } else if (diffDays <= 7) {
      h7UsdDec = h7UsdDec.plus(pendingInv);
    } else if (diffDays <= 15) {
      h15UsdDec = h15UsdDec.plus(pendingInv);
    } else if (diffDays <= 30) {
      h30UsdDec = h30UsdDec.plus(pendingInv);
    } else {
      hOver30UsdDec = hOver30UsdDec.plus(pendingInv);
    }
  }

  const totalPendingSupplierUsdDec = overdueUsdDec
    .plus(h7UsdDec)
    .plus(h15UsdDec)
    .plus(h30UsdDec)
    .plus(hOver30UsdDec);

  // 3. Provisiones Fiscales SENIAT (Retenciones quincenales pendientes de enterar)
  let ivaPendingVesDec = toDecimal(0);
  let islrPendingVesDec = toDecimal(0);

  for (const v of retentionVouchers) {
    // Si el comprobante está emitido o entregado, pero pendiente de pago al SENIAT
    if (v.status === 'EMITIDO' || v.status === 'ENTREGADO') {
      const retainedVes = toDecimal(v.retainedTotalVes || 0);
      if (v.type === 'IVA') {
        ivaPendingVesDec = ivaPendingVesDec.plus(retainedVes);
      } else if (v.type === 'ISLR') {
        islrPendingVesDec = islrPendingVesDec.plus(retainedVes);
      }
    }
  }

  const totalSeniatVesDec = ivaPendingVesDec.plus(islrPendingVesDec);
  const totalSeniatUsdDec = totalSeniatVesDec.dividedBy(rateDec);
  const nextSeniatDeadline = getNextSeniatQuincenaDeadline(todayStr);

  const daysToSeniat = Math.max(
    0,
    Math.ceil((new Date(nextSeniatDeadline).getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  // 4. Proyección en 4 Horizontes Temporales
  // Horizonte Hoy/Vencido
  const seniatDueToday = daysToSeniat === 0 ? totalSeniatUsdDec : toDecimal(0);
  const outTodayUsd = overdueUsdDec.plus(seniatDueToday);
  const netTodayUsd = consolidatedUsdDec.minus(outTodayUsd);

  // Horizonte 7 Días
  const seniatDue7d = daysToSeniat <= 7 ? totalSeniatUsdDec : toDecimal(0);
  const out7dUsd = overdueUsdDec.plus(h7UsdDec).plus(seniatDue7d);
  const net7dUsd = consolidatedUsdDec.minus(out7dUsd);

  // Horizonte 15 Días (Incluye corte fiscal quincenal SENIAT)
  const seniatDue15d = daysToSeniat <= 15 ? totalSeniatUsdDec : toDecimal(0);
  const out15dUsd = overdueUsdDec.plus(h7UsdDec).plus(h15UsdDec).plus(seniatDue15d);
  const net15dUsd = consolidatedUsdDec.minus(out15dUsd);

  // Horizonte 30 Días (Mes completo)
  const out30dUsd = overdueUsdDec
    .plus(h7UsdDec)
    .plus(h15UsdDec)
    .plus(h30UsdDec)
    .plus(totalSeniatUsdDec);
  const net30dUsd = consolidatedUsdDec.minus(out30dUsd);

  const horizons: CashFlowHorizonBreakdown[] = [
    {
      periodLabel: 'Vencido / Hoy',
      horizonDays: 0,
      supplierOutflowUsd: round2(overdueUsdDec),
      supplierOutflowVes: round2(overdueUsdDec.times(simRateDec)),
      seniatTaxOutflowUsd: round2(seniatDueToday),
      seniatTaxOutflowVes: round2(seniatDueToday.times(simRateDec)),
      totalOutflowUsd: round2(outTodayUsd),
      totalOutflowVes: round2(outTodayUsd.times(simRateDec)),
      projectedNetBalanceUsd: round2(netTodayUsd),
      projectedNetBalanceVes: round2(netTodayUsd.times(simRateDec)),
      isDeficit: netTodayUsd.lt(0),
    },
    {
      periodLabel: 'Próximos 7 días',
      horizonDays: 7,
      supplierOutflowUsd: round2(h7UsdDec),
      supplierOutflowVes: round2(h7UsdDec.times(simRateDec)),
      seniatTaxOutflowUsd: round2(seniatDue7d),
      seniatTaxOutflowVes: round2(seniatDue7d.times(simRateDec)),
      totalOutflowUsd: round2(out7dUsd),
      totalOutflowVes: round2(out7dUsd.times(simRateDec)),
      projectedNetBalanceUsd: round2(net7dUsd),
      projectedNetBalanceVes: round2(net7dUsd.times(simRateDec)),
      isDeficit: net7dUsd.lt(0),
    },
    {
      periodLabel: `Quincena (Día 15)`,
      horizonDays: 15,
      supplierOutflowUsd: round2(h15UsdDec),
      supplierOutflowVes: round2(h15UsdDec.times(simRateDec)),
      seniatTaxOutflowUsd: round2(seniatDue15d),
      seniatTaxOutflowVes: round2(seniatDue15d.times(simRateDec)),
      totalOutflowUsd: round2(out15dUsd),
      totalOutflowVes: round2(out15dUsd.times(simRateDec)),
      projectedNetBalanceUsd: round2(net15dUsd),
      projectedNetBalanceVes: round2(net15dUsd.times(simRateDec)),
      isDeficit: net15dUsd.lt(0),
    },
    {
      periodLabel: 'Próximos 30 días',
      horizonDays: 30,
      supplierOutflowUsd: round2(h30UsdDec),
      supplierOutflowVes: round2(h30UsdDec.times(simRateDec)),
      seniatTaxOutflowUsd: round2(totalSeniatUsdDec),
      seniatTaxOutflowVes: round2(totalSeniatUsdDec.times(simRateDec)),
      totalOutflowUsd: round2(out30dUsd),
      totalOutflowVes: round2(out30dUsd.times(simRateDec)),
      projectedNetBalanceUsd: round2(net30dUsd),
      projectedNetBalanceVes: round2(net30dUsd.times(simRateDec)),
      isDeficit: net30dUsd.lt(0),
    },
  ];

  // 5. Cobertura de Caja (Cash Runway en días)
  const avgDailyOutflowUsd = out30dUsd.gt(0) ? out30dUsd.dividedBy(30) : toDecimal(1);
  let runwayDays = 999;
  if (consolidatedUsdDec.gt(0) && avgDailyOutflowUsd.gt(0)) {
    runwayDays = Math.max(0, Math.floor(consolidatedUsdDec.dividedBy(avgDailyOutflowUsd).toNumber()));
  } else if (consolidatedUsdDec.lte(0)) {
    runwayDays = 0;
  }

  let cashRunwayStatus: ConservativeCashFlowProjectionResult['cashRunwayStatus'] = 'VERDE_SOLVENTE';
  if (runwayDays <= 9 || net15dUsd.lt(0)) {
    cashRunwayStatus = 'ROJO_DEFICIT';
  } else if (runwayDays <= 20 || net30dUsd.lt(0)) {
    cashRunwayStatus = 'AMARILLO_ALERTA';
  }

  // Recomendaciones directivas
  const recommendations: string[] = [];
  if (overdueUsdDec.gt(0)) {
    recommendations.push(
      `Existen \$${round2(overdueUsdDec)} USD en facturas vencidas. Priorice pagos para evitar cortes de despacho con proveedores estratégicos.`
    );
  }
  if (totalSeniatVesDec.gt(0)) {
    recommendations.push(
      `Provisione Bs. ${round2(totalSeniatVesDec)} (SENIAT IVA/ISLR) antes del corte del ${nextSeniatDeadline} para evitar sanciones fiscales.`
    );
  }
  if (net15dUsd.lt(0)) {
    recommendations.push(
      `Déficit proyectado a 15 días de \$${round2(net15dUsd.abs())} USD. Se recomienda negociar prórrogas o acelerar la cobranza/rotación de inventario.`
    );
  } else {
    recommendations.push(
      `Liquidez suficiente para cubrir los compromisos a 15 días con holgura de \$${round2(net15dUsd)} USD.`
    );
  }

  return {
    asOfDateVet: todayStr,
    activeBcvRate: round2(rateDec),
    simulatedBcvRate: simRateNum,
    slippagePercentApplied: bcvSlippagePercent,
    currentAvailableLiquidity: {
      usdAvailable: round2(cashUsdDec),
      vesAvailable: round2(cashVesDec),
      consolidatedTotalUsd: round2(consolidatedUsdDec),
      consolidatedTotalVes: round2(consolidatedVesDec),
    },
    supplierObligations: {
      overdueUsd: round2(overdueUsdDec),
      overdueVes: round2(overdueUsdDec.times(simRateDec)),
      horizon7dUsd: round2(h7UsdDec),
      horizon7dVes: round2(h7UsdDec.times(simRateDec)),
      horizon15dUsd: round2(h15UsdDec),
      horizon15dVes: round2(h15UsdDec.times(simRateDec)),
      horizon30dUsd: round2(h30UsdDec),
      horizon30dVes: round2(h30UsdDec.times(simRateDec)),
      horizonOver30dUsd: round2(hOver30UsdDec),
      horizonOver30dVes: round2(hOver30UsdDec.times(simRateDec)),
      totalPendingUsd: round2(totalPendingSupplierUsdDec),
      totalPendingVes: round2(totalPendingSupplierUsdDec.times(simRateDec)),
    },
    seniatFiscalObligations: {
      nextQuincenaDeadlineVet: nextSeniatDeadline,
      ivaPendingUsd: round2(ivaPendingVesDec.dividedBy(rateDec)),
      ivaPendingVes: round2(ivaPendingVesDec),
      islrPendingUsd: round2(islrPendingVesDec.dividedBy(rateDec)),
      islrPendingVes: round2(islrPendingVesDec),
      totalSeniatUsd: round2(totalSeniatUsdDec),
      totalSeniatVes: round2(totalSeniatVesDec),
    },
    horizons,
    cashRunwayDays: runwayDays,
    cashRunwayStatus,
    recommendations,
  };
}

export default calculateConservativeCashFlowProjection;
