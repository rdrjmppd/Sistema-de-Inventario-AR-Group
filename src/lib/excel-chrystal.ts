import * as XLSX from 'xlsx';
import { ChrystalImportedRow, ChrystalParseResult } from '../types';
import { round2, toDecimal } from './decimal';
import { getCaracasNow } from './bcv';

const HEADER_OR_FOOTER_KEYWORDS = [
  'producto',
  'descripcion',
  'descripción',
  'articulo',
  'artículo',
  'nombre',
  'total',
  'subtotal',
  'gran total',
  'resumen',
  'chrystal',
  'reporte',
  'fecha',
  'pagina',
  'página',
  'existencia',
  'inventario',
];

function isHeaderOrFooterText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized || normalized.length < 2) return true;
  for (const kw of HEADER_OR_FOOTER_KEYWORDS) {
    if (
      normalized === kw ||
      normalized.startsWith('total ') ||
      normalized.startsWith('subtotal') ||
      normalized.startsWith('reporte ')
    ) {
      return true;
    }
  }
  return false;
}

export function parseChrystalRawRows(
  rawMatrix: Array<Array<string | number | null | undefined>>,
  fileName: string = 'Chrystal_Inventario.xlsx'
): ChrystalParseResult {
  const rows: ChrystalImportedRow[] = [];
  let skippedHeaderOrBlankCount = 0;
  let skippedFooterTotalsCount = 0;

  for (let i = 0; i < rawMatrix.length; i++) {
    const row = rawMatrix[i] || [];
    const colA = row[0] !== undefined && row[0] !== null ? String(row[0]).trim() : '';
    const colB = row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : '';
    const colC = row[2] !== undefined && row[2] !== null ? String(row[2]).trim() : '';
    const colD = row[3];
    const colE = row[4];
    const colF = row[5];

    if (!colB && (colF === undefined || colF === null || String(colF).trim() === '')) {
      skippedHeaderOrBlankCount++;
      continue;
    }

    const lowerB = colB.toLowerCase();
    const lowerA = colA.toLowerCase();
    if (
      lowerB.includes('total general') ||
      lowerB.startsWith('total') ||
      lowerA.startsWith('total') ||
      lowerB.includes('fin del reporte')
    ) {
      skippedFooterTotalsCount++;
      continue;
    }

    if (isHeaderOrFooterText(colB)) {
      skippedHeaderOrBlankCount++;
      continue;
    }

    const cleanedStockString = String(colF ?? '')
      .replace(/[^0-9.,-]/g, '')
      .replace(',', '.');
    if (!cleanedStockString || isNaN(Number(cleanedStockString))) {
      skippedHeaderOrBlankCount++;
      continue;
    }

    const stockQty = round2(toDecimal(cleanedStockString));
    const costVal =
      colD !== undefined && colD !== null && !isNaN(Number(String(colD).replace(',', '.')))
        ? round2(toDecimal(String(colD).replace(',', '.')))
        : undefined;
    const priceVal =
      colE !== undefined && colE !== null && !isNaN(Number(String(colE).replace(',', '.')))
        ? round2(toDecimal(String(colE).replace(',', '.')))
        : undefined;

    rows.push({
      rowNumber: i + 1,
      skuColA: colA || `CHR-${String(i + 1).padStart(4, '0')}`,
      productNameColB: colB,
      categoryColC: colC || 'Víveres Secos',
      costUsdColD: costVal,
      priceUsdColE: priceVal,
      stockQuantityColF: stockQty,
      status: 'VALID',
    });
  }

  return {
    fileName,
    parsedAtVet: getCaracasNow().isoTimestamp,
    totalRawRows: rawMatrix.length,
    validRowsCount: rows.length,
    skippedHeaderOrBlankCount,
    skippedFooterTotalsCount,
    rows,
  };
}

export function parseChrystalWorkbookBuffer(
  buffer: ArrayBuffer,
  fileName: string
): ChrystalParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rawMatrix = XLSX.utils.sheet_to_json<Array<string | number | null>>(worksheet, {
    header: 1,
    defval: null,
  });
  return parseChrystalRawRows(rawMatrix, fileName);
}

export function generateSampleChrystalRawMatrix(): Array<
  Array<string | number | null>
> {
  return [
    ['SISTEMA ADMINISTRATIVO CHRYSTAL POS v9.4 - REPORTE DE EXISTENCIAS', null, null, null, null, null],
    ['SUCURSAL: SEDE PRINCIPAL ALTA VISTA', null, null, null, null, 'FECHA: 2026'],
    [null, null, null, null, null, null],
    ['CODIGO (Col A)', 'PRODUCTO (Col B)', 'DEPARTAMENTO (Col C)', 'COSTO USD (Col D)', 'PRECIO USD (Col E)', 'EXISTENCIA ACTUAL (Col F)'],
    ['HAR-PAN-1KG', 'Harina de Maíz Precocida P.A.N. 1Kg', 'Víveres Secos', 0.92, 1.25, 680],
    ['ACE-MAZ-1LT', 'Aceite Vegetal Mazeite 1 Litro', 'Aceites y Grasas', 2.35, 3.30, 145],
    ['ARR-PRI-1KG', 'Arroz Blanco Mesa Primor Clásico 1Kg', 'Víveres Secos', 1.04, 1.42, 520],
    ['QUE-PAI-KG', 'Queso Blanco Pasteurizado Paisa (Kg)', 'Charcutería y Lácteos', 5.40, 7.80, 94.5],
    ['CAF-MAD-500G', 'Café Molido Gourmet Madrid 500g', 'Bebidas e Infusiones', 3.85, 5.50, 210],
    ['AZU-MON-1KG', 'Azúcar Refinada Montalbán 1Kg', 'Víveres Secos', 1.12, 1.55, 430],
    ['ATUN-EVE-140G', 'Atún en Lomitos Eveba 140g', 'Enlatados', 1.48, 2.15, 190],
    [null, null, null, null, null, null],
    ['TOTAL GENERAL', 'TOTAL GENERAL DEL INVENTARIO', null, null, null, 2269.5],
  ];
}

export function generateSampleChrystalTemplateRows() {
  return [
    ['HAR-PAN-1KG', 'Harina de Maíz Precocida P.A.N. 1Kg', 'Víveres Secos', 0.92, 1.25, 680],
    ['ATUN-EVE-140G', 'Atún en Lomitos Eveba 140g', 'Enlatados', 1.48, 2.15, 190],
    ['CAF-MAD-500G', 'Café Molido Gourmet Madrid 500g', 'Bebidas', 3.85, 5.5, 210],
    ['AZU-MON-1KG', 'Azúcar Refinada Montalbán 1Kg', 'Víveres Secos', 1.12, 1.55, 430],
  ];
}

export function mapChrystalColumns(
  rows: Array<Array<string | number>>,
  existingProducts: Array<{ id: string; sku: string }>
) {
  return rows.map((r) => {
    const sku = String(r[0]);
    const exists = existingProducts.some((p) => p.sku === sku);
    return {
      sku,
      name: String(r[1]),
      stock: Number(r[5]),
      impactType: exists ? 'UPDATE_EXISTING' : 'NEW_SKU',
    };
  });
}

export function exportSampleChrystalTemplateExcel(): void {
  const wb = XLSX.utils.book_new();
  const matrix = generateSampleChrystalRawMatrix();
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  ws['!cols'] = [
    { wch: 22 }, // Col A: SKU
    { wch: 44 }, // Col B: Producto
    { wch: 24 }, // Col C: Departamento
    { wch: 18 }, // Col D: Costo USD
    { wch: 18 }, // Col E: Precio USD
    { wch: 24 }, // Col F: Existencia Actual
  ];
  ws['!rows'] = matrix.map((_, idx) => ({
    hpt: idx === 0 || idx === 3 ? 25 : 20,
  }));
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla_Chrystal_ColB_ColF');
  XLSX.writeFile(wb, 'Plantilla_Oficial_Chrystal_ColB_ColF_2026.xlsx');
}

