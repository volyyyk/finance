const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadVim(fetchImpl) {
  const sandbox = {
    fetch: fetchImpl,
    AbortSignal,
    URL,
    Date,
    Map,
    Number,
    String,
    Math,
    localStorage: { getItem: () => null }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve('../js/vim.js'), 'utf8') + '\nglobalThis.api = VIMAPI;', sandbox);
  return sandbox.api;
}

test('VIM client updates fund price, NAV, date and preserves historical points', async () => {
  const api = loadVim(async url => {
    assert.ok(String(url).endsWith('/vim/8000'));
    return {
      ok: true,
      text: async () => JSON.stringify({
        fundId: '8000',
        source: 'https://www.wealthim.ru/products/pif/opif/wimyao/',
        fetchedAt: '2026-11-26T10:00:00.000Z',
        date: '2026-11-25',
        price: 106.28,
        nav: 226272020.37,
        history: [
          { date: '2026-08-31', price: 100.68, nav: 10000000 },
          { date: '2026-09-30', price: 101.36, nav: 14000000 },
          { date: '2026-11-25', price: 106.28, nav: 226272020.37 }
        ]
      })
    };
  });
  const asset = { rulesNumber: '8000', lastPrice: 101.36, navDate: '30.09.2026', vimHistory: [] };
  await api.refreshAsset(asset);
  assert.equal(asset.lastPrice, 106.28);
  assert.equal(asset.nav, 226272020.37);
  assert.equal(asset.navDate, '25.11.2026');
  assert.equal(asset.quoteSource, 'vim');
  assert.equal(asset.vimHistory.length, 3);
  assert.equal(asset.historyBase, 101.36);
  assert.ok(asset.historyAnnualPct > 0);
});

test('VIM client keeps last confirmed values when the source fails', async () => {
  const api = loadVim(async () => ({ ok:false, status:502, text:async()=>JSON.stringify({error:'upstream unavailable'}) }));
  const asset = { rulesNumber:'8002', lastPrice:102.2, nav:125000000, navDate:'02.11.2026' };
  await assert.rejects(api.refreshAsset(asset), /upstream unavailable/);
  assert.equal(asset.lastPrice, 102.2);
  assert.equal(asset.navDate, '02.11.2026');
});

test('only the two Yandex Pay VIM funds are recognized', () => {
  const api = loadVim(async () => { throw new Error('unexpected request'); });
  assert.equal(api.isVimAsset({rulesNumber:'8000'}), true);
  assert.equal(api.isVimAsset({rulesNumber:'8002'}), true);
  assert.equal(api.isVimAsset({rulesNumber:'8001'}), false);
});
