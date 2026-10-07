/* eslint-disable no-undef */
/**
 * Minimal app-shell service worker.
 *
 * Strategy
 *  - Navigations: network-first, fall back to the cached shell when offline so
 *    the installed app still opens on a train / in a lecture hall.
 *  - Static build assets (/assets/*, icons): cache-first - Vite fingerprints
 *    their filenames, so a cached copy can never be stale.
 *  - API calls: never cached. Balances must not be served from a stale cache;
 *    showing a wrong balance in a savings app is worse than showing nothing.
 *
 * Bump CACHE_VERSION whenever the shell changes, so old caches get dropped.
 */
const CACHE_VERSION = 'digibank-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/favicon.png', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // let fonts/CDN go to network
  if (url.pathname.startsWith('/api/')) return; // never cache money data

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});
