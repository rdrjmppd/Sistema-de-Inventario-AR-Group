/**
 * PWA Service Worker Engine & Security Gateway — Hiper Abasto Polar — Chrystal® ERP
 * Gobernanza: @Frontend + @Backend + @UX + @QA (AGENTS.md)
 * 
 * Reglas de Oro:
 * 1. Estrategia Network-First con fallback a caché para el App Shell e index.html.
 * 2. Precaché estricto de recursos de branding corporativo y manifiestos.
 * 3. LÍNEA ROJA DE EXCLUSIÓN INCONDICIONAL:
 *    - Firestore (firestore.googleapis.com)
 *    - Firebase Auth / IdentityToolkit (identitytoolkit.googleapis.com)
 *    - Firebase RTDB (firebaseio.com)
 *    - Endpoints de Servidor / IA (/api/*, incluyendo /api/assistant/chat con Gemini 3.8 y /api/ocr/extract)
 *    - WebSockets (ws:, wss:)
 *    - APIs financieras en vivo (bcv.org.ve, dolarapi.com)
 * 
 * Dual Export: export const and export default.
 * © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

export const PWA_CACHE_NAME = 'hiper-abasto-polar-erp-v2';

export const PWA_PRECACHE_ASSETS: readonly string[] = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/assets/branding/hiper_abasto_polar_logo.jpg',
];

export const PWA_EXCLUDED_HOSTNAMES: readonly string[] = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'firebaseio.com',
  'googleapis.com',
  'bcv.org.ve',
  'dolarapi.com',
];

export interface SwBypassDecision {
  bypass: boolean;
  reason?:
    | 'NON_GET_METHOD'
    | 'WEBSOCKET_PROTOCOL'
    | 'API_TRANSACTIONAL_ENDPOINT'
    | 'FIRESTORE_OR_GOOGLE_API'
    | 'FINANCIAL_RATE_API'
    | 'SERVICE_WORKER_SCRIPT'
    | 'CHROME_EXTENSION';
}

/**
 * Pure decision function to determine if a request must completely bypass the Service Worker cache.
 */
export function shouldBypassServiceWorker(
  urlInput: string | URL,
  method: string = 'GET'
): SwBypassDecision {
  const upperMethod = method.toUpperCase();
  if (upperMethod !== 'GET') {
    return { bypass: true, reason: 'NON_GET_METHOD' };
  }

  let url: URL;
  try {
    url = typeof urlInput === 'string' ? new URL(urlInput, 'https://hiperabastopolar.com') : urlInput;
  } catch {
    return { bypass: true, reason: 'NON_GET_METHOD' };
  }

  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return { bypass: true, reason: 'WEBSOCKET_PROTOCOL' };
  }

  if (url.protocol === 'chrome-extension:') {
    return { bypass: true, reason: 'CHROME_EXTENSION' };
  }

  if (url.pathname === '/sw.js') {
    return { bypass: true, reason: 'SERVICE_WORKER_SCRIPT' };
  }

  if (url.pathname.startsWith('/api/')) {
    return { bypass: true, reason: 'API_TRANSACTIONAL_ENDPOINT' };
  }

  const hostname = url.hostname.toLowerCase();
  for (const excluded of PWA_EXCLUDED_HOSTNAMES) {
    if (hostname.includes(excluded)) {
      if (excluded.includes('bcv.org.ve') || excluded.includes('dolarapi.com')) {
        return { bypass: true, reason: 'FINANCIAL_RATE_API' };
      }
      return { bypass: true, reason: 'FIRESTORE_OR_GOOGLE_API' };
    }
  }

  return { bypass: false };
}

/**
 * Simulates Service Worker Network-First fetch behavior for node & browser testing.
 */
export function simulateServiceWorkerFetch(params: {
  url: string;
  method: string;
  mode?: string;
  networkOnline: boolean;
  networkPayload?: string;
  cacheStore: Map<string, string>;
}): {
  handledBySw: boolean;
  source: 'NETWORK' | 'CACHE' | 'OFFLINE_FALLBACK' | 'BYPASS_TO_NETWORK';
  status: number;
  body: string;
  updatedCache: boolean;
} {
  const { url, method, mode, networkOnline, networkPayload, cacheStore } = params;
  const decision = shouldBypassServiceWorker(url, method);

  if (decision.bypass) {
    return {
      handledBySw: false,
      source: 'BYPASS_TO_NETWORK',
      status: networkOnline ? 200 : 502,
      body: networkOnline ? networkPayload || 'live-network-payload' : 'network-error',
      updatedCache: false,
    };
  }

  let pathKey = url;
  try {
    const parsed = new URL(url, 'https://hiperabastopolar.com');
    pathKey = parsed.pathname;
  } catch {
    // keep url
  }

  // Network-First
  if (networkOnline) {
    const freshBody = networkPayload || 'fresh-network-content';
    cacheStore.set(pathKey, freshBody);
    return {
      handledBySw: true,
      source: 'NETWORK',
      status: 200,
      body: freshBody,
      updatedCache: true,
    };
  }

  // Network failed: Check cache
  const cached = cacheStore.get(pathKey);
  if (cached) {
    return {
      handledBySw: true,
      source: 'CACHE',
      status: 200,
      body: cached,
      updatedCache: false,
    };
  }

  // Navigation fallback to /index.html
  if (mode === 'navigate') {
    const indexHtml = cacheStore.get('/index.html') || cacheStore.get('/');
    if (indexHtml) {
      return {
        handledBySw: true,
        source: 'CACHE',
        status: 200,
        body: indexHtml,
        updatedCache: false,
      };
    }
  }

  return {
    handledBySw: true,
    source: 'OFFLINE_FALLBACK',
    status: 503,
    body: 'Modo sin conexión activo — Chrystal® ERP',
    updatedCache: false,
  };
}

export default {
  PWA_CACHE_NAME,
  PWA_PRECACHE_ASSETS,
  PWA_EXCLUDED_HOSTNAMES,
  shouldBypassServiceWorker,
  simulateServiceWorkerFetch,
};
