import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  BcvRateState,
  Supplier,
  PurchaseInvoice,
  AccountsPayablePayment,
  MonthlyClosureReport,
  TaxRetentionVoucher,
  TaxRetentionStatus,
  UserRole,
} from '../types';
import {
  buildBcvRateState,
  getCaracasNow,
  fetchLiveBcvRateFromNetwork,
} from '../lib/bcv';
import { toDecimal, round2 } from '../lib/decimal';
import {
  calculateInvoiceRetentions,
  voidRetentionVoucherWithPin,
} from '../lib/fiscal-retentions';
import { useUIConfig } from './UIConfigContext';
import { useAuth } from './AuthContext';

interface FinanceContextType {
  bcvState: BcvRateState;
  isSyncingBcv: boolean;
  bcvSyncError: string | null;
  refreshLiveBcvRate: (force?: boolean) => Promise<{
    success: boolean;
    activeRate: number;
    providerSource: string;
    latencyMs: number;
  }>;
  simulatedHourVet: number | null;
  setSimulatedHourVet: (hour: number | null) => void;
  updateRates: (spotRate: number, nextRate: number) => void;
  suppliers: Supplier[];
  addSupplier: (supplier: Omit<Supplier, 'id' | 'balanceUsd'>) => Supplier;
  updateSupplier: (supplierId: string, updates: Partial<Supplier>) => void;
  invoices: PurchaseInvoice[];
  registerOcrInvoice: (
    invoice: PurchaseInvoice,
    updateCostsCallback?: () => void
  ) => {
    invoice: PurchaseInvoice;
    ivaVoucher: TaxRetentionVoucher | null;
    islrVoucher: TaxRetentionVoucher | null;
  };
  retentionVouchers: TaxRetentionVoucher[];
  updateRetentionVoucherStatus: (
    voucherId: string,
    newStatus: Exclude<TaxRetentionStatus, 'ANULADO'>
  ) => { success: boolean; error?: string };
  voidRetentionVoucher: (
    voucherId: string,
    managerPin: string,
    reason: string
  ) => { success: boolean; voucher?: TaxRetentionVoucher; error?: string };
  payments: AccountsPayablePayment[];
  registerInvoicePayment: (
    invoiceId: string,
    amountUsd: number,
    method: AccountsPayablePayment['method'],
    reference: string,
    registeredBy: string
  ) => { success: boolean; error?: string };
  closures: MonthlyClosureReport[];
  generateMonthlyClosure: (
    period: string,
    inventoryValuationUsd: number,
    closedBy: string
  ) => MonthlyClosureReport;
  resetFinanceState: () => void;
  restoreFinanceState: (data: {
    suppliers?: Supplier[];
    invoices?: PurchaseInvoice[];
    payments?: AccountsPayablePayment[];
    closures?: MonthlyClosureReport[];
    retentionVouchers?: TaxRetentionVoucher[];
  }) => void;
}

const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 'sup-001',
    rif: 'J-00006372-9',
    name: 'Alimentos Polar Comercial, C.A.',
    category: 'Víveres e Industriales',
    contactName: 'Gerencia de Cuentas Clave Oriente',
    phone: '+58 212-2023111',
    email: 'facturacion@empresas-polar.com',
    creditDays: 15,
    paymentTerms: 'Crédito 15 Días Indexado BCV',
    balanceUsd: 1842.5,
    taxpayerType: 'ESPECIAL',
    personType: 'PJ_DOMICILIADA',
  },
  {
    id: 'sup-002',
    rif: 'J-30148921-4',
    name: 'Lácteos Los Andes / Distribuidora Paisa Sur, C.A.',
    category: 'Lácteos y Refrigerados',
    contactName: 'Lic. Héctor Bastidas',
    phone: '+58 286-9624410',
    email: 'cobranzas@lacteospaisa.com.ve',
    creditDays: 7,
    paymentTerms: 'Crédito 7 Días Cadena de Frío',
    balanceUsd: 920.0,
    taxpayerType: 'ORDINARIO',
    personType: 'PJ_DOMICILIADA',
  },
  {
    id: 'sup-003',
    rif: 'J-00041290-1',
    name: 'Corporación Café Madrid & Conservas Oriente, C.A.',
    category: 'Bebidas y Enlatados',
    contactName: 'Ing. Patricia Landaeta',
    phone: '+58 241-8329900',
    email: 'ventas@cafemadrid.com.ve',
    creditDays: 30,
    paymentTerms: 'Crédito 30 Días Comercial',
    balanceUsd: 540.75,
    taxpayerType: 'ORDINARIO',
    personType: 'PJ_DOMICILIADA',
  },
  {
    id: 'sup-004',
    rif: 'J-31458920-5',
    name: 'Frigorífico Industrial y Matadero Bolívar, C.A.',
    category: 'Carnes / Avícola',
    contactName: 'Dr. Roberto Mendoza (Médico Veterinario)',
    phone: '+58 286-9231800',
    email: 'despacho@frigorificobolivar.com.ve',
    creditDays: 15,
    paymentTerms: 'Crédito 15 Días Canal Fría',
    balanceUsd: 0,
    taxpayerType: 'ORDINARIO',
    personType: 'PJ_DOMICILIADA',
  },
  {
    id: 'sup-005',
    rif: 'J-40982314-1',
    name: 'Distribuidora Agrícola Campo Fresco Los Andes, C.A.',
    category: 'Frutas y Hortalizas',
    contactName: 'Sr. Eloy Zambrano',
    phone: '+58 274-2441920',
    email: 'ventas@campofrescolosandes.com',
    creditDays: 7,
    paymentTerms: 'Crédito 7 Días Flete Incluido',
    balanceUsd: 0,
    taxpayerType: 'FORMAL',
    personType: 'PJ_DOMICILIADA',
  },
];

const INITIAL_RETENTIONS: TaxRetentionVoucher[] = [
  {
    id: 'ret-iva-20260300000001',
    voucherNumber: '20260300000001',
    type: 'IVA',
    legalNormative: 'Providencia Administrativa SNAT/2025/000054 (G.O. N° 43.171)',
    status: 'ENTREGADO',
    issueDate: '2026-03-18',
    periodYearMonth: '202603',
    fortnight: 'SEGUNDA_QUINCENA',
    fortnightLabel: '2da Quincena (16 al Fin/03/2026)',
    legalDeliveryHint:
      'Entrega obligatoria al proveedor dentro de los dos (2) días hábiles siguientes a la operación (SNAT/2025/000054).',
    agentRazonSocial: 'HIPER ABASTO POLAR, C.A.',
    agentRif: 'J-50123456-7',
    agentAddress: 'AV. INTERCOMUNAL, SECTOR LA MORITA, MARACAY, EDO. ARAGUA, VENEZUELA',
    supplierId: 'sup-001',
    supplierName: 'Alimentos Polar Comercial, C.A.',
    supplierRif: 'J-00006372-9',
    supplierTaxpayerType: 'ESPECIAL',
    supplierPersonType: 'PJ_DOMICILIADA',
    invoiceId: 'inv-2026-001',
    invoiceNumber: 'FAC-0089412',
    controlNumber: '00-774129',
    invoiceIssueDate: '2026-03-18',
    bcvRateAtIssue: 886.23,
    utValueVes: 9.0,
    lines: [
      {
        lineId: 'ln-1',
        sku: 'HAR-PAN-1KG',
        description: 'Fardo Harina P.A.N. 1Kg (20 Und)',
        lineType: 'BIEN',
        baseAmountUsd: 0,
        baseAmountVes: 0,
        exemptAmountUsd: 1104.0,
        exemptAmountVes: 978397.92,
        taxRatePercent: 0,
        taxCausadoUsd: 0,
        taxCausadoVes: 0,
        retentionRatePercent: 0,
        sustraendoVes: 0,
        retainedAmountUsd: 0,
        retainedAmountVes: 0,
      },
      {
        lineId: 'ln-2',
        sku: 'ACE-MAZ-1LT',
        description: 'Caja Aceite Mazeite 1L (12 Und)',
        lineType: 'BIEN',
        baseAmountUsd: 564.0,
        baseAmountVes: 499833.72,
        exemptAmountUsd: 0,
        exemptAmountVes: 0,
        taxRatePercent: 16,
        taxCausadoUsd: 90.24,
        taxCausadoVes: 79973.4,
        retentionRatePercent: 75,
        sustraendoVes: 0,
        retainedAmountUsd: 67.68,
        retainedAmountVes: 59980.05,
      },
    ],
    invoiceTotalUsd: 1758.24,
    invoiceTotalVes: 1558205.04,
    exemptTotalUsd: 1104.0,
    exemptTotalVes: 978397.92,
    taxableBaseUsd: 564.0,
    taxableBaseVes: 499833.72,
    taxCausadoTotalUsd: 90.24,
    taxCausadoTotalVes: 79973.4,
    sustraendoTotalVes: 0,
    retainedTotalUsd: 67.68,
    retainedTotalVes: 59980.05,
    retentionPercentApplied: 75,
    netPayableAfterAllRetentionsUsd: 1690.56,
    netPayableAfterAllRetentionsVes: 1498224.99,
    createdBy: 'rdrj.mppd@gmail.com',
    createdAtVet: '18/03/2026 11:20',
  },
];

const INITIAL_INVOICES: PurchaseInvoice[] = [
  {
    id: 'inv-2026-001',
    invoiceNumber: 'FAC-0089412',
    controlNumber: '00-774129',
    supplierId: 'sup-001',
    supplierName: 'Alimentos Polar Comercial, C.A.',
    supplierRif: 'J-00006372-9',
    locationId: 'loc-pzo-01',
    issueDate: '2026-03-18',
    dueDate: '2026-04-02',
    currency: 'USD',
    bcvRateAtIssue: 886.23,
    lines: [
      {
        id: 'ln-1',
        sku: 'HAR-PAN-1KG',
        description: 'Fardo Harina P.A.N. 1Kg (20 Und)',
        quantity: 60,
        unitCostUsd: 18.4,
        lineTotalUsd: 1104.0,
        ivaRate: 0,
        lineType: 'BIEN',
      },
      {
        id: 'ln-2',
        sku: 'ACE-MAZ-1LT',
        description: 'Caja Aceite Mazeite 1L (12 Und)',
        quantity: 20,
        lineTotalUsd: 564.0,
        unitCostUsd: 28.2,
        ivaRate: 16,
        lineType: 'BIEN',
      },
    ],
    subtotalUsd: 1668.0,
    ivaAmountUsd: 90.24,
    igtfAmountUsd: 0,
    totalUsd: 1758.24,
    exemptAmountUsd: 1104.0,
    taxableBase16Usd: 564.0,
    iva16Usd: 90.24,
    ivaRetentionId: 'ret-iva-20260300000001',
    ivaRetainedUsd: 67.68,
    islrRetainedUsd: 0,
    totalRetainedUsd: 67.68,
    netPayableUsd: 1690.56,
    paidAmountUsd: 500.0,
    status: 'ABONADA',
    ocrEngineUsed: 'GEMINI_VISION_PRO',
    forensicAudit: {
      passedAllLocks: true,
      lock1LineIntegrations: true,
      lock2SubtotalMatch: true,
      lock3TaxCoherence: true,
      lock4TotalCrossCheck: true,
      discrepancyUsd: 0,
      auditLog: [
        'CANDADO 1 [OK]: Todas las líneas cumplen Cantidad × Costo Unitario = Subtotal Línea.',
        'CANDADO 2 [OK]: Suma de líneas ($1668.00) coincide con Base Imponible ($1668.00).',
        'CANDADO 3 [OK]: IVA e IGTF validados según alícuota mixta exenta/gravada.',
        'CANDADO 4 [OK]: Gran Total verificado exactamente en $1758.24.',
      ],
    },
    createdAtVet: '2026-03-18T11:20:00-04:00',
  },
  {
    id: 'inv-2026-002',
    invoiceNumber: 'FAC-0019204',
    controlNumber: '00-331094',
    supplierId: 'sup-002',
    supplierName: 'Lácteos Los Andes / Distribuidora Paisa Sur, C.A.',
    supplierRif: 'J-30148921-4',
    locationId: 'loc-pzo-01',
    issueDate: '2026-03-10',
    dueDate: '2026-03-17',
    currency: 'USD',
    bcvRateAtIssue: 886.23,
    lines: [
      {
        id: 'ln-201',
        sku: 'QUE-PAI-KG',
        description: 'Queso Blanco Pasteurizado Paisa Pieza 5Kg',
        quantity: 34,
        unitCostUsd: 27.0,
        lineTotalUsd: 918.0,
        ivaRate: 0,
        lineType: 'BIEN',
      },
    ],
    subtotalUsd: 918.0,
    ivaAmountUsd: 0,
    igtfAmountUsd: 0,
    totalUsd: 918.0,
    exemptAmountUsd: 918.0,
    ivaRetainedUsd: 0,
    islrRetainedUsd: 0,
    totalRetainedUsd: 0,
    netPayableUsd: 918.0,
    paidAmountUsd: 0,
    status: 'VENCIDA',
    ocrEngineUsed: 'TESSERACT_FORENSIC',
    forensicAudit: {
      passedAllLocks: true,
      lock1LineIntegrations: true,
      lock2SubtotalMatch: true,
      lock3TaxCoherence: true,
      lock4TotalCrossCheck: true,
      discrepancyUsd: 0,
      auditLog: ['Auditoría Forense OCR 4 Candados aprobada con discrepancia $0.00.'],
    },
    createdAtVet: '2026-03-10T15:45:00-04:00',
  },
];

const INITIAL_CLOSURES: MonthlyClosureReport[] = [
  {
    id: 'cls-2026-02',
    period: '2026-02',
    closedAtVet: '2026-02-28T18:30:00-04:00',
    closedBy: 'rdrj.mppd@gmail.com',
    averageBcvRate: 886.23,
    totalPurchasesUsd: 18450.0,
    totalPaidUsd: 16920.0,
    pendingPayablesUsd: 1530.0,
    inventoryValuationUsd: 24680.5,
    inventoryValuationVes: 21872599.52,
    estimatedGrossMarginPercent: 27.85,
    status: 'CERRADO_AUDITADO',
  },
];

const STORAGE_KEY_INVOICES = 'chrystal_erp_invoices_v1';
const STORAGE_KEY_SUPPLIERS = 'chrystal_erp_suppliers_v1';
const STORAGE_KEY_CLOSURES = 'chrystal_erp_closures_v1';
const STORAGE_KEY_RETENTIONS = 'chrystal_erp_retentions_v1';

export const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config, updateCompanyProfile } = useUIConfig();
  const { user } = useAuth();

  const [spotRate, setSpotRate] = useState<number>(886.23);
  const [nextDayRate, setNextDayRate] = useState<number>(887.3);
  const [telemetry, setTelemetry] = useState<{
    eurRate?: number;
    valueDateLabel?: string;
    lastSyncVet?: string;
    providerSource?: string;
    latencyMs?: number;
    isLiveConnected?: boolean;
  }>({
    eurRate: 1100.25,
    valueDateLabel: 'Sincronizando con www.bcv.org.ve...',
    lastSyncVet: getCaracasNow().timeFormatted,
    providerSource: 'Portal Oficial BCV (www.bcv.org.ve)',
    latencyMs: 0,
    isLiveConnected: true,
  });

  const [isSyncingBcv, setIsSyncingBcv] = useState<boolean>(false);
  const [bcvSyncError, setBcvSyncError] = useState<string | null>(null);
  const [simulatedHourVet, setSimulatedHourVet] = useState<number | null>(null);

  const [bcvState, setBcvState] = useState<BcvRateState>(() =>
    buildBcvRateState(886.23, 887.3, undefined, telemetry)
  );

  const refreshLiveBcvRate = useCallback(
    async (force: boolean = true) => {
      setIsSyncingBcv(true);
      setBcvSyncError(null);
      try {
        const quote = await fetchLiveBcvRateFromNetwork(force);
        const newSpot = round2(quote.usdSpotRate);
        const newPortal = round2(quote.usdRatePortal);

        setSpotRate(newSpot);
        setNextDayRate(newPortal);
        const newTelemetry = {
          eurRate: quote.eurRatePortal,
          valueDateLabel: quote.valueDateLabel,
          lastSyncVet: quote.fetchedAtVet,
          providerSource: quote.providerSource,
          latencyMs: quote.latencyMs,
          isLiveConnected: quote.isLiveConnected,
        };
        setTelemetry(newTelemetry);

        const override =
          simulatedHourVet !== null ? { hour: simulatedHourVet, minute: 0 } : undefined;
        const updatedState = buildBcvRateState(
          newSpot,
          newPortal,
          override,
          newTelemetry
        );
        setBcvState(updatedState);

        return {
          success: true,
          activeRate: updatedState.activeRate,
          providerSource: quote.providerSource,
          latencyMs: quote.latencyMs,
        };
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Error de red al conectar con el Banco Central de Venezuela.';
        setBcvSyncError(msg);
        return {
          success: false,
          activeRate: bcvState.activeRate,
          providerSource: 'Caché Local de Respaldo',
          latencyMs: 0,
        };
      } finally {
        setIsSyncingBcv(false);
      }
    },
    [simulatedHourVet, bcvState.activeRate]
  );

  useEffect(() => {
    refreshLiveBcvRate(false).catch(() => {});
    const autoSyncTimer = setInterval(() => {
      refreshLiveBcvRate(false).catch(() => {});
    }, 300_000);
    return () => clearInterval(autoSyncTimer);
  }, []);

  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SUPPLIERS);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_SUPPLIERS;
  });

  const [invoices, setInvoices] = useState<PurchaseInvoice[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_INVOICES);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_INVOICES;
  });

  const [retentionVouchers, setRetentionVouchers] = useState<TaxRetentionVoucher[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RETENTIONS);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_RETENTIONS;
  });

  const [payments, setPayments] = useState<AccountsPayablePayment[]>([
    {
      id: 'pay-001',
      invoiceId: 'inv-2026-001',
      amountUsd: 500.0,
      bcvRateUsed: 886.23,
      amountVes: 443115.0,
      method: 'TRANSFERENCIA_VES',
      reference: 'Banesco-99481203',
      paidAtVet: '2026-03-20T14:10:00-04:00',
      registeredBy: 'rdrj.mppd@gmail.com',
    },
  ]);

  const [closures, setClosures] = useState<MonthlyClosureReport[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CLOSURES);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_CLOSURES;
  });

  useEffect(() => {
    const refreshRateClock = () => {
      const override =
        simulatedHourVet !== null ? { hour: simulatedHourVet, minute: 0 } : undefined;
      setBcvState(buildBcvRateState(spotRate, nextDayRate, override, telemetry));
    };
    refreshRateClock();
    const timer = setInterval(refreshRateClock, 15000);
    return () => clearInterval(timer);
  }, [spotRate, nextDayRate, simulatedHourVet, telemetry]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_INVOICES, JSON.stringify(invoices));
    } catch {
      // ignore
    }
  }, [invoices]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SUPPLIERS, JSON.stringify(suppliers));
    } catch {
      // ignore
    }
  }, [suppliers]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_RETENTIONS, JSON.stringify(retentionVouchers));
    } catch {
      // ignore
    }
  }, [retentionVouchers]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CLOSURES, JSON.stringify(closures));
    } catch {
      // ignore
    }
  }, [closures]);

  const updateRates = (newSpot: number, newNext: number) => {
    setSpotRate(round2(newSpot));
    setNextDayRate(round2(newNext));
    setTelemetry((prev) => ({
      ...prev,
      lastSyncVet: getCaracasNow().timeFormatted,
      providerSource: 'Ajuste Manual Autorizado + BCV',
    }));
  };

  const addSupplier = (data: Omit<Supplier, 'id' | 'balanceUsd'>): Supplier => {
    const newSup: Supplier = {
      taxpayerType: 'ORDINARIO',
      personType: 'PJ_DOMICILIADA',
      ...data,
      id: `sup-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      balanceUsd: 0,
    };
    setSuppliers((prev) => [...prev, newSup]);
    return newSup;
  };

  const updateSupplier = (supplierId: string, updates: Partial<Supplier>) => {
    setSuppliers((prev) =>
      prev.map((s) => (s.id === supplierId ? { ...s, ...updates } : s))
    );
  };

  const registerOcrInvoice = (
    invoice: PurchaseInvoice,
    updateCostsCallback?: () => void
  ) => {
    const matchedSupplier = suppliers.find((s) => s.id === invoice.supplierId);
    const existingIvaCount = retentionVouchers.filter((v) => v.type === 'IVA').length;
    const existingIslrCount = retentionVouchers.filter((v) => v.type === 'ISLR').length;

    const nextIvaSeq = Math.max(
      config.companyProfile.nextIvaVoucherSeq ?? 1,
      existingIvaCount + 1
    );
    const nextIslrSeq = Math.max(
      config.companyProfile.nextIslrVoucherSeq ?? 1,
      existingIslrCount + 1
    );

    const calc = calculateInvoiceRetentions({
      invoice,
      supplier: matchedSupplier,
      companyProfile: config.companyProfile,
      nextIvaSeq,
      nextIslrSeq,
      createdBy: user?.email || 'rdrj.mppd@gmail.com',
    });

    const finalInvoice = calc.updatedInvoice;
    const newVouchers: TaxRetentionVoucher[] = [];
    if (calc.ivaVoucher) newVouchers.push(calc.ivaVoucher);
    if (calc.islrVoucher) newVouchers.push(calc.islrVoucher);

    setInvoices((prev) => [finalInvoice, ...prev]);

    if (newVouchers.length > 0) {
      setRetentionVouchers((prev) => [...newVouchers, ...prev]);
      updateCompanyProfile({
        nextIvaVoucherSeq: calc.nextIvaSeqAfter,
        nextIslrVoucherSeq: calc.nextIslrSeqAfter,
      });
    }

    const netOwedToSupplier =
      finalInvoice.netPayableUsd !== undefined
        ? finalInvoice.netPayableUsd
        : finalInvoice.totalUsd;

    setSuppliers((prev) =>
      prev.map((s) =>
        s.id === finalInvoice.supplierId
          ? {
              ...s,
              balanceUsd: round2(toDecimal(s.balanceUsd).plus(netOwedToSupplier)),
            }
          : s
      )
    );

    if (updateCostsCallback) updateCostsCallback();

    return {
      invoice: finalInvoice,
      ivaVoucher: calc.ivaVoucher,
      islrVoucher: calc.islrVoucher,
    };
  };

  const updateRetentionVoucherStatus = (
    voucherId: string,
    newStatus: Exclude<TaxRetentionStatus, 'ANULADO'>
  ): { success: boolean; error?: string } => {
    const found = retentionVouchers.find((v) => v.id === voucherId);
    if (!found) {
      return { success: false, error: 'Comprobante de retención no encontrado.' };
    }
    if (found.status === 'ANULADO') {
      return {
        success: false,
        error: 'Un comprobante ANULADO es inmutable y no puede reactivarse.',
      };
    }

    setRetentionVouchers((prev) =>
      prev.map((v) => (v.id === voucherId ? { ...v, status: newStatus } : v))
    );
    return { success: true };
  };

  const voidRetentionVoucher = (
    voucherId: string,
    managerPin: string,
    reason: string
  ): { success: boolean; voucher?: TaxRetentionVoucher; error?: string } => {
    const target = retentionVouchers.find((v) => v.id === voucherId);
    if (!target) {
      return { success: false, error: 'Comprobante fiscal no encontrado.' };
    }

    try {
      const caracas = getCaracasNow();
      const voided = voidRetentionVoucherWithPin({
        voucher: target,
        actor: {
          uid: user?.uid || 'sys-admin',
          displayName: user?.displayName || 'Gerencia Fiscal',
          role: user?.role || UserRole.GERENTE,
          pin: user?.pin,
        },
        managerPin,
        reason,
        voidedAtVet: `${caracas.dateFormatted} ${caracas.timeFormatted}`,
      });

      setRetentionVouchers((prev) =>
        prev.map((v) => (v.id === voucherId ? voided : v))
      );

      // Revertir el descuento sobre el neto a pagar de la factura y restituir saldo CxP del proveedor
      setInvoices((prev) =>
        prev.map((inv) => {
          if (inv.id !== target.invoiceId) return inv;
          const prevIvaRet = inv.ivaRetainedUsd || 0;
          const prevIslrRet = inv.islrRetainedUsd || 0;
          const nextIvaRet = target.type === 'IVA' ? 0 : prevIvaRet;
          const nextIslrRet = target.type === 'ISLR' ? 0 : prevIslrRet;
          const nextTotalRet = round2(toDecimal(nextIvaRet).plus(nextIslrRet));
          const nextNetPayable = Math.max(
            0,
            round2(toDecimal(inv.totalUsd).minus(nextTotalRet))
          );
          const nextStatus =
            inv.status === 'PAGADA' && toDecimal(inv.paidAmountUsd).lt(nextNetPayable)
              ? inv.paidAmountUsd > 0
                ? 'ABONADA'
                : 'PENDIENTE'
              : inv.status;

          return {
            ...inv,
            ivaRetainedUsd: nextIvaRet,
            islrRetainedUsd: nextIslrRet,
            totalRetainedUsd: nextTotalRet,
            netPayableUsd: nextNetPayable,
            status: nextStatus,
          };
        })
      );

      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === target.supplierId
            ? {
                ...s,
                balanceUsd: round2(
                  toDecimal(s.balanceUsd).plus(target.retainedTotalUsd)
                ),
              }
            : s
        )
      );

      return { success: true, voucher: voided };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Error al anular comprobante.',
      };
    }
  };

  const registerInvoicePayment = (
    invoiceId: string,
    amountUsd: number,
    method: AccountsPayablePayment['method'],
    reference: string,
    registeredBy: string
  ) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (!inv) return { success: false, error: 'Factura no encontrada.' };

    const effectivePayable =
      inv.netPayableUsd !== undefined ? inv.netPayableUsd : inv.totalUsd;
    const pending = Math.max(
      0,
      round2(toDecimal(effectivePayable).minus(inv.paidAmountUsd))
    );
    if (amountUsd <= 0 || amountUsd > pending) {
      return {
        success: false,
        error: `El abono debe ser mayor a $0.00 y no exceder el neto pendiente a pagar ($${pending.toFixed(2)}).`,
      };
    }

    const vetNow = getCaracasNow().isoTimestamp;
    const amountVes = round2(toDecimal(amountUsd).times(bcvState.activeRate));

    const newPayment: AccountsPayablePayment = {
      id: `pay-${Date.now()}`,
      invoiceId,
      amountUsd: round2(amountUsd),
      bcvRateUsed: bcvState.activeRate,
      amountVes,
      method,
      reference: reference || `REF-${Date.now()}`,
      paidAtVet: vetNow,
      registeredBy,
    };

    setPayments((prev) => [newPayment, ...prev]);

    setInvoices((prev) =>
      prev.map((item) => {
        if (item.id !== invoiceId) return item;
        const itemNet =
          item.netPayableUsd !== undefined ? item.netPayableUsd : item.totalUsd;
        const newPaid = round2(toDecimal(item.paidAmountUsd).plus(amountUsd));
        const isPaid = toDecimal(newPaid).gte(itemNet);
        return {
          ...item,
          paidAmountUsd: newPaid,
          status: isPaid ? 'PAGADA' : 'ABONADA',
        };
      })
    );

    setSuppliers((prev) =>
      prev.map((s) =>
        s.id === inv.supplierId
          ? {
              ...s,
              balanceUsd: Math.max(0, round2(toDecimal(s.balanceUsd).minus(amountUsd))),
            }
          : s
      )
    );

    return { success: true };
  };

  const generateMonthlyClosure = (
    period: string,
    inventoryValuationUsd: number,
    closedBy: string
  ): MonthlyClosureReport => {
    const totalPurchases = invoices.reduce(
      (acc, inv) => acc.plus(inv.totalUsd),
      toDecimal(0)
    );
    const totalNetPayable = invoices.reduce(
      (acc, inv) =>
        acc.plus(inv.netPayableUsd !== undefined ? inv.netPayableUsd : inv.totalUsd),
      toDecimal(0)
    );
    const totalPaid = invoices.reduce(
      (acc, inv) => acc.plus(inv.paidAmountUsd),
      toDecimal(0)
    );
    const pendingPayables = DecimalMaxZero(totalNetPayable.minus(totalPaid));
    const valuationVes = round2(
      toDecimal(inventoryValuationUsd).times(bcvState.activeRate)
    );

    const report: MonthlyClosureReport = {
      id: `cls-${period}-${Date.now()}`,
      period,
      closedAtVet: getCaracasNow().isoTimestamp,
      closedBy,
      averageBcvRate: bcvState.activeRate,
      totalPurchasesUsd: round2(totalPurchases),
      totalPaidUsd: round2(totalPaid),
      pendingPayablesUsd: round2(pendingPayables),
      inventoryValuationUsd: round2(inventoryValuationUsd),
      inventoryValuationVes: valuationVes,
      estimatedGrossMarginPercent: 28.4,
      status: 'CERRADO_AUDITADO',
    };

    setClosures((prev) => [report, ...prev]);
    return report;
  };

  const resetFinanceState = () => {
    setSuppliers([]);
    setInvoices([]);
    setPayments([]);
    setClosures([]);
    setRetentionVouchers([]);
    try {
      localStorage.setItem(STORAGE_KEY_SUPPLIERS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_INVOICES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_CLOSURES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_RETENTIONS, JSON.stringify([]));
    } catch {
      // ignore
    }
  };

  const restoreFinanceState = (data: {
    suppliers?: Supplier[];
    invoices?: PurchaseInvoice[];
    payments?: AccountsPayablePayment[];
    closures?: MonthlyClosureReport[];
    retentionVouchers?: TaxRetentionVoucher[];
  }) => {
    if (data.suppliers) {
      setSuppliers(data.suppliers);
      try {
        localStorage.setItem(STORAGE_KEY_SUPPLIERS, JSON.stringify(data.suppliers));
      } catch {
        // ignore
      }
    }
    if (data.invoices) {
      setInvoices(data.invoices);
      try {
        localStorage.setItem(STORAGE_KEY_INVOICES, JSON.stringify(data.invoices));
      } catch {
        // ignore
      }
    }
    if (data.payments) {
      setPayments(data.payments);
    }
    if (data.closures) {
      setClosures(data.closures);
      try {
        localStorage.setItem(STORAGE_KEY_CLOSURES, JSON.stringify(data.closures));
      } catch {
        // ignore
      }
    }
    if (data.retentionVouchers) {
      setRetentionVouchers(data.retentionVouchers);
      try {
        localStorage.setItem(
          STORAGE_KEY_RETENTIONS,
          JSON.stringify(data.retentionVouchers)
        );
      } catch {
        // ignore
      }
    }
  };

  return (
    <FinanceContext.Provider
      value={{
        bcvState,
        isSyncingBcv,
        bcvSyncError,
        refreshLiveBcvRate,
        simulatedHourVet,
        setSimulatedHourVet,
        updateRates,
        suppliers,
        addSupplier,
        updateSupplier,
        invoices,
        registerOcrInvoice,
        retentionVouchers,
        updateRetentionVoucherStatus,
        voidRetentionVoucher,
        payments,
        registerInvoicePayment,
        closures,
        generateMonthlyClosure,
        resetFinanceState,
        restoreFinanceState,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

function DecimalMaxZero(val: ReturnType<typeof toDecimal>) {
  return val.lt(0) ? toDecimal(0) : val;
}

export const useFinance = () => {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance debe usarse dentro de un FinanceProvider');
  return ctx;
};

export default FinanceContext;
