import XLSXStyle from 'xlsx-js-style';
import type * as XLSXTypes from 'xlsx-js-style';
import { BcvRateState, CompanyFiscalProfile, LocationNode, Product } from '../types';
import { toDecimal, round2, convertUsdToVes, calculateGrossMarginPercent } from './decimal';

const XLSX: typeof XLSXTypes = ((XLSXStyle as unknown as { default?: typeof XLSXTypes }).default ||
  XLSXStyle) as typeof XLSXTypes;

export const COPYRIGHT_NOTICE =
  '© 2026 AR Group. Todos los derechos de desarrollo reservados.';

export const DEFAULT_COMPANY_PROFILE: CompanyFiscalProfile = {
  razonSocial: 'NOMBRE DE EMPRESA, C.A.',
  rif: 'J-00000000-0 (RIF EMPRESA)',
  direccionFiscal: 'DIRECCIÓN FISCAL DE LA EMPRESA, CIUDAD, VENEZUELA',
  telefono: '+58 (000) 000-0000',
  email: 'administracion@empresa.com.ve',
  codigoSada: 'SADA-000000',
  representanteLegal: 'GERENCIA GENERAL / ADMINISTRACIÓN',
  actividadEconomica: 'DISTRIBUCIÓN Y COMERCIALIZACIÓN DE ALIMENTOS Y VÍVERES',
  isCustomConfigured: false,
  updatedAtVet: '2026-03-19 08:00',
};

/**
 * Ensures that if any company profile field is empty or not yet configured,
 * it automatically falls back to the generic enterprise placeholders ("NOMBRE DE EMPRESA, C.A.", "RIF EMPRESA", "DIRECCIÓN EMPRESA", etc.).
 */
export function resolveCompanyProfile(
  input?: Partial<CompanyFiscalProfile> | null
): CompanyFiscalProfile {
  if (!input) return { ...DEFAULT_COMPANY_PROFILE };

  const razonSocial = (input.razonSocial || '').trim() || DEFAULT_COMPANY_PROFILE.razonSocial;
  const rif = (input.rif || '').trim() || DEFAULT_COMPANY_PROFILE.rif;
  const direccionFiscal =
    (input.direccionFiscal || '').trim() || DEFAULT_COMPANY_PROFILE.direccionFiscal;
  const telefono = (input.telefono || '').trim() || DEFAULT_COMPANY_PROFILE.telefono;
  const email = (input.email || '').trim() || DEFAULT_COMPANY_PROFILE.email;
  const codigoSada = (input.codigoSada || '').trim() || DEFAULT_COMPANY_PROFILE.codigoSada;
  const representanteLegal =
    (input.representanteLegal || '').trim() || DEFAULT_COMPANY_PROFILE.representanteLegal;
  const actividadEconomica =
    (input.actividadEconomica || '').trim() || DEFAULT_COMPANY_PROFILE.actividadEconomica;

  const isCustomConfigured =
    input.isCustomConfigured !== undefined
      ? input.isCustomConfigured
      : razonSocial !== DEFAULT_COMPANY_PROFILE.razonSocial ||
        rif !== DEFAULT_COMPANY_PROFILE.rif ||
        direccionFiscal !== DEFAULT_COMPANY_PROFILE.direccionFiscal;

  return {
    razonSocial,
    rif,
    direccionFiscal,
    telefono,
    email,
    codigoSada,
    representanteLegal,
    actividadEconomica,
    isCustomConfigured,
    updatedAtVet: input.updatedAtVet || DEFAULT_COMPANY_PROFILE.updatedAtVet,
  };
}

export interface EnterpriseProductCellRow {
  itemNumber: number;
  excelRowNumber: number;
  sku: string;
  barcode: string;
  productName: string;
  category: string;
  unit: Product['unit'];
  abcClass: Product['abcClass'];
  ivaLabel: string;
  locationCells: Array<{
    locationCode: string;
    locationName: string;
    locationType: string;
    stock: number;
    reorderPoint: number;
    statusLabel: 'ÓPTIMO' | 'REORDENAR';
  }>;
  totalStock: number;
  monthlyUnitsSold: number;
  dailyRotationVelocity: number;
  coverageDays: number;
  costUsd: number;
  costVes: number;
  targetMarginPercent: number;
  realMarginPercent: number;
  priceUsd: number;
  priceVes: number;
  totalCostUsd: number;
  totalCostVes: number;
  totalRetailUsd: number;
  totalRetailVes: number;
  potentialProfitUsd: number;
  lastUpdatedVet: string;
}

export interface ProductFichaBoxRange {
  itemNumber: number;
  sku: string;
  startRowZeroBased: number;
  endRowZeroBased: number;
  spacerRowZeroBased: number;
}

export interface EnterpriseExcelStructuredPayload {
  documentControlId: string;
  generatedAtVet: string;
  companyProfile: CompanyFiscalProfile;
  activeBcvRate: number;
  rateSourceLabel: string;
  totalProducts: number;
  totalLocations: number;
  totalUnitsAll: number;
  totalValuationCostUsd: number;
  totalValuationCostVes: number;
  totalValuationRetailUsd: number;
  totalValuationRetailVes: number;
  totalPotentialProfitUsd: number;
  totalPotentialProfitVes: number;
  productRows: EnterpriseProductCellRow[];
  resumenSheetAoA: Array<Array<string | number>>;
  matrizProductoCeldaAoA: Array<Array<string | number>>;
  fichasProductoCeldaAoA: Array<Array<string | number>>;
  fichasBoxRanges: ProductFichaBoxRange[];
  matrizColumnWidths: Array<{ wch: number }>;
  matrizHeaderRowIndexZeroBased: number;
}

/**
 * Pure deterministic builder that constructs the formal enterprise-grade "Producto / Celda"
 * multi-sheet dataset, corporate fiscal letterhead block, column widths, product ficha card coordinates,
 * and financial totals using Decimal.js (ROUND_HALF_UP).
 */
export function buildEnterpriseExcelStructuredPayload(
  products: Product[],
  locations: LocationNode[],
  bcvState: BcvRateState,
  companyInput?: Partial<CompanyFiscalProfile> | null
): EnterpriseExcelStructuredPayload {
  const companyProfile = resolveCompanyProfile(companyInput);
  const activeRate = bcvState.activeRate;
  const generatedAtVet = `${bcvState.caracasDateFormatted} ${bcvState.caracasTimeFormatted}`;
  const documentControlId = `CHRYSTAL-XLSX-${bcvState.caracasDateFormatted.replace(/\//g, '')}`;

  let totalUnitsDec = toDecimal(0);
  let totalCostUsdDec = toDecimal(0);
  let totalRetailUsdDec = toDecimal(0);

  // In Sheet 2 (Matriz Formal), rows 1..6 are the Formal Corporate Header, row 7 is empty spacer, row 8 is Group Header, row 9 is Table Column Header, so data starts at Excel row 10
  const matrizHeaderRowIndexZeroBased = 8; // 0-indexed row 8 => Excel Row 9

  const productRows: EnterpriseProductCellRow[] = products.map((p, index) => {
    const locationCells = locations.map((loc) => {
      const stock = round2(p.stockByLocation[loc.id] ?? 0);
      const reorderPoint = round2(p.minStockByLocation[loc.id] ?? 0);
      const statusLabel: 'ÓPTIMO' | 'REORDENAR' =
        stock <= reorderPoint && reorderPoint > 0 ? 'REORDENAR' : 'ÓPTIMO';
      return {
        locationCode: loc.code,
        locationName: loc.name,
        locationType: loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 'DEPÓSITO' : 'SEDE',
        stock,
        reorderPoint,
        statusLabel,
      };
    });

    const totalStock = locationCells.reduce(
      (acc, c) => round2(toDecimal(acc).plus(c.stock)),
      0
    );

    const dailyRotationVelocity = Math.max(
      0.1,
      round2(toDecimal(p.monthlyUnitsSold).dividedBy(30))
    );
    const coverageDays =
      dailyRotationVelocity > 0
        ? round2(toDecimal(totalStock).dividedBy(dailyRotationVelocity))
        : 999;

    const costUsd = round2(p.costUsd);
    const costVes = convertUsdToVes(costUsd, activeRate);
    const priceUsd = round2(p.priceUsd);
    const priceVes = convertUsdToVes(priceUsd, activeRate);
    const realMarginPercent = calculateGrossMarginPercent(costUsd, priceUsd);

    const totalCostUsd = round2(toDecimal(totalStock).times(costUsd));
    const totalCostVes = convertUsdToVes(totalCostUsd, activeRate);
    const totalRetailUsd = round2(toDecimal(totalStock).times(priceUsd));
    const totalRetailVes = convertUsdToVes(totalRetailUsd, activeRate);
    const potentialProfitUsd = round2(toDecimal(totalRetailUsd).minus(totalCostUsd));

    totalUnitsDec = totalUnitsDec.plus(totalStock);
    totalCostUsdDec = totalCostUsdDec.plus(totalCostUsd);
    totalRetailUsdDec = totalRetailUsdDec.plus(totalRetailUsd);

    return {
      itemNumber: index + 1,
      excelRowNumber: matrizHeaderRowIndexZeroBased + 2 + index,
      sku: p.sku,
      barcode: p.barcode,
      productName: p.name,
      category: p.category,
      unit: p.unit,
      abcClass: p.abcClass,
      ivaLabel: p.ivaRate === 0 ? 'EXENTO (0%)' : `GRAVADO (${p.ivaRate}%)`,
      locationCells,
      totalStock,
      monthlyUnitsSold: p.monthlyUnitsSold,
      dailyRotationVelocity,
      coverageDays,
      costUsd,
      costVes,
      targetMarginPercent: round2(p.targetMarginPercent),
      realMarginPercent,
      priceUsd,
      priceVes,
      totalCostUsd,
      totalCostVes,
      totalRetailUsd,
      totalRetailVes,
      potentialProfitUsd,
      lastUpdatedVet: p.lastUpdatedVet.slice(0, 16).replace('T', ' '),
    };
  });

  const totalUnitsAll = round2(totalUnitsDec);
  const totalValuationCostUsd = round2(totalCostUsdDec);
  const totalValuationCostVes = convertUsdToVes(totalValuationCostUsd, activeRate);
  const totalValuationRetailUsd = round2(totalRetailUsdDec);
  const totalValuationRetailVes = convertUsdToVes(totalValuationRetailUsd, activeRate);
  const totalPotentialProfitUsd = round2(
    toDecimal(totalValuationRetailUsd).minus(totalValuationCostUsd)
  );
  const totalPotentialProfitVes = round2(
    toDecimal(totalValuationRetailVes).minus(totalValuationCostVes)
  );

  // Reusable Formal Corporate Letterhead Rows for all worksheets (Rows 1..5, 0-based 0..4)
  const corporateLetterheadRows: Array<Array<string | number>> = [
    [
      `MEMBRETE CORPORATIVO Y FISCAL DE LA EMPRESA — ${companyProfile.razonSocial.toUpperCase()}`,
    ],
    [
      'RAZÓN SOCIAL DE LA EMPRESA:',
      companyProfile.razonSocial,
      'RIF FISCAL (SENIAT):',
      companyProfile.rif,
      'CÓDIGO SADA / SUNAGRO:',
      companyProfile.codigoSada,
    ],
    [
      'DIRECCIÓN FISCAL:',
      companyProfile.direccionFiscal,
      'TELÉFONO CORPORATIVO:',
      companyProfile.telefono,
      'CORREO ELECTRÓNICO:',
      companyProfile.email,
    ],
    [
      'REPRESENTANTE / GERENCIA:',
      companyProfile.representanteLegal,
      'GIRO / ACTIVIDAD:',
      companyProfile.actividadEconomica,
      'CONTROL AUDITORÍA:',
      documentControlId,
    ],
    [
      'TASA OFICIAL BCV APLICADA (Bs./USD):',
      activeRate,
      'RÉGIMEN CAMBIARIO:',
      bcvState.rateSourceLabel,
      'FECHA Y HORA EMISIÓN (VET):',
      generatedAtVet,
    ],
  ];

  // ============================================================================
  // SHEET 1: RESUMEN EJECUTIVO GERENCIAL CON MEMBRETE DE EMPRESA
  // ============================================================================
  const resumenSheetAoA: Array<Array<string | number>> = [
    ...corporateLetterheadRows,
    [], // Row 6 (0-based 5): Spacer
    ['CHRYSTAL® ENTERPRISE FOOD RETAIL ERP — REPORTE EJECUTIVO DE VALORACIÓN BIMONETARIA (USD / VES BCV)'], // Row 7 (0-based 6)
    [
      'TOTAL SKUs AUDITADOS EN TABLA:',
      products.length,
      'SEDES Y DEPÓSITOS EN RED:',
      locations.length,
      'EMPRESA TITULAR:',
      `${companyProfile.razonSocial} (${companyProfile.rif})`,
    ], // Row 8 (0-based 7)
    [], // Row 9 (0-based 8): Spacer
    [
      '1. TABLA FORMAL DE CONSOLIDADO FINANCIERO',
      'UNIDADES FÍSICAS',
      'VALORACIÓN USD ($)',
      'VALORACIÓN BOLÍVARES (Bs. BCV)',
    ], // Row 10 (0-based 9)
    ['Unidades Físicas Totales en Red Logística', totalUnitsAll, totalValuationCostUsd, totalValuationCostVes],
    ['Valoración Consolidada al Costo de Reposición', totalUnitsAll, totalValuationCostUsd, totalValuationCostVes],
    ['Valoración Consolidada a Precio de Venta (PVP)', totalUnitsAll, totalValuationRetailUsd, totalValuationRetailVes],
    ['Utilidad Bruta Potencial Consolidada en Inventario', totalUnitsAll, totalPotentialProfitUsd, totalPotentialProfitVes],
    [], // Row 15 (0-based 14): Spacer
    [
      '2. TABLA FORMAL DE SEDES Y DEPÓSITOS DE LA EMPRESA',
      'CLASIFICACIÓN',
      'CÓDIGO',
      'CIUDAD / UBICACIÓN',
      'RESPONSABLE DE SEDE/DEPÓSITO',
      'UNIDADES FÍSICAS',
      'SKUs EN RIESGO / REORDEN',
      'VALOR COSTO (USD)',
      'VALOR COSTO (Bs. BCV)',
      'VALOR PVP (USD)',
    ], // Row 16 (0-based 15)
  ];

  let totalRiskSkusAllLocs = 0;
  for (const loc of locations) {
    let locUnits = toDecimal(0);
    let locCostUsd = toDecimal(0);
    let locRetailUsd = toDecimal(0);
    let lowStockCount = 0;

    for (const p of products) {
      const qty = toDecimal(p.stockByLocation[loc.id] || 0);
      const minQty = p.minStockByLocation[loc.id] || 0;
      if (qty.lte(minQty) && minQty > 0) {
        lowStockCount++;
      }
      locUnits = locUnits.plus(qty);
      locCostUsd = locCostUsd.plus(qty.times(p.costUsd));
      locRetailUsd = locRetailUsd.plus(qty.times(p.priceUsd));
    }
    totalRiskSkusAllLocs += lowStockCount;

    resumenSheetAoA.push([
      loc.name,
      loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 'DEPÓSITO' : 'SEDE',
      loc.code,
      loc.city,
      loc.manager,
      round2(locUnits),
      lowStockCount,
      round2(locCostUsd),
      convertUsdToVes(locCostUsd, activeRate),
      round2(locRetailUsd),
    ]);
  }

  // Formal Closing Total Row for Table 2 in Sheet 1
  resumenSheetAoA.push([
    `TOTAL CONSOLIDADO RED LOGÍSTICA (${locations.length} SEDES / DEPÓSITOS)`,
    'CONSOLIDADO',
    'RED-TOT',
    'VENEZUELA',
    companyProfile.representanteLegal,
    totalUnitsAll,
    totalRiskSkusAllLocs,
    totalValuationCostUsd,
    totalValuationCostVes,
    totalValuationRetailUsd,
  ]);

  resumenSheetAoA.push([]);
  resumenSheetAoA.push([COPYRIGHT_NOTICE]);

  // ============================================================================
  // SHEET 2: TABLA FORMAL EJECUTIVA "PRODUCTO / CELDA" CON MEMBRETE FISCAL
  // ============================================================================
  const locationDynamicHeaders: string[] = [];
  const locationGroupLabels: string[] = [];
  for (const loc of locations) {
    const labelType = loc.type === 'DEPOSITO' || loc.type === 'CEDIS' ? 'DEPÓSITO' : 'SEDE';
    locationDynamicHeaders.push(
      `Stock ${loc.code} (${labelType})`,
      `Punto Pedido ${loc.code}`,
      `Estado ${loc.code}`
    );
    locationGroupLabels.push(
      `[SECCIÓN LOGÍSTICA: ${loc.code} — ${loc.name.toUpperCase()}]`,
      '',
      ''
    );
  }

  const matrizGroupBannerRow: Array<string> = [
    '[SECCIÓN 1: IDENTIFICACIÓN FORMAL DEL PRODUCTO Y CLASIFICACIÓN FISCAL]',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ...locationGroupLabels,
    '[SECCIÓN 2: CONSOLIDADO Y VELOCIDAD DE ROTACIÓN]',
    '',
    '',
    '',
    '[SECCIÓN 3: ESTRUCTURA DE COSTOS, MÁRGENES Y PRECIOS UNITARIOS]',
    '',
    '',
    '',
    '',
    '',
    '[SECCIÓN 4: VALORACIÓN PATRIMONIAL TOTAL EN INVENTARIO (USD / Bs. BCV)]',
    '',
    '',
    '',
    '',
    '',
  ];

  const matrizHeaderRow: Array<string> = [
    'N° ÍTEM',
    'CÓDIGO SKU',
    'CÓDIGO EAN-13',
    'PRODUCTO / DESCRIPCIÓN COMERCIAL (COL B CHRYSTAL®)',
    'CATEGORÍA OPERATIVA',
    'UNIDAD',
    'CLASE ABC',
    'RÉGIMEN IVA',
    ...locationDynamicHeaders,
    'STOCK CONSOLIDADO (COL F)',
    'ROTACIÓN MENSUAL (UND)',
    'ROTACIÓN DIARIA (UND/DÍA)',
    'COBERTURA STOCK (DÍAS)',
    'COSTO UNITARIO (USD)',
    'COSTO UNITARIO (Bs. BCV)',
    'MARGEN OBJETIVO (%)',
    'MARGEN REAL (%)',
    'PRECIO VENTA PVP (USD)',
    'PRECIO VENTA PVP (Bs. BCV)',
    'VALOR TOTAL COSTO (USD)',
    'VALOR TOTAL COSTO (Bs. BCV)',
    'VALOR TOTAL PVP (USD)',
    'VALOR TOTAL PVP (Bs. BCV)',
    'UTILIDAD POTENCIAL (USD)',
    'ÚLTIMA ACTUALIZACIÓN (VET)',
  ];

  const matrizProductoCeldaAoA: Array<Array<string | number>> = [
    ...corporateLetterheadRows,
    [
      'TÍTULO DEL REPORTE:',
      'TABLA FORMAL EJECUTIVA DE INVENTARIO Y EXISTENCIAS MULTISEDE (FORMATO PRODUCTO / CELDA)',
      'EMPRESA TITULAR:',
      companyProfile.razonSocial,
      'RIF:',
      companyProfile.rif,
    ],
    [],
    matrizGroupBannerRow,
    matrizHeaderRow,
  ];

  for (const row of productRows) {
    const locValues: Array<string | number> = [];
    for (const c of row.locationCells) {
      locValues.push(c.stock, c.reorderPoint, c.statusLabel);
    }

    matrizProductoCeldaAoA.push([
      row.itemNumber,
      row.sku,
      row.barcode,
      row.productName,
      row.category,
      row.unit,
      row.abcClass,
      row.ivaLabel,
      ...locValues,
      row.totalStock,
      row.monthlyUnitsSold,
      row.dailyRotationVelocity,
      row.coverageDays,
      row.costUsd,
      row.costVes,
      row.targetMarginPercent,
      row.realMarginPercent,
      row.priceUsd,
      row.priceVes,
      row.totalCostUsd,
      row.totalCostVes,
      row.totalRetailUsd,
      row.totalRetailVes,
      row.potentialProfitUsd,
      row.lastUpdatedVet,
    ]);
  }

  // Totals Footer Row in Sheet 2
  const locTotalsFooter: Array<string | number> = [];
  for (const loc of locations) {
    const sumLoc = products.reduce(
      (acc, p) => round2(toDecimal(acc).plus(p.stockByLocation[loc.id] || 0)),
      0
    );
    const sumMin = products.reduce(
      (acc, p) => round2(toDecimal(acc).plus(p.minStockByLocation[loc.id] || 0)),
      0
    );
    locTotalsFooter.push(sumLoc, sumMin, 'CONSOLIDADO');
  }

  const totalMonthlySold = products.reduce((acc, p) => acc + p.monthlyUnitsSold, 0);

  matrizProductoCeldaAoA.push([]);
  matrizProductoCeldaAoA.push([
    'TOTAL',
    `${products.length} SKUs`,
    '—',
    `TOTALES CONSOLIDADOS DEL INVENTARIO — ${companyProfile.razonSocial} (${companyProfile.rif})`,
    'TODAS',
    '—',
    'ABC',
    '—',
    ...locTotalsFooter,
    totalUnitsAll,
    totalMonthlySold,
    round2(toDecimal(totalMonthlySold).dividedBy(30)),
    '—',
    '—',
    '—',
    '—',
    '—',
    '—',
    '—',
    totalValuationCostUsd,
    totalValuationCostVes,
    totalValuationRetailUsd,
    totalValuationRetailVes,
    totalPotentialProfitUsd,
    generatedAtVet,
  ]);
  matrizProductoCeldaAoA.push([COPYRIGHT_NOTICE]);

  // ============================================================================
  // SHEET 3: FICHAS INDIVIDUALES PRODUCTO / CELDA DELIMITADAS POR BORDES
  // ============================================================================
  const fichasProductoCeldaAoA: Array<Array<string | number>> = [
    ...corporateLetterheadRows, // Rows 0..4
    [], // Row 5: Spacer
    ['CHRYSTAL® ENTERPRISE ERP — FICHAS TÉCNICAS Y FINANCIERAS POR PRODUCTO (BLOQUES DELIMITADOS POR BORDES)'], // Row 6
    [
      'BLOQUE / FICHA',
      'ATRIBUTO PRINCIPAL / DESCRIPCIÓN COMERCIAL',
      'INDICADOR OPERATIVO / FINANCIERO 1',
      'INDICADOR OPERATIVO / FINANCIERO 2',
      'ESTADO / RÉGIMEN / PRECIO',
      'DISTRIBUCIÓN MULTISEDE Y AUDITORÍA PATRIMONIAL',
    ], // Row 7
    [], // Row 8: Unbordered blank spacer before Ficha #01
  ];

  const fichasBoxRanges: ProductFichaBoxRange[] = [];

  for (const row of productRows) {
    const sedeSummary = row.locationCells
      .map((c) => `${c.locationCode}: ${c.stock} ${row.unit} (Mín: ${c.reorderPoint} · ${c.statusLabel})`)
      .join(' | ');

    const startRowZeroBased = fichasProductoCeldaAoA.length;

    // Row 1 of Ficha Card (Top Header Bar of the Framed Box)
    fichasProductoCeldaAoA.push([
      `FICHA PRODUCTO #${String(row.itemNumber).padStart(2, '0')}`,
      `${row.sku} — ${row.productName}`,
      `Categoría: ${row.category}`,
      `EAN-13: ${row.barcode}`,
      `CLASE ABC: ${row.abcClass} · ${row.ivaLabel}`,
      `TITULAR: ${companyProfile.razonSocial} (${companyProfile.rif})`,
    ]);

    // Row 2 of Ficha Card (1. Logística y Existencias Físicas)
    fichasProductoCeldaAoA.push([
      `1. LOGÍSTICA #${String(row.itemNumber).padStart(2, '0')}`,
      `Stock Consolidado Red: ${row.totalStock} ${row.unit}`,
      `Rotación Mensual: ${row.monthlyUnitsSold} ${row.unit}/mes`,
      `Velocidad Diaria: ${row.dailyRotationVelocity.toFixed(2)} ${row.unit}/día`,
      `Cobertura Estimada: ${row.coverageDays.toFixed(1)} días`,
      `Sedes / Depósitos: ${sedeSummary}`,
    ]);

    // Row 3 of Ficha Card (2. Costos Unitarios, PVP y Márgenes)
    fichasProductoCeldaAoA.push([
      `2. FINANZAS UNIT. #${String(row.itemNumber).padStart(2, '0')}`,
      `Estructura de Costo y PVP (${row.sku})`,
      `Costo Reposición: $${row.costUsd.toFixed(2)} (Bs. ${row.costVes.toFixed(2)})`,
      `Precio Venta PVP: $${row.priceUsd.toFixed(2)} (Bs. ${row.priceVes.toFixed(2)})`,
      `Margen Real: ${row.realMarginPercent.toFixed(2)}% (Meta: ${row.targetMarginPercent.toFixed(2)}%)`,
      `Utilidad Unitaria: $${round2(toDecimal(row.priceUsd).minus(row.costUsd)).toFixed(2)} por ${row.unit}`,
    ]);

    // Row 4 of Ficha Card (3. Valoración Patrimonial Total — Bottom Row of the Framed Box)
    fichasProductoCeldaAoA.push([
      `3. VALORACIÓN #${String(row.itemNumber).padStart(2, '0')}`,
      `Valor Total Costo USD: $${row.totalCostUsd.toFixed(2)}`,
      `Valor Total Costo Bs.: Bs. ${row.totalCostVes.toFixed(2)}`,
      `Valor Total PVP USD: $${row.totalRetailUsd.toFixed(2)}`,
      `Valor Total PVP Bs.: Bs. ${row.totalRetailVes.toFixed(2)}`,
      `Utilidad Bruta Potencial: $${row.potentialProfitUsd.toFixed(2)} · Act: ${row.lastUpdatedVet}`,
    ]);

    const endRowZeroBased = fichasProductoCeldaAoA.length - 1;

    // Blank spacer row separating this Ficha Card from the next Ficha Card
    fichasProductoCeldaAoA.push([]);
    const spacerRowZeroBased = fichasProductoCeldaAoA.length - 1;

    fichasBoxRanges.push({
      itemNumber: row.itemNumber,
      sku: row.sku,
      startRowZeroBased,
      endRowZeroBased,
      spacerRowZeroBased,
    });
  }
  fichasProductoCeldaAoA.push([COPYRIGHT_NOTICE]);

  // Compute optimal column widths (!cols) for Sheet 2 so no cell is ever clipped
  const matrizColumnWidths: Array<{ wch: number }> = matrizHeaderRow.map((headerText, colIdx) => {
    let maxLen = headerText.length + 5;
    for (let r = matrizHeaderRowIndexZeroBased + 1; r < matrizProductoCeldaAoA.length - 1; r++) {
      const cellVal = matrizProductoCeldaAoA[r]?.[colIdx];
      if (cellVal !== undefined && cellVal !== null) {
        const strLen = String(cellVal).length + 4;
        if (strLen > maxLen) maxLen = strLen;
      }
    }
    return { wch: Math.min(50, Math.max(16, maxLen)) };
  });

  return {
    documentControlId,
    generatedAtVet,
    companyProfile,
    activeBcvRate: activeRate,
    rateSourceLabel: bcvState.rateSourceLabel,
    totalProducts: products.length,
    totalLocations: locations.length,
    totalUnitsAll,
    totalValuationCostUsd,
    totalValuationCostVes,
    totalValuationRetailUsd,
    totalValuationRetailVes,
    totalPotentialProfitUsd,
    totalPotentialProfitVes,
    productRows,
    resumenSheetAoA,
    matrizProductoCeldaAoA,
    fichasProductoCeldaAoA,
    fichasBoxRanges,
    matrizColumnWidths,
    matrizHeaderRowIndexZeroBased,
  };
}

// ============================================================================
// OPENXML EXECUTIVE CELL STYLING ENGINE (xlsx-js-style)
// ============================================================================

type BorderWeight = 'thin' | 'medium' | 'thick' | 'double';

function makeBorderSide(style: BorderWeight, rgb: string) {
  return { style, color: { rgb } };
}

function makeFullBorder(
  topStyle: BorderWeight,
  topRgb: string,
  bottomStyle: BorderWeight,
  bottomRgb: string,
  leftStyle: BorderWeight,
  leftRgb: string,
  rightStyle: BorderWeight,
  rightRgb: string
): NonNullable<XLSXTypes.CellStyle['border']> {
  return {
    top: makeBorderSide(topStyle, topRgb),
    bottom: makeBorderSide(bottomStyle, bottomRgb),
    left: makeBorderSide(leftStyle, leftRgb),
    right: makeBorderSide(rightStyle, rightRgb),
  };
}

function makeUniformBorder(
  style: BorderWeight = 'thin',
  rgb = 'CBD5E1'
): NonNullable<XLSXTypes.CellStyle['border']> {
  return {
    top: makeBorderSide(style, rgb),
    bottom: makeBorderSide(style, rgb),
    left: makeBorderSide(style, rgb),
    right: makeBorderSide(style, rgb),
  };
}

function ensureCellObject(ws: XLSXTypes.WorkSheet, r: number, c: number): XLSXTypes.CellObject {
  const ref = XLSX.utils.encode_cell({ r, c });
  if (!ws[ref]) {
    ws[ref] = { t: 's', v: '' };
  }
  return ws[ref] as XLSXTypes.CellObject;
}

function setCellStyle(
  ws: XLSXTypes.WorkSheet,
  r: number,
  c: number,
  style: XLSXTypes.CellStyle
): void {
  const cell = ensureCellObject(ws, r, c);
  cell.s = {
    ...(cell.s || {}),
    ...style,
  };
}

/**
 * Styles the 5-row Formal Corporate & Fiscal Letterhead (Rows 0..4) across [0 .. maxCol]
 * with a Deep Navy title banner (Row 0) and a bordered fiscal metadata table (Rows 1..4).
 */
function styleCorporateLetterheadBlock(
  ws: XLSXTypes.WorkSheet,
  maxColZeroBased: number,
  merges: XLSXTypes.Range[]
): void {
  const spanCols = Math.max(5, maxColZeroBased);

  // Merge Row 0 across the letterhead width
  merges.push({
    s: { r: 0, c: 0 },
    e: { r: 0, c: spanCols },
  });

  // Row 0: Executive Navy Banner (#0F172A) with Emerald (#10B981) bottom accent border
  for (let c = 0; c <= spanCols; c++) {
    setCellStyle(ws, 0, c, {
      fill: { patternType: 'solid', fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: false },
      border: makeFullBorder(
        'medium',
        '0F172A',
        'medium',
        '10B981',
        c === 0 ? 'medium' : 'thin',
        '0F172A',
        c === spanCols ? 'medium' : 'thin',
        '0F172A'
      ),
    });
  }

  // Rows 1..4: Corporate Fiscal Metadata Grid (Cols 0..5, with Col 5 merged to spanCols if spanCols > 5 && spanCols <= 9)
  const mergeLastColToSpan = spanCols > 5 && spanCols <= 9;
  const effectiveRightCol = mergeLastColToSpan ? spanCols : 5;

  for (let r = 1; r <= 4; r++) {
    if (mergeLastColToSpan) {
      merges.push({
        s: { r, c: 5 },
        e: { r, c: spanCols },
      });
    }

    for (let c = 0; c <= effectiveRightCol; c++) {
      const isLabelCol = c === 0 || c === 2 || c === 4;
      const isBottomRow = r === 4;
      const isHighlightValue =
        (r === 1 && (c === 1 || c === 3)) || (r === 4 && c === 1); // Razón Social, RIF, and Tasa BCV

      const fillRgb = isLabelCol
        ? 'E2E8F0' // Executive Slate 200 label background
        : isHighlightValue
        ? 'ECFDF5' // Soft Emerald highlight for Razón Social, RIF, and BCV Rate
        : 'F8FAFC'; // Crisp Corporate Alabaster for standard metadata values

      const fontColorRgb = isLabelCol
        ? '1E293B'
        : isHighlightValue
        ? '065F46'
        : '0F172A';

      const cell = ensureCellObject(ws, r, c);
      const isRateCell = r === 4 && c === 1 && typeof cell.v === 'number';

      setCellStyle(ws, r, c, {
        fill: { patternType: 'solid', fgColor: { rgb: fillRgb } },
        font: {
          name: 'Calibri',
          sz: 10,
          bold: isLabelCol || isHighlightValue || c === 1,
          color: { rgb: fontColorRgb },
        },
        alignment: {
          horizontal: isRateCell ? 'right' : 'left',
          vertical: 'center',
          wrapText: true,
        },
        numFmt: isRateCell ? '"Bs. "#,##0.00' : undefined,
        border: makeFullBorder(
          r === 1 ? 'medium' : 'thin',
          r === 1 ? '10B981' : '94A3B8',
          isBottomRow ? 'medium' : 'thin',
          isBottomRow ? '0F172A' : '94A3B8',
          c === 0 ? 'medium' : 'thin',
          c === 0 ? '0F172A' : '94A3B8',
          c === effectiveRightCol ? 'medium' : 'thin',
          c === effectiveRightCol ? '0F172A' : '94A3B8'
        ),
      });
    }
  }
}

/**
 * Styles Sheet 1 (1_Resumen_Ejecutivo) with executive header colors, bordered financial tables,
 * currency number formatting, and highlighted totals.
 */
function styleResumenWorksheet(
  ws: XLSXTypes.WorkSheet,
  payload: EnterpriseExcelStructuredPayload
): void {
  const merges: XLSXTypes.Range[] = [];
  const totalCols = 10; // Columns A..J (0..9)

  // 1. Style Formal Corporate Letterhead (Rows 0..4 across A..J)
  styleCorporateLetterheadBlock(ws, totalCols - 1, merges);

  // 2. Row 6 (Excel Row 7): Executive Report Title Banner merged across A7:J7
  merges.push({ s: { r: 6, c: 0 }, e: { r: 6, c: totalCols - 1 } });
  for (let c = 0; c < totalCols; c++) {
    setCellStyle(ws, 6, c, {
      fill: { patternType: 'solid', fgColor: { rgb: '1E3A8A' } },
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: makeFullBorder(
        'medium',
        '0F172A',
        'thin',
        '1E3A8A',
        c === 0 ? 'medium' : 'thin',
        '0F172A',
        c === totalCols - 1 ? 'medium' : 'thin',
        '0F172A'
      ),
    });
  }

  // 3. Row 7 (Excel Row 8): Executive KPI Strip (A8..J8, with F8:J8 merged)
  merges.push({ s: { r: 7, c: 5 }, e: { r: 7, c: totalCols - 1 } });
  for (let c = 0; c < totalCols; c++) {
    const isLabel = c === 0 || c === 2 || c === 4;
    const isMetricNum = c === 1 || c === 3;
    setCellStyle(ws, 7, c, {
      fill: {
        patternType: 'solid',
        fgColor: { rgb: isLabel ? 'DBEAFE' : isMetricNum ? 'EFF6FF' : 'F1F5F9' },
      },
      font: {
        name: 'Calibri',
        sz: 10,
        bold: true,
        color: { rgb: isLabel ? '1E3A8A' : isMetricNum ? '1D4ED8' : '0F172A' },
      },
      alignment: {
        horizontal: isMetricNum ? 'center' : 'left',
        vertical: 'center',
      },
      border: makeFullBorder(
        'thin',
        '93C5FD',
        'medium',
        '0F172A',
        c === 0 ? 'medium' : 'thin',
        c === 0 ? '0F172A' : '93C5FD',
        c === totalCols - 1 ? 'medium' : 'thin',
        c === totalCols - 1 ? '0F172A' : '93C5FD'
      ),
    });
  }

  // 4. Table 1: Consolidado Financiero (Header at Row 9, Data at Rows 10..13, Cols 0..3)
  for (let c = 0; c <= 3; c++) {
    setCellStyle(ws, 9, c, {
      fill: { patternType: 'solid', fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: {
        horizontal: c === 0 ? 'left' : 'right',
        vertical: 'center',
        wrapText: true,
      },
      border: makeFullBorder(
        'medium',
        '0F172A',
        'medium',
        '10B981',
        c === 0 ? 'medium' : 'thin',
        c === 0 ? '0F172A' : '475569',
        c === 3 ? 'medium' : 'thin',
        c === 3 ? '0F172A' : '475569'
      ),
    });
  }

  for (let r = 10; r <= 13; r++) {
    const isProfitRow = r === 13;
    const rowFill = isProfitRow ? 'D1FAE5' : r % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    const textColor = isProfitRow ? '065F46' : '0F172A';

    for (let c = 0; c <= 3; c++) {
      const numFmt =
        c === 1 ? '#,##0' : c === 2 ? '"$"#,##0.00' : c === 3 ? '"Bs. "#,##0.00' : undefined;

      setCellStyle(ws, r, c, {
        fill: { patternType: 'solid', fgColor: { rgb: rowFill } },
        font: {
          name: 'Calibri',
          sz: 10,
          bold: isProfitRow || c >= 2,
          color: { rgb: textColor },
        },
        alignment: {
          horizontal: c === 0 ? 'left' : 'right',
          vertical: 'center',
        },
        numFmt,
        border: makeFullBorder(
          isProfitRow ? 'medium' : 'thin',
          isProfitRow ? '059669' : 'CBD5E1',
          r === 13 ? 'medium' : 'thin',
          r === 13 ? '0F172A' : 'CBD5E1',
          c === 0 ? 'medium' : 'thin',
          c === 0 ? '0F172A' : 'CBD5E1',
          c === 3 ? 'medium' : 'thin',
          c === 3 ? '0F172A' : 'CBD5E1'
        ),
      });
    }
  }

  // 5. Table 2: Sedes y Depósitos de la Empresa (Header at Row 15, Data at Rows 16..16+N-1, Total at Row 16+N)
  const table2HeaderRow = 15;
  const firstLocRow = 16;
  const totalLocRow = firstLocRow + payload.totalLocations;

  for (let c = 0; c < totalCols; c++) {
    setCellStyle(ws, table2HeaderRow, c, {
      fill: { patternType: 'solid', fgColor: { rgb: '1E293B' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: {
        horizontal: c >= 5 ? 'right' : c === 1 || c === 2 ? 'center' : 'left',
        vertical: 'center',
        wrapText: true,
      },
      border: makeFullBorder(
        'medium',
        '0F172A',
        'medium',
        '38BDF8',
        c === 0 ? 'medium' : 'thin',
        c === 0 ? '0F172A' : '475569',
        c === totalCols - 1 ? 'medium' : 'thin',
        c === totalCols - 1 ? '0F172A' : '475569'
      ),
    });
  }

  for (let r = firstLocRow; r < totalLocRow; r++) {
    const baseFill = (r - firstLocRow) % 2 === 0 ? 'FFFFFF' : 'F8FAFC';

    for (let c = 0; c < totalCols; c++) {
      const cell = ensureCellObject(ws, r, c);
      let cellFill = baseFill;
      let fontColor = '0F172A';
      let isBold = c === 0 || c === 2 || c >= 7;

      // Badge color for Clasificación (SEDE vs DEPÓSITO)
      if (c === 1) {
        const valStr = String(cell.v || '');
        if (valStr.includes('DEPÓSITO')) {
          cellFill = 'FEF3C7';
          fontColor = '92400E';
        } else {
          cellFill = 'DBEAFE';
          fontColor = '1E40AF';
        }
        isBold = true;
      }

      // Badge color for SKUs en Riesgo
      if (c === 6) {
        const riskVal = Number(cell.v || 0);
        if (riskVal > 0) {
          cellFill = 'FEE2E2';
          fontColor = '991B1B';
        } else {
          cellFill = 'DCFCE7';
          fontColor = '166534';
        }
        isBold = true;
      }

      // Subtle tint for Valor PVP USD
      if (c === 9) {
        cellFill = 'ECFDF5';
        fontColor = '065F46';
      }

      const numFmt =
        c === 5 || c === 6
          ? '#,##0'
          : c === 7 || c === 9
          ? '"$"#,##0.00'
          : c === 8
          ? '"Bs. "#,##0.00'
          : undefined;

      setCellStyle(ws, r, c, {
        fill: { patternType: 'solid', fgColor: { rgb: cellFill } },
        font: { name: 'Calibri', sz: 10, bold: isBold, color: { rgb: fontColor } },
        alignment: {
          horizontal:
            c === 1 || c === 2 || c === 6 ? 'center' : c >= 5 ? 'right' : 'left',
          vertical: 'center',
        },
        numFmt,
        border: makeFullBorder(
          'thin',
          'CBD5E1',
          'thin',
          'CBD5E1',
          c === 0 ? 'medium' : 'thin',
          c === 0 ? '0F172A' : 'CBD5E1',
          c === totalCols - 1 ? 'medium' : 'thin',
          c === totalCols - 1 ? '0F172A' : 'CBD5E1'
        ),
      });
    }
  }

  // Style Table 2 Closing Total Row
  for (let c = 0; c < totalCols; c++) {
    const numFmt =
      c === 5 || c === 6
        ? '#,##0'
        : c === 7 || c === 9
        ? '"$"#,##0.00'
        : c === 8
        ? '"Bs. "#,##0.00'
        : undefined;

    setCellStyle(ws, totalLocRow, c, {
      fill: { patternType: 'solid', fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: {
        horizontal:
          c === 1 || c === 2 || c === 6 ? 'center' : c >= 5 ? 'right' : 'left',
        vertical: 'center',
      },
      numFmt,
      border: makeFullBorder(
        'medium',
        '10B981',
        'medium',
        '0F172A',
        c === 0 ? 'medium' : 'thin',
        c === 0 ? '0F172A' : '334155',
        c === totalCols - 1 ? 'medium' : 'thin',
        c === totalCols - 1 ? '0F172A' : '334155'
      ),
    });
  }

  // Copyright row styling
  const copyrightRow = totalLocRow + 2;
  setCellStyle(ws, copyrightRow, 0, {
    font: { name: 'Calibri', sz: 9, italic: true, bold: true, color: { rgb: '475569' } },
  });

  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 46 }, // Col A: Concepto / Sede
    { wch: 34 }, // Col B: Razón Social / Clasificación
    { wch: 26 }, // Col C: Etiqueta RIF / Código
    { wch: 32 }, // Col D: Valor RIF / Ciudad
    { wch: 28 }, // Col E: Etiqueta SADA / Responsable
    { wch: 28 }, // Col F: Valor SADA / Unidades
    { wch: 24 }, // Col G: SKUs en Riesgo
    { wch: 22 }, // Col H: Valor Costo USD
    { wch: 26 }, // Col I: Valor Costo Bs.
    { wch: 22 }, // Col J: Valor PVP USD
  ];

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:J30');
  const rowsMeta: Array<{ hpt: number }> = [];
  for (let R = 0; R <= range.e.r; R++) {
    if (R === 0) rowsMeta.push({ hpt: 30 });
    else if (R >= 1 && R <= 4) rowsMeta.push({ hpt: 23 });
    else if (R === 6 || R === 7) rowsMeta.push({ hpt: 24 });
    else if (R === 9 || R === table2HeaderRow || R === totalLocRow) rowsMeta.push({ hpt: 26 });
    else rowsMeta.push({ hpt: 21 });
  }
  ws['!rows'] = rowsMeta;
}

/**
 * Styles Sheet 2 (2_Matriz_Producto_Celda) with executive letterhead, merged color-coded section banners,
 * formal bordered spreadsheet cells, status fills, number formats, and totals footer.
 */
function styleMatrizWorksheet(
  ws: XLSXTypes.WorkSheet,
  payload: EnterpriseExcelStructuredPayload
): void {
  const merges: XLSXTypes.Range[] = [];
  const totalCols = payload.matrizColumnWidths.length;

  // 1. Style Corporate Letterhead (Rows 0..4) across columns 0..5 (with Row 0 banner merged 0..9)
  styleCorporateLetterheadBlock(ws, 5, merges);

  // 2. Style Row 5 (Excel Row 6: TÍTULO DEL REPORTE strip)
  for (let c = 0; c <= 5; c++) {
    const isLabel = c === 0 || c === 2 || c === 4;
    setCellStyle(ws, 5, c, {
      fill: { patternType: 'solid', fgColor: { rgb: isLabel ? '065F46' : 'ECFDF5' } },
      font: {
        name: 'Calibri',
        sz: 10,
        bold: true,
        color: { rgb: isLabel ? 'FFFFFF' : '064E3B' },
      },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
      border: makeFullBorder(
        'thin',
        '059669',
        'medium',
        '0F172A',
        c === 0 ? 'medium' : 'thin',
        c === 0 ? '0F172A' : '059669',
        c === 5 ? 'medium' : 'thin',
        c === 5 ? '0F172A' : '059669'
      ),
    });
  }

  // 3. Style Row 7 (Excel Row 8: Section Group Banners with merges & color-coding)
  const groupRowIdx = payload.matrizHeaderRowIndexZeroBased - 1; // 7
  const locColsCount = payload.totalLocations * 3;
  const section2Start = 8 + locColsCount;
  const section3Start = section2Start + 4;
  const section4Start = section3Start + 6;

  const groupSections: Array<{ start: number; end: number; rgb: string }> = [
    { start: 0, end: 7, rgb: '1E293B' }, // Sección 1: Identificación
  ];
  for (let l = 0; l < payload.totalLocations; l++) {
    groupSections.push({
      start: 8 + l * 3,
      end: 8 + l * 3 + 2,
      rgb: l % 2 === 0 ? '1E3A8A' : '312E81', // Alternating Navy & Indigo per Sede/Depósito
    });
  }
  groupSections.push(
    { start: section2Start, end: section2Start + 3, rgb: '065F46' }, // Sección 2: Consolidado y Rotación
    { start: section3Start, end: section3Start + 5, rgb: '4C1D95' }, // Sección 3: Costos y Precios
    { start: section4Start, end: totalCols - 1, rgb: '0F172A' } // Sección 4: Valoración Patrimonial
  );

  for (const sec of groupSections) {
    if (sec.end > sec.start) {
      merges.push({ s: { r: groupRowIdx, c: sec.start }, e: { r: groupRowIdx, c: sec.end } });
    }
    for (let c = sec.start; c <= sec.end; c++) {
      setCellStyle(ws, groupRowIdx, c, {
        fill: { patternType: 'solid', fgColor: { rgb: sec.rgb } },
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: makeFullBorder(
          'medium',
          '0F172A',
          'thin',
          'FFFFFF',
          c === sec.start ? 'medium' : 'thin',
          '0F172A',
          c === sec.end ? 'medium' : 'thin',
          '0F172A'
        ),
      });
    }
  }

  // 4. Style Row 8 (Excel Row 9: Formal Table Column Headers)
  const headerRowIdx = payload.matrizHeaderRowIndexZeroBased; // 8
  const headerTitles = payload.matrizProductoCeldaAoA[headerRowIdx] || [];

  for (let c = 0; c < totalCols; c++) {
    setCellStyle(ws, headerRowIdx, c, {
      fill: { patternType: 'solid', fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: makeFullBorder(
        'medium',
        '0F172A',
        'medium',
        '10B981',
        c === 0 ? 'medium' : 'thin',
        c === 0 ? '0F172A' : '475569',
        c === totalCols - 1 ? 'medium' : 'thin',
        c === totalCols - 1 ? '0F172A' : '475569'
      ),
    });
  }

  // 5. Style Product Data Rows (Rows 9 .. 9 + N - 1)
  const firstDataRow = headerRowIdx + 1;
  const lastDataRow = firstDataRow + payload.productRows.length - 1;

  for (let r = firstDataRow; r <= lastDataRow; r++) {
    const isEven = (r - firstDataRow) % 2 === 0;
    const baseFill = isEven ? 'FFFFFF' : 'F8FAFC';
    const isLastDataRow = r === lastDataRow;

    for (let c = 0; c < totalCols; c++) {
      const cell = ensureCellObject(ws, r, c);
      const colTitle = String(headerTitles[c] || '');
      let fillRgb = baseFill;
      let fontRgb = '0F172A';
      let isBold = c === 1 || c === 3;
      let hAlign: 'left' | 'center' | 'right' =
        typeof cell.v === 'number' ? 'right' : 'left';

      if (c === 0 || c === 5 || c === 6 || c === 7) {
        hAlign = 'center';
      }

      // SKU Column subtle slate badge
      if (c === 1) {
        fillRgb = isEven ? 'F1F5F9' : 'E2E8F0';
      }

      // ABC Class badge
      if (c === 6) {
        const abcVal = String(cell.v || '');
        isBold = true;
        if (abcVal === 'A') {
          fillRgb = 'DCFCE7';
          fontRgb = '166534';
        } else if (abcVal === 'B') {
          fillRgb = 'DBEAFE';
          fontRgb = '1E40AF';
        } else {
          fillRgb = 'FEF3C7';
          fontRgb = '92400E';
        }
      }

      // Per-Location Estado column ('ÓPTIMO' vs 'REORDENAR')
      if (colTitle.startsWith('Estado ')) {
        hAlign = 'center';
        isBold = true;
        if (cell.v === 'REORDENAR') {
          fillRgb = 'FEE2E2';
          fontRgb = '991B1B';
        } else {
          fillRgb = 'DCFCE7';
          fontRgb = '166534';
        }
      }

      // Stock Consolidado column highlight
      if (c === section2Start) {
        fillRgb = 'ECFDF5';
        fontRgb = '065F46';
        isBold = true;
      }

      // Bs. BCV Price & Total PVP columns highlight
      if (colTitle.includes('PVP (Bs.') || colTitle.includes('TOTAL PVP (Bs.')) {
        fillRgb = 'EFF6FF';
        fontRgb = '1E3A8A';
        isBold = true;
      }

      // Potential Profit USD highlight
      if (colTitle.includes('UTILIDAD POTENCIAL')) {
        fillRgb = 'F0FDF4';
        fontRgb = '166534';
        isBold = true;
      }

      let numFmt: string | undefined;
      if (typeof cell.v === 'number') {
        if (colTitle.includes('(USD)')) {
          numFmt = '"$"#,##0.00';
          cell.z = numFmt;
        } else if (colTitle.includes('(Bs.')) {
          numFmt = '"Bs. "#,##0.00';
          cell.z = numFmt;
        } else if (colTitle.includes('(%)')) {
          numFmt = '0.00"%"';
          cell.z = numFmt;
        } else if (
          colTitle.includes('STOCK') ||
          colTitle.includes('Stock') ||
          colTitle.includes('Punto Pedido') ||
          colTitle.includes('MENSUAL')
        ) {
          numFmt = '#,##0';
          cell.z = numFmt;
        } else if (colTitle.includes('DIARIA') || colTitle.includes('COBERTURA')) {
          numFmt = '#,##0.00';
          cell.z = numFmt;
        }
      }

      setCellStyle(ws, r, c, {
        fill: { patternType: 'solid', fgColor: { rgb: fillRgb } },
        font: { name: 'Calibri', sz: 10, bold: isBold, color: { rgb: fontRgb } },
        alignment: { horizontal: hAlign, vertical: 'center' },
        numFmt,
        border: makeFullBorder(
          'thin',
          'CBD5E1',
          isLastDataRow ? 'medium' : 'thin',
          isLastDataRow ? '0F172A' : 'CBD5E1',
          c === 0 ? 'medium' : 'thin',
          c === 0 ? '0F172A' : 'CBD5E1',
          c === totalCols - 1 ? 'medium' : 'thin',
          c === totalCols - 1 ? '0F172A' : 'CBD5E1'
        ),
      });
    }
  }

  // 6. Style Totals Footer Row (Row lastDataRow + 2)
  const totalsRowIdx = lastDataRow + 2;
  for (let c = 0; c < totalCols; c++) {
    const cell = ensureCellObject(ws, totalsRowIdx, c);
    const colTitle = String(headerTitles[c] || '');
    let numFmt: string | undefined;
    if (typeof cell.v === 'number') {
      if (colTitle.includes('(USD)')) numFmt = '"$"#,##0.00';
      else if (colTitle.includes('(Bs.')) numFmt = '"Bs. "#,##0.00';
      else numFmt = '#,##0';
      cell.z = numFmt;
    }

    setCellStyle(ws, totalsRowIdx, c, {
      fill: { patternType: 'solid', fgColor: { rgb: '0F172A' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: {
        horizontal: typeof cell.v === 'number' ? 'right' : c === 3 ? 'left' : 'center',
        vertical: 'center',
      },
      numFmt,
      border: makeFullBorder(
        'medium',
        '10B981',
        'medium',
        '0F172A',
        c === 0 ? 'medium' : 'thin',
        c === 0 ? '0F172A' : '334155',
        c === totalCols - 1 ? 'medium' : 'thin',
        c === totalCols - 1 ? '0F172A' : '334155'
      ),
    });
  }

  // Copyright notice row
  setCellStyle(ws, totalsRowIdx + 1, 0, {
    font: { name: 'Calibri', sz: 9, italic: true, bold: true, color: { rgb: '475569' } },
  });

  ws['!merges'] = merges;
  ws['!cols'] = payload.matrizColumnWidths;

  const lastColLetter = XLSX.utils.encode_col(totalCols - 1);
  const excelHeaderRowOneBased = headerRowIdx + 1;
  const excelLastDataRowOneBased = lastDataRow + 1;
  ws['!autofilter'] = {
    ref: `A${excelHeaderRowOneBased}:${lastColLetter}${excelLastDataRowOneBased}`,
  };

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z100');
  const rowsMeta: Array<{ hpt: number }> = [];
  for (let R = 0; R <= range.e.r; R++) {
    if (R === 0) rowsMeta.push({ hpt: 30 });
    else if (R >= 1 && R <= 5) rowsMeta.push({ hpt: 23 });
    else if (R === groupRowIdx) rowsMeta.push({ hpt: 24 });
    else if (R === headerRowIdx) rowsMeta.push({ hpt: 30 });
    else if (R === totalsRowIdx) rowsMeta.push({ hpt: 26 });
    else rowsMeta.push({ hpt: 21 });
  }
  ws['!rows'] = rowsMeta;
}

/**
 * Styles Sheet 3 (3_Fichas_Producto_Celda) so that each individual Product Ficha is rendered
 * inside a self-contained 4-row × 6-column Framed Executive Box with a dark navy/emerald header bar,
 * medium outer perimeter borders (#0F172A), internal grid borders (#CBD5E1), and an unbordered blank
 * spacer row separating one product ficha from the next.
 */
function styleFichasWorksheet(
  ws: XLSXTypes.WorkSheet,
  payload: EnterpriseExcelStructuredPayload
): void {
  const merges: XLSXTypes.Range[] = [];
  const totalCols = 6; // Columns A..F (0..5)

  // 1. Style Formal Corporate Letterhead (Rows 0..4 across A..F)
  styleCorporateLetterheadBlock(ws, totalCols - 1, merges);

  // 2. Row 6 (Excel Row 7): Sheet Banner merged across A7:F7
  merges.push({ s: { r: 6, c: 0 }, e: { r: 6, c: totalCols - 1 } });
  for (let c = 0; c < totalCols; c++) {
    setCellStyle(ws, 6, c, {
      fill: { patternType: 'solid', fgColor: { rgb: '1E3A8A' } },
      font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: makeFullBorder(
        'medium',
        '0F172A',
        'thin',
        '1E3A8A',
        c === 0 ? 'medium' : 'thin',
        '0F172A',
        c === totalCols - 1 ? 'medium' : 'thin',
        '0F172A'
      ),
    });
  }

  // 3. Row 7 (Excel Row 8): Column Guide Header Bar
  for (let c = 0; c < totalCols; c++) {
    setCellStyle(ws, 7, c, {
      fill: { patternType: 'solid', fgColor: { rgb: '334155' } },
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
      border: makeFullBorder(
        'thin',
        '475569',
        'medium',
        '0F172A',
        c === 0 ? 'medium' : 'thin',
        c === 0 ? '0F172A' : '475569',
        c === totalCols - 1 ? 'medium' : 'thin',
        c === totalCols - 1 ? '0F172A' : '475569'
      ),
    });
  }

  // 4. Style each individual Product Ficha Box (4 bordered rows + 1 unbordered spacer row)
  for (const box of payload.fichasBoxRanges) {
    const rHeader = box.startRowZeroBased; // Card Row 1: Top Header of Ficha
    const rLogistica = box.startRowZeroBased + 1; // Card Row 2: 1. Logística y Stock
    const rFinanzas = box.startRowZeroBased + 2; // Card Row 3: 2. Finanzas Unitarias
    const rValoracion = box.endRowZeroBased; // Card Row 4: 3. Valoración Patrimonial (Bottom of Ficha)

    // Card Row 1 (Top Header Bar of the Product Ficha — Medium Top Border)
    for (let c = 0; c < totalCols; c++) {
      const isCompanyBadge = c === totalCols - 1;
      setCellStyle(ws, rHeader, c, {
        fill: {
          patternType: 'solid',
          fgColor: { rgb: isCompanyBadge ? '065F46' : '0F172A' },
        },
        font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: makeFullBorder(
          'medium',
          '0F172A', // Thick/Medium top border of the Ficha box
          'thin',
          '475569',
          c === 0 ? 'medium' : 'thin',
          c === 0 ? '0F172A' : '334155',
          c === totalCols - 1 ? 'medium' : 'thin',
          c === totalCols - 1 ? '0F172A' : '334155'
        ),
      });
    }

    // Card Row 2 (Logística y Stock — Medium Left & Right Outer Borders, Thin Inner Borders)
    for (let c = 0; c < totalCols; c++) {
      const isSectionTag = c === 0;
      const isConsolidatedStock = c === 1;
      setCellStyle(ws, rLogistica, c, {
        fill: {
          patternType: 'solid',
          fgColor: {
            rgb: isSectionTag ? 'E2E8F0' : isConsolidatedStock ? 'ECFDF5' : 'FFFFFF',
          },
        },
        font: {
          name: 'Calibri',
          sz: 10,
          bold: isSectionTag || isConsolidatedStock,
          color: {
            rgb: isSectionTag ? '1E293B' : isConsolidatedStock ? '065F46' : '0F172A',
          },
        },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: makeFullBorder(
          'thin',
          'CBD5E1',
          'thin',
          'CBD5E1',
          c === 0 ? 'medium' : 'thin',
          c === 0 ? '0F172A' : 'CBD5E1',
          c === totalCols - 1 ? 'medium' : 'thin',
          c === totalCols - 1 ? '0F172A' : 'CBD5E1'
        ),
      });
    }

    // Card Row 3 (Finanzas Unitarias — Medium Left & Right Outer Borders, Thin Inner Borders)
    for (let c = 0; c < totalCols; c++) {
      const isSectionTag = c === 0;
      const isPvpHighlight = c === 3;
      setCellStyle(ws, rFinanzas, c, {
        fill: {
          patternType: 'solid',
          fgColor: {
            rgb: isSectionTag ? 'DBEAFE' : isPvpHighlight ? 'EFF6FF' : 'F8FAFC',
          },
        },
        font: {
          name: 'Calibri',
          sz: 10,
          bold: isSectionTag || isPvpHighlight || c === 4,
          color: {
            rgb: isSectionTag ? '1E3A8A' : isPvpHighlight ? '1D4ED8' : '0F172A',
          },
        },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: makeFullBorder(
          'thin',
          'CBD5E1',
          'thin',
          'CBD5E1',
          c === 0 ? 'medium' : 'thin',
          c === 0 ? '0F172A' : 'CBD5E1',
          c === totalCols - 1 ? 'medium' : 'thin',
          c === totalCols - 1 ? '0F172A' : 'CBD5E1'
        ),
      });
    }

    // Card Row 4 (Valoración Patrimonial — Medium Bottom, Left & Right Borders closing the Ficha box!)
    for (let c = 0; c < totalCols; c++) {
      const isSectionTag = c === 0;
      const isProfitCol = c === totalCols - 1;
      setCellStyle(ws, rValoracion, c, {
        fill: {
          patternType: 'solid',
          fgColor: {
            rgb: isSectionTag ? 'D1FAE5' : isProfitCol ? 'DCFCE7' : 'F0FDF4',
          },
        },
        font: {
          name: 'Calibri',
          sz: 10,
          bold: true,
          color: { rgb: isSectionTag ? '065F46' : isProfitCol ? '166534' : '064E3B' },
        },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: true },
        border: makeFullBorder(
          'thin',
          '94A3B8',
          'medium',
          '0F172A', // Thick/Medium bottom border closing the Ficha box!
          c === 0 ? 'medium' : 'thin',
          c === 0 ? '0F172A' : '94A3B8',
          c === totalCols - 1 ? 'medium' : 'thin',
          c === totalCols - 1 ? '0F172A' : '94A3B8'
        ),
      });
    }
  }

  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 26 }, // Col A: Bloque / Ficha
    { wch: 44 }, // Col B: Descripción Comercial / Stock Red
    { wch: 36 }, // Col C: Indicador 1
    { wch: 38 }, // Col D: Indicador 2
    { wch: 38 }, // Col E: Estado / Margen / PVP Bs.
    { wch: 68 }, // Col F: Distribución Multisede y Utilidad Potencial
  ];

  const spacerRowSet = new Set(payload.fichasBoxRanges.map((b) => b.spacerRowZeroBased));
  spacerRowSet.add(5);
  spacerRowSet.add(8);

  const headerRowSet = new Set(payload.fichasBoxRanges.map((b) => b.startRowZeroBased));

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:F100');
  const rowsMeta: Array<{ hpt: number }> = [];
  for (let R = 0; R <= range.e.r; R++) {
    if (R === 0) rowsMeta.push({ hpt: 30 });
    else if (R >= 1 && R <= 4) rowsMeta.push({ hpt: 23 });
    else if (R === 6 || R === 7) rowsMeta.push({ hpt: 25 });
    else if (spacerRowSet.has(R)) rowsMeta.push({ hpt: 13 }); // Visual gap between Fichas
    else if (headerRowSet.has(R)) rowsMeta.push({ hpt: 25 }); // Ficha Card Header bar
    else rowsMeta.push({ hpt: 22 }); // Ficha Card Body rows
  }
  ws['!rows'] = rowsMeta;
}

/**
 * Pure workbook builder that returns both the structured payload and the fully styled
 * `XLSX.WorkBook` (with background fills, cell borders, merges, and number formats)
 * so it can be unit-tested and exported directly to `.xlsx`.
 */
export function buildStyledEnterpriseWorkbook(
  products: Product[],
  locations: LocationNode[],
  bcvState: BcvRateState,
  companyInput?: Partial<CompanyFiscalProfile> | null
): { workbook: XLSXTypes.WorkBook; payload: EnterpriseExcelStructuredPayload } {
  const payload = buildEnterpriseExcelStructuredPayload(
    products,
    locations,
    bcvState,
    companyInput
  );
  const wb = XLSX.utils.book_new();

  wb.Props = {
    Title: `${payload.companyProfile.razonSocial} (${payload.companyProfile.rif}) — Inventario Producto/Celda (${bcvState.caracasDateFormatted})`,
    Subject: `Inventario Maestro Multisede — ${payload.companyProfile.razonSocial} — RIF ${payload.companyProfile.rif}`,
    Author: `${payload.companyProfile.razonSocial} · Chrystal® Enterprise ERP · AR Group 2026`,
    Company: payload.companyProfile.razonSocial,
    CreatedDate: new Date(),
  };

  // 1. Sheet 1: Resumen Ejecutivo Gerencial (Con Membrete Coloreado y Tablas Bordeadas)
  const wsResumen = XLSX.utils.aoa_to_sheet(payload.resumenSheetAoA);
  styleResumenWorksheet(wsResumen, payload);
  XLSX.utils.book_append_sheet(wb, wsResumen, '1_Resumen_Ejecutivo');

  // 2. Sheet 2: Matriz Formal Producto / Celda (Con Encabezados de Sección, Bordes y AutoFiltro)
  const wsMatriz = XLSX.utils.aoa_to_sheet(payload.matrizProductoCeldaAoA);
  styleMatrizWorksheet(wsMatriz, payload);
  XLSX.utils.book_append_sheet(wb, wsMatriz, '2_Matriz_Producto_Celda');

  // 3. Sheet 3: Fichas Técnicas Producto / Celda (Tarjetas Individuales Delimitadas por Bordes)
  const wsFichas = XLSX.utils.aoa_to_sheet(payload.fichasProductoCeldaAoA);
  styleFichasWorksheet(wsFichas, payload);
  XLSX.utils.book_append_sheet(wb, wsFichas, '3_Fichas_Producto_Celda');

  return { workbook: wb, payload };
}

export function exportInventoryDualSheetExcel(
  products: Product[],
  locations: LocationNode[],
  bcvState: BcvRateState,
  companyInput?: Partial<CompanyFiscalProfile> | null
): void {
  const { workbook, payload } = buildStyledEnterpriseWorkbook(
    products,
    locations,
    bcvState,
    companyInput
  );

  const cleanDate = bcvState.caracasDateFormatted.replace(/\//g, '-');
  const cleanRif =
    payload.companyProfile.rif.replace(/[^A-Za-z0-9-]/g, '').slice(0, 14) || 'EMPRESA';

  XLSX.writeFile(
    workbook,
    `Chrystal_Tabla_Formal_${cleanRif}_ProductoCelda_${cleanDate}.xlsx`
  );
}
