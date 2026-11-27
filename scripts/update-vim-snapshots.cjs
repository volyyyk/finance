#!/usr/bin/env node
/* ============================================================
   update-vim-snapshots.cjs — снимки официальной стоимости пая
   открытых ПИФ «Яндекс Пэй» (ВИМ Инвестиции, wealthim.ru).

   Эти фонды не торгуются на MOEX, а чужой сайт браузер напрямую
   не читает. Поэтому официальная история складывается в
   data/vim/<номер правил>.json и отдаётся вместе с приложением
   (GitHub Pages) — приложение берёт цену оттуда.

   Запускается: npm run update:vim, ярлыком на ПК и по расписанию
   в GitHub Actions (.github/workflows/vim-prices.yml).
   Страницу фонда обходят и разбирают те же функции, что и в
   Cloudflare Worker (worker/moex-proxy.js).

   Снимок перезаписывается, только если сайт вернул не более старую
   дату: сбой или урезанная страница не могут испортить сохранённое.
   ============================================================ */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const SNAPSHOT_DIR = path.join(ROOT, 'data', 'vim');
const REQUEST_TIMEOUT_MS = 20000;
const FUND_NAMES = {
  '8000': 'Фонд акций и облигаций',
  '8002': 'Фонд рублёвых облигаций'
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Обработчик /vim/<правила> берётся из воркера без изменений:
// страница фонда, пагинация и разбор таблицы не дублируются.
function loadWorker(fetchImpl){
  const sandbox = { URL, Request, Response, fetch: fetchImpl, setTimeout };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(ROOT, 'worker', 'moex-proxy.js'), 'utf8')
    .replace('export default {', 'globalThis.worker = {');
  vm.runInContext(source, sandbox, { filename: 'worker/moex-proxy.js' });
  return sandbox.worker;
}

// У воркера нет своего тайм-аута: в Cloudflare его держит платформа,
// а здесь зависший запрос не должен останавливать запуск.
const timedFetch = (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

function normalize(data){
  const point = p => ({ date: String(p.date), price: Number(p.price), nav: p.nav == null ? null : Number(p.nav) });
  return {
    fundId: String(data.fundId),
    source: data.source,
    date: String(data.date),
    price: Number(data.price),
    nav: data.nav == null ? null : Number(data.nav),
    historyCount: data.history.length,
    fetchedAt: data.fetchedAt,
    history: data.history.map(point)
  };
}

function isValid(snapshot){
  return DAY.test(snapshot.date) && snapshot.price > 0 && snapshot.history.length > 0 &&
    snapshot.history.every(p => DAY.test(p.date) && p.price > 0) &&
    snapshot.history[snapshot.history.length - 1].date === snapshot.date;
}

// Одна точка истории на строку: изменения видны в diff и на GitHub.
function serialize(snapshot){
  const { history, ...head } = snapshot;
  const headLines = Object.entries(head).map(([key, value]) => '  ' + JSON.stringify(key) + ': ' + JSON.stringify(value));
  const points = history.map(p => '    ' + JSON.stringify(p));
  return '{\n' + headLines.join(',\n') + ',\n  "history": [\n' + points.join(',\n') + '\n  ]\n}\n';
}

function readSnapshot(file){
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

const sameHistory = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function updateSnapshots({ dir = SNAPSHOT_DIR, fetchImpl = timedFetch } = {}){
  const worker = loadWorker(fetchImpl);
  const results = [];
  for (const [id, name] of Object.entries(FUND_NAMES)){
    try {
      const response = await worker.fetch(new Request('https://vim.local/vim/' + id));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error +
        (data.upstreamStatus ? ' (HTTP ' + data.upstreamStatus + ')' : '') +
        (data.detail ? ' — ' + data.detail : ''));
      const snapshot = normalize(data);
      if (!isValid(snapshot)) throw new Error('сайт вернул ответ без истории стоимости пая');
      const file = path.join(dir, id + '.json');
      const stored = readSnapshot(file);
      const action = !stored ? 'created'
        : stored.date > snapshot.date ? 'stale'
        : sameHistory(stored.history, snapshot.history) ? 'unchanged'
        : 'updated';
      if (action === 'created' || action === 'updated'){
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file, serialize(snapshot));
      }
      results.push({ id, name, action, date: snapshot.date, price: snapshot.price, storedDate: stored?.date ?? null });
    } catch (error){
      results.push({ id, name, action: 'failed', error: String(error?.message || error) });
    }
  }
  return results;
}

if (require.main === module){
  const ruDate = iso => iso.split('-').reverse().join('.');
  updateSnapshots().then(results => {
    for (const r of results){
      const label = r.id + ' · ' + r.name;
      if (r.action === 'failed') console.error('[ошибка] ' + label + ': ' + r.error);
      else if (r.action === 'stale') console.log('[пропущено] ' + label + ': сайт вернул ' + ruDate(r.date) +
        ', в снимке новее — ' + ruDate(r.storedDate));
      else if (r.action === 'unchanged') console.log('[актуально] ' + label + ': ' + r.price.toFixed(2) + ' ₽ на ' + ruDate(r.date));
      else console.log('[' + (r.action === 'created' ? 'создан' : 'обновлён') + '] ' + label + ': ' +
        r.price.toFixed(2) + ' ₽ на ' + ruDate(r.date) + ' — data/vim/' + r.id + '.json');
    }
    if (results.some(r => r.action === 'failed')) process.exitCode = 1;
  });
}

module.exports = { updateSnapshots, normalize, isValid, serialize, FUND_NAMES };
