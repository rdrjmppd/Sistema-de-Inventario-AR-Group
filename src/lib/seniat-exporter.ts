import XLSXStyle from 'xlsx-js-style';
import type * as XLSXTypes from 'xlsx-js-style';
import {
  CompanyFiscalProfile,
  FilingFortnight,
  FiscalZReportRecord,
  PurchaseInvoice,
  SeniatPortalExportBundle,
  SeniatTxtValidationIssue,
  TaxRetentionVoucher,
} from '../types';
import { round2, toDecimal } from './decimal';
import { COPYRIGHT_NOTICE, EXCEL_INSTITUTIONAL_WATERMARK_ROW, resolveCompanyProfile } from './excel-exporter';
import { BRAND_COLORS } from './brand-assets';

const XLSX: typeof XLSXTypes = ((XLSXStyle as unknown as { default?: typeof XLSXTypes }).default ||
  XLSXStyle) as typeof XLSXTypes;

/**
 * Normaliza un RIF venezolano para el archivo plano/XML del portal SENIAT (10 caracteres sin guiones, ej. J501234567).
 */
export function formatSeniatCompactRif(rawRif: string): string {
  const cleaned = String(rawRif || '')
    .toUpperCase()
    .replace(/[^VEJPGC0-9]/g, '');
  return cleaned;
}

export function isValidSeniatCompactRif(compactRif: string): boolean {
  return /^[VEJPGC]\d{9}$/.test(compactRif);
}

function formatDateIso(dateStr: string): string {
  const trimmed = String(dateStr || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const ddmmyyyy = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }
  const isoPrefix = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoPrefix)) return isoPrefix;
  return '2026-10-29';
}

function formatDateDdMmYyyy(dateStr: string): string {
  const iso = formatDateIso(dateStr);
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function sanitizeSeniatDocToken(raw: string, fallback = '0'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[\t\r\n]/g, '')
    .replace(/\s+/g, '');
  return cleaned || fallback;
}

const ISLR_SENIAT_XML_CODE_MAP: Record<string, string> = {
  'SRV-FLETE': '053',
  'SRV-CONTRATISTA': '055',
  'SRV-HONORARIOS': '001',
  'SRV-ARRENDAMIENTO': '017',
  'SRV-PUBLICIDAD': '065',
};

export function resolveOfficialSeniatIslrXmlCode(internalConceptCode?: string): string {
  if (!internalConceptCode) return '053';
  const trimmed = internalConceptCode.trim().toUpperCase();
  if (/^\d{3}$/.test(trimmed)) return trimmed;
  return ISLR_SENIAT_XML_CODE_MAP[trimmed] || '053';
}

/**
 * Genera el archivo plano .TXT de Retenciones de IVA (14 columnas separadas por tabulador, sin encabezados)
 * homologado para carga quincenal en declaraciones.seniat.gob.ve (Providencia SNAT/2025/000054).
 */
export function buildSeniatIvaTxtExport(params: {
  vouchers: TaxRetentionVoucher[];
  companyProfile?: Partial<CompanyFiscalProfile> | null;
  periodYearMonth: string;
  fortnight?: FilingFortnight;
}): SeniatPortalExportBundle {
  const profile = resolveCompanyProfile(params.companyProfile);
  const agentRif = formatSeniatCompactRif(profile.rif);
  const period = String(params.periodYearMonth || '').replace(/[^0-9]/g, '').slice(0, 6);
  const issues: SeniatTxtValidationIssue[] = [];

  if (!isValidSeniatCompactRif(agentRif)) {
    issues.push({
      voucherNumber: 'AGENTE',
      invoiceNumber: '-',
      field: 'agentRif',
      message: `El RIF del Agente de Retención (${profile.rif}) no cumple el formato SENIAT de 10 caracteres sin guiones.`,
      severity: 'ERROR',
    });
  }

  if (!/^\d{6}$/.test(period)) {
    issues.push({
      voucherNumber: 'PERIODO',
      invoiceNumber: '-',
      field: 'periodYearMonth',
      message: `El período impositivo (${params.periodYearMonth}) debe tener formato AAAAMM (6 dígitos).`,
      severity: 'ERROR',
    });
  }

  const eligible = params.vouchers.filter((v) => {
    if (v.type !== 'IVA') return false;
    if (v.status === 'ANULADO') return false;
    if (v.periodYearMonth !== period) return false;
    if (params.fortnight && v.fortnight !== params.fortnight) return false;
    return true;
  });

  const rows: string[] = [];
  let totalRetainedDec = toDecimal(0);
  let totalBaseDec = toDecimal(0);

  for (const v of eligible) {
    const supplierRif = formatSeniatCompactRif(v.supplierRif);
    if (!isValidSeniatCompactRif(supplierRif)) {
      issues.push({
        voucherNumber: v.voucherNumber,
        invoiceNumber: v.invoiceNumber,
        field: 'supplierRif',
        message: `RIF del proveedor inválido para SENIAT (${v.supplierRif}).`,
        severity: 'ERROR',
      });
    }

    const voucherNum = sanitizeSeniatDocToken(v.voucherNumber);
    if (!/^\d{14}$/.test(voucherNum)) {
      issues.push({
        voucherNumber: v.voucherNumber,
        invoiceNumber: v.invoiceNumber,
        field: 'voucherNumber',
        message: `El número de comprobante (${voucherNum}) debe tener exactamente 14 dígitos numéricos.`,
        severity: 'ERROR',
      });
    }

    const invoiceDate = formatDateIso(v.invoiceIssueDate || v.issueDate);
    const invoiceNum = sanitizeSeniatDocToken(v.invoiceNumber, 'SIN-NUM');
    const controlNum = sanitizeSeniatDocToken(v.controlNumber, '0');

    // Si el comprobante tiene múltiples alícuotas gravadas, agrupamos por tasa; de lo contrario emitimos la línea consolidada
    const groupedByRate = new Map<
      number,
      { baseVes: number; retainedVes: number; exemptVes: number; taxVes: number }
    >();

    if (v.lines && v.lines.length > 0) {
      for (const ln of v.lines) {
        const rate = Number(ln.taxRatePercent || 0);
        const current = groupedByRate.get(rate) || {
          baseVes: 0,
          retainedVes: 0,
          exemptVes: 0,
          taxVes: 0,
        };
        current.baseVes = round2(toDecimal(current.baseVes).plus(ln.baseAmountVes));
        current.retainedVes = round2(toDecimal(current.retainedVes).plus(ln.retainedAmountVes));
        current.exemptVes = round2(toDecimal(current.exemptVes).plus(ln.exemptAmountVes));
        current.taxVes = round2(toDecimal(current.taxVes).plus(ln.taxCausadoVes));
        groupedByRate.set(rate, current);
      }
    }

    if (groupedByRate.size === 0) {
      groupedByRate.set(v.lines?.[0]?.taxRatePercent ?? 16, {
        baseVes: round2(v.taxableBaseVes),
        retainedVes: round2(v.retainedTotalVes),
        exemptVes: round2(v.exemptTotalVes),
        taxVes: round2(v.taxCausadoTotalVes),
      });
    }

    const taxableRates = Array.from(groupedByRate.entries()).filter(
      ([rate, grp]) => rate > 0 || grp.retainedVes > 0
    );

    if (taxableRates.length === 0) {
      issues.push({
        voucherNumber: v.voucherNumber,
        invoiceNumber: v.invoiceNumber,
        field: 'retainedTotalVes',
        message: 'Comprobante con retención Bs. 0.00 omitido de carga gravada.',
        severity: 'ADVERTENCIA',
      });
      continue;
    }

    let exemptAssigned = false;
    for (const [rate, grp] of taxableRates) {
      const exemptForRow = !exemptAssigned ? round2(v.exemptTotalVes) : 0;
      exemptAssigned = true;
      const docTotalForRow = round2(
        toDecimal(grp.baseVes).plus(grp.taxVes).plus(exemptForRow)
      );

      totalBaseDec = totalBaseDec.plus(grp.baseVes);
      totalRetainedDec = totalRetainedDec.plus(grp.retainedVes);

      const cols14 = [
        agentRif, // 1. RIF Agente
        period, // 2. Período AAAAMM
        invoiceDate, // 3. Fecha Factura AAAA-MM-DD
        'C', // 4. Tipo Operación (Compra)
        '01', // 5. Tipo Documento (01 Factura)
        supplierRif, // 6. RIF Proveedor
        invoiceNum, // 7. Número Factura
        controlNum, // 8. Número Control
        docTotalForRow.toFixed(2), // 9. Monto Total Documento VES
        round2(grp.baseVes).toFixed(2), // 10. Base Imponible VES
        round2(grp.retainedVes).toFixed(2), // 11. Monto IVA Retenido VES
        '0', // 12. Documento Afectado ("0" en facturas)
        voucherNum, // 13. Comprobante 14 dígitos
        exemptForRow.toFixed(2), // 14. Monto Exento VES
        round2(rate).toFixed(2), // 15. Alícuota % (requerida por validador SENIAT vigente: 16 columnas o 14+alícuota+expediente)
        '0', // 16. Número de Expediente Importación ("0" compras internas)
      ];

      rows.push(cols14.join('\t'));
    }
  }

  const fortnightSuffix = params.fortnight === 'PRIMERA_QUINCENA' ? 'Q1' : params.fortnight === 'SEGUNDA_QUINCENA' ? 'Q2' : 'MES';

  return {
    periodYearMonth: period,
    fortnight: params.fortnight,
    fileName: `SENIAT_IVA_${agentRif}_${period}_${fortnightSuffix}.txt`,
    mimeType: 'text/plain;charset=utf-8',
    content: rows.join('\r\n'),
    recordsCount: rows.length,
    totalRetainedVes: round2(totalRetainedDec),
    totalTaxableBaseVes: round2(totalBaseDec),
    validationIssues: issues,
  };
}

function escapeXml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Genera el archivo .XML oficial de Relación Mensual de Retenciones de ISLR (Decreto 1.808)
 * homologado para el portal SENIAT (<RelacionRetencionesISLR RifAgente="..." Periodo="AAAAMM">).
 */
export function buildSeniatIslrXmlExport(params: {
  vouchers: TaxRetentionVoucher[];
  companyProfile?: Partial<CompanyFiscalProfile> | null;
  periodYearMonth: string;
}): SeniatPortalExportBundle {
  const profile = resolveCompanyProfile(params.companyProfile);
  const agentRif = formatSeniatCompactRif(profile.rif);
  const period = String(params.periodYearMonth || '').replace(/[^0-9]/g, '').slice(0, 6);
  const issues: SeniatTxtValidationIssue[] = [];

  if (!isValidSeniatCompactRif(agentRif)) {
    issues.push({
      voucherNumber: 'AGENTE',
      invoiceNumber: '-',
      field: 'agentRif',
      message: `El RIF del Agente (${profile.rif}) no posee el formato compacto SENIAT válido.`,
      severity: 'ERROR',
    });
  }

  const eligible = params.vouchers.filter(
    (v) => v.type === 'ISLR' && v.status !== 'ANULADO' && v.periodYearMonth === period
  );

  const xmlItems: string[] = [];
  let totalRetainedDec = toDecimal(0);
  let totalBaseDec = toDecimal(0);

  for (const v of eligible) {
    const supplierRif = formatSeniatCompactRif(v.supplierRif);
    if (!isValidSeniatCompactRif(supplierRif)) {
      issues.push({
        voucherNumber: v.voucherNumber,
        invoiceNumber: v.invoiceNumber,
        field: 'supplierRif',
        message: `RIF del sujeto retenido inválido (${v.supplierRif}).`,
        severity: 'ERROR',
      });
    }

    const serviceLines = (v.lines || []).filter(
      (ln) => ln.lineType === 'SERVICIO' && ln.baseAmountVes > 0
    );

    const effectiveLines =
      serviceLines.length > 0
        ? serviceLines
        : [
            {
              baseAmountVes: v.taxableBaseVes,
              retentionRatePercent: v.retentionPercentApplied,
              retainedAmountVes: v.retainedTotalVes,
              conceptCode: 'SRV-FLETE',
            },
          ];

    for (const ln of effectiveLines) {
      const xmlCode = resolveOfficialSeniatIslrXmlCode(ln.conceptCode);
      const numeroFactura = sanitizeSeniatDocToken(v.invoiceNumber, '0').slice(0, 10);
      const numeroControl = sanitizeSeniatDocToken(v.controlNumber, 'NA')
        .replace(/[^A-Z0-9]/gi, '')
        .slice(0, 8) || 'NA';
      const fechaOperacion = formatDateDdMmYyyy(v.invoiceIssueDate || v.issueDate);

      totalBaseDec = totalBaseDec.plus(ln.baseAmountVes);
      totalRetainedDec = totalRetainedDec.plus(ln.retainedAmountVes);

      xmlItems.push(
        [
          '  <DetalleRetencion>',
          `    <RifRetenido>${escapeXml(supplierRif)}</RifRetenido>`,
          `    <NumeroFactura>${escapeXml(numeroFactura)}</NumeroFactura>`,
          `    <NumeroControl>${escapeXml(numeroControl)}</NumeroControl>`,
          `    <FechaOperacion>${escapeXml(fechaOperacion)}</FechaOperacion>`,
          `    <CodigoConcepto>${escapeXml(xmlCode)}</CodigoConcepto>`,
          `    <MontoOperacion>${round2(ln.baseAmountVes).toFixed(2)}</MontoOperacion>`,
          `    <PorcentajeRetencion>${round2(ln.retentionRatePercent).toFixed(2)}</PorcentajeRetencion>`,
          '  </DetalleRetencion>',
        ].join('\n')
      );
    }
  }

  const xmlDocument = [
    '<?xml version="1.0" encoding="ISO-8859-1"?>',
    `<RelacionRetencionesISLR RifAgente="${escapeXml(agentRif)}" Periodo="${escapeXml(period)}">`,
    ...xmlItems,
    '</RelacionRetencionesISLR>',
  ].join('\n');

  return {
    periodYearMonth: period,
    fileName: `SENIAT_ISLR_${agentRif}_${period}.xml`,
    mimeType: 'application/xml;charset=utf-8',
    content: xmlDocument,
    recordsCount: xmlItems.length,
    totalRetainedVes: round2(totalRetainedDec),
    totalTaxableBaseVes: round2(totalBaseDec),
    validationIssues: issues,
  };
}

/**
 * Construye el Libro de Compras SENIAT en formato .xlsx corporativo con membrete oficial y totales auditados Decimal.js.
 */
export function buildSeniatPurchaseBookWorkbook(params: {
  invoices: PurchaseInvoice[];
  vouchers: TaxRetentionVoucher[];
  companyProfile?: Partial<CompanyFiscalProfile> | null;
  periodYearMonth: string;
}): XLSXTypes.WorkBook {
  const profile = resolveCompanyProfile(params.companyProfile);
  const period = String(params.periodYearMonth || '').slice(0, 6);
  const periodPrefix = `${period.slice(0, 4)}-${period.slice(4, 6)}`;

  const periodInvoices = params.invoices.filter((inv) =>
    formatDateIso(inv.issueDate).startsWith(periodPrefix)
  );

  const headerStyle = {
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    fill: { fgColor: { rgb: BRAND_COLORS.midnightBlue.replace('#', '') } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  };

  const aoa: Array<Array<string | number>> = [
    EXCEL_INSTITUTIONAL_WATERMARK_ROW,
    [`LIBRO ESPECIAL DE COMPRAS SENIAT — PERÍODO FISCAL ${periodPrefix}`],
    [`CONTRIBUYENTE ESPECIAL: ${profile.razonSocial} | RIF: ${profile.rif}`],
    [`DIRECCIÓN FISCAL: ${profile.direccionFiscal}`],
    [],
    [
      'N° Op.',
      'Fecha Factura',
      'RIF Proveedor',
      'Nombre o Razón Social',
      'N° Factura',
      'N° Control',
      'Tasa BCV',
      'Total Compra c/IVA (Bs.)',
      'Compras Exentas (Bs.)',
      'Base Imponible 16% (Bs.)',
      'IVA 16% (Bs.)',
      'Base Imponible 8% (Bs.)',
      'IVA 8% (Bs.)',
      'N° Comprobante IVA',
      'IVA Retenido (Bs.)',
      'ISLR Retenido (Bs.)',
      'Neto Pagadero (USD)',
    ],
  ];

  let sumTotalVes = toDecimal(0);
  let sumExemptVes = toDecimal(0);
  let sumBase16Ves = toDecimal(0);
  let sumIva16Ves = toDecimal(0);
  let sumBase8Ves = toDecimal(0);
  let sumIva8Ves = toDecimal(0);
  let sumIvaRetVes = toDecimal(0);
  let sumIslrRetVes = toDecimal(0);
  let sumNetUsd = toDecimal(0);

  periodInvoices.forEach((inv, idx) => {
    const rate = inv.bcvRateAtIssue > 0 ? inv.bcvRateAtIssue : 1;
    const totalVes = round2(toDecimal(inv.totalUsd).times(rate));
    const exemptVes = round2(toDecimal(inv.exemptAmountUsd || 0).times(rate));
    const base16Ves = round2(toDecimal(inv.taxableBase16Usd ?? inv.subtotalUsd).times(rate));
    const iva16Ves = round2(toDecimal(inv.iva16Usd ?? inv.ivaAmountUsd).times(rate));
    const base8Ves = round2(toDecimal(inv.taxableBase8Usd || 0).times(rate));
    const iva8Ves = round2(toDecimal(inv.iva8Usd || 0).times(rate));

    const ivaVoucher = params.vouchers.find(
      (v) => v.invoiceId === inv.id && v.type === 'IVA' && v.status !== 'ANULADO'
    );
    const islrVoucher = params.vouchers.find(
      (v) => v.invoiceId === inv.id && v.type === 'ISLR' && v.status !== 'ANULADO'
    );

    const ivaRetVes = ivaVoucher ? round2(ivaVoucher.retainedTotalVes) : 0;
    const islrRetVes = islrVoucher ? round2(islrVoucher.retainedTotalVes) : 0;
    const netUsd = round2(inv.netPayableUsd ?? inv.totalUsd);

    sumTotalVes = sumTotalVes.plus(totalVes);
    sumExemptVes = sumExemptVes.plus(exemptVes);
    sumBase16Ves = sumBase16Ves.plus(base16Ves);
    sumIva16Ves = sumIva16Ves.plus(iva16Ves);
    sumBase8Ves = sumBase8Ves.plus(base8Ves);
    sumIva8Ves = sumIva8Ves.plus(iva8Ves);
    sumIvaRetVes = sumIvaRetVes.plus(ivaRetVes);
    sumIslrRetVes = sumIslrRetVes.plus(islrRetVes);
    sumNetUsd = sumNetUsd.plus(netUsd);

    aoa.push([
      idx + 1,
      formatDateIso(inv.issueDate),
      inv.supplierRif,
      inv.supplierName,
      inv.invoiceNumber,
      inv.controlNumber,
      rate,
      totalVes,
      exemptVes,
      base16Ves,
      iva16Ves,
      base8Ves,
      iva8Ves,
      ivaVoucher?.voucherNumber || 'N/A',
      ivaRetVes,
      islrRetVes,
      netUsd,
    ]);
  });

  aoa.push([
    '',
    '',
    '',
    'TOTALES DEL PERÍODO AUDITADOS (DECIMAL.JS)',
    '',
    '',
    '',
    round2(sumTotalVes),
    round2(sumExemptVes),
    round2(sumBase16Ves),
    round2(sumIva16Ves),
    round2(sumBase8Ves),
    round2(sumIva8Ves),
    '',
    round2(sumIvaRetVes),
    round2(sumIslrRetVes),
    round2(sumNetUsd),
  ]);
  aoa.push([]);
  aoa.push([COPYRIGHT_NOTICE]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 8 },
    { wch: 13 },
    { wch: 14 },
    { wch: 30 },
    { wch: 16 },
    { wch: 15 },
    { wch: 11 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 17 },
    { wch: 14 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
  ];

  for (let c = 0; c < 17; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 5, c });
    if (ws[cellRef]) {
      ws[cellRef].s = headerStyle;
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Libro Compras SENIAT');
  return wb;
}

/**
 * Construye el Libro de Ventas Fiscal SENIAT consolidando los Reportes Z diarios homologados.
 */
export function buildSeniatSalesBookWorkbook(params: {
  zReports: FiscalZReportRecord[];
  companyProfile?: Partial<CompanyFiscalProfile> | null;
  periodYearMonth: string;
}): XLSXTypes.WorkBook {
  const profile = resolveCompanyProfile(params.companyProfile);
  const period = String(params.periodYearMonth || '').slice(0, 6);
  const periodPrefix = `${period.slice(0, 4)}-${period.slice(4, 6)}`;

  const zList = params.zReports.filter(
    (z) => z.reportType === 'REPORTE_Z_DIARIO' && formatDateIso(z.closureDate).startsWith(periodPrefix)
  );

  const aoa: Array<Array<string | number>> = [
    EXCEL_INSTITUTIONAL_WATERMARK_ROW,
    [`LIBRO ESPECIAL DE VENTAS FISCALES (REPORTES Z) — PERÍODO ${periodPrefix}`],
    [`CONTRIBUYENTE: ${profile.razonSocial} | RIF: ${profile.rif}`],
    [],
    [
      'Fecha Cierre',
      'Sede',
      'Serial Máquina Fiscal',
      'N° Reporte Z',
      'Facturas Emitidas',
      'Tasa BCV',
      'Ventas Exentas (Bs.)',
      'Base 16% (Bs.)',
      'Débito Fiscal 16% (Bs.)',
      'Base 8% (Bs.)',
      'Débito Fiscal 8% (Bs.)',
      'IGTF 3% Percibido (Bs.)',
      'Gran Total Z (Bs.)',
      'Gran Total Z (USD)',
    ],
  ];

  for (const z of zList) {
    const r = z.bcvRateClosure > 0 ? z.bcvRateClosure : 1;
    aoa.push([
      formatDateIso(z.closureDate),
      z.locationName,
      z.printerSerial,
      z.zNumber,
      z.invoicesCount,
      r,
      round2(toDecimal(z.exemptSalesUsd).times(r)),
      round2(toDecimal(z.taxableBase16Usd).times(r)),
      round2(toDecimal(z.iva16CollectedUsd).times(r)),
      round2(toDecimal(z.taxableBase8Usd).times(r)),
      round2(toDecimal(z.iva8CollectedUsd).times(r)),
      round2(toDecimal(z.igtf3CollectedUsd).times(r)),
      round2(z.grandTotalFiscalVes),
      round2(z.grandTotalFiscalUsd),
    ]);
  }

  aoa.push([]);
  aoa.push([COPYRIGHT_NOTICE]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Libro Ventas Reportes Z');
  return wb;
}

export function triggerBrowserTextDownload(bundle: SeniatPortalExportBundle): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([bundle.content], { type: bundle.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = bundle.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function triggerWorkbookDownload(wb: XLSXTypes.WorkBook, fileName: string): void {
  if (typeof window === 'undefined') return;
  XLSX.writeFile(wb, fileName);
}
