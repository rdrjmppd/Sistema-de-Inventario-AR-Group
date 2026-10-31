import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  ExpenseApprovalStatus,
  ExpenseCategory,
  ExpenseMonthlyArqueoReport,
  ExpensePaymentRecord,
  ExpenseRecord,
  ExpenseVoucherType,
  IndexedInvoiceAttachment,
  MonthlyBudgetPlan,
  PurchaseInvoice,
} from '../types';
import {
  buildSuggestedDrivePath,
  calculateEarlyPaymentDiscount,
  calculateOverduePenalty,
  evaluateExpenseApprovalRequirement,
  evaluateMonthlyBudgetStatus,
  EXPENSE_CATEGORIES_METADATA,
  generateMonthlyExpenseArqueoData,
} from '../lib/expenses-engine';
import { round2, toDecimal } from '../lib/decimal';
import { useFinance } from './FinanceContext';
import { useInventory } from './InventoryContext';
import { useAuth } from './AuthContext';

export interface PreloadExpenseInput {
  voucherType: ExpenseVoucherType;
  voucherNumber: string;
  controlNumber?: string;
  category: ExpenseCategory;
  description: string;
  supplierId?: string;
  beneficiaryName: string;
  beneficiaryRif: string;
  beneficiaryType: 'PERSONA_NATURAL' | 'PERSONA_JURIDICA';
  locationId: string;
  issueDate: string;
  dueDate?: string;
  paymentCondition: 'CONTADO' | 'CREDITO';
  creditDays?: number;
  earlyPaymentDiscountPercent?: number;
  earlyPaymentDiscountDeadline?: string;
  penaltyRateMonthlyPercent?: number;
  penaltyFlatUsd?: number;
  currency: 'USD' | 'VES';
  bcvRate: number;
  amountOriginal: number;
  amountUsd: number;
  amountVes: number;
  taxIncluded: boolean;
  ivaAmountUsd: number;
  islrRetentionSuggestedUsd?: number;
  netPayableUsd: number;
  attachment?: IndexedInvoiceAttachment;
  managerPinOverride?: string;
}

export interface RegisterExpensePaymentInput {
  amountUsd: number;
  method: ExpensePaymentRecord['method'];
  reference: string;
  registeredBy: string;
  applyEarlyDiscount?: boolean;
}

export interface ExpenseContextType {
  expenses: ExpenseRecord[];
  budgetPlan: MonthlyBudgetPlan;
  budgetStatus: ReturnType<typeof evaluateMonthlyBudgetStatus>;
  selectedPeriod: string;
  setSelectedPeriod: (period: string) => void;
  preloadExpense: (input: PreloadExpenseInput) => {
    success: boolean;
    expense?: ExpenseRecord;
    error?: string;
    warning?: string;
  };
  approveExpense: (
    expenseId: string,
    managerPin: string,
    managerUser?: { id: string; name: string; role: string }
  ) => { success: boolean; error?: string };
  rejectExpense: (
    expenseId: string,
    managerPin: string,
    reason: string,
    managerUser?: { id: string; name: string }
  ) => { success: boolean; error?: string };
  registerExpensePayment: (
    expenseId: string,
    paymentInput: RegisterExpensePaymentInput
  ) => {
    success: boolean;
    error?: string;
    paymentRecord?: ExpensePaymentRecord;
  };
  updateBudgetPlan: (
    newPlan: Partial<MonthlyBudgetPlan>,
    managerPin: string
  ) => { success: boolean; error?: string };
  markDriveBackupConfirmed: (expenseId: string, driveUrl?: string) => void;
  monthlyArqueoReports: ExpenseMonthlyArqueoReport[];
  generateArqueoReport: (periodYearMonth: string, generatedBy?: string) => ExpenseMonthlyArqueoReport;
}

const DEFAULT_BUDGET_PLAN: MonthlyBudgetPlan = {
  id: 'plan-2026-10',
  periodYearMonth: '2026-10',
  globalBudgetLimitUsd: 2500.0,
  categoryBudgets: {
    OFICINA_PAPELERIA: 200.0,
    MANTENIMIENTO_EQUIPOS: 375.0,
    MATERIALES_MANTENIMIENTO: 300.0,
    MATERIALES_CONSTRUCCION: 250.0,
    CLIMATIZACION_AC: 450.0,
    SERVIDORES_TI_TELEVISORES: 350.0,
    SERVICIO_TECNICO_ESPECIALIZADO: 250.0,
    LIMPIEZA_DESINFECCION: 125.0,
    LOGISTICA_VIATICOS: 100.0,
    SERVICIOS_PUBLICOS: 75.0,
    OTRO: 25.0,
  },
  locationBudgets: {
    'loc-pzo-01': 2000.0,
    'loc-pzo-02': 500.0,
  },
  contingencyAlarmThresholdPercent: 70.0,
  hardCapLockEnabled: true,
  authorizedBy: 'Gerencia General (Aprobación Anual)',
  authorizedAtVet: '2026-10-01 08:00:00',
};

const INITIAL_EXPENSES: ExpenseRecord[] = [
  {
    id: 'exp-2026-001',
    expenseCode: 'GTO-202610-001',
    voucherType: 'FACTURA_FISCAL',
    voucherNumber: 'FAC-00812',
    controlNumber: '00-4821',
    category: 'CLIMATIZACION_AC',
    description: 'Mantenimiento preventivo bimensual y recarga de refrigerante R404A en Cava Cuarto Carnicería Sede Principal',
    beneficiaryName: 'Inversiones Clima Polar, C.A.',
    beneficiaryRif: 'J-40192831-2',
    beneficiaryType: 'PERSONA_JURIDICA',
    locationId: 'loc-pzo-01',
    issueDate: '2026-10-14',
    dueDate: '2026-10-28',
    paymentCondition: 'CREDITO',
    creditDays: 14,
    earlyPaymentDiscountPercent: 5,
    earlyPaymentDiscountDeadline: '2026-10-21',
    penaltyRateMonthlyPercent: 3,
    currency: 'USD',
    bcvRate: 886.23,
    amountOriginal: 380.0,
    amountUsd: 380.0,
    amountVes: 336767.4,
    taxIncluded: true,
    ivaAmountUsd: 52.41,
    netPayableUsd: 380.0,
    paidAmountUsd: 0,
    status: 'PENDIENTE',
    requiresManagerApproval: true,
    approvalStatus: 'APROBADO_GERENCIA',
    preloadedByUserId: 'usr-analyst-01',
    preloadedByName: 'Analista Operativo Pasillo',
    preloadedAtVet: '2026-10-14 11:20:00',
    approvedByUserId: 'usr-mgr-01',
    approvedByName: 'Gerente General',
    approvedAtVet: '2026-10-14 14:30:00',
    approvalPinUsed: '203040',
    payments: [],
    driveBackupPath: 'Google Drive Empresa / Inversiones Clima Polar CA / 2026-10 / FACTURA_FISCAL_FAC-00812_2026-10-14.pdf',
    driveBackupConfirmed: true,
    createdAtVet: '2026-10-14 11:20:00',
  },
  {
    id: 'exp-2026-002',
    expenseCode: 'GTO-202610-002',
    voucherType: 'TICKET_CAJA',
    voucherNumber: 'TCK-9901',
    category: 'MATERIALES_MANTENIMIENTO',
    description: 'Candados de seguridad reforzados y cinta reflectiva para zona de descarga',
    beneficiaryName: 'Ferretería El Candado de Oriente',
    beneficiaryRif: 'V-14892019-3',
    beneficiaryType: 'PERSONA_NATURAL',
    locationId: 'loc-pzo-01',
    issueDate: '2026-10-16',
    paymentCondition: 'CONTADO',
    currency: 'USD',
    bcvRate: 886.23,
    amountOriginal: 45.0,
    amountUsd: 45.0,
    amountVes: 39880.35,
    taxIncluded: true,
    ivaAmountUsd: 6.21,
    netPayableUsd: 45.0,
    paidAmountUsd: 45.0,
    status: 'PAGADO',
    requiresManagerApproval: false,
    approvalStatus: 'APROBADO_DIRECTO',
    preloadedByUserId: 'usr-analyst-01',
    preloadedByName: 'Analista Operativo Pasillo',
    preloadedAtVet: '2026-10-16 10:10:00',
    payments: [
      {
        id: 'pay-002-1',
        expenseId: 'exp-2026-002',
        amountUsd: 45.0,
        amountVes: 39880.35,
        bcvRate: 886.23,
        method: 'EFECTIVO_USD',
        reference: 'EFECTIVO-CAJA-CHICA',
        paidAtVet: '2026-10-16 10:15:00',
        registeredBy: 'Analista Operativo Pasillo',
      },
    ],
    driveBackupPath: 'Google Drive Empresa / Ferreteria El Candado de Oriente / 2026-10 / TICKET_CAJA_TCK-9901_2026-10-16.pdf',
    driveBackupConfirmed: true,
    createdAtVet: '2026-10-16 10:10:00',
  },
  {
    id: 'exp-2026-003',
    expenseCode: 'GTO-202610-003',
    voucherType: 'FACTURA_FISCAL',
    voucherNumber: 'FAC-1102',
    controlNumber: '00-09312',
    category: 'SERVIDORES_TI_TELEVISORES',
    description: 'Switch administrable Gigabit 24 puertos y bobina UTP Cat6 para modernización de cajas POS 1 a 6',
    beneficiaryName: 'Soluciones de Redes Guayana, C.A.',
    beneficiaryRif: 'J-31998421-0',
    beneficiaryType: 'PERSONA_JURIDICA',
    locationId: 'loc-pzo-01',
    issueDate: '2026-10-22',
    dueDate: '2026-11-05',
    paymentCondition: 'CREDITO',
    creditDays: 14,
    earlyPaymentDiscountPercent: 8,
    earlyPaymentDiscountDeadline: '2026-10-29',
    penaltyRateMonthlyPercent: 4,
    currency: 'USD',
    bcvRate: 886.23,
    amountOriginal: 260.0,
    amountUsd: 260.0,
    amountVes: 230419.8,
    taxIncluded: true,
    ivaAmountUsd: 35.86,
    netPayableUsd: 260.0,
    paidAmountUsd: 0,
    status: 'PENDIENTE',
    requiresManagerApproval: true,
    approvalStatus: 'PENDIENTE_APROBACION',
    preloadedByUserId: 'usr-analyst-01',
    preloadedByName: 'Analista Operativo Pasillo',
    preloadedAtVet: '2026-10-22 15:40:00',
    payments: [],
    driveBackupPath: 'Google Drive Empresa / Soluciones de Redes Guayana CA / 2026-10 / FACTURA_FISCAL_FAC-1102_2026-10-22.pdf',
    driveBackupConfirmed: false,
    createdAtVet: '2026-10-22 15:40:00',
  },
  {
    id: 'exp-2026-004',
    expenseCode: 'GTO-202610-004',
    voucherType: 'RECIBO_SIMPLE',
    voucherNumber: 'REC-0419',
    category: 'SERVICIO_TECNICO_ESPECIALIZADO',
    description: 'Reparación de tarjeta electrónica en balanza digital Torrey de mostrador carnicería',
    beneficiaryName: 'Téc. Carlos Mendoza',
    beneficiaryRif: 'V-17849201-5',
    beneficiaryType: 'PERSONA_NATURAL',
    locationId: 'loc-pzo-01',
    issueDate: '2026-10-24',
    paymentCondition: 'CONTADO',
    currency: 'USD',
    bcvRate: 886.23,
    amountOriginal: 85.0,
    amountUsd: 85.0,
    amountVes: 75329.55,
    taxIncluded: false,
    ivaAmountUsd: 0,
    islrRetentionSuggestedUsd: 2.55,
    netPayableUsd: 85.0,
    paidAmountUsd: 85.0,
    status: 'PAGADO',
    requiresManagerApproval: false,
    approvalStatus: 'APROBADO_DIRECTO',
    preloadedByUserId: 'usr-analyst-01',
    preloadedByName: 'Analista Operativo Pasillo',
    preloadedAtVet: '2026-10-24 16:15:00',
    payments: [
      {
        id: 'pay-004-1',
        expenseId: 'exp-2026-004',
        amountUsd: 85.0,
        amountVes: 75329.55,
        bcvRate: 886.23,
        method: 'PAGO_MOVIL_VES',
        reference: 'PM-9920192',
        paidAtVet: '2026-10-24 16:20:00',
        registeredBy: 'Analista Operativo Pasillo',
      },
    ],
    driveBackupPath: 'Google Drive Empresa / Tec Carlos Mendoza / 2026-10 / RECIBO_SIMPLE_REC-0419_2026-10-24.pdf',
    driveBackupConfirmed: true,
    createdAtVet: '2026-10-24 16:15:00',
  },
  {
    id: 'exp-2026-005',
    expenseCode: 'GTO-202610-005',
    voucherType: 'TICKET_CAJA',
    voucherNumber: 'TCK-3382',
    category: 'LIMPIEZA_DESINFECCION',
    description: 'Detergente desengrasante clorado y mopas industriales para área de desposte carnicería',
    beneficiaryName: 'Distribuidora Química del Sur',
    beneficiaryRif: 'J-29841029-4',
    beneficiaryType: 'PERSONA_JURIDICA',
    locationId: 'loc-pzo-01',
    issueDate: '2026-10-26',
    paymentCondition: 'CONTADO',
    currency: 'USD',
    bcvRate: 886.23,
    amountOriginal: 48.0,
    amountUsd: 48.0,
    amountVes: 42539.04,
    taxIncluded: true,
    ivaAmountUsd: 6.62,
    netPayableUsd: 48.0,
    paidAmountUsd: 48.0,
    status: 'PAGADO',
    requiresManagerApproval: false,
    approvalStatus: 'APROBADO_DIRECTO',
    preloadedByUserId: 'usr-analyst-01',
    preloadedByName: 'Analista Operativo Pasillo',
    preloadedAtVet: '2026-10-26 11:00:00',
    payments: [
      {
        id: 'pay-005-1',
        expenseId: 'exp-2026-005',
        amountUsd: 48.0,
        amountVes: 42539.04,
        bcvRate: 886.23,
        method: 'EFECTIVO_USD',
        reference: 'EFECTIVO-CAJA-CHICA',
        paidAtVet: '2026-10-26 11:05:00',
        registeredBy: 'Analista Operativo Pasillo',
      },
    ],
    driveBackupPath: 'Google Drive Empresa / Distribuidora Quimica del Sur / 2026-10 / TICKET_CAJA_TCK-3382_2026-10-26.pdf',
    driveBackupConfirmed: true,
    createdAtVet: '2026-10-26 11:00:00',
  },
];

const ExpenseContext = createContext<ExpenseContextType | undefined>(undefined);

export const ExpenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(() => {
    try {
      const saved = localStorage.getItem('ar_expenses_records');
      return saved ? JSON.parse(saved) : INITIAL_EXPENSES;
    } catch {
      return INITIAL_EXPENSES;
    }
  });

  const [budgetPlan, setBudgetPlan] = useState<MonthlyBudgetPlan>(() => {
    try {
      const saved = localStorage.getItem('ar_expenses_budget_plan');
      return saved ? JSON.parse(saved) : DEFAULT_BUDGET_PLAN;
    } catch {
      return DEFAULT_BUDGET_PLAN;
    }
  });

  const [monthlyArqueoReports, setMonthlyArqueoReports] = useState<ExpenseMonthlyArqueoReport[]>(() => {
    try {
      const saved = localStorage.getItem('ar_expenses_arqueo_reports');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-10');

  const { user } = useAuth();
  const { logAuditEvent } = useInventory();
  const { registerOcrInvoice, registerInvoicePayment } = useFinance();

  // Guardar en localStorage
  useEffect(() => {
    try {
      localStorage.setItem('ar_expenses_records', JSON.stringify(expenses));
    } catch (e) {
      console.warn('Could not save expenses to localStorage', e);
    }
  }, [expenses]);

  useEffect(() => {
    try {
      localStorage.setItem('ar_expenses_budget_plan', JSON.stringify(budgetPlan));
    } catch (e) {
      console.warn('Could not save budget plan to localStorage', e);
    }
  }, [budgetPlan]);

  useEffect(() => {
    try {
      localStorage.setItem('ar_expenses_arqueo_reports', JSON.stringify(monthlyArqueoReports));
    } catch (e) {
      console.warn('Could not save arqueo reports to localStorage', e);
    }
  }, [monthlyArqueoReports]);

  // Estado presupuestario en vivo
  const budgetStatus = useMemo(() => {
    return evaluateMonthlyBudgetStatus(budgetPlan, expenses, selectedPeriod);
  }, [budgetPlan, expenses, selectedPeriod]);

  // 1. Precarga de Gasto
  const preloadExpense = useCallback(
    (input: PreloadExpenseInput): {
      success: boolean;
      expense?: ExpenseRecord;
      error?: string;
      warning?: string;
    } => {
      const periodYearMonth = input.issueDate.slice(0, 7) || '2026-10';
      const currentEval = evaluateMonthlyBudgetStatus(budgetPlan, expenses, periodYearMonth);

      // Verificar si excede el 100% del presupuesto mensual
      const projectedTotal = currentEval.totalExecutedUsd + input.amountUsd;
      const isOverBudget = projectedTotal > budgetPlan.globalBudgetLimitUsd;

      if (isOverBudget && budgetPlan.hardCapLockEnabled) {
        if (!input.managerPinOverride || input.managerPinOverride !== '203040') {
          return {
            success: false,
            error: `Bloqueo de Presupuesto Excedido: Registrar este gasto ($${input.amountUsd.toFixed(2)}) elevaría la ejecución mensual a $${projectedTotal.toFixed(2)}, superando el límite autorizado de $${budgetPlan.globalBudgetLimitUsd.toFixed(2)}. Se requiere autorización gerencial (PIN 6 dígitos).`,
          };
        }
      }

      // Evaluar regla de aprobación (> $100 USD)
      const approvalEval = evaluateExpenseApprovalRequirement(input.amountUsd);

      // Generar ruta de Google Drive estructurada sugerida
      const driveSuggestion = buildSuggestedDrivePath({
        beneficiaryName: input.beneficiaryName,
        issueDate: input.issueDate,
        voucherType: input.voucherType,
        voucherNumber: input.voucherNumber,
        originalFileName: input.attachment?.fileName,
      });

      const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const expenseId = `exp-${Date.now()}`;
      const expenseSeq = String(expenses.length + 1).padStart(3, '0');
      const expenseCode = `GTO-${periodYearMonth.replace('-', '')}-${expenseSeq}`;

      const newExpense: ExpenseRecord = {
        id: expenseId,
        expenseCode,
        voucherType: input.voucherType,
        voucherNumber: input.voucherNumber,
        controlNumber: input.controlNumber,
        category: input.category,
        description: input.description,
        supplierId: input.supplierId,
        beneficiaryName: input.beneficiaryName,
        beneficiaryRif: input.beneficiaryRif,
        beneficiaryType: input.beneficiaryType,
        locationId: input.locationId,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        paymentCondition: input.paymentCondition,
        creditDays: input.creditDays,
        earlyPaymentDiscountPercent: input.earlyPaymentDiscountPercent,
        earlyPaymentDiscountDeadline: input.earlyPaymentDiscountDeadline,
        penaltyRateMonthlyPercent: input.penaltyRateMonthlyPercent,
        penaltyFlatUsd: input.penaltyFlatUsd,
        currency: input.currency,
        bcvRate: input.bcvRate,
        amountOriginal: round2(input.amountOriginal),
        amountUsd: round2(input.amountUsd),
        amountVes: round2(input.amountVes),
        taxIncluded: input.taxIncluded,
        ivaAmountUsd: round2(input.ivaAmountUsd),
        islrRetentionSuggestedUsd: input.islrRetentionSuggestedUsd
          ? round2(input.islrRetentionSuggestedUsd)
          : undefined,
        netPayableUsd: round2(input.netPayableUsd),
        paidAmountUsd: 0,
        status: 'PENDIENTE',
        requiresManagerApproval: approvalEval.requiresManagerApproval,
        approvalStatus: approvalEval.initialApprovalStatus,
        preloadedByUserId: user?.uid || 'usr-analyst-01',
        preloadedByName: user?.displayName || 'Analista Operativo',
        preloadedAtVet: nowIso,
        payments: [],
        attachment: input.attachment,
        driveBackupPath: driveSuggestion.fullRelativePath,
        driveBackupConfirmed: false,
        createdAtVet: nowIso,
      };

      // Si fue aprobado directo y es a crédito, sincronizar con CxP en Finanzas
      if (
        newExpense.approvalStatus === 'APROBADO_DIRECTO' &&
        newExpense.paymentCondition === 'CREDITO'
      ) {
        try {
          const invId = `inv-gto-${newExpense.id}`;
          const purchaseInv: PurchaseInvoice = {
            id: invId,
            invoiceNumber: newExpense.voucherNumber,
            controlNumber: newExpense.controlNumber || 'GTO-CONTROL',
            supplierId: newExpense.supplierId || 'sup-opex-general',
            supplierName: newExpense.beneficiaryName,
            supplierRif: newExpense.beneficiaryRif,
            locationId: newExpense.locationId,
            issueDate: newExpense.issueDate,
            dueDate: newExpense.dueDate || newExpense.issueDate,
            currency: newExpense.currency,
            bcvRateAtIssue: newExpense.bcvRate,
            lines: [
              {
                id: `ln-${newExpense.id}`,
                sku: `OPEX-${newExpense.category}`,
                description: newExpense.description,
                quantity: 1,
                unitCostUsd: newExpense.amountUsd,
                lineTotalUsd: newExpense.amountUsd,
                lineType: 'SERVICIO',
              },
            ],
            subtotalUsd: newExpense.amountUsd,
            ivaAmountUsd: newExpense.ivaAmountUsd,
            igtfAmountUsd: 0,
            totalUsd: newExpense.netPayableUsd,
            paidAmountUsd: 0,
            status: 'PENDIENTE',
            ocrEngineUsed: 'GEMINI_VISION_PRO',
            invoiceType: 'GASTO_OPERATIVO_OPEX',
            expenseId: newExpense.id,
            forensicAudit: {
              passedAllLocks: true,
              lock1LineIntegrations: true,
              lock2SubtotalMatch: true,
              lock3TaxCoherence: true,
              lock4TotalCrossCheck: true,
              discrepancyUsd: 0,
              auditLog: ['Gasto Operativo OPEX aprobado y transferido a Cuentas por Pagar.'],
            },
            createdAtVet: nowIso,
          };
          registerOcrInvoice(purchaseInv);
          newExpense.linkedInvoiceId = invId;
        } catch (err) {
          console.warn('Finance sync on direct expense failed gracefully', err);
        }
      }

      setExpenses((prev) => [newExpense, ...prev]);

      logAuditEvent(
        'EXPENSE_PRELOAD',
        'EXPENSE',
        `Precarga de gasto ${newExpense.expenseCode}: ${newExpense.description} por $${newExpense.amountUsd.toFixed(2)}`,
        {
          expenseCode: newExpense.expenseCode,
          voucherNumber: newExpense.voucherNumber,
          category: newExpense.category,
          amountUsd: newExpense.amountUsd,
          approvalStatus: newExpense.approvalStatus,
          requiresManagerApproval: newExpense.requiresManagerApproval,
        },
        newExpense.id
      );

      let warning: string | undefined = undefined;
      if (currentEval.isContingencyAlarm70) {
        warning = `Atención: El presupuesto de ${periodYearMonth} ha alcanzado el ${currentEval.budgetConsumedPercent.toFixed(1)}% de consumo (umbral de alerta preventiva 70%).`;
      }

      return {
        success: true,
        expense: newExpense,
        warning,
      };
    },
    [budgetPlan, expenses, user, logAuditEvent, registerOcrInvoice]
  );

  // 2. Aprobación Gerencial con PIN (> $100 USD)
  const approveExpense = useCallback(
    (
      expenseId: string,
      managerPin: string,
      managerUser?: { id: string; name: string; role: string }
    ): { success: boolean; error?: string } => {
      if (managerPin !== '203040') {
        return { success: false, error: 'PIN de Aprobación Gerencial inválido.' };
      }

      const target = expenses.find((e) => e.id === expenseId);
      if (!target) {
        return { success: false, error: 'Gasto operativo no encontrado.' };
      }

      if (target.approvalStatus !== 'PENDIENTE_APROBACION') {
        return {
          success: false,
          error: `El gasto ya se encuentra en estado ${target.approvalStatus}.`,
        };
      }

      const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const approverId = managerUser?.id || user?.uid || 'usr-mgr-01';
      const approverName = managerUser?.name || user?.displayName || 'Gerencia General';

      let linkedInvId = target.linkedInvoiceId;

      // Si es a crédito, sincronizar con Cuentas por Pagar
      if (target.paymentCondition === 'CREDITO' && !linkedInvId) {
        try {
          const invId = `inv-gto-${target.id}`;
          const purchaseInv: PurchaseInvoice = {
            id: invId,
            invoiceNumber: target.voucherNumber,
            controlNumber: target.controlNumber || 'GTO-CONTROL',
            supplierId: target.supplierId || 'sup-opex-general',
            supplierName: target.beneficiaryName,
            supplierRif: target.beneficiaryRif,
            locationId: target.locationId,
            issueDate: target.issueDate,
            dueDate: target.dueDate || target.issueDate,
            currency: target.currency,
            bcvRateAtIssue: target.bcvRate,
            lines: [
              {
                id: `ln-${target.id}`,
                sku: `OPEX-${target.category}`,
                description: target.description,
                quantity: 1,
                unitCostUsd: target.amountUsd,
                lineTotalUsd: target.amountUsd,
                lineType: 'SERVICIO',
              },
            ],
            subtotalUsd: target.amountUsd,
            ivaAmountUsd: target.ivaAmountUsd,
            igtfAmountUsd: 0,
            totalUsd: target.netPayableUsd,
            paidAmountUsd: 0,
            status: 'PENDIENTE',
            ocrEngineUsed: 'GEMINI_VISION_PRO',
            invoiceType: 'GASTO_OPERATIVO_OPEX',
            expenseId: target.id,
            forensicAudit: {
              passedAllLocks: true,
              lock1LineIntegrations: true,
              lock2SubtotalMatch: true,
              lock3TaxCoherence: true,
              lock4TotalCrossCheck: true,
              discrepancyUsd: 0,
              auditLog: ['Gasto Operativo OPEX aprobado por Gerencia y sincronizado con CxP.'],
            },
            createdAtVet: nowIso,
          };
          registerOcrInvoice(purchaseInv);
          linkedInvId = invId;
        } catch (err) {
          console.warn('Finance sync failed gracefully on manager approval', err);
        }
      }

      setExpenses((prev) =>
        prev.map((e) =>
          e.id === expenseId
            ? {
                ...e,
                approvalStatus: 'APROBADO_GERENCIA',
                approvedByUserId: approverId,
                approvedByName: approverName,
                approvedAtVet: nowIso,
                approvalPinUsed: '******',
                linkedInvoiceId: linkedInvId,
              }
            : e
        )
      );

      logAuditEvent(
        'EXPENSE_APPROVAL',
        'EXPENSE',
        `Aprobación gerencial de gasto ${target.expenseCode} por $${target.amountUsd.toFixed(2)}`,
        {
          expenseCode: target.expenseCode,
          amountUsd: target.amountUsd,
          approverName,
          approverId,
        },
        target.id
      );

      return { success: true };
    },
    [expenses, user, logAuditEvent, registerOcrInvoice]
  );

  // 3. Rechazo de Gasto con Justificación
  const rejectExpense = useCallback(
    (
      expenseId: string,
      managerPin: string,
      reason: string,
      managerUser?: { id: string; name: string }
    ): { success: boolean; error?: string } => {
      if (managerPin !== '203040') {
        return { success: false, error: 'PIN de Aprobación Gerencial inválido.' };
      }

      if (!reason || reason.trim().length < 5) {
        return { success: false, error: 'Debe ingresar un motivo detallado de rechazo.' };
      }

      const target = expenses.find((e) => e.id === expenseId);
      if (!target) {
        return { success: false, error: 'Gasto operativo no encontrado.' };
      }

      const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const approverName = managerUser?.name || user?.displayName || 'Gerencia General';

      setExpenses((prev) =>
        prev.map((e) =>
          e.id === expenseId
            ? {
                ...e,
                approvalStatus: 'RECHAZADO',
                rejectionReason: reason.trim(),
                approvedByName: approverName,
                approvedAtVet: nowIso,
              }
            : e
        )
      );

      logAuditEvent(
        'EXPENSE_REJECTION',
        'EXPENSE',
        `Rechazo de gasto ${target.expenseCode}: ${reason}`,
        {
          expenseCode: target.expenseCode,
          reason,
          rejectedBy: approverName,
        },
        target.id
      );

      return { success: true };
    },
    [expenses, user, logAuditEvent]
  );

  // 4. Registro de Pago / Abono con Descuento por Pronto Pago o Mora
  const registerExpensePayment = useCallback(
    (
      expenseId: string,
      paymentInput: RegisterExpensePaymentInput
    ): {
      success: boolean;
      error?: string;
      paymentRecord?: ExpensePaymentRecord;
    } => {
      const target = expenses.find((e) => e.id === expenseId);
      if (!target) {
        return { success: false, error: 'Gasto operativo no encontrado.' };
      }

      if (target.approvalStatus === 'RECHAZADO') {
        return {
          success: false,
          error: 'No se pueden registrar pagos a un gasto rechazado por Gerencia.',
        };
      }

      if (target.approvalStatus === 'PENDIENTE_APROBACION') {
        return {
          success: false,
          error: 'Este gasto requiere Aprobación Gerencial previa antes de emitir pagos.',
        };
      }

      const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);

      // Evaluar pronto pago
      let effectivePayableUsd = target.netPayableUsd;
      let discountSavedUsd = 0;
      let penaltyAppliedUsd = 0;

      if (paymentInput.applyEarlyDiscount) {
        const discountEval = calculateEarlyPaymentDiscount(target);
        if (discountEval.isEligible) {
          discountSavedUsd = discountEval.discountAmountUsd;
          effectivePayableUsd = discountEval.discountedPayableUsd;
        }
      } else {
        const penaltyEval = calculateOverduePenalty(target);
        if (penaltyEval.isOverdue) {
          penaltyAppliedUsd = penaltyEval.penaltyAmountUsd;
          effectivePayableUsd = penaltyEval.totalWithPenaltyUsd;
        }
      }

      const currentPaid = toDecimal(target.paidAmountUsd);
      const remainingBeforePayment = toDecimal(effectivePayableUsd).minus(currentPaid);

      if (toDecimal(paymentInput.amountUsd).greaterThan(remainingBeforePayment)) {
        return {
          success: false,
          error: `El monto del pago ($${paymentInput.amountUsd.toFixed(2)}) supera el saldo pendiente ($${remainingBeforePayment.toFixed(2)}).`,
        };
      }

      const newPaidDec = currentPaid.plus(paymentInput.amountUsd);
      const amountVes = round2(toDecimal(paymentInput.amountUsd).times(target.bcvRate));

      const newPayment: ExpensePaymentRecord = {
        id: `pay-${Date.now()}`,
        expenseId: target.id,
        amountUsd: round2(paymentInput.amountUsd),
        amountVes,
        bcvRate: target.bcvRate,
        method: paymentInput.method,
        reference: paymentInput.reference,
        paidAtVet: nowIso,
        registeredBy: paymentInput.registeredBy,
        isEarlyDiscountApplied: paymentInput.applyEarlyDiscount && discountSavedUsd > 0,
        discountSavedUsd: discountSavedUsd > 0 ? discountSavedUsd : undefined,
        penaltyAppliedUsd: penaltyAppliedUsd > 0 ? penaltyAppliedUsd : undefined,
      };

      const isFullyPaid = newPaidDec.greaterThanOrEqualTo(effectivePayableUsd);
      const newStatus = isFullyPaid ? 'PAGADO' : 'ABONADO';

      setExpenses((prev) =>
        prev.map((e) =>
          e.id === expenseId
            ? {
                ...e,
                paidAmountUsd: round2(newPaidDec),
                status: newStatus,
                payments: [...e.payments, newPayment],
              }
            : e
        )
      );

      // Sincronizar pago con Cuentas por Pagar si estaba vinculado
      if (target.linkedInvoiceId) {
        try {
          registerInvoicePayment(
            target.linkedInvoiceId,
            paymentInput.amountUsd,
            paymentInput.method,
            paymentInput.reference,
            paymentInput.registeredBy
          );
        } catch (err) {
          console.warn('Finance sync payment error handled gracefully', err);
        }
      }

      logAuditEvent(
        'EXPENSE_PAYMENT',
        'EXPENSE',
        `Pago de gasto ${target.expenseCode} por $${paymentInput.amountUsd.toFixed(2)} (${paymentInput.method})`,
        {
          expenseCode: target.expenseCode,
          amountUsd: paymentInput.amountUsd,
          method: paymentInput.method,
          reference: paymentInput.reference,
          status: newStatus,
          discountSavedUsd,
          penaltyAppliedUsd,
        },
        target.id
      );

      return {
        success: true,
        paymentRecord: newPayment,
      };
    },
    [expenses, logAuditEvent, registerInvoicePayment]
  );

  // 5. Actualización de Presupuesto Mensual
  const updateBudgetPlan = useCallback(
    (
      newPlan: Partial<MonthlyBudgetPlan>,
      managerPin: string
    ): { success: boolean; error?: string } => {
      if (managerPin !== '203040') {
        return { success: false, error: 'PIN Gerencial inválido para modificar presupuestos.' };
      }

      const nowIso = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const updated: MonthlyBudgetPlan = {
        ...budgetPlan,
        ...newPlan,
        authorizedBy: user?.displayName || 'Gerencia General',
        authorizedAtVet: nowIso,
      };

      setBudgetPlan(updated);

      logAuditEvent(
        'CONFIG_CHANGE',
        'BUDGET',
        `Actualización de presupuesto ${updated.periodYearMonth} a $${updated.globalBudgetLimitUsd.toFixed(2)}`,
        {
          action: 'UPDATE_EXPENSES_BUDGET',
          globalLimitUsd: updated.globalBudgetLimitUsd,
          alarmThreshold: updated.contingencyAlarmThresholdPercent,
        },
        updated.id
      );

      return { success: true };
    },
    [budgetPlan, user, logAuditEvent]
  );

  // 6. Confirmación de Respaldo en Google Drive
  const markDriveBackupConfirmed = useCallback(
    (expenseId: string, driveUrl?: string) => {
      setExpenses((prev) =>
        prev.map((e) =>
          e.id === expenseId
            ? {
                ...e,
                driveBackupConfirmed: true,
                driveBackupUrl: driveUrl || e.driveBackupUrl,
              }
            : e
        )
      );

      logAuditEvent(
        'EXPENSE_DRIVE_BACKUP',
        'EXPENSE',
        `Respaldo en Google Drive confirmado para gasto ${expenseId}`,
        { expenseId, driveUrl },
        expenseId
      );
    },
    [logAuditEvent]
  );

  // 7. Generación de Arqueo Mensual
  const generateArqueoReport = useCallback(
    (periodYearMonth: string, generatedBy?: string): ExpenseMonthlyArqueoReport => {
      const author = generatedBy || user?.displayName || 'Administrador Financiero';
      const report = generateMonthlyExpenseArqueoData(expenses, budgetPlan, periodYearMonth, author);

      setMonthlyArqueoReports((prev) => {
        const filtered = prev.filter((r) => r.periodYearMonth !== periodYearMonth);
        return [report, ...filtered];
      });

      logAuditEvent(
        'EXPENSE_MONTHLY_CLOSE',
        'ARQUEO',
        `Arqueo mensual ${periodYearMonth} generado por ${author}`,
        {
          periodYearMonth,
          totalBudgetUsd: report.totalBudgetUsd,
          totalExecutedUsd: report.totalExecutedUsd,
          variancePercent: report.variancePercent,
          status: report.status,
        },
        report.id
      );

      return report;
    },
    [expenses, budgetPlan, user, logAuditEvent]
  );

  return (
    <ExpenseContext.Provider
      value={{
        expenses,
        budgetPlan,
        budgetStatus,
        selectedPeriod,
        setSelectedPeriod,
        preloadExpense,
        approveExpense,
        rejectExpense,
        registerExpensePayment,
        updateBudgetPlan,
        markDriveBackupConfirmed,
        monthlyArqueoReports,
        generateArqueoReport,
      }}
    >
      {children}
    </ExpenseContext.Provider>
  );
};

export const useExpenses = (): ExpenseContextType => {
  const context = useContext(ExpenseContext);
  if (!context) {
    throw new Error('useExpenses must be used within an ExpenseProvider');
  }
  return context;
};

export default ExpenseProvider;
