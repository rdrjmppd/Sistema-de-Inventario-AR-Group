export enum UserRole {
  SUPERADMIN = 'SUPERADMIN',
  GERENTE = 'GERENTE',
  ANALISTA = 'ANALISTA',
  OBSERVADOR = 'OBSERVADOR',
  SUPERVISOR_CARNICERIA = 'SUPERVISOR_CARNICERIA',
  SUPERVISOR_FRUVER = 'SUPERVISOR_FRUVER',
  SUPERVISOR_PASILLO = 'SUPERVISOR_PASILLO',
}

export type RoleType =
  | 'SUPERADMIN'
  | 'GERENTE'
  | 'ANALISTA'
  | 'OBSERVADOR'
  | 'SUPERVISOR_CARNICERIA'
  | 'SUPERVISOR_FRUVER'
  | 'SUPERVISOR_PASILLO';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  pin: string;
  locationAccess: string[];
  active: boolean;
  createdAt: string;
}

export interface LocationNode {
  id: string;
  code: string;
  name: string;
  city: string;
  type: 'SEDE' | 'DEPOSITO' | 'TIENDA' | 'CEDIS' | 'FRIGORIFICO';
  manager: string;
  active: boolean;
}

export type AbcClass = 'A' | 'B' | 'C';

export type ManualRiskMode =
  | 'AUTOMATICO'
  | 'CRITICO_MANUAL'
  | 'PREVENTIVO_MANUAL'
  | 'EXENTO_MANUAL';

export type RotationHorizonDays = 7 | 15 | 30 | 45 | 60;

export interface DraftPurchaseTarget {
  productId: string;
  locationId: string;
  alertId?: string;
  preferredHorizonDays?: RotationHorizonDays;
}

export type StorageZone = 'DEPOSITO' | 'ANAQUEL';

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  pluCode?: string;
  name: string;
  category: string;
  unit: 'UND' | 'KG' | 'LT' | 'CAJA' | 'BULTO';
  costUsd: number;
  targetMarginPercent: number;
  priceUsd: number;
  ivaRate: 0 | 8 | 16;
  stockByLocation: Record<string, number>;
  minStockByLocation: Record<string, number>;
  shelfStockByLocation?: Record<string, number>;
  minShelfByLocation?: Record<string, number>;
  lastCostOrigin?: 'CATALOGO' | 'CANAL_DESPOSTE' | 'CORTE_DIRECTO' | 'FACTURA';
  manualRiskByLocation?: Record<string, ManualRiskMode>;
  safetyMultiplierByLocation?: Record<string, number>;
  monthlyUnitsSold: number;
  abcClass: AbcClass;
  supplierId: string;
  lastUpdatedVet: string;
}

export interface SupplierPurchaseOrder {
  id: string;
  orderNumber: string;
  alertId?: string;
  productId: string;
  sku: string;
  productName: string;
  unit: Product['unit'];
  locationId: string;
  locationCode: string;
  locationName: string;
  supplierId: string;
  supplierName: string;
  orderedQty: number;
  systemSuggestedQty?: number;
  horizonDaysUsed?: RotationHorizonDays;
  receivedQty?: number;
  unitCostUsd: number;
  totalCostUsd: number;
  totalCostVes: number;
  bcvRateAtOrder: number;
  status: 'PENDIENTE_ENTREGA' | 'RECIBIDO_CONFORME';
  createdBy: string;
  createdAtVet: string;
  receivedBy?: string;
  receivedAtVet?: string;
  notes?: string;
}

export interface PostPurchaseManualReceipt {
  id: string;
  receiptCode: string;
  orderNumberRef?: string;
  isNewProduct: boolean;
  productId: string;
  sku: string;
  productName: string;
  category: string;
  unit: Product['unit'];
  locationId: string;
  locationCode: string;
  qtyReceived: number;
  unitCostUsd: number;
  totalCostUsd: number;
  registeredBy: string;
  receivedAtVet: string;
}

export interface BcvRateState {
  spotRateToday: number;
  nextDayRateAfter5Pm: number;
  activeRate: number;
  eurRate?: number;
  isAfter5PmVet: boolean;
  caracasTimeFormatted: string;
  caracasDateFormatted: string;
  rateSourceLabel: string;
  valueDateLabel?: string;
  lastSyncVet?: string;
  lastUpdatedIso?: string;
  providerSource?: string;
  latencyMs?: number;
  isLiveConnected?: boolean;
}

export interface StockTransfer {
  id: string;
  reference: string;
  fromLocationId: string;
  toLocationId: string;
  fromZone?: StorageZone;
  toZone?: StorageZone;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCostUsd: number;
  totalValueUsd: number;
  status: 'COMPLETADO' | 'EN_TRANSITO';
  createdBy: string;
  createdAtVet: string;
  notes: string;
}

export interface ChrystalImportedRow {
  rowNumber: number;
  skuColA?: string;
  productNameColB: string;
  categoryColC?: string;
  costUsdColD?: number;
  priceUsdColE?: number;
  stockQuantityColF: number;
  status: 'VALID' | 'UPDATED' | 'NEW_SKU';
}

export interface ChrystalParseResult {
  fileName: string;
  parsedAtVet: string;
  totalRawRows: number;
  validRowsCount: number;
  skippedHeaderOrBlankCount: number;
  skippedFooterTotalsCount: number;
  rows: ChrystalImportedRow[];
}

export type TaxpayerType = 'ORDINARIO' | 'ESPECIAL' | 'FORMAL';
export type PersonTaxType = 'PJ_DOMICILIADA' | 'PN_RESIDENTE' | 'PJ_NO_DOMICILIADA';

export interface Supplier {
  id: string;
  rif: string;
  name: string;
  category: string;
  contactName: string;
  phone: string;
  email: string;
  creditDays: number;
  paymentTerms: string;
  balanceUsd: number;
  taxpayerType?: TaxpayerType;
  personType?: PersonTaxType;
  defaultIslrConceptCode?: string;
  whatsappE164?: string;
  bankNameVes?: string;
  bankAccountVes?: string;
  pagoMovilPhone?: string;
  zelleAccount?: string;
  onTimeDeliveryScore?: number;
}

export type OcrEngineMode = 'GEMINI_VISION_PRO' | 'TESSERACT_FORENSIC';

export interface ForensicAuditReport {
  passedAllLocks: boolean;
  lock1LineIntegrations: boolean;
  lock2SubtotalMatch: boolean;
  lock3TaxCoherence: boolean;
  lock4TotalCrossCheck: boolean;
  discrepancyUsd: number;
  auditLog: string[];
}

export interface PurchaseInvoiceLine {
  id: string;
  sku: string;
  description: string;
  quantity: number;
  unitCostUsd: number;
  lineTotalUsd: number;
  ivaRate?: 0 | 8 | 16;
  lineType?: 'BIEN' | 'SERVICIO';
  islrConceptCode?: string;
}

export interface IndexedInvoiceAttachment {
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256Hash: string;
  dataUrl?: string;
  verdict: 'AUTENTICO_ALTA_CONFIANZA' | 'ALERTA_FRAUDE_EDICION_O_IA' | 'DUPLICADO_DETECTADO';
  indexedAtVet: string;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNumber: string;
  controlNumber: string;
  supplierId: string;
  supplierName: string;
  supplierRif: string;
  locationId: string;
  issueDate: string;
  dueDate: string;
  currency: 'USD' | 'VES';
  bcvRateAtIssue: number;
  lines: PurchaseInvoiceLine[];
  subtotalUsd: number;
  ivaAmountUsd: number;
  igtfAmountUsd: number;
  totalUsd: number;
  paidAmountUsd: number;
  exemptAmountUsd?: number;
  taxableBase16Usd?: number;
  iva16Usd?: number;
  taxableBase8Usd?: number;
  iva8Usd?: number;
  ivaUndiscriminated?: boolean;
  hasFormalDefects?: boolean;
  ivaRetentionId?: string;
  islrRetentionId?: string;
  ivaRetainedUsd?: number;
  islrRetainedUsd?: number;
  totalRetainedUsd?: number;
  netPayableUsd?: number;
  status: 'PENDIENTE' | 'ABONADA' | 'PAGADA' | 'VENCIDA';
  ocrEngineUsed: OcrEngineMode;
  forensicAudit: ForensicAuditReport;
  attachment?: IndexedInvoiceAttachment;
  invoiceType?: 'COMPRA_MERCANCIA' | 'GASTO_OPERATIVO_OPEX';
  expenseId?: string;
  createdAtVet: string;
}

export interface AccountsPayablePayment {
  id: string;
  invoiceId: string;
  amountUsd: number;
  bcvRateUsed: number;
  amountVes: number;
  method: 'TRANSFERENCIA_VES' | 'ZELLE_USD' | 'EFECTIVO_USD' | 'PAGO_MOVIL_VES';
  reference: string;
  paidAtVet: string;
  registeredBy: string;
}

export interface MonthlyClosureReport {
  id: string;
  period: string;
  closedAtVet: string;
  closedBy: string;
  averageBcvRate: number;
  totalPurchasesUsd: number;
  totalPaidUsd: number;
  pendingPayablesUsd: number;
  inventoryValuationUsd: number;
  inventoryValuationVes: number;
  estimatedGrossMarginPercent: number;
  status: 'CERRADO_AUDITADO';
}

export interface SalesSyncEvent {
  id: string;
  externalPosId: string;
  locationId: string;
  timestampVet: string;
  items: Array<{
    sku: string;
    productName: string;
    qtySold: number;
    unitPriceUsd: number;
  }>;
  shelfShortfallAlerts?: Array<{
    sku: string;
    productName: string;
    qtySold: number;
    deductedFromShelf: number;
    deductedFromDeposit: number;
  }>;
  totalUsd: number;
  status: 'PROCESADO' | 'RECHAZADO';
}

export interface CustomFieldDefinition {
  id: string;
  module: 'PRODUCTOS' | 'PROVEEDORES' | 'AUDITORIA';
  key: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN';
  required: boolean;
}

export interface DynamicRecord {
  id: string;
  moduleName: string;
  createdAt: string;
  createdBy: string;
  values: Record<string, string | number | boolean>;
}

export interface CompanyFiscalProfile {
  razonSocial: string;
  rif: string;
  direccionFiscal: string;
  telefono: string;
  email: string;
  codigoSada: string;
  representanteLegal: string;
  actividadEconomica: string;
  isCustomConfigured: boolean;
  updatedAtVet: string;
  logoBase64?: string;
  brandingName?: string;
  isSpecialTaxpayer?: boolean;
  isIvaRetentionAgent?: boolean;
  isIslrRetentionAgent?: boolean;
  defaultIvaRetentionPercent?: 75 | 100;
  utValueVes?: number;
  nextIvaVoucherSeq?: number;
  nextIslrVoucherSeq?: number;
}

export interface UIConfigState {
  primaryColorHex: string;
  accentColorHex: string;
  density: 'compact' | 'comfortable';
  showDiagnosticWatermark: boolean;
  customLabels: Record<string, string>;
  customFields: CustomFieldDefinition[];
  companyProfile: CompanyFiscalProfile;
}

export type NavigationTab =
  | 'DASHBOARD'
  | 'CATALOG'
  | 'MULTILOCATION'
  | 'SHELF_STOCK'
  | 'TRANSFERS'
  | 'CHRYSTAL_IMPORT'
  | 'PRICING'
  | 'INVOICES_OCR'
  | 'TAX_RETENTIONS'
  | 'SUPPLIERS'
  | 'ACCOUNTS_PAYABLE'
  | 'ABC_ROTATION'
  | 'PURCHASE_SUGGESTIONS'
  | 'PURCHASE_ORDERS_CENTER'
  | 'MONTHLY_CLOSING'
  | 'POS_API_SYNC'
  | 'SETTINGS_RBAC'
  | 'AUDIT_HISTORY'
  | 'INVENTORY_DISCARDS'
  | 'MEAT_YIELD'
  | 'FRUVER_YIELD'
  | 'FEFO_COLD_CHAIN'
  | 'PRODUCTION_RECIPES'
  | 'BRM_WHATSAPP'
  | 'BANK_RECONCILIATION'
  | 'EXPENSES_CONTROL';

export type DiscardReason =
  | 'VENCIMIENTO_CADUCIDAD'
  | 'DETERIORO_EMPAQUE_CONTENEDOR'
  | 'ACCIDENTE_MALA_MANIPULACION'
  | 'MERMA_CADENA_FRIO'
  | 'ERROR_CARGA_SISTEMA'
  | 'OTRA_CAUSA_JUSTIFICADA';

export type DiscardStatus =
  | 'PENDIENTE_AUTORIZACION'
  | 'AUTORIZADA'
  | 'RECHAZADA';

export interface InventoryDiscardRecord {
  id: string;
  referenceCode: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  productId: string;
  sku: string;
  productName: string;
  category: string;
  unit: Product['unit'];
  quantityDiscarded: number;
  stockBeforeDiscard: number;
  stockAfterDiscard?: number;
  unitCostUsd: number;
  totalCostUsd: number;
  totalCostVes: number;
  bcvRateAtEvent: number;
  reason: DiscardReason;
  reasonDetails: string;
  lotOrGuideNumber?: string;
  status: DiscardStatus;
  createdByUserId: string;
  createdByEmail: string;
  createdByDisplayName: string;
  createdByRole: UserRole;
  createdAtVet: string;
  authorizedByUserId?: string;
  authorizedByEmail?: string;
  authorizedByDisplayName?: string;
  authorizedAtVet?: string;
  managerAuthPinUsed?: string;
  rejectionReason?: string;
}

export interface CreateDiscardInput {
  locationId: string;
  productId: string;
  quantityDiscarded: number;
  reason: DiscardReason;
  reasonDetails: string;
  lotOrGuideNumber?: string;
}

export type AuditActionType =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CONFIG_CHANGE'
  | 'MIN_STOCK_UPDATE'
  | 'PRODUCT_CREATE'
  | 'PRODUCT_UPDATE'
  | 'LOCATION_CREATE'
  | 'LOCATION_DELETE'
  | 'STOCK_TRANSFER'
  | 'PURCHASE_ORDER_CREATE'
  | 'PURCHASE_ORDER_RECEIVE'
  | 'BACKUP_EXPORT'
  | 'BACKUP_RESTORE'
  | 'PLATFORM_RESET'
  | 'INVENTORY_DISCARD_CREATE'
  | 'INVENTORY_DISCARD_AUTHORIZE'
  | 'INVENTORY_DISCARD_REJECT'
  | 'MEAT_YIELD_BATCH_CREATE'
  | 'FRUVER_YIELD_BATCH_CREATE'
  | 'MEAT_YIELD_INVENTORY_LOAD'
  | 'FRUVER_YIELD_INVENTORY_LOAD'
  | 'MEAT_DIRECT_CUT_LOAD'
  | 'SHELF_REPLENISH'
  | 'SHELF_RETURN'
  | 'CAVA_TO_EXHIBICION_TRANSFER'
  | 'SALE_SHELF_SHORTFALL_ALERT'
  | 'SHELF_PHYSICAL_COUNT_ADJUST'
  | 'TAX_RETENTION_EMIT'
  | 'TAX_RETENTION_STATUS_CHANGE'
  | 'TAX_RETENTION_VOID'
  | 'SENIAT_PORTAL_EXPORT'
  | 'SCALE_BARCODE_DECODE'
  | 'PWA_BARCODE_SCAN'
  | 'TOTP_TOKEN_ENROLL'
  | 'TOTP_TOKEN_AUTHORIZE'
  | 'FEFO_LOT_REGISTER'
  | 'FEFO_EXPIRED_OVERRIDE'
  | 'COLD_CHAIN_TEMP_LOG'
  | 'PRODUCTION_RECIPE_CREATE'
  | 'PRODUCTION_ORDER_EXECUTE'
  | 'BRM_WHATSAPP_SEND'
  | 'BRM_WHATSAPP_INVOICE_PRELOAD'
  | 'BRM_WHATSAPP_SESSION_RESET'
  | 'BRM_RETENTION_DRAFT_STAGED'
  | 'BRM_RETENTION_DRAFT_DISCARDED'
  | 'DATABASE_INTEGRITY_VERIFIED'
  | 'BANK_STATEMENT_IMPORT'
  | 'BANK_PAYMENT_CONCILE'
  | 'FISCAL_Z_REPORT_SYNC'
  | 'CHRYSTAL_SALES_IMPORT'
  | 'CHRYSTAL_SALES_SYNC'
  | 'EXPENSE_PRELOAD'
  | 'EXPENSE_APPROVAL'
  | 'EXPENSE_REJECTION'
  | 'EXPENSE_PAYMENT'
  | 'EXPENSE_BUDGET_OVERRIDE'
  | 'EXPENSE_MONTHLY_CLOSE'
  | 'EXPENSE_DRIVE_BACKUP';

export interface AuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  userRole: UserRole;
  action: AuditActionType;
  entityType: string;
  entityId?: string;
  description: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  timestampVet: string;
}

export type SessionStatus = 'ACTIVA' | 'SUSPENDIDA' | 'FINALIZADA';

export interface UserSessionRecord {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  userRole: UserRole;
  loginAtVet: string;
  lastHeartbeatVet: string;
  logoutAtVet?: string;
  durationMinutes?: number;
  status: SessionStatus;
  isActive: boolean; // Preservar por compatibilidad hacia atrás
}

export interface PlatformBackupPayload {
  version: '2.0.0';
  exportedAtVet: string;
  exportedBy: string;
  exportedByEmail: string;
  companyProfile: CompanyFiscalProfile;
  products: Product[];
  locations: LocationNode[];
  suppliers: Supplier[];
  invoices: PurchaseInvoice[];
  payments: AccountsPayablePayment[];
  transfers: StockTransfer[];
  purchaseOrders: SupplierPurchaseOrder[];
  manualReceipts: PostPurchaseManualReceipt[];
  salesEvents: SalesSyncEvent[];
  closures: MonthlyClosureReport[];
  auditLogs: AuditLogEntry[];
  sessionHistory: UserSessionRecord[];
  discards?: InventoryDiscardRecord[];
  retentionVouchers?: TaxRetentionVoucher[];
  meatDirectPurchases?: MeatDirectCutPurchase[];
  shelfMovements?: ShelfMovementRecord[];
  fefoLots?: FefoPerishableLot[];
  coldChainLogs?: ColdChainTemperatureLog[];
  productionRecipes?: ProductionRecipeBom[];
  productionOrders?: InternalProductionOrder[];
  brmMessages?: BrmWhatsappMessage[];
  brmPreInvoices?: BrmSupplierPreInvoice[];
  bankStatementLines?: BankStatementLine[];
  preConciliationItems?: PaymentPreConciliationItem[];
  fiscalZReports?: FiscalZReportRecord[];
  totpConfig?: TotpSecurityConfig;
}

export interface EncryptedBackupEnvelope {
  format: 'CHRYSTAL_ENCRYPTED_BACKUP_V1';
  checksumSha256: string;
  createdAtVet: string;
  cipherText: string;
  salt: string;
  iv: string;
  metadata: {
    totalProducts: number;
    totalLocations: number;
    totalInvoices: number;
    totalAuditLogs: number;
    companyRif: string;
    companyRazonSocial: string;
  };
}

// ==========================================
// RENDIMIENTO CÁRNICO (DESPOSTE RES, CERDO, POLLO)
// ==========================================

export type MeatAnimalType = 'RES' | 'CERDO' | 'POLLO';

export type MeatCarcassPresentation =
  | 'CANAL_COMPLETA'
  | 'MEDIA_CANAL'
  | 'CUARTO_DELANTERO'
  | 'CUARTO_TRASERO'
  | 'CERDO_CANAL'
  | 'POLLO_BENEFICIADO_BULTO';

export type MeatCutTier =
  | 'PRIMERA_ALTO_VALOR'
  | 'SEGUNDA_CORTE_GUISO'
  | 'TERCERA_SOPA_HUESO'
  | 'SUBPRODUCTO_GRASA'
  | 'MERMA_DESECHO';

export interface MeatCutItem {
  id: string;
  cutName: string;
  tier: MeatCutTier;
  weightKg: number;
  yieldPercent: number;
  relativeValueFactor: number;
  allocatedCostPerKgUsd: number;
  targetMarginPercent: number;
  retailPriceUsdPerKg: number;
  retailPriceVesPerKg: number;
  projectedRevenueUsd: number;
}

export type MeatWasteType =
  | 'HUESO_BLANCO_DESECHO'
  | 'GRASA_SEBO_DESECHO'
  | 'MERMA_EVAPORACION_LIQUIDOS'
  | 'ASERRIN_CORTE_SIERRA'
  | 'OTRA_MERMA_DESPOSTE';

export interface MeatWasteItem {
  id: string;
  wasteType: MeatWasteType;
  label: string;
  weightKg: number;
  wastePercent: number;
  lossCostUsd: number;
}

export interface MeatYieldBatch {
  id: string;
  batchCode: string;
  customBatchCode?: string;
  receptionDate?: string;
  supplierId?: string;
  supplierName?: string;
  targetZone?: StorageZone;
  inventoryLoaded?: boolean;
  inventoryLoadedAt?: string;
  animalType: MeatAnimalType;
  presentation: MeatCarcassPresentation;
  locationId: string;
  locationName: string;
  carcassWeightKg: number;
  carcassCostPerKgUsd: number;
  totalCarcassCostUsd: number;
  cuts: MeatCutItem[];
  totalCutsWeightKg: number;
  cutsYieldPercent: number;
  wastes: MeatWasteItem[];
  totalWasteWeightKg: number;
  wastePercent: number;
  unaccountedWeightKg: number;
  projectedTotalRevenueUsd: number;
  projectedGrossProfitUsd: number;
  projectedMarginPercent: number;
  bcvRateAtBatch: number;
  supervisorUserId: string;
  supervisorName: string;
  supervisorRole: UserRole;
  createdAtVet: string;
  status: 'REGISTRADO' | 'CONFIRMADO_INVENTARIO';
}

export interface CreateMeatYieldBatchInput {
  animalType: MeatAnimalType;
  presentation: MeatCarcassPresentation;
  locationId: string;
  carcassWeightKg: number;
  carcassCostPerKgUsd: number;
  customBatchCode?: string;
  receptionDate?: string;
  supplierId?: string;
  supplierName?: string;
  cuts: Array<{
    cutName: string;
    tier: MeatCutTier;
    weightKg: number;
    relativeValueFactor: number;
    targetMarginPercent: number;
  }>;
  wastes: Array<{
    wasteType: MeatWasteType;
    label: string;
    weightKg: number;
  }>;
}

// ==========================================
// RENDIMIENTO FRUTAS Y VERDURAS (FRUVER)
// ==========================================

export type FruverCategory =
  | 'FRUTAS'
  | 'VERDURAS_HORTALIZAS'
  | 'TUBERCULOS_RAICES'
  | 'LEGUMBRES_GRANOS';

export type FruverLossCause =
  | 'DESHIDRATACION_PERDIDA_PESO'
  | 'DANO_EXCESO_FRIO'
  | 'DANO_EXCESO_CALOR'
  | 'DANO_MECANICO_MANIPULACION'
  | 'EXCESO_DIAS_EXPOSICION_ROTACION';

export interface FruverWasteRecord {
  id: string;
  cause: FruverLossCause;
  causeLabel: string;
  weightKg: number;
  percentOfBatch: number;
  lossCostUsd: number;
  lossCostVes: number;
  notes: string;
}

export interface FruverBatchRecord {
  id: string;
  batchCode: string;
  customBatchCode?: string;
  receptionDate?: string;
  supplierId?: string;
  supplierName?: string;
  targetZone?: StorageZone;
  inventoryLoaded?: boolean;
  inventoryLoadedAt?: string;
  productId: string;
  productSku: string;
  productName: string;
  category: FruverCategory;
  locationId: string;
  locationName: string;
  initialWeightKg: number;
  initialCostPerKgUsd: number;
  totalBatchCostUsd: number;
  wastes: FruverWasteRecord[];
  totalWasteKg: number;
  wastePercent: number;
  totalWasteLossUsd: number;
  totalWasteLossVes: number;
  netSalableWeightKg: number;
  netYieldPercent: number;
  effectiveCostPerSalableKgUsd: number;
  suggestedPvpPerKgUsd: number;
  suggestedPvpPerKgVes: number;
  bcvRateAtBatch: number;
  supervisorUserId: string;
  supervisorName: string;
  supervisorRole: UserRole;
  createdAtVet: string;
  status: 'REGISTRADO' | 'AUDITADO' | 'CONFIRMADO_INVENTARIO';
}

export interface CreateFruverBatchInput {
  productId: string;
  productSku: string;
  productName: string;
  category: FruverCategory;
  locationId: string;
  initialWeightKg: number;
  initialCostPerKgUsd: number;
  targetMarginPercent?: number;
  customBatchCode?: string;
  receptionDate?: string;
  supplierId?: string;
  supplierName?: string;
    wastes: Array<{
      cause: FruverLossCause;
      weightKg: number;
      notes?: string;
    }>;
  }

// ==========================================
// COMPRA DE CORTES DIRECTOS CÁRNICOS (PIEZA FINAL)
// ==========================================

export interface MeatDirectCutLine {
  id: string;
  sku: string;
  cutName: string;
  animalType: MeatAnimalType;
  tier: MeatCutTier;
  receivedWeightKg: number;
  shrinkageKg: number;
  netSalableWeightKg: number;
  purchaseCostPerKgUsd: number;
  lineInvoiceCostUsd: number;
  effectivePurchaseCostPerKgUsd: number;
  manualAssignedCostUsd: number;
  targetMarginPercent: number;
  retailPriceUsdPerKg: number;
  retailPriceVesPerKg: number;
  projectedRevenueUsd: number;
  carcassReferenceCostPerKgUsd?: number;
  costDeltaVsCarcassUsd?: number;
}

export interface MeatDirectCutPurchase {
  id: string;
  batchCode: string;
  invoiceOrGuideRef: string;
  sadaGuide?: string;
  receptionDate: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  locationName: string;
  targetZone: StorageZone;
  cavaOriginNote?: string;
  lines: MeatDirectCutLine[];
  totalReceivedWeightKg: number;
  totalShrinkageKg: number;
  totalNetSalableWeightKg: number;
  totalPurchaseCostUsd: number;
  totalProjectedRevenueUsd: number;
  projectedGrossProfitUsd: number;
  projectedMarginPercent: number;
  bcvRateAtPurchase: number;
  inventoryLoaded: boolean;
  inventoryLoadedAt?: string;
  createdByUserId: string;
  createdByName: string;
  createdByRole: UserRole;
  createdAtVet: string;
  status: 'REGISTRADO' | 'CONFIRMADO_INVENTARIO';
}

export interface CreateMeatDirectCutPurchaseInput {
  batchCode?: string;
  invoiceOrGuideRef: string;
  sadaGuide?: string;
  receptionDate?: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  targetZone: StorageZone;
  cavaOriginNote?: string;
  lines: Array<{
    sku?: string;
    cutName: string;
    animalType: MeatAnimalType;
    tier: MeatCutTier;
    receivedWeightKg: number;
    shrinkageKg?: number;
    purchaseCostPerKgUsd: number;
    manualAssignedCostUsd?: number;
    targetMarginPercent: number;
    carcassReferenceCostPerKgUsd?: number;
  }>;
}

export interface MeatCutCostComparison {
  cutName: string;
  animalType: MeatAnimalType;
  directEffectiveCostPerKgUsd: number;
  manualAssignedCostUsd: number;
  carcassAllocatedCostPerKgUsd: number;
  deltaUsdPerKg: number;
  deltaPercent: number;
  recommendation: 'CONVIENE_CORTE_DIRECTO' | 'CONVIENE_CANAL_DESPOSTE' | 'PARIDAD_COSTO';
}

// ==========================================
// CONTROL DE INVENTARIO DEPÓSITO/CAVA ↔ ANAQUEL/EXHIBICIÓN
// ==========================================

export type ShelfMovementType =
  | 'REPLENISH_TO_SHELF'
  | 'RETURN_TO_DEPOSIT'
  | 'CAVA_TO_EXHIBICION'
  | 'POS_SALE_DEDUCTION'
  | 'PHYSICAL_COUNT_SYNC'
  | 'DIRECT_RECEIPT_TO_SHELF';

export interface LocationStockBreakdown {
  locationId: string;
  total: number;
  shelf: number;
  deposit: number;
  minShelf: number;
  isShelfLow: boolean;
  shelfCoveragePercent: number;
}

export interface ShelfMovementRecord {
  id: string;
  referenceCode: string;
  movementType: ShelfMovementType;
  productId: string;
  sku: string;
  productName: string;
  unit: Product['unit'];
  fromLocationId: string;
  fromLocationName: string;
  fromZone: StorageZone;
  toLocationId: string;
  toLocationName: string;
  toZone: StorageZone;
  quantity: number;
  shelfBefore: number;
  shelfAfter: number;
  depositBefore: number;
  depositAfter: number;
  totalAfter: number;
  notes?: string;
  performedByUserId: string;
  performedByName: string;
  performedByRole: UserRole;
  managerPinValidated?: boolean;
  timestampVet: string;
}

export interface PhysicalCountReconciliationInput {
  productId: string;
  locationId: string;
  countedDepositQty: number;
  countedShelfQty: number;
  notes: string;
  managerPin?: string;
}

export interface PhysicalCountReconciliationResult {
  updatedProduct: Product;
  movementRecord: ShelfMovementRecord;
  systemDepositBefore: number;
  systemShelfBefore: number;
  systemTotalBefore: number;
  countedTotalAfter: number;
  depositDiff: number;
  shelfDiff: number;
  totalDiff: number;
  requiresManagerPin: boolean;
  pinAuthorizedBy?: string;
}

export interface ShelfReplenishmentSuggestion {
  productId: string;
  sku: string;
  productName: string;
  category: string;
  unit: Product['unit'];
  locationId: string;
  currentShelf: number;
  minShelf: number;
  availableDeposit: number;
  suggestedMoveQty: number;
  deficitAfterDeposit: number;
}

// ==========================================
// RETENCIONES FISCALES AUTOMÁTICAS VENEZUELA (IVA SNAT/2025/000054 & ISLR D. 1.808)
// ==========================================

export type TaxRetentionType = 'IVA' | 'ISLR';

export type TaxRetentionStatus =
  | 'EMITIDO'
  | 'ENTREGADO'
  | 'ENTERADO_SENIAT'
  | 'ANULADO';

export type FilingFortnight = 'PRIMERA_QUINCENA' | 'SEGUNDA_QUINCENA';

export interface IslrConceptRule {
  code: string;
  name: string;
  legalBasis: string;
  pjRatePercent: number;
  pnRatePercent: number;
  pnAppliesSustraendo: boolean;
  pjMinBaseUt: number;
  pnThresholdUtFactor: number;
}

export interface TaxRetentionLineDetail {
  lineId: string;
  sku: string;
  description: string;
  lineType: 'BIEN' | 'SERVICIO';
  baseAmountUsd: number;
  baseAmountVes: number;
  exemptAmountUsd: number;
  exemptAmountVes: number;
  taxRatePercent: number;
  taxCausadoUsd: number;
  taxCausadoVes: number;
  retentionRatePercent: number;
  sustraendoVes: number;
  retainedAmountUsd: number;
  retainedAmountVes: number;
  conceptCode?: string;
  conceptName?: string;
}

export interface TaxRetentionVoucher {
  id: string;
  voucherNumber: string;
  type: TaxRetentionType;
  legalNormative: string;
  status: TaxRetentionStatus;
  issueDate: string;
  periodYearMonth: string;
  fortnight: FilingFortnight;
  fortnightLabel: string;
  legalDeliveryHint: string;
  agentRazonSocial: string;
  agentRif: string;
  agentAddress: string;
  supplierId: string;
  supplierName: string;
  supplierRif: string;
  supplierTaxpayerType: TaxpayerType;
  supplierPersonType: PersonTaxType;
  invoiceId: string;
  invoiceNumber: string;
  controlNumber: string;
  invoiceIssueDate: string;
  bcvRateAtIssue: number;
  utValueVes: number;
  lines: TaxRetentionLineDetail[];
  invoiceTotalUsd: number;
  invoiceTotalVes: number;
  exemptTotalUsd: number;
  exemptTotalVes: number;
  taxableBaseUsd: number;
  taxableBaseVes: number;
  taxCausadoTotalUsd: number;
  taxCausadoTotalVes: number;
  sustraendoTotalVes: number;
  retainedTotalUsd: number;
  retainedTotalVes: number;
  retentionPercentApplied: number;
  netPayableAfterAllRetentionsUsd: number;
  netPayableAfterAllRetentionsVes: number;
  createdBy: string;
  createdAtVet: string;
  voidedAtVet?: string;
  voidedBy?: string;
  voidReason?: string;
}


// ==========================================
// EVOLUCIÓN V4.0 — LAS 10 MEJORAS & MÓDULO BRM WHATSAPP PROVEEDORES
// ==========================================

// 1. Exportador Portal SENIAT (.TXT IVA, .XML ISLR, Libro de Compras)
export interface SeniatTxtValidationIssue {
  voucherNumber: string;
  invoiceNumber: string;
  field: string;
  message: string;
  severity: 'ERROR' | 'ADVERTENCIA';
}

export interface SeniatPortalExportBundle {
  periodYearMonth: string;
  fortnight?: FilingFortnight;
  fileName: string;
  mimeType: string;
  content: string;
  recordsCount: number;
  totalRetainedVes: number;
  totalTaxableBaseVes: number;
  validationIssues: SeniatTxtValidationIssue[];
}

// 2. Balanzas Electrónicas EAN-13 Peso Variable (Prefijos 20 / 21)
export type ScaleBarcodeMode = 'WEIGHT_GRAMS_20' | 'PRICE_CENTS_21';

export interface DecodedScaleBarcode {
  rawBarcode: string;
  isScaleVariableBarcode: boolean;
  prefix: '20' | '21' | '22' | 'STANDARD';
  mode: ScaleBarcodeMode | 'STANDARD_EAN';
  pluCode: string;
  weightKg: number;
  encodedTotalUsd?: number;
  checksumValid: boolean;
  expectedCheckDigit: number;
}

// 3. Escáner Móvil PWA por Cámara & Lector Láser
export interface BarcodeScanRecord {
  id: string;
  rawCode: string;
  matchedProductId?: string;
  matchedSku?: string;
  matchedProductName?: string;
  decodedWeightKg?: number;
  scannedQty: number;
  zone: StorageZone;
  locationId: string;
  source: 'CAMERA_PWA' | 'HARDWARE_WEDGE' | 'MANUAL_ENTRY';
  scannedAtVet: string;
  synced: boolean;
}

// 4. Módulo BRM WhatsApp Proveedores (Patrón Híbrido Triple Puro Apure ERP)
export type BrmConnectionMode =
  | 'QR_SOCKET_BRIDGE'
  | 'CLOUD_API_WEBHOOK'
  | 'WA_ME_DIRECT_LEDGER';

export type BrmSessionState =
  | 'CONNECTED'
  | 'QR_READY'
  | 'DISCONNECTED'
  | 'CLOUD_STANDBY';

export type BrmDeliveryStatus =
  | 'EN_COLA_OFFLINE'
  | 'ENVIADO'
  | 'ENTREGADO'
  | 'LEIDO'
  | 'FALLIDO';

export type BrmDocumentCategory =
  | 'ORDEN_COMPRA'
  | 'FACTURA_ENTRANTE_PROVEEDOR'
  | 'SOPORTE_PAGO_CXP'
  | 'COMPROBANTE_RETENCION_IVA'
  | 'COMPROBANTE_RETENCION_ISLR'
  | 'HOMOLOGACION_EXPEDIENTE'
  | 'MENSAJE_OPERATIVO_BRM';

export interface BrmWhatsappSessionStatus {
  state: BrmSessionState;
  activeMode: BrmConnectionMode;
  corporatePhoneE164: string;
  qrPayloadData?: string;
  qrGeneratedAtVet?: string;
  hasAdminCredentials: boolean;
  pendingOfflineQueueCount: number;
  lastHeartbeatVet: string;
}

export interface BrmWhatsappMessage {
  id: string;
  messageId: string; // Idempotency key
  supplierId: string;
  supplierName: string;
  supplierRif: string;
  phoneE164: string;
  direction: 'OUTBOUND_TO_SUPPLIER' | 'INBOUND_FROM_SUPPLIER';
  category: BrmDocumentCategory;
  bodyText: string;
  relatedEntityId?: string;
  attachmentFileName?: string;
  deliveryStatus: BrmDeliveryStatus;
  transportUsed: BrmConnectionMode;
  waMeDeepLink?: string;
  createdBy: string;
  timestampVet: string;
}

export interface BrmSupplierPreInvoice {
  id: string;
  messageId: string;
  supplierId: string;
  supplierName: string;
  supplierRif: string;
  phoneE164: string;
  invoiceNumber: string;
  controlNumber: string;
  declaredSubtotalUsd: number;
  declaredIvaUsd: number;
  declaredIgtfUsd: number;
  declaredTotalUsd: number;
  sha256Hash: string;
  pHashVisual: string;
  ocrVerdict: 'AUTENTICO_ALTA_CONFIANZA' | 'SOSPECHOSO_REVISION_HUMANA' | 'ALERTA_FRAUDE_EDICION_O_IA';
  ocrConfidenceScore: number;
  status: 'PENDIENTE_VERIFICACION' | 'CONFIRMADA_RECEPCION_FISICA' | 'RECHAZADA_DISCREPANCIA';
  receivedAtVet: string;
  confirmedBy?: string;
  confirmedAtVet?: string;
  linkedInvoiceId?: string;
}

export interface StagedBrmRetentionDispatch {
  voucherId: string;
  voucherNumber: string;
  voucherType: TaxRetentionType;
  invoiceId: string;
  supplierId: string;
  supplierName: string;
  supplierRif: string;
  phoneE164: string;
  retainedVes: number;
  retainedUsd: number;
  periodYearMonth: string;
  formattedSummaryMessage: string;
  preparedAtVet: string;
}

// 5. Control FEFO de Perecederos & Telemetría Cadena de Frío SADA
export type FefoAlertLevel =
  | 'VENCIDO_BLOQUEADO'
  | 'CRITICO_PROMOCION_1_3D'
  | 'PREVENTIVO_4_7D'
  | 'VIGENTE_OPTIMO';

export interface FefoPerishableLot {
  id: string;
  lotCode: string;
  productId: string;
  sku: string;
  productName: string;
  category: string;
  unit: Product['unit'];
  locationId: string;
  locationName: string;
  zone: StorageZone;
  quantityRemaining: number;
  unitCostUsd: number;
  receptionDate: string;
  expirationDate: string;
  daysUntilExpiration: number;
  alertLevel: FefoAlertLevel;
  suggestedDiscountPercent: number;
  suggestedAction: 'BLOQUEAR_Y_DESCARGAR' | 'TRANSFORMAR_RECETA_O_PROMO' | 'PRIORIZAR_SALIDA_EXHIBICION' | 'MANTENER_ROTACION';
  blockedForSale: boolean;
  managerOverrideAuthorizedBy?: string;
}

export type ColdEquipmentType = 'CAVA_CARNICOS' | 'CONGELADOR_PROTEINA' | 'VITRINA_EXHIBICION' | 'CUARTO_FRIO_FRUVER';

export interface ColdChainTemperatureLog {
  id: string;
  locationId: string;
  locationName: string;
  equipmentName: string;
  equipmentType: ColdEquipmentType;
  recordedTempCelsius: number;
  minAllowedCelsius: number;
  maxAllowedCelsius: number;
  isOutOfRange: boolean;
  source: 'MANUAL_SUPERVISOR' | 'IOT_WEBHOOK_SENSOR';
  recordedBy: string;
  recordedAtVet: string;
  correctiveAction?: string;
}

// 6. Recetario de Transformación Interna (BOM) & Subproductos
export interface RecipeIngredientLine {
  productId: string;
  sku: string;
  productName: string;
  unit: Product['unit'];
  quantityRequiredPerBatch: number;
  preferredSourceZone: StorageZone;
}

export interface ProductionRecipeBom {
  id: string;
  code: string;
  name: string;
  department: 'CARNICERIA' | 'CHARCUTERIA' | 'FRUVER';
  outputProductId?: string;
  outputSku: string;
  outputProductName: string;
  outputUnit: Product['unit'];
  expectedOutputQty: number;
  packagingAndCondimentsCostUsd: number;
  targetMarginPercent: number;
  ingredients: RecipeIngredientLine[];
  active: boolean;
}

export interface InternalProductionOrder {
  id: string;
  orderCode: string;
  recipeId: string;
  recipeName: string;
  locationId: string;
  locationName: string;
  targetOutputZone: StorageZone;
  batchesMultiplier: number;
  actualOutputQty: number;
  rawMaterialsCostUsd: number;
  packagingCostUsd: number;
  totalBatchCostUsd: number;
  unitElaboratedCostUsd: number;
  suggestedPvpUsd: number;
  suggestedPvpVes: number;
  fefoLotsConsumed: string[];
  executedBy: string;
  executedAtVet: string;
}

// 7. Conciliación Bancaria Bimonetaria Automatizada + Bandeja Pre-Conciliación OCR
export interface BankStatementLine {
  id: string;
  bankName: string;
  accountCurrency: 'VES' | 'USD';
  transactionDate: string;
  reference: string;
  description: string;
  amount: number;
  amountUsdEquivalent: number;
  bcvRateAtTx: number;
  igtfAppliedUsd: number;
  direction: 'DEBITO_EGRESO' | 'CREDITO_INGRESO';
  reconciliationStatus: 'PENDIENTE' | 'CONCILIADO_EXACTO' | 'CONCILIADO_TOLERANCIA';
  matchedPaymentId?: string;
  matchedInvoiceId?: string;
}

export interface PaymentPreConciliationItem {
  id: string;
  supplierId: string;
  supplierName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  method: AccountsPayablePayment['method'];
  currency: 'VES' | 'USD';
  amountOriginal: number;
  bcvRateUsed: number;
  amountUsd: number;
  igtfUsd: number;
  reference: string;
  sha256Hash: string;
  pHashVisual: string;
  ocrVerdict: 'AUTENTICO_ALTA_CONFIANZA' | 'SOSPECHOSO_REVISION_HUMANA' | 'ALERTA_FRAUDE_EDICION_O_IA';
  ocrScore: number;
  status: 'pendiente_verificacion' | 'CONCILIADO_EN_LIBRO' | 'RECHAZADO_FRAUDE_O_DUPLICADO';
  submittedBy: string;
  submittedAtVet: string;
  verifiedBy?: string;
  verifiedAtVet?: string;
}

// 8. Motor Predictivo de Demanda por Quincenas (15 / 30) y Estacionalidad
export interface DemandForecastSummary {
  productId: string;
  sku: string;
  productName: string;
  category: string;
  locationId: string;
  baseDailyVelocity: number;
  quincenaMultiplier: number;
  weekendMultiplier: number;
  seasonalCategoryFactor: number;
  effectiveDailyDemand: number;
  projectedDemandHorizon: number;
  horizonDays: RotationHorizonDays;
  isUpcomingQuincenaWindow: boolean;
  recommendedOrderQty: number;
}

// 9. Gobernanza Gerencial con Token Dinámico TOTP Offline / QR 30s
export interface TotpSecurityConfig {
  enabled: boolean;
  allowPinFallback: boolean;
  secretBase32: string;
  issuer: string;
  accountLabel: string;
  enrolledBy?: string;
  enrolledAtVet?: string;
}

// 10. Impresoras Fiscales Homologadas SENIAT & Cierre Diario X / Z
export interface FiscalZReportRecord {
  id: string;
  zNumber: string;
  printerSerial: string;
  printerBrand: 'THE_FACTORY_HKA' | 'BEMATECH' | 'PNP' | 'IMPRENTA_DIGITAL';
  locationId: string;
  locationName: string;
  closureDate: string;
  reportType: 'REPORTE_X_PARCIAL' | 'REPORTE_Z_DIARIO';
  invoicesCount: number;
  creditNotesCount: number;
  exemptSalesUsd: number;
  taxableBase16Usd: number;
  iva16CollectedUsd: number;
  taxableBase8Usd: number;
  iva8CollectedUsd: number;
  igtfBaseForeignUsd: number;
  igtf3CollectedUsd: number;
  grandTotalFiscalUsd: number;
  grandTotalFiscalVes: number;
  bcvRateClosure: number;
  erpPosTotalUsd: number;
  discrepancyUsd: number;
  hmacVerified: boolean;
  source: 'API_PUENTE_FISCAL' | 'CARGA_AUDITADA_CIERRE';
  registeredBy: string;
  registeredAtVet: string;
}

// ============================================================================
// 11. Control de Gastos Operativos (OPEX), Facturas de Servicios & Presupuestos
// ============================================================================
export type ExpenseCategory =
  | 'OFICINA_PAPELERIA'
  | 'MANTENIMIENTO_EQUIPOS'
  | 'MATERIALES_MANTENIMIENTO'
  | 'MATERIALES_CONSTRUCCION'
  | 'CLIMATIZACION_AC'
  | 'SERVIDORES_TI_TELEVISORES'
  | 'SERVICIO_TECNICO_ESPECIALIZADO'
  | 'LIMPIEZA_DESINFECCION'
  | 'LOGISTICA_VIATICOS'
  | 'SERVICIOS_PUBLICOS'
  | 'OTRO';

export type ExpenseVoucherType =
  | 'FACTURA_FISCAL'
  | 'TICKET_CAJA'
  | 'RECIBO_SIMPLE'
  | 'NOTA_ENTREGA';

export type ExpenseApprovalStatus =
  | 'APROBADO_DIRECTO'
  | 'PENDIENTE_APROBACION'
  | 'APROBADO_GERENCIA'
  | 'RECHAZADO';

export interface ExpensePaymentRecord {
  id: string;
  expenseId: string;
  amountUsd: number;
  amountVes: number;
  bcvRate: number;
  method: 'TRANSFERENCIA_VES' | 'ZELLE_USD' | 'EFECTIVO_USD' | 'PAGO_MOVIL_VES';
  reference: string;
  paidAtVet: string;
  registeredBy: string;
  isEarlyDiscountApplied?: boolean;
  discountSavedUsd?: number;
  penaltyAppliedUsd?: number;
}

export interface ExpenseRecord {
  id: string;
  expenseCode: string;
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
  paidAmountUsd: number;
  status: 'PENDIENTE' | 'ABONADO' | 'PAGADO' | 'VENCIDO';
  requiresManagerApproval: boolean;
  approvalStatus: ExpenseApprovalStatus;
  preloadedByUserId: string;
  preloadedByName: string;
  preloadedAtVet: string;
  approvedByUserId?: string;
  approvedByName?: string;
  approvedAtVet?: string;
  approvalPinUsed?: string;
  rejectionReason?: string;
  payments: ExpensePaymentRecord[];
  attachment?: IndexedInvoiceAttachment;
  driveBackupUrl?: string;
  driveBackupPath?: string;
  driveBackupConfirmed?: boolean;
  linkedInvoiceId?: string;
  createdAtVet: string;
}

export interface MonthlyBudgetPlan {
  id: string;
  periodYearMonth: string; // "YYYY-MM"
  globalBudgetLimitUsd: number;
  categoryBudgets: Record<ExpenseCategory, number>;
  locationBudgets: Record<string, number>;
  contingencyAlarmThresholdPercent: number; // default 70%
  hardCapLockEnabled: boolean; // default true: requires PIN override if > 100%
  authorizedBy: string;
  authorizedAtVet: string;
}

export interface ExpenseMonthlyArqueoReport {
  id: string;
  periodYearMonth: string;
  totalBudgetUsd: number;
  totalExecutedUsd: number;
  totalExecutedVes: number;
  variancePercent: number;
  status: 'DENTRO_PRESUPUESTO' | 'EN_ALARMA_70' | 'EXCEDIDO';
  topExpensesByAmount: Array<{
    id: string;
    description: string;
    amountUsd: number;
    category: ExpenseCategory;
    beneficiary: string;
    voucherNumber: string;
  }>;
  topFrequentMicroExpenses: Array<{
    category: ExpenseCategory;
    count: number;
    totalAmountUsd: number;
    avgAmountUsd: number;
  }>;
  topSuppliersBySpend: Array<{
    supplierName: string;
    rif: string;
    totalUsd: number;
    count: number;
  }>;
  nextMonthBudgetProjections: Array<{
    category: ExpenseCategory;
    historicalAvgUsd: number;
    recommendedAllocationUsd: number;
    rationale: string;
  }>;
  generatedAtVet: string;
  generatedBy: string;
}
