import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  query,
  limit,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';
import { Product } from '../types';
import { toDecimal, round2 } from '../lib/decimal';
import { getCaracasNow } from '../lib/bcv';

const envMeta = (import.meta as unknown as { env?: Record<string, string> }).env || {};

const firebaseConfig = {
  apiKey: envMeta.VITE_FIREBASE_API_KEY || '',
  authDomain: envMeta.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: envMeta.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: envMeta.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: envMeta.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: envMeta.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.apiKey.length > 10 &&
    firebaseConfig.projectId
);

export const FIRESTORE_BATCH_DEBOUNCE_MS = 800;
export const FIRESTORE_QUERY_LIMIT = 100;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (err) {
    console.warn('Conmutando a In-Memory Mock Firestore Provider por contingencia:', err);
  }
}

export interface OptimisticMergeResult {
  mergedProduct: Product;
  collisionDetected: boolean;
  collisionSummary?: string;
}

/**
 * Optimistic Concurrency Control (Zero Blind Overwrites):
 * Compares timestamps (`lastUpdatedVet`) between the base snapshot, current remote state,
 * and incoming local update. If a concurrent edit occurred on the same SKU, merges
 * location stock deltas using Decimal.js so neither analyst's stock adjustment is lost.
 */
export function mergeConcurrentProductStock(
  currentStoredProduct: Product,
  incomingUpdate: Product,
  baseSnapshotProduct?: Product
): OptimisticMergeResult {
  const vetNow = getCaracasNow().isoTimestamp;

  // Detect if currentStoredProduct was modified after the base snapshot known by the editor
  const storedTimestamp = currentStoredProduct.lastUpdatedVet || '';
  const baseTimestamp = baseSnapshotProduct?.lastUpdatedVet || incomingUpdate.lastUpdatedVet || '';

  const hasConcurrentModification = Boolean(
    baseSnapshotProduct &&
      storedTimestamp &&
      baseTimestamp &&
      storedTimestamp !== baseTimestamp
  );

  if (!hasConcurrentModification) {
    return {
      mergedProduct: {
        ...incomingUpdate,
        lastUpdatedVet: incomingUpdate.lastUpdatedVet || vetNow,
      },
      collisionDetected: false,
    };
  }

  // Merge stock per location using Decimal.js delta arithmetic:
  // mergedStock[loc] = max(0, round2(storedStock[loc] + (incomingStock[loc] - baseStock[loc])))
  const mergedStockByLocation: Record<string, number> = {
    ...currentStoredProduct.stockByLocation,
  };
  const allLocationIds = new Set([
    ...Object.keys(currentStoredProduct.stockByLocation || {}),
    ...Object.keys(incomingUpdate.stockByLocation || {}),
    ...Object.keys(baseSnapshotProduct?.stockByLocation || {}),
  ]);

  const affectedLocations: string[] = [];

  for (const locId of allLocationIds) {
    const baseQty = toDecimal(baseSnapshotProduct?.stockByLocation?.[locId] ?? 0);
    const storedQty = toDecimal(currentStoredProduct.stockByLocation?.[locId] ?? 0);
    const incomingQty = toDecimal(incomingUpdate.stockByLocation?.[locId] ?? 0);

    const localDelta = incomingQty.minus(baseQty);
    const remoteDelta = storedQty.minus(baseQty);

    if (!localDelta.isZero() && !remoteDelta.isZero()) {
      affectedLocations.push(locId);
    }

    const reconciled = round2(storedQty.plus(localDelta));
    mergedStockByLocation[locId] = Math.max(0, reconciled);
  }

  const mergedProduct: Product = {
    ...currentStoredProduct,
    ...incomingUpdate,
    stockByLocation: mergedStockByLocation,
    minStockByLocation: {
      ...(currentStoredProduct.minStockByLocation || {}),
      ...(incomingUpdate.minStockByLocation || {}),
    },
    lastUpdatedVet: vetNow,
  };

  return {
    mergedProduct,
    collisionDetected: true,
    collisionSummary:
      affectedLocations.length > 0
        ? `Concurrencia optimista resuelta en SKU ${incomingUpdate.sku} (${affectedLocations.join(', ')}): cambios fusionados con Decimal.js sin pérdida de datos.`
        : `Actualización concurrente detectada en SKU ${incomingUpdate.sku}: estados sincronizados con Decimal.js.`,
  };
}

class ResilientMockFirestore {
  private memoryCache: Map<string, unknown> = new Map();
  private storagePrefix = 'argroup_erp_2026_';
  private pendingBatches: Map<string, Map<string, Record<string, unknown>>> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private batchFlushCount = 0;

  private canUseStorage(): boolean {
    try {
      return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
    } catch {
      return false;
    }
  }

  getCollection<T>(collectionName: string, defaultSeed: T): T {
    const key = `${this.storagePrefix}${collectionName}`;
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key) as T;
    }
    if (this.canUseStorage()) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as T;
          this.memoryCache.set(key, parsed);
          return parsed;
        }
      } catch {
        // Fallback to seed
      }
    }
    this.setCollection(collectionName, defaultSeed);
    return defaultSeed;
  }

  setCollection<T>(collectionName: string, data: T): void {
    const key = `${this.storagePrefix}${collectionName}`;
    this.memoryCache.set(key, data);
    if (this.canUseStorage()) {
      try {
        window.localStorage.setItem(key, JSON.stringify(data));
      } catch {
        // Ignore quota errors in memory mode
      }
    }
  }

  /**
   * Cache-First + 800ms Debounced WriteBatch:
   * Immediately persists to local cache/storage and coalesces rapid mutations
   * into a single Firestore writeBatch commit after 800ms.
   */
  queueDebouncedBatchSync<T extends { id: string }>(
    collectionName: string,
    items: T[],
    debounceMs: number = FIRESTORE_BATCH_DEBOUNCE_MS
  ): void {
    // 1. Cache-First immediate local backup
    this.setCollection(collectionName, items);

    // 2. Coalesce items into pending batch map
    let colMap = this.pendingBatches.get(collectionName);
    if (!colMap) {
      colMap = new Map();
      this.pendingBatches.set(collectionName, colMap);
    }
    for (const item of items.slice(0, FIRESTORE_QUERY_LIMIT)) {
      if (item && item.id) {
        colMap.set(item.id, item as unknown as Record<string, unknown>);
      }
    }

    // 3. Reset 800ms debounce timer
    const existingTimer = this.debounceTimers.get(collectionName);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(collectionName);
      const batchDocs = this.pendingBatches.get(collectionName);
      this.pendingBatches.delete(collectionName);
      if (!batchDocs || batchDocs.size === 0) return;

      this.batchFlushCount += 1;

      if (isFirebaseConfigured && db) {
        try {
          const batch = writeBatch(db);
          for (const [docId, payload] of batchDocs.entries()) {
            const ref = doc(collection(db, collectionName), docId);
            batch.set(ref, payload, { merge: true });
          }
          await batch.commit();
        } catch (err) {
          console.warn(
            `[Firestore Quota Guard] Fallback local mantenido para lote ${collectionName}:`,
            err
          );
        }
      }
    }, debounceMs);

    this.debounceTimers.set(collectionName, timer);
  }

  getBatchFlushCount(): number {
    return this.batchFlushCount;
  }
}

export const mockFirestore = new ResilientMockFirestore();
export { app, db, auth, collection, query, limit, onSnapshot, writeBatch, doc };

