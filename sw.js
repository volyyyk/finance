// Bump this version whenever the application shell changes.
const CACHE_NAME = 'finance-cache-v7';
// Базовый путь приложения: работает и в корне домена (Netlify),
// и в подкаталоге вроде /finance/ на GitHub Pages.
const BASE = new URL('./', self.registration.scope);
const ASSET_NAMES = [
  './', './index.html', './styles.css', './manifest.json',
  './data/seed.js', './js/core.js', './js/moex.js', './js/simulator.js', './js/bonds.js',
  './js/charts.js', './js/results.js', './js/cashback.js', './js/editor.js', './js/dashboard.js',
  './js/notifications.js', './js/app.js',
  './js/pwa.js', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];
const ASSET_URLS = {};
ASSET_NAMES.forEach(n => { ASSET_URLS[n] = new URL(n, BASE).toString(); });
const META_CACHE = 'finance-meta';
const META_URL = new URL('./meta', BASE).toString();
const ICON_URL = new URL('./icons/icon-192.png', BASE).toString();
const DAY_MS = 86400000;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(
    Object.values(ASSET_URLS).map(url => new Request(url, { cache: 'reload' }))
  )));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  // Страница передаёт дату последнего захода и предстоящие списания
  if (event.data?.type === 'fin-meta'){
    event.waitUntil(caches.open(META_CACHE).then(cache => cache.put(META_URL,
      new Response(JSON.stringify(event.data), { headers: { 'Content-Type': 'application/json' } })
    )));
  }
});

async function readMeta(){
  try {
    const cache = await caches.open(META_CACHE);
    const res = await cache.match(META_URL);
    return res ? await res.json() : null;
  } catch { return null; }
}

async function writeMeta(meta){
  try {
    const cache = await caches.open(META_CACHE);
    await cache.put(META_URL,
      new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  } catch {}
}

// Фоновая проверка (браузеры с поддержкой Periodic Background Sync,
// приложение должно быть установлено): напоминание о сверке расходов
// в выбранный день недели и предупреждения за 3 дня до списаний.
self.addEventListener('periodicsync', event => {
  if (event.tag !== 'finance-check') return;
  event.waitUntil((async () => {
    const meta = await readMeta();
    if (!meta) return;
    const now = Date.now();
    meta.sent ||= [];

    // Недельная сверка расходов: в выбранный день, не чаще раза в сутки
    const checkDay = Number.isInteger(meta.checkDay) ? meta.checkDay : 0;
    const nowDate = new Date();
    if (nowDate.getDay() === checkDay && now - (meta.lastWeeklyTs || 0) >= 20 * 3600 * 1000){
      await self.registration.showNotification('Пора свериться с расходами', {
        body: 'Сегодня день сверки расходов. Откройте приложение и проверьте траты за неделю.',
        tag: 'fin-weekly', icon: ICON_URL
      });
      meta.lastWeeklyTs = now;
    }

    // Предупреждения за 3 дня до списаний
    for (const p of meta.payments || []){
      const days = Math.round((p.ts - now) / DAY_MS);
      if (days < 0 || days > 3 || meta.sent.includes(p.key)) continue;
      await self.registration.showNotification('Скорое списание', {
        body: `${p.title}${p.amount ? ': ' + p.amount.toLocaleString('ru-RU') + ' ₽' : ''} — ` +
              (days === 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} дн.`),
        tag: p.key, icon: ICON_URL
      });
      meta.sent.push(p.key);
    }

    // Чистим отправленные ключи, вышедшие за горизонт проверки
    const weekAgo = now - 7 * DAY_MS;
    const live = (meta.payments || []).filter(p => p.ts >= weekAgo).map(p => p.key);
    meta.sent = meta.sent.filter(k => live.includes(k));
    await writeMeta(meta);
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

// Кэшируем только собственные ресурсы в пределах базового пути
function assetKey(pathname){
  const base = BASE.pathname; // всегда заканчивается на '/'
  if (pathname === base) return './';
  if (!pathname.startsWith(base)) return null;
  return './' + pathname.slice(base.length);
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  // Live financial APIs and non-GET requests are never cached.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    const key = assetKey(url.pathname);
    if (key !== './' && key !== './index.html') return;
    event.respondWith(caches.open(CACHE_NAME).then(async cache =>
      (await cache.match(ASSET_URLS['./index.html'])) || fetch(request)));
    return;
  }
  const key = assetKey(url.pathname);
  if (!key || !(key in ASSET_URLS)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache =>
    (await cache.match(ASSET_URLS[key])) || fetch(request)));
});
