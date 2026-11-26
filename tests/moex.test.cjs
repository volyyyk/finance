const { test } = require('node:test');
const assert = require('node:assert/strict');
const MoexAPI = require('../js/moex.js');

test('chooseMarketRow prefers the saved board when it has a current quote', () => {
  const rows = [
    { BOARDID: 'TQBR', LAST: 100 },
    { BOARDID: 'TQTF', LAST: 101, IS_PRIMARY: 1 }
  ];
  assert.equal(MoexAPI.chooseMarketRow(rows, 'TQBR').BOARDID, 'TQBR');
});

test('chooseMarketRow falls back to the primary board, then any live board', () => {
  const rows = [
    { BOARDID: 'TQBR', LAST: null },
    { BOARDID: 'TQTF', LAST: 101, IS_PRIMARY: 1 },
    { BOARDID: 'TQPI', LAST: 99 }
  ];
  assert.equal(MoexAPI.chooseMarketRow(rows, 'TQBR').BOARDID, 'TQTF');
  assert.equal(MoexAPI.chooseMarketRow([{ BOARDID: 'TQPI', LAST: 99 }], 'TQBR').BOARDID, 'TQPI');
  assert.equal(MoexAPI.chooseMarketRow([{ BOARDID: 'TQBR', LAST: null }], 'TQBR'), null);
});

test('lastPrice queries all boards and does not mistake previous close for a live quote', async () => {
  const originalFetch = global.fetch;
  let requestedUrl = '';
  global.fetch = async url => {
    requestedUrl = String(url);
    return {
      ok: true,
      json: async () => ({
        marketdata: { columns: ['BOARDID', 'LAST', 'LCURRENTPRICE'], data: [] },
        securities: { columns: ['PREVPRICE', 'PREVLEGALCLOSEPRICE', 'FACEVALUE'], data: [[123, 122, 10]] }
      })
    };
  };
  try {
    const result = await MoexAPI.lastPrice('TEST_NO_QUOTE_1', 'TQBR', 'stock');
    assert.match(requestedUrl, /markets\/shares\/securities\/TEST_NO_QUOTE_1\.json/);
    assert.doesNotMatch(requestedUrl, /boards\//);
    assert.equal(result.last, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('lastPrice returns a current marketdata price and the actual selected board', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      marketdata: { columns: ['BOARDID', 'LAST', 'LCURRENTPRICE'], data: [['TQTF', 456.7, null]] },
      securities: { columns: ['PREVPRICE', 'FACEVALUE'], data: [[450, 1]] }
    })
  });
  try {
    const result = await MoexAPI.lastPrice('TEST_LIVE_QUOTE_1', 'TQBR', 'fund');
    assert.equal(result.last, 456.7);
    assert.equal(result.board, 'TQTF');
    assert.ok(result.updatedAt);
  } finally {
    global.fetch = originalFetch;
  }
});

test('lastPrice retries a browser network/CORS failure through the public-data relay', async () => {
  const originalFetch = global.fetch;
  const requested = [];
  global.fetch = async url => {
    requested.push(String(url));
    if (requested.length === 1) throw new TypeError('Failed to fetch');
    return {
      ok: true,
      json: async () => ({
        marketdata: { columns: ['BOARDID', 'LAST'], data: [['TQBR', 321.5]] },
        securities: { columns: ['FACEVALUE'], data: [[1]] }
      })
    };
  };
  try {
    const result = await MoexAPI.lastPrice('TEST_CORS_RELAY_1', 'TQBR', 'stock');
    assert.equal(result.last, 321.5);
    assert.equal(requested.length, 2);
    assert.match(requested[0], /^https:\/\/iss\.moex\.com\/iss\//);
    assert.match(requested[1], /^https:\/\/proxy\.cors\.dev\/https:\/\/iss\.moex\.com\/iss\//);
  } finally {
    global.fetch = originalFetch;
  }
});

test('lastPrice tries AllOrigins when the first CORS relay returns HTTP 502', async () => {
  const originalFetch = global.fetch;
  const requested = [];
  global.fetch = async url => {
    requested.push(String(url));
    if (requested.length === 1) throw new TypeError('Failed to fetch');
    if (requested.length === 2) return { ok:false, status:502 };
    return {
      ok:true,
      json:async()=>({
        marketdata:{columns:['BOARDID','LAST'],data:[['TQBR',777.25]]},
        securities:{columns:['FACEVALUE'],data:[[1]]}
      })
    };
  };
  try {
    const result = await MoexAPI.lastPrice('TEST_RELAY_CHAIN_1','TQBR','stock');
    assert.equal(result.last,777.25);
    assert.equal(requested.length,3);
    assert.match(requested[1],/^https:\/\/proxy\.cors\.dev\//);
    assert.match(requested[2],/^https:\/\/api\.allorigins\.win\/raw\?/);
  } finally {
    global.fetch=originalFetch;
  }
});

test('lastPrice falls back when a direct ISS request times out', async () => {
  const originalFetch = global.fetch;
  const originalTimeout = AbortSignal.timeout;
  let requested = 0;
  let timeoutInjected = false;
  global.fetch = async url => {
    requested++;
    if (requested === 1) return new Promise(() => {});
    return {
      ok:true,
      json:async()=>({
        marketdata:{columns:['BOARDID','LAST'],data:[['TQBR',888.5]]},
        securities:{columns:['FACEVALUE'],data:[[1]]}
      })
    };
  };
  AbortSignal.timeout = ms => {
    if (!timeoutInjected) {
      timeoutInjected = true;
      const controller = new AbortController();
      queueMicrotask(() => controller.abort());
      return controller.signal;
    }
    return originalTimeout(ms);
  };
  try {
    const result = await MoexAPI.lastPrice('TEST_HUNG_ISS_1','TQBR','stock');
    assert.equal(result.last,888.5);
    assert.equal(requested,2);
    assert.equal(timeoutInjected,true);
  } finally {
    global.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
});
