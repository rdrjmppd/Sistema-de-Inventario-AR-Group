/**
 * Service Worker Oficial — Hiper Abasto Polar — Chrystal® ERP
 * Estrategia: Network-First con fallback a caché para el shell estático.
 * Excluye explícitamente Firebase Firestore, Auth y endpoints en tiempo real (/api/*).
 * © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

const CACHE_NAME = 'hiper-abasto-polar-erp-v1';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/assets/branding/hiper_abasto_polar_logo.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

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

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Exclude Firebase Firestore, Google APIs, WebSockets, and live ERP API endpoints
  if (
    url.protocol === 'ws:' ||
    url.protocol === 'wss:' ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('bcv.org.ve') ||
    url.hostname.includes('dolarapi.com')
  ) {
    return;
  }

  // Network-First strategy with cache fallback for shell and static assets
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
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
        if (request.mode === 'navigate') {
          const fallbackHtml = await caches.match('/index.html');
          if (fallbackHtml) {
            return fallbackHtml;
          }
        }
        return new Response('Modo sin conexión activo.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })
  );
});
