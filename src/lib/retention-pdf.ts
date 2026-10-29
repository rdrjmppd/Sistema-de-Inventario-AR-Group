/**
 * Motor Documental de Comprobantes Fiscales de Retención SENIAT (IVA & ISLR) y Relación Quincenal
 * Diseñado por @Documentos anclado a @Finanzas:
 *   - Comprobante Oficial de Retención de IVA (Providencia SNAT/2025/000054)
 *   - Comprobante Oficial de Retención de ISLR (Decreto 1.808)
 *   - Relación Quincenal de Retenciones por Enterar SENIAT
 * Branding Oficial: Hiper Abasto Polar + Pie Inmutable © 2026 AR Group.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CompanyFiscalProfile, TaxRetentionVoucher } from '../types';
import { formatUsd, formatVes, round2, toDecimal } from './decimal';
import { COPYRIGHT_NOTICE, resolveCompanyProfile } from './excel-exporter';
import { BRAND_NAME, HIPER_ABASTO_POLAR_LOGO_DATA_URI } from './brand-assets';

const JsPdfConstructor: typeof jsPDF =
  (jsPDF as unknown as { jsPDF?: typeof jsPDF }).jsPDF || jsPDF;
const runAutoTable: typeof autoTable =
  (autoTable as unknown as { default?: typeof autoTable }).default || autoTable;

function renderFiscalHeaderLandscape(
  doc: jsPDF,
  company: CompanyFiscalProfile,
  title: string,
  normativeSubtitle: string,
  voucherNumber?: string,
  periodLabel?: string
): void {
  // Corporate Midnight Blue Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 34, 'F');

  // Sky Accent Strip
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 34, 297, 1.8, 'F');

  const logoBase64 = company.logoBase64 || HIPER_ABASTO_POLAR_LOGO_DATA_URI;
  if (logoBase64) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(12, 4, 26, 26, 2, 2, 'F');
      doc.addImage(logoBase64, 'JPEG', 13, 5, 24, 24);
    } catch {
      // Safe fallback in headless environments
    }
  }

  const textX = 42;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(`${company.razonSocial.toUpperCase()} — RIF: ${company.rif}`, textX, 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(226, 232, 240);
  doc.text(
    `Domicilio Fiscal: ${company.direccionFiscal} | Tel: ${company.telefono} | SADA: ${company.codigoSada}`,
    textX,
    16.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(125, 211, 252);
  doc.text(title.toUpperCase(), textX, 23.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`${(company.brandingName || BRAND_NAME)} · ${normativeSubtitle}`, textX, 29.5);

  // Right-side Correlativo & Period Box
  if (voucherNumber) {
    doc.setFillColor(30, 41, 59);
    doc.setDrawColor(56, 189, 248);
    doc.setLineWidth(0.35);
    doc.roundedRect(216, 4.5, 69, 25, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(186, 230, 253);
    doc.text('N° DE COMPROBANTE SENIAT', 250.5, 10, { align: 'center' });

    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(voucherNumber, 250.5, 17, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(203, 213, 225);
    doc.text(`Período Fiscal: ${periodLabel || 'Vigente'}`, 250.5, 24.5, {
      align: 'center',
    });
  }
}

function renderPartyIdentificationCards(
  doc: jsPDF,
  voucher: TaxRetentionVoucher,
  company: CompanyFiscalProfile
): number {
  const startY = 40;

  if (voucher.status === 'ANULADO') {
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.5);
    doc.roundedRect(12, startY, 273, 10, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(185, 28, 28);
    doc.text(
      `COMPROBANTE ANULADO — SIN EFECTO FISCAL | Motivo: ${voucher.voidReason || 'Anulación administrativa'} (${voucher.voidedAtVet || ''})`,
      148.5,
      startY + 6.5,
      { align: 'center' }
    );
  }

  const cardsY = voucher.status === 'ANULADO' ? startY + 13 : startY;

  // Card 1: Agente de Retención
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(12, cardsY, 134, 24, 1.8, 1.8, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(2, 132, 199);
  doc.text('1. DATOS DEL AGENTE DE RETENCIÓN (SUJETO PASIVO ESPECIAL)', 15, cardsY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(15, 23, 42);
  doc.text(`${voucher.agentRazonSocial || company.razonSocial}`, 15, cardsY + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`RIF: ${voucher.agentRif || company.rif}  |  Condición: Agente de Retención Designado SENIAT`, 15, cardsY + 16);
  doc.text(
    `Dirección: ${(voucher.agentAddress || company.direccionFiscal || '').slice(0, 78)}`,
    15,
    cardsY + 21
  );

  // Card 2: Sujeto Retenido (Proveedor)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(151, cardsY, 134, 24, 1.8, 1.8, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(2, 132, 199);
  doc.text('2. DATOS DEL SUJETO RETENIDO (PROVEEDOR / BENEFICIARIO)', 154, cardsY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(15, 23, 42);
  doc.text(`${voucher.supplierName || 'PROVEEDOR COMERCIAL'}`, 154, cardsY + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `RIF: ${voucher.supplierRif || 'N/D'}  |  Contribuyente: ${voucher.supplierTaxpayerType} (${voucher.supplierPersonType})`,
    154,
    cardsY + 16
  );
  doc.text(
    `Factura: ${voucher.invoiceNumber}  |  N° Control: ${voucher.controlNumber}  |  Fecha Emisión: ${voucher.invoiceIssueDate}  |  BCV: Bs. ${round2(voucher.bcvRateAtIssue).toFixed(2)}`,
    154,
    cardsY + 21
  );

  return cardsY + 28;
}

function renderSignaturesAndSummaryBlock(
  doc: jsPDF,
  voucher: TaxRetentionVoucher,
  afterTableY: number
): void {
  const pageHeight = 210;
  let blockY = afterTableY + 6;
  if (blockY + 42 > pageHeight - 16) {
    doc.addPage('a4', 'landscape');
    blockY = 20;
  }

  // Financial Summary Box (Left)
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.25);
  doc.roundedRect(12, blockY, 128, 30, 1.8, 1.8, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text('RESUMEN DE LIQUIDACIÓN Y PASIVO NETO (BIMONETARIO)', 15, blockY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Total Documento con IVA: ${formatVes(voucher.invoiceTotalVes)}  (${formatUsd(voucher.invoiceTotalUsd)})`,
    15,
    blockY + 12
  );
  doc.text(
    `Total Impuesto Retenido (${voucher.type} ${voucher.retentionPercentApplied}%): ${formatVes(voucher.retainedTotalVes)}  (${formatUsd(voucher.retainedTotalUsd)})`,
    15,
    blockY + 17.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(4, 120, 87);
  doc.text(
    `NETO A PAGAR AL PROVEEDOR: ${formatVes(voucher.netPayableAfterAllRetentionsVes)}  (${formatUsd(voucher.netPayableAfterAllRetentionsUsd)})`,
    15,
    blockY + 23.5
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(100, 116, 139);
  doc.text((voucher.legalDeliveryHint || '').slice(0, 95), 15, blockY + 28.2);

  // Dual Signature Boxes (Right)
  doc.setDrawColor(148, 163, 184);
  doc.roundedRect(145, blockY, 68, 30, 1.8, 1.8, 'S');
  doc.roundedRect(217, blockY, 68, 30, 1.8, 1.8, 'S');

  doc.line(151, blockY + 21, 207, blockY + 21);
  doc.line(223, blockY + 21, 279, blockY + 21);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(30, 41, 59);
  doc.text('FIRMA Y SELLO AGENTE DE RETENCIÓN', 179, blockY + 25.5, { align: 'center' });
  doc.text('FIRMA Y SELLO SUJETO RETENIDO', 251, blockY + 25.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Emitido VET: ${voucher.createdAtVet}`, 179, blockY + 28.8, { align: 'center' });
  doc.text('Fecha Recepción: ____/____/________', 251, blockY + 28.8, { align: 'center' });
}

function renderWatermarkAndPaginationFooter(
  doc: jsPDF,
  company: CompanyFiscalProfile
): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = 297;
  const pageHeight = 210;
  const footerY = 203;
  const logoBase64 = company.logoBase64 || HIPER_ABASTO_POLAR_LOGO_DATA_URI;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    if (logoBase64) {
      try {
        doc.saveGraphicsState();
        if (typeof (doc as any).GState === 'function' && typeof doc.setGState === 'function') {
          doc.setGState(new (doc as any).GState({ opacity: 0.05 }));
        }
        doc.addImage(logoBase64, 'JPEG', (pageWidth - 110) / 2, (pageHeight - 110) / 2, 110, 110);
      } catch {
        // Safe fallback
      } finally {
        doc.restoreGraphicsState();
      }
    }

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(12, footerY - 4, pageWidth - 12, footerY - 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${COPYRIGHT_NOTICE} — ${company.razonSocial} (${company.rif}) — Pág. ${i} de ${pageCount}`,
      12,
      footerY
    );
  }
}

/**
 * Genera el Comprobante Oficial de Retención de IVA (Providencia SNAT/2025/000054) en PDF Horizontal A4.
 */
export function generateIvaRetentionPdfDocument(
  voucher: TaxRetentionVoucher,
  companyInput?: Partial<CompanyFiscalProfile> | null
): jsPDF {
  const company = resolveCompanyProfile(companyInput);
  const doc = new JsPdfConstructor({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  renderFiscalHeaderLandscape(
    doc,
    company,
    'Comprobante de Retención del Impuesto al Valor Agregado (I.V.A.)',
    voucher.legalNormative || 'Providencia Administrativa SNAT/2025/000054 (G.O. N° 43.171)',
    voucher.voucherNumber,
    `${voucher.periodYearMonth} · ${voucher.fortnight === 'PRIMERA_QUINCENA' ? '1ra Quincena' : '2da Quincena'}`
  );

  const tableStartY = renderPartyIdentificationCards(doc, voucher, company);

  const rows = (voucher.lines || []).map((ln, idx) => [
    String(idx + 1),
    voucher.invoiceIssueDate || voucher.issueDate,
    voucher.invoiceNumber,
    voucher.controlNumber || 'S/C',
    (ln.description || ln.sku || 'Operación de Compra').slice(0, 38),
    formatVes(ln.exemptAmountVes),
    formatVes(ln.baseAmountVes),
    `${ln.taxRatePercent}%`,
    formatVes(ln.taxCausadoVes),
    `${ln.retentionRatePercent}%`,
    formatVes(ln.retainedAmountVes),
  ]);

  runAutoTable(doc, {
    startY: tableStartY,
    margin: { left: 12, right: 12, bottom: 20 },
    head: [
      [
        'Op.',
        'Fecha Doc.',
        'N° Factura',
        'N° Control',
        'Concepto / Línea',
        'Compras Exentas (Bs.)',
        'Base Imponible (Bs.)',
        '% Alíc.',
        'IVA Causado (Bs.)',
        '% Ret.',
        'IVA Retenido (Bs.)',
      ],
    ],
    body: rows,
    foot: [
      [
        '',
        '',
        '',
        '',
        'TOTALES COMPROBANTE',
        formatVes(voucher.exemptTotalVes),
        formatVes(voucher.taxableBaseVes),
        '',
        formatVes(voucher.taxCausadoTotalVes),
        `${voucher.retentionPercentApplied}%`,
        formatVes(voucher.retainedTotalVes),
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [226, 232, 240],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'center', cellWidth: 14 },
      8: { halign: 'right' },
      9: { halign: 'center', cellWidth: 14 },
      10: { halign: 'right', fontStyle: 'bold' },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || tableStartY + 30;
  renderSignaturesAndSummaryBlock(doc, voucher, finalY);
  renderWatermarkAndPaginationFooter(doc, company);

  return doc;
}

/**
 * Genera el Comprobante Oficial de Retención de ISLR (Decreto 1.808) en PDF Horizontal A4.
 */
export function generateIslrRetentionPdfDocument(
  voucher: TaxRetentionVoucher,
  companyInput?: Partial<CompanyFiscalProfile> | null
): jsPDF {
  const company = resolveCompanyProfile(companyInput);
  const doc = new JsPdfConstructor({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  renderFiscalHeaderLandscape(
    doc,
    company,
    'Comprobante de Retención de Impuesto Sobre la Renta (I.S.L.R.)',
    voucher.legalNormative || 'Decreto N° 1.808 — Reglamento Parcial de la LISLR (G.O. N° 36.203)',
    voucher.voucherNumber,
    voucher.periodYearMonth
  );

  const tableStartY = renderPartyIdentificationCards(doc, voucher, company);

  const rows = (voucher.lines || []).map((ln, idx) => [
    String(idx + 1),
    voucher.invoiceIssueDate || voucher.issueDate,
    voucher.invoiceNumber,
    voucher.controlNumber || 'S/C',
    `${ln.conceptCode || 'SRV'} — ${(ln.conceptName || ln.description || 'Servicio').slice(0, 42)}`,
    formatVes(ln.baseAmountVes),
    `${ln.retentionRatePercent}%`,
    formatVes(ln.taxCausadoVes),
    formatVes(ln.sustraendoVes),
    formatVes(ln.retainedAmountVes),
    formatUsd(ln.retainedAmountUsd),
  ]);

  runAutoTable(doc, {
    startY: tableStartY,
    margin: { left: 12, right: 12, bottom: 20 },
    head: [
      [
        '#',
        'Fecha',
        'N° Factura',
        'N° Control',
        'Concepto Decreto 1.808',
        'Cantidad Objeto Ret. (Bs.)',
        '% Tarifa',
        'Impuesto Bruto (Bs.)',
        'Sustraendo U.T. (Bs.)',
        'ISLR Retenido (Bs.)',
        'Ref. (USD)',
      ],
    ],
    body: rows,
    foot: [
      [
        '',
        '',
        '',
        '',
        `TOTALES (Valor U.T. Bs. ${round2(voucher.utValueVes).toFixed(2)})`,
        formatVes(voucher.taxableBaseVes),
        '',
        formatVes(voucher.taxCausadoTotalVes),
        formatVes(voucher.sustraendoTotalVes),
        formatVes(voucher.retainedTotalVes),
        formatUsd(voucher.retainedTotalUsd),
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [226, 232, 240],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      5: { halign: 'right' },
      6: { halign: 'center', cellWidth: 16 },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right', fontStyle: 'bold' },
      10: { halign: 'right' },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || tableStartY + 30;
  renderSignaturesAndSummaryBlock(doc, voucher, finalY);
  renderWatermarkAndPaginationFooter(doc, company);

  return doc;
}

/**
 * Genera la Relación Quincenal Consolidada de Retenciones IVA / ISLR para declaración ante el SENIAT.
 */
export function generateQuincenalRetentionsPdfDocument(
  vouchers: TaxRetentionVoucher[],
  periodLabel: string,
  companyInput?: Partial<CompanyFiscalProfile> | null
): jsPDF {
  const company = resolveCompanyProfile(companyInput);
  const doc = new JsPdfConstructor({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  renderFiscalHeaderLandscape(
    doc,
    company,
    `Relación Consolidada de Retenciones Tributarias — ${periodLabel}`,
    'Libro Auxiliar de Retenciones IVA (SNAT/2025/000054) e ISLR (Decreto 1.808)',
    undefined,
    periodLabel
  );

  const activeVouchers = (vouchers || []).filter((v) => v.status !== 'ANULADO');
  const totalVes = round2(
    activeVouchers.reduce((acc, v) => acc.plus(v.retainedTotalVes), toDecimal(0))
  );
  const totalUsd = round2(
    activeVouchers.reduce((acc, v) => acc.plus(v.retainedTotalUsd), toDecimal(0))
  );

  const rows = (vouchers || []).map((v) => [
    v.voucherNumber,
    v.type,
    v.issueDate,
    `${v.supplierName} (${v.supplierRif})`,
    v.invoiceNumber,
    v.controlNumber,
    formatVes(v.taxableBaseVes),
    `${v.retentionPercentApplied}%`,
    v.status === 'ANULADO' ? 'Bs. 0,00 (ANULADO)' : formatVes(v.retainedTotalVes),
    v.status === 'ANULADO' ? '$0.00' : formatUsd(v.retainedTotalUsd),
    v.status,
  ]);

  runAutoTable(doc, {
    startY: 42,
    margin: { left: 12, right: 12, bottom: 20 },
    head: [
      [
        'N° Comprobante',
        'Tipo',
        'Fecha',
        'Proveedor / RIF',
        'Factura',
        'Control',
        'Base Imponible (Bs.)',
        '% Ret.',
        'Retenido (Bs.)',
        'Equiv. (USD)',
        'Estado',
      ],
    ],
    body: rows,
    foot: [
      [
        '',
        '',
        '',
        `TOTAL ACTIVO A ENTERAR SENIAT (${activeVouchers.length} comprobantes vigentes)`,
        '',
        '',
        '',
        '',
        formatVes(totalVes),
        formatUsd(totalUsd),
        '',
      ],
    ],
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 2,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [226, 232, 240],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      6: { halign: 'right' },
      7: { halign: 'center' },
      8: { halign: 'right', fontStyle: 'bold' },
      9: { halign: 'right' },
    },
  });

  renderWatermarkAndPaginationFooter(doc, company);
  return doc;
}

export function exportRetentionVoucherPdf(
  voucher: TaxRetentionVoucher,
  companyInput?: Partial<CompanyFiscalProfile> | null
): void {
  const doc =
    voucher.type === 'ISLR'
      ? generateIslrRetentionPdfDocument(voucher, companyInput)
      : generateIvaRetentionPdfDocument(voucher, companyInput);
  doc.save(`Comprobante_Retencion_${voucher.type}_${voucher.voucherNumber}.pdf`);
}

export function exportQuincenalRetentionsPdf(
  vouchers: TaxRetentionVoucher[],
  periodLabel: string,
  companyInput?: Partial<CompanyFiscalProfile> | null
): void {
  const safeSlug = periodLabel.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const doc = generateQuincenalRetentionsPdfDocument(vouchers, periodLabel, companyInput);
  doc.save(`Relacion_Quincenal_Retenciones_${safeSlug}.pdf`);
}
