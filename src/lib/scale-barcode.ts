import Decimal from 'decimal.js';
import { DecodedScaleBarcode, Product, ScaleBarcodeMode } from '../types';
import { round2, toDecimal } from './decimal';

export function round3(value: number | string | Decimal): number {
  return toDecimal(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Calcula el dígito verificador oficial EAN-13 (Módulo 10 con ponderación 1 y 3 sobre los primeros 12 dígitos).
 */
export function computeEan13CheckDigit(first12Digits: string): number {
  const digits = String(first12Digits || '').replace(/\D/g, '');
  if (digits.length !== 12) {
    throw new Error(`Se requieren exactamente 12 dígitos para calcular check digit EAN-13 (recibido: ${digits.length}).`);
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(digits[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

/**
 * Normaliza un código PLU o sufijo numérico de SKU a exactamente 5 dígitos para balanzas electrónicas.
 */
export function deriveProductPlu5(product: Pick<Product, 'pluCode' | 'sku' | 'barcode'>): string {
  if (product.pluCode && /^\d{1,5}$/.test(product.pluCode.trim())) {
    return product.pluCode.trim().padStart(5, '0');
  }
  const skuDigits = String(product.sku || '').replace(/\D/g, '');
  if (skuDigits.length > 0) {
    return skuDigits.slice(-5).padStart(5, '0');
  }
  // Hash determinista de 5 dígitos (10000..99999) cuando el SKU es puramente alfabético (ej. RES-SOLOMO)
  let hash = 0;
  const seed = String(product.sku || product.barcode || 'SKU');
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 90000;
  }
  return String(10000 + Math.abs(hash)).slice(0, 5);
}

/**
 * Genera una etiqueta EAN-13 homologada para balanzas Systel, Bizerba, Toledo o Aclas:
 * - WEIGHT_GRAMS_20: '20' + PLU(5) + GRAMOS(5, máx 99.999 Kg) + CheckDigit(1)
 * - PRICE_CENTS_21:  '21' + PLU(5) + CENTAVOS_USD(5, máx $999.99) + CheckDigit(1)
 */
export function encodeScaleBarcode(params: {
  pluCode: string;
  mode?: ScaleBarcodeMode;
  weightKg?: number;
  totalPriceUsd?: number;
}): string {
  const mode = params.mode || 'WEIGHT_GRAMS_20';
  const plu5 = String(params.pluCode || '')
    .replace(/\D/g, '')
    .slice(-5)
    .padStart(5, '0');

  if (mode === 'PRICE_CENTS_21') {
    const cents = toDecimal(params.totalPriceUsd || 0)
      .times(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();
    const clampedCents = Math.max(0, Math.min(99999, cents));
    const payload12 = `21${plu5}${String(clampedCents).padStart(5, '0')}`;
    return `${payload12}${computeEan13CheckDigit(payload12)}`;
  }

  const grams = toDecimal(params.weightKg || 0)
    .times(1000)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  const clampedGrams = Math.max(0, Math.min(99999, grams));
  const payload12 = `20${plu5}${String(clampedGrams).padStart(5, '0')}`;
  return `${payload12}${computeEan13CheckDigit(payload12)}`;
}

/**
 * Decodifica un código EAN-13 estándar o de balanza de peso/precio variable (prefijos 20, 21, 22).
 * Si es prefijo 21/22 (importe codificado) y se suministra unitPriceUsd > 0, calcula el peso inverso en Kg con Decimal.js.
 */
export function decodeScaleBarcode(
  rawInput: string,
  unitPriceUsdForInverseWeight?: number
): DecodedScaleBarcode {
  const cleaned = String(rawInput || '').trim().replace(/\s+/g, '');

  if (!/^\d{13}$/.test(cleaned)) {
    return {
      rawBarcode: cleaned,
      isScaleVariableBarcode: false,
      prefix: 'STANDARD',
      mode: 'STANDARD_EAN',
      pluCode: '',
      weightKg: 1,
      checksumValid: false,
      expectedCheckDigit: 0,
    };
  }

  const first12 = cleaned.slice(0, 12);
  const actualCheck = Number(cleaned[12]);
  const expectedCheck = computeEan13CheckDigit(first12);
  const checksumValid = actualCheck === expectedCheck;

  const prefix2 = cleaned.slice(0, 2);
  const pluCode = cleaned.slice(2, 7);
  const value5 = cleaned.slice(7, 12);

  if (prefix2 === '20') {
    const grams = Number(value5);
    const weightKg = round3(toDecimal(grams).dividedBy(1000));
    return {
      rawBarcode: cleaned,
      isScaleVariableBarcode: true,
      prefix: '20',
      mode: 'WEIGHT_GRAMS_20',
      pluCode,
      weightKg,
      checksumValid,
      expectedCheckDigit: expectedCheck,
    };
  }

  if (prefix2 === '21' || prefix2 === '22') {
    const cents = Number(value5);
    const encodedTotalUsd = round2(toDecimal(cents).dividedBy(100));
    const unitPrice = toDecimal(unitPriceUsdForInverseWeight || 0);
    const weightKg = unitPrice.gt(0)
      ? round3(toDecimal(encodedTotalUsd).dividedBy(unitPrice))
      : 1;

    return {
      rawBarcode: cleaned,
      isScaleVariableBarcode: true,
      prefix: prefix2 as '21' | '22',
      mode: 'PRICE_CENTS_21',
      pluCode,
      weightKg,
      encodedTotalUsd,
      checksumValid,
      expectedCheckDigit: expectedCheck,
    };
  }

  return {
    rawBarcode: cleaned,
    isScaleVariableBarcode: false,
    prefix: 'STANDARD',
    mode: 'STANDARD_EAN',
    pluCode: '',
    weightKg: 1,
    checksumValid,
    expectedCheckDigit: expectedCheck,
  };
}

/**
 * Busca en el catálogo maestro un producto a partir de un código escaneado (EAN-13 fijo, SKU directo o etiqueta de balanza 20/21).
 */
export function resolveCatalogProductFromBarcode(
  scannedCode: string,
  products: Product[]
): {
  product: Product | null;
  decoded: DecodedScaleBarcode;
  effectiveQuantity: number;
} {
  const normalized = String(scannedCode || '').trim();
  const preDecoded = decodeScaleBarcode(normalized);

  if (preDecoded.isScaleVariableBarcode && preDecoded.pluCode) {
    const matchedScaleProduct =
      products.find((p) => deriveProductPlu5(p) === preDecoded.pluCode) || null;
    const finalDecoded =
      matchedScaleProduct && preDecoded.mode === 'PRICE_CENTS_21'
        ? decodeScaleBarcode(normalized, matchedScaleProduct.priceUsd)
        : preDecoded;

    return {
      product: matchedScaleProduct,
      decoded: finalDecoded,
      effectiveQuantity: finalDecoded.weightKg > 0 ? finalDecoded.weightKg : 1,
    };
  }

  const directMatch =
    products.find(
      (p) =>
        p.barcode === normalized ||
        p.sku.toUpperCase() === normalized.toUpperCase()
    ) || null;

  return {
    product: directMatch,
    decoded: preDecoded,
    effectiveQuantity: 1,
  };
}
