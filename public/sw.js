/**
 * Service Worker Oficial — Hiper Abasto Polar — Chrystal® ERP
 * Versión de Caché: v2 (hiper-abasto-polar-erp-v2)
 * 
 * Estrategia: Network-First con fallback a caché para App Shell y Branding.
 * Línea Roja de Exclusión Incondicional:
 *  - Firebase Firestore (firestore.googleapis.com)
 *  - Firebase Auth / IdentityToolkit (identitytoolkit.googleapis.com)
 *  - Firebase RTDB (firebaseio.com)
 *  - Google APIs generales (googleapis.com)
 *  - Endpoints de Servidor / IA (/api/*, incl. /api/assistant/chat con Gemini 3.8 y /api/ocr/extract)
 *  - WebSockets (ws:, wss:)
 *  - Cotizaciones financieras en vivo (bcv.org.ve, dolarapi.com)
 * 
 * © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

const CACHE_NAME = 'hiper-abasto-polar-erp-v2';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/assets/branding/hiper_abasto_polar_logo.jpg',
];

const EXCLUDED_HOSTNAMES = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'firebaseio.com',
  'googleapis.com',
  'bcv.org.ve',
  'dolarapi.com',
];

// Instalación: Precaché de shell estático y branding institucional
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// Activación: Purga limpia de cachés obsoletas (v1, etc.) y toma de control inmediato
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Intercepción Fetch: Network-First con exclusión absoluta de Firestore y APIs en tiempo real
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo interceptar peticiones GET
  if (request.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Bypass para protocolos de sockets o extensiones
  if (
    url.protocol === 'ws:' ||
    url.protocol === 'wss:' ||
    url.protocol === 'chrome-extension:' ||
    url.pathname === '/sw.js'
  ) {
    return;
  }

  // Bypass obligatorio para endpoints de servidor e IA
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Bypass obligatorio para Firebase Firestore, Auth y APIs financieras
  const hostname = url.hostname.toLowerCase();
  for (let i = 0; i < EXCLUDED_HOSTNAMES.length; i++) {
    if (hostname.includes(EXCLUDED_HOSTNAMES[i])) {
      return;
    }
  }

  // Estrategia Network-First con fallback a caché para App Shell
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors')
        ) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // Si es navegación entre vistas, devolver el index.html en caché
        if (request.mode === 'navigate') {
          const fallbackHtml = await caches.match('/index.html');
          if (fallbackHtml) {
            return fallbackHtml;
          }
        }

        // Respuesta degradada controlada sin excepciones no capturadas
        return new Response('Modo sin conexión activo — Chrystal® ERP', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});
