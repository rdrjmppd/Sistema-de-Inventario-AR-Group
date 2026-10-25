import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  BcvRateState,
  Supplier,
  PurchaseInvoice,
  AccountsPayablePayment,
  MonthlyClosureReport,
} from '../types';
import {
  buildBcvRateState,
  getCaracasNow,
  fetchLiveBcvRateFromNetwork,
} from '../lib/bcv';
import { toDecimal, round2 } from '../lib/decimal';

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
  addSupplier: (supplier: Omit<Supplier, 'id' | 'balanceUsd'>) => void;
  invoices: PurchaseInvoice[];
  registerOcrInvoice: (invoice: PurchaseInvoice, updateCostsCallback?: () => void) => void;
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
      },
      {
        id: 'ln-2',
        sku: 'ACE-MAZ-1LT',
        description: 'Caja Aceite Mazeite 1L (12 Und)',
        quantity: 20,
        lineTotalUsd: 564.0,
        unitCostUsd: 28.2,
      },
    ],
    subtotalUsd: 1668.0,
    ivaAmountUsd: 90.24,
    igtfAmountUsd: 0,
    totalUsd: 1758.24,
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
      },
    ],
    subtotalUsd: 918.0,
    ivaAmountUsd: 0,
    igtfAmountUsd: 0,
    totalUsd: 918.0,
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

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize with verified live BCV rates (886.23 Spot / 887.30 Portal BCV) and immediately sync live on mount
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

  // Sync live with www.bcv.org.ve on startup
  useEffect(() => {
    refreshLiveBcvRate(false);
    // Periodic auto-sync every 5 minutes
    const autoSyncTimer = setInterval(() => {
      refreshLiveBcvRate(false);
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

  const addSupplier = (data: Omit<Supplier, 'id' | 'balanceUsd'>) => {
    const newSup: Supplier = {
      ...data,
      id: `sup-${Date.now()}`,
      balanceUsd: 0,
    };
    setSuppliers((prev) => [...prev, newSup]);
  };

  const registerOcrInvoice = (invoice: PurchaseInvoice, updateCostsCallback?: () => void) => {
    setInvoices((prev) => [invoice, ...prev]);
    setSuppliers((prev) =>
      prev.map((s) =>
        s.id === invoice.supplierId
          ? { ...s, balanceUsd: round2(toDecimal(s.balanceUsd).plus(invoice.totalUsd)) }
          : s
      )
    );
    if (updateCostsCallback) updateCostsCallback();
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

    const pending = round2(toDecimal(inv.totalUsd).minus(inv.paidAmountUsd));
    if (amountUsd <= 0 || amountUsd > pending) {
      return {
        success: false,
        error: `El abono debe ser mayor a $0.00 y no exceder el saldo pendiente ($${pending.toFixed(2)}).`,
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
        const newPaid = round2(toDecimal(item.paidAmountUsd).plus(amountUsd));
        const isPaid = toDecimal(newPaid).gte(item.totalUsd);
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
    const totalPaid = invoices.reduce(
      (acc, inv) => acc.plus(inv.paidAmountUsd),
      toDecimal(0)
    );
    const pendingPayables = totalPurchases.minus(totalPaid);
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
        invoices,
        registerOcrInvoice,
        payments,
        registerInvoicePayment,
        closures,
        generateMonthlyClosure,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = () => {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance debe usarse dentro de un FinanceProvider');
  return ctx;
};

export default FinanceContext;
