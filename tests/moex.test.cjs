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

test('configured Cloudflare Worker is tried before browser-to-MOEX requests', async () => {
  const originalFetch = global.fetch;
  const originalStorage = global.localStorage;
  const requested = [];
  global.localStorage = { getItem: key => key === 'moex_proxy_url' ? 'https://finapp-test.workers.dev' : null };
  global.fetch = async url => {
    requested.push(String(url));
    return {
      ok:true,
      json:async()=>({
        marketdata:{columns:['BOARDID','LAST'],data:[['TQBR',56.2]]},
        securities:{columns:['FACEVALUE'],data:[[1]]}
      })
    };
  };
  try {
    const result = await MoexAPI.lastPrice('TEST_WORKER_FIRST_1','TQBR','stock');
    assert.equal(result.last,56.2);
    assert.match(requested[0], /^https:\/\/finapp-test\.workers\.dev\/iss\/engines\/stock/);
    assert.equal(requested.length,1);
  } finally {
    global.fetch = originalFetch;
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  }
});

test('configured Worker failure falls back to direct ISS and public relay', async () => {
  const originalFetch = global.fetch;
  const originalStorage = global.localStorage;
  const requested = [];
  global.localStorage = { getItem: key => key === 'moex_proxy_url' ? 'https://finapp-test.workers.dev' : null };
  global.fetch = async url => {
    requested.push(String(url));
    if (requested.length === 1) return { ok:false, status:502 };
    return {
      ok:true,
      json:async()=>({
        marketdata:{columns:['BOARDID','LAST'],data:[['TQBR',57.3]]},
        securities:{columns:['FACEVALUE'],data:[[1]]}
      })
    };
  };
  try {
    const result = await MoexAPI.lastPrice('TEST_WORKER_FALLBACK_1','TQBR','stock');
    assert.equal(result.last,57.3);
    assert.match(requested[0], /^https:\/\/finapp-test\.workers\.dev\/iss\//);
    assert.match(requested[1], /^https:\/\/iss\.moex\.com\/iss\//);
  } finally {
    global.fetch = originalFetch;
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  }
});

test('proxy URL validation accepts HTTPS origins only', () => {
  assert.equal(MoexAPI.normalizeProxyUrl('https://finapp.workers.dev/'), 'https://finapp.workers.dev');
  assert.equal(MoexAPI.normalizeProxyUrl('http://finapp.workers.dev'), '');
  assert.equal(MoexAPI.normalizeProxyUrl('https://finapp.workers.dev/iss'), '');
  assert.equal(MoexAPI.normalizeProxyUrl('not a url'), '');
});


test('ISS parser accepts compact and extended block objects and positional blocks', () => {
  const compact = { columns: ['SECID', 'LAST'], data: [['VTBR', 56.2]] };
  const extended = { metadata: [{ name: 'SECID', type: 'string' }], columns: ['SECID', 'LAST'], data: [['SBER', 300]] };
  const positional = [['SECID', 'LAST'], [['GAZP', 120]]];
  assert.deepEqual(MoexAPI.parseBlock(compact), { columns: ['SECID', 'LAST'], data: [['VTBR', 56.2]] });
  assert.deepEqual(MoexAPI.parseBlock(extended), { columns: ['SECID', 'LAST'], data: [['SBER', 300]] });
  assert.deepEqual(MoexAPI.parseBlock(positional), { columns: ['SECID', 'LAST'], data: [['GAZP', 120]] });
  assert.equal(MoexAPI.parseBlock({ columns: ['SECID'], rows: [] }), null);
});

test('MOEX requests explicitly ask for compact JSON and response version headers', async () => {
  const originalFetch = global.fetch;
  let requestedUrl = '';
  global.fetch = async url => {
    requestedUrl = String(url);
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({
        marketdata: { columns: ['BOARDID', 'LAST'], data: [['TQBR', 42]] },
        securities: { columns: ['FACEVALUE'], data: [[1]] }
      })
    };
  };
  try {
    const result = await MoexAPI.lastPrice('TEST_COMPACT_URL_1', 'TQBR', 'stock');
    const parsed = new URL(requestedUrl);
    assert.equal(parsed.searchParams.get('iss.json'), 'compact');
    assert.equal(parsed.searchParams.get('iss.version'), 'on');
    assert.equal(result.last, 42);
  } finally {
    global.fetch = originalFetch;
  }
});

test('HTTP error diagnostics include Worker upstream status and response body', async () => {
  const originalFetch = global.fetch;
  const originalStorage = global.localStorage;
  global.localStorage = { getItem: key => key === 'moex_proxy_url' ? 'https://finapp-test.workers.dev' : null };
  global.fetch = async () => ({
    ok: false,
    status: 502,
    headers: { get: name => name.toLowerCase() === 'x-moex-upstream-status' ? '503' : null },
    text: async () => JSON.stringify({ error: 'MOEX ISS returned HTTP 503', detail: 'upstream temporarily unavailable' })
  });
  try {
    await assert.rejects(
      MoexAPI.lastPrice('TEST_WORKER_502_DETAIL_1', 'TQBR', 'stock'),
      error => {
        assert.match(error.message, /Cloudflare Worker: HTTP 502/);
        assert.match(error.message, /MOEX upstream 503/);
        assert.match(error.message, /upstream temporarily unavailable/);
        return true;
      }
    );
  } finally {
    global.fetch = originalFetch;
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  }
});

test('successful HTTP response with HTML instead of JSON is diagnosed as a format error', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    headers: { get: () => 'text/html' },
    text: async () => '<html>proxy error page</html>'
  });
  try {
    await assert.rejects(
      MoexAPI.lastPrice('TEST_HTML_INSTEAD_JSON_1', 'TQBR', 'stock'),
      /Ответ не является JSON.*text\/html.*proxy error page/
    );
  } finally {
    global.fetch = originalFetch;
  }
});


test('resolveMarket uses the instrument primary board instead of assuming TQBR/TQTF', async () => {
  const originalFetch = global.fetch;
  const requested = [];
  global.fetch = async url => {
    requested.push(String(url));
    if (String(url).includes('/securities/VTBL.json')) return {
      ok:true, json:async()=>({ boards:{ columns:['engine','market','boardid','is_primary','is_traded'], data:[['stock','shares','TQTF',1,1]] } })
    };
    return { ok:true, json:async()=>({ marketdata:{columns:['BOARDID','LAST'],data:[['TQTF',123.45]]}, securities:{columns:['FACEVALUE'],data:[[1]]} }) };
  };
  try {
    const market = await MoexAPI.resolveMarket('VTBL','TQBR','fund');
    assert.deepEqual(market,{engine:'stock',market:'shares',board:'TQTF'});
    const quote = await MoexAPI.lastPrice('VTBL','TQBR','fund');
    assert.equal(quote.last,123.45);
    assert.ok(requested.some(url=>url.includes('/boards/TQTF/securities/VTBL.json')));
  } finally { global.fetch=originalFetch; }
});

test('resolveMarket keeps precious metals on the currency spot market', async () => {
  const market = await MoexAPI.resolveMarket('PLDRUB_TOM','CETS','metal');
  assert.deepEqual(market,{engine:'currency',market:'selt',board:'CETS'});
});

test('refreshAsset migrates the legacy PDDRUB_TOM alias to MOEX palladium ticker PLDRUB_TOM', async () => {
  const originalFetch = global.fetch;
  let requestedUrl = '';
  global.fetch = async url => {
    requestedUrl = String(url);
    return { ok:true, json:async()=>({
      marketdata:{columns:['BOARDID','LAST'],data:[['CETS',3210.5]]},
      securities:{columns:['FACEVALUE'],data:[[1]]}
    }) };
  };
  try {
    const asset={secid:'PDDRUB_TOM',kind:'metal',board:'CETS'};
    await MoexAPI.refreshAsset(asset);
    assert.equal(asset.secid,'PLDRUB_TOM');
    assert.equal(asset.lastPrice,3210.5);
    assert.match(requestedUrl,/currency\\/markets\\/selt\\/boards\\/CETS\\/securities\\/PLDRUB_TOM/);
  } finally { global.fetch=originalFetch; }
});
