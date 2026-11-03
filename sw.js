// Bump this version whenever the application shell changes.
const CACHE_NAME = 'finance-cache-v4';
const ASSETS = [
  '/', '/index.html', '/styles.css', '/manifest.json',
  '/data/seed.js', '/js/core.js', '/js/moex.js', '/js/simulator.js', '/js/bonds.js',
  '/js/charts.js', '/js/editor.js', '/js/dashboard.js', '/js/app.js',
  '/js/pwa.js', '/icons/icon-180.png', '/icons/icon-192.png', '/icons/icon-512.png'
];
const SHELL = new Set(ASSETS);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(
    ASSETS.map(url => new Request(url, { cache: 'reload' }))
  )));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('finance-cache-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  // Live financial APIs and non-GET requests are never cached.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    if (url.pathname !== '/' && url.pathname !== '/index.html') return;
    event.respondWith(caches.open(CACHE_NAME).then(async cache =>
      (await cache.match('/index.html')) || fetch(request)));
    return;
  }
  if (!SHELL.has(url.pathname)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache =>
    (await cache.match(url.pathname)) || fetch(request)));
});
