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

export function exportExecutiveInventoryPdf(
  products: Product[],
  locations: LocationNode[],
  bcvState: BcvRateState,
  companyInput?: Partial<CompanyFiscalProfile> | null
): void {
  const company = resolveCompanyProfile(companyInput);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 34, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text(
    `${company.razonSocial.toUpperCase()}  —  RIF: ${company.rif}`,
    14,
    10
  );

  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  doc.text(
    `Dirección Fiscal: ${company.direccionFiscal}  |  Tel: ${company.telefono}  |  SADA: ${company.codigoSada}`,
    14,
    17
  );

  doc.setFontSize(8.5);
  doc.setTextColor(186, 230, 253);
  doc.text(
    `CHRYSTAL® ENTERPRISE ERP — AUDITORÍA VALORIZADA DE INVENTARIO  |  Emisión VET: ${bcvState.caracasDateFormatted} ${bcvState.caracasTimeFormatted}  |  Tasa BCV: Bs. ${bcvState.activeRate.toFixed(2)} / USD`,
    14,
    24
  );

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Representante / Gerencia: ${company.representanteLegal}  |  Giro: ${company.actividadEconomica}`,
    14,
    30
  );

  const tableBody = products.map((p) => {
    const totalStock = Object.values(p.stockByLocation).reduce(
      (acc, q) => round2(toDecimal(acc).plus(q)),
      0
    );
    const pvpVes = convertUsdToVes(p.priceUsd, bcvState.activeRate);
    const totalCostUsd = round2(toDecimal(totalStock).times(p.costUsd));
    return [
      p.sku,
      p.name,
      p.category,
      p.abcClass,
      `${totalStock} ${p.unit}`,
      formatUsd(p.costUsd),
      `${p.targetMarginPercent.toFixed(1)}%`,
      formatUsd(p.priceUsd),
      formatVes(pvpVes),
      formatUsd(totalCostUsd),
    ];
  });

  autoTable(doc, {
    startY: 39,
    head: [
      [
        'SKU',
        'Producto (Col B)',
        'Categoría',
        'ABC',
        'Stock Total (Col F)',
        'Costo USD',
        'Margen',
        'PVP USD',
        'PVP Bs. (BCV)',
        'Costo Total USD',
      ],
    ],
    body: tableBody,
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14, bottom: 20 },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${COPYRIGHT_NOTICE}  —  Empresa: ${company.razonSocial} (${company.rif})  —  Sedes: ${locations.map((l) => l.code).join(', ')}  —  Pág. ${i}/${pageCount}`,
      14,
      202
    );
  }

  const cleanDate = bcvState.caracasDateFormatted.replace(/\//g, '-');
  const cleanRif = company.rif.replace(/[^A-Za-z0-9-]/g, '').slice(0, 14) || 'EMPRESA';
  doc.save(`Chrystal_Reporte_Ejecutivo_${cleanRif}_${cleanDate}.pdf`);
}

export function exportMonthlyClosurePdf(
  closure: MonthlyClosureReport,
  companyInput?: Partial<CompanyFiscalProfile> | null
): void {
  const company = resolveCompanyProfile(companyInput);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 34, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(`${company.razonSocial.toUpperCase()} — RIF: ${company.rif}`, 14, 11);

  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  doc.text(`Dirección Fiscal: ${company.direccionFiscal}`, 14, 18);

  doc.setFontSize(8.5);
  doc.setTextColor(186, 230, 253);
  doc.text(
    `ACTA DE CIERRE CONTABLE MENSUAL (${closure.period})  |  Emitido VET: ${closure.closedAtVet}  |  Auditor: ${closure.closedBy}`,
    14,
    26
  );

  autoTable(doc, {
    startY: 40,
    head: [['Indicador Contable de Cierre Mensual', 'Valor Certificado']],
    body: [
      ['Razón Social de la Empresa', `${company.razonSocial} (${company.rif})`],
      ['Dirección Fiscal Registrada', company.direccionFiscal],
      ['Estatus del Cierre Contable', closure.status],
      ['Tasa BCV Promedio Ponderada del Período', `Bs. ${closure.averageBcvRate.toFixed(2)} / USD`],
      ['Total Compras Auditadas por OCR (USD)', formatUsd(closure.totalPurchasesUsd)],
      ['Total Pagos Liquidados a Proveedores (USD)', formatUsd(closure.totalPaidUsd)],
      ['Saldo Cuentas por Pagar al Cierre (USD)', formatUsd(closure.pendingPayablesUsd)],
      ['Valoración de Inventario al Cierre (USD)', formatUsd(closure.inventoryValuationUsd)],
      ['Valoración de Inventario al Cierre (VES)', formatVes(closure.inventoryValuationVes)],
      ['Margen Bruto Operativo Ponderado (%)', `${closure.estimatedGrossMarginPercent.toFixed(2)}%`],
    ],
    styles: { fontSize: 9.5, cellPadding: 3.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
  });

  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${COPYRIGHT_NOTICE} — ${company.razonSocial} (${company.rif})`, 14, 285);

  doc.save(`Chrystal_Cierre_Mensual_${closure.period}.pdf`);
}

