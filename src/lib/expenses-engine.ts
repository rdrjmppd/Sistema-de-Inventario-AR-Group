/**
 * Core OPEX & Expense Management Engine (Control de Gastos Operativos)
 * Mathematical accuracy via Decimal.js (ROUND_HALF_UP).
 * Integrates:
 *  - Categorization, credit rules, early payment discounts & overdue penalties.
 *  - Manager dual-signature approval rule for expenses > $100 USD.
 *  - Monthly budget tracking with 70% proactive contingency alarm & 100% hard-cap lock.
 *  - Structured Google Drive folder suggestion for corporate preservation.
 *  - Monthly executive arqueo, Pareto analysis, micro-expenses audit & next-month projections.
 * Dual Export: export and export default.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import Decimal from 'decimal.js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSXStyle from 'xlsx-js-style';
import type * as XLSXTypes from 'xlsx-js-style';
import {
  CompanyFiscalProfile,
  ExpenseApprovalStatus,
  ExpenseCategory,
  ExpenseMonthlyArqueoReport,
  ExpensePaymentRecord,
  ExpenseRecord,
  ExpenseVoucherType,
  MonthlyBudgetPlan,
} from '../types';
import { round2, toDecimal, formatUsd, formatVes } from './decimal';
import { resolveCompanyProfile, COPYRIGHT_NOTICE } from './excel-exporter';
import { BRAND_COLORS, BRAND_LEGAL_NAME, BRAND_NAME, BRAND_RIF, HIPER_ABASTO_POLAR_LOGO_DATA_URI } from './brand-assets';

const XLSX: typeof XLSXTypes = ((XLSXStyle as unknown as { default?: typeof XLSXTypes }).default ||
  XLSXStyle) as typeof XLSXTypes;

const JsPdfConstructor: typeof jsPDF =
  (jsPDF as unknown as { jsPDF?: typeof jsPDF }).jsPDF || jsPDF;
const runAutoTable: typeof autoTable =
  (autoTable as unknown as { default?: typeof autoTable }).default || autoTable;

export const EXPENSE_CATEGORIES_METADATA: Record<
  ExpenseCategory,
  { label: string; icon: string; description: string; defaultBudgetSharePercent: number }
> = {
  OFICINA_PAPELERIA: {
    label: 'Oficina y Papelería',
    icon: 'FileText',
    description: 'Útiles de oficina, resmas, tinta, suministros administrativos',
    defaultBudgetSharePercent: 8,
  },
  MANTENIMIENTO_EQUIPOS: {
    label: 'Equipos de Mantenimiento',
    icon: 'Wrench',
    description: 'Herramientas, repuestos para montacargas, balanzas y maquinaria',
    defaultBudgetSharePercent: 15,
  },
  MATERIALES_MANTENIMIENTO: {
    label: 'Material de Mantenimiento',
    icon: 'Hammer',
    description: 'Tornillería, cables, tuberías, pintura, insumos de conservación',
    defaultBudgetSharePercent: 12,
  },
  MATERIALES_CONSTRUCCION: {
    label: 'Materiales de Construcción',
    icon: 'Building',
    description: 'Remodelaciones menores, cemento, bloques, perfiles metálicos',
    defaultBudgetSharePercent: 10,
  },
  CLIMATIZACION_AC: {
    label: 'Climatización y Cavas',
    icon: 'Snowflake',
    description: 'Servicio y repuestos de aires acondicionados, cavas y chillers',
    defaultBudgetSharePercent: 18,
  },
  SERVIDORES_TI_TELEVISORES: {
    label: 'Servidores, TI y Pantallas',
    icon: 'Server',
    description: 'Servidores, switches, cableado estructurado, TVs y monitores POS',
    defaultBudgetSharePercent: 14,
  },
  SERVICIO_TECNICO_ESPECIALIZADO: {
    label: 'Servicio Técnico Especializado',
    icon: 'Cpu',
    description: 'Honorarios profesionales, electricistas industriales, técnicos certificados',
    defaultBudgetSharePercent: 10,
  },
  LIMPIEZA_DESINFECCION: {
    label: 'Limpieza y Desinfección',
    icon: 'Sparkles',
    description: 'Químicos de saneamiento, mopas, bolsas industriales, jabón',
    defaultBudgetSharePercent: 5,
  },
  LOGISTICA_VIATICOS: {
    label: 'Logística y Viáticos',
    icon: 'Truck',
    description: 'Combustible, fletes locales, viáticos de compras y gestiones',
    defaultBudgetSharePercent: 4,
  },
  SERVICIOS_PUBLICOS: {
    label: 'Servicios Básicos e Internet',
    icon: 'Wifi',
    description: 'Telecomunicaciones, internet satelital/fibra, agua y energía',
    defaultBudgetSharePercent: 3,
  },
  OTRO: {
    label: 'Otros Gastos Operativos',
    icon: 'MoreHorizontal',
    description: 'Gastos misceláneos justificados',
    defaultBudgetSharePercent: 1,
  },
};

export const EXPENSE_APPROVAL_THRESHOLD_USD = 100.0;
export const CONTINGENCY_ALARM_THRESHOLD_PERCENT = 70.0;

/**
 * Evalúa si un gasto requiere aprobación gerencial obligatoria (> $100 USD).
 */
export function evaluateExpenseApprovalRequirement(amountUsd: number): {
  requiresManagerApproval: boolean;
  initialApprovalStatus: ExpenseApprovalStatus;
  thresholdUsd: number;
} {
  const decAmount = toDecimal(amountUsd);
  const requires = decAmount.greaterThan(EXPENSE_APPROVAL_THRESHOLD_USD);
  return {
    requiresManagerApproval: requires,
    initialApprovalStatus: requires ? 'PENDIENTE_APROBACION' : 'APROBADO_DIRECTO',
    thresholdUsd: EXPENSE_APPROVAL_THRESHOLD_USD,
  };
}

/**
 * Calcula si un gasto a crédito es elegible para Descuento por Pronto Pago.
 */
export function calculateEarlyPaymentDiscount(
  expense: Pick<
    ExpenseRecord,
    'netPayableUsd' | 'earlyPaymentDiscountPercent' | 'earlyPaymentDiscountDeadline'
  >,
  referenceDateIso?: string
): {
  isEligible: boolean;
  discountPercent: number;
  discountAmountUsd: number;
  discountedPayableUsd: number;
  daysRemaining: number;
  isUrgent48h: boolean;
} {
  const pct = Number(expense.earlyPaymentDiscountPercent || 0);
  const deadline = expense.earlyPaymentDiscountDeadline;

  if (pct <= 0 || !deadline) {
    return {
      isEligible: false,
      discountPercent: 0,
      discountAmountUsd: 0,
      discountedPayableUsd: expense.netPayableUsd,
      daysRemaining: 0,
      isUrgent48h: false,
    };
  }

  const now = referenceDateIso ? new Date(referenceDateIso) : new Date();
  const target = new Date(deadline);
  target.setHours(23, 59, 59, 999);

  const diffMs = target.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const hoursRemaining = diffMs / (1000 * 60 * 60);

  if (diffMs < 0) {
    return {
      isEligible: false,
      discountPercent: pct,
      discountAmountUsd: 0,
      discountedPayableUsd: expense.netPayableUsd,
      daysRemaining: 0,
      isUrgent48h: false,
    };
  }

  const netDec = toDecimal(expense.netPayableUsd);
  const discDec = netDec.times(pct).dividedBy(100);
  const finalDec = netDec.minus(discDec);

  return {
    isEligible: true,
    discountPercent: pct,
    discountAmountUsd: round2(discDec),
    discountedPayableUsd: round2(finalDec),
    daysRemaining,
    isUrgent48h: hoursRemaining > 0 && hoursRemaining <= 48,
  };
}

/**
 * Calcula el recargo por mora si la factura de gasto venció su crédito.
 */
export function calculateOverduePenalty(
  expense: Pick<
    ExpenseRecord,
    'netPayableUsd' | 'paidAmountUsd' | 'dueDate' | 'penaltyRateMonthlyPercent' | 'penaltyFlatUsd'
  >,
  referenceDateIso?: string
): {
  isOverdue: boolean;
  daysOverdue: number;
  penaltyAmountUsd: number;
  totalWithPenaltyUsd: number;
} {
  const pendingDec = toDecimal(expense.netPayableUsd).minus(expense.paidAmountUsd);
  if (pendingDec.lessThanOrEqualTo(0) || !expense.dueDate) {
    return {
      isOverdue: false,
      daysOverdue: 0,
      penaltyAmountUsd: 0,
      totalWithPenaltyUsd: round2(pendingDec),
    };
  }

  const now = referenceDateIso ? new Date(referenceDateIso) : new Date();
  const due = new Date(expense.dueDate);
  due.setHours(23, 59, 59, 999);

  const diffMs = now.getTime() - due.getTime();
  if (diffMs <= 0) {
    return {
      isOverdue: false,
      daysOverdue: 0,
      penaltyAmountUsd: 0,
      totalWithPenaltyUsd: round2(pendingDec),
    };
  }

  const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let penaltyDec = toDecimal(0);

  // Recargo fijo en dólares
  if (expense.penaltyFlatUsd && expense.penaltyFlatUsd > 0) {
    penaltyDec = penaltyDec.plus(expense.penaltyFlatUsd);
  }

  // Tasa de mora mensual proporcional a los días transcurridos
  if (expense.penaltyRateMonthlyPercent && expense.penaltyRateMonthlyPercent > 0) {
    const monthlyRate = toDecimal(expense.penaltyRateMonthlyPercent).dividedBy(100);
    const dailyRate = monthlyRate.dividedBy(30);
    penaltyDec = penaltyDec.plus(pendingDec.times(dailyRate).times(daysOverdue));
  }

  const penaltyUsd = round2(penaltyDec);
  return {
    isOverdue: true,
    daysOverdue,
    penaltyAmountUsd: penaltyUsd,
    totalWithPenaltyUsd: round2(pendingDec.plus(penaltyUsd)),
  };
}

/**
 * Genera la sugerencia estructurada de ruta de Google Drive empresarial.
 * Ejemplo: "Google Drive Empresa / Inversiones Clima Polar / 2026-10 / FACTURA_FISCAL_FAC-491_2026-10-25.pdf"
 */
export function buildSuggestedDrivePath(params: {
  beneficiaryName: string;
  issueDate: string;
  voucherType: ExpenseVoucherType;
  voucherNumber: string;
  originalFileName?: string;
}): {
  folderPath: string;
  suggestedFileName: string;
  fullRelativePath: string;
} {
  const cleanBeneficiary = (params.beneficiaryName || 'PROVEEDOR_GENERAL')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 _-]/g, '')
    .slice(0, 35);

  const periodYearMonth = params.issueDate ? params.issueDate.slice(0, 7) : '2026-10';
  const cleanVoucherNum = (params.voucherNumber || 'SIN-NUMERO')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '');

  let extension = 'pdf';
  if (params.originalFileName && params.originalFileName.includes('.')) {
    extension = params.originalFileName.split('.').pop()?.toLowerCase() || 'pdf';
  }

  const folderPath = `Google Drive Empresa / ${cleanBeneficiary} / ${periodYearMonth}`;
  const suggestedFileName = `${params.voucherType}_${cleanVoucherNum}_${params.issueDate}.${extension}`;
  const fullRelativePath = `${folderPath} / ${suggestedFileName}`;

  return { folderPath, suggestedFileName, fullRelativePath };
}

/**
 * Evalúa el estado del presupuesto mensual, disparando la alarma del 70% o bloqueo del 100%.
 */
export function evaluateMonthlyBudgetStatus(
  budgetPlan: MonthlyBudgetPlan,
  expenses: ExpenseRecord[],
  periodYearMonth: string
): {
  periodYearMonth: string;
  totalBudgetLimitUsd: number;
  totalExecutedUsd: number;
  totalExecutedVes: number;
  remainingBudgetUsd: number;
  budgetConsumedPercent: number;
  isContingencyAlarm70: boolean;
  isOverBudget100: boolean;
  activeExpensesCount: number;
  categoryExecution: Record<
    ExpenseCategory,
    { budgetedUsd: number; executedUsd: number; consumedPercent: number }
  >;
} {
  // Solo computar gastos aprobados o directos (descartar rechazados)
  const activeExpenses = expenses.filter(
    (e) =>
      e.issueDate.startsWith(periodYearMonth) &&
      e.approvalStatus !== 'RECHAZADO'
  );

  let totalExecutedUsdDec = toDecimal(0);
  let totalExecutedVesDec = toDecimal(0);

  const catMap: Record<ExpenseCategory, Decimal> = {
    OFICINA_PAPELERIA: toDecimal(0),
    MANTENIMIENTO_EQUIPOS: toDecimal(0),
    MATERIALES_MANTENIMIENTO: toDecimal(0),
    MATERIALES_CONSTRUCCION: toDecimal(0),
    CLIMATIZACION_AC: toDecimal(0),
    SERVIDORES_TI_TELEVISORES: toDecimal(0),
    SERVICIO_TECNICO_ESPECIALIZADO: toDecimal(0),
    LIMPIEZA_DESINFECCION: toDecimal(0),
    LOGISTICA_VIATICOS: toDecimal(0),
    SERVICIOS_PUBLICOS: toDecimal(0),
    OTRO: toDecimal(0),
  };

  for (const exp of activeExpenses) {
    totalExecutedUsdDec = totalExecutedUsdDec.plus(exp.amountUsd);
    totalExecutedVesDec = totalExecutedVesDec.plus(exp.amountVes);
    if (catMap[exp.category]) {
      catMap[exp.category] = catMap[exp.category].plus(exp.amountUsd);
    }
  }

  const budgetDec = toDecimal(budgetPlan.globalBudgetLimitUsd || 1);
  const consumedPct = totalExecutedUsdDec.dividedBy(budgetDec).times(100);
  const remainingDec = budgetDec.minus(totalExecutedUsdDec);

  const isContingencyAlarm70 = consumedPct.greaterThanOrEqualTo(
    budgetPlan.contingencyAlarmThresholdPercent || CONTINGENCY_ALARM_THRESHOLD_PERCENT
  );
  const isOverBudget100 = consumedPct.greaterThanOrEqualTo(100);

  const categoryExecution: Record<
    ExpenseCategory,
    { budgetedUsd: number; executedUsd: number; consumedPercent: number }
  > = {} as any;

  (Object.keys(catMap) as ExpenseCategory[]).forEach((cat) => {
    const budgeted = budgetPlan.categoryBudgets?.[cat] || 0;
    const executed = round2(catMap[cat]);
    const pct = budgeted > 0 ? round2(toDecimal(executed).dividedBy(budgeted).times(100)) : 0;
    categoryExecution[cat] = {
      budgetedUsd: budgeted,
      executedUsd: executed,
      consumedPercent: pct,
    };
  });

  return {
    periodYearMonth,
    totalBudgetLimitUsd: round2(budgetDec),
    totalExecutedUsd: round2(totalExecutedUsdDec),
    totalExecutedVes: round2(totalExecutedVesDec),
    remainingBudgetUsd: round2(remainingDec),
    budgetConsumedPercent: round2(consumedPct),
    isContingencyAlarm70,
    isOverBudget100,
    activeExpensesCount: activeExpenses.length,
    categoryExecution,
  };
}

/**
 * Genera el informe consolidado de Arqueo y Proyección Mensual de Gastos.
 */
export function generateMonthlyExpenseArqueoData(
  expenses: ExpenseRecord[],
  budgetPlan: MonthlyBudgetPlan,
  periodYearMonth: string,
  generatedBy: string
): ExpenseMonthlyArqueoReport {
  const budgetStatus = evaluateMonthlyBudgetStatus(budgetPlan, expenses, periodYearMonth);

  const monthExpenses = expenses.filter(
    (e) => e.issueDate.startsWith(periodYearMonth) && e.approvalStatus !== 'RECHAZADO'
  );

  // 1. Top de Gastos por Monto (Análisis de Pareto)
  const sortedByAmount = [...monthExpenses].sort((a, b) => b.amountUsd - a.amountUsd);
  const topExpensesByAmount = sortedByAmount.slice(0, 10).map((e) => ({
    id: e.id,
    description: e.description,
    amountUsd: round2(e.amountUsd),
    category: e.category,
    beneficiary: e.beneficiaryName,
    voucherNumber: e.voucherNumber,
  }));

  // 2. Top de Gastos Hormiga Frecuentes (montos pequeños <= $50 pero con alta recurrencia)
  const categoryFreqMap = new Map<
    ExpenseCategory,
    { count: number; totalAmountUsd: Decimal }
  >();

  for (const e of monthExpenses) {
    if (e.amountUsd <= 50) {
      const prev = categoryFreqMap.get(e.category) || {
        count: 0,
        totalAmountUsd: toDecimal(0),
      };
      prev.count += 1;
      prev.totalAmountUsd = prev.totalAmountUsd.plus(e.amountUsd);
      categoryFreqMap.set(e.category, prev);
    }
  }

  const topFrequentMicroExpenses = Array.from(categoryFreqMap.entries())
    .map(([category, val]) => ({
      category,
      count: val.count,
      totalAmountUsd: round2(val.totalAmountUsd),
      avgAmountUsd: round2(val.totalAmountUsd.dividedBy(val.count || 1)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 3. Top Proveedores / Contratistas con mayor inversión
  const supplierSpendMap = new Map<string, { rif: string; totalUsd: Decimal; count: number }>();
  for (const e of monthExpenses) {
    const prev = supplierSpendMap.get(e.beneficiaryName) || {
      rif: e.beneficiaryRif,
      totalUsd: toDecimal(0),
      count: 0,
    };
    prev.totalUsd = prev.totalUsd.plus(e.amountUsd);
    prev.count += 1;
    supplierSpendMap.set(e.beneficiaryName, prev);
  }

  const topSuppliersBySpend = Array.from(supplierSpendMap.entries())
    .map(([supplierName, val]) => ({
      supplierName,
      rif: val.rif,
      totalUsd: round2(val.totalUsd),
      count: val.count,
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd)
    .slice(0, 6);

  // 4. Proyecciones Estratégicas Presupuestarias para el Próximo Mes
  const nextMonthBudgetProjections: ExpenseMonthlyArqueoReport['nextMonthBudgetProjections'] = [];
  const totalExec = budgetStatus.totalExecutedUsd || 1;

  (Object.keys(EXPENSE_CATEGORIES_METADATA) as ExpenseCategory[]).forEach((cat) => {
    const executed = budgetStatus.categoryExecution[cat]?.executedUsd || 0;
    const shareOfTotal = round2((executed / totalExec) * 100);

    // Ajuste prudencial para el mes siguiente (+5% si excedió, o ponderado si estuvo bajo)
    let recommended = executed * 1.05;
    let rationale = 'Mantenimiento del ritmo de consumo ordinario con contingencia del 5%.';

    if (cat === 'CLIMATIZACION_AC' || cat === 'SERVIDORES_TI_TELEVISORES') {
      rationale = 'Prioridad crítica en cadena de frío y continuidad de servidores POS.';
      recommended = Math.max(recommended, 500);
    } else if (shareOfTotal > 25) {
      rationale = 'Rubro de alto impacto: se recomienda licitar con múltiples proveedores para abaratar costos.';
    }

    nextMonthBudgetProjections.push({
      category: cat,
      historicalAvgUsd: round2(executed),
      recommendedAllocationUsd: round2(recommended),
      rationale,
    });
  });

  const now = new Date();
  const generatedAtVet = now.toISOString().replace('T', ' ').slice(0, 19);

  return {
    id: `arq-${periodYearMonth}-${Date.now()}`,
    periodYearMonth,
    totalBudgetUsd: budgetStatus.totalBudgetLimitUsd,
    totalExecutedUsd: budgetStatus.totalExecutedUsd,
    totalExecutedVes: budgetStatus.totalExecutedVes,
    variancePercent: budgetStatus.budgetConsumedPercent,
    status: budgetStatus.isOverBudget100
      ? 'EXCEDIDO'
      : budgetStatus.isContingencyAlarm70
      ? 'EN_ALARMA_70'
      : 'DENTRO_PRESUPUESTO',
    topExpensesByAmount,
    topFrequentMicroExpenses,
    topSuppliersBySpend,
    nextMonthBudgetProjections,
    generatedAtVet,
    generatedBy,
  };
}

/**
 * Genera el documento PDF Ejecutivo del Arqueo y Cierre de Gastos con Branding Oficial.
 */
export function exportExpenseArqueoPdfDocument(
  report: ExpenseMonthlyArqueoReport,
  companyInput?: Partial<CompanyFiscalProfile> | null
): jsPDF {
  const company = resolveCompanyProfile(companyInput);
  const doc = new JsPdfConstructor({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // 1. Encabezado Corporativo Midnight Blue
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 36, 'F');

  // Franja Dorada
  doc.setFillColor(217, 119, 6);
  doc.rect(0, 36, 210, 2, 'F');

  // Logo Oficial
  try {
    doc.addImage(HIPER_ABASTO_POLAR_LOGO_DATA_URI, 'JPEG', 14, 6, 24, 24);
  } catch {
    // fallback
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(company.razonSocial.toUpperCase(), 42, 14);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`RIF: ${company.rif} · CONTABILIDAD & CONTROL FINANCIERO OPEX`, 42, 19);
  doc.text(`Período de Arqueo Mensual: ${report.periodYearMonth} · Emisión: ${report.generatedAtVet}`, 42, 24);

  // Status Badge
  const statusColor =
    report.status === 'DENTRO_PRESUPUESTO'
      ? [16, 185, 129]
      : report.status === 'EN_ALARMA_70'
      ? [245, 158, 11]
      : [239, 68, 68];

  doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
  doc.roundedRect(140, 10, 56, 14, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    report.status === 'DENTRO_PRESUPUESTO'
      ? 'DENTRO DE PRESUPUESTO'
      : report.status === 'EN_ALARMA_70'
      ? 'EN ALERTA 70%'
      : 'PRESUPUESTO EXCEDIDO',
    168,
    19,
    { align: 'center' }
  );

  let currentY = 44;

  // 2. Tarjetas KPI Ejecutivas
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN EJECUTIVO DE ARQUEO PRESUPUESTARIO', 14, currentY);
  currentY += 4;

  runAutoTable(doc, {
    startY: currentY,
    head: [['Presupuesto Mensual', 'Ejecución Total (USD)', 'Ejecución en Bolívares (VES)', 'Consumo Presupuestario']],
    body: [
      [
        `$${formatUsd(report.totalBudgetUsd)}`,
        `$${formatUsd(report.totalExecutedUsd)}`,
        `Bs. ${formatVes(report.totalExecutedVes)}`,
        `${report.variancePercent.toFixed(1)}%`,
      ],
    ],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, halign: 'center' },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // 3. Tabla: Top Gastos Mayores (Pareto)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('1. TOP GASTOS MAYORES DEL MES (ANÁLISIS DE PARETO)', 14, currentY);
  currentY += 3;

  runAutoTable(doc, {
    startY: currentY,
    head: [['#', 'Proveedor / Prestador', 'Comprobante', 'Rubro / Categoría', 'Descripción', 'Monto (USD)']],
    body: report.topExpensesByAmount.map((g, idx) => [
      String(idx + 1),
      g.beneficiary,
      g.voucherNumber,
      EXPENSE_CATEGORIES_METADATA[g.category]?.label || g.category,
      g.description,
      `$${formatUsd(g.amountUsd)}`,
    ]),
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      5: { halign: 'right', fontStyle: 'bold' },
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Si queda poco espacio, agregar página
  if (currentY > 210) {
    doc.addPage();
    currentY = 20;
  }

  // 4. Tabla: Gastos Hormiga Recurrentes (<= $50)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('2. AUDITORÍA DE GASTOS HORMIGA RECURRENTES (<= $50 USD)', 14, currentY);
  currentY += 3;

  runAutoTable(doc, {
    startY: currentY,
    head: [['Categoría / Rubro', 'Frecuencia (Tickets)', 'Gasto Acumulado (USD)', 'Ticket Promedio (USD)']],
    body: report.topFrequentMicroExpenses.map((m) => [
      EXPENSE_CATEGORIES_METADATA[m.category]?.label || m.category,
      `${m.count} compras`,
      `$${formatUsd(m.totalAmountUsd)}`,
      `$${formatUsd(m.avgAmountUsd)}`,
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, halign: 'center' },
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'left' } },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  if (currentY > 220) {
    doc.addPage();
    currentY = 20;
  }

  // 5. Tabla: Top Proveedores con Mayor Inversión
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('3. TOP PROVEEDORES Y CONTRATISTAS POR MONTO LIQUIDADO', 14, currentY);
  currentY += 3;

  runAutoTable(doc, {
    startY: currentY,
    head: [['Proveedor / Contratista', 'RIF / Cédula', 'Operaciones', 'Inversión Total (USD)']],
    body: report.topSuppliersBySpend.map((s) => [
      s.supplierName,
      s.rif,
      `${s.count} facturas`,
      `$${formatUsd(s.totalUsd)}`,
    ]),
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 8 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // 6. Pie de Página Inmutable en todas las páginas
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${COPYRIGHT_NOTICE} · Documento Oficial Emitido por: ${report.generatedBy} · Página ${i} de ${totalPages}`,
      105,
      290,
      { align: 'center' }
    );
  }

  return doc;
}

/**
 * Genera el libro Excel (.xlsx) estructurado del Arqueo y Cierre de Gastos.
 */
export function buildExpenseArqueoWorkbook(
  report: ExpenseMonthlyArqueoReport,
  companyInput?: Partial<CompanyFiscalProfile> | null
): XLSXTypes.WorkBook {
  const company = resolveCompanyProfile(companyInput);
  const wb = XLSX.utils.book_new();

  // Hoja 1: Resumen y Pareto
  const summaryRows = [
    [company.razonSocial.toUpperCase()],
    [`RIF: ${company.rif} · INFORME DE ARQUEO Y CIERRE DE GASTOS OPEX`],
    [`Período: ${report.periodYearMonth} · Generado el: ${report.generatedAtVet}`],
    [],
    ['METRICAS PRINCIPALES DEL PERIODO'],
    ['Presupuesto Autorizado (USD)', report.totalBudgetUsd],
    ['Gasto Total Ejecutado (USD)', report.totalExecutedUsd],
    ['Gasto Total Ejecutado (VES)', report.totalExecutedVes],
    ['Porcentaje de Consumo', `${report.variancePercent.toFixed(1)}%`],
    ['Estatus Presupuestario', report.status],
    [],
    ['TOP GASTOS MAYORES (PARETO)'],
    ['#', 'Proveedor', 'N° Comprobante', 'Rubro', 'Descripción', 'Monto USD'],
    ...report.topExpensesByAmount.map((g, i) => [
      i + 1,
      g.beneficiary,
      g.voucherNumber,
      EXPENSE_CATEGORIES_METADATA[g.category]?.label || g.category,
      g.description,
      g.amountUsd,
    ]),
    [],
    ['GASTOS HORMIGA RECURRENTES (<= $50 USD)'],
    ['Categoría', 'Tickets', 'Total USD', 'Promedio USD'],
    ...report.topFrequentMicroExpenses.map((m) => [
      EXPENSE_CATEGORIES_METADATA[m.category]?.label || m.category,
      m.count,
      m.totalAmountUsd,
      m.avgAmountUsd,
    ]),
    [],
    ['TOP PROVEEDORES POR MONTO'],
    ['Proveedor', 'RIF', 'Facturas', 'Total USD'],
    ...report.topSuppliersBySpend.map((s) => [s.supplierName, s.rif, s.count, s.totalUsd]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Arqueo Mensual OPEX');

  // Hoja 2: Proyecciones Estratégicas Mes Siguiente
  const projectionRows = [
    ['PROYECCIONES PRESUPUESTARIAS PARA EL MES SIGUIENTE'],
    ['Categoría / Rubro', 'Gasto Histórico (USD)', 'Asignación Recomendada (USD)', 'Criterio Operativo'],
    ...report.nextMonthBudgetProjections.map((p) => [
      EXPENSE_CATEGORIES_METADATA[p.category]?.label || p.category,
      p.historicalAvgUsd,
      p.recommendedAllocationUsd,
      p.rationale,
    ]),
  ];

  const wsProj = XLSX.utils.aoa_to_sheet(projectionRows);
  XLSX.utils.book_append_sheet(wb, wsProj, 'Proyecciones Próximo Mes');

  return wb;
}
