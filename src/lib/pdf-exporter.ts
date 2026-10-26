import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BcvRateState,
  CompanyFiscalProfile,
  LocationNode,
  MonthlyClosureReport,
  Product,
} from '../types';
import { toDecimal, round2, convertUsdToVes, formatUsd, formatVes } from './decimal';
import { COPYRIGHT_NOTICE, resolveCompanyProfile } from './excel-exporter';
import { BRAND_NAME, BRAND_COLORS, HIPER_ABASTO_POLAR_LOGO_DATA_URI } from './brand-assets';

const JsPdfConstructor: typeof jsPDF =
  (jsPDF as unknown as { jsPDF?: typeof jsPDF }).jsPDF || jsPDF;
const runAutoTable: typeof autoTable =
  (autoTable as unknown as { default?: typeof autoTable }).default || autoTable;

export const LIQUIDITY_STOCKOUT_JUSTIFICATION =
  'El desabastecimiento de productos de alta rotación (Clase A) ocasiona una interrupción inmediata en la generación de flujo de caja operativo entrante, comprometiendo la liquidez necesaria para el pago a proveedores y la cobertura de costos fijos, e incrementando el costo de oportunidad comercial frente a la competencia.';

export interface ExecutivePdfProductRow {
  sku: string;
  name: string;
  category: string;
  abcClass: Product['abcClass'];
  unit: Product['unit'];
  totalStock: number;
  totalMinStock: number;
  isAtStockoutRisk: boolean;
  costUsd: number;
  targetMarginPercent: number;
  priceUsd: number;
  pvpVes: number;
  totalValuationUsd: number;
  totalValuationVes: number;
  monthlyRevenueUsd: number;
}

export interface ExecutiveInventoryPdfAnalytics {
  company: CompanyFiscalProfile;
  totalSkus: number;
  totalUnits: number;
  totalValuationUsd: number;
  totalValuationVes: number;
  weightedAverageMarginPct: number;
  atRiskSkusCount: number;
  classATractorsSummary: string;
  atRiskProductsSummary: string;
  financialJustification: string;
  rows: ExecutivePdfProductRow[];
}

/**
 * Calcula de forma determinista con Decimal.js las métricas ejecutivas, el diagnóstico
 * de liquidez Pareto Clase A y el análisis de riesgo de quiebre de stock para el PDF.
 */
export function buildExecutiveInventoryPdfAnalytics(
  products: Product[],
  locations: LocationNode[],
  bcvState: BcvRateState,
  companyInput?: Partial<CompanyFiscalProfile> | null
): ExecutiveInventoryPdfAnalytics {
  const company = resolveCompanyProfile(companyInput);
  const safeRate = bcvState?.activeRate && bcvState.activeRate > 0 ? bcvState.activeRate : 36.5;
  const activeLocationIds =
    locations && locations.length > 0 ? locations.map((l) => l.id) : [];

  let totalUnitsDec = toDecimal(0);
  let totalValuationUsdDec = toDecimal(0);
  let weightedMarginNumeratorDec = toDecimal(0);

  const rows: ExecutivePdfProductRow[] = (products || []).map((p) => {
    const stockKeys =
      activeLocationIds.length > 0
        ? activeLocationIds
        : Object.keys(p.stockByLocation || {});

    let totalStockDec = toDecimal(0);
    let totalMinStockDec = toDecimal(0);
    let hasLocationStockoutRisk = false;

    for (const locId of stockKeys) {
      const locStock = round2(p.stockByLocation?.[locId] ?? 0);
      const locMin = round2(p.minStockByLocation?.[locId] ?? 0);
      totalStockDec = totalStockDec.plus(locStock);
      totalMinStockDec = totalMinStockDec.plus(locMin);
      if (locMin > 0 && locStock <= locMin) {
        hasLocationStockoutRisk = true;
      }
    }

    const totalStock = round2(totalStockDec);
    const totalMinStock = round2(totalMinStockDec);
    const isAtStockoutRisk =
      hasLocationStockoutRisk ||
      (totalMinStock > 0 && totalStock <= totalMinStock) ||
      totalStock <= 0;

    const costUsd = round2(p.costUsd || 0);
    const priceUsd = round2(p.priceUsd || 0);
    const targetMarginPercent = round2(p.targetMarginPercent || 0);
    const pvpVes = convertUsdToVes(priceUsd, safeRate);
    const totalValuationUsd = round2(toDecimal(totalStock).times(costUsd));
    const totalValuationVes = convertUsdToVes(totalValuationUsd, safeRate);
    const monthlyRevenueUsd = round2(
      toDecimal(p.monthlyUnitsSold || 0).times(priceUsd)
    );

    totalUnitsDec = totalUnitsDec.plus(totalStock);
    totalValuationUsdDec = totalValuationUsdDec.plus(totalValuationUsd);
    weightedMarginNumeratorDec = weightedMarginNumeratorDec.plus(
      toDecimal(totalValuationUsd).times(targetMarginPercent)
    );

    return {
      sku: p.sku,
      name: p.name,
      category: p.category,
      abcClass: p.abcClass,
      unit: p.unit,
      totalStock,
      totalMinStock,
      isAtStockoutRisk,
      costUsd,
      targetMarginPercent,
      priceUsd,
      pvpVes,
      totalValuationUsd,
      totalValuationVes,
      monthlyRevenueUsd,
    };
  });

  const totalValuationUsd = round2(totalValuationUsdDec);
  const totalValuationVes = convertUsdToVes(totalValuationUsd, safeRate);
  const weightedAverageMarginPct =
    totalValuationUsd > 0
      ? round2(weightedMarginNumeratorDec.dividedBy(totalValuationUsdDec))
      : rows.length > 0
      ? round2(
          rows.reduce((acc, r) => acc.plus(r.targetMarginPercent), toDecimal(0)).dividedBy(rows.length)
        )
      : 0;

  const classAProducts = [...rows]
    .filter((r) => r.abcClass === 'A')
    .sort((a, b) => b.monthlyRevenueUsd - a.monthlyRevenueUsd);

  const topTractors = (classAProducts.length > 0 ? classAProducts : [...rows]).slice(0, 5);
  const classATractorsSummary =
    topTractors.length > 0
      ? topTractors
          .map(
            (t) =>
              `${t.sku} (${t.name} · Margen ${t.targetMarginPercent.toFixed(1)}% · Stock ${t.totalStock} ${t.unit})`
          )
          .join('  |  ')
      : 'Sin SKUs Clase A registrados actualmente en el catálogo activo.';

  const atRiskRows = rows.filter((r) => r.isAtStockoutRisk);
  const atRiskProductsSummary =
    atRiskRows.length > 0
      ? atRiskRows
          .slice(0, 6)
          .map(
            (r) =>
              `${r.sku} (${r.name}: Disp. ${r.totalStock} ${r.unit} <= Mín. ${r.totalMinStock} ${r.unit})`
          )
          .join('  |  ') +
        (atRiskRows.length > 6 ? `  (+${atRiskRows.length - 6} SKUs adicionales en alerta)` : '')
      : 'Ningún SKU se encuentra actualmente por debajo del umbral de stock mínimo de seguridad.';

  return {
    company,
    totalSkus: rows.length,
    totalUnits: round2(totalUnitsDec),
    totalValuationUsd,
    totalValuationVes,
    weightedAverageMarginPct,
    atRiskSkusCount: atRiskRows.length,
    classATractorsSummary,
    atRiskProductsSummary,
    financialJustification: LIQUIDITY_STOCKOUT_JUSTIFICATION,
    rows,
  };
}

function renderCorporateHeaderLandscape(
  doc: jsPDF,
  company: CompanyFiscalProfile,
  bcvState: BcvRateState,
  reportSubtitle: string
): void {
  // Primary Midnight Blue Banner [15, 23, 42]
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 33, 'F');

  // Slate Accent Strip [2, 132, 199]
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 33, 297, 1.8, 'F');

  const logoBase64 = company.logoBase64 || HIPER_ABASTO_POLAR_LOGO_DATA_URI;
  if (logoBase64) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(12, 3.5, 26, 26, 2, 2, 'F');
      doc.addImage(logoBase64, 'JPEG', 13, 4.5, 24, 24);
    } catch {
      // Graceful fallback
    }
  }

  const textStartX = 42;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`${company.razonSocial.toUpperCase()}  —  RIF: ${company.rif}`, textStartX, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text(
    `Dirección Fiscal: ${company.direccionFiscal}  |  Tel: ${company.telefono}  |  Código SADA: ${company.codigoSada}`,
    textStartX,
    16.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(186, 230, 253);
  doc.text(`${(company.brandingName || BRAND_NAME).toUpperCase()} · ${reportSubtitle}`, textStartX, 23);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Representante Legal: ${company.representanteLegal}  |  Emisión Legal VET: ${bcvState.caracasDateFormatted} ${bcvState.caracasTimeFormatted}  |  Tasa Oficial BCV: Bs. ${bcvState.activeRate.toFixed(2)} / USD`,
    textStartX,
    29
  );
}

function renderImmutableFooterOnAllPages(
  doc: jsPDF,
  company: CompanyFiscalProfile,
  isLandscape: boolean
): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = isLandscape ? 297 : 210;
  const pageHeight = isLandscape ? 210 : 297;
  const footerY = isLandscape ? 203 : 289;
  const logoBase64 = company.logoBase64 || HIPER_ABASTO_POLAR_LOGO_DATA_URI;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // 1. Institutional Watermark in the background
    if (logoBase64) {
      try {
        doc.saveGraphicsState();
        if (typeof doc.GState === 'function' && typeof doc.setGState === 'function') {
          doc.setGState(new (doc as any).GState({ opacity: 0.07 }));
        }
        const wmSize = isLandscape ? 120 : 100;
        const wmX = (pageWidth - wmSize) / 2;
        const wmY = (pageHeight - wmSize) / 2;
        doc.addImage(logoBase64, 'JPEG', wmX, wmY, wmSize, wmSize);
      } catch {
        // Safe fallback
      } finally {
        doc.restoreGraphicsState();
      }
    }

    // 2. Divider line and legal notice
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(14, footerY - 4, pageWidth - 14, footerY - 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${COPYRIGHT_NOTICE} — ${company.razonSocial} (${company.rif}) — Pág. ${i} de ${pageCount}`,
      14,
      footerY
    );
  }
}

export function generateExecutiveInventoryPdfDocument(
  products: Product[],
  locations: LocationNode[],
  bcvState: BcvRateState,
  companyInput?: Partial<CompanyFiscalProfile> | null
): jsPDF {
  const analytics = buildExecutiveInventoryPdfAnalytics(
    products,
    locations,
    bcvState,
    companyInput
  );
  const { company } = analytics;
  const doc = new JsPdfConstructor({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  renderCorporateHeaderLandscape(
    doc,
    company,
    bcvState,
    'CHRYSTAL® ENTERPRISE ERP — INFORME EJECUTIVO DE INVENTARIO, LIQUIDEZ Y RIESGO DE QUIEBRE'
  );

  // 1. Consolidated KPIs Executive Table
  runAutoTable(doc, {
    startY: 37,
    head: [
      [
        'Total de SKUs Registrados',
        'Valorización Total (USD)',
        'Valorización Total (VES BCV)',
        'Margen Bruto Promedio Ponderado',
        'SKUs en Riesgo Inminente de Quiebre',
      ],
    ],
    body: [
      [
        `${analytics.totalSkus} SKUs (${analytics.totalUnits} Und. Físicas)`,
        formatUsd(analytics.totalValuationUsd),
        formatVes(analytics.totalValuationVes),
        `${analytics.weightedAverageMarginPct.toFixed(2)}%`,
        `${analytics.atRiskSkusCount} SKU(s) en Alerta Crítica`,
      ],
    ],
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      lineWidth: 0.1,
      lineColor: [203, 213, 225],
      fontStyle: 'bold',
      halign: 'center',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      halign: 'center',
    },
    bodyStyles: {
      fillColor: [248, 250, 252],
      textColor: [15, 23, 42],
    },
    margin: { left: 14, right: 14 },
  });

  const afterKpiY =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 54;

  // 2. Strategic Executive Diagnosis Block (Pareto Class A Liquidity vs. Stockout Risk)
  runAutoTable(doc, {
    startY: afterKpiY + 3,
    head: [
      [
        ' Eje Estratégico',
        'Diagnóstico Ejecutivo de Rotación, Flujo de Caja y Riesgo de Quiebre de Inventario',
      ],
    ],
    body: [
      [
        'Tractores de Liquidez\n(Pareto Clase A)',
        `Productos líderes generadores de caja y contribución al margen: ${analytics.classATractorsSummary}`,
      ],
      [
        'Riesgo Inminente de\nQuiebre de Stock',
        `SKUs con existencia disponible <= stock mínimo fijado (${analytics.atRiskSkusCount}): ${analytics.atRiskProductsSummary}`,
      ],
      [
        'Impacto Financiero en\nFlujo de Caja Operativo',
        analytics.financialJustification,
      ],
    ],
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      lineWidth: 0.1,
      lineColor: [203, 213, 225],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [2, 132, 199],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] },
      1: { cellWidth: 227, textColor: [30, 41, 59] },
    },
    margin: { left: 14, right: 14 },
  });

  const afterDiagnosisY =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 86;

  // 3. Detailed Inventory Valuation Table
  const tableBody =
    analytics.rows.length > 0
      ? analytics.rows.map((r) => [
          r.sku,
          r.name,
          r.category,
          `Clase ${r.abcClass}`,
          `${r.totalStock} ${r.unit}${r.isAtStockoutRisk ? ' [!]' : ''}`,
          formatUsd(r.costUsd),
          `${r.targetMarginPercent.toFixed(1)}%`,
          formatUsd(r.priceUsd),
          formatVes(r.pvpVes),
          formatUsd(r.totalValuationUsd),
        ])
      : [
          [
            'SIN-SKUS',
            'Catálogo sin productos registrados al momento de la emisión',
            'N/A',
            '-',
            '0 UND',
            formatUsd(0),
            '0.0%',
            formatUsd(0),
            formatVes(0),
            formatUsd(0),
          ],
        ];

  runAutoTable(doc, {
    startY: afterDiagnosisY + 4,
    head: [
      [
        'SKU',
        'Descripción del Producto',
        'Categoría',
        'Clasif. ABC',
        'Stock Total',
        'Costo Unit. (USD)',
        'Margen (%)',
        'PVP (USD)',
        'PVP (VES BCV)',
        'Valorización Total (USD)',
      ],
    ],
    body: tableBody,
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      lineWidth: 0.1,
      lineColor: [203, 213, 225],
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 24 },
      1: { cellWidth: 62 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 24 },
      6: { halign: 'right', cellWidth: 18 },
      7: { halign: 'right', cellWidth: 22 },
      8: { halign: 'right', cellWidth: 28 },
      9: { halign: 'right', fontStyle: 'bold', cellWidth: 27 },
    },
    margin: { top: 38, left: 14, right: 14, bottom: 16 },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        renderCorporateHeaderLandscape(
          doc,
          company,
          bcvState,
          'CHRYSTAL® ENTERPRISE ERP — DETALLE VALORIZADO DE INVENTARIO (CONTINUACIÓN)'
        );
      }
    },
  });

  renderImmutableFooterOnAllPages(doc, company, true);
  return doc;
}

export function exportExecutiveInventoryPdf(
  products: Product[],
  locations: LocationNode[],
  bcvState: BcvRateState,
  companyInput?: Partial<CompanyFiscalProfile> | null
): void {
  const company = resolveCompanyProfile(companyInput);
  const doc = generateExecutiveInventoryPdfDocument(
    products,
    locations,
    bcvState,
    company
  );
  const cleanDate = (bcvState.caracasDateFormatted || '2026').replace(/\//g, '-');
  const cleanRif = company.rif.replace(/[^A-Za-z0-9-]/g, '').slice(0, 14) || 'EMPRESA';
  doc.save(`Chrystal_Reporte_Ejecutivo_${cleanRif}_${cleanDate}.pdf`);
}

export function generateMonthlyClosurePdfDocument(
  closure: MonthlyClosureReport,
  companyInput?: Partial<CompanyFiscalProfile> | null
): jsPDF {
  const company = resolveCompanyProfile(companyInput);
  const doc = new JsPdfConstructor({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Midnight Blue Header [15, 23, 42]
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 36, 'F');
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 36, 210, 1.8, 'F');

  const logoBase64 = company.logoBase64 || HIPER_ABASTO_POLAR_LOGO_DATA_URI;
  if (logoBase64) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(12, 4.5, 26, 26, 2, 2, 'F');
      doc.addImage(logoBase64, 'JPEG', 13, 5.5, 24, 24);
    } catch {
      // Graceful fallback
    }
  }

  const textStartX = 42;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(`${company.razonSocial.toUpperCase()} — RIF: ${company.rif}`, textStartX, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(226, 232, 240);
  doc.text(
    `Dirección Fiscal: ${company.direccionFiscal}  |  Tel: ${company.telefono}  |  SADA: ${company.codigoSada}`,
    textStartX,
    18
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(186, 230, 253);
  doc.text(
    `${(company.brandingName || BRAND_NAME).toUpperCase()} · ACTA DE CIERRE CONTABLE (${closure.period})  |  VET: ${closure.closedAtVet}`,
    textStartX,
    25
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Representante Legal: ${company.representanteLegal}  |  Auditor Responsable: ${closure.closedBy}`,
    textStartX,
    31
  );

  runAutoTable(doc, {
    startY: 42,
    head: [['Indicador Contable y Financiero de Cierre Mensual', 'Valor Certificado (Decimal.js)']],
    body: [
      ['Razón Social de la Empresa', `${company.razonSocial} (${company.rif})`],
      ['Dirección Fiscal Registrada', company.direccionFiscal],
      ['Código SADA / Representante Legal', `${company.codigoSada} — ${company.representanteLegal}`],
      ['Estatus de Auditoría del Cierre Contable', closure.status],
      ['Tasa BCV Promedio Ponderada del Período', `Bs. ${closure.averageBcvRate.toFixed(2)} / USD`],
      ['Total Compras Auditadas por OCR (USD)', formatUsd(closure.totalPurchasesUsd)],
      ['Total Pagos Liquidados a Proveedores (USD)', formatUsd(closure.totalPaidUsd)],
      ['Saldo Cuentas por Pagar al Cierre (USD)', formatUsd(closure.pendingPayablesUsd)],
      ['Valoración de Inventario al Cierre (USD)', formatUsd(closure.inventoryValuationUsd)],
      ['Valoración de Inventario al Cierre (VES BCV)', formatVes(closure.inventoryValuationVes)],
      ['Margen Bruto Operativo Ponderado (%)', `${closure.estimatedGrossMarginPercent.toFixed(2)}%`],
    ],
    styles: {
      fontSize: 9.2,
      cellPadding: 3.2,
      lineWidth: 0.1,
      lineColor: [203, 213, 225],
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 95 },
      1: { halign: 'right', cellWidth: 87 },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 145;

  runAutoTable(doc, {
    startY: finalY + 6,
    head: [['Nota Estratégica de Liquidez y Continuidad Operativa']],
    body: [[LIQUIDITY_STOCKOUT_JUSTIFICATION]],
    styles: {
      fontSize: 8,
      cellPadding: 3,
      lineWidth: 0.1,
      lineColor: [203, 213, 225],
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [2, 132, 199],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    margin: { left: 14, right: 14 },
  });

  renderImmutableFooterOnAllPages(doc, company, false);
  return doc;
}

export function exportMonthlyClosurePdf(
  closure: MonthlyClosureReport,
  companyInput?: Partial<CompanyFiscalProfile> | null
): void {
  const doc = generateMonthlyClosurePdfDocument(closure, companyInput);
  doc.save(`Chrystal_Cierre_Mensual_${closure.period}.pdf`);
}

const pdfExporter = {
  buildExecutiveInventoryPdfAnalytics,
  generateExecutiveInventoryPdfDocument,
  exportExecutiveInventoryPdf,
  generateMonthlyClosurePdfDocument,
  exportMonthlyClosurePdf,
  LIQUIDITY_STOCKOUT_JUSTIFICATION,
};

export default pdfExporter;
