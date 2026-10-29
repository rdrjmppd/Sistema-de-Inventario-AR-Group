import {
  FiscalZReportRecord,
  Product,
  SalesSyncEvent,
  ShelfMovementRecord,
  UserRole,
} from '../types';
import { round2, toDecimal } from './decimal';
import { deductPosSaleShelfFirst } from './shelf-stock';

/**
 * Firma determinista ligera compatible en cliente y servidor para validar tramas del puente de Impresoras Fiscales.
 */
export function computeFiscalPayloadSignature(
  printerSerial: string,
  zNumber: string,
  closureDate: string,
  secretKey: string = 'CHRYSTAL-FISCAL-BRIDGE-2026'
): string {
  const msg = `${printerSerial.trim().toUpperCase()}|${zNumber.trim()}|${closureDate.trim()}|${secretKey}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < msg.length; i++) {
    const c = msg.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 16777619);
    h2 ^= c + i;
    h2 = Math.imul(h2, 2246822507);
  }
  return `HMAC-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`.toUpperCase();
}

export interface RegisterFiscalZInput {
  zNumber: string;
  printerSerial: string;
  printerBrand: FiscalZReportRecord['printerBrand'];
  locationId: string;
  locationName: string;
  closureDate: string;
  reportType: FiscalZReportRecord['reportType'];
  invoicesCount: number;
  creditNotesCount?: number;
  exemptSalesUsd: number;
  taxableBase16Usd: number;
  taxableBase8Usd: number;
  igtfBaseForeignUsd: number;
  bcvRateClosure: number;
  source: FiscalZReportRecord['source'];
  providedSignature?: string;
  bridgeSecretKey?: string;
  soldItemsForShelfDeduction?: Array<{
    sku: string;
    qtySold: number;
  }>;
  registeredBy: string;
  registeredAtVet: string;
}

/**
 * Procesa un Reporte X o Reporte Z de impresora fiscal homologada (Providencia SNAT/2024/000102):
 * 1) Calcula con exactitud Decimal.js el Débito Fiscal IVA 16%, IVA 8%, IGTF 3% y Gran Total USD/VES.
 * 2) Cruza contra el total de eventos POS del ERP en la misma sede/fecha para auditar discrepancias.
 * 3) Si el cierre incluye renglones vendidos no descargados aún, deduce primero de Anaquel con fallback a Depósito.
 */
export function processFiscalZClosure(params: {
  input: RegisterFiscalZInput;
  existingZReports: FiscalZReportRecord[];
  salesEvents: SalesSyncEvent[];
  products: Product[];
}): {
  zRecord: FiscalZReportRecord;
  updatedZReports: FiscalZReportRecord[];
  updatedProducts: Product[];
  generatedShelfMovements: ShelfMovementRecord[];
  shelfShortfallCount: number;
} {
  const { input } = params;
  const duplicate = params.existingZReports.find(
    (z) =>
      z.reportType === 'REPORTE_Z_DIARIO' &&
      input.reportType === 'REPORTE_Z_DIARIO' &&
      z.printerSerial.toUpperCase() === input.printerSerial.trim().toUpperCase() &&
      z.zNumber.trim() === input.zNumber.trim()
  );

  if (duplicate) {
    throw new Error(
      `IDEMPOTENCIA FISCAL: El Reporte Z N° ${input.zNumber} de la impresora ${input.printerSerial} ya fue conciliado previamente.`
    );
  }

  const exemptUsd = round2(input.exemptSalesUsd);
  const base16Usd = round2(input.taxableBase16Usd);
  const iva16Usd = round2(toDecimal(base16Usd).times('0.16'));
  const base8Usd = round2(input.taxableBase8Usd);
  const iva8Usd = round2(toDecimal(base8Usd).times('0.08'));
  const igtfBaseUsd = round2(input.igtfBaseForeignUsd);
  const igtf3Usd = round2(toDecimal(igtfBaseUsd).times('0.03'));

  const grandTotalFiscalUsd = round2(
    toDecimal(exemptUsd)
      .plus(base16Usd)
      .plus(iva16Usd)
      .plus(base8Usd)
      .plus(iva8Usd)
      .plus(igtf3Usd)
  );

  const bcvRate = input.bcvRateClosure > 0 ? input.bcvRateClosure : 1;
  const grandTotalFiscalVes = round2(toDecimal(grandTotalFiscalUsd).times(bcvRate));

  const datePrefix = input.closureDate.slice(0, 10);
  const erpPosTotalUsd = round2(
    params.salesEvents
      .filter(
        (ev) =>
          ev.status === 'PROCESADO' &&
          ev.locationId === input.locationId &&
          ev.timestampVet.slice(0, 10) === datePrefix
      )
      .reduce((acc, ev) => acc.plus(ev.totalUsd), toDecimal(0))
  );

  const discrepancyUsd = round2(toDecimal(grandTotalFiscalUsd).minus(erpPosTotalUsd));

  const expectedSig = computeFiscalPayloadSignature(
    input.printerSerial,
    input.zNumber,
    input.closureDate,
    input.bridgeSecretKey
  );
  const hmacVerified =
    input.source === 'CARGA_AUDITADA_CIERRE'
      ? true
      : Boolean(input.providedSignature && input.providedSignature === expectedSig);

  let workingProducts = [...params.products];
  const generatedShelfMovements: ShelfMovementRecord[] = [];
  let shelfShortfallCount = 0;

  if (input.soldItemsForShelfDeduction && input.soldItemsForShelfDeduction.length > 0) {
    for (const sold of input.soldItemsForShelfDeduction) {
      if (sold.qtySold <= 0) continue;
      const pIdx = workingProducts.findIndex(
        (p) => p.sku.toUpperCase() === sold.sku.toUpperCase()
      );
      if (pIdx < 0) continue;
      const beforeBreakdownProd = workingProducts[pIdx];
      const beforeTotal = Number(beforeBreakdownProd.stockByLocation[input.locationId] || 0);
      const beforeShelf = Math.min(
        beforeTotal,
        Number(beforeBreakdownProd.shelfStockByLocation?.[input.locationId] ?? beforeTotal)
      );
      const beforeDeposit = round2(toDecimal(beforeTotal).minus(beforeShelf));

      const deduction = deductPosSaleShelfFirst({
        product: beforeBreakdownProd,
        locationId: input.locationId,
        qtySold: sold.qtySold,
        updatedAtVet: input.registeredAtVet,
      });
      workingProducts[pIdx] = deduction.updatedProduct;

      const afterTotal = Number(deduction.updatedProduct.stockByLocation[input.locationId] || 0);
      const afterShelf = Number(deduction.updatedProduct.shelfStockByLocation?.[input.locationId] || 0);
      const afterDeposit = round2(toDecimal(afterTotal).minus(afterShelf));

      generatedShelfMovements.push({
        id: `shf-z-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        referenceCode: `Z-${input.zNumber}-${beforeBreakdownProd.sku}`,
        movementType: 'POS_SALE_DEDUCTION',
        productId: beforeBreakdownProd.id,
        sku: beforeBreakdownProd.sku,
        productName: beforeBreakdownProd.name,
        unit: beforeBreakdownProd.unit,
        fromLocationId: input.locationId,
        fromLocationName: input.locationName,
        fromZone: 'ANAQUEL',
        toLocationId: input.locationId,
        toLocationName: input.locationName,
        toZone: 'ANAQUEL',
        quantity: sold.qtySold,
        shelfBefore: beforeShelf,
        shelfAfter: afterShelf,
        depositBefore: beforeDeposit,
        depositAfter: afterDeposit,
        totalAfter: afterTotal,
        notes: `Descarga automática Cierre Fiscal ${input.reportType} N° ${input.zNumber}`,
        performedByUserId: 'fiscal-z-bridge',
        performedByName: input.registeredBy,
        performedByRole: UserRole.GERENTE,
        timestampVet: input.registeredAtVet,
      });

      if (deduction.hadShelfShortfall) {
        shelfShortfallCount += 1;
      }
    }
  }

  const zRecord: FiscalZReportRecord = {
    id: `zrep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    zNumber: input.zNumber.trim().padStart(4, '0'),
    printerSerial: input.printerSerial.trim().toUpperCase(),
    printerBrand: input.printerBrand,
    locationId: input.locationId,
    locationName: input.locationName,
    closureDate: datePrefix,
    reportType: input.reportType,
    invoicesCount: Math.max(0, Math.round(input.invoicesCount)),
    creditNotesCount: Math.max(0, Math.round(input.creditNotesCount || 0)),
    exemptSalesUsd: exemptUsd,
    taxableBase16Usd: base16Usd,
    iva16CollectedUsd: iva16Usd,
    taxableBase8Usd: base8Usd,
    iva8CollectedUsd: iva8Usd,
    igtfBaseForeignUsd: igtfBaseUsd,
    igtf3CollectedUsd: igtf3Usd,
    grandTotalFiscalUsd,
    grandTotalFiscalVes,
    bcvRateClosure: bcvRate,
    erpPosTotalUsd,
    discrepancyUsd,
    hmacVerified,
    source: input.source,
    registeredBy: input.registeredBy,
    registeredAtVet: input.registeredAtVet,
  };

  return {
    zRecord,
    updatedZReports: [zRecord, ...params.existingZReports],
    updatedProducts: workingProducts,
    generatedShelfMovements,
    shelfShortfallCount,
  };
}
