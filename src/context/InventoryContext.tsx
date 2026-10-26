import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import {
  Product,
  LocationNode,
  StockTransfer,
  ChrystalParseResult,
  AbcClass,
  SalesSyncEvent,
  ManualRiskMode,
  SupplierPurchaseOrder,
  PostPurchaseManualReceipt,
  DraftPurchaseTarget,
  RotationHorizonDays,
  AuditActionType,
  AuditLogEntry,
  PlatformBackupPayload,
  UserRole,
  InventoryDiscardRecord,
  CreateDiscardInput,
} from '../types';
import {
  toDecimal,
  round2,
  calculateGrossMarginPercent,
  calculatePriceFromMargin,
} from '../lib/decimal';
import { getCaracasNow } from '../lib/bcv';
import {
  createAuditLogEntry,
  loadStoredAuditLogs,
  saveAuditLogs,
} from '../lib/audit-logger';
import { resolveCompanyProfile } from '../lib/excel-exporter';
import {
  ReorderAlertItem,
  evaluateReorderAlerts,
  detectRealtimeTriggeredAlerts,
} from '../lib/reorder-alerts';
import {
  CreateLocationNodeInput,
  createNewLocationOrDepot,
  deleteLocationOrDepotWithAuth,
  syncProductStockMapsForLocations,
  removeLocationFromProductStockMaps,
} from '../lib/catalog-pagination';
import {
  INITIAL_INVENTORY_DISCARDS,
  createPendingInventoryDiscard,
  authorizeInventoryDiscardWithPin,
  rejectInventoryDiscardWithReason,
  getDiscardReasonLabel,
} from '../lib/inventory-discards';
import { useFinance } from './FinanceContext';
import { useAuth } from './AuthContext';

export interface ManualReceiptInput {
  isNewProduct: boolean;
  existingProductId?: string;
  sku: string;
  barcode?: string;
  productName: string;
  category: string;
  unit: Product['unit'];
  ivaRate: 0 | 8 | 16;
  targetMarginPercent: number;
  locationId: string;
  qtyReceived: number;
  unitCostUsd: number;
  reorderPoint?: number;
  orderNumberRef?: string;
}

interface InventoryContextType {
  locations: LocationNode[];
  products: Product[];
  transfers: StockTransfer[];
  salesEvents: SalesSyncEvent[];
  purchaseOrders: SupplierPurchaseOrder[];
  manualReceipts: PostPurchaseManualReceipt[];
  selectedLocationId: string;
  setSelectedLocationId: (id: string) => void;
  isAddLocationModalOpen: boolean;
  setIsAddLocationModalOpen: (open: boolean) => void;
  locationToDelete: LocationNode | null;
  setLocationToDelete: (loc: LocationNode | null) => void;
  addLocationOrDepot: (
    input: CreateLocationNodeInput
  ) => { success: boolean; location?: LocationNode; error?: string };
  deleteLocationOrDepot: (
    locationId: string,
    authCode: string
  ) => { success: boolean; deletedLocation?: LocationNode; error?: string };
  configureProductRiskIndicator: (params: {
    productId: string;
    locationId: string;
    manualRiskMode: ManualRiskMode;
    reorderPoint: number;
    safetyMultiplier: number;
  }) => void;
  createReplenishmentOrderFromAlert: (
    alertId: string,
    customOrderedQty?: number,
    customSupplierId?: string,
    notes?: string
  ) => { success: boolean; order?: SupplierPurchaseOrder; error?: string };
  draftPurchaseTarget: DraftPurchaseTarget | null;
  setDraftPurchaseTarget: (target: DraftPurchaseTarget | null) => void;
  createManualPurchaseOrder: (params: {
    productId: string;
    locationId: string;
    supplierId: string;
    orderedQty: number;
    unitCostUsd: number;
    horizonDaysUsed: RotationHorizonDays;
    systemSuggestedQty: number;
    notes?: string;
    alertId?: string;
  }) => { success: boolean; order?: SupplierPurchaseOrder; error?: string };
  confirmPurchaseOrderDelivery: (
    orderId: string,
    actualReceivedQty?: number
  ) => { success: boolean; order?: SupplierPurchaseOrder; error?: string };
  registerPostPurchaseManualReceipt: (
    input: ManualReceiptInput
  ) => { success: boolean; receipt?: PostPurchaseManualReceipt; error?: string };
  reorderAlerts: ReorderAlertItem[];
  liveToastAlerts: ReorderAlertItem[];
  unreadAlertsCount: number;
  sessionStartupAlertShown: boolean;
  dismissToastAlert: (alertId: string) => void;
  dismissAllToasts: () => void;
  markAllAlertsAsRead: () => void;
  triggerRealtimeStockDropDemo: () => ReorderAlertItem | null;
  replenishAlertStock: (alertId: string) => void;
  addOrUpdateProduct: (product: Product) => void;
  updateProductPricing: (productId: string, newCostUsd: number, newMarginPct: number) => void;
  executeStockTransfer: (
    productId: string,
    fromLocationId: string,
    toLocationId: string,
    qty: number,
    notes: string,
    createdBy: string
  ) => { success: boolean; error?: string };
  applyChrystalImport: (
    result: ChrystalParseResult,
    targetLocationId: string,
    mode: 'REPLACE' | 'ADD'
  ) => { updated: number; created: number };
  simulatePosWebhookSale: (
    locationId: string,
    items: Array<{ sku: string; qty: number }>
  ) => { success: boolean; event?: SalesSyncEvent; error?: string };
  recalculateAbcClassification: () => void;
  auditLogs: AuditLogEntry[];
  logAuditEvent: (
    action: AuditActionType,
    entityType: string,
    description: string,
    details?: Record<string, unknown>,
    entityId?: string
  ) => AuditLogEntry;
  updateProductMinStockThreshold: (params: {
    productId: string;
    locationId: string;
    minStock: number;
    manualRiskMode?: ManualRiskMode;
    safetyMultiplier?: number;
  }) => { success: boolean; product?: Product; error?: string };
  wipePlatformDataToPristine: (superAdminPin: string) => { success: boolean; error?: string };
  restoreFullPlatformState: (
    backupData: PlatformBackupPayload
  ) => {
    success: boolean;
    restoredCount?: { products: number; locations: number; orders: number };
    error?: string;
  };
  exportPlatformBackupPayload: () => PlatformBackupPayload;
  discards: InventoryDiscardRecord[];
  pendingDiscardsCount: number;
  registerInventoryDiscard: (
    input: CreateDiscardInput
  ) => { success: boolean; discard?: InventoryDiscardRecord; error?: string };
  authorizeInventoryDiscard: (
    discardId: string,
    managerPin: string
  ) => { success: boolean; discard?: InventoryDiscardRecord; error?: string };
  rejectInventoryDiscard: (
    discardId: string,
    rejectionReason: string
  ) => { success: boolean; discard?: InventoryDiscardRecord; error?: string };
}

export const INITIAL_LOCATIONS: LocationNode[] = [
  {
    id: 'loc-pzo-01',
    code: 'PZO-01',
    name: 'Sede Principal Alta Vista (Puerto Ordaz)',
    city: 'Puerto Ordaz, Edo. Bolívar',
    type: 'SEDE',
    manager: 'Ing. Roberto Salazar',
    active: true,
  },
  {
    id: 'loc-ccs-01',
    code: 'CCS-01',
    name: 'Sede Las Mercedes (Caracas)',
    city: 'Caracas, Distrito Capital',
    type: 'SEDE',
    manager: 'Lic. Valentina Morales',
    active: true,
  },
  {
    id: 'loc-val-01',
    code: 'VAL-01',
    name: 'Depósito Central Industrial (Valencia)',
    city: 'Valencia, Edo. Carabobo',
    type: 'DEPOSITO',
    manager: 'Ing. Alejandro Padrón',
    active: true,
  },
];

const EXTRA_CATALOG_SEEDS: Array<{
  sku: string;
  name: string;
  category: string;
  unit: Product['unit'];
  costUsd: number;
  margin: number;
  iva: 0 | 8 | 16;
  stockPzo: number;
  stockCcs: number;
  stockVal: number;
  abc: AbcClass;
}> = [
  { sku: 'HAR-JUA-1KG', name: 'Harina de Maíz Blanca Juana 1Kg', category: 'Víveres Secos', unit: 'UND', costUsd: 0.89, margin: 26, iva: 0, stockPzo: 420, stockCcs: 380, stockVal: 950, abc: 'A' },
  { sku: 'HAR-KAR-1KG', name: 'Harina de Maíz Kaly Precocida 1Kg', category: 'Víveres Secos', unit: 'UND', costUsd: 0.85, margin: 27, iva: 0, stockPzo: 310, stockCcs: 290, stockVal: 820, abc: 'A' },
  { sku: 'ARR-MAR-1KG', name: 'Arroz Blanco Mary Tradicional 1Kg', category: 'Víveres Secos', unit: 'UND', costUsd: 1.08, margin: 25, iva: 0, stockPzo: 360, stockCcs: 340, stockVal: 780, abc: 'A' },
  { sku: 'ARR-SAN-1KG', name: 'Arroz Cristal Santoni 1Kg', category: 'Víveres Secos', unit: 'UND', costUsd: 0.98, margin: 26, iva: 0, stockPzo: 280, stockCcs: 260, stockVal: 640, abc: 'B' },
  { sku: 'PAS-RON-500G', name: 'Pasta Corta Pluma Ronco 500g', category: 'Víveres Secos', unit: 'UND', costUsd: 0.82, margin: 28, iva: 0, stockPzo: 290, stockCcs: 250, stockVal: 690, abc: 'B' },
  { sku: 'PAS-CAP-1KG', name: 'Pasta Larga Capri Especial 1Kg', category: 'Víveres Secos', unit: 'UND', costUsd: 1.45, margin: 27, iva: 0, stockPzo: 220, stockCcs: 195, stockVal: 510, abc: 'B' },
  { sku: 'ACE-VAT-1LT', name: 'Aceite de Soya Vatel 1 Litro', category: 'Aceites y Grasas', unit: 'LT', costUsd: 2.15, margin: 28, iva: 16, stockPzo: 180, stockCcs: 165, stockVal: 440, abc: 'A' },
  { sku: 'ACE-COP-1LT', name: 'Aceite Vegetal Coposa 1 Litro', category: 'Aceites y Grasas', unit: 'LT', costUsd: 2.05, margin: 29, iva: 16, stockPzo: 195, stockCcs: 170, stockVal: 460, abc: 'B' },
  { sku: 'MAY-MAV-445G', name: 'Mayonesa Mavesa Tradicional 445g', category: 'Salsas y Condimentos', unit: 'UND', costUsd: 2.45, margin: 30, iva: 16, stockPzo: 240, stockCcs: 210, stockVal: 580, abc: 'A' },
  { sku: 'MAY-KRA-445G', name: 'Mayonesa Kraft Real 445g', category: 'Salsas y Condimentos', unit: 'UND', costUsd: 2.65, margin: 31, iva: 16, stockPzo: 150, stockCcs: 140, stockVal: 360, abc: 'B' },
  { sku: 'KET-PAM-397G', name: 'Salsa de Tomate Ketchup Pampero 397g', category: 'Salsas y Condimentos', unit: 'UND', costUsd: 1.65, margin: 29, iva: 16, stockPzo: 210, stockCcs: 185, stockVal: 490, abc: 'B' },
  { sku: 'KET-HEI-397G', name: 'Salsa de Tomate Heinz 397g', category: 'Salsas y Condimentos', unit: 'UND', costUsd: 1.92, margin: 30, iva: 16, stockPzo: 175, stockCcs: 160, stockVal: 410, abc: 'B' },
  { sku: 'LEC-CAM-1KG', name: 'Leche en Polvo Completa La Campiña 1Kg', category: 'Charcutería y Lácteos', unit: 'UND', costUsd: 6.80, margin: 26, iva: 0, stockPzo: 140, stockCcs: 135, stockVal: 350, abc: 'A' },
  { sku: 'LEC-PUR-1LT', name: 'Leche Líquida UHT Purísima 1 Litro', category: 'Charcutería y Lácteos', unit: 'LT', costUsd: 1.38, margin: 25, iva: 0, stockPzo: 260, stockCcs: 230, stockVal: 600, abc: 'A' },
  { sku: 'QUE-AMA-KG', name: 'Queso Amarillo Gouda Torondoy (Kg)', category: 'Charcutería y Lácteos', unit: 'KG', costUsd: 8.90, margin: 32, iva: 0, stockPzo: 85, stockCcs: 90, stockVal: 210, abc: 'A' },
  { sku: 'JAM-PLU-KG', name: 'Jamón de Pierna Cocido Plumrose (Kg)', category: 'Charcutería y Lácteos', unit: 'KG', costUsd: 6.45, margin: 33, iva: 16, stockPzo: 95, stockCcs: 105, stockVal: 240, abc: 'A' },
  { sku: 'SAL-PLU-200G', name: 'Salchichas Tipo Wieners Plumrose 200g', category: 'Charcutería y Lácteos', unit: 'UND', costUsd: 1.55, margin: 30, iva: 16, stockPzo: 190, stockCcs: 175, stockVal: 420, abc: 'B' },
  { sku: 'DIK-UNDER-120G', name: 'Diablitos Underwood Original 120g', category: 'Enlatados y Conservas', unit: 'UND', costUsd: 1.72, margin: 31, iva: 16, stockPzo: 230, stockCcs: 215, stockVal: 530, abc: 'A' },
  { sku: 'SAR-MAR-170G', name: 'Sardinas en Salsa de Tomate Margarita 170g', category: 'Enlatados y Conservas', unit: 'UND', costUsd: 0.68, margin: 28, iva: 0, stockPzo: 340, stockCcs: 310, stockVal: 790, abc: 'B' },
  { sku: 'ATU-MAR-140G', name: 'Atún Sólido en Agua Margarita 140g', category: 'Enlatados y Conservas', unit: 'UND', costUsd: 1.52, margin: 30, iva: 16, stockPzo: 185, stockCcs: 170, stockVal: 430, abc: 'B' },
  { sku: 'MAI-DEL-300G', name: 'Maíz Dulce en Granos Del Monte 300g', category: 'Enlatados y Conservas', unit: 'UND', costUsd: 1.18, margin: 29, iva: 16, stockPzo: 160, stockCcs: 145, stockVal: 380, abc: 'C' },
  { sku: 'CAR-PAN-500G', name: 'Caraotas Negras Seleccionadas Pantera 500g', category: 'Víveres Secos', unit: 'UND', costUsd: 1.10, margin: 27, iva: 0, stockPzo: 295, stockCcs: 275, stockVal: 680, abc: 'A' },
  { sku: 'LEN-PAN-500G', name: 'Lentejas Verdes Extra Pantera 500g', category: 'Víveres Secos', unit: 'UND', costUsd: 1.25, margin: 28, iva: 0, stockPzo: 210, stockCcs: 190, stockVal: 480, abc: 'B' },
  { sku: 'AVE-QUA-400G', name: 'Avena en Hojuelas Quaker 400g', category: 'Víveres Secos', unit: 'UND', costUsd: 1.35, margin: 29, iva: 0, stockPzo: 240, stockCcs: 225, stockVal: 540, abc: 'B' },
  { sku: 'CER-COR-300G', name: 'Cereal Corn Flakes Kellogg’s 300g', category: 'Víveres Secos', unit: 'UND', costUsd: 2.75, margin: 31, iva: 16, stockPzo: 130, stockCcs: 125, stockVal: 310, abc: 'B' },
  { sku: 'ACH-TOD-400G', name: 'Bebida Achocolatada Toddy 400g', category: 'Bebidas e Infusiones', unit: 'UND', costUsd: 3.40, margin: 30, iva: 16, stockPzo: 175, stockCcs: 165, stockVal: 410, abc: 'A' },
  { sku: 'CAF-FAM-500G', name: 'Café Molido Fama de América 500g', category: 'Bebidas e Infusiones', unit: 'UND', costUsd: 3.90, margin: 29, iva: 16, stockPzo: 160, stockCcs: 155, stockVal: 390, abc: 'A' },
  { sku: 'MAL-POL-1.5L', name: 'Malta Maltín Polar Retornable 1.5L', category: 'Bebidas e Infusiones', unit: 'LT', costUsd: 1.15, margin: 32, iva: 16, stockPzo: 310, stockCcs: 295, stockVal: 720, abc: 'A' },
  { sku: 'JUG-YUK-1LT', name: 'Néctar de Durazno Yukery 1 Litro', category: 'Bebidas e Infusiones', unit: 'LT', costUsd: 1.48, margin: 30, iva: 16, stockPzo: 190, stockCcs: 180, stockVal: 450, abc: 'B' },
  { sku: 'AGU-MIN-5LT', name: 'Agua Mineral Minalba Botellón 5 Litros', category: 'Bebidas e Infusiones', unit: 'LT', costUsd: 1.60, margin: 33, iva: 16, stockPzo: 220, stockCcs: 210, stockVal: 520, abc: 'B' },
  { sku: 'GAL-MAR-240G', name: 'Galletas María Puig Paquete 240g', category: 'Víveres Secos', unit: 'UND', costUsd: 0.95, margin: 30, iva: 16, stockPzo: 280, stockCcs: 260, stockVal: 620, abc: 'B' },
  { sku: 'GAL-SOD-240G', name: 'Galletas de Soda Puig 240g', category: 'Víveres Secos', unit: 'UND', costUsd: 1.05, margin: 30, iva: 16, stockPzo: 265, stockCcs: 250, stockVal: 590, abc: 'B' },
  { sku: 'SAL-REF-1KG', name: 'Sal Refinada Yodada Bahía 1Kg', category: 'Salsas y Condimentos', unit: 'UND', costUsd: 0.42, margin: 32, iva: 0, stockPzo: 390, stockCcs: 360, stockVal: 880, abc: 'C' },
  { sku: 'VIN-MAV-500ML', name: 'Vinagre Blanco Mavesa 500ml', category: 'Salsas y Condimentos', unit: 'LT', costUsd: 0.78, margin: 31, iva: 16, stockPzo: 180, stockCcs: 165, stockVal: 410, abc: 'C' },
  { sku: 'JAB-LAS-900G', name: 'Detergente en Polvo Las Llaves 900g', category: 'Hogar y Limpieza', unit: 'UND', costUsd: 1.95, margin: 29, iva: 16, stockPzo: 210, stockCcs: 195, stockVal: 490, abc: 'B' },
  { sku: 'PAP-ROS-4UND', name: 'Papel Higiénico Rosal Plus 4 Rollos', category: 'Hogar y Limpieza', unit: 'UND', costUsd: 1.80, margin: 30, iva: 16, stockPzo: 250, stockCcs: 235, stockVal: 580, abc: 'B' },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prd-001',
    sku: 'HAR-PAN-1KG',
    barcode: '7591001100105',
    name: 'Harina de Maíz Precocida P.A.N. 1Kg',
    category: 'Víveres Secos',
    unit: 'UND',
    costUsd: 0.92,
    targetMarginPercent: 26.0,
    priceUsd: 1.24,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 540, 'loc-ccs-01': 410, 'loc-val-01': 1250 },
    minStockByLocation: { 'loc-pzo-01': 200, 'loc-ccs-01': 180, 'loc-val-01': 500 },
    monthlyUnitsSold: 3200,
    abcClass: 'A',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-03-25T14:20:00-04:00',
  },
  {
    id: 'prd-002',
    sku: 'ACE-MAZ-1LT',
    barcode: '7591001200454',
    name: 'Aceite Vegetal Mazeite 1 Litro',
    category: 'Aceites y Grasas',
    unit: 'LT',
    costUsd: 2.35,
    targetMarginPercent: 28.0,
    priceUsd: 3.26,
    ivaRate: 16,
    stockByLocation: { 'loc-pzo-01': 85, 'loc-ccs-01': 140, 'loc-val-01': 420 },
    minStockByLocation: { 'loc-pzo-01': 100, 'loc-ccs-01': 100, 'loc-val-01': 250 },
    monthlyUnitsSold: 1450,
    abcClass: 'A',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-03-25T14:20:00-04:00',
  },
  {
    id: 'prd-003',
    sku: 'ARR-PRI-1KG',
    barcode: '7591002300115',
    name: 'Arroz Blanco Mesa Primor Clásico 1Kg',
    category: 'Víveres Secos',
    unit: 'UND',
    costUsd: 1.05,
    targetMarginPercent: 25.0,
    priceUsd: 1.4,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 390, 'loc-ccs-01': 280, 'loc-val-01': 890 },
    minStockByLocation: { 'loc-pzo-01': 150, 'loc-ccs-01': 150, 'loc-val-01': 400 },
    monthlyUnitsSold: 2400,
    abcClass: 'A',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-03-25T14:20:00-04:00',
  },
  {
    id: 'prd-004',
    sku: 'QUE-PAI-KG',
    barcode: '7592004500192',
    name: 'Queso Blanco Pasteurizado Paisa (Kg)',
    category: 'Charcutería y Lácteos',
    unit: 'KG',
    costUsd: 5.4,
    targetMarginPercent: 32.0,
    priceUsd: 7.94,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 42, 'loc-ccs-01': 64, 'loc-val-01': 115 },
    minStockByLocation: { 'loc-pzo-01': 50, 'loc-ccs-01': 50, 'loc-val-01': 90 },
    monthlyUnitsSold: 690,
    abcClass: 'A',
    supplierId: 'sup-002',
    lastUpdatedVet: '2026-03-25T14:20:00-04:00',
  },
  {
    id: 'prd-005',
    sku: 'CAF-MAD-500G',
    barcode: '7593001900881',
    name: 'Café Molido Gourmet Madrid 500g',
    category: 'Bebidas e Infusiones',
    unit: 'UND',
    costUsd: 3.85,
    targetMarginPercent: 30.0,
    priceUsd: 5.5,
    ivaRate: 16,
    stockByLocation: { 'loc-pzo-01': 110, 'loc-ccs-01': 95, 'loc-val-01': 260 },
    minStockByLocation: { 'loc-pzo-01': 80, 'loc-ccs-01': 80, 'loc-val-01': 180 },
    monthlyUnitsSold: 540,
    abcClass: 'B',
    supplierId: 'sup-003',
    lastUpdatedVet: '2026-03-25T14:20:00-04:00',
  },
  {
    id: 'prd-006',
    sku: 'AZU-MON-1KG',
    barcode: '7591009988112',
    name: 'Azúcar Refinada Montalbán 1Kg',
    category: 'Víveres Secos',
    unit: 'UND',
    costUsd: 1.12,
    targetMarginPercent: 24.0,
    priceUsd: 1.47,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 210, 'loc-ccs-01': 65, 'loc-val-01': 510 },
    minStockByLocation: { 'loc-pzo-01': 120, 'loc-ccs-01': 100, 'loc-val-01': 300 },
    monthlyUnitsSold: 1380,
    abcClass: 'B',
    supplierId: 'sup-003',
    lastUpdatedVet: '2026-03-25T14:20:00-04:00',
  },
  {
    id: 'prd-007',
    sku: 'PAS-PRI-500G',
    barcode: '7591001554321',
    name: 'Pasta Alimenticia Vermicelli Primor 500g',
    category: 'Víveres Secos',
    unit: 'UND',
    costUsd: 0.78,
    targetMarginPercent: 27.0,
    priceUsd: 1.07,
    ivaRate: 0,
    stockByLocation: { 'loc-pzo-01': 320, 'loc-ccs-01': 290, 'loc-val-01': 740 },
    minStockByLocation: { 'loc-pzo-01': 150, 'loc-ccs-01': 150, 'loc-val-01': 350 },
    monthlyUnitsSold: 1120,
    abcClass: 'B',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-03-25T14:20:00-04:00',
  },
  {
    id: 'prd-008',
    sku: 'MAR-MAV-500G',
    barcode: '7591001776543',
    name: 'Margarina con Sal Mavesa 500g',
    category: 'Refrigerados',
    unit: 'UND',
    costUsd: 1.85,
    targetMarginPercent: 29.0,
    priceUsd: 2.61,
    ivaRate: 16,
    stockByLocation: { 'loc-pzo-01': 95, 'loc-ccs-01': 120, 'loc-val-01': 310 },
    minStockByLocation: { 'loc-pzo-01': 90, 'loc-ccs-01': 90, 'loc-val-01': 200 },
    monthlyUnitsSold: 430,
    abcClass: 'C',
    supplierId: 'sup-001',
    lastUpdatedVet: '2026-03-25T14:20:00-04:00',
  },
  {
    id: 'prd-009',
    sku: 'ATU-EVE-140G',
    barcode: '7594002112233',
    name: 'Atún Lomito en Aceite Eveba 140g',
    category: 'Enlatados y Conservas',
    unit: 'UND',
    costUsd: 1.48,
    targetMarginPercent: 31.0,
    priceUsd: 2.14,
    ivaRate: 16,
    stockByLocation: { 'loc-pzo-01': 45, 'loc-ccs-01': 80, 'loc-val-01': 190 },
    minStockByLocation: { 'loc-pzo-01': 60, 'loc-ccs-01': 60, 'loc-val-01': 150 },
    monthlyUnitsSold: 290,
    abcClass: 'C',
    supplierId: 'sup-003',
    lastUpdatedVet: '2026-03-25T14:20:00-04:00',
  },
  ...EXTRA_CATALOG_SEEDS.map((seed, index) => {
    const seq = index + 10;
    const priceUsd = calculatePriceFromMargin(seed.costUsd, seed.margin);
    return {
      id: `prd-${String(seq).padStart(3, '0')}`,
      sku: seed.sku,
      barcode: `759100900${String(seq).padStart(4, '0')}`,
      name: seed.name,
      category: seed.category,
      unit: seed.unit,
      costUsd: seed.costUsd,
      targetMarginPercent: seed.margin,
      priceUsd,
      ivaRate: seed.iva,
      stockByLocation: {
        'loc-pzo-01': seed.stockPzo,
        'loc-ccs-01': seed.stockCcs,
        'loc-val-01': seed.stockVal,
      },
      minStockByLocation: {
        'loc-pzo-01': 70,
        'loc-ccs-01': 70,
        'loc-val-01': 160,
      },
      monthlyUnitsSold: Math.round((seed.stockPzo + seed.stockCcs) * 1.6),
      abcClass: seed.abc,
      supplierId: seq % 3 === 0 ? 'sup-003' : seq % 2 === 0 ? 'sup-002' : 'sup-001',
      lastUpdatedVet: '2026-03-25T14:20:00-04:00',
    };
  }),
];

const INITIAL_TRANSFERS: StockTransfer[] = [
  {
    id: 'trf-2026-001',
    reference: 'GUIA-TRF-00192',
    fromLocationId: 'loc-val-01',
    toLocationId: 'loc-pzo-01',
    productId: 'prd-001',
    productName: 'Harina de Maíz Precocida P.A.N. 1Kg',
    sku: 'HAR-PAN-1KG',
    quantity: 200,
    unitCostUsd: 0.92,
    totalValueUsd: 184.0,
    status: 'COMPLETADO',
    createdBy: 'rdrj.mppd@gmail.com',
    createdAtVet: '2026-03-22T10:15:00-04:00',
    notes: 'Reposición programada desde Depósito Valencia con Guía SADA.',
  },
];

const STORAGE_KEY_LOCATIONS = 'chrystal_erp_locations_v2';
const STORAGE_KEY_PRODUCTS = 'chrystal_erp_products_v2';
const STORAGE_KEY_TRANSFERS = 'chrystal_erp_transfers_v1';
const STORAGE_KEY_PURCHASE_ORDERS = 'chrystal_erp_purchase_orders_v1';
const STORAGE_KEY_MANUAL_RECEIPTS = 'chrystal_erp_manual_receipts_v1';
const STORAGE_KEY_DISCARDS = 'chrystal_erp_discards_v1';

export const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    bcvState,
    suppliers,
    invoices,
    payments,
    closures,
    resetFinanceState,
    restoreFinanceState,
  } = useFinance();
  const { user, isAuthenticated, sessionHistory } = useAuth();

  const [locations, setLocations] = useState<LocationNode[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LOCATIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 1) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_LOCATIONS;
  });

  const [selectedLocationId, setSelectedLocationId] = useState<string>('ALL');
  const [isAddLocationModalOpen, setIsAddLocationModalOpen] = useState<boolean>(false);
  const [locationToDelete, setLocationToDelete] = useState<LocationNode | null>(null);

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRODUCTS);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_PRODUCTS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    return loadStoredAuditLogs();
  });

  const [transfers, setTransfers] = useState<StockTransfer[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TRANSFERS);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return INITIAL_TRANSFERS;
  });

  const [purchaseOrders, setPurchaseOrders] = useState<SupplierPurchaseOrder[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PURCHASE_ORDERS);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  const [manualReceipts, setManualReceipts] = useState<PostPurchaseManualReceipt[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MANUAL_RECEIPTS);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  const [salesEvents, setSalesEvents] = useState<SalesSyncEvent[]>([]);
  const [draftPurchaseTarget, setDraftPurchaseTarget] = useState<DraftPurchaseTarget | null>(null);

  const [discards, setDiscards] = useState<InventoryDiscardRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DISCARDS);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_INVENTORY_DISCARDS;
  });

  const pendingDiscardsCount = useMemo(() => {
    return discards.filter((d) => d.status === 'PENDIENTE_AUTORIZACION').length;
  }, [discards]);

  // Persist locations
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_LOCATIONS, JSON.stringify(locations));
    } catch {
      // ignore
    }
  }, [locations]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PURCHASE_ORDERS, JSON.stringify(purchaseOrders));
    } catch {
      // ignore
    }
  }, [purchaseOrders]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MANUAL_RECEIPTS, JSON.stringify(manualReceipts));
    } catch {
      // ignore
    }
  }, [manualReceipts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DISCARDS, JSON.stringify(discards));
    } catch {
      // ignore
    }
  }, [discards]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));
    } catch {
      // ignore
    }
  }, [products]);

  useEffect(() => {
    saveAuditLogs(auditLogs);
  }, [auditLogs]);

  // Add new Sede or Depósito with RBAC + PIN verification and automatically sync all product stock maps
  const addLocationOrDepot = (input: CreateLocationNodeInput) => {
    const creation = createNewLocationOrDepot(input, locations, user);
    if (!creation.success || !creation.location) {
      return creation;
    }

    const newLoc = creation.location;
    const nextLocations = [...locations, newLoc];
    setLocations(nextLocations);
    setProducts((prev) => syncProductStockMapsForLocations(prev, nextLocations, 0));
    return {
      success: true,
      location: newLoc,
    };
  };

  // Delete an existing Sede or Depósito with RBAC (SUPERADMIN / GERENTE) + PIN verification
  const deleteLocationOrDepot = (locationId: string, authCode: string) => {
    const deletion = deleteLocationOrDepotWithAuth(locationId, locations, user, authCode);
    if (!deletion.success || !deletion.remainingLocations || !deletion.deletedLocation) {
      return {
        success: false,
        error: deletion.error,
      };
    }

    setLocations(deletion.remainingLocations);
    setProducts((prev) => removeLocationFromProductStockMaps(prev, locationId));
    if (selectedLocationId === locationId) {
      setSelectedLocationId('ALL');
    }

    return {
      success: true,
      deletedLocation: deletion.deletedLocation,
    };
  };

  // Configure manual risk level, reorder point, and safety stock multiplier for any SKU & Sede/Depósito
  const configureProductRiskIndicator = (params: {
    productId: string;
    locationId: string;
    manualRiskMode: ManualRiskMode;
    reorderPoint: number;
    safetyMultiplier: number;
  }) => {
    const vetNow = getCaracasNow().isoTimestamp;
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== params.productId) return p;
        return {
          ...p,
          minStockByLocation: {
            ...p.minStockByLocation,
            [params.locationId]: Math.max(0, round2(params.reorderPoint)),
          },
          manualRiskByLocation: {
            ...(p.manualRiskByLocation || {}),
            [params.locationId]: params.manualRiskMode,
          },
          safetyMultiplierByLocation: {
            ...(p.safetyMultiplierByLocation || {}),
            [params.locationId]: Math.max(1.0, round2(params.safetyMultiplier)),
          },
          lastUpdatedVet: vetNow,
        };
      })
    );
  };

  // Real-time Reorder Point Alerts evaluation
  const reorderAlerts = useMemo(() => {
    return evaluateReorderAlerts(
      products,
      locations,
      bcvState.activeRate,
      getCaracasNow().isoTimestamp
    );
  }, [products, locations, bcvState.activeRate]);

  // Create a Purchase Order to Supplier in PENDIENTE_ENTREGA status (does not increment stock until confirmed)
  const createReplenishmentOrderFromAlert = (
    alertId: string,
    customOrderedQty?: number,
    customSupplierId?: string,
    notes?: string
  ) => {
    const alert = reorderAlerts.find((a) => a.id === alertId);
    if (!alert) {
      return { success: false, error: 'Alerta de punto de pedido no encontrada.' };
    }

    const existingPending = purchaseOrders.find(
      (po) =>
        po.status === 'PENDIENTE_ENTREGA' &&
        po.productId === alert.productId &&
        po.locationId === alert.locationId
    );
    if (existingPending) {
      return {
        success: false,
        error: `Ya existe un pedido pendiente de entrega (${existingPending.orderNumber}) para este SKU en ${alert.locationCode}. Confirme su recepción primero.`,
      };
    }

    const prod = products.find((p) => p.id === alert.productId);
    const chosenSupplierId = customSupplierId || prod?.supplierId || suppliers[0]?.id || 'sup-001';
    const supplierObj =
      suppliers.find((s) => s.id === chosenSupplierId) ||
      suppliers[0] || {
        id: 'sup-001',
        name: 'Alimentos Polar Comercial, C.A.',
      };

    const orderedQty = Math.max(1, round2(customOrderedQty ?? alert.suggestedOrderQty));
    const unitCostUsd = alert.unitCostUsd;
    const totalCostUsd = round2(toDecimal(orderedQty).times(unitCostUsd));
    const totalCostVes = round2(toDecimal(totalCostUsd).times(bcvState.activeRate));
    const vetNow = getCaracasNow().isoTimestamp;

    const newOrder: SupplierPurchaseOrder = {
      id: `po-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
      orderNumber: `ORD-2026-${String(purchaseOrders.length + 101).padStart(4, '0')}`,
      alertId: alert.id,
      productId: alert.productId,
      sku: alert.sku,
      productName: alert.productName,
      unit: alert.unit,
      locationId: alert.locationId,
      locationCode: alert.locationCode,
      locationName: alert.locationName,
      supplierId: supplierObj.id,
      supplierName: supplierObj.name,
      orderedQty,
      unitCostUsd,
      totalCostUsd,
      totalCostVes,
      bcvRateAtOrder: bcvState.activeRate,
      status: 'PENDIENTE_ENTREGA',
      createdBy: user?.email || 'rdrj.mppd@gmail.com',
      createdAtVet: vetNow,
      notes: notes || 'Pedido generado por alerta de punto de reorden.',
    };

    setPurchaseOrders((prev) => [newOrder, ...prev]);
    dismissToastAlert(alertId);

    return {
      success: true,
      order: newOrder,
    };
  };

  // Create a Manual Purchase Order from the Dedicated Compras Module (with 7/15/30/45/60 day rotation simulation & manual override)
  const createManualPurchaseOrder = (params: {
    productId: string;
    locationId: string;
    supplierId: string;
    orderedQty: number;
    unitCostUsd: number;
    horizonDaysUsed: RotationHorizonDays;
    systemSuggestedQty: number;
    notes?: string;
    alertId?: string;
  }) => {
    const product = products.find((p) => p.id === params.productId);
    if (!product) {
      return { success: false, error: 'Producto no encontrado en el catálogo maestro.' };
    }
    const locObj = locations.find((l) => l.id === params.locationId);
    if (!locObj) {
      return { success: false, error: 'Sede o Depósito destino no encontrado.' };
    }

    const orderedQty = round2(params.orderedQty);
    if (orderedQty <= 0) {
      return {
        success: false,
        error: 'La cantidad manual a solicitar debe ser mayor a cero (0).',
      };
    }

    const existingPending = purchaseOrders.find(
      (po) =>
        po.status === 'PENDIENTE_ENTREGA' &&
        po.productId === product.id &&
        po.locationId === locObj.id
    );
    if (existingPending) {
      return {
        success: false,
        error: `Ya existe un pedido pendiente de entrega (${existingPending.orderNumber}) para ${product.sku} en ${locObj.code}. Confirme su recepción primero.`,
      };
    }

    const supplierObj =
      suppliers.find((s) => s.id === params.supplierId) ||
      suppliers[0] || {
        id: 'sup-001',
        name: 'Alimentos Polar Comercial, C.A.',
      };

    const unitCostUsd = Math.max(0.01, round2(params.unitCostUsd || product.costUsd));
    const totalCostUsd = round2(toDecimal(orderedQty).times(unitCostUsd));
    const totalCostVes = round2(toDecimal(totalCostUsd).times(bcvState.activeRate));
    const vetNow = getCaracasNow().isoTimestamp;

    const newOrder: SupplierPurchaseOrder = {
      id: `po-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
      orderNumber: `ORD-2026-${String(purchaseOrders.length + 101).padStart(4, '0')}`,
      alertId: params.alertId,
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      unit: product.unit,
      locationId: locObj.id,
      locationCode: locObj.code,
      locationName: locObj.name,
      supplierId: supplierObj.id,
      supplierName: supplierObj.name,
      orderedQty,
      systemSuggestedQty: round2(params.systemSuggestedQty),
      horizonDaysUsed: params.horizonDaysUsed,
      unitCostUsd,
      totalCostUsd,
      totalCostVes,
      bcvRateAtOrder: bcvState.activeRate,
      status: 'PENDIENTE_ENTREGA',
      createdBy: user?.email || 'rdrj.mppd@gmail.com',
      createdAtVet: vetNow,
      notes:
        params.notes?.trim() ||
        `Pedido manual calculado en Central de Compras (Simulación rotación ${params.horizonDaysUsed} días · Sugerido sistema: ${params.systemSuggestedQty} ${product.unit}).`,
    };

    setPurchaseOrders((prev) => [newOrder, ...prev]);
    if (params.alertId) {
      dismissToastAlert(params.alertId);
    }

    return {
      success: true,
      order: newOrder,
    };
  };

  // Confirm delivery of a pending Purchase Order and inject stock into the target Sede or Depósito
  const confirmPurchaseOrderDelivery = (orderId: string, actualReceivedQty?: number) => {
    const order = purchaseOrders.find((po) => po.id === orderId);
    if (!order) {
      return { success: false, error: 'Orden de pedido no encontrada en el sistema.' };
    }
    if (order.status === 'RECIBIDO_CONFORME') {
      return { success: false, error: 'Este pedido ya fue confirmado y recibido en inventario.' };
    }

    const receivedQty = Math.max(1, round2(actualReceivedQty ?? order.orderedQty));
    const vetNow = getCaracasNow().isoTimestamp;

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== order.productId) return p;
        const currentStock = p.stockByLocation[order.locationId] ?? 0;
        const nextManualRisk = p.manualRiskByLocation
          ? { ...p.manualRiskByLocation, [order.locationId]: 'AUTOMATICO' as ManualRiskMode }
          : undefined;
        return {
          ...p,
          stockByLocation: {
            ...p.stockByLocation,
            [order.locationId]: round2(toDecimal(currentStock).plus(receivedQty)),
          },
          manualRiskByLocation: nextManualRisk,
          lastUpdatedVet: vetNow,
        };
      })
    );

    const updatedOrder: SupplierPurchaseOrder = {
      ...order,
      receivedQty,
      status: 'RECIBIDO_CONFORME',
      receivedBy: user?.email || 'rdrj.mppd@gmail.com',
      receivedAtVet: vetNow,
    };

    setPurchaseOrders((prev) => prev.map((po) => (po.id === orderId ? updatedOrder : po)));
    return {
      success: true,
      order: updatedOrder,
    };
  };

  // Manual post-purchase / post-order product reception (existing SKU or brand new SKU)
  const registerPostPurchaseManualReceipt = (input: ManualReceiptInput) => {
    const qty = round2(input.qtyReceived);
    if (qty <= 0) {
      return { success: false, error: 'La cantidad recibida debe ser mayor a cero (0).' };
    }
    const cost = Math.max(0.01, round2(input.unitCostUsd));
    const locObj = locations.find((l) => l.id === input.locationId) || locations[0];
    if (!locObj) {
      return { success: false, error: 'Seleccione una Sede o Depósito receptor válido.' };
    }

    const vetNow = getCaracasNow().isoTimestamp;
    let targetProductId = input.existingProductId || '';
    let finalSku = input.sku.trim().toUpperCase();
    let finalName = input.productName.trim();
    let finalCategory = input.category.trim() || 'Víveres Secos';
    let finalUnit = input.unit;

    if (!input.isNewProduct) {
      const existingProd = products.find(
        (p) =>
          p.id === input.existingProductId ||
          p.sku.toUpperCase() === finalSku
      );
      if (!existingProd) {
        return {
          success: false,
          error: 'Seleccione un producto existente válido del catálogo o elija "Nuevo Producto".',
        };
      }
      targetProductId = existingProd.id;
      finalSku = existingProd.sku;
      finalName = existingProd.name;
      finalCategory = existingProd.category;
      finalUnit = existingProd.unit;

      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== existingProd.id) return p;
          const curStock = p.stockByLocation[locObj.id] ?? 0;
          const curMin = p.minStockByLocation[locObj.id] ?? 0;
          const newPrice = calculatePriceFromMargin(cost, p.targetMarginPercent);
          return {
            ...p,
            costUsd: cost,
            priceUsd: newPrice,
            stockByLocation: {
              ...p.stockByLocation,
              [locObj.id]: round2(toDecimal(curStock).plus(qty)),
            },
            minStockByLocation: {
              ...p.minStockByLocation,
              [locObj.id]: input.reorderPoint !== undefined ? input.reorderPoint : Math.max(curMin, 40),
            },
            lastUpdatedVet: vetNow,
          };
        })
      );
    } else {
      if (!finalSku || !finalName) {
        return {
          success: false,
          error: 'Para registrar un nuevo producto que llega de compra debe indicar SKU y Nombre.',
        };
      }
      targetProductId = `prd-post-${Date.now()}`;
      const margin = Math.min(95, Math.max(5, input.targetMarginPercent || 28));
      const priceUsd = calculatePriceFromMargin(cost, margin);

      const stockMap: Record<string, number> = {};
      const minMap: Record<string, number> = {};
      for (const l of locations) {
        stockMap[l.id] = l.id === locObj.id ? qty : 0;
        minMap[l.id] = l.id === locObj.id ? Math.max(10, input.reorderPoint ?? 50) : 0;
      }

      const newProduct: Product = {
        id: targetProductId,
        sku: finalSku,
        barcode:
          input.barcode?.trim() ||
          `759100${Math.floor(1000000 + Math.random() * 8999999)}`,
        name: finalName,
        category: finalCategory,
        unit: finalUnit,
        costUsd: cost,
        targetMarginPercent: margin,
        priceUsd,
        ivaRate: input.ivaRate,
        stockByLocation: stockMap,
        minStockByLocation: minMap,
        monthlyUnitsSold: Math.max(20, Math.round(qty * 1.2)),
        abcClass: 'B',
        supplierId: suppliers[0]?.id || 'sup-001',
        lastUpdatedVet: vetNow,
      };

      setProducts((prev) => [newProduct, ...prev]);
    }

    const receipt: PostPurchaseManualReceipt = {
      id: `rcp-${Date.now()}`,
      receiptCode: `REC-2026-${String(manualReceipts.length + 501).padStart(4, '0')}`,
      orderNumberRef: input.orderNumberRef?.trim() || 'COMPRA-DIRECTA',
      isNewProduct: input.isNewProduct,
      productId: targetProductId,
      sku: finalSku,
      productName: finalName,
      category: finalCategory,
      unit: finalUnit,
      locationId: locObj.id,
      locationCode: locObj.code,
      qtyReceived: qty,
      unitCostUsd: cost,
      totalCostUsd: round2(toDecimal(qty).times(cost)),
      registeredBy: user?.email || 'rdrj.mppd@gmail.com',
      receivedAtVet: vetNow,
    };

    setManualReceipts((prev) => [receipt, ...prev]);
    return {
      success: true,
      receipt,
    };
  };

  const [liveToastAlerts, setLiveToastAlerts] = useState<ReorderAlertItem[]>([]);
  const [readAlertIds, setReadAlertIds] = useState<Record<string, boolean>>({});
  const [sessionStartupAlertShown, setSessionStartupAlertShown] = useState(false);

  const prevAlertStockMapRef = useRef<Record<string, number>>({});
  const wasAuthenticatedRef = useRef<boolean>(false);

  // Trigger alerts immediately when user opens session (logs in) or when stock drops in real time
  useEffect(() => {
    if (!isAuthenticated) {
      wasAuthenticatedRef.current = false;
      setSessionStartupAlertShown(false);
      setLiveToastAlerts([]);
      return;
    }

    const isSessionJustOpened = !wasAuthenticatedRef.current;
    wasAuthenticatedRef.current = true;

    const triggered = detectRealtimeTriggeredAlerts(
      prevAlertStockMapRef.current,
      reorderAlerts,
      isSessionJustOpened
    );

    const nextMap: Record<string, number> = {};
    for (const al of reorderAlerts) {
      nextMap[al.id] = al.currentStock;
    }
    prevAlertStockMapRef.current = nextMap;

    if (isSessionJustOpened && reorderAlerts.length > 0) {
      setSessionStartupAlertShown(true);
      setLiveToastAlerts(reorderAlerts.slice(0, 4));
      return;
    }

    if (triggered.length > 0) {
      setReadAlertIds((prev) => {
        const next = { ...prev };
        for (const t of triggered) {
          delete next[t.id];
        }
        return next;
      });

      setLiveToastAlerts((prev) => {
        const merged = [...triggered, ...prev.filter((p) => !triggered.some((t) => t.id === p.id))];
        return merged.slice(0, 4);
      });
    }
  }, [isAuthenticated, reorderAlerts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));
    } catch {
      // ignore
    }
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TRANSFERS, JSON.stringify(transfers));
    } catch {
      // ignore
    }
  }, [transfers]);

  const unreadAlertsCount = useMemo(() => {
    return reorderAlerts.filter((a) => !readAlertIds[a.id]).length;
  }, [reorderAlerts, readAlertIds]);

  const dismissToastAlert = (alertId: string) => {
    setLiveToastAlerts((prev) => prev.filter((a) => a.id !== alertId));
    setReadAlertIds((prev) => ({ ...prev, [alertId]: true }));
  };

  const dismissAllToasts = () => {
    setLiveToastAlerts([]);
    setSessionStartupAlertShown(false);
  };

  const markAllAlertsAsRead = () => {
    const next: Record<string, boolean> = {};
    for (const a of reorderAlerts) {
      next[a.id] = true;
    }
    setReadAlertIds(next);
    setLiveToastAlerts([]);
  };

  const triggerRealtimeStockDropDemo = (): ReorderAlertItem | null => {
    const vetNow = getCaracasNow().isoTimestamp;
    let targetProd: Product | undefined;
    let targetLocId = locations[0]?.id || 'loc-pzo-01';
    let newStockVal = 15;

    for (const p of products) {
      for (const loc of locations) {
        const cur = p.stockByLocation[loc.id] ?? 0;
        const min = p.minStockByLocation[loc.id] ?? 0;
        if (cur > min && min > 0) {
          targetProd = p;
          targetLocId = loc.id;
          newStockVal = Math.max(5, Math.floor(min * 0.4));
          break;
        }
      }
      if (targetProd) break;
    }

    if (!targetProd) {
      targetProd = products[0];
      targetLocId = locations[0]?.id || 'loc-pzo-01';
      newStockVal = Math.max(1, (targetProd.stockByLocation[targetLocId] ?? 20) - 10);
    }

    const updatedProd: Product = {
      ...targetProd,
      stockByLocation: {
        ...targetProd.stockByLocation,
        [targetLocId]: newStockVal,
      },
      lastUpdatedVet: vetNow,
    };

    setProducts((prev) => prev.map((p) => (p.id === updatedProd.id ? updatedProd : p)));

    const locObj = locations.find((l) => l.id === targetLocId) || locations[0];
    const simulatedEval = evaluateReorderAlerts(
      [updatedProd],
      [locObj],
      bcvState.activeRate,
      vetNow
    );
    return simulatedEval[0] || null;
  };

  const replenishAlertStock = (alertId: string) => {
    createReplenishmentOrderFromAlert(alertId);
  };

  const addOrUpdateProduct = (product: Product) => {
    const syncedProduct = syncProductStockMapsForLocations([product], locations, 40)[0];
    setProducts((prev) => {
      const exists = prev.some((p) => p.id === syncedProduct.id || p.sku === syncedProduct.sku);
      if (exists) {
        return prev.map((p) =>
          p.id === syncedProduct.id || p.sku === syncedProduct.sku ? syncedProduct : p
        );
      }
      return [syncedProduct, ...prev];
    });
  };

  const updateProductPricing = (productId: string, newCostUsd: number, newMarginPct: number) => {
    const newPriceUsd = calculatePriceFromMargin(newCostUsd, newMarginPct);
    const vetNow = getCaracasNow().isoTimestamp;
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId
          ? {
              ...p,
              costUsd: round2(newCostUsd),
              targetMarginPercent: round2(newMarginPct),
              priceUsd: newPriceUsd,
              lastUpdatedVet: vetNow,
            }
          : p
      )
    );
  };

  const executeStockTransfer = (
    productId: string,
    fromLocationId: string,
    toLocationId: string,
    qty: number,
    notes: string,
    createdBy: string
  ) => {
    if (fromLocationId === toLocationId) {
      return {
        success: false,
        error: 'La sede o depósito de origen y destino no pueden ser el mismo.',
      };
    }
    if (qty <= 0) {
      return { success: false, error: 'La cantidad a transferir debe ser mayor a cero (0).' };
    }

    const product = products.find((p) => p.id === productId);
    if (!product) {
      return { success: false, error: 'Producto no encontrado en el catálogo maestro.' };
    }

    const available = product.stockByLocation[fromLocationId] ?? 0;
    if (available < qty) {
      return {
        success: false,
        error: `Stock insuficiente en la sede o depósito de origen. Disponible: ${available} ${product.unit}.`,
      };
    }

    const vetNow = getCaracasNow().isoTimestamp;
    const totalValueUsd = round2(toDecimal(product.costUsd).times(qty));

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const fromCurrent = p.stockByLocation[fromLocationId] ?? 0;
        const toCurrent = p.stockByLocation[toLocationId] ?? 0;
        return {
          ...p,
          stockByLocation: {
            ...p.stockByLocation,
            [fromLocationId]: round2(toDecimal(fromCurrent).minus(qty)),
            [toLocationId]: round2(toDecimal(toCurrent).plus(qty)),
          },
          lastUpdatedVet: vetNow,
        };
      })
    );

    const newTransfer: StockTransfer = {
      id: `trf-${Date.now()}`,
      reference: `GUIA-TRF-${String(transfers.length + 193).padStart(5, '0')}`,
      fromLocationId,
      toLocationId,
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      quantity: qty,
      unitCostUsd: product.costUsd,
      totalValueUsd,
      status: 'COMPLETADO',
      createdBy,
      createdAtVet: vetNow,
      notes: notes || 'Transferencia entre Sede / Depósito ejecutada.',
    };

    setTransfers((prev) => [newTransfer, ...prev]);
    return { success: true };
  };

  const applyChrystalImport = (
    result: ChrystalParseResult,
    targetLocationId: string,
    mode: 'REPLACE' | 'ADD'
  ) => {
    let updated = 0;
    let created = 0;
    const vetNow = getCaracasNow().isoTimestamp;

    setProducts((prev) => {
      const next = [...prev];

      for (const row of result.rows) {
        const normalizedName = row.productNameColB.trim().toLowerCase();
        const existingIndex = next.findIndex(
          (p) =>
            p.name.trim().toLowerCase() === normalizedName ||
            (row.skuColA && p.sku.trim().toLowerCase() === row.skuColA.trim().toLowerCase())
        );

        if (existingIndex >= 0) {
          const item = next[existingIndex];
          const currentLocStock = item.stockByLocation[targetLocationId] ?? 0;
          const newLocStock =
            mode === 'REPLACE'
              ? row.stockQuantityColF
              : round2(toDecimal(currentLocStock).plus(row.stockQuantityColF));

          const newCost = row.costUsdColD && row.costUsdColD > 0 ? row.costUsdColD : item.costUsd;
          const newPrice =
            row.priceUsdColE && row.priceUsdColE > 0
              ? row.priceUsdColE
              : calculatePriceFromMargin(newCost, item.targetMarginPercent);

          next[existingIndex] = {
            ...item,
            costUsd: newCost,
            priceUsd: newPrice,
            targetMarginPercent: calculateGrossMarginPercent(newCost, newPrice),
            stockByLocation: {
              ...item.stockByLocation,
              [targetLocationId]: newLocStock,
            },
            lastUpdatedVet: vetNow,
          };
          updated++;
        } else {
          const costUsd = row.costUsdColD && row.costUsdColD > 0 ? row.costUsdColD : 1.0;
          const priceUsd =
            row.priceUsdColE && row.priceUsdColE > 0
              ? row.priceUsdColE
              : calculatePriceFromMargin(costUsd, 28);

          const initialStockMap: Record<string, number> = {};
          const initialMinMap: Record<string, number> = {};
          for (const loc of locations) {
            initialStockMap[loc.id] = loc.id === targetLocationId ? row.stockQuantityColF : 0;
            initialMinMap[loc.id] =
              loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 100 : 50;
          }

          const newProd: Product = {
            id: `prd-chr-${Date.now()}-${created}`,
            sku: row.skuColA || `CHR-${String(next.length + created + 1).padStart(4, '0')}`,
            barcode: `7599900${String(next.length + created + 1).padStart(6, '0')}`,
            name: row.productNameColB,
            category: row.categoryColC || 'Importado Chrystal®',
            unit: 'UND',
            costUsd,
            priceUsd,
            targetMarginPercent: calculateGrossMarginPercent(costUsd, priceUsd),
            ivaRate: 16,
            stockByLocation: initialStockMap,
            minStockByLocation: initialMinMap,
            monthlyUnitsSold: Math.max(25, Math.round(row.stockQuantityColF * 1.4)),
            abcClass: 'B',
            supplierId: 'sup-001',
            lastUpdatedVet: vetNow,
          };
          next.push(newProd);
          created++;
        }
      }

      return next;
    });

    return { updated, created };
  };

  const simulatePosWebhookSale = (
    locationId: string,
    items: Array<{ sku: string; qty: number }>
  ) => {
    if (!items.length) {
      return { success: false, error: 'El payload JSON no contiene ítems para descontar.' };
    }

    const vetNow = getCaracasNow().isoTimestamp;
    const eventItems: SalesSyncEvent['items'] = [];
    let totalUsd = toDecimal(0);

    for (const reqItem of items) {
      const prod = products.find((p) => p.sku.toLowerCase() === reqItem.sku.toLowerCase());
      if (!prod) {
        return {
          success: false,
          error: `SKU no encontrado en catálogo maestro: ${reqItem.sku}`,
        };
      }
      const currentStock = prod.stockByLocation[locationId] ?? 0;
      if (currentStock < reqItem.qty) {
        return {
          success: false,
          error: `Stock insuficiente en sede/depósito ${locationId} para ${prod.name}. Disponible: ${currentStock}`,
        };
      }
      eventItems.push({
        sku: prod.sku,
        productName: prod.name,
        qtySold: reqItem.qty,
        unitPriceUsd: prod.priceUsd,
      });
      totalUsd = totalUsd.plus(toDecimal(prod.priceUsd).times(reqItem.qty));
    }

    setProducts((prev) =>
      prev.map((p) => {
        const match = items.find((i) => i.sku.toLowerCase() === p.sku.toLowerCase());
        if (!match) return p;
        const currentStock = p.stockByLocation[locationId] ?? 0;
        return {
          ...p,
          stockByLocation: {
            ...p.stockByLocation,
            [locationId]: round2(toDecimal(currentStock).minus(match.qty)),
          },
          monthlyUnitsSold: p.monthlyUnitsSold + match.qty,
          lastUpdatedVet: vetNow,
        };
      })
    );

    const newEvent: SalesSyncEvent = {
      id: `pos-evt-${Date.now()}`,
      externalPosId: `CHRYSTAL-POS-${Math.floor(100000 + Math.random() * 900000)}`,
      locationId,
      timestampVet: vetNow,
      items: eventItems,
      totalUsd: round2(totalUsd),
      status: 'PROCESADO',
    };

    setSalesEvents((prev) => [newEvent, ...prev]);
    return { success: true, event: newEvent };
  };

  const recalculateAbcClassification = () => {
    setProducts((prev) => {
      const withRev = prev.map((p) => ({
        product: p,
        monthlyRevenue: round2(toDecimal(p.priceUsd).times(p.monthlyUnitsSold)),
      }));
      withRev.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
      const totalRev = withRev.reduce(
        (acc, item) => acc.plus(item.monthlyRevenue),
        toDecimal(0)
      );

      let cumulative = toDecimal(0);
      return withRev.map((item) => {
        cumulative = cumulative.plus(item.monthlyRevenue);
        const pct = totalRev.gt(0) ? cumulative.dividedBy(totalRev).times(100).toNumber() : 100;
        let abcClass: AbcClass = 'C';
        if (pct <= 80) abcClass = 'A';
        else if (pct <= 95) abcClass = 'B';
        return {
          ...item.product,
          abcClass,
        };
      });
    });
  };

  const logAuditEvent = (
    action: AuditActionType,
    entityType: string,
    description: string,
    details?: Record<string, unknown>,
    entityId?: string
  ): AuditLogEntry => {
    const entry = createAuditLogEntry(
      user,
      action,
      entityType,
      description,
      details,
      entityId
    );
    setAuditLogs((prev) => [entry, ...prev.slice(0, 999)]);
    return entry;
  };

  const updateProductMinStockThreshold = ({
    productId,
    locationId,
    minStock,
    manualRiskMode,
    safetyMultiplier,
  }: {
    productId: string;
    locationId: string;
    minStock: number;
    manualRiskMode?: ManualRiskMode;
    safetyMultiplier?: number;
  }): { success: boolean; product?: Product; error?: string } => {
    const target = products.find((p) => p.id === productId);
    if (!target) {
      return { success: false, error: `Producto ID ${productId} no encontrado.` };
    }
    if (minStock < 0) {
      return { success: false, error: 'El stock mínimo no puede ser un valor negativo.' };
    }

    let updatedProduct: Product | undefined;
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const newMinStock = { ...(p.minStockByLocation || {}) };
        newMinStock[locationId] = minStock;

        const newManualRisk = { ...(p.manualRiskByLocation || {}) };
        if (manualRiskMode) {
          newManualRisk[locationId] = manualRiskMode;
        }

        const newMultipliers = { ...(p.safetyMultiplierByLocation || {}) };
        if (safetyMultiplier !== undefined) {
          newMultipliers[locationId] = safetyMultiplier;
        }

        updatedProduct = {
          ...p,
          minStockByLocation: newMinStock,
          manualRiskByLocation: newManualRisk,
          safetyMultiplierByLocation: newMultipliers,
          lastUpdatedVet: getCaracasNow().isoTimestamp,
        };
        return updatedProduct;
      })
    );

    logAuditEvent(
      'MIN_STOCK_UPDATE',
      'PRODUCT',
      `Stock mínimo ajustado para SKU ${target.sku} (${target.name}) en sede ${locationId}: ${minStock} unidades (Modo de riesgo: ${manualRiskMode || 'AUTOMATICO'})`,
      { productId, sku: target.sku, locationId, minStock, manualRiskMode },
      productId
    );

    return { success: true, product: updatedProduct };
  };

  const registerInventoryDiscard = (
    input: CreateDiscardInput
  ): { success: boolean; discard?: InventoryDiscardRecord; error?: string } => {
    const result = createPendingInventoryDiscard(input, {
      products,
      locations,
      existingDiscards: discards,
      activeBcvRate: bcvState.activeRate,
      actor: user,
    });

    if (!result.success || !result.discard) {
      return result;
    }

    const record = result.discard;
    setDiscards((prev) => [record, ...prev]);

    logAuditEvent(
      'INVENTORY_DISCARD_CREATE',
      'INVENTORY_DISCARD',
      `Pre-registro de descarga ${record.referenceCode} (${record.quantityDiscarded} ${record.unit} de ${record.sku} en ${record.locationCode}) por causa "${getDiscardReasonLabel(record.reason)}". Estado: PENDIENTE_AUTORIZACION (Sin descuento de stock).`,
      {
        referenceCode: record.referenceCode,
        sku: record.sku,
        locationCode: record.locationCode,
        quantityDiscarded: record.quantityDiscarded,
        totalCostUsd: record.totalCostUsd,
        totalCostVes: record.totalCostVes,
        reason: record.reason,
      },
      record.id
    );

    return {
      success: true,
      discard: record,
    };
  };

  const authorizeInventoryDiscard = (
    discardId: string,
    managerPin: string
  ): { success: boolean; discard?: InventoryDiscardRecord; error?: string } => {
    const result = authorizeInventoryDiscardWithPin({
      discardId,
      managerPin,
      discards,
      products,
      actor: user,
    });

    if (!result.success || !result.updatedDiscard || !result.updatedProducts) {
      return {
        success: false,
        error: result.error,
      };
    }

    const authorizedRecord = result.updatedDiscard;
    setProducts(result.updatedProducts);
    setDiscards((prev) =>
      prev.map((d) => (d.id === authorizedRecord.id ? authorizedRecord : d))
    );

    logAuditEvent(
      'INVENTORY_DISCARD_AUTHORIZE',
      'INVENTORY_DISCARD',
      `Descarga de inventario ${authorizedRecord.referenceCode} AUTORIZADA con Doble Firma RBAC por ${authorizedRecord.authorizedByDisplayName}. Descontados ${authorizedRecord.quantityDiscarded} ${authorizedRecord.unit} de ${authorizedRecord.sku} en ${authorizedRecord.locationCode} (Stock: ${authorizedRecord.stockBeforeDiscard} -> ${authorizedRecord.stockAfterDiscard}).`,
      {
        referenceCode: authorizedRecord.referenceCode,
        sku: authorizedRecord.sku,
        locationCode: authorizedRecord.locationCode,
        quantityDiscarded: authorizedRecord.quantityDiscarded,
        stockBeforeDiscard: authorizedRecord.stockBeforeDiscard,
        stockAfterDiscard: authorizedRecord.stockAfterDiscard,
        totalCostUsd: authorizedRecord.totalCostUsd,
        authorizedBy: authorizedRecord.authorizedByEmail,
      },
      authorizedRecord.id
    );

    return {
      success: true,
      discard: authorizedRecord,
    };
  };

  const rejectInventoryDiscard = (
    discardId: string,
    rejectionReason: string
  ): { success: boolean; discard?: InventoryDiscardRecord; error?: string } => {
    const result = rejectInventoryDiscardWithReason({
      discardId,
      rejectionReason,
      discards,
      actor: user,
    });

    if (!result.success || !result.updatedDiscard) {
      return {
        success: false,
        error: result.error,
      };
    }

    const rejectedRecord = result.updatedDiscard;
    setDiscards((prev) =>
      prev.map((d) => (d.id === rejectedRecord.id ? rejectedRecord : d))
    );

    logAuditEvent(
      'INVENTORY_DISCARD_REJECT',
      'INVENTORY_DISCARD',
      `Solicitud de descarga ${rejectedRecord.referenceCode} (${rejectedRecord.sku} en ${rejectedRecord.locationCode}) RECHAZADA por ${rejectedRecord.authorizedByDisplayName}. Motivo: "${rejectedRecord.rejectionReason}". Stock físico intacto.`,
      {
        referenceCode: rejectedRecord.referenceCode,
        sku: rejectedRecord.sku,
        locationCode: rejectedRecord.locationCode,
        rejectionReason: rejectedRecord.rejectionReason,
      },
      rejectedRecord.id
    );

    return {
      success: true,
      discard: rejectedRecord,
    };
  };

  const wipePlatformDataToPristine = (
    superAdminPin: string
  ): { success: boolean; error?: string } => {
    const isSuperAdminUser = user?.role === UserRole.SUPERADMIN;
    const isSuperAdminPin = superAdminPin.trim() === '102030';

    if (!isSuperAdminPin && !isSuperAdminUser) {
      return {
        success: false,
        error: 'Acceso Denegado: Se requiere autorización de Superadministrador para el reinicio de fábrica.',
      };
    }

    setProducts([]);
    setTransfers([]);
    setPurchaseOrders([]);
    setManualReceipts([]);
    setSalesEvents([]);
    setDiscards([]);

    resetFinanceState();

    try {
      localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_TRANSFERS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_PURCHASE_ORDERS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_MANUAL_RECEIPTS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_DISCARDS, JSON.stringify([]));
    } catch {
      // ignore
    }

    logAuditEvent(
      'PLATFORM_RESET',
      'SYSTEM',
      'REINICIO DE FÁBRICA EJECUTADO: Base de datos y registros operativos reseteados a estado virgen por Superadministrador.',
      {
        executedBy: user?.email || 'rdrj.mppd@gmail.com',
        timestamp: getCaracasNow().isoTimestamp,
      }
    );

    return { success: true };
  };

  const restoreFullPlatformState = (
    backupData: PlatformBackupPayload
  ): {
    success: boolean;
    restoredCount?: { products: number; locations: number; orders: number };
    error?: string;
  } => {
    if (!backupData || !Array.isArray(backupData.products)) {
      return { success: false, error: 'Formato de respaldo inválido o estructura de datos corrupta.' };
    }

    if (backupData.products) setProducts(backupData.products);
    if (backupData.locations && backupData.locations.length > 0) setLocations(backupData.locations);
    if (backupData.transfers) setTransfers(backupData.transfers);
    if (backupData.purchaseOrders) setPurchaseOrders(backupData.purchaseOrders);
    if (backupData.manualReceipts) setManualReceipts(backupData.manualReceipts);
    if (backupData.salesEvents) setSalesEvents(backupData.salesEvents);
    if (Array.isArray(backupData.discards)) setDiscards(backupData.discards);

    restoreFinanceState({
      suppliers: backupData.suppliers,
      invoices: backupData.invoices,
      payments: backupData.payments,
      closures: backupData.closures,
    });

    if (Array.isArray(backupData.auditLogs) && backupData.auditLogs.length > 0) {
      setAuditLogs(backupData.auditLogs);
    }

    logAuditEvent(
      'BACKUP_RESTORE',
      'SYSTEM',
      `Restauración completa de plataforma ejecutada desde respaldo (${backupData.products.length} productos, ${backupData.locations?.length || 0} sedes, ${backupData.purchaseOrders?.length || 0} órdenes)`,
      {
        productsCount: backupData.products.length,
        locationsCount: backupData.locations?.length || 0,
        ordersCount: backupData.purchaseOrders?.length || 0,
        backupExportedAtVet: backupData.exportedAtVet,
      }
    );

    return {
      success: true,
      restoredCount: {
        products: backupData.products.length,
        locations: backupData.locations?.length || 0,
        orders: backupData.purchaseOrders?.length || 0,
      },
    };
  };

  const exportPlatformBackupPayload = (): PlatformBackupPayload => {
    const now = getCaracasNow();
    let companyProfile = undefined;
    try {
      const rawCfg = localStorage.getItem('chrystal_erp_uiconfig_v1');
      if (rawCfg) {
        const parsed = JSON.parse(rawCfg);
        companyProfile = parsed.companyProfile;
      }
    } catch {
      // fallback
    }

    const payload: PlatformBackupPayload = {
      version: '2.0.0',
      exportedAtVet: `${now.dateFormatted} ${now.timeFormatted}`,
      exportedBy: user?.displayName || 'Superadministrador',
      exportedByEmail: user?.email || 'rdrj.mppd@gmail.com',
      companyProfile: resolveCompanyProfile(companyProfile),
      products,
      locations,
      suppliers,
      invoices,
      payments,
      transfers,
      purchaseOrders,
      manualReceipts,
      salesEvents,
      closures,
      auditLogs,
      sessionHistory,
      discards,
    };

    logAuditEvent(
      'BACKUP_EXPORT',
      'SYSTEM',
      `Exportación de respaldo cifrado generada exitosamente (${products.length} productos, ${locations.length} sedes/depósitos)`,
      { totalProducts: products.length, totalLocations: locations.length }
    );

    return payload;
  };

  return (
    <InventoryContext.Provider
      value={{
        locations,
        products,
        transfers,
        salesEvents,
        purchaseOrders,
        manualReceipts,
        selectedLocationId,
        setSelectedLocationId,
        isAddLocationModalOpen,
        setIsAddLocationModalOpen,
        locationToDelete,
        setLocationToDelete,
        addLocationOrDepot,
        deleteLocationOrDepot,
        configureProductRiskIndicator,
        createReplenishmentOrderFromAlert,
        draftPurchaseTarget,
        setDraftPurchaseTarget,
        createManualPurchaseOrder,
        confirmPurchaseOrderDelivery,
        registerPostPurchaseManualReceipt,
        reorderAlerts,
        liveToastAlerts,
        unreadAlertsCount,
        sessionStartupAlertShown,
        dismissToastAlert,
        dismissAllToasts,
        markAllAlertsAsRead,
        triggerRealtimeStockDropDemo,
        replenishAlertStock,
        addOrUpdateProduct,
        updateProductPricing,
        executeStockTransfer,
        applyChrystalImport,
        simulatePosWebhookSale,
        recalculateAbcClassification,
        auditLogs,
        logAuditEvent,
        updateProductMinStockThreshold,
        wipePlatformDataToPristine,
        restoreFullPlatformState,
        exportPlatformBackupPayload,
        discards,
        pendingDiscardsCount,
        registerInventoryDiscard,
        authorizeInventoryDiscard,
        rejectInventoryDiscard,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory debe usarse dentro de un InventoryProvider');
  return ctx;
};

export default InventoryContext;
