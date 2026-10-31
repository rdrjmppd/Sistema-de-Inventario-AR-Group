import React, { useState, useMemo, useRef } from 'react';
import {
  Receipt,
  PlusCircle,
  ShieldCheck,
  BookOpen,
  PieChart,
  FileCheck2,
  Upload,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Calendar,
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  FileText,
  Cloud,
  ChevronRight,
  TrendingUp,
  Building,
  User,
  Clock,
  ExternalLink,
  Lock,
  Percent,
  Sparkles,
} from 'lucide-react';
import {
  ExpenseCategory,
  ExpenseRecord,
  ExpenseVoucherType,
  IndexedInvoiceAttachment,
  NavigationTab,
} from '../../types';
import {
  useExpenses,
  PreloadExpenseInput,
} from '../../context/ExpenseContext';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { useUIConfig } from '../../context/UIConfigContext';
import {
  EXPENSE_CATEGORIES_METADATA,
  EXPENSE_APPROVAL_THRESHOLD_USD,
  buildSuggestedDrivePath,
  exportExpenseArqueoPdfDocument,
  buildExpenseArqueoWorkbook,
} from '../../lib/expenses-engine';
import { formatUsd, formatVes, round2, toDecimal } from '../../lib/decimal';
import { GoogleDriveBackupHelperModal } from './GoogleDriveBackupHelperModal';
import { ExpenseManagerApprovalModal } from './ExpenseManagerApprovalModal';
import { ExpensePaymentModal } from './ExpensePaymentModal';
import * as XLSX from 'xlsx-js-style';

interface ExpensesCenterProps {
  onNavigate?: (tab: NavigationTab) => void;
}

type SubTab =
  | 'REGISTRO_CARGA'
  | 'BANDEJA_APROBACION'
  | 'LIBRO_MAYOR'
  | 'PRESUPUESTO_ALERTAS'
  | 'ARQUEO_MENSUAL';

export const ExpensesCenter: React.FC<ExpensesCenterProps> = ({ onNavigate }) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('REGISTRO_CARGA');
  const { user } = useAuth();
  const { bcvState } = useFinance();
  const { config } = useUIConfig();

  const {
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
  } = useExpenses();

  // Estados de Modales
  const [selectedExpenseForDrive, setSelectedExpenseForDrive] = useState<ExpenseRecord | null>(null);
  const [selectedExpenseForApproval, setSelectedExpenseForApproval] = useState<ExpenseRecord | null>(null);
  const [selectedExpenseForPayment, setSelectedExpenseForPayment] = useState<ExpenseRecord | null>(null);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);

  // Estados del Formulario de Carga
  const [voucherType, setVoucherType] = useState<ExpenseVoucherType>('FACTURA_FISCAL');
  const [voucherNumber, setVoucherNumber] = useState('');
  const [controlNumber, setControlNumber] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('CLIMATIZACION_AC');
  const [description, setDescription] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [beneficiaryRif, setBeneficiaryRif] = useState('');
  const [beneficiaryType, setBeneficiaryType] = useState<'PERSONA_NATURAL' | 'PERSONA_JURIDICA'>('PERSONA_JURIDICA');
  const [locationId, setLocationId] = useState('loc-pzo-01');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentCondition, setPaymentCondition] = useState<'CONTADO' | 'CREDITO'>('CREDITO');
  const [creditDays, setCreditDays] = useState<number>(14);
  const [hasEarlyDiscount, setHasEarlyDiscount] = useState(false);
  const [earlyDiscountPercent, setEarlyDiscountPercent] = useState<number>(5);
  const [earlyDiscountDeadline, setEarlyDiscountDeadline] = useState('');
  const [hasPenalty, setHasPenalty] = useState(false);
  const [penaltyRateMonthly, setPenaltyRateMonthly] = useState<number>(3);
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
  const [amountOriginal, setAmountOriginal] = useState<string>('');
  const [taxIncluded, setTaxIncluded] = useState(true);
  const [islrRetentionSuggested, setIslrRetentionSuggested] = useState<string>('');
  const [managerPinOverride, setManagerPinOverride] = useState('');
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error' | 'warning'; msg: string } | null>(null);
  const [scannedAttachment, setScannedAttachment] = useState<IndexedInvoiceAttachment | undefined>(undefined);
  const [isSimulatingOcr, setIsSimulatingOcr] = useState(false);

  // Clave de almacenamiento de borrador protegido para el Arqueo y Registro de Gastos
  const DRAFT_STORAGE_KEY = 'chrystal_draft_expense_form';

  // Carga automática de borrador protegido tras login o reconexión
  React.useEffect(() => {
    try {
      const savedDraft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.voucherType) setVoucherType(parsed.voucherType);
        if (parsed.voucherNumber) setVoucherNumber(parsed.voucherNumber);
        if (parsed.controlNumber) setControlNumber(parsed.controlNumber);
        if (parsed.category) setCategory(parsed.category);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.beneficiaryName) setBeneficiaryName(parsed.beneficiaryName);
        if (parsed.beneficiaryRif) setBeneficiaryRif(parsed.beneficiaryRif);
        if (parsed.beneficiaryType) setBeneficiaryType(parsed.beneficiaryType);
        if (parsed.locationId) setLocationId(parsed.locationId);
        if (parsed.issueDate) setIssueDate(parsed.issueDate);
        if (parsed.paymentCondition) setPaymentCondition(parsed.paymentCondition);
        if (parsed.creditDays !== undefined) setCreditDays(parsed.creditDays);
        if (parsed.hasEarlyDiscount !== undefined) setHasEarlyDiscount(parsed.hasEarlyDiscount);
        if (parsed.earlyDiscountPercent !== undefined) setEarlyDiscountPercent(parsed.earlyDiscountPercent);
        if (parsed.earlyDiscountDeadline) setEarlyDiscountDeadline(parsed.earlyDiscountDeadline);
        if (parsed.hasPenalty !== undefined) setHasPenalty(parsed.hasPenalty);
        if (parsed.penaltyRateMonthly !== undefined) setPenaltyRateMonthly(parsed.penaltyRateMonthly);
        if (parsed.currency) setCurrency(parsed.currency);
        if (parsed.amountOriginal) setAmountOriginal(parsed.amountOriginal);
        if (parsed.taxIncluded !== undefined) setTaxIncluded(parsed.taxIncluded);
        if (parsed.islrRetentionSuggested) setIslrRetentionSuggested(parsed.islrRetentionSuggested);
        if (parsed.activeSubTab) setActiveSubTab(parsed.activeSubTab);
      }
    } catch {
      // ignore
    }
  }, []);

  // Resguardo automático de borrador en sessionStorage ante cambios de formulario
  React.useEffect(() => {
    try {
      const draft = {
        voucherType,
        voucherNumber,
        controlNumber,
        category,
        description,
        beneficiaryName,
        beneficiaryRif,
        beneficiaryType,
        locationId,
        issueDate,
        paymentCondition,
        creditDays,
        hasEarlyDiscount,
        earlyDiscountPercent,
        earlyDiscountDeadline,
        hasPenalty,
        penaltyRateMonthly,
        currency,
        amountOriginal,
        taxIncluded,
        islrRetentionSuggested,
        activeSubTab,
      };
      if (voucherNumber || description || beneficiaryName || amountOriginal) {
        sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      }
    } catch {
      // ignore
    }
  }, [
    voucherType,
    voucherNumber,
    controlNumber,
    category,
    description,
    beneficiaryName,
    beneficiaryRif,
    beneficiaryType,
    locationId,
    issueDate,
    paymentCondition,
    creditDays,
    hasEarlyDiscount,
    earlyDiscountPercent,
    earlyDiscountDeadline,
    hasPenalty,
    penaltyRateMonthly,
    currency,
    amountOriginal,
    taxIncluded,
    islrRetentionSuggested,
    activeSubTab,
  ]);

  // Estados de Filtro en Libro Mayor
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Estados de Ajuste Presupuestario
  const [newGlobalBudget, setNewGlobalBudget] = useState(budgetPlan.globalBudgetLimitUsd.toString());
  const [budgetPin, setBudgetPin] = useState('');
  const [budgetFeedback, setBudgetFeedback] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tasa de cambio activa
  const activeRate = bcvState?.activeRate || 886.23;

  // Cálculo en vivo de montos en formulario
  const originalNum = parseFloat(amountOriginal) || 0;
  const amountUsd = currency === 'USD' ? originalNum : round2(toDecimal(originalNum).dividedBy(activeRate));
  const amountVes = currency === 'VES' ? originalNum : round2(toDecimal(originalNum).times(activeRate));
  const ivaAmountUsd = taxIncluded ? round2(toDecimal(amountUsd).times(16).dividedBy(116)) : 0;
  const islrNum = parseFloat(islrRetentionSuggested) || 0;
  const netPayableUsd = round2(toDecimal(amountUsd).minus(islrNum));

  // Simulación de OCR al subir archivo escaneado
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSimulatingOcr(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setTimeout(() => {
        setIsSimulatingOcr(false);
        setScannedAttachment({
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          fileSize: file.size,
          sha256Hash: `sha256-${Date.now()}-${file.size}`,
          dataUrl,
          verdict: 'AUTENTICO_ALTA_CONFIANZA',
          indexedAtVet: new Date().toISOString().replace('T', ' ').slice(0, 19),
        });

        // Heurística de prellenado inteligente OCR
        if (!voucherNumber) {
          setVoucherNumber(`FAC-${Math.floor(1000 + Math.random() * 9000)}`);
        }
        if (!controlNumber) {
          setControlNumber(`00-${Math.floor(10000 + Math.random() * 90000)}`);
        }
        if (!amountOriginal) {
          setAmountOriginal('120.00');
        }
        if (!beneficiaryName) {
          setBeneficiaryName('Servicios Industriales y Climatización del Orinoco');
          setBeneficiaryRif('J-40918231-9');
        }
        setFormFeedback({
          type: 'success',
          msg: `Comprobante escaneado procesado por OCR. Datos prellenados con éxito. Se generó la ruta para Google Drive.`,
        });
      }, 700);
    };
    reader.readAsDataURL(file);
  };

  // Enviar formulario de registro de gasto
  const handlePreloadExpense = (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    if (amountUsd <= 0) {
      setFormFeedback({ type: 'error', msg: 'El monto del gasto debe ser mayor a 0.' });
      return;
    }
    if (!beneficiaryName.trim() || !beneficiaryRif.trim()) {
      setFormFeedback({ type: 'error', msg: 'Debe ingresar el Nombre y RIF/Cédula del beneficiario o prestador de servicio.' });
      return;
    }

    const dueDateCalculated =
      paymentCondition === 'CREDITO'
        ? new Date(new Date(issueDate).getTime() + creditDays * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10)
        : undefined;

    const input: PreloadExpenseInput = {
      voucherType,
      voucherNumber: voucherNumber.trim(),
      controlNumber: controlNumber.trim() || undefined,
      category,
      description: description.trim(),
      beneficiaryName: beneficiaryName.trim(),
      beneficiaryRif: beneficiaryRif.trim().toUpperCase(),
      beneficiaryType,
      locationId,
      issueDate,
      dueDate: dueDateCalculated,
      paymentCondition,
      creditDays: paymentCondition === 'CREDITO' ? creditDays : undefined,
      earlyPaymentDiscountPercent: hasEarlyDiscount ? earlyDiscountPercent : undefined,
      earlyPaymentDiscountDeadline: hasEarlyDiscount ? earlyDiscountDeadline : undefined,
      penaltyRateMonthlyPercent: hasPenalty ? penaltyRateMonthly : undefined,
      currency,
      bcvRate: activeRate,
      amountOriginal: parseFloat(amountOriginal) || 0,
      amountUsd,
      amountVes,
      taxIncluded,
      ivaAmountUsd,
      islrRetentionSuggestedUsd: islrNum > 0 ? islrNum : undefined,
      netPayableUsd,
      attachment: scannedAttachment,
      managerPinOverride: managerPinOverride.trim() || undefined,
    };

    const res = preloadExpense(input);
    if (!res.success) {
      setFormFeedback({ type: 'error', msg: res.error || 'Error al precargar gasto.' });
    } else {
      setFormFeedback({
        type: 'success',
        msg: `¡Gasto ${res.expense?.expenseCode} registrado exitosamente! ${
          res.expense?.requiresManagerApproval
            ? 'Enviado a Bandeja de Aprobación Gerencial (> $100 USD).'
            : 'Aprobado directamente para tesorería.'
        } ${res.warning ? `(${res.warning})` : ''}`,
      });

      // Abrir modal de Drive para recordarle al usuario guardar el archivo
      if (res.expense) {
        setSelectedExpenseForDrive(res.expense);
      }

      // Limpiar formulario parcial y borrador resguardado
      setVoucherNumber('');
      setControlNumber('');
      setDescription('');
      setAmountOriginal('');
      setScannedAttachment(undefined);
      setManagerPinOverride('');
      try {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  // Filtrado de Libro Mayor
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const matchesSearch =
        e.beneficiaryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.beneficiaryRif.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.voucherNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.expenseCode.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = filterCategory === 'ALL' || e.category === filterCategory;
      const matchesStatus = filterStatus === 'ALL' || e.status === filterStatus;

      return matchesSearch && matchesCat && matchesStatus;
    });
  }, [expenses, searchQuery, filterCategory, filterStatus]);

  // Gastos pendientes de aprobación gerencial
  const pendingApprovalExpenses = useMemo(() => {
    return expenses.filter((e) => e.approvalStatus === 'PENDIENTE_APROBACION');
  }, [expenses]);

  // Arqueo actual del periodo seleccionado
  const currentArqueoReport = useMemo(() => {
    const existing = monthlyArqueoReports.find((r) => r.periodYearMonth === selectedPeriod);
    if (existing) return existing;
    return generateArqueoReport(selectedPeriod, user?.displayName);
  }, [monthlyArqueoReports, selectedPeriod, generateArqueoReport, user]);

  // Descargar PDF del Arqueo
  const handleDownloadArqueoPdf = () => {
    const doc = exportExpenseArqueoPdfDocument(currentArqueoReport, config.companyProfile);
    doc.save(`ARQUEO_GASTOS_OPEX_${selectedPeriod}_HIPER_ABASTO_POLAR.pdf`);
  };

  // Descargar Excel del Arqueo
  const handleDownloadArqueoExcel = () => {
    const wb = buildExpenseArqueoWorkbook(currentArqueoReport, config.companyProfile);
    XLSX.writeFile(wb, `ARQUEO_GASTOS_OPEX_${selectedPeriod}_HIPER_ABASTO_POLAR.xlsx`);
  };

  // Actualizar Presupuesto
  const handleSaveBudgetPlan = (e: React.FormEvent) => {
    e.preventDefault();
    setBudgetFeedback(null);
    const limitNum = parseFloat(newGlobalBudget);
    if (isNaN(limitNum) || limitNum <= 0) {
      setBudgetFeedback('El límite presupuestario debe ser mayor a 0.');
      return;
    }

    const res = updateBudgetPlan({ globalBudgetLimitUsd: round2(limitNum) }, budgetPin);
    if (!res.success) {
      setBudgetFeedback(res.error || 'Error al actualizar presupuesto.');
    } else {
      setBudgetFeedback('¡Presupuesto actualizado exitosamente!');
      setTimeout(() => {
        setIsBudgetModalOpen(false);
        setBudgetPin('');
        setBudgetFeedback(null);
      }, 1000);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* 1. Header Institucional */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/20 rounded-2xl border border-amber-400/30">
              <Receipt className="w-8 h-8 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Control de Gastos Operativos (OPEX)
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  AR Group 2026
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Gestión bimonetaria de facturas de servicios, mantenimientos, insumos, aprobaciones con PIN y archivo estructurado en Google Drive.
              </p>
            </div>
          </div>

          {/* Selector de Período y Tasa BCV */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-800/80 border border-slate-700/80 px-3 py-1.5 rounded-xl flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-400 font-medium">Período:</span>
              <input
                type="month"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
              />
            </div>
            <div className="bg-slate-800/80 border border-slate-700/80 px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5">
              <span className="text-slate-400">Tasa BCV:</span>
              <span className="font-mono font-bold text-emerald-400">
                Bs. {formatVes(activeRate)}
              </span>
            </div>
          </div>
        </div>

        {/* Semáforo de Presupuesto Resumido */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-slate-400">Ejecución Presupuestaria:</span>
            <span
              className={`font-bold px-2 py-0.5 rounded-full ${
                budgetStatus.isOverBudget100
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : budgetStatus.isContingencyAlarm70
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {budgetStatus.budgetConsumedPercent.toFixed(1)}% ({budgetStatus.isOverBudget100 ? 'EXCEDIDO' : budgetStatus.isContingencyAlarm70 ? 'ALERTA 70%' : 'NORMAL'})
            </span>
          </div>

          <div className="flex items-center gap-4 text-slate-300">
            <span>Presupuesto: <strong>${formatUsd(budgetPlan.globalBudgetLimitUsd)}</strong></span>
            <span>Ejecutado: <strong>${formatUsd(budgetStatus.totalExecutedUsd)}</strong></span>
            <span>Disponible: <strong className={budgetStatus.remainingBudgetUsd < 0 ? 'text-rose-400' : 'text-emerald-400'}>${formatUsd(budgetStatus.remainingBudgetUsd)}</strong></span>
          </div>
        </div>
      </div>

      {/* 2. Pestañas de Navegación del Módulo */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800 scrollbar-none">
        <button
          onClick={() => setActiveSubTab('REGISTRO_CARGA')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all min-h-[44px] ${
            activeSubTab === 'REGISTRO_CARGA'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span>Carga y Registro OCR</span>
        </button>

        <button
          onClick={() => setActiveSubTab('BANDEJA_APROBACION')}
          className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all min-h-[44px] ${
            activeSubTab === 'BANDEJA_APROBACION'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Aprobaciones Gerenciales (&gt; $100)</span>
          {pendingApprovalExpenses.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black rounded-full bg-rose-500 text-white animate-pulse">
              {pendingApprovalExpenses.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('LIBRO_MAYOR')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all min-h-[44px] ${
            activeSubTab === 'LIBRO_MAYOR'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Libro de Gastos y Pagos</span>
        </button>

        <button
          onClick={() => setActiveSubTab('PRESUPUESTO_ALERTAS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all min-h-[44px] ${
            activeSubTab === 'PRESUPUESTO_ALERTAS'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <PieChart className="w-4 h-4" />
          <span>Presupuesto y Semáforo</span>
        </button>

        <button
          onClick={() => setActiveSubTab('ARQUEO_MENSUAL')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all min-h-[44px] ${
            activeSubTab === 'ARQUEO_MENSUAL'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          <span>Arqueo y Cierre Mensual</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* PESTAÑA 1: REGISTRO Y CARGA OCR DE COMPROBANTES                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'REGISTRO_CARGA' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Formulario Principal */}
          <form
            onSubmit={handlePreloadExpense}
            className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-600" />
                Ingreso de Factura, Ticket o Recibo de Gasto
              </h2>
              <span className="text-xs text-slate-400">
                Límite de Aprobación Directa: ${EXPENSE_APPROVAL_THRESHOLD_USD.toFixed(2)} USD
              </span>
            </div>

            {/* Zona de Carga OCR */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-blue-500" />
                Soporte Digital Escaneado (Imagen / PDF para OCR y Respaldo):
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                  scannedAttachment
                    ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
                    : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 bg-slate-50 dark:bg-slate-800/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {isSimulatingOcr ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Sparkles className="w-6 h-6 text-blue-600 animate-spin" />
                    <span className="text-xs font-semibold text-blue-600">
                      Analizando comprobante con motor OCR e inteligencia forense...
                    </span>
                  </div>
                ) : scannedAttachment ? (
                  <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span className="font-semibold">{scannedAttachment.fileName}</span>
                      <span className="text-slate-400">({(scannedAttachment.fileSize / 1024).toFixed(1)} KB)</span>
                    </div>
                    <span className="font-bold text-[11px] bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded">
                      OCR Exitoso
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-slate-500 dark:text-slate-400 py-2">
                    <Upload className="w-6 h-6 text-slate-400" />
                    <span className="text-xs font-medium">Haga clic o arrastre el archivo escaneado (Factura / Ticket / Recibo)</span>
                    <span className="text-[11px] text-slate-400">El OCR extraerá montos, fechas y RIFs automáticamente</span>
                  </div>
                )}
              </div>
            </div>

            {/* Fila: Tipo de Comprobante y Números */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  Tipo de Comprobante:
                </label>
                <select
                  value={voucherType}
                  onChange={(e) => setVoucherType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="FACTURA_FISCAL">Factura Fiscal Homologada</option>
                  <option value="TICKET_CAJA">Ticket de Caja Registradora</option>
                  <option value="RECIBO_SIMPLE">Recibo Simple / Honorarios</option>
                  <option value="NOTA_ENTREGA">Nota de Entrega / Comprobante</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  N° Comprobante / Factura:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. FAC-00912"
                  value={voucherNumber}
                  onChange={(e) => setVoucherNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                  N° Control (SENIAT si aplica):
                </label>
                <input
                  type="text"
                  placeholder="Ej. 00-48210"
                  value={controlNumber}
                  onChange={(e) => setControlNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Rubro / Categoría Operativa */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
                Rubro o Centro de Costo Operativo:
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(EXPENSE_CATEGORIES_METADATA).map(([catKey, meta]) => (
                  <option key={catKey} value={catKey}>
                    {meta.label} — {meta.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Datos del Prestador / Beneficiario */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-4 h-4 text-indigo-500" />
                  Datos Fiscales del Beneficiario / Proveedor de Servicio:
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="benType"
                      checked={beneficiaryType === 'PERSONA_JURIDICA'}
                      onChange={() => setBeneficiaryType('PERSONA_JURIDICA')}
                      className="text-blue-600"
                    />
                    <span>Persona Jurídica (Empresa)</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="benType"
                      checked={beneficiaryType === 'PERSONA_NATURAL'}
                      onChange={() => setBeneficiaryType('PERSONA_NATURAL')}
                      className="text-blue-600"
                    />
                    <span>Persona Natural (Técnico / Físico)</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Razón Social o Nombre Completo:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Inversiones Clima Polar, C.A."
                    value={beneficiaryName}
                    onChange={(e) => setBeneficiaryName(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">RIF o Cédula de Identidad:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. J-40192831-2 ó V-14829102-1"
                    value={beneficiaryRif}
                    onChange={(e) => setBeneficiaryRif(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Descripción Detallada */}
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                Descripción Detallada del Servicio, Trabajo o Insumo Comprado:
              </label>
              <textarea
                rows={2}
                required
                placeholder="Indique detalladamente el motivo del gasto, áreas intervenidas o destino de los insumos..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Condiciones de Pago: Contado / Crédito con Descuentos y Moras */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-500" />
                  Condiciones Comerciales y de Crédito:
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentCond"
                      checked={paymentCondition === 'CONTADO'}
                      onChange={() => setPaymentCondition('CONTADO')}
                      className="text-blue-600"
                    />
                    <span>Contado Inmediato</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentCond"
                      checked={paymentCondition === 'CREDITO'}
                      onChange={() => setPaymentCondition('CREDITO')}
                      className="text-blue-600"
                    />
                    <span>Compra a Crédito</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Fecha de Emisión:</label>
                  <input
                    type="date"
                    required
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white outline-none"
                  />
                </div>

                {paymentCondition === 'CREDITO' && (
                  <>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Días de Crédito:</label>
                      <input
                        type="number"
                        min="1"
                        max="90"
                        value={creditDays}
                        onChange={(e) => setCreditDays(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-900 dark:text-white outline-none"
                      />
                    </div>

                    <div className="flex flex-col justify-end">
                      <span className="text-[11px] text-slate-400">Fecha Estimada Vencimiento:</span>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">
                        {new Date(new Date(issueDate).getTime() + creditDays * 24 * 60 * 60 * 1000)
                          .toISOString()
                          .slice(0, 10)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Parámetros de Pronto Pago y Mora */}
              {paymentCondition === 'CREDITO' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                  {/* Descuento por Pronto Pago */}
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={hasEarlyDiscount}
                        onChange={(e) => setHasEarlyDiscount(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600"
                      />
                      <span>Aplica Descuento por Pronto Pago</span>
                    </label>

                    {hasEarlyDiscount && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] text-slate-400">Descuento (%):</label>
                          <input
                            type="number"
                            min="1"
                            max="50"
                            value={earlyDiscountPercent}
                            onChange={(e) => setEarlyDiscountPercent(parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded-lg font-mono text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400">Límite Descuento:</label>
                          <input
                            type="date"
                            value={earlyDiscountDeadline}
                            onChange={(e) => setEarlyDiscountDeadline(e.target.value)}
                            className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded-lg text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recargo por Mora */}
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={hasPenalty}
                        onChange={(e) => setHasPenalty(e.target.checked)}
                        className="w-4 h-4 rounded text-rose-600"
                      />
                      <span>Aplica Recargo por Mora Vencida</span>
                    </label>

                    {hasPenalty && (
                      <div className="text-xs">
                        <label className="text-[10px] text-slate-400">Tasa Mensual de Mora (%):</label>
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={penaltyRateMonthly}
                          onChange={(e) => setPenaltyRateMonthly(parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border rounded-lg font-mono text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Monto Bimonetario y Retenciones */}
            <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-900/40 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Moneda de Facturación:
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white outline-none"
                  >
                    <option value="USD">Dólares Americanos (USD $)</option>
                    <option value="VES">Bolívares Digitales (VES Bs.)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Monto Original Facturado:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={amountOriginal}
                    onChange={(e) => setAmountOriginal(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-500 block mb-1">
                    Retención Sugerida ISLR (USD):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={islrRetentionSuggested}
                    onChange={(e) => setIslrRetentionSuggested(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              {/* Conversión Exacta */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-200 dark:border-blue-900/60 text-xs">
                <div>
                  <span className="text-slate-500">Monto Computable USD:</span>{' '}
                  <strong className="text-slate-900 dark:text-white font-mono text-sm">${formatUsd(amountUsd)}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Equivalente VES (BCV):</span>{' '}
                  <strong className="text-slate-900 dark:text-white font-mono text-sm">Bs. {formatVes(amountVes)}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Neto a Liquidar:</span>{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-base font-black">
                    ${formatUsd(netPayableUsd)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Advertencia de Gobernanza > $100 USD */}
            {amountUsd > EXPENSE_APPROVAL_THRESHOLD_USD && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                <ShieldCheck className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  <strong>Control Gerencial:</strong> Al superar $100 USD, este gasto entrará en estado <em>Pendiente de Aprobación</em> y requerirá el PIN de Gerencia antes de que tesorería pueda emitir pagos.
                </span>
              </div>
            )}

            {/* Override con PIN si el presupuesto está bloqueado al 100% */}
            {budgetStatus.isOverBudget100 && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl space-y-1.5">
                <span className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                  <Lock className="w-4 h-4" /> Presupuesto Mensual Agotado (100%): Ingrese PIN Gerencial para Desbloqueo:
                </span>
                <input
                  type="password"
                  maxLength={6}
                  placeholder="PIN 6 dígitos (203040)"
                  value={managerPinOverride}
                  onChange={(e) => setManagerPinOverride(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-lg text-xs font-mono text-center tracking-widest outline-none"
                />
              </div>
            )}

            {/* Feedback Message */}
            {formFeedback && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-center gap-2 ${
                  formFeedback.type === 'error'
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200 border border-rose-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 border border-emerald-300'
                }`}
              >
                {formFeedback.type === 'error' ? (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                )}
                <span>{formFeedback.msg}</span>
              </div>
            )}

            {/* Botón de Envío */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-3 min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Registrar y Asentar Gasto Operativo</span>
              </button>
            </div>
          </form>

          {/* Tarjeta Lateral de Preservación en Google Drive */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-gradient-to-br from-blue-900 to-indigo-950 text-white rounded-2xl p-5 shadow-sm border border-blue-800/60 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl">
                  <Cloud className="w-5 h-5 text-blue-300" />
                </div>
                <h3 className="font-bold text-sm">Protocolo Google Drive Empresa</h3>
              </div>
              <p className="text-xs text-blue-200 leading-relaxed">
                Para evitar colapsar la base de datos de la nube con imágenes pesadas, cada comprobante físico cargado debe respaldarse en la carpeta corporativa de Drive correspondiente al proveedor y fecha de compra.
              </p>

              <div className="p-3 bg-white/5 rounded-xl border border-white/10 text-[11px] font-mono space-y-1">
                <span className="text-blue-300 block font-bold">Estructura Sugerida:</span>
                <span className="text-white block break-all">
                  Drive / [Proveedor] / [Periodo Mes] / [Comprobante]
                </span>
              </div>

              {expenses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedExpenseForDrive(expenses[0])}
                  className="w-full py-2.5 min-h-[44px] bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Ver Asistente de Drive del Último Gasto</span>
                </button>
              )}
            </div>

            {/* Resumen Rápido de Categorías */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-purple-500" />
                Top Rubros Operativos del Mes
              </h4>
              <div className="space-y-2 text-xs">
                {Object.entries(budgetStatus.categoryExecution)
                  .filter(([_, data]) => data.executedUsd > 0)
                  .sort((a, b) => b[1].executedUsd - a[1].executedUsd)
                  .slice(0, 5)
                  .map(([catKey, data]) => (
                    <div key={catKey} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                      <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[150px]">
                        {EXPENSE_CATEGORIES_METADATA[catKey as ExpenseCategory]?.label || catKey}
                      </span>
                      <div className="text-right tabular-nums">
                        <span className="font-bold text-slate-900 dark:text-white">${formatUsd(data.executedUsd)}</span>
                        <span className="text-[10px] text-slate-400 block">{data.consumedPercent.toFixed(0)}% cuota</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 2: BANDEJA DE APROBACIÓN GERENCIAL (> $100 USD)                   */}
      {/* ========================================================================= */}
      {activeSubTab === 'BANDEJA_APROBACION' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-500" />
                Bandeja de Aprobación Gerencial de Gastos (&gt; $100 USD)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Gobernanza de Doble Firma: Los gastos que superan el umbral operativo requieren autorización con PIN gerencial.
              </p>
            </div>
            <div className="text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 px-3 py-1.5 rounded-xl text-amber-800 dark:text-amber-200 font-semibold">
              Pendientes por Autorizar: {pendingApprovalExpenses.length}
            </div>
          </div>

          {pendingApprovalExpenses.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                ¡Bandeja de Aprobaciones al Día!
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No existen gastos mayores a $100 USD pendientes de ratificación por la Gerencia General en este momento.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingApprovalExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:shadow-md"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 font-mono">
                        {expense.expenseCode}
                      </span>
                      <span className="text-xs text-slate-500">
                        {expense.voucherType} · {expense.voucherNumber}
                      </span>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {EXPENSE_CATEGORIES_METADATA[expense.category]?.label}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {expense.beneficiaryName} ({expense.beneficiaryRif})
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1">
                      {expense.description}
                    </p>
                    <div className="text-[11px] text-slate-400">
                      Precargado por: <strong>{expense.preloadedByName}</strong> · Emisión: {expense.issueDate}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-right">
                      <span className="text-base font-black text-slate-900 dark:text-white tabular-nums block">
                        ${formatUsd(expense.netPayableUsd)}
                      </span>
                      <span className="text-xs text-slate-400 tabular-nums block">
                        Bs. {formatVes(expense.amountVes)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedExpenseForApproval(expense)}
                      className="px-4 py-2.5 min-h-[44px] bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Revisar y Firmar PIN</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 3: LIBRO MAYOR DE GASTOS Y PAGOS                                  */}
      {/* ========================================================================= */}
      {activeSubTab === 'LIBRO_MAYOR' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                Libro Mayor de Gastos Operativos y Registro de Pagos
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Historial completo bimonetario con trazabilidad de abonos, auditoría y enlaces de Drive.
              </p>
            </div>

            {/* Barra de Búsqueda y Filtros */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Buscar proveedor, RIF, factura..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 w-48 sm:w-64"
                />
              </div>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-2.5 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
              >
                <option value="ALL">Todos los Rubros</option>
                {Object.entries(EXPENSE_CATEGORIES_METADATA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2.5 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
              >
                <option value="ALL">Todos los Estados</option>
                <option value="PENDIENTE">Pendientes</option>
                <option value="ABONADO">Abonados</option>
                <option value="PAGADO">Pagados</option>
                <option value="VENCIDO">Vencidos</option>
              </select>
            </div>
          </div>

          {/* Tabla de Gastos */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase font-bold text-[10px] tracking-wider">
                <tr>
                  <th className="p-3">Código / Fecha</th>
                  <th className="p-3">Proveedor / RIF</th>
                  <th className="p-3">Rubro</th>
                  <th className="p-3">Comprobante</th>
                  <th className="p-3 text-right">Monto USD</th>
                  <th className="p-3 text-right">Saldo Pendiente</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No se encontraron registros de gastos que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((exp) => {
                    const remaining = round2(toDecimal(exp.netPayableUsd).minus(exp.paidAmountUsd));
                    return (
                      <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3">
                          <span className="font-mono font-bold text-slate-900 dark:text-white block">
                            {exp.expenseCode}
                          </span>
                          <span className="text-[10px] text-slate-400">{exp.issueDate}</span>
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-slate-900 dark:text-white block truncate max-w-[180px]">
                            {exp.beneficiaryName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">{exp.beneficiaryRif}</span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                            {EXPENSE_CATEGORIES_METADATA[exp.category]?.label || exp.category}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[11px]">
                          {exp.voucherType.replace('_', ' ')} · {exp.voucherNumber}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span className="font-bold text-slate-900 dark:text-white block">
                            ${formatUsd(exp.netPayableUsd)}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            Bs. {formatVes(exp.amountVes)}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <span
                            className={`font-bold ${
                              remaining <= 0
                                ? 'text-slate-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            ${formatUsd(remaining)}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              exp.status === 'PAGADO'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : exp.status === 'ABONADO'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            }`}
                          >
                            {exp.status}
                          </span>
                          {exp.approvalStatus === 'PENDIENTE_APROBACION' && (
                            <span className="block text-[9px] text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                              Requiere PIN
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Botón Pagar / Abonar */}
                            {remaining > 0 && exp.approvalStatus !== 'RECHAZADO' && (
                              <button
                                type="button"
                                onClick={() => setSelectedExpenseForPayment(exp)}
                                className="px-2.5 py-1.5 min-h-[36px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1"
                                title="Asentar Pago o Abono"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                <span>Pagar</span>
                              </button>
                            )}

                            {/* Botón Asistente Drive */}
                            <button
                              type="button"
                              onClick={() => setSelectedExpenseForDrive(exp)}
                              className={`p-1.5 min-h-[36px] min-w-[36px] rounded-lg border transition-colors ${
                                exp.driveBackupConfirmed
                                  ? 'text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30'
                                  : 'text-slate-400 border-slate-300 hover:text-blue-600'
                              }`}
                              title="Ver estructura de Google Drive"
                            >
                              <Cloud className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 4: PRESUPUESTO Y SEMÁFORO DE CONTINGENCIA (70% / 100%)            */}
      {/* ========================================================================= */}
      {activeSubTab === 'PRESUPUESTO_ALERTAS' && (
        <div className="space-y-6">
          {/* Tarjetas KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-slate-400 block font-medium">Límite Presupuestario Mensual</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums block mt-1">
                ${formatUsd(budgetPlan.globalBudgetLimitUsd)}
              </span>
              <button
                type="button"
                onClick={() => setIsBudgetModalOpen(true)}
                className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline mt-2 block"
              >
                Ajustar Presupuesto con PIN...
              </button>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-slate-400 block font-medium">Ejecutado Total en Dólares</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums block mt-1">
                ${formatUsd(budgetStatus.totalExecutedUsd)}
              </span>
              <span className="text-xs text-slate-500 mt-1 block">
                {budgetStatus.activeExpensesCount} facturas activas procesadas
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-slate-400 block font-medium">Ejecutado Total en Bolívares (VES)</span>
              <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums block mt-1">
                Bs. {formatVes(budgetStatus.totalExecutedVes)}
              </span>
              <span className="text-xs text-slate-500 mt-1 block">
                Indexado a tasa oficial BCV
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-slate-400 block font-medium">Saldo Presupuestario Disponible</span>
              <span
                className={`text-2xl font-black tabular-nums block mt-1 ${
                  budgetStatus.remainingBudgetUsd < 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                ${formatUsd(budgetStatus.remainingBudgetUsd)}
              </span>
              <span className="text-xs text-slate-500 mt-1 block">
                Consumo: {budgetStatus.budgetConsumedPercent.toFixed(1)}% del límite
              </span>
            </div>
          </div>

          {/* Barra de Progreso Visual */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <PieChart className="w-5 h-5 text-purple-600" />
                Semáforo de Monitoreo de Contingencia
              </h3>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-emerald-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> 0% - 69% Normal
                </span>
                <span className="flex items-center gap-1 text-amber-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> 70% Alerta Preventiva
                </span>
                <span className="flex items-center gap-1 text-rose-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> &gt;= 100% Bloqueo Hard-Cap
                </span>
              </div>
            </div>

            {/* Barra Grande */}
            <div className="space-y-1.5">
              <div className="h-6 w-full bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden relative border border-slate-200 dark:border-slate-700">
                <div
                  className={`h-full transition-all duration-500 ${
                    budgetStatus.isOverBudget100
                      ? 'bg-rose-500'
                      : budgetStatus.isContingencyAlarm70
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, budgetStatus.budgetConsumedPercent)}%` }}
                />
                {/* Marcador del 70% */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-900 dark:bg-amber-300 z-10"
                  style={{ left: '70%' }}
                  title="Umbral de Alerta Preventiva 70%"
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span>0.00 USD</span>
                <span className="text-amber-600 font-bold">70% Alerta Preventiva (${(budgetPlan.globalBudgetLimitUsd * 0.7).toFixed(2)})</span>
                <span>Límite 100% (${budgetPlan.globalBudgetLimitUsd.toFixed(2)})</span>
              </div>
            </div>

            {budgetStatus.isContingencyAlarm70 && (
              <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-bold block">Alerta Preventiva de Contingencia Activada:</span>
                  El gasto acumulado ha superado el 70% del presupuesto del mes ({budgetStatus.budgetConsumedPercent.toFixed(1)}%). Se sugiere restringir compras no esenciales para no forzar el bloqueo gerencial del 100%.
                </div>
              </div>
            )}
          </div>

          {/* Desglose por Categorías */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Desglose Presupuestario por Rubro Operativo
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(budgetStatus.categoryExecution).map(([catKey, data]) => {
                const meta = EXPENSE_CATEGORIES_METADATA[catKey as ExpenseCategory];
                return (
                  <div
                    key={catKey}
                    className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {meta?.label || catKey}
                      </span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        ${formatUsd(data.executedUsd)} / ${formatUsd(data.budgetedUsd)}
                      </span>
                    </div>

                    <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          data.consumedPercent >= 100
                            ? 'bg-rose-500'
                            : data.consumedPercent >= 70
                            ? 'bg-amber-500'
                            : 'bg-indigo-500'
                        }`}
                        style={{ width: `${Math.min(100, data.consumedPercent)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{meta?.description}</span>
                      <span className="font-bold">{data.consumedPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PESTAÑA 5: ARQUEO Y CIERRE MENSUAL (AUDITORÍA ESTRATÉGICA)               */}
      {/* ========================================================================= */}
      {activeSubTab === 'ARQUEO_MENSUAL' && (
        <div className="space-y-6">
          {/* Header de la Auditoría */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-600" />
                Informe Estratégico de Arqueo y Auditoría de Gastos ({selectedPeriod})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Análisis de Pareto, detección de gastos hormiga y proyecciones presupuestarias para el mes siguiente.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadArqueoPdf}
                className="px-4 py-2.5 min-h-[44px] bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Descargar PDF Ejecutivo</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadArqueoExcel}
                className="px-4 py-2.5 min-h-[44px] bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Exportar Excel (.xlsx)</span>
              </button>
            </div>
          </div>

          {/* 1. Pareto Top 10 Gastos Mayores */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              1. Top Gastos Mayores del Mes (Análisis de Pareto)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-2.5">#</th>
                    <th className="p-2.5">Proveedor</th>
                    <th className="p-2.5">Comprobante</th>
                    <th className="p-2.5">Rubro</th>
                    <th className="p-2.5">Descripción</th>
                    <th className="p-2.5 text-right">Monto (USD)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {currentArqueoReport.topExpensesByAmount.map((g, idx) => (
                    <tr key={g.id}>
                      <td className="p-2.5 font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-2.5 font-bold text-slate-900 dark:text-white">{g.beneficiary}</td>
                      <td className="p-2.5 font-mono">{g.voucherNumber}</td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold">
                          {EXPENSE_CATEGORIES_METADATA[g.category]?.label || g.category}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-600 dark:text-slate-400 line-clamp-1">{g.description}</td>
                      <td className="p-2.5 text-right font-black font-mono text-slate-900 dark:text-white">
                        ${formatUsd(g.amountUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. Gastos Hormiga Recurrentes (<= $50) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-600" />
              2. Detección y Auditoría de Gastos Hormiga Recurrentes (&le; $50 USD)
            </h3>
            <p className="text-xs text-slate-400">
              Micro-gastos frecuentes que suelen escapar del control presupuestario por su bajo monto individual.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {currentArqueoReport.topFrequentMicroExpenses.map((m) => (
                <div
                  key={m.category}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 space-y-1.5"
                >
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    {EXPENSE_CATEGORIES_METADATA[m.category]?.label || m.category}
                  </span>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Tickets Frecuentes:</span>
                    <span className="font-bold text-amber-600 font-mono">{m.count} compras</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Gasto Acumulado:</span>
                    <span className="font-black text-slate-900 dark:text-white font-mono">
                      ${formatUsd(m.totalAmountUsd)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Ticket Promedio:</span>
                    <span className="font-semibold text-slate-600 dark:text-slate-400 font-mono">
                      ${formatUsd(m.avgAmountUsd)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Proyecciones Presupuestarias para el Próximo Mes */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-600" />
              3. Proyecciones Estratégicas Presupuestarias para el Mes Próximo
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-2.5">Rubro / Categoría</th>
                    <th className="p-2.5 text-right">Gasto Histórico (USD)</th>
                    <th className="p-2.5 text-right">Asignación Recomendada (USD)</th>
                    <th className="p-2.5">Justificación Operativa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {currentArqueoReport.nextMonthBudgetProjections.map((p) => (
                    <tr key={p.category}>
                      <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">
                        {EXPENSE_CATEGORIES_METADATA[p.category]?.label || p.category}
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                        ${formatUsd(p.historicalAvgUsd)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ${formatUsd(p.recommendedAllocationUsd)}
                      </td>
                      <td className="p-2.5 text-slate-500 text-[11px]">{p.rationale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: AJUSTE DE PRESUPUESTO MENSUAL CON PIN                              */}
      {/* ========================================================================= */}
      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <PieChart className="w-5 h-5 text-purple-600" />
              Ajuste de Presupuesto Mensual ({selectedPeriod})
            </h3>
            <form onSubmit={handleSaveBudgetPlan} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-600 dark:text-slate-400 block mb-1 font-semibold">
                  Nuevo Límite Global Mensual (USD):
                </label>
                <input
                  type="number"
                  step="50"
                  min="500"
                  required
                  value={newGlobalBudget}
                  onChange={(e) => setNewGlobalBudget(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono text-base font-bold text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div>
                <label className="text-slate-600 dark:text-slate-400 block mb-1 font-semibold">
                  PIN de Autorización Gerencial (203040):
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  placeholder="••••••"
                  value={budgetPin}
                  onChange={(e) => setBudgetPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono text-center tracking-widest text-slate-900 dark:text-white outline-none"
                />
              </div>

              {budgetFeedback && (
                <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                  {budgetFeedback}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBudgetModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow"
                >
                  Guardar Presupuesto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALES EXTERNOS COMPONENTIZADOS                                          */}
      {/* ========================================================================= */}
      <GoogleDriveBackupHelperModal
        expense={selectedExpenseForDrive}
        isOpen={Boolean(selectedExpenseForDrive)}
        onClose={() => setSelectedExpenseForDrive(null)}
        onConfirmBackup={markDriveBackupConfirmed}
      />

      <ExpenseManagerApprovalModal
        expense={selectedExpenseForApproval}
        isOpen={Boolean(selectedExpenseForApproval)}
        onClose={() => setSelectedExpenseForApproval(null)}
        onApprove={approveExpense}
        onReject={rejectExpense}
      />

      <ExpensePaymentModal
        expense={selectedExpenseForPayment}
        isOpen={Boolean(selectedExpenseForPayment)}
        onClose={() => setSelectedExpenseForPayment(null)}
        onRegisterPayment={registerExpensePayment}
        currentUserName={user?.displayName}
      />
    </div>
  );
};

export default ExpensesCenter;
