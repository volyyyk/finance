const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadWorker(html) {
  const sandbox = { URL, Response, Request, fetch: async () => new Response(html, { status:200, headers:{'Content-Type':'text/html'} }), setTimeout, Promise, Map, Date, String, Number, RegExp };
  vm.createContext(sandbox);
  const source = fs.readFileSync(require.resolve('../worker/moex-proxy.js'), 'utf8').replace('export default {', 'globalThis.worker = {');
  vm.runInContext(source, sandbox);
  return sandbox.worker;
}

function graphHtml(graphId) {
  return `<script>var arResultObj = { 'GRAPH_FUNDS': { '${graphId}': { 'ID':'${graphId}' } }, 'GRAPH': { '${graphId}': [
    { 'DATE_ACTIVE_FROM':'24.11.2026', 'UNIT_TRUST':'${graphId}', 'SHARE_COST':'103.62', 'NET_ASSET_COST':'225000000.00' },
    { 'DATE_ACTIVE_FROM':'25.11.2026', 'UNIT_TRUST':'${graphId}', 'SHARE_COST':'104.17', 'NET_ASSET_COST':'226272020.37' }
  ] } };</script>`;
}

test('Worker parses official VIM GRAPH history for rules 8000', async () => {
  const response = await loadWorker(graphHtml('37558764')).fetch(new Request('https://worker.test/vim/8000'));
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.fundId, '8000'); assert.equal(data.graphFundId, '37558764');
  assert.equal(data.date, '2026-11-25'); assert.equal(data.price, 104.17); assert.equal(data.nav, 226272020.37);
  assert.equal(data.history.length, 2); assert.equal(data.history[0].date, '2026-11-24');
});

test('Worker parses the distinct official GRAPH ID for rules 8002', async () => {
  const response = await loadWorker(graphHtml('37558766')).fetch(new Request('https://worker.test/vim/8002'));
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.fundId, '8002'); assert.equal(data.graphFundId, '37558766'); assert.equal(data.history.length, 2);
});

test('Worker rejects a graph belonging to the other fund', async () => {
  const response = await loadWorker(graphHtml('37558766')).fetch(new Request('https://worker.test/vim/8000'));
  assert.equal(response.status, 502);
});


function tableHtml() {
  return `<html><body><table>
    <thead><tr><th>Дата</th><th>Стоимость пая, руб.</th><th>Изменение стоимости пая %</th><th>Стоимость чистых активов, руб.</th><th>Изменение чистых активов %</th><th>Количество выданных инвестиционных паев</th></tr></thead>
    <tbody>
      <tr><td>25.11.2026</td><td>104.17</td><td>0.54 %</td><td>226 272 020.37</td><td>0.21 %</td><td>2170000.00</td></tr>
      <tr><td>24.11.2026</td><td>103.62</td><td>0.12 %</td><td>225 000 000.00</td><td>0.11 %</td><td>2160000.00</td></tr>
    </tbody></table></body></html>`;
}

test('Worker parses official VIM history table when GRAPH JS data is absent', async () => {
  const response = await loadWorker(tableHtml()).fetch(new Request('https://worker.test/vim/8002'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.fundId, '8002');
  assert.equal(data.graphFundId, '37558766');
  assert.equal(data.date, '2026-11-25');
  assert.equal(data.price, 104.17);
  assert.equal(data.nav, 226272020.37);
  assert.equal(data.history.length, 2);
  assert.equal(data.history[0].date, '2026-11-24');
});

test('Worker only exposes the two allowlisted VIM funds', async () => {
  const response = await loadWorker('<html></html>').fetch(new Request('https://worker.test/vim/8001'));
  assert.equal(response.status, 404);
});
