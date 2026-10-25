import Decimal from 'decimal.js';

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export { Decimal };

export function toDecimal(value: number | string | Decimal | null | undefined): Decimal {
  if (value === null || value === undefined || value === '') {
    return new Decimal(0);
  }
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

export function round2(value: number | string | Decimal): number {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function round4(value: number | string | Decimal): number {
  return toDecimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
}

export const roundCurrency = round2;
export const roundRate = round4;

export function addMoney(a: number | string, b: number | string): number {
  return round2(toDecimal(a).plus(toDecimal(b)));
}

export function subMoney(a: number | string, b: number | string): number {
  return round2(toDecimal(a).minus(toDecimal(b)));
}

export function mulMoney(a: number | string, b: number | string): number {
  return round2(toDecimal(a).times(toDecimal(b)));
}

export function divMoney(a: number | string, b: number | string): number {
  const denom = toDecimal(b);
  if (denom.isZero()) return 0;
  return round2(toDecimal(a).dividedBy(denom));
}

export function calcMargin(costUsd: number, markupPercent: number) {
  const cost = toDecimal(costUsd);
  const factor = new Decimal(1).plus(toDecimal(markupPercent).dividedBy(100));
  const basePrice = cost.times(factor);
  const profit = basePrice.minus(cost);
  return {
    basePriceUsd: round2(basePrice),
    profitUsd: round2(profit),
  };
}

export function calcTax(params: {
  costUsd: number;
  marginPercent: number;
  taxRatePercent: number;
  applyIgtf: boolean;
  bcvRate: number;
}) {
  const { basePriceUsd } = calcMargin(params.costUsd, params.marginPercent);
  const base = toDecimal(basePriceUsd);
  const taxAmount = toDecimal(
    round2(base.times(toDecimal(params.taxRatePercent).dividedBy(100)))
  );
  const pvpBeforeIgtf = toDecimal(round2(base.plus(taxAmount)));
  const igtfAmount = params.applyIgtf
    ? toDecimal(round2(pvpBeforeIgtf.times(new Decimal('0.03'))))
    : new Decimal(0);
  const finalPvp = toDecimal(round2(pvpBeforeIgtf.plus(igtfAmount)));
  const finalVes = round2(finalPvp.times(toDecimal(params.bcvRate)));

  return {
    basePriceUsd: round2(base),
    taxAmountUsd: round2(taxAmount),
    pvpBeforeIgtfUsd: round2(pvpBeforeIgtf),
    igtfAmountUsd: round2(igtfAmount),
    finalPvpUsd: round2(finalPvp),
    finalPvpVes: finalVes,
  };
}

export function calculatePriceFromMargin(
  costUsd: number | string | Decimal,
  targetMarginPercent: number | string | Decimal
): number {
  const cost = toDecimal(costUsd);
  const margin = toDecimal(targetMarginPercent);
  if (margin.gte(100)) {
    return round2(cost.times(2));
  }
  const divisor = new Decimal(1).minus(margin.dividedBy(100));
  if (divisor.lte(0)) {
    return round2(cost);
  }
  return round2(cost.dividedBy(divisor));
}

export function calculateGrossMarginPercent(
  costUsd: number | string | Decimal,
  priceUsd: number | string | Decimal
): number {
  const cost = toDecimal(costUsd);
  const price = toDecimal(priceUsd);
  if (price.lte(0)) {
    return 0;
  }
  const margin = price.minus(cost).dividedBy(price).times(100);
  return round2(margin);
}

export function convertUsdToVes(
  amountUsd: number | string | Decimal,
  bcvRate: number | string | Decimal
): number {
  return round2(toDecimal(amountUsd).times(toDecimal(bcvRate)));
}

export function convertVesToUsd(
  amountVes: number | string | Decimal,
  bcvRate: number | string | Decimal
): number {
  const rate = toDecimal(bcvRate);
  if (rate.lte(0)) return 0;
  return round2(toDecimal(amountVes).dividedBy(rate));
}

export function calculateLineTotal(
  quantity: number | string | Decimal,
  unitCost: number | string | Decimal
): number {
  return round2(toDecimal(quantity).times(toDecimal(unitCost)));
}

export function calculateIva(
  subtotal: number | string | Decimal,
  ivaRatePercent: number | string | Decimal = 16
): number {
  return round2(toDecimal(subtotal).times(toDecimal(ivaRatePercent)).dividedBy(100));
}

export function calculateIgtf(
  baseWithIva: number | string | Decimal,
  igtfRatePercent: number | string | Decimal = 3
): number {
  return round2(toDecimal(baseWithIva).times(toDecimal(igtfRatePercent)).dividedBy(100));
}

export function formatUsd(value: number | string | Decimal): string {
  const n = round2(value);
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatVes(value: number | string | Decimal): string {
  const n = round2(value);
  return `Bs. ${n.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatRate(value: number | string | Decimal): string {
  const n = round2(value);
  return `Bs. ${n.toFixed(2)} / USD`;
}
