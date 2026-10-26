import XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CreateDiscardInput,
  DiscardReason,
  InventoryDiscardRecord,
  LocationNode,
  Product,
  UserProfile,
  UserRole,
  CompanyFiscalProfile,
} from '../types';
import { toDecimal, round2, formatUsd, formatVes } from './decimal';
import { getCaracasNow } from './bcv';
import { resolveCompanyProfile } from './excel-exporter';
import { BRAND_NAME, HIPER_ABASTO_POLAR_LOGO_DATA_URI } from './brand-assets';

export interface DiscardReasonCatalogItem {
  code: DiscardReason;
  label: string;
  description: string;
  badgeColor: string;
}

export const DISCARD_REASON_CATALOG: DiscardReasonCatalogItem[] = [
  {
    code: 'VENCIMIENTO_CADUCIDAD',
    label: 'Vencimiento / Caducidad',
    description: 'Producto vencido o fecha límite de consumo superada en anaquel o depósito.',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
  },
  {
    code: 'DETERIORO_EMPAQUE_CONTENEDOR',
    label: 'Deterioro de Empaque / Contenedor',
    description: 'Bolsas rotas, latas abolladas, cajas aplastadas o pérdida de hermeticidad.',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    code: 'ACCIDENTE_MALA_MANIPULACION',
    label: 'Accidente / Mala Manipulación',
    description: 'Caídas en pasillo, rotura de envases de vidrio o incidente de montacargas.',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-300',
  },
  {
    code: 'MERMA_CADENA_FRIO',
    label: 'Merma de Cadena de Frío',
    description: 'Pérdida de refrigeración o descongelamiento en cava cuarto / vitrina.',
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-300',
  },
  {
    code: 'ERROR_CARGA_SISTEMA',
    label: 'Error de Carga en Sistema',
    description: 'Ajuste auditado por conteo físico cíclico o corrección de guía de despacho.',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  },
  {
    code: 'OTRA_CAUSA_JUSTIFICADA',
    label: 'Otra Causa Justificada',
    description: 'Baja operativa especial sustentada con informe técnico obligatorio.',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
  },
];

export function getDiscardReasonLabel(reason: DiscardReason): string {
  const found = DISCARD_REASON_CATALOG.find((item) => item.code === reason);
  return found ? found.label : reason;
}

export function getDiscardReasonBadgeClass(reason: DiscardReason): string {
  const found = DISCARD_REASON_CATALOG.find((item) => item.code === reason);
  return found ? found.badgeColor : 'bg-slate-100 text-slate-800 border-slate-300';
}

export function calculateDiscardLossValuation(
  quantityDiscarded: number,
  unitCostUsd: number,
  activeBcvRate: number
): { totalCostUsd: number; totalCostVes: number } {
  const safeQty = Math.max(0, round2(quantityDiscarded));
  const safeCost = Math.max(0, round2(unitCostUsd));
  const safeRate = activeBcvRate > 0 ? activeBcvRate : 36.5;

  const totalCostUsd = round2(toDecimal(safeQty).times(safeCost));
  const totalCostVes = round2(toDecimal(totalCostUsd).times(safeRate));

  return { totalCostUsd, totalCostVes };
}

export const INITIAL_INVENTORY_DISCARDS: InventoryDiscardRecord[] = [
  {
    id: 'dsc-seed-001',
    referenceCode: 'BAJA-2026-0001',
    locationId: 'loc-pzo-01',
    locationCode: 'PZO-01',
    locationName: 'Sede Principal Alta Vista (Puerto Ordaz)',
    productId: 'prd-003',
    sku: 'ACE-MAZ-1LT',
    productName: 'Aceite de Maíz Mazeite 1 Litro',
    category: 'Aceites y Grasas',
    unit: 'LT',
    quantityDiscarded: 4,
    stockBeforeDiscard: 99,
    stockAfterDiscard: 95,
    unitCostUsd: 3.1,
    totalCostUsd: 12.4,
    totalCostVes: 551.8,
    bcvRateAtEvent: 44.5,
    reason: 'ACCIDENTE_MALA_MANIPULACION',
    reasonDetails:
      'Rotura de 4 envases plásticos durante descarga de paleta en pasillo 2 de recepción.',
    lotOrGuideNumber: 'LOTE-MZ-2026-02',
    status: 'AUTORIZADA',
    createdByUserId: 'usr-analista-01',
    createdByEmail: 'analista@chrystal.com.ve',
    createdByDisplayName: 'Lic. Carlos Mendoza (Analista de Costos)',
    createdByRole: UserRole.ANALISTA,
    createdAtVet: '2026-03-23T14:20:00-04:00',
    authorizedByUserId: 'usr-gerente-01',
    authorizedByEmail: 'gerencia@chrystal.com.ve',
    authorizedByDisplayName: 'Ing. María Fernanda Gómez (Gerente Operaciones)',
    authorizedAtVet: '2026-03-23T15:05:00-04:00',
    managerAuthPinUsed: 'VERIFICADO_RBAC',
  },
  {
    id: 'dsc-seed-002',
    referenceCode: 'BAJA-2026-0002',
    locationId: 'loc-ccs-01',
    locationCode: 'CCS-01',
    locationName: 'Sede Las Mercedes (Caracas)',
    productId: 'prd-001',
    sku: 'HAR-PAN-1KG',
    productName: 'Harina de Maíz Precocida P.A.N. 1Kg',
    category: 'Víveres Secos',
    unit: 'UND',
    quantityDiscarded: 6,
    stockBeforeDiscard: 310,
    unitCostUsd: 0.94,
    totalCostUsd: 5.64,
    totalCostVes: 250.98,
    bcvRateAtEvent: 44.5,
    reason: 'DETERIORO_EMPAQUE_CONTENEDOR',
    reasonDetails:
      'Empaques perforados detectados en revisión física de fardo recibido en almacén secundario.',
    lotOrGuideNumber: 'GUIA-ALM-8841',
    status: 'PENDIENTE_AUTORIZACION',
    createdByUserId: 'usr-analista-01',
    createdByEmail: 'analista@chrystal.com.ve',
    createdByDisplayName: 'Lic. Carlos Mendoza (Analista de Costos)',
    createdByRole: UserRole.ANALISTA,
    createdAtVet: '2026-03-24T09:40:00-04:00',
  },
];

/**
 * Paso 1 (Analista -> Pre-registro):
 * Registra una solicitud de descarga en estado 'PENDIENTE_AUTORIZACION'.
 * LÍNEA ROJA: NO descuenta la existencia física del catálogo hasta que Gerencia autorice con PIN.
 */
export function createPendingInventoryDiscard(
  input: CreateDiscardInput,
  context: {
    products: Product[];
    locations: LocationNode[];
    existingDiscards: InventoryDiscardRecord[];
    activeBcvRate: number;
    actor: UserProfile | null;
    timestampVet?: string;
  }
): {
  success: boolean;
  discard?: InventoryDiscardRecord;
  error?: string;
} {
  const { products, locations, existingDiscards, activeBcvRate, actor } = context;

  if (actor && actor.role === UserRole.OBSERVADOR) {
    return {
      success: false,
      error: 'Nivel RBAC insuficiente: El rol OBSERVADOR no puede registrar solicitudes de descarga.',
    };
  }

  const location = locations.find((l) => l.id === input.locationId);
  if (!location) {
    return {
      success: false,
      error: 'Sede o Depósito seleccionado no existe en el maestro de ubicaciones.',
    };
  }

  const product = products.find((p) => p.id === input.productId);
  if (!product) {
    return {
      success: false,
      error: 'Producto / SKU seleccionado no existe en el catálogo maestro.',
    };
  }

  const qty = round2(input.quantityDiscarded);
  if (!Number.isFinite(qty) || qty <= 0) {
    return {
      success: false,
      error: 'La cantidad física a descargar debe ser mayor a cero (0).',
    };
  }

  const currentStock = round2(product.stockByLocation[location.id] ?? 0);
  if (qty > currentStock) {
    return {
      success: false,
      error: `Cantidad a descargar (${qty} ${product.unit}) supera la existencia física disponible en ${location.code} (${currentStock} ${product.unit}).`,
    };
  }

  const trimmedDetails = (input.reasonDetails || '').trim();
  if (trimmedDetails.length < 5) {
    return {
      success: false,
      error: 'Debe ingresar una justificación técnica detallada (mínimo 5 caracteres).',
    };
  }

  const { totalCostUsd, totalCostVes } = calculateDiscardLossValuation(
    qty,
    product.costUsd,
    activeBcvRate
  );

  const vetNow = context.timestampVet || getCaracasNow().isoTimestamp;
  const sequenceNumber = existingDiscards.length + 1;

  const newDiscard: InventoryDiscardRecord = {
    id: `dsc-${Date.now()}-${sequenceNumber}-${Math.random().toString(36).slice(2, 8)}`,
    referenceCode: `BAJA-2026-${String(sequenceNumber).padStart(4, '0')}`,
    locationId: location.id,
    locationCode: location.code,
    locationName: location.name,
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    category: product.category,
    unit: product.unit,
    quantityDiscarded: qty,
    stockBeforeDiscard: currentStock,
    unitCostUsd: round2(product.costUsd),
    totalCostUsd,
    totalCostVes,
    bcvRateAtEvent: round2(activeBcvRate > 0 ? activeBcvRate : 36.5),
    reason: input.reason,
    reasonDetails: trimmedDetails,
    lotOrGuideNumber: input.lotOrGuideNumber?.trim() || undefined,
    status: 'PENDIENTE_AUTORIZACION',
    createdByUserId: actor?.uid || 'usr-analista-01',
    createdByEmail: actor?.email || 'analista@chrystal.com.ve',
    createdByDisplayName: actor?.displayName || 'Analista de Inventario',
    createdByRole: actor?.role || UserRole.ANALISTA,
    createdAtVet: vetNow,
  };

  return {
    success: true,
    discard: newDiscard,
  };
}

/**
 * Paso 3A (Gerencia -> Autorización con Doble Firma y PIN):
 * Verifica rol GERENTE o SUPERADMIN + PIN de autorización (203040 o 102030),
 * descuenta de manera irreversible con Decimal.js y cambia estado a 'AUTORIZADA'.
 */
export function authorizeInventoryDiscardWithPin(params: {
  discardId: string;
  managerPin: string;
  discards: InventoryDiscardRecord[];
  products: Product[];
  actor: UserProfile | null;
  timestampVet?: string;
}): {
  success: boolean;
  updatedDiscard?: InventoryDiscardRecord;
  updatedProducts?: Product[];
  error?: string;
} {
  const { discardId, managerPin, discards, products, actor } = params;

  if (!actor || (actor.role !== UserRole.GERENTE && actor.role !== UserRole.SUPERADMIN)) {
    return {
      success: false,
      error:
        'Potestad Restringida: Solo los roles GERENTE o SUPERADMIN pueden autorizar descargas de inventario.',
    };
  }

  const cleanPin = (managerPin || '').trim();
  const isValidManagerPin =
    cleanPin === '203040' ||
    cleanPin === '102030' ||
    (actor.pin && cleanPin === actor.pin.trim());

  if (!isValidManagerPin) {
    return {
      success: false,
      error:
        'PIN de autorización gerencial inválido. Verifique su credencial confidencial de Gerencia o Superadministrador.',
    };
  }

  const targetDiscard = discards.find((d) => d.id === discardId);
  if (!targetDiscard) {
    return {
      success: false,
      error: 'Solicitud de descarga no encontrada en el registro.',
    };
  }

  if (targetDiscard.status !== 'PENDIENTE_AUTORIZACION') {
    return {
      success: false,
      error: `Esta solicitud (${targetDiscard.referenceCode}) ya fue procesada con estado ${targetDiscard.status}.`,
    };
  }

  const targetProduct = products.find((p) => p.id === targetDiscard.productId);
  if (!targetProduct) {
    return {
      success: false,
      error: `El producto SKU ${targetDiscard.sku} no fue encontrado en el catálogo maestro.`,
    };
  }

  const currentStock = round2(targetProduct.stockByLocation[targetDiscard.locationId] ?? 0);
  if (currentStock < targetDiscard.quantityDiscarded) {
    return {
      success: false,
      error: `Existencia insuficiente para ejecutar la baja en ${targetDiscard.locationCode}. Stock actual: ${currentStock} ${targetDiscard.unit}, solicitado: ${targetDiscard.quantityDiscarded} ${targetDiscard.unit}.`,
    };
  }

  const vetNow = params.timestampVet || getCaracasNow().isoTimestamp;
  const newStockAfter = round2(toDecimal(currentStock).minus(targetDiscard.quantityDiscarded));

  const updatedProducts = products.map((p) => {
    if (p.id !== targetProduct.id) return p;
    return {
      ...p,
      stockByLocation: {
        ...p.stockByLocation,
        [targetDiscard.locationId]: newStockAfter,
      },
      lastUpdatedVet: vetNow,
    };
  });

  const updatedDiscard: InventoryDiscardRecord = {
    ...targetDiscard,
    stockBeforeDiscard: currentStock,
    stockAfterDiscard: newStockAfter,
    status: 'AUTORIZADA',
    authorizedByUserId: actor.uid,
    authorizedByEmail: actor.email,
    authorizedByDisplayName: actor.displayName,
    authorizedAtVet: vetNow,
    managerAuthPinUsed: 'VERIFICADO_RBAC',
  };

  return {
    success: true,
    updatedDiscard,
    updatedProducts,
  };
}

/**
 * Paso 3B (Gerencia -> Rechazo de Solicitud):
 * Mantiene intacto el stock físico del catálogo, cambia el estado a 'RECHAZADA' y registra motivo.
 */
export function rejectInventoryDiscardWithReason(params: {
  discardId: string;
  rejectionReason: string;
  discards: InventoryDiscardRecord[];
  actor: UserProfile | null;
  timestampVet?: string;
}): {
  success: boolean;
  updatedDiscard?: InventoryDiscardRecord;
  error?: string;
} {
  const { discardId, rejectionReason, discards, actor } = params;

  if (!actor || (actor.role !== UserRole.GERENTE && actor.role !== UserRole.SUPERADMIN)) {
    return {
      success: false,
      error:
        'Potestad Restringida: Solo los roles GERENTE o SUPERADMIN pueden rechazar solicitudes de descarga.',
    };
  }

  const cleanReason = (rejectionReason || '').trim();
  if (cleanReason.length < 4) {
    return {
      success: false,
      error: 'Debe especificar un motivo de rechazo auditable (mínimo 4 caracteres).',
    };
  }

  const targetDiscard = discards.find((d) => d.id === discardId);
  if (!targetDiscard) {
    return {
      success: false,
      error: 'Solicitud de descarga no encontrada en el registro.',
    };
  }

  if (targetDiscard.status !== 'PENDIENTE_AUTORIZACION') {
    return {
      success: false,
      error: `Esta solicitud (${targetDiscard.referenceCode}) ya fue procesada con estado ${targetDiscard.status}.`,
    };
  }

  const vetNow = params.timestampVet || getCaracasNow().isoTimestamp;

  const updatedDiscard: InventoryDiscardRecord = {
    ...targetDiscard,
    status: 'RECHAZADA',
    authorizedByUserId: actor.uid,
    authorizedByEmail: actor.email,
    authorizedByDisplayName: actor.displayName,
    authorizedAtVet: vetNow,
    rejectionReason: cleanReason,
  };

  return {
    success: true,
    updatedDiscard,
  };
}

/**
 * Exportación Oficial .XLSX con Membrete Corporativo y Bordes Ejecutivos
 */
export function exportInventoryDiscardsToExcel(params: {
  discards: InventoryDiscardRecord[];
  companyProfile?: CompanyFiscalProfile;
  activeBcvRate: number;
  selectedLocationLabel: string;
}): void {
  const { discards, activeBcvRate, selectedLocationLabel } = params;
  const company = resolveCompanyProfile(params.companyProfile);
  const now = getCaracasNow();

  const totalAuthorizedUsd = round2(
    discards
      .filter((d) => d.status === 'AUTORIZADA')
      .reduce((acc, d) => acc.plus(d.totalCostUsd), toDecimal(0))
  );
  const totalAuthorizedVes = round2(
    discards
      .filter((d) => d.status === 'AUTORIZADA')
      .reduce((acc, d) => acc.plus(d.totalCostVes), toDecimal(0))
  );
  const totalPendingUsd = round2(
    discards
      .filter((d) => d.status === 'PENDIENTE_AUTORIZACION')
      .reduce((acc, d) => acc.plus(d.totalCostUsd), toDecimal(0))
  );

  const thinBorder = {
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } },
  };

  const rows: unknown[][] = [
    [`MARCA INSTITUCIONAL: ${(company.brandingName || BRAND_NAME).toUpperCase()} — ACTA DE DESCARGA AUDITADA`],
    [company.razonSocial.toUpperCase()],
    [
      `RIF: ${company.rif} | SADA: ${company.codigoSada} | Dirección: ${company.direccionFiscal}`,
    ],
    [
      `ACTA CONSOLIDADA DE DESCARGAS, BAJAS Y MERMAS DE INVENTARIO (GOBERNANZA DUAL ANALISTA -> GERENTE)`,
    ],
    [
      `Alcance: ${selectedLocationLabel} | Emisión VET: ${now.dateFormatted} ${now.timeFormatted} | Tasa BCV: Bs. ${activeBcvRate.toFixed(2)}/USD`,
    ],
    [
      `Pérdida Autorizada Acumulada: ${formatUsd(totalAuthorizedUsd)} (${formatVes(totalAuthorizedVes)}) | En Espera de Firma: ${formatUsd(totalPendingUsd)}`,
    ],
    [],
    [
      'CÓDIGO REF.',
      'FECHA / HORA VET',
      'SEDE / DEPÓSITO',
      'SKU',
      'PRODUCTO / DESCRIPCIÓN',
      'CANT. BAJA',
      'STOCK ANTES',
      'STOCK DESPUÉS',
      'COSTO UNIT. USD',
      'PÉRDIDA USD',
      'PÉRDIDA BS. (BCV)',
      'CAUSA ESTANDARIZADA',
      'JUSTIFICACIÓN / LOTE',
      'SOLICITADO POR (ANALISTA)',
      'ESTADO / FIRMA GERENCIA',
    ],
  ];

  for (const d of discards) {
    rows.push([
      d.referenceCode,
      d.createdAtVet.replace('T', ' ').slice(0, 16),
      `${d.locationCode} - ${d.locationName}`,
      d.sku,
      d.productName,
      d.quantityDiscarded,
      d.stockBeforeDiscard,
      d.stockAfterDiscard !== undefined ? d.stockAfterDiscard : 'EN ESPERA',
      d.unitCostUsd,
      d.totalCostUsd,
      d.totalCostVes,
      getDiscardReasonLabel(d.reason),
      `${d.reasonDetails}${d.lotOrGuideNumber ? ` [Ref: ${d.lotOrGuideNumber}]` : ''}`,
      `${d.createdByDisplayName} (${d.createdByEmail})`,
      d.status === 'AUTORIZADA'
        ? `AUTORIZADA POR ${d.authorizedByDisplayName || 'GERENCIA'}`
        : d.status === 'RECHAZADA'
        ? `RECHAZADA (${d.rejectionReason || 'Sin motivo'})`
        : 'PENDIENTE AUTORIZACIÓN GERENCIAL',
    ]);
  }

  rows.push([]);
  rows.push([
    'CERTIFICACIÓN DE AUDITORÍA:',
    'Documento generado bajo protocolo de Doble Firma Anti-Fraude · © 2026 AR Group. Todos los derechos de desarrollo reservados.',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 16 },
    { wch: 18 },
    { wch: 28 },
    { wch: 15 },
    { wch: 32 },
    { wch: 12 },
    { wch: 13 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 26 },
    { wch: 38 },
    { wch: 28 },
    { wch: 30 },
  ];

  // Style Header Banner & Table Cells
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:O10');
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellRef];
      if (!cell) continue;

      if (R === 0) {
        cell.s = {
          font: { bold: true, sz: 13, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '0F172A' } },
        };
      } else if (R >= 1 && R <= 4) {
        cell.s = {
          font: { bold: R === 2, sz: 10, color: { rgb: '0F172A' } },
          fill: { fgColor: { rgb: 'E2E8F0' } },
        };
      } else if (R === 6) {
        cell.s = {
          font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1E293B' } },
          border: thinBorder,
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      } else if (R > 6 && R < range.e.r - 1) {
        cell.s = {
          font: { sz: 9, color: { rgb: '0F172A' } },
          border: thinBorder,
          fill: { fgColor: { rgb: R % 2 === 0 ? 'F8FAFC' : 'FFFFFF' } },
        };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Descargas_y_Mermas');
  XLSX.writeFile(
    wb,
    `Chrystal_Descargas_Inventario_${now.dateFormatted.replace(/\//g, '-')}.xlsx`
  );
}

/**
 * Exportación Oficial .PDF de Acta de Descargas y Mermas con Cuadro de Doble Firma
 */
export function exportInventoryDiscardsToPdf(params: {
  discards: InventoryDiscardRecord[];
  companyProfile?: CompanyFiscalProfile;
  activeBcvRate: number;
  selectedLocationLabel: string;
  singleRecord?: InventoryDiscardRecord;
}): void {
  const { activeBcvRate, selectedLocationLabel, singleRecord } = params;
  const records = singleRecord ? [singleRecord] : params.discards;
  const company = resolveCompanyProfile(params.companyProfile);
  const now = getCaracasNow();

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // Corporate Dark Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 33, 'F');
  doc.setFillColor(2, 132, 199);
  doc.rect(0, 33, 297, 1.5, 'F');

  const logoBase64 = company.logoBase64 || HIPER_ABASTO_POLAR_LOGO_DATA_URI;
  if (logoBase64) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(12, 3.5, 26, 26, 2, 2, 'F');
      doc.addImage(logoBase64, 'JPEG', 13, 4.5, 24, 24);
    } catch {
      // Graceful fallback
    }
  }

  const textStartX = 42;
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12.5);
  doc.setFont('helvetica', 'bold');
  doc.text(company.razonSocial.toUpperCase(), textStartX, 10.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(186, 230, 253);
  doc.text(
    `RIF: ${company.rif}  |  Código SADA: ${company.codigoSada}  |  Dirección Fiscal: ${company.direccionFiscal}`,
    textStartX,
    16.5
  );

  doc.setTextColor(226, 232, 240);
  doc.setFont('helvetica', 'bold');
  doc.text(
    singleRecord
      ? `ACTA INDIVIDUAL DE DESCARGA DE INVENTARIO REF: ${singleRecord.referenceCode} (${singleRecord.status})`
      : `ACTA EJECUTIVA DE DESCARGAS Y MERMAS DE INVENTARIO — ALCANCE: ${selectedLocationLabel.toUpperCase()}`,
    textStartX,
    23
  );

  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(56, 189, 248);
  doc.text(
    `Emisión VET: ${now.dateFormatted} ${now.timeFormatted} | Tasa Oficial BCV: Bs. ${activeBcvRate.toFixed(2)}/USD`,
    textStartX,
    29
  );

  const totalAuthUsd = round2(
    records
      .filter((d) => d.status === 'AUTORIZADA')
      .reduce((acc, d) => acc.plus(d.totalCostUsd), toDecimal(0))
  );
  const totalAuthVes = round2(
    records
      .filter((d) => d.status === 'AUTORIZADA')
      .reduce((acc, d) => acc.plus(d.totalCostVes), toDecimal(0))
  );

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Total Registros en Acta: ${records.length}   |   Valoración Bajas Autorizadas: ${formatUsd(totalAuthUsd)} (${formatVes(totalAuthVes)})`,
    14,
    37
  );

  const tableBody = records.map((d) => [
    d.referenceCode,
    d.createdAtVet.replace('T', ' ').slice(0, 16),
    `${d.locationCode}`,
    `${d.sku}\n${d.productName}`,
    `${d.quantityDiscarded} ${d.unit}`,
    `${d.stockBeforeDiscard} -> ${
      d.stockAfterDiscard !== undefined ? d.stockAfterDiscard : 'Pend.'
    }`,
    formatUsd(d.totalCostUsd),
    formatVes(d.totalCostVes),
    `${getDiscardReasonLabel(d.reason)}\n${d.reasonDetails}`,
    d.createdByDisplayName,
    d.status === 'AUTORIZADA'
      ? `AUTORIZADA\n${d.authorizedByDisplayName || 'Gerencia'}`
      : d.status === 'RECHAZADA'
      ? `RECHAZADA\n${d.rejectionReason || ''}`
      : 'PENDIENTE FIRMA',
  ]);

  autoTable(doc, {
    startY: 41,
    head: [
      [
        'Ref.',
        'Fecha VET',
        'Sede',
        'SKU / Producto',
        'Cant.',
        'Stock A/D',
        'Pérdida USD',
        'Pérdida Bs.',
        'Causa y Justificación',
        'Solicitado (Analista)',
        'Estado / Gerencia',
      ],
    ],
    body: tableBody,
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 140;
  const sigY = Math.min(172, finalY + 18);

  // Dual Signature Block (Analista Solicitante & Gerente Autorizador)
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.4);
  doc.line(35, sigY, 120, sigY);
  doc.line(175, sigY, 260, sigY);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('FIRMA 1: ELABORADO Y PRE-REGISTRADO POR ANALISTA', 42, sigY + 5);
  doc.text('FIRMA 2: VERIFICADO Y AUTORIZADO POR GERENCIA (PIN RBAC)', 180, sigY + 5);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  if (singleRecord) {
    doc.text(
      `${singleRecord.createdByDisplayName} (${singleRecord.createdByEmail})`,
      42,
      sigY + 10
    );
    doc.text(
      singleRecord.status === 'AUTORIZADA'
        ? `${singleRecord.authorizedByDisplayName} — PIN RBAC Certificado (${singleRecord.authorizedAtVet?.slice(0, 16)})`
        : singleRecord.status === 'RECHAZADA'
        ? `RECHAZADA POR: ${singleRecord.authorizedByDisplayName} (${singleRecord.rejectionReason})`
        : 'PENDIENTE DE FIRMA Y AUTORIZACIÓN GERENCIAL',
      180,
      sigY + 10
    );
  } else {
    doc.text('Analista de Inventario / Auditoría Operativa de Sede', 42, sigY + 10);
    doc.text('Gerente de Operaciones / Superadministrador Chrystal® ERP', 180, sigY + 10);
  }

  // Permanent Official Footer
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Chrystal® Enterprise Food Retail ERP · Protocolo Anti-Fraude de Doble Firma · © 2026 AR Group. Todos los derechos de desarrollo reservados.',
    14,
    202
  );

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    if (logoBase64) {
      try {
        doc.saveGraphicsState();
        if (typeof doc.GState === 'function' && typeof doc.setGState === 'function') {
          doc.setGState(new (doc as any).GState({ opacity: 0.07 }));
        }
        doc.addImage(logoBase64, 'JPEG', (297 - 120) / 2, (210 - 120) / 2, 120, 120);
      } catch {
        // fail-safe
      } finally {
        doc.restoreGraphicsState();
      }
    }
  }

  const fileSuffix = singleRecord
    ? singleRecord.referenceCode
    : now.dateFormatted.replace(/\//g, '-');
  doc.save(`Acta_Descargas_Inventario_${fileSuffix}.pdf`);
}
