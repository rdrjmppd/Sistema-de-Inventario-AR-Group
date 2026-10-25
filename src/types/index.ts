export enum UserRole {
  SUPERADMIN = 'SUPERADMIN',
  GERENTE = 'GERENTE',
  ANALISTA = 'ANALISTA',
  OBSERVADOR = 'OBSERVADOR',
}

export type RoleType = 'SUPERADMIN' | 'GERENTE' | 'ANALISTA' | 'OBSERVADOR';

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
  | 'SETTINGS_RBAC';
