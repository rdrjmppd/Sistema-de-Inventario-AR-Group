import { DemandForecastSummary, Product, RotationHorizonDays, SalesSyncEvent } from '../types';
import { round2, toDecimal } from './decimal';
import { round3 } from './scale-barcode';

/**
 * Determina si una fecha UTC cae en ventana de Quincena Venezolana (días 14–17 o últimos 3 días del mes + día 1).
 */
export function isVenezuelanQuincenaPeakDay(dateUtc: Date): boolean {
  const day = dateUtc.getUTCDate();
  const year = dateUtc.getUTCFullYear();
  const month = dateUtc.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  if (day >= 14 && day <= 17) return true;
  if (day >= lastDayOfMonth - 2 || day === 1) return true;
  return false;
}

export function isRetailWeekendPeakDay(dateUtc: Date): boolean {
  const dow = dateUtc.getUTCDay(); // 0=Dom, 5=Vie, 6=Sab
  return dow === 5 || dow === 6 || dow === 0;
}

export function resolveCategoryPeakMultipliers(category: string, abcClass: Product['abcClass']): {
  quincenaFactor: number;
  weekendFactor: number;
  midweekFactor: number;
} {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('carnic') || cat.includes('prote') || cat.includes('res') || cat.includes('pollo')) {
    return { quincenaFactor: 1.48, weekendFactor: 1.28, midweekFactor: 0.88 };
  }
  if (cat.includes('charcut') || cat.includes('láct') || cat.includes('lact')) {
    return { quincenaFactor: 1.35, weekendFactor: 1.22, midweekFactor: 0.92 };
  }
  if (cat.includes('fruta') || cat.includes('verdur') || cat.includes('fruver') || cat.includes('hortal')) {
    return { quincenaFactor: 1.22, weekendFactor: 1.32, midweekFactor: 0.84 };
  }
  if (abcClass === 'A') {
    return { quincenaFactor: 1.42, weekendFactor: 1.18, midweekFactor: 0.93 };
  }
  return { quincenaFactor: 1.20, weekendFactor: 1.12, midweekFactor: 0.95 };
}

/**
 * Calcula la proyección día por día sobre el horizonte [7, 15, 30, 45, 60] ponderando
 * las quincenas venezolanas (15 y 30), los fines de semana comerciales y el historial POS real.
 */
export function forecastVenezuelanRetailDemand(params: {
  product: Product;
  locationId: string;
  horizonDays: RotationHorizonDays;
  salesEvents?: SalesSyncEvent[];
  referenceDateIso?: string;
}): DemandForecastSummary {
  const refIso = (params.referenceDateIso || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const [yStr, mStr, dStr] = refIso.split('-');
  const startUtc = new Date(
    Date.UTC(Number(yStr) || 2026, (Number(mStr) || 10) - 1, Number(dStr) || 29)
  );

  // Velocidad diaria base combinando catálogo y eventos POS recientes de esa sede
  const catalogDaily = toDecimal(params.product.monthlyUnitsSold || 0).dividedBy(30);
  let posObservedUnits = toDecimal(0);
  if (params.salesEvents && params.salesEvents.length > 0) {
    for (const ev of params.salesEvents) {
      if (ev.status !== 'PROCESADO' || ev.locationId !== params.locationId) continue;
      for (const item of ev.items) {
        if (item.sku === params.product.sku) {
          posObservedUnits = posObservedUnits.plus(item.qtySold);
        }
      }
    }
  }

  const posBoostDaily = posObservedUnits.gt(0)
    ? posObservedUnits.dividedBy(15).times('0.25')
    : toDecimal(0);
  const baseDailyDec = catalogDaily.plus(posBoostDaily);

  const mults = resolveCategoryPeakMultipliers(params.product.category, params.product.abcClass);

  let projectedSumDec = toDecimal(0);
  let quincenaDaysInWindow = 0;
  let upcomingQuincenaInNext5Days = false;

  for (let offset = 0; offset < params.horizonDays; offset++) {
    const dayDate = new Date(startUtc.getTime() + offset * 86_400_000);
    const isQuincena = isVenezuelanQuincenaPeakDay(dayDate);
    const isWeekend = isRetailWeekendPeakDay(dayDate);

    if (isQuincena) {
      quincenaDaysInWindow += 1;
      if (offset <= 4) upcomingQuincenaInNext5Days = true;
    }

    let dayFactor = toDecimal(mults.midweekFactor);
    if (isQuincena && isWeekend) {
      // Quincena coincidiendo con fin de semana (máximo pico retail venezolano)
      dayFactor = toDecimal(mults.quincenaFactor).times('1.10');
    } else if (isQuincena) {
      dayFactor = toDecimal(mults.quincenaFactor);
    } else if (isWeekend) {
      dayFactor = toDecimal(mults.weekendFactor);
    }

    projectedSumDec = projectedSumDec.plus(baseDailyDec.times(dayFactor));
  }

  const currentStock = toDecimal(params.product.stockByLocation[params.locationId] || 0);
  const minSafety = toDecimal(params.product.minStockByLocation[params.locationId] || 0);
  const requiredGross = projectedSumDec.plus(minSafety);
  const deficit = requiredGross.minus(currentStock);

  const recommendedOrderQty = deficit.gt(0)
    ? params.product.unit === 'KG' || params.product.unit === 'LT'
      ? round3(deficit)
      : Math.ceil(deficit.toNumber())
    : 0;

  const effectiveDaily =
    params.horizonDays > 0
      ? round3(projectedSumDec.dividedBy(params.horizonDays))
      : round3(baseDailyDec);

  return {
    productId: params.product.id,
    sku: params.product.sku,
    productName: params.product.name,
    category: params.product.category,
    locationId: params.locationId,
    baseDailyVelocity: round3(baseDailyDec),
    quincenaMultiplier: mults.quincenaFactor,
    weekendMultiplier: mults.weekendFactor,
    seasonalCategoryFactor: round2(
      quincenaDaysInWindow > 0 ? mults.quincenaFactor : mults.weekendFactor
    ),
    effectiveDailyDemand: effectiveDaily,
    projectedDemandHorizon: round2(projectedSumDec),
    horizonDays: params.horizonDays,
    isUpcomingQuincenaWindow: upcomingQuincenaInNext5Days,
    recommendedOrderQty,
  };
}
