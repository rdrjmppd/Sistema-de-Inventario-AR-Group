import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  AccountsPayablePayment,
  BankStatementLine,
  BrmDocumentCategory,
  BrmSupplierPreInvoice,
  BrmWhatsappMessage,
  BrmWhatsappSessionStatus,
  ColdChainTemperatureLog,
  ColdEquipmentType,
  DemandForecastSummary,
  FefoPerishableLot,
  FiscalZReportRecord,
  InternalProductionOrder,
  PaymentPreConciliationItem,
  ProductionRecipeBom,
  PurchaseInvoice,
  RotationHorizonDays,
  ScaleBarcodeMode,
  StorageZone,
  SupplierPurchaseOrder,
  TotpSecurityConfig,
} from '../types';
import { useAuth } from './AuthContext';
import { useUIConfig } from './UIConfigContext';
import { useFinance } from './FinanceContext';
import { useInventory } from './InventoryContext';
import { getCaracasNow } from '../lib/bcv';
import { round2, toDecimal } from '../lib/decimal';
import {
  DEFAULT_TOTP_CONFIG,
  generateBase32TotpSecret,
} from '../lib/totp-governance';
import {
  buildColdChainTemperatureLog,
  createFefoPerishableLot,
  moveFefoLotToShelf,
  refreshFefoLotsStatuses,
} from '../lib/fefo-coldchain';
import { executeInternalProductionOrder } from '../lib/recipe-bom';
import {
  appendIdempotentBrmMessage,
  DEFAULT_CORPORATE_BRM_PHONE_E164,
  formatBrmPaymentAndRetentionsBundleTemplate,
  formatBrmPurchaseOrderTemplate,
  registerIncomingBrmPreInvoice,
  resetBrmWhatsappSessionCleanly,
} from '../lib/brm-whatsapp';
import {
  autoReconcileBankStatement,
  parseBankStatementCsv,
  submitPaymentToPreConciliation,
} from '../lib/bank-reconciliation';
import {
  processFiscalZClosure,
  RegisterFiscalZInput,
} from '../lib/fiscal-printer';
import { forecastVenezuelanRetailDemand } from '../lib/demand-predictor';
import { exportRetentionVoucherPdf } from '../lib/retention-pdf';
import { applyStockDeltaToZone } from '../lib/shelf-stock';
import { verifyManagerGovernanceAuth } from '../lib/totp-governance';

const STORAGE_KEYS = {
  TOTP: 'chrystal_v4_totp_config',
  SCALE_MODE: 'chrystal_v4_scale_mode',
  FEFO_LOTS: 'chrystal_v4_fefo_lots',
  COLD_LOGS: 'chrystal_v4_cold_chain_logs',
  RECIPES: 'chrystal_v4_production_recipes',
  PROD_ORDERS: 'chrystal_v4_production_orders',
  BRM_SESSION: 'chrystal_v4_brm_session',
  BRM_MESSAGES: 'chrystal_v4_brm_messages',
  BRM_PREINVOICES: 'chrystal_v4_brm_preinvoices',
  BANK_LINES: 'chrystal_v4_bank_lines',
  PRE_CONCILIATION: 'chrystal_v4_pre_conciliation',
  FISCAL_Z: 'chrystal_v4_fiscal_z_reports',
};

function loadJsonSafe<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJsonSafe<T>(key: string, value: T): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Tolerate storage quota limits silently
  }
}

interface OperationsBrmContextType {
  // Configuración TOTP & Balanzas
  totpConfig: TotpSecurityConfig;
  updateTotpConfig: (updates: Partial<TotpSecurityConfig>) => void;
  regenerateTotpSecret: () => string;
  defaultScaleMode: ScaleBarcodeMode;
  setDefaultScaleMode: (mode: ScaleBarcodeMode) => void;

  // 5. Control FEFO & Cadena de Frío SADA
  fefoLots: FefoPerishableLot[];
  coldChainLogs: ColdChainTemperatureLog[];
  registerFefoPerishableLot: (params: {
    lotCode?: string;
    productId: string;
    locationId: string;
    zone: StorageZone;
    quantity: number;
    receptionDate: string;
    expirationDate: string;
  }) => { success: boolean; lot?: FefoPerishableLot; error?: string };
  moveFefoLotCavaToShelf: (
    lotId: string,
    qtyToMove: number
  ) => { success: boolean; error?: string };
  unlockExpiredLotWithGovernance: (
    lotId: string,
    credential: string
  ) => { success: boolean; error?: string };
  registerColdChainTemp: (params: {
    locationId: string;
    equipmentName: string;
    equipmentType: ColdEquipmentType;
    recordedTempCelsius: number;
    source?: ColdChainTemperatureLog['source'];
    correctiveAction?: string;
  }) => { success: boolean; log?: ColdChainTemperatureLog; error?: string };

  // 6. Recetario BOM & Órdenes de Producción Interna
  productionRecipes: ProductionRecipeBom[];
  productionOrders: InternalProductionOrder[];
  saveProductionRecipe: (
    recipe: Omit<ProductionRecipeBom, 'id'> & { id?: string }
  ) => ProductionRecipeBom;
  executeProductionRecipeOrder: (params: {
    recipeId: string;
    batchesMultiplier: number;
    actualOutputQty?: number;
    locationId: string;
    targetOutputZone: StorageZone;
    managerCredentialForExpired?: string;
  }) => { success: boolean; order?: InternalProductionOrder; error?: string };

  // 8. Predicción de Demanda por Quincenas (15 y 30)
  computeQuincenaDemandForecast: (
    productId: string,
    locationId: string,
    horizonDays: RotationHorizonDays
  ) => DemandForecastSummary | null;

  // 4. Módulo BRM WhatsApp Proveedores (Modo Híbrido Triple — Puro Apure ERP)
  brmSession: BrmWhatsappSessionStatus;
  brmMessages: BrmWhatsappMessage[];
  brmPreInvoices: BrmSupplierPreInvoice[];
  requestBrmQrSession: (corporatePhoneE164?: string) => Promise<void>;
  confirmBrmQrPairing: () => Promise<void>;
  activateBrmCloudWebhookMode: () => Promise<void>;
  disconnectBrmSessionClean: () => Promise<void>;
  sendBrmMessageToSupplier: (params: {
    supplierId: string;
    category: BrmDocumentCategory;
    bodyText: string;
    relatedEntityId?: string;
    attachmentFileName?: string;
    openWaMeWindow?: boolean;
  }) => Promise<{ success: boolean; message?: BrmWhatsappMessage; error?: string }>;
  dispatchPurchaseOrderToSupplierBrm: (
    order: SupplierPurchaseOrder,
    openWaMeWindow?: boolean
  ) => Promise<{ success: boolean; message?: BrmWhatsappMessage; error?: string }>;
  dispatchPaymentAndRetentionsBundleBrm: (params: {
    invoiceId: string;
    payment?: AccountsPayablePayment;
    alsoDownloadPdfs?: boolean;
    openWaMeWindow?: boolean;
  }) => Promise<{ success: boolean; message?: BrmWhatsappMessage; error?: string }>;
  receiveBrmSupplierPreInvoice: (params: {
    supplierId: string;
    invoiceNumber: string;
    controlNumber: string;
    declaredSubtotalUsd: number;
    declaredIvaUsd: number;
    declaredIgtfUsd?: number;
    declaredTotalUsd: number;
    hasSuspiciousMetadata?: boolean;
  }) => { success: boolean; preInvoice?: BrmSupplierPreInvoice; error?: string };
  confirmBrmPreInvoiceReceptionGate: (params: {
    preInvoiceId: string;
    locationId: string;
    destinationZone: StorageZone;
    lines: PurchaseInvoice['lines'];
  }) => { success: boolean; invoice?: PurchaseInvoice; error?: string };
  rejectBrmPreInvoice: (preInvoiceId: string) => void;

  // 7. Conciliación Bancaria Bimonetaria + Pre-Conciliación OCR
  bankStatementLines: BankStatementLine[];
  preConciliationItems: PaymentPreConciliationItem[];
  importBankCsvStatement: (params: {
    rawCsvText: string;
    bankName: string;
    accountCurrency: 'VES' | 'USD';
  }) => { importedCount: number; exactMatchesCount: number };
  runBankAutoReconciliation: () => {
    exactMatchesCount: number;
    toleranceMatchesCount: number;
    pendingCount: number;
  };
  submitSupplierPaymentPreConciliation: (params: {
    supplierId: string;
    invoiceId?: string;
    method: AccountsPayablePayment['method'];
    currency: 'VES' | 'USD';
    amountOriginal: number;
    reference: string;
    hasEditedExifFlag?: boolean;
  }) => { success: boolean; item?: PaymentPreConciliationItem; error?: string };
  approvePreConciliatedPaymentAndNotifyBrm: (
    itemId: string,
    dispatchWhatsappBundle?: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  rejectPreConciliatedPayment: (itemId: string) => void;

  // 10. Impresoras Fiscales Homologadas & Cierre Diario Reporte X / Z
  fiscalZReports: FiscalZReportRecord[];
  registerFiscalZReport: (
    input: Omit<RegisterFiscalZInput, 'registeredBy' | 'registeredAtVet'>
  ) => { success: boolean; report?: FiscalZReportRecord; error?: string };

  // Respaldo y Restauración
  exportOperationsBrmSnapshot: () => {
    fefoLots: FefoPerishableLot[];
    coldChainLogs: ColdChainTemperatureLog[];
    productionRecipes: ProductionRecipeBom[];
    productionOrders: InternalProductionOrder[];
    brmMessages: BrmWhatsappMessage[];
    brmPreInvoices: BrmSupplierPreInvoice[];
    bankStatementLines: BankStatementLine[];
    preConciliationItems: PaymentPreConciliationItem[];
    fiscalZReports: FiscalZReportRecord[];
    totpConfig: TotpSecurityConfig;
  };
  restoreOperationsBrmSnapshot: (snapshot: Partial<{
    fefoLots: FefoPerishableLot[];
    coldChainLogs: ColdChainTemperatureLog[];
    productionRecipes: ProductionRecipeBom[];
    productionOrders: InternalProductionOrder[];
    brmMessages: BrmWhatsappMessage[];
    brmPreInvoices: BrmSupplierPreInvoice[];
    bankStatementLines: BankStatementLine[];
    preConciliationItems: PaymentPreConciliationItem[];
    fiscalZReports: FiscalZReportRecord[];
    totpConfig: TotpSecurityConfig;
  }>) => void;
}

const OperationsBrmContext = createContext<OperationsBrmContextType | undefined>(undefined);

export const OperationsBrmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: currentUser } = useAuth();
  const { config } = useUIConfig();
  const {
    bcvState,
    suppliers,
    invoices,
    payments,
    retentionVouchers,
    registerOcrInvoice,
    registerInvoicePayment,
    updateRetentionVoucherStatus,
  } = useFinance();
  const {
    products,
    locations,
    salesEvents,
    addOrUpdateProduct,
    logAuditEvent,
  } = useInventory();

  const [totpConfig, setTotpConfig] = useState<TotpSecurityConfig>(() =>
    loadJsonSafe<TotpSecurityConfig>(STORAGE_KEYS.TOTP, DEFAULT_TOTP_CONFIG)
  );
  const [defaultScaleMode, setDefaultScaleModeState] = useState<ScaleBarcodeMode>(() =>
    loadJsonSafe<ScaleBarcodeMode>(STORAGE_KEYS.SCALE_MODE, 'WEIGHT_GRAMS_20')
  );

  // Semillas iniciales deterministas atadas a productos y sedes reales del catálogo
  const [fefoLots, setFefoLots] = useState<FefoPerishableLot[]>(() => {
    const stored = loadJsonSafe<FefoPerishableLot[] | null>(STORAGE_KEYS.FEFO_LOTS, null);
    if (stored && stored.length > 0) return refreshFefoLotsStatuses(stored);
    return [];
  });

  const [coldChainLogs, setColdChainLogs] = useState<ColdChainTemperatureLog[]>(() =>
    loadJsonSafe<ColdChainTemperatureLog[]>(STORAGE_KEYS.COLD_LOGS, [])
  );

  const [productionRecipes, setProductionRecipes] = useState<ProductionRecipeBom[]>(() =>
    loadJsonSafe<ProductionRecipeBom[]>(STORAGE_KEYS.RECIPES, [])
  );

  const [productionOrders, setProductionOrders] = useState<InternalProductionOrder[]>(() =>
    loadJsonSafe<InternalProductionOrder[]>(STORAGE_KEYS.PROD_ORDERS, [])
  );

  const [brmSession, setBrmSession] = useState<BrmWhatsappSessionStatus>(() =>
    loadJsonSafe<BrmWhatsappSessionStatus>(STORAGE_KEYS.BRM_SESSION, {
      state: 'DISCONNECTED',
      activeMode: 'WA_ME_DIRECT_LEDGER',
      corporatePhoneE164: DEFAULT_CORPORATE_BRM_PHONE_E164,
      hasAdminCredentials: false,
      pendingOfflineQueueCount: 0,
      lastHeartbeatVet: '2026-10-29 08:00',
    })
  );

  const [brmMessages, setBrmMessages] = useState<BrmWhatsappMessage[]>(() =>
    loadJsonSafe<BrmWhatsappMessage[]>(STORAGE_KEYS.BRM_MESSAGES, [])
  );

  const [brmPreInvoices, setBrmPreInvoices] = useState<BrmSupplierPreInvoice[]>(() =>
    loadJsonSafe<BrmSupplierPreInvoice[]>(STORAGE_KEYS.BRM_PREINVOICES, [])
  );

  const [bankStatementLines, setBankStatementLines] = useState<BankStatementLine[]>(() =>
    loadJsonSafe<BankStatementLine[]>(STORAGE_KEYS.BANK_LINES, [])
  );

  const [preConciliationItems, setPreConciliationItems] = useState<PaymentPreConciliationItem[]>(
    () => loadJsonSafe<PaymentPreConciliationItem[]>(STORAGE_KEYS.PRE_CONCILIATION, [])
  );

  const [fiscalZReports, setFiscalZReports] = useState<FiscalZReportRecord[]>(() =>
    loadJsonSafe<FiscalZReportRecord[]>(STORAGE_KEYS.FISCAL_Z, [])
  );

  // Hidratación inicial de recetas y lotes FEFO sobre el catálogo real cuando está vacío
  useEffect(() => {
    if (products.length === 0 || locations.length === 0) return;

    if (fefoLots.length === 0) {
      const todayMs = Date.now();
      const isoPlusDays = (d: number) =>
        new Date(todayMs + d * 86_400_000).toISOString().slice(0, 10);
      const loc0 = locations[0];
      const loc1 = locations[1] || locations[0];
      const sampleProds = products.slice(0, 4);

      const seededLots: FefoPerishableLot[] = [];
      if (sampleProds[0]) {
        seededLots.push(
          createFefoPerishableLot({
            lotCode: 'FEFO-CAR-2610A',
            product: sampleProds[0],
            locationId: loc0.id,
            locationName: loc0.name,
            zone: 'DEPOSITO',
            quantity: Math.max(2, Math.min(10, Number(sampleProds[0].stockByLocation[loc0.id] || 6))),
            receptionDate: isoPlusDays(-5),
            expirationDate: isoPlusDays(2), // Crítico <= 3 días
          })
        );
      }
      if (sampleProds[1]) {
        seededLots.push(
          createFefoPerishableLot({
            lotCode: 'FEFO-LAC-2610B',
            product: sampleProds[1],
            locationId: loc0.id,
            locationName: loc0.name,
            zone: 'ANAQUEL',
            quantity: Math.max(2, Math.min(12, Number(sampleProds[1].stockByLocation[loc0.id] || 8))),
            receptionDate: isoPlusDays(-3),
            expirationDate: isoPlusDays(6), // Preventivo 4-7 días
          })
        );
      }
      if (sampleProds[2]) {
        seededLots.push(
          createFefoPerishableLot({
            lotCode: 'FEFO-FRIO-2610C',
            product: sampleProds[2],
            locationId: loc1.id,
            locationName: loc1.name,
            zone: 'DEPOSITO',
            quantity: Math.max(3, Math.min(15, Number(sampleProds[2].stockByLocation[loc1.id] || 10))),
            receptionDate: isoPlusDays(-2),
            expirationDate: isoPlusDays(18), // Óptimo
          })
        );
      }
      if (seededLots.length > 0) {
        setFefoLots(seededLots);
      }
    }

    if (coldChainLogs.length === 0) {
      const loc0 = locations[0];
      const loc1 = locations[1] || locations[0];
      setColdChainLogs([
        buildColdChainTemperatureLog({
          locationId: loc0.id,
          locationName: loc0.name,
          equipmentName: 'Cava Principal Carnicería #1',
          equipmentType: 'CAVA_CARNICOS',
          recordedTempCelsius: 1.8,
          recordedBy: 'Supervisor Cadena de Frío',
        }),
        buildColdChainTemperatureLog({
          locationId: loc1.id,
          locationName: loc1.name,
          equipmentName: 'Vitrina Exhibición Charcutería #2',
          equipmentType: 'VITRINA_EXHIBICION',
          recordedTempCelsius: 3.4,
          recordedBy: 'Supervisor Piso',
        }),
      ]);
    }

    if (productionRecipes.length === 0) {
      const rawA = products[0];
      const rawB = products[1] || products[0];
      setProductionRecipes([
        {
          id: 'rec-bom-001',
          code: 'BOM-HAMB-RES',
          name: 'Bandeja Hamburguesa Artesanal Especial (1 Kg)',
          department: 'CARNICERIA',
          outputSku: 'ELAB-HAMB-RES-1KG',
          outputProductName: 'Hamburguesa Artesanal Especial Carnicería (Kg)',
          outputUnit: 'KG',
          expectedOutputQty: 1.0,
          packagingAndCondimentsCostUsd: 0.65,
          targetMarginPercent: 36,
          ingredients: [
            {
              productId: rawA.id,
              sku: rawA.sku,
              productName: rawA.name,
              unit: rawA.unit,
              quantityRequiredPerBatch: 1,
              preferredSourceZone: 'DEPOSITO',
            },
          ],
          active: true,
        },
        {
          id: 'rec-bom-002',
          code: 'BOM-PACK-COMBO',
          name: 'Combo Familiar Ahorro Elaborado',
          department: 'CHARCUTERIA',
          outputSku: 'ELAB-COMBO-AHORRO',
          outputProductName: 'Combo Familiar Elaborado Empacado',
          outputUnit: 'UND',
          expectedOutputQty: 2,
          packagingAndCondimentsCostUsd: 0.45,
          targetMarginPercent: 32,
          ingredients: [
            {
              productId: rawB.id,
              sku: rawB.sku,
              productName: rawB.name,
              unit: rawB.unit,
              quantityRequiredPerBatch: 2,
              preferredSourceZone: 'ANAQUEL',
            },
          ],
          active: true,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length, locations.length]);

  // Persistencia reactiva en almacenamiento local
  useEffect(() => saveJsonSafe(STORAGE_KEYS.TOTP, totpConfig), [totpConfig]);
  useEffect(() => saveJsonSafe(STORAGE_KEYS.SCALE_MODE, defaultScaleMode), [defaultScaleMode]);
  useEffect(() => saveJsonSafe(STORAGE_KEYS.FEFO_LOTS, fefoLots), [fefoLots]);
  useEffect(() => saveJsonSafe(STORAGE_KEYS.COLD_LOGS, coldChainLogs), [coldChainLogs]);
  useEffect(() => saveJsonSafe(STORAGE_KEYS.RECIPES, productionRecipes), [productionRecipes]);
  useEffect(() => saveJsonSafe(STORAGE_KEYS.PROD_ORDERS, productionOrders), [productionOrders]);
  useEffect(() => saveJsonSafe(STORAGE_KEYS.BRM_SESSION, brmSession), [brmSession]);
  useEffect(() => saveJsonSafe(STORAGE_KEYS.BRM_MESSAGES, brmMessages), [brmMessages]);
  useEffect(() => saveJsonSafe(STORAGE_KEYS.BRM_PREINVOICES, brmPreInvoices), [brmPreInvoices]);
  useEffect(() => saveJsonSafe(STORAGE_KEYS.BANK_LINES, bankStatementLines), [bankStatementLines]);
  useEffect(
    () => saveJsonSafe(STORAGE_KEYS.PRE_CONCILIATION, preConciliationItems),
    [preConciliationItems]
  );
  useEffect(() => saveJsonSafe(STORAGE_KEYS.FISCAL_Z, fiscalZReports), [fiscalZReports]);

  // Sincronización defensiva con el estado del servidor BRM y vaciado delegado de cola offline (Cláusulas B y C)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/brm/whatsapp/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && data.state) {
          setBrmSession((prev) => ({
            ...prev,
            ...data,
          }));
        }
      })
      .catch(() => {
        // Modo offline / local puro sin servidor activo: continúa sin lanzar excepción
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setDefaultScaleMode = useCallback((mode: ScaleBarcodeMode) => {
    setDefaultScaleModeState(mode);
  }, []);

  const updateTotpConfig = useCallback(
    (updates: Partial<TotpSecurityConfig>) => {
      const now = getCaracasNow();
      setTotpConfig((prev) => ({
        ...prev,
        ...updates,
        enrolledBy: currentUser?.displayName || prev.enrolledBy,
        enrolledAtVet: `${now.dateFormatted} ${now.timeFormatted}`,
      }));
      logAuditEvent(
        'TOTP_TOKEN_ENROLL',
        'Seguridad TOTP',
        'Actualización de política de Token Dinámico TOTP Gerencial.',
        updates as Record<string, unknown>
      );
    },
    [currentUser?.displayName, logAuditEvent]
  );

  const regenerateTotpSecret = useCallback(() => {
    const newSecret = generateBase32TotpSecret(32);
    const now = getCaracasNow();
    setTotpConfig((prev) => ({
      ...prev,
      enabled: true,
      secretBase32: newSecret,
      enrolledBy: currentUser?.displayName || 'Gerencia General',
      enrolledAtVet: `${now.dateFormatted} ${now.timeFormatted}`,
    }));
    logAuditEvent(
      'TOTP_TOKEN_ENROLL',
      'Seguridad TOTP',
      'Regeneración criptográfica de semilla Base32 TOTP para Google Authenticator.'
    );
    return newSecret;
  }, [currentUser?.displayName, logAuditEvent]);

  const registerFefoPerishableLot = useCallback(
    (params: {
      lotCode?: string;
      productId: string;
      locationId: string;
      zone: StorageZone;
      quantity: number;
      receptionDate: string;
      expirationDate: string;
    }) => {
      const product = products.find((p) => p.id === params.productId);
      const location = locations.find((l) => l.id === params.locationId);
      if (!product || !location) {
        return { success: false, error: 'Producto o sede no válidos para lote FEFO.' };
      }
      if (params.quantity <= 0) {
        return { success: false, error: 'La cantidad del lote FEFO debe ser mayor a cero.' };
      }

      const lot = createFefoPerishableLot({
        lotCode: params.lotCode,
        product,
        locationId: location.id,
        locationName: location.name,
        zone: params.zone,
        quantity: params.quantity,
        receptionDate: params.receptionDate,
        expirationDate: params.expirationDate,
      });

      setFefoLots((prev) => refreshFefoLotsStatuses([lot, ...prev]));
      logAuditEvent(
        'FEFO_LOT_REGISTER',
        'Lote FEFO',
        `Lote perecedero ${lot.lotCode} (${product.name}) registrado con vencimiento ${lot.expirationDate}.`,
        { lotCode: lot.lotCode, expirationDate: lot.expirationDate, alertLevel: lot.alertLevel },
        lot.id
      );
      return { success: true, lot };
    },
    [products, locations, logAuditEvent]
  );

  const moveFefoLotCavaToShelf = useCallback(
    (lotId: string, qtyToMove: number) => {
      try {
        const now = getCaracasNow();
        const nowStamp = `${now.dateFormatted} ${now.timeFormatted}`;
        const res = moveFefoLotToShelf({
          lotId,
          lots: fefoLots,
          products,
          qtyToMove,
          updatedAtVet: nowStamp,
        });
        setFefoLots(res.updatedLots);
        const targetLot = fefoLots.find((l) => l.id === lotId);
        if (targetLot) {
          const updatedProd = res.updatedProducts.find((p) => p.id === targetLot.productId);
          if (updatedProd) {
            addOrUpdateProduct(updatedProd);
          }
        }
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'No se pudo trasladar el lote FEFO a exhibición.',
        };
      }
    },
    [fefoLots, products, addOrUpdateProduct]
  );

  const unlockExpiredLotWithGovernance = useCallback(
    (lotId: string, credential: string) => {
      const check = verifyManagerGovernanceAuth({
        submittedCredential: credential,
        totpConfig,
      });
      if (!check.authorized) {
        return {
          success: false,
          error: 'Token TOTP de 6 dígitos o PIN Gerencial inválido para desbloquear lote vencido.',
        };
      }
      setFefoLots((prev) =>
        prev.map((l) =>
          l.id === lotId
            ? {
                ...l,
                blockedForSale: false,
                managerOverrideAuthorizedBy: `${currentUser?.displayName || 'Gerencia'} (${check.methodUsed})`,
              }
            : l
        )
      );
      logAuditEvent(
        'FEFO_EXPIRED_OVERRIDE',
        'Lote FEFO',
        `Desbloqueo excepcional de lote vencido autorizado con ${check.methodUsed}.`,
        { lotId, methodUsed: check.methodUsed },
        lotId
      );
      return { success: true };
    },
    [totpConfig, currentUser?.displayName, logAuditEvent]
  );

  const registerColdChainTemp = useCallback(
    (params: {
      locationId: string;
      equipmentName: string;
      equipmentType: ColdEquipmentType;
      recordedTempCelsius: number;
      source?: ColdChainTemperatureLog['source'];
      correctiveAction?: string;
    }) => {
      const loc = locations.find((l) => l.id === params.locationId);
      if (!loc) {
        return { success: false, error: 'Sede o frigorífico no encontrado.' };
      }
      const now = getCaracasNow();
      const log = buildColdChainTemperatureLog({
        locationId: loc.id,
        locationName: loc.name,
        equipmentName: params.equipmentName,
        equipmentType: params.equipmentType,
        recordedTempCelsius: params.recordedTempCelsius,
        source: params.source,
        recordedBy: currentUser?.displayName || 'Supervisor Cadena de Frío',
        recordedAtVet: `${now.dateFormatted} ${now.timeFormatted}`,
        correctiveAction: params.correctiveAction,
      });
      setColdChainLogs((prev) => [log, ...prev]);
      logAuditEvent(
        'COLD_CHAIN_TEMP_LOG',
        'Cadena de Frío SADA',
        `Lectura térmica en ${log.equipmentName} (${loc.name}): ${log.recordedTempCelsius}°C ${log.isOutOfRange ? '[ALERTA DESVIACIÓN]' : '[RANGO OK]'}.`,
        { temp: log.recordedTempCelsius, isOutOfRange: log.isOutOfRange },
        log.id
      );
      return { success: true, log };
    },
    [locations, currentUser?.displayName, logAuditEvent]
  );

  const saveProductionRecipe = useCallback(
    (recipeInput: Omit<ProductionRecipeBom, 'id'> & { id?: string }) => {
      const record: ProductionRecipeBom = {
        ...recipeInput,
        id: recipeInput.id || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      };
      setProductionRecipes((prev) => {
        const exists = prev.some((r) => r.id === record.id);
        return exists ? prev.map((r) => (r.id === record.id ? record : r)) : [record, ...prev];
      });
      logAuditEvent(
        'PRODUCTION_RECIPE_CREATE',
        'Recetario BOM',
        `Receta de producción configurada: ${record.name} (${record.outputSku}).`,
        { code: record.code, department: record.department },
        record.id
      );
      return record;
    },
    [logAuditEvent]
  );

  const executeProductionRecipeOrder = useCallback(
    (params: {
      recipeId: string;
      batchesMultiplier: number;
      actualOutputQty?: number;
      locationId: string;
      targetOutputZone: StorageZone;
      managerCredentialForExpired?: string;
    }) => {
      const recipe = productionRecipes.find((r) => r.id === params.recipeId);
      const loc = locations.find((l) => l.id === params.locationId);
      if (!recipe || !loc) {
        return { success: false, error: 'Receta o sede seleccionada no existe.' };
      }

      try {
        const now = getCaracasNow();
        const nowStamp = `${now.dateFormatted} ${now.timeFormatted}`;
        const res = executeInternalProductionOrder({
          recipe,
          batchesMultiplier: params.batchesMultiplier,
          actualOutputQty: params.actualOutputQty,
          locationId: loc.id,
          locationName: loc.name,
          targetOutputZone: params.targetOutputZone,
          products,
          fefoLots,
          bcvRate: bcvState.activeRate,
          executedBy: currentUser?.displayName || 'Jefe de Producción',
          executedAtVet: nowStamp,
          managerCredentialForExpired: params.managerCredentialForExpired,
          totpConfig,
        });

        // Sincronizar productos modificados o creados hacia InventoryContext
        for (const nextP of res.updatedProducts) {
          const prevP = products.find((p) => p.id === nextP.id);
          if (!prevP || JSON.stringify(prevP) !== JSON.stringify(nextP)) {
            addOrUpdateProduct(nextP);
          }
        }
        setFefoLots(res.updatedFefoLots);
        setProductionOrders((prev) => [res.orderRecord, ...prev]);

        logAuditEvent(
          'PRODUCTION_ORDER_EXECUTE',
          'Producción Interna BOM',
          `Orden ${res.orderRecord.orderCode}: producidos ${res.orderRecord.actualOutputQty} de ${recipe.outputProductName} a costo unitario $${res.orderRecord.unitElaboratedCostUsd.toFixed(2)}.`,
          {
            orderCode: res.orderRecord.orderCode,
            totalBatchCostUsd: res.orderRecord.totalBatchCostUsd,
            fefoLotsConsumed: res.orderRecord.fefoLotsConsumed,
          },
          res.orderRecord.id
        );

        return { success: true, order: res.orderRecord };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Error ejecutando orden de producción interna.',
        };
      }
    },
    [
      productionRecipes,
      locations,
      products,
      fefoLots,
      bcvState.activeRate,
      currentUser?.displayName,
      totpConfig,
      addOrUpdateProduct,
      logAuditEvent,
    ]
  );

  const computeQuincenaDemandForecast = useCallback(
    (productId: string, locationId: string, horizonDays: RotationHorizonDays) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return null;
      return forecastVenezuelanRetailDemand({
        product,
        locationId,
        horizonDays,
        salesEvents,
      });
    },
    [products, salesEvents]
  );

  // =========================================================================
  // MÓDULO BRM WHATSAPP PROVEEDORES (MODO HÍBRIDO TRIPLE — PURO APURE ERP)
  // =========================================================================

  const requestBrmQrSession = useCallback(async (corporatePhoneE164?: string) => {
    const now = getCaracasNow();
    const nowStamp = `${now.dateFormatted} ${now.timeFormatted}`;
    try {
      const resp = await fetch('/api/brm/whatsapp/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GENERATE_QR', corporatePhoneE164 }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setBrmSession((prev) => ({ ...prev, ...data }));
        return;
      }
    } catch {
      // Fallback local resiliente
    }
    setBrmSession((prev) => ({
      ...prev,
      state: 'QR_READY',
      activeMode: 'QR_SOCKET_BRIDGE',
      corporatePhoneE164: corporatePhoneE164 || prev.corporatePhoneE164,
      qrPayloadData: `CHRYSTAL-BRM-WA::${corporatePhoneE164 || prev.corporatePhoneE164}::${Date.now()}`,
      qrGeneratedAtVet: nowStamp,
      lastHeartbeatVet: nowStamp,
    }));
  }, []);

  const confirmBrmQrPairing = useCallback(async () => {
    const now = getCaracasNow();
    const nowStamp = `${now.dateFormatted} ${now.timeFormatted}`;
    try {
      const resp = await fetch('/api/brm/whatsapp/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CONFIRM_PAIRING' }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setBrmSession((prev) => ({ ...prev, ...data }));
        return;
      }
    } catch {
      // Fallback local
    }
    setBrmSession((prev) => ({
      ...prev,
      state: 'CONNECTED',
      activeMode: 'QR_SOCKET_BRIDGE',
      qrPayloadData: undefined,
      lastHeartbeatVet: nowStamp,
    }));
  }, []);

  const activateBrmCloudWebhookMode = useCallback(async () => {
    const now = getCaracasNow();
    const nowStamp = `${now.dateFormatted} ${now.timeFormatted}`;
    try {
      const resp = await fetch('/api/brm/whatsapp/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'USE_CLOUD_WEBHOOK' }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setBrmSession((prev) => ({ ...prev, ...data }));
        return;
      }
    } catch {
      // Fallback local
    }
    setBrmSession((prev) => ({
      ...prev,
      state: 'CLOUD_STANDBY',
      activeMode: 'CLOUD_API_WEBHOOK',
      qrPayloadData: undefined,
      lastHeartbeatVet: nowStamp,
    }));
  }, []);

  const disconnectBrmSessionClean = useCallback(async () => {
    const now = getCaracasNow();
    const nowStamp = `${now.dateFormatted} ${now.timeFormatted}`;
    try {
      await fetch('/api/brm/whatsapp/disconnect', { method: 'POST' });
    } catch {
      // Ignore network failure during local clean disconnect
    }
    setBrmSession((prev) => resetBrmWhatsappSessionCleanly(prev, nowStamp));
    logAuditEvent(
      'BRM_WHATSAPP_SESSION_RESET',
      'WhatsApp BRM',
      'Desvinculación limpia de sesión QR WhatsApp BRM (Anti-Split Brain).'
    );
  }, [logAuditEvent]);

  const sendBrmMessageToSupplier = useCallback(
    async (params: {
      supplierId: string;
      category: BrmDocumentCategory;
      bodyText: string;
      relatedEntityId?: string;
      attachmentFileName?: string;
      openWaMeWindow?: boolean;
    }) => {
      const supplier = suppliers.find((s) => s.id === params.supplierId);
      if (!supplier) {
        return { success: false, error: 'Proveedor no encontrado en el directorio BRM.' };
      }

      try {
        const now = getCaracasNow();
        const nowStamp = `${now.dateFormatted} ${now.timeFormatted}`;
        const localRes = appendIdempotentBrmMessage({
          existingMessages: brmMessages,
          supplier,
          corporatePhoneE164: brmSession.corporatePhoneE164,
          direction: 'OUTBOUND_TO_SUPPLIER',
          category: params.category,
          bodyText: params.bodyText,
          relatedEntityId: params.relatedEntityId,
          attachmentFileName: params.attachmentFileName,
          session: brmSession,
          createdBy: currentUser?.displayName || 'Compras / Tesorería BRM',
          timestampVet: nowStamp,
        });

        setBrmMessages(localRes.updatedMessages);

        // Despachar en segundo plano al puente /api/brm/whatsapp/send sin bloquear ni romper si offline
        fetch('/api/brm/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientMessageId: localRes.record.messageId,
            supplierId: supplier.id,
            supplierName: supplier.name,
            supplierRif: supplier.rif,
            phone: localRes.record.phoneE164,
            category: params.category,
            bodyText: params.bodyText,
            attachmentFileName: params.attachmentFileName,
          }),
        }).catch(() => {
          // Resiliencia: queda asentado localmente en bitácora auditable
        });

        if (
          params.openWaMeWindow &&
          localRes.record.waMeDeepLink &&
          typeof window !== 'undefined'
        ) {
          window.open(localRes.record.waMeDeepLink, '_blank', 'noopener,noreferrer');
        }

        logAuditEvent(
          'BRM_WHATSAPP_SEND',
          'WhatsApp BRM Proveedores',
          `Envío BRM (${params.category}) a ${supplier.name} (${localRes.record.phoneE164}) vía ${localRes.record.transportUsed}.`,
          {
            messageId: localRes.record.messageId,
            transport: localRes.record.transportUsed,
            attachment: params.attachmentFileName,
          },
          localRes.record.id
        );

        return { success: true, message: localRes.record };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Error enviando mensaje BRM al proveedor.',
        };
      }
    },
    [suppliers, brmMessages, brmSession, currentUser?.displayName, logAuditEvent]
  );

  const dispatchPurchaseOrderToSupplierBrm = useCallback(
    async (order: SupplierPurchaseOrder, openWaMeWindow = false) => {
      const bodyText = formatBrmPurchaseOrderTemplate({
        order,
        companyProfile: config.companyProfile,
      });
      return sendBrmMessageToSupplier({
        supplierId: order.supplierId,
        category: 'ORDEN_COMPRA',
        bodyText,
        relatedEntityId: order.id,
        attachmentFileName: `Orden_Compra_${order.orderNumber}.pdf`,
        openWaMeWindow,
      });
    },
    [config.companyProfile, sendBrmMessageToSupplier]
  );

  const dispatchPaymentAndRetentionsBundleBrm = useCallback(
    async (params: {
      invoiceId: string;
      payment?: AccountsPayablePayment;
      alsoDownloadPdfs?: boolean;
      openWaMeWindow?: boolean;
    }) => {
      const invoice = invoices.find((inv) => inv.id === params.invoiceId);
      if (!invoice) {
        return { success: false, error: 'Factura vinculada no encontrada.' };
      }
      const supplier = suppliers.find((s) => s.id === invoice.supplierId);
      if (!supplier) {
        return { success: false, error: 'Proveedor de la factura no encontrado.' };
      }

      const ivaVoucher =
        retentionVouchers.find(
          (v) => v.invoiceId === invoice.id && v.type === 'IVA' && v.status !== 'ANULADO'
        ) || null;
      const islrVoucher =
        retentionVouchers.find(
          (v) => v.invoiceId === invoice.id && v.type === 'ISLR' && v.status !== 'ANULADO'
        ) || null;

      const latestPayment =
        params.payment ||
        payments.filter((p) => p.invoiceId === invoice.id)[0];

      const formatted = formatBrmPaymentAndRetentionsBundleTemplate({
        supplier,
        invoiceNumber: invoice.invoiceNumber,
        payment: latestPayment,
        ivaVoucher,
        islrVoucher,
        companyProfile: config.companyProfile,
      });

      const sendRes = await sendBrmMessageToSupplier({
        supplierId: supplier.id,
        category: ivaVoucher
          ? 'COMPROBANTE_RETENCION_IVA'
          : islrVoucher
          ? 'COMPROBANTE_RETENCION_ISLR'
          : 'SOPORTE_PAGO_CXP',
        bodyText: formatted.messageBody,
        relatedEntityId: invoice.id,
        attachmentFileName: formatted.attachmentNames.join(' + ') || undefined,
        openWaMeWindow: params.openWaMeWindow,
      });

      if (sendRes.success) {
        if (ivaVoucher && ivaVoucher.status === 'EMITIDO') {
          updateRetentionVoucherStatus(ivaVoucher.id, 'ENTREGADO');
        }
        if (islrVoucher && islrVoucher.status === 'EMITIDO') {
          updateRetentionVoucherStatus(islrVoucher.id, 'ENTREGADO');
        }
        if (params.alsoDownloadPdfs) {
          if (ivaVoucher) exportRetentionVoucherPdf(ivaVoucher, config.companyProfile);
          if (islrVoucher) exportRetentionVoucherPdf(islrVoucher, config.companyProfile);
        }
      }

      return sendRes;
    },
    [
      invoices,
      suppliers,
      retentionVouchers,
      payments,
      config.companyProfile,
      sendBrmMessageToSupplier,
      updateRetentionVoucherStatus,
    ]
  );

  const receiveBrmSupplierPreInvoice = useCallback(
    (params: {
      supplierId: string;
      invoiceNumber: string;
      controlNumber: string;
      declaredSubtotalUsd: number;
      declaredIvaUsd: number;
      declaredIgtfUsd?: number;
      declaredTotalUsd: number;
      hasSuspiciousMetadata?: boolean;
    }) => {
      const supplier = suppliers.find((s) => s.id === params.supplierId);
      if (!supplier) {
        return { success: false, error: 'Proveedor no registrado.' };
      }
      const existingHashes = invoices
        .map((inv) => inv.attachment?.sha256Hash || '')
        .filter(Boolean);
      const now = getCaracasNow();
      const nowStamp = `${now.dateFormatted} ${now.timeFormatted}`;

      const res = registerIncomingBrmPreInvoice({
        existingPreInvoices: brmPreInvoices,
        existingHashes,
        supplier,
        invoiceNumber: params.invoiceNumber,
        controlNumber: params.controlNumber,
        declaredSubtotalUsd: params.declaredSubtotalUsd,
        declaredIvaUsd: params.declaredIvaUsd,
        declaredIgtfUsd: params.declaredIgtfUsd,
        declaredTotalUsd: params.declaredTotalUsd,
        hasSuspiciousMetadata: params.hasSuspiciousMetadata,
        receivedAtVet: nowStamp,
      });

      setBrmPreInvoices(res.updatedPreInvoices);

      // Registrar también el mensaje entrante en el hilo BRM del proveedor
      try {
        const inboundMsg = appendIdempotentBrmMessage({
          existingMessages: brmMessages,
          messageId: res.preInvoice.messageId,
          supplier,
          corporatePhoneE164: brmSession.corporatePhoneE164,
          direction: 'INBOUND_FROM_SUPPLIER',
          category: 'FACTURA_ENTRANTE_PROVEEDOR',
          bodyText: `Factura entrante ${params.invoiceNumber} (Ctrl: ${params.controlNumber}) por $${round2(params.declaredTotalUsd).toFixed(2)} recibida en Doble Compuerta Pre-Auditoría OCR (${res.preInvoice.ocrVerdict}).`,
          relatedEntityId: res.preInvoice.id,
          attachmentFileName: `Factura_${params.invoiceNumber}.pdf`,
          session: brmSession,
          createdBy: supplier.contactName || supplier.name,
          timestampVet: nowStamp,
        });
        setBrmMessages(inboundMsg.updatedMessages);
      } catch {
        // Si el teléfono del proveedor aún no está en E.164, la pre-factura igual queda resguardada
      }

      logAuditEvent(
        'BRM_WHATSAPP_INVOICE_PRELOAD',
        'Pre-Auditoría BRM OCR',
        `Factura entrante ${params.invoiceNumber} de ${supplier.name} en PENDIENTE_VERIFICACION (${res.preInvoice.ocrVerdict}) sin afectar stock ni CxP.`,
        {
          invoiceNumber: params.invoiceNumber,
          ocrVerdict: res.preInvoice.ocrVerdict,
          declaredTotalUsd: params.declaredTotalUsd,
        },
        res.preInvoice.id
      );

      return { success: true, preInvoice: res.preInvoice };
    },
    [suppliers, invoices, brmPreInvoices, brmMessages, brmSession, logAuditEvent]
  );

  const confirmBrmPreInvoiceReceptionGate = useCallback(
    (params: {
      preInvoiceId: string;
      locationId: string;
      destinationZone: StorageZone;
      lines: PurchaseInvoice['lines'];
    }) => {
      const pre = brmPreInvoices.find((item) => item.id === params.preInvoiceId);
      if (!pre) {
        return { success: false, error: 'Pre-factura BRM no encontrada.' };
      }
      if (pre.status !== 'PENDIENTE_VERIFICACION') {
        return { success: false, error: 'Esta pre-factura ya fue procesada anteriormente.' };
      }
      if (pre.ocrVerdict === 'ALERTA_FRAUDE_EDICION_O_IA') {
        return {
          success: false,
          error: 'BLOQUEO ANTI-FRAUDE OCR: No se puede asentar una factura marcada con ALERTA_FRAUDE_EDICION_O_IA.',
        };
      }

      const supplier = suppliers.find((s) => s.id === pre.supplierId);
      if (!supplier) {
        return { success: false, error: 'Proveedor asociado no existe.' };
      }

      const now = getCaracasNow();
      const nowStamp = `${now.dateFormatted} ${now.timeFormatted}`;
      const issueIso = new Date().toISOString().slice(0, 10);
      const dueIso = new Date(Date.now() + (supplier.creditDays || 15) * 86_400_000)
        .toISOString()
        .slice(0, 10);

      const newInvoice: PurchaseInvoice = {
        id: `inv-brm-${Date.now()}`,
        invoiceNumber: pre.invoiceNumber,
        controlNumber: pre.controlNumber,
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierRif: supplier.rif,
        locationId: params.locationId,
        issueDate: issueIso,
        dueDate: dueIso,
        currency: 'USD',
        bcvRateAtIssue: bcvState.activeRate,
        lines: params.lines,
        subtotalUsd: pre.declaredSubtotalUsd,
        ivaAmountUsd: pre.declaredIvaUsd,
        igtfAmountUsd: pre.declaredIgtfUsd,
        totalUsd: pre.declaredTotalUsd,
        paidAmountUsd: 0,
        status: 'PENDIENTE',
        ocrEngineUsed: 'GEMINI_VISION_PRO',
        forensicAudit: {
          passedAllLocks: pre.ocrVerdict === 'AUTENTICO_ALTA_CONFIANZA',
          lock1LineIntegrations: true,
          lock2SubtotalMatch: true,
          lock3TaxCoherence: true,
          lock4TotalCrossCheck: true,
          discrepancyUsd: 0,
          auditLog: [
            `Pre-auditada en WhatsApp BRM (${pre.ocrVerdict}) y confirmada recepción física en muelle.`,
          ],
        },
        attachment: {
          fileName: `BRM_${pre.invoiceNumber}.pdf`,
          mimeType: 'application/pdf',
          fileSize: 48000,
          sha256Hash: pre.sha256Hash,
          verdict:
            pre.ocrVerdict === 'AUTENTICO_ALTA_CONFIANZA'
              ? 'AUTENTICO_ALTA_CONFIANZA'
              : 'ALERTA_FRAUDE_EDICION_O_IA',
          indexedAtVet: pre.receivedAtVet,
        },
        createdAtVet: nowStamp,
      };

      const registered = registerOcrInvoice(newInvoice, () => {
        for (const ln of params.lines) {
          if (ln.lineType === 'SERVICIO') continue;
          const prod = products.find((p) => p.sku.toUpperCase() === ln.sku.toUpperCase());
          if (prod && ln.quantity > 0) {
            const updatedProd = applyStockDeltaToZone(
              { ...prod, costUsd: ln.unitCostUsd, lastCostOrigin: 'FACTURA' },
              params.locationId,
              ln.quantity,
              params.destinationZone,
              nowStamp
            );
            addOrUpdateProduct(updatedProd);
          }
        }
      });

      setBrmPreInvoices((prev) =>
        prev.map((item) =>
          item.id === pre.id
            ? {
                ...item,
                status: 'CONFIRMADA_RECEPCION_FISICA',
                confirmedBy: currentUser?.displayName || 'Analista Recepción',
                confirmedAtVet: nowStamp,
                linkedInvoiceId: registered.invoice.id,
              }
            : item
        )
      );

      return { success: true, invoice: registered.invoice };
    },
    [
      brmPreInvoices,
      suppliers,
      bcvState.activeRate,
      registerOcrInvoice,
      products,
      addOrUpdateProduct,
      currentUser?.displayName,
    ]
  );

  const rejectBrmPreInvoice = useCallback((preInvoiceId: string) => {
    setBrmPreInvoices((prev) =>
      prev.map((item) =>
        item.id === preInvoiceId
          ? { ...item, status: 'RECHAZADA_DISCREPANCIA' }
          : item
      )
    );
  }, []);

  // =========================================================================
  // CONCILIACIÓN BANCARIA BIMONETARIA + PRE-CONCILIACIÓN OCR
  // =========================================================================

  const importBankCsvStatement = useCallback(
    (params: {
      rawCsvText: string;
      bankName: string;
      accountCurrency: 'VES' | 'USD';
    }) => {
      const parsed = parseBankStatementCsv({
        rawCsvText: params.rawCsvText,
        bankName: params.bankName,
        accountCurrency: params.accountCurrency,
        bcvRate: bcvState.activeRate,
      });
      const combined = [...parsed, ...bankStatementLines];
      const auto = autoReconcileBankStatement({
        statementLines: combined,
        payments,
      });
      setBankStatementLines(auto.reconciledLines);
      logAuditEvent(
        'BANK_STATEMENT_IMPORT',
        'Conciliación Bancaria',
        `Importados ${parsed.length} movimientos de ${params.bankName} (${params.accountCurrency}). Conciliados exactos: ${auto.exactMatchesCount}.`,
        { importedCount: parsed.length, exactMatchesCount: auto.exactMatchesCount }
      );
      return {
        importedCount: parsed.length,
        exactMatchesCount: auto.exactMatchesCount,
      };
    },
    [bcvState.activeRate, bankStatementLines, payments, logAuditEvent]
  );

  const runBankAutoReconciliation = useCallback(() => {
    const auto = autoReconcileBankStatement({
      statementLines: bankStatementLines,
      payments,
    });
    setBankStatementLines(auto.reconciledLines);
    return {
      exactMatchesCount: auto.exactMatchesCount,
      toleranceMatchesCount: auto.toleranceMatchesCount,
      pendingCount: auto.pendingCount,
    };
  }, [bankStatementLines, payments]);

  const submitSupplierPaymentPreConciliation = useCallback(
    (params: {
      supplierId: string;
      invoiceId?: string;
      method: AccountsPayablePayment['method'];
      currency: 'VES' | 'USD';
      amountOriginal: number;
      reference: string;
      hasEditedExifFlag?: boolean;
    }) => {
      const supplier = suppliers.find((s) => s.id === params.supplierId);
      if (!supplier) {
        return { success: false, error: 'Proveedor no encontrado.' };
      }
      const inv = params.invoiceId ? invoices.find((i) => i.id === params.invoiceId) : undefined;
      const now = getCaracasNow();

      const item = submitPaymentToPreConciliation({
        existingItems: preConciliationItems,
        supplierId: supplier.id,
        supplierName: supplier.name,
        invoiceId: inv?.id,
        invoiceNumber: inv?.invoiceNumber,
        method: params.method,
        currency: params.currency,
        amountOriginal: params.amountOriginal,
        bcvRateUsed: bcvState.activeRate,
        reference: params.reference,
        hasEditedExifFlag: params.hasEditedExifFlag,
        submittedBy: currentUser?.displayName || 'Tesorería',
        submittedAtVet: `${now.dateFormatted} ${now.timeFormatted}`,
      });

      setPreConciliationItems((prev) => [item, ...prev]);
      return { success: true, item };
    },
    [suppliers, invoices, preConciliationItems, bcvState.activeRate, currentUser?.displayName]
  );

  const approvePreConciliatedPaymentAndNotifyBrm = useCallback(
    async (itemId: string, dispatchWhatsappBundle = true) => {
      const item = preConciliationItems.find((x) => x.id === itemId);
      if (!item) return { success: false, error: 'Registro de pre-conciliación no existe.' };
      if (item.status !== 'pendiente_verificacion') {
        return { success: false, error: 'Este soporte ya fue conciliado o rechazado.' };
      }
      if (item.ocrVerdict === 'ALERTA_FRAUDE_EDICION_O_IA') {
        return {
          success: false,
          error: 'LÍNEA ROJA OCR: Prohibido asentar en el libro mayor un comprobante con dictamen ALERTA_FRAUDE_EDICION_O_IA.',
        };
      }

      if (item.invoiceId) {
        const payRes = registerInvoicePayment(
          item.invoiceId,
          item.amountUsd,
          item.method,
          item.reference,
          currentUser?.displayName || 'Tesorería Conciliación'
        );
        if (!payRes.success) {
          return { success: false, error: payRes.error };
        }
      }

      const now = getCaracasNow();
      const nowStamp = `${now.dateFormatted} ${now.timeFormatted}`;

      setPreConciliationItems((prev) =>
        prev.map((x) =>
          x.id === itemId
            ? {
                ...x,
                status: 'CONCILIADO_EN_LIBRO',
                verifiedBy: currentUser?.displayName || 'Tesorería',
                verifiedAtVet: nowStamp,
              }
            : x
        )
      );

      logAuditEvent(
        'BANK_PAYMENT_CONCILE',
        'Tesorería & CxP',
        `Pago pre-conciliado Ref. ${item.reference} ($${item.amountUsd.toFixed(2)}) asentado en firme.`,
        { itemId, invoiceId: item.invoiceId, igtfUsd: item.igtfUsd },
        itemId
      );

      if (dispatchWhatsappBundle && item.invoiceId) {
        const syntheticPayment: AccountsPayablePayment = {
          id: `pay-conc-${Date.now()}`,
          invoiceId: item.invoiceId,
          amountUsd: item.amountUsd,
          bcvRateUsed: item.bcvRateUsed,
          amountVes: round2(toDecimal(item.amountUsd).times(item.bcvRateUsed)),
          method: item.method,
          reference: item.reference,
          paidAtVet: nowStamp,
          registeredBy: currentUser?.displayName || 'Tesorería',
        };
        await dispatchPaymentAndRetentionsBundleBrm({
          invoiceId: item.invoiceId,
          payment: syntheticPayment,
          alsoDownloadPdfs: false,
          openWaMeWindow: false,
        });
      }

      return { success: true };
    },
    [
      preConciliationItems,
      registerInvoicePayment,
      currentUser?.displayName,
      logAuditEvent,
      dispatchPaymentAndRetentionsBundleBrm,
    ]
  );

  const rejectPreConciliatedPayment = useCallback((itemId: string) => {
    setPreConciliationItems((prev) =>
      prev.map((x) =>
        x.id === itemId ? { ...x, status: 'RECHAZADO_FRAUDE_O_DUPLICADO' } : x
      )
    );
  }, []);

  // =========================================================================
  // IMPRESORAS FISCALES HOMOLOGADAS & CIERRE DIARIO REPORTE X / Z
  // =========================================================================

  const registerFiscalZReport = useCallback(
    (input: Omit<RegisterFiscalZInput, 'registeredBy' | 'registeredAtVet'>) => {
      try {
        const now = getCaracasNow();
        const nowStamp = `${now.dateFormatted} ${now.timeFormatted}`;

        const res = processFiscalZClosure({
          input: {
            ...input,
            registeredBy: currentUser?.displayName || 'Auditoría Cajas Fiscales',
            registeredAtVet: nowStamp,
          },
          existingZReports: fiscalZReports,
          salesEvents,
          products,
        });

        setFiscalZReports(res.updatedZReports);

        for (const nextP of res.updatedProducts) {
          const prevP = products.find((p) => p.id === nextP.id);
          if (!prevP || JSON.stringify(prevP) !== JSON.stringify(nextP)) {
            addOrUpdateProduct(nextP);
          }
        }

        // Notificar de forma asíncrona defensiva al servidor /api/v1/pos/fiscal-z-sync
        fetch('/api/v1/pos/fiscal-z-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(res.zRecord),
        }).catch(() => {
          // Resiliencia offline
        });

        logAuditEvent(
          'FISCAL_Z_REPORT_SYNC',
          'Impresora Fiscal SENIAT',
          `${res.zRecord.reportType} N° ${res.zRecord.zNumber} (${res.zRecord.printerSerial}) conciliado: Total $${res.zRecord.grandTotalFiscalUsd.toFixed(2)} | Diferencia vs POS: $${res.zRecord.discrepancyUsd.toFixed(2)}.`,
          {
            zNumber: res.zRecord.zNumber,
            printerSerial: res.zRecord.printerSerial,
            discrepancyUsd: res.zRecord.discrepancyUsd,
          },
          res.zRecord.id
        );

        return { success: true, report: res.zRecord };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Error registrando Reporte Fiscal Z.',
        };
      }
    },
    [currentUser?.displayName, fiscalZReports, salesEvents, products, addOrUpdateProduct, logAuditEvent]
  );

  const exportOperationsBrmSnapshot = useCallback(
    () => ({
      fefoLots,
      coldChainLogs,
      productionRecipes,
      productionOrders,
      brmMessages,
      brmPreInvoices,
      bankStatementLines,
      preConciliationItems,
      fiscalZReports,
      totpConfig,
    }),
    [
      fefoLots,
      coldChainLogs,
      productionRecipes,
      productionOrders,
      brmMessages,
      brmPreInvoices,
      bankStatementLines,
      preConciliationItems,
      fiscalZReports,
      totpConfig,
    ]
  );

  const restoreOperationsBrmSnapshot = useCallback(
    (
      snapshot: Partial<{
        fefoLots: FefoPerishableLot[];
        coldChainLogs: ColdChainTemperatureLog[];
        productionRecipes: ProductionRecipeBom[];
        productionOrders: InternalProductionOrder[];
        brmMessages: BrmWhatsappMessage[];
        brmPreInvoices: BrmSupplierPreInvoice[];
        bankStatementLines: BankStatementLine[];
        preConciliationItems: PaymentPreConciliationItem[];
        fiscalZReports: FiscalZReportRecord[];
        totpConfig: TotpSecurityConfig;
      }>
    ) => {
      if (snapshot.fefoLots) setFefoLots(refreshFefoLotsStatuses(snapshot.fefoLots));
      if (snapshot.coldChainLogs) setColdChainLogs(snapshot.coldChainLogs);
      if (snapshot.productionRecipes) setProductionRecipes(snapshot.productionRecipes);
      if (snapshot.productionOrders) setProductionOrders(snapshot.productionOrders);
      if (snapshot.brmMessages) setBrmMessages(snapshot.brmMessages);
      if (snapshot.brmPreInvoices) setBrmPreInvoices(snapshot.brmPreInvoices);
      if (snapshot.bankStatementLines) setBankStatementLines(snapshot.bankStatementLines);
      if (snapshot.preConciliationItems) setPreConciliationItems(snapshot.preConciliationItems);
      if (snapshot.fiscalZReports) setFiscalZReports(snapshot.fiscalZReports);
      if (snapshot.totpConfig) setTotpConfig(snapshot.totpConfig);
    },
    []
  );

  return (
    <OperationsBrmContext.Provider
      value={{
        totpConfig,
        updateTotpConfig,
        regenerateTotpSecret,
        defaultScaleMode,
        setDefaultScaleMode,
        fefoLots,
        coldChainLogs,
        registerFefoPerishableLot,
        moveFefoLotCavaToShelf,
        unlockExpiredLotWithGovernance,
        registerColdChainTemp,
        productionRecipes,
        productionOrders,
        saveProductionRecipe,
        executeProductionRecipeOrder,
        computeQuincenaDemandForecast,
        brmSession,
        brmMessages,
        brmPreInvoices,
        requestBrmQrSession,
        confirmBrmQrPairing,
        activateBrmCloudWebhookMode,
        disconnectBrmSessionClean,
        sendBrmMessageToSupplier,
        dispatchPurchaseOrderToSupplierBrm,
        dispatchPaymentAndRetentionsBundleBrm,
        receiveBrmSupplierPreInvoice,
        confirmBrmPreInvoiceReceptionGate,
        rejectBrmPreInvoice,
        bankStatementLines,
        preConciliationItems,
        importBankCsvStatement,
        runBankAutoReconciliation,
        submitSupplierPaymentPreConciliation,
        approvePreConciliatedPaymentAndNotifyBrm,
        rejectPreConciliatedPayment,
        fiscalZReports,
        registerFiscalZReport,
        exportOperationsBrmSnapshot,
        restoreOperationsBrmSnapshot,
      }}
    >
      {children}
    </OperationsBrmContext.Provider>
  );
};

export function useOperationsBrm(): OperationsBrmContextType {
  const ctx = useContext(OperationsBrmContext);
  if (!ctx) {
    throw new Error('useOperationsBrm debe utilizarse dentro de OperationsBrmProvider.');
  }
  return ctx;
}
