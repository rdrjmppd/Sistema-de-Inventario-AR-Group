import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.apiKey.length > 10 &&
    firebaseConfig.projectId
);

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

class ResilientMockFirestore {
  private memoryCache: Map<string, unknown> = new Map();
  private storagePrefix = 'argroup_erp_2026_';

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
}

export const mockFirestore = new ResilientMockFirestore();
export { app, db, auth };
