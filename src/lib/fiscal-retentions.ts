/**
 * Motor Tributario Venezolano de Retenciones Automáticas (IVA & ISLR)
 * Marco Legal Parametrizable:
 *   - IVA: Providencia Administrativa SNAT/2025/000054 (G.O. N° 43.171, vigente 01/08/2025).
 *   - ISLR: Decreto N° 1.808 (Reglamento Parcial de la LISLR en Materia de Retenciones, G.O. N° 36.203).
 * Exactitud Matemática: Decimal.js con ROUND_HALF_UP en Bolívares (Bs.) y referencia bimonetaria USD.
 * Copyright Oficial: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import {
  CompanyFiscalProfile,
  FilingFortnight,
  IslrConceptRule,
  PersonTaxType,
  PurchaseInvoice,
  Supplier,
  TaxpayerType,
  TaxRetentionLineDetail,
  TaxRetentionVoucher,
  UserRole,
} from '../types';
import {
  convertUsdToVes,
  convertVesToUsd,
  round2,
  toDecimal,
} from './decimal';
import { getCaracasNow } from './bcv';

export const DEFAULT_UT_VALUE_VES = 9.0;
export const DEFAULT_MANAGER_RETENTION_PINS = ['102030', '203040'];

export const ISLR_CONCEPTS_CATALOG: IslrConceptRule[] = [
  {
    code: 'SRV-FLETE',
    name: 'Flete y Transporte Terrestre Nacional de Carga',
    legalBasis: 'Decreto 1.808 Art. 9 Num. 13',
    pjRatePercent: 3,
    pnRatePercent: 1,
    pnAppliesSustraendo: true,
    pjMinBaseUt: 0,
    pnThresholdUtFactor: 83.3334,
  },
  {
    code: 'SRV-CONTRATISTA',
    name: 'Ejecución de Obras, Mantenimiento y Servicios Técnicos',
    legalBasis: 'Decreto 1.808 Art. 9 Num. 11',
    pjRatePercent: 2,
    pnRatePercent: 1,
    pnAppliesSustraendo: true,
    pjMinBaseUt: 0,
    pnThresholdUtFactor: 83.3334,
  },
  {
    code: 'SRV-HONORARIOS',
    name: 'Honorarios Profesionales No Mercantiles / Asesorías',
    legalBasis: 'Decreto 1.808 Art. 9 Num. 1',
    pjRatePercent: 5,
    pnRatePercent: 3,
    pnAppliesSustraendo: true,
    pjMinBaseUt: 0,
    pnThresholdUtFactor: 83.3334,
  },
  {
    code: 'SRV-ARRENDAMIENTO',
    name: 'Canon de Arrendamiento de Bienes Inmuebles Comerciales',
    legalBasis: 'Decreto 1.808 Art. 9 Num. 12',
    pjRatePercent: 5,
    pnRatePercent: 3,
    pnAppliesSustraendo: true,
    pjMinBaseUt: 0,
    pnThresholdUtFactor: 83.3334,
  },
  {
    code: 'SRV-PUBLICIDAD',
    name: 'Servicios de Publicidad, Mercadeo y Espacios Comerciales',
    legalBasis: 'Decreto 1.808 Art. 9 Num. 19',
    pjRatePercent: 5,
    pnRatePercent: 3,
    pnAppliesSustraendo: false,
    pjMinBaseUt: 0,
    pnThresholdUtFactor: 83.3334,
  },
];

/**
 * Valida la estructura del RIF venezolano (J, V, E, G, P, C + 7 a 9 dígitos + dígito verificador).
 */
export function isValidVenezuelanRif(rif: string | undefined | null): boolean {
  if (!rif) return false;
  const cleaned = rif.trim().toUpperCase();
  return /^[JVEGPC]-?\d{7,9}-?\d$/.test(cleaned);
}

/**
 * Extrae año, mes y día de una fecha en formato YYYY-MM-DD o DD/MM/YYYY.
 */
export function parseInvoiceDateParts(dateStr: string | undefined): {
  year: string;
  month: string;
  day: number;
  normalizedIso: string;
} {
  const trimmed = (dateStr || '').trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoMatch) {
    return {
      year: isoMatch[1],
      month: isoMatch[2],
      day: parseInt(isoMatch[3], 10),
      normalizedIso: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`,
    };
  }

  const latamMatch = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(trimmed);
  if (latamMatch) {
    return {
      year: latamMatch[3],
      month: latamMatch[2],
      day: parseInt(latamMatch[1], 10),
      normalizedIso: `${latamMatch[3]}-${latamMatch[2]}-${latamMatch[1]}`,
    };
  }

  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = now.getDate();
  return {
    year: y,
    month: m,
    day: d,
    normalizedIso: `${y}-${m}-${String(d).padStart(2, '0')}`,
  };
}

/**
 * Formatea el correlativo SENIAT de 14 caracteres exactos: AAAAMM + 8 dígitos con ceros a la izquierda.
 * Ejemplo: 20261000000001
 */
export function formatRetentionVoucherNumber(
  issueDateStr: string,
  sequenceNumber: number
): string {
  const { year, month } = parseInvoiceDateParts(issueDateStr);
  const safeSeq = Math.max(1, Math.floor(sequenceNumber));
  return `${year}${month}${String(safeSeq).padStart(8, '0')}`;
}

/**
 * Determina el período impositivo (AAAAMM) y la quincena de enteramiento ante el SENIAT.
 */
export function resolveFilingFortnight(issueDateStr: string): {
  periodYearMonth: string;
  fortnight: FilingFortnight;
  fortnightLabel: string;
  legalDeliveryHint: string;
} {
  const { year, month, day } = parseInvoiceDateParts(issueDateStr);
  const periodYearMonth = `${year}${month}`;
  const isFirst = day <= 15;

  return {
    periodYearMonth,
    fortnight: isFirst ? 'PRIMERA_QUINCENA' : 'SEGUNDA_QUINCENA',
    fortnightLabel: isFirst
      ? `1ra Quincena (01 al 15/${month}/${year})`
      : `2da Quincena (16 al Fin/${month}/${year})`,
    legalDeliveryHint:
      'Entrega obligatoria al proveedor dentro de los dos (2) días hábiles siguientes a la operación (SNAT/2025/000054).',
  };
}

/**
 * Infiere el tipo de persona fiscal a partir del prefijo del RIF cuando no está explícito.
 */
export function inferPersonTypeFromRif(
  rif: string | undefined,
  explicitType?: PersonTaxType
): PersonTaxType {
  if (explicitType) return explicitType;
  const upper = (rif || '').trim().toUpperCase();
  if (upper.startsWith('V') || upper.startsWith('E')) {
    return 'PN_RESIDENTE';
  }
  return 'PJ_DOMICILIADA';
}

/**
 * Determina el porcentaje legal de retención de IVA según SNAT/2025/000054:
 * - 0% si la empresa no es agente de retención de IVA o el proveedor es FORMAL.
 * - 100% si el IVA no viene discriminado, faltan requisitos formales (sin N° Control) o RIF inválido.
 * - 75% (o defaultIvaRetentionPercent) para contribuyentes ORDINARIO y ESPECIAL.
 */
export function resolveIvaRetentionRatePercent(params: {
  companyProfile: Partial<CompanyFiscalProfile>;
  supplierTaxpayerType: TaxpayerType;
  supplierRif: string;
  controlNumber: string;
  ivaUndiscriminated?: boolean;
  hasFormalDefects?: boolean;
}): number {
  const {
    companyProfile,
    supplierTaxpayerType,
    supplierRif,
    controlNumber,
    ivaUndiscriminated,
    hasFormalDefects,
  } = params;

  const isAgent =
    companyProfile.isSpecialTaxpayer !== false &&
    companyProfile.isIvaRetentionAgent !== false;

  if (!isAgent) {
    return 0;
  }
  if (supplierTaxpayerType === 'FORMAL') {
    return 0;
  }
  if (
    ivaUndiscriminated ||
    hasFormalDefects ||
    !controlNumber ||
    controlNumber.trim().length === 0 ||
    !isValidVenezuelanRif(supplierRif)
  ) {
    return 100;
  }

  return companyProfile.defaultIvaRetentionPercent === 100 ? 100 : 75;
}

export interface CalculateInvoiceRetentionsResult {
  updatedInvoice: PurchaseInvoice;
  ivaVoucher: TaxRetentionVoucher | null;
  islrVoucher: TaxRetentionVoucher | null;
  nextIvaSeqAfter: number;
  nextIslrSeqAfter: number;
}

/**
 * Motor puro que calcula las retenciones de IVA e ISLR de una factura de proveedor,
 * genera los comprobantes oficiales en Bs. y USD, y sincera el Neto a Pagar (CxP).
 */
export function calculateInvoiceRetentions(params: {
  invoice: PurchaseInvoice;
  supplier?: Partial<Supplier> | null;
  companyProfile: CompanyFiscalProfile;
  nextIvaSeq?: number;
  nextIslrSeq?: number;
  createdBy: string;
  customIslrCatalog?: IslrConceptRule[];
}): CalculateInvoiceRetentionsResult {
  const {
    invoice,
    supplier,
    companyProfile,
    createdBy,
    customIslrCatalog = ISLR_CONCEPTS_CATALOG,
  } = params;

  let currentIvaSeq = Math.max(
    1,
    params.nextIvaSeq ?? companyProfile.nextIvaVoucherSeq ?? 1
  );
  let currentIslrSeq = Math.max(
    1,
    params.nextIslrSeq ?? companyProfile.nextIslrVoucherSeq ?? 1
  );

  const bcvRate = invoice.bcvRateAtIssue > 0 ? invoice.bcvRateAtIssue : 36.5;
  const utValueVes =
    companyProfile.utValueVes && companyProfile.utValueVes > 0
      ? round2(companyProfile.utValueVes)
      : DEFAULT_UT_VALUE_VES;

  const supplierTaxpayerType: TaxpayerType =
    supplier?.taxpayerType || 'ORDINARIO';
  const supplierPersonType: PersonTaxType = inferPersonTypeFromRif(
    invoice.supplierRif || supplier?.rif,
    supplier?.personType
  );

  const ivaRetentionPercent = resolveIvaRetentionRatePercent({
    companyProfile,
    supplierTaxpayerType,
    supplierRif: invoice.supplierRif,
    controlNumber: invoice.controlNumber,
    ivaUndiscriminated: invoice.ivaUndiscriminated,
    hasFormalDefects: invoice.hasFormalDefects,
  });

  const hasExplicitLineRates = invoice.lines.some(
    (l) => l.ivaRate !== undefined
  );

  // Preparar desglose de líneas para IVA
  const ivaLineDetails: TaxRetentionLineDetail[] = [];
  let exemptAmountUsdDec = toDecimal(0);
  let taxableBase16UsdDec = toDecimal(0);
  let iva16UsdDec = toDecimal(0);
  let taxableBase8UsdDec = toDecimal(0);
  let iva8UsdDec = toDecimal(0);
  let totalIvaRetainedUsdDec = toDecimal(0);
  let totalIvaRetainedVesDec = toDecimal(0);

  if (hasExplicitLineRates || invoice.lines.length > 0) {
    const fallbackGlobalRate: 0 | 8 | 16 =
      !hasExplicitLineRates && invoice.ivaAmountUsd > 0 ? 16 : 0;

    // Si no hay alícuotas por línea pero sí un IVA global parcial (ej. factura mixta heredada)
    const sumLinesUsd = invoice.lines.reduce(
      (acc, l) => acc.plus(l.lineTotalUsd),
      toDecimal(0)
    );
    const full16OverAll = round2(sumLinesUsd.times('0.16'));
    const useHeaderSplitFallback =
      !hasExplicitLineRates &&
      invoice.ivaAmountUsd > 0 &&
      Math.abs(full16OverAll - invoice.ivaAmountUsd) > 0.05;

    if (useHeaderSplitFallback) {
      const inferredTaxableUsd = Math.min(
        round2(sumLinesUsd),
        round2(toDecimal(invoice.ivaAmountUsd).dividedBy('0.16'))
      );
      const inferredExemptUsd = Math.max(
        0,
        round2(sumLinesUsd.minus(inferredTaxableUsd))
      );
      const taxCausadoUsd = round2(invoice.ivaAmountUsd);
      const baseVes = convertUsdToVes(inferredTaxableUsd, bcvRate);
      const exemptVes = convertUsdToVes(inferredExemptUsd, bcvRate);
      const taxCausadoVes = convertUsdToVes(taxCausadoUsd, bcvRate);
      const retainedVes =
        supplierTaxpayerType === 'FORMAL'
          ? 0
          : round2(
              toDecimal(taxCausadoVes).times(ivaRetentionPercent).dividedBy(100)
            );
      const retainedUsd = convertVesToUsd(retainedVes, bcvRate);

      exemptAmountUsdDec = toDecimal(inferredExemptUsd);
      taxableBase16UsdDec = toDecimal(inferredTaxableUsd);
      iva16UsdDec = toDecimal(taxCausadoUsd);
      totalIvaRetainedVesDec = toDecimal(retainedVes);
      totalIvaRetainedUsdDec = toDecimal(retainedUsd);

      ivaLineDetails.push({
        lineId: 'iva-hdr-1',
        sku: 'GLOBAL',
        description: `Resumen Fiscal Factura ${invoice.invoiceNumber}`,
        lineType: 'BIEN',
        baseAmountUsd: inferredTaxableUsd,
        baseAmountVes: baseVes,
        exemptAmountUsd: inferredExemptUsd,
        exemptAmountVes: exemptVes,
        taxRatePercent: 16,
        taxCausadoUsd,
        taxCausadoVes,
        retentionRatePercent: ivaRetentionPercent,
        sustraendoVes: 0,
        retainedAmountUsd: retainedUsd,
        retainedAmountVes: retainedVes,
      });
    } else {
      invoice.lines.forEach((line, idx) => {
        const lineRate: 0 | 8 | 16 =
          supplierTaxpayerType === 'FORMAL'
            ? 0
            : line.ivaRate !== undefined
            ? line.ivaRate
            : fallbackGlobalRate;

        const lineSubUsd = round2(line.lineTotalUsd);
        const isExempt = lineRate === 0;
        const baseUsd = isExempt ? 0 : lineSubUsd;
        const exemptUsd = isExempt ? lineSubUsd : 0;
        const taxCausadoUsd = isExempt
          ? 0
          : round2(toDecimal(baseUsd).times(lineRate).dividedBy(100));

        const baseVes = convertUsdToVes(baseUsd, bcvRate);
        const exemptVes = convertUsdToVes(exemptUsd, bcvRate);
        const taxCausadoVes = round2(
          toDecimal(baseVes).times(lineRate).dividedBy(100)
        );
        const retainedVes = isExempt
          ? 0
          : round2(
              toDecimal(taxCausadoVes).times(ivaRetentionPercent).dividedBy(100)
            );
        const retainedUsd = isExempt ? 0 : convertVesToUsd(retainedVes, bcvRate);

        if (isExempt) {
          exemptAmountUsdDec = exemptAmountUsdDec.plus(exemptUsd);
        } else if (lineRate === 16) {
          taxableBase16UsdDec = taxableBase16UsdDec.plus(baseUsd);
          iva16UsdDec = iva16UsdDec.plus(taxCausadoUsd);
        } else if (lineRate === 8) {
          taxableBase8UsdDec = taxableBase8UsdDec.plus(baseUsd);
          iva8UsdDec = iva8UsdDec.plus(taxCausadoUsd);
        }

        totalIvaRetainedVesDec = totalIvaRetainedVesDec.plus(retainedVes);
        totalIvaRetainedUsdDec = totalIvaRetainedUsdDec.plus(retainedUsd);

        ivaLineDetails.push({
          lineId: line.id || `ln-${idx + 1}`,
          sku: line.sku,
          description: line.description,
          lineType: line.lineType || 'BIEN',
          baseAmountUsd: baseUsd,
          baseAmountVes: baseVes,
          exemptAmountUsd: exemptUsd,
          exemptAmountVes: exemptVes,
          taxRatePercent: lineRate,
          taxCausadoUsd,
          taxCausadoVes,
          retentionRatePercent: isExempt ? 0 : ivaRetentionPercent,
          sustraendoVes: 0,
          retainedAmountUsd: retainedUsd,
          retainedAmountVes: retainedVes,
        });
      });
    }
  }

  // Cálculo de ISLR (estrictamente sobre líneas de SERVICIO si la empresa es agente ISLR)
  const isIslrAgent = companyProfile.isIslrRetentionAgent !== false;
  const islrLineDetails: TaxRetentionLineDetail[] = [];
  let totalIslrBaseUsdDec = toDecimal(0);
  let totalIslrBaseVesDec = toDecimal(0);
  let totalIslrBrutoVesDec = toDecimal(0);
  let totalIslrSustraendoVesDec = toDecimal(0);
  let totalIslrRetainedVesDec = toDecimal(0);
  let totalIslrRetainedUsdDec = toDecimal(0);
  let primaryIslrPercent = 0;

  if (isIslrAgent) {
    invoice.lines.forEach((line, idx) => {
      if (line.lineType !== 'SERVICIO') {
        return; // La compra de mercancía (BIEN) NO está sujeta a retención de ISLR (Decreto 1.808)
      }

      const conceptCode =
        line.islrConceptCode || supplier?.defaultIslrConceptCode || 'SRV-CONTRATISTA';
      const conceptRule =
        customIslrCatalog.find((c) => c.code === conceptCode) ||
        customIslrCatalog[0];

      const ratePercent =
        supplierPersonType === 'PN_RESIDENTE'
          ? conceptRule.pnRatePercent
          : conceptRule.pjRatePercent;

      primaryIslrPercent = ratePercent;

      const baseUsd = round2(line.lineTotalUsd);
      const baseVes = convertUsdToVes(baseUsd, bcvRate);
      const brutoVes = round2(toDecimal(baseVes).times(ratePercent).dividedBy(100));

      let sustraendoVes = 0;
      let retainedVes = brutoVes;

      if (
        supplierPersonType === 'PN_RESIDENTE' &&
        conceptRule.pnAppliesSustraendo
      ) {
        const minThresholdVes = round2(
          toDecimal(conceptRule.pnThresholdUtFactor).times(utValueVes)
        );
        if (baseVes <= minThresholdVes) {
          retainedVes = 0;
          sustraendoVes = 0;
        } else {
          sustraendoVes = round2(
            toDecimal(utValueVes)
              .times(conceptRule.pnThresholdUtFactor)
              .times(ratePercent)
              .dividedBy(100)
          );
          retainedVes = Math.max(
            0,
            round2(toDecimal(brutoVes).minus(sustraendoVes))
          );
        }
      }

      const retainedUsd = convertVesToUsd(retainedVes, bcvRate);
      const brutoUsd = convertVesToUsd(brutoVes, bcvRate);

      totalIslrBaseUsdDec = totalIslrBaseUsdDec.plus(baseUsd);
      totalIslrBaseVesDec = totalIslrBaseVesDec.plus(baseVes);
      totalIslrBrutoVesDec = totalIslrBrutoVesDec.plus(brutoVes);
      totalIslrSustraendoVesDec = totalIslrSustraendoVesDec.plus(sustraendoVes);
      totalIslrRetainedVesDec = totalIslrRetainedVesDec.plus(retainedVes);
      totalIslrRetainedUsdDec = totalIslrRetainedUsdDec.plus(retainedUsd);

      islrLineDetails.push({
        lineId: line.id || `islr-ln-${idx + 1}`,
        sku: line.sku,
        description: line.description,
        lineType: 'SERVICIO',
        baseAmountUsd: baseUsd,
        baseAmountVes: baseVes,
        exemptAmountUsd: 0,
        exemptAmountVes: 0,
        taxRatePercent: ratePercent,
        taxCausadoUsd: brutoUsd,
        taxCausadoVes: brutoVes,
        retentionRatePercent: ratePercent,
        sustraendoVes,
        retainedAmountUsd: retainedUsd,
        retainedAmountVes: retainedVes,
        conceptCode: conceptRule.code,
        conceptName: conceptRule.name,
      });
    });
  }

  // Totales recalculados de factura si tiene alícuotas explícitas
  const computedSubtotalUsd = round2(
    exemptAmountUsdDec.plus(taxableBase16UsdDec).plus(taxableBase8UsdDec)
  );
  const computedIvaUsd = round2(iva16UsdDec.plus(iva8UsdDec));

  const finalSubtotalUsd = hasExplicitLineRates
    ? computedSubtotalUsd
    : round2(invoice.subtotalUsd);
  const finalIvaUsd = hasExplicitLineRates
    ? computedIvaUsd
    : supplierTaxpayerType === 'FORMAL'
    ? 0
    : round2(invoice.ivaAmountUsd);
  const finalTotalUsd = hasExplicitLineRates
    ? round2(
        toDecimal(finalSubtotalUsd)
          .plus(finalIvaUsd)
          .plus(invoice.igtfAmountUsd || 0)
      )
    : supplierTaxpayerType === 'FORMAL'
    ? round2(toDecimal(finalSubtotalUsd).plus(invoice.igtfAmountUsd || 0))
    : round2(invoice.totalUsd);

  const finalTotalVes = convertUsdToVes(finalTotalUsd, bcvRate);

  const ivaRetainedVes = round2(totalIvaRetainedVesDec);
  const ivaRetainedUsd = round2(totalIvaRetainedUsdDec);
  const islrRetainedVes = round2(totalIslrRetainedVesDec);
  const islrRetainedUsd = round2(totalIslrRetainedUsdDec);

  const totalRetainedUsd = round2(
    toDecimal(ivaRetainedUsd).plus(islrRetainedUsd)
  );
  const totalRetainedVes = round2(
    toDecimal(ivaRetainedVes).plus(islrRetainedVes)
  );

  const netPayableUsd = Math.max(
    0,
    round2(toDecimal(finalTotalUsd).minus(totalRetainedUsd))
  );
  const netPayableVes = Math.max(
    0,
    round2(toDecimal(finalTotalVes).minus(totalRetainedVes))
  );

  const caracasNow = getCaracasNow();
  const createdAtVet = `${caracasNow.dateFormatted} ${caracasNow.timeFormatted}`;
  const filing = resolveFilingFortnight(invoice.issueDate);

  let ivaVoucher: TaxRetentionVoucher | null = null;
  if (ivaRetainedVes > 0) {
    const voucherNumber = formatRetentionVoucherNumber(
      invoice.issueDate,
      currentIvaSeq
    );
    currentIvaSeq += 1;

    const taxableUsd = round2(taxableBase16UsdDec.plus(taxableBase8UsdDec));
    const taxableVes = convertUsdToVes(taxableUsd, bcvRate);
    const exemptUsd = round2(exemptAmountUsdDec);
    const exemptVes = convertUsdToVes(exemptUsd, bcvRate);
    const taxCausadoVes = convertUsdToVes(finalIvaUsd, bcvRate);

    ivaVoucher = {
      id: `ret-iva-${voucherNumber}-${Math.floor(Math.random() * 1000)}`,
      voucherNumber,
      type: 'IVA',
      legalNormative:
        'Providencia Administrativa SNAT/2025/000054 (G.O. N° 43.171)',
      status: 'EMITIDO',
      issueDate: parseInvoiceDateParts(invoice.issueDate).normalizedIso,
      periodYearMonth: filing.periodYearMonth,
      fortnight: filing.fortnight,
      fortnightLabel: filing.fortnightLabel,
      legalDeliveryHint: filing.legalDeliveryHint,
      agentRazonSocial: companyProfile.razonSocial,
      agentRif: companyProfile.rif,
      agentAddress: companyProfile.direccionFiscal,
      supplierId: invoice.supplierId,
      supplierName: invoice.supplierName,
      supplierRif: invoice.supplierRif,
      supplierTaxpayerType,
      supplierPersonType,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      controlNumber: invoice.controlNumber || 'SIN-CONTROL',
      invoiceIssueDate: invoice.issueDate,
      bcvRateAtIssue: bcvRate,
      utValueVes,
      lines: ivaLineDetails,
      invoiceTotalUsd: finalTotalUsd,
      invoiceTotalVes: finalTotalVes,
      exemptTotalUsd: exemptUsd,
      exemptTotalVes: exemptVes,
      taxableBaseUsd: taxableUsd,
      taxableBaseVes: taxableVes,
      taxCausadoTotalUsd: finalIvaUsd,
      taxCausadoTotalVes: taxCausadoVes,
      sustraendoTotalVes: 0,
      retainedTotalUsd: ivaRetainedUsd,
      retainedTotalVes: ivaRetainedVes,
      retentionPercentApplied: ivaRetentionPercent,
      netPayableAfterAllRetentionsUsd: netPayableUsd,
      netPayableAfterAllRetentionsVes: netPayableVes,
      createdBy,
      createdAtVet,
    };
  }

  let islrVoucher: TaxRetentionVoucher | null = null;
  if (islrRetainedVes > 0) {
    const voucherNumber = formatRetentionVoucherNumber(
      invoice.issueDate,
      currentIslrSeq
    );
    currentIslrSeq += 1;

    islrVoucher = {
      id: `ret-islr-${voucherNumber}-${Math.floor(Math.random() * 1000)}`,
      voucherNumber,
      type: 'ISLR',
      legalNormative:
        'Decreto N° 1.808 — Reglamento Parcial LISLR en Materia de Retenciones (G.O. N° 36.203)',
      status: 'EMITIDO',
      issueDate: parseInvoiceDateParts(invoice.issueDate).normalizedIso,
      periodYearMonth: filing.periodYearMonth,
      fortnight: filing.fortnight,
      fortnightLabel: filing.fortnightLabel,
      legalDeliveryHint:
        'Comprobante de retención de ISLR para declaración mensual SENIAT antes de los primeros diez (10) días continuos del mes siguiente.',
      agentRazonSocial: companyProfile.razonSocial,
      agentRif: companyProfile.rif,
      agentAddress: companyProfile.direccionFiscal,
      supplierId: invoice.supplierId,
      supplierName: invoice.supplierName,
      supplierRif: invoice.supplierRif,
      supplierTaxpayerType,
      supplierPersonType,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      controlNumber: invoice.controlNumber || 'SIN-CONTROL',
      invoiceIssueDate: invoice.issueDate,
      bcvRateAtIssue: bcvRate,
      utValueVes,
      lines: islrLineDetails,
      invoiceTotalUsd: finalTotalUsd,
      invoiceTotalVes: finalTotalVes,
      exemptTotalUsd: 0,
      exemptTotalVes: 0,
      taxableBaseUsd: round2(totalIslrBaseUsdDec),
      taxableBaseVes: round2(totalIslrBaseVesDec),
      taxCausadoTotalUsd: convertVesToUsd(totalIslrBrutoVesDec, bcvRate),
      taxCausadoTotalVes: round2(totalIslrBrutoVesDec),
      sustraendoTotalVes: round2(totalIslrSustraendoVesDec),
      retainedTotalUsd: islrRetainedUsd,
      retainedTotalVes: islrRetainedVes,
      retentionPercentApplied: primaryIslrPercent,
      netPayableAfterAllRetentionsUsd: netPayableUsd,
      netPayableAfterAllRetentionsVes: netPayableVes,
      createdBy,
      createdAtVet,
    };
  }

  const updatedInvoice: PurchaseInvoice = {
    ...invoice,
    subtotalUsd: finalSubtotalUsd,
    ivaAmountUsd: finalIvaUsd,
    totalUsd: finalTotalUsd,
    exemptAmountUsd: round2(exemptAmountUsdDec),
    taxableBase16Usd: round2(taxableBase16UsdDec),
    iva16Usd: round2(iva16UsdDec),
    taxableBase8Usd: round2(taxableBase8UsdDec),
    iva8Usd: round2(iva8UsdDec),
    ivaRetentionId: ivaVoucher?.id,
    islrRetentionId: islrVoucher?.id,
    ivaRetainedUsd,
    islrRetainedUsd,
    totalRetainedUsd,
    netPayableUsd,
  };

  return {
    updatedInvoice,
    ivaVoucher,
    islrVoucher,
    nextIvaSeqAfter: currentIvaSeq,
    nextIslrSeqAfter: currentIslrSeq,
  };
}

/**
 * Anula un comprobante de retención conservando de forma inmutable su número correlativo
 * de 14 dígitos (prohibido reutilizar numeración fiscal anulada) y revirtiendo el pasivo neto.
 */
export function voidRetentionVoucherWithPin(params: {
  voucher: TaxRetentionVoucher;
  actor: { uid: string; displayName: string; role: UserRole; pin?: string };
  managerPin: string;
  reason: string;
  validPins?: string[];
  voidedAtVet: string;
}): TaxRetentionVoucher {
  const {
    voucher,
    actor,
    managerPin,
    reason,
    validPins = DEFAULT_MANAGER_RETENTION_PINS,
    voidedAtVet,
  } = params;

  if (voucher.status === 'ANULADO') {
    throw new Error('El comprobante ya se encuentra en estado ANULADO.');
  }
  if (!reason || reason.trim().length < 5) {
    throw new Error('Debe especificar un motivo fiscal válido (mínimo 5 caracteres) para anular.');
  }

  const allowedPins = new Set<string>(validPins);
  if (
    (actor.role === UserRole.SUPERADMIN || actor.role === UserRole.GERENTE) &&
    actor.pin
  ) {
    allowedPins.add(actor.pin);
  }

  if (!managerPin || !allowedPins.has(managerPin.trim())) {
    throw new Error(
      'PIN Gerencial inválido. Solo Gerencia o SuperAdmin pueden anular un comprobante fiscal SENIAT.'
    );
  }

  return {
    ...voucher,
    status: 'ANULADO',
    voidedAtVet,
    voidedBy: actor.displayName,
    voidReason: reason.trim(),
  };
}
