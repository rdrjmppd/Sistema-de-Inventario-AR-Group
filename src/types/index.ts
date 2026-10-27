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

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  category: string;
  unit: 'UND' | 'KG' | 'LT' | 'CAJA' | 'BULTO';
  costUsd: number;
  targetMarginPercent: number;
  priceUsd: number;
  ivaRate: 0 | 8 | 16;
  stockByLocation: Record<string, number>;
  minStockByLocation: Record<string, number>;
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
  status: 'PENDIENTE' | 'ABONADA' | 'PAGADA' | 'VENCIDA';
  ocrEngineUsed: OcrEngineMode;
  forensicAudit: ForensicAuditReport;
  attachment?: IndexedInvoiceAttachment;
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
  | 'TRANSFERS'
  | 'CHRYSTAL_IMPORT'
  | 'PRICING'
  | 'INVOICES_OCR'
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
  | 'FRUVER_YIELD';

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
  | 'FRUVER_YIELD_BATCH_CREATE';

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
  status: 'REGISTRADO' | 'AUDITADO';
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
  wastes: Array<{
    cause: FruverLossCause;
    weightKg: number;
    notes?: string;
  }>;
}

