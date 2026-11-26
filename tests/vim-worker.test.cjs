const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadWorker(html) {
  const sandbox = {
    URL,
    Response,
    fetch: async () => new Response(html, { status:200, headers:{'Content-Type':'text/html'} }),
    setTimeout,
    Promise,
    Map,
    Date,
    String,
    Number
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(require.resolve('../worker/moex-proxy.js'), 'utf8')
    .replace('export default {', 'globalThis.worker = {');
  vm.runInContext(source, sandbox);
  return sandbox.worker;
}

test('Worker parses official VIM price and NAV table rows', async () => {
  const html = '<table><tr><th>Дата</th><th>Стоимость пая</th><th>Изменение</th><th>СЧА</th><th>Изменение СЧА</th><th>Паи</th></tr>' +
    '<tr><td>25.11.2026</td><td>106,28</td><td>0,21 %</td><td>226 272 020,37</td><td>1,2 %</td><td>123</td></tr>' +
    '<tr><td>24.11.2026</td><td>106,05</td><td>0,1 %</td><td>225 000 000,00</td><td>1 %</td><td>122</td></tr></table>';
  const worker = loadWorker(html);
  const response = await worker.fetch(new Request('https://worker.test/vim/8000'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.fundId, '8000');
  assert.equal(data.date, '2026-11-25');
  assert.equal(data.price, 106.28);
  assert.equal(data.nav, 226272020.37);
  assert.equal(data.history.length, 2);
  assert.equal(data.history[0].date, '2026-11-24');
});

test('Worker only exposes the two allowlisted VIM funds', async () => {
  const worker = loadWorker('<html></html>');
  const response = await worker.fetch(new Request('https://worker.test/vim/8001'));
  assert.equal(response.status, 404);
});
