/**
 * Service Worker Oficial — Hiper Abasto Polar — Chrystal® ERP
 * Versión de Caché: v3 (hiper-abasto-polar-erp-v3)
 * 
 * Estrategia de Carga Resiliente:
 *  - Precaché de activos críticos en instalación (App Shell y Branding oficial).
 *  - Stale-While-Revalidate para activos estáticos (JS, CSS, fuentes, imágenes, webmanifest).
 *    Ofrece carga instantánea (0ms) en piso de retail con baja conectividad en Venezuela
 *    mientras revalida en segundo plano de forma silenciosa.
 *  - Network-First con fallback a `/index.html` para peticiones de navegación.
 * 
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

const CACHE_NAME = 'hiper-abasto-polar-erp-v3';

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

// Activación: Purga limpia de cachés obsoletas (hiper-abasto-polar-erp-v1, hiper-abasto-polar-erp-v2, etc.) y toma de control inmediato
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

// Intercepción Fetch: Stale-While-Revalidate para estáticos y Network-First para navegación
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

  // Bypass obligatorio para endpoints de servidor, IA y módulos en vivo de Vite
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules/')
  ) {
    return;
  }

  // Bypass obligatorio para Firebase Firestore, Auth y APIs financieras
  const hostname = url.hostname.toLowerCase();
  for (let i = 0; i < EXCLUDED_HOSTNAMES.length; i++) {
    if (hostname.includes(EXCLUDED_HOSTNAMES[i])) {
      return;
    }
  }

  // 1. Peticiones de Navegación (HTML Shell): Network-First con fallback inmediato a /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedNavigate = await caches.match(request);
          if (cachedNavigate) return cachedNavigate;
          const fallbackHtml = await caches.match('/index.html');
          if (fallbackHtml) return fallbackHtml;
          return new Response('Modo sin conexión activo — Chrystal® ERP', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
    return;
  }

  // 2. Activos Estáticos e Interfaz Principal: Estrategia Stale-While-Revalidate
  // Devuelve la copia en caché de inmediato (0ms de latencia) y actualiza en segundo plano.
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
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
        .catch(() => {
          // Fallback seguro si no hay conexión de red (evita resolver undefined en respondWith)
          return (
            cachedResponse ||
            new Response('Recurso estático sin conexión — Chrystal® ERP', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        });

      return cachedResponse || fetchPromise;
    })
  );
});
