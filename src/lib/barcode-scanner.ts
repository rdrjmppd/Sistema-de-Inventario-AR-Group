import { BarcodeScanRecord, Product, StorageZone } from '../types';
import { round3, resolveCatalogProductFromBarcode } from './scale-barcode';
import { toDecimal } from './decimal';

export const OFFLINE_SCAN_QUEUE_KEY = 'chrystal_pwa_offline_scan_queue_v4';

export function isCameraBarcodeDetectorSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'BarcodeDetector' in window;
}

/**
 * Procesa una lectura de código de barras (cámara PWA, pistola láser USB/Bluetooth o ingreso manual)
 * y la acumula de forma idempotente/agregada en la sesión de conteo cíclico o recepción en muelle.
 */
export function appendScanToSessionQueue(params: {
  existingQueue: BarcodeScanRecord[];
  rawCode: string;
  products: Product[];
  locationId: string;
  zone: StorageZone;
  source: BarcodeScanRecord['source'];
  overrideQty?: number;
  nowVet?: string;
}): {
  updatedQueue: BarcodeScanRecord[];
  latestRecord: BarcodeScanRecord;
  aggregatedQtyForProduct: number;
} {
  const cleanCode = String(params.rawCode || '').trim();
  if (!cleanCode) {
    throw new Error('El código escaneado no puede estar vacío.');
  }

  const resolution = resolveCatalogProductFromBarcode(cleanCode, params.products);
  const qtyToAdd =
    params.overrideQty !== undefined && params.overrideQty > 0
      ? round3(params.overrideQty)
      : round3(resolution.effectiveQuantity);

  const record: BarcodeScanRecord = {
    id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    rawCode: cleanCode,
    matchedProductId: resolution.product?.id,
    matchedSku: resolution.product?.sku,
    matchedProductName: resolution.product?.name,
    decodedWeightKg: resolution.decoded.isScaleVariableBarcode
      ? resolution.decoded.weightKg
      : undefined,
    scannedQty: qtyToAdd,
    zone: params.zone,
    locationId: params.locationId,
    source: params.source,
    scannedAtVet: params.nowVet || new Date().toISOString().slice(0, 16).replace('T', ' '),
    synced: typeof navigator !== 'undefined' ? navigator.onLine : true,
  };

  const updatedQueue = [record, ...params.existingQueue];

  const aggregatedQtyForProduct = resolution.product
    ? round3(
        updatedQueue
          .filter(
            (r) =>
              r.matchedProductId === resolution.product!.id &&
              r.locationId === params.locationId &&
              r.zone === params.zone
          )
          .reduce((acc, r) => acc.plus(r.scannedQty), toDecimal(0))
      )
    : qtyToAdd;

  return {
    updatedQueue,
    latestRecord: record,
    aggregatedQtyForProduct,
  };
}

/**
 * Consolida una cola de lecturas de escáner por (productId + locationId + zone) para sincerar conteo físico masivo.
 */
export function summarizeScanQueueByProduct(queue: BarcodeScanRecord[]): Array<{
  productId: string;
  sku: string;
  productName: string;
  locationId: string;
  zone: StorageZone;
  totalScannedQty: number;
  scansCount: number;
}> {
  const map = new Map<
    string,
    {
      productId: string;
      sku: string;
      productName: string;
      locationId: string;
      zone: StorageZone;
      totalScannedQty: number;
      scansCount: number;
    }
  >();

  for (const item of queue) {
    if (!item.matchedProductId) continue;
    const key = `${item.matchedProductId}::${item.locationId}::${item.zone}`;
    const existing = map.get(key);
    if (existing) {
      existing.totalScannedQty = round3(
        toDecimal(existing.totalScannedQty).plus(item.scannedQty)
      );
      existing.scansCount += 1;
    } else {
      map.set(key, {
        productId: item.matchedProductId,
        sku: item.matchedSku || 'SIN-SKU',
        productName: item.matchedProductName || 'Producto Catalogado',
        locationId: item.locationId,
        zone: item.zone,
        totalScannedQty: round3(item.scannedQty),
        scansCount: 1,
      });
    }
  }

  return Array.from(map.values());
}
