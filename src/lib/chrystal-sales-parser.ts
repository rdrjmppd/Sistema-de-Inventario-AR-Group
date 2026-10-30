/**
 * Motor de Auto-Detección Multi-Formato y Parseo de Ventas Chrystal® POS
 * Ecosistema de 11 Agentes Especializados de Antigravity 2.0 (@Backend + @QA)
 * 
 * Basado en las Decisiones Estratégicas del Usuario:
 * 1. Auto-detección inteligente de formatos múltiples: Excel (.xlsx/.xls), CSV delimitado (coma/punto y coma) y Texto tabulado (.txt/.tsv).
 * 2. Opción A (Recomendada): Si un SKU o código de barra no existe en el catálogo maestro, se omite de la descarga
 *    y se registra en una lista de advertencia de "Ítems no encontrados" para revisión del usuario sin bloquear el resto de la venta.
 * 
 * Cumple con la Línea Roja Universal: Aritmética decimal exacta con Decimal.js (ROUND_HALF_UP).
 */

import * as XLSX from 'xlsx';
import { Product } from '../types';
import { toDecimal, round2 } from './decimal';
import { getCaracasNow } from './bcv';

export type ChrystalSalesFileFormat =
  | 'EXCEL_WORKBOOK'
  | 'CSV_COMMA'
  | 'CSV_SEMICOLON'
  | 'TEXT_TAB_DELIMITED'
  | 'UNKNOWN';

export interface RecognizedSaleItem {
  lineIndex: number;
  product: Product;
  sku: string;
  productName: string;
  qtySold: number;
  unitPriceUsd: number;
  totalUsd: number;
}

export interface UnrecognizedSaleItem {
  lineIndex: number;
  rawCode: string;
  rawDescription: string;
  qtySold: number;
  rawPrice?: number;
  rawTotal?: number;
  reason: 'SKU_OR_BARCODE_NOT_FOUND_IN_CATALOG' | 'INVALID_QUANTITY' | 'EMPTY_ROW';
}

export interface ChrystalSalesParseResult {
  fileName: string;
  detectedFormat: ChrystalSalesFileFormat;
  parsedAtVet: string;
  totalLinesProcessed: number;
  recognizedItems: RecognizedSaleItem[];
  unrecognizedItems: UnrecognizedSaleItem[];
  totalRecognizedUnits: number;
  totalRecognizedSalesUsd: number;
  totalSkippedLines: number;
  summaryText: string;
}

// Palabras clave para auto-detección de columnas
const SKU_CODE_KEYWORDS = ['codigo', 'código', 'cod', 'sku', 'cod_art', 'articulo_cod', 'plu', 'barra', 'barcode'];
const DESC_KEYWORDS = ['descripcion', 'descripción', 'nombre', 'articulo', 'artículo', 'producto', 'item', 'desc'];
const QTY_KEYWORDS = ['cantidad', 'cant', 'qty', 'unidades', 'peso', 'salida', 'egreso', 'unid', 'volumen'];
const PRICE_KEYWORDS = ['precio', 'pvp', 'precio_unit', 'costo_unit', 'unitario', 'monto_unit'];
const TOTAL_KEYWORDS = ['total', 'monto_total', 'importe', 'subtotal', 'gran_total', 'monto'];

function isHeaderOrSummaryRow(rowValues: string[]): boolean {
  const line = rowValues.join(' ').toLowerCase();
  return (
    line.includes('total general') ||
    line.includes('gran total') ||
    line.includes('resumen') ||
    line.includes('cierre z') ||
    line.includes('reporte de ventas') ||
    line.includes('pagina') ||
    line.includes('página') ||
    line.includes('chrystal software')
  );
}

/**
 * Auto-detecta si el contenido de texto es CSV con coma, punto y coma o tabulación
 */
export function detectTextDelimiter(firstLines: string): ChrystalSalesFileFormat {
  const commaCount = (firstLines.match(/,/g) || []).length;
  const semicolonCount = (firstLines.match(/;/g) || []).length;
  const tabCount = (firstLines.match(/\t/g) || []).length;

  if (tabCount > commaCount && tabCount > semicolonCount) {
    return 'TEXT_TAB_DELIMITED';
  }
  if (semicolonCount > commaCount) {
    return 'CSV_SEMICOLON';
  }
  return 'CSV_COMMA';
}

/**
 * Mapeador de columnas heurístico: encuentra los índices [colCode, colDesc, colQty, colPrice, colTotal]
 */
function detectColumnIndices(headerRow: Array<string | number | null | undefined>): {
  colCode: number;
  colDesc: number;
  colQty: number;
  colPrice: number;
  colTotal: number;
} {
  let colCode = -1;
  let colDesc = -1;
  let colQty = -1;
  let colPrice = -1;
  let colTotal = -1;

  headerRow.forEach((cell, idx) => {
    if (cell === null || cell === undefined) return;
    const norm = String(cell).trim().toLowerCase();

    if (colCode === -1 && SKU_CODE_KEYWORDS.some((kw) => norm === kw || norm.startsWith(`${kw}_`) || norm.endsWith(`_${kw}`))) {
      colCode = idx;
    } else if (colDesc === -1 && DESC_KEYWORDS.some((kw) => norm === kw || norm.startsWith(`${kw}_`))) {
      colDesc = idx;
    } else if (colQty === -1 && QTY_KEYWORDS.some((kw) => norm === kw || norm.startsWith(`${kw}_`))) {
      colQty = idx;
    } else if (colPrice === -1 && PRICE_KEYWORDS.some((kw) => norm === kw || norm.startsWith(`${kw}_`))) {
      colPrice = idx;
    } else if (colTotal === -1 && TOTAL_KEYWORDS.some((kw) => norm === kw || norm.startsWith(`${kw}_`))) {
      colTotal = idx;
    }
  });

  // Fallback posicional estándar si no se identificaron encabezados (Col 0: Código, Col 1: Nombre, Col 2: Cantidad, Col 3: Precio, Col 4: Total)
  if (colCode === -1) colCode = 0;
  if (colDesc === -1) colDesc = 1;
  if (colQty === -1) colQty = 2;
  if (colPrice === -1) colPrice = 3;
  if (colTotal === -1) colTotal = 4;

  return { colCode, colDesc, colQty, colPrice, colTotal };
}

/**
 * Parsea una matriz bidimensional (extraída de Excel o de texto CSV/tabulado)
 */
export function parseRawMatrixChrystalSales(
  matrix: Array<Array<string | number | null | undefined>>,
  catalogProducts: Product[],
  fileName: string = 'Ventas_Chrystal.xlsx',
  detectedFormat: ChrystalSalesFileFormat = 'EXCEL_WORKBOOK'
): ChrystalSalesParseResult {
  const recognizedItems: RecognizedSaleItem[] = [];
  const unrecognizedItems: UnrecognizedSaleItem[] = [];
  let totalUnitsDec = toDecimal(0);
  let totalSalesUsdDec = toDecimal(0);
  let skippedCount = 0;

  if (matrix.length === 0) {
    return {
      fileName,
      detectedFormat,
      parsedAtVet: getCaracasNow().isoTimestamp,
      totalLinesProcessed: 0,
      recognizedItems: [],
      unrecognizedItems: [],
      totalRecognizedUnits: 0,
      totalRecognizedSalesUsd: 0,
      totalSkippedLines: 0,
      summaryText: 'El archivo está vacío o no contiene filas interpretables.',
    };
  }

  // Detectar fila de cabecera en las primeras 5 filas
  let headerIndex = 0;
  for (let i = 0; i < Math.min(matrix.length, 5); i++) {
    const row = matrix[i] || [];
    const rowStr = row.map((c) => String(c || '').toLowerCase()).join(' ');
    if (
      SKU_CODE_KEYWORDS.some((k) => rowStr.includes(k)) &&
      (QTY_KEYWORDS.some((k) => rowStr.includes(k)) || DESC_KEYWORDS.some((k) => rowStr.includes(k)))
    ) {
      headerIndex = i;
      break;
    }
  }

  const headerRow = matrix[headerIndex] || [];
  const { colCode, colDesc, colQty, colPrice, colTotal } = detectColumnIndices(headerRow);

  // Mapear catálogo para búsqueda O(1)
  const productBySkuMap = new Map<string, Product>();
  const productByBarcodeMap = new Map<string, Product>();

  for (const p of catalogProducts) {
    if (p.sku) productBySkuMap.set(p.sku.trim().toLowerCase(), p);
    if (p.barcode) productByBarcodeMap.set(p.barcode.trim().toLowerCase(), p);
  }

  // Iterar filas a partir de la cabecera
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] || [];
    if (row.length === 0 || row.every((c) => c === null || c === undefined || String(c).trim() === '')) {
      skippedCount++;
      continue;
    }

    const rowStrings = row.map((c) => String(c || '').trim());
    if (isHeaderOrSummaryRow(rowStrings)) {
      skippedCount++;
      continue;
    }

    const rawCode = String(row[colCode] || '').trim();
    const rawDesc = String(row[colDesc] || '').trim();
    const rawQtyStr = String(row[colQty] || '').trim().replace(',', '.');
    const rawQty = parseFloat(rawQtyStr);

    if (!rawCode && !rawDesc) {
      skippedCount++;
      continue;
    }

    if (isNaN(rawQty) || rawQty <= 0) {
      unrecognizedItems.push({
        lineIndex: i + 1,
        rawCode,
        rawDescription: rawDesc || 'Sin descripción',
        qtySold: 0,
        reason: 'INVALID_QUANTITY',
      });
      continue;
    }

    // Buscar en catálogo por SKU o por Código de Barra
    const codeNorm = rawCode.toLowerCase();
    const matchedProduct = productBySkuMap.get(codeNorm) || productByBarcodeMap.get(codeNorm);

    if (!matchedProduct) {
      // Decisión Opción A: Omitir línea y registrar en ítems no encontrados
      const rawPrice = parseFloat(String(row[colPrice] || '').replace(',', '.')) || 0;
      const rawTot = parseFloat(String(row[colTotal] || '').replace(',', '.')) || 0;
      unrecognizedItems.push({
        lineIndex: i + 1,
        rawCode,
        rawDescription: rawDesc || 'Producto no registrado en Chrystal',
        qtySold: rawQty,
        rawPrice,
        rawTotal: rawTot,
        reason: 'SKU_OR_BARCODE_NOT_FOUND_IN_CATALOG',
      });
      continue;
    }

    // Producto reconocido
    const unitPrice =
      parseFloat(String(row[colPrice] || '').replace(',', '.')) ||
      matchedProduct.priceUsd ||
      1.0;
    const qtyDec = toDecimal(rawQty);
    const lineTotalDec = qtyDec.times(unitPrice);

    recognizedItems.push({
      lineIndex: i + 1,
      product: matchedProduct,
      sku: matchedProduct.sku,
      productName: matchedProduct.name,
      qtySold: rawQty,
      unitPriceUsd: round2(unitPrice),
      totalUsd: round2(lineTotalDec),
    });

    totalUnitsDec = totalUnitsDec.plus(qtyDec);
    totalSalesUsdDec = totalSalesUsdDec.plus(lineTotalDec);
  }

  const summary = `Se procesaron ${recognizedItems.length} productos reconocidos (${round2(totalUnitsDec)} unidades vendidas por un total de \$${round2(totalSalesUsdDec)} USD). ${unrecognizedItems.length} ítems no encontrados omitidos de la descarga.`;

  return {
    fileName,
    detectedFormat,
    parsedAtVet: getCaracasNow().isoTimestamp,
    totalLinesProcessed: matrix.length - headerIndex - 1,
    recognizedItems,
    unrecognizedItems,
    totalRecognizedUnits: round2(totalUnitsDec),
    totalRecognizedSalesUsd: round2(totalSalesUsdDec),
    totalSkippedLines: skippedCount,
    summaryText: summary,
  };
}

/**
 * Parsea un ArrayBuffer (proveniente de un archivo subido por el usuario en el navegador)
 * Auto-detecta si es Excel binario o texto plano CSV/TXT.
 */
export function parseChrystalSalesUploadedFile(
  buffer: ArrayBuffer,
  fileName: string,
  catalogProducts: Product[]
): ChrystalSalesParseResult {
  const isExcel =
    fileName.toLowerCase().endsWith('.xlsx') ||
    fileName.toLowerCase().endsWith('.xls');

  if (isExcel) {
    try {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawMatrix: Array<Array<string | number | null | undefined>> = XLSX.utils.sheet_to_json(
        worksheet,
        { header: 1, raw: true }
      );
      return parseRawMatrixChrystalSales(
        rawMatrix,
        catalogProducts,
        fileName,
        'EXCEL_WORKBOOK'
      );
    } catch {
      // Fallback a texto si la lectura de Excel falla
    }
  }

  // Parsear como texto plano (CSV o TSV)
  const decoder = new TextDecoder('utf-8');
  const textContent = decoder.decode(buffer);
  const detectedFormat = detectTextDelimiter(textContent.slice(0, 1000));
  const delimiter =
    detectedFormat === 'TEXT_TAB_DELIMITED'
      ? '\t'
      : detectedFormat === 'CSV_SEMICOLON'
      ? ';'
      : ',';

  const lines = textContent.split(/\r?\n/);
  const matrix: Array<Array<string>> = lines.map((line) => line.split(delimiter));

  return parseRawMatrixChrystalSales(matrix, catalogProducts, fileName, detectedFormat);
}

/**
 * Genera una matriz de ejemplo de ventas diarias de Chrystal® POS para pruebas unitarias y simulación
 */
export function generateSampleChrystalSalesMatrix(): Array<Array<string | number>> {
  return [
    ['REPORTE DE VENTAS DIARIAS POR RENGLÓN - CHRYSTAL POS v8.2'],
    ['FECHA: 29/10/2026', 'SEDE: PUERTO ORDAZ', 'CAJAS: 01, 02, 03'],
    ['CODIGO', 'DESCRIPCION', 'CANTIDAD', 'PRECIO_UNIT', 'TOTAL_VENTA'],
    ['HAR-PAN-1KG', 'Harina PAN 1kg', 45, 1.35, 60.75],
    ['ACE-MAZ-1LT', 'Aceite Mazola 1L', 20, 3.85, 77.0],
    ['ARR-PRI-1KG', 'Arroz Primor 1kg', 35, 1.25, 43.75],
    ['PAS-CAP-1KG', 'Pasta Capri 1kg', 28, 1.45, 40.6],
    ['CAFE-FAL-500G', 'Café Fama de América 500g', 15, 3.95, 59.25],
    ['DESCONOCIDO-999', 'Producto Nuevo No Registrado en Catálogo', 12, 2.5, 30.0], // Ítem a omitir
    ['7591001776543', 'Margarina Mavesa 500g (Venta por Barra)', 18, 2.61, 46.98],
    ['LECH-CAM-1LT', 'Leche Campestre 1L', 22, 1.85, 40.7],
    ['GRAN TOTAL VENTAS DEL DIA', '', 195, '', 398.03],
  ];
}

export default parseChrystalSalesUploadedFile;
