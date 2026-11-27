const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { updateSnapshots, normalize, isValid, serialize } = require('../scripts/update-vim-snapshots.cjs');

// Страницы официальной таблицы истории (как на wealthim.ru, по 20 строк,
// здесь сокращены до двух точек). Страница 3 повторяет первую — обход
// должен на ней остановиться.
const PAGE1 = `<html><body><table>
  <thead><tr><th>Дата</th><th>Стоимость пая, руб.</th><th>Изменение стоимости пая %</th><th>Стоимость чистых активов, руб.</th><th>Изменение чистых активов %</th><th>Количество выданных инвестиционных паев</th></tr></thead>
  <tbody>
    <tr><td>25.11.2026</td><td>103.77</td><td>0.53 %</td><td>604 094 440.72</td><td>1.74 %</td><td>5799174.74850</td></tr>
    <tr><td>24.11.2026</td><td>103.62</td><td>-0.89 %</td><td>593 771 200.87</td><td>0.67 %</td><td>5730320.58691</td></tr>
  </tbody></table></body></html>`;
const PAGE2 = PAGE1
  .replace('25.11.2026</td><td>103.77', '23.11.2026</td><td>102.50')
  .replace('24.11.2026</td><td>103.62', '20.11.2026</td><td>102.00');

const htmlResponse = body => new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const pagedFetch = async url => {
  const u = String(url);
  if (u.includes('PAGEN_1=3')) return htmlResponse(PAGE1);
  if (u.includes('PAGEN_1=2')) return htmlResponse(PAGE2);
  return htmlResponse(PAGE1);
};

test('snapshot script: full crawl writes data/vim/<id>.json with merged history', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vim-snap-'));
  const results = await updateSnapshots({ dir, fetchImpl: pagedFetch });
  assert.equal(results.length, 2);
  for (const r of results){
    assert.equal(r.action, 'created', r.id + ' должен создать снимок');
    assert.equal(r.date, '2026-11-25');
    assert.equal(r.price, 103.77);
  }
  const stored = JSON.parse(fs.readFileSync(path.join(dir, '8000.json'), 'utf8'));
  assert.deepEqual(stored.history.map(p => p.date),
    ['2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25'], 'история со всех страниц, по возрастанию дат');
  assert.equal(stored.history[3].price, 103.77);
});

test('snapshot script: a stale source response cannot overwrite a newer stored snapshot', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vim-snap-'));
  const newer = {
    fundId: '8002', source: 'https://www.wealthim.ru/products/pif/opif/wimyo/',
    date: '2026-12-01', price: 104, nav: 1, historyCount: 1, fetchedAt: '2026-12-01T10:00:00.000Z',
    history: [{ date: '2026-12-01', price: 104, nav: 1 }]
  };
  fs.writeFileSync(path.join(dir, '8002.json'), serialize(newer));
  const results = await updateSnapshots({ dir, fetchImpl: pagedFetch });
  const r = results.find(x => x.id === '8002');
  assert.equal(r.action, 'stale', 'сайт вернул более старую дату — снимок не тронут');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '8002.json'), 'utf8')).date, '2026-12-01');
});

test('snapshot script: a failed fund is reported and keeps the stored snapshot', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vim-snap-'));
  const storedBefore = serialize(normalize({
    fundId: '8000', source: 'https://www.wealthim.ru/products/pif/opif/wimyao/',
    date: '2026-11-25', price: 103.77, nav: 1, fetchedAt: '2026-11-26T10:00:00.000Z',
    history: [{ date: '2026-11-25', price: 103.77, nav: 1 }]
  }));
  fs.writeFileSync(path.join(dir, '8000.json'), storedBefore);
  const results = await updateSnapshots({ dir, fetchImpl: async () =>
    new Response(JSON.stringify({ error: 'VIM source returned HTTP 500' }), { status: 500 }) });
  assert.equal(results[0].action, 'failed');
  assert.match(results[0].error, /HTTP 500/);
  assert.equal(fs.readFileSync(path.join(dir, '8000.json'), 'utf8'), storedBefore);
});

test('snapshot helpers: validation and one-point-per-line serialization', () => {
  const point = { date: '2026-11-25', price: 103.77, nav: 604094440.72 };
  const snapshot = { fundId: '8000', source: 'https://www.wealthim.ru/products/pif/opif/wimyao/',
    date: '2026-11-25', price: 103.77, nav: 604094440.72, historyCount: 1,
    fetchedAt: '2026-11-26T10:00:00.000Z', history: [point] };
  assert.equal(isValid(snapshot), true);
  assert.equal(isValid({ ...snapshot, price: 0 }), false);
  assert.equal(isValid({ ...snapshot, history: [] }), false);
  assert.equal(isValid({ ...snapshot, date: '25.11.2026' }), false);
  const text = serialize(snapshot);
  const roundTrip = JSON.parse(text);
  assert.deepEqual(roundTrip, snapshot);
  assert.ok(text.split('\n').some(line => line.trim().startsWith('{"date"')), 'каждая точка истории на своей строке');
  assert.equal(isValid(normalize({ ...snapshot, history: [{ ...point, nav: null }] })), true);
});
