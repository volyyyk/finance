// Bump this version whenever the application shell changes.
const CACHE_NAME = 'finance-cache-v5';
const ASSETS = [
  '/', '/index.html', '/styles.css', '/manifest.json',
  '/data/seed.js', '/js/core.js', '/js/moex.js', '/js/simulator.js', '/js/bonds.js',
  '/js/charts.js', '/js/editor.js', '/js/dashboard.js', '/js/notifications.js', '/js/app.js',
  '/js/pwa.js', '/icons/icon-180.png', '/icons/icon-192.png', '/icons/icon-512.png'
];
const SHELL = new Set(ASSETS);
const META_CACHE = 'finance-meta';
const DAY_MS = 86400000;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(
    ASSETS.map(url => new Request(url, { cache: 'reload' }))
  )));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  // Страница передаёт дату последнего захода и предстоящие списания
  if (event.data?.type === 'fin-meta'){
    event.waitUntil(caches.open(META_CACHE).then(cache => cache.put('/meta',
      new Response(JSON.stringify(event.data), { headers: { 'Content-Type': 'application/json' } })
    )));
  }
});

async function readMeta(){
  try {
    const cache = await caches.open(META_CACHE);
    const res = await cache.match('/meta');
    return res ? await res.json() : null;
  } catch { return null; }
}

// Фоновая проверка (браузеры с поддержкой Periodic Background Sync,
// приложение должно быть установлено): недельная сверка расходов
// и напоминания за 3 дня до списаний.
self.addEventListener('periodicsync', event => {
  if (event.tag !== 'finance-check') return;
  event.waitUntil((async () => {
    const meta = await readMeta();
    if (!meta) return;
    const now = Date.now();
    if (meta.lastVisit && now - meta.lastVisit >= 7 * DAY_MS){
      await self.registration.showNotification('Пора свериться с расходами', {
        body: 'Прошла неделя с последнего захода. Откройте приложение и сверьтесь с расходами.',
        tag: 'fin-weekly', icon: '/icons/icon-192.png'
      });
    }
    for (const p of meta.payments || []){
      const days = Math.round((p.ts - now) / DAY_MS);
      if (days < 0 || days > 3) continue;
      await self.registration.showNotification('Скорое списание', {
        body: `${p.title}${p.amount ? ': ' + p.amount.toLocaleString('ru-RU') + ' ₽' : ''} — ` +
              (days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} дн.`),
        tag: p.key, icon: '/icons/icon-192.png'
      });
    }
  })());
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
