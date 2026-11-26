const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
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
    assert.match(requestedUrl, /markets\/shares\/boards\/TQBR\/securities\/TEST_NO_QUOTE_1\.json/);
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
    if (requested.length <= 2) throw new TypeError('Failed to fetch');
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
    assert.equal(requested.length, 3);
    assert.match(requested[0], /^https:\/\/autumn-mouse-2e3f\.kudrin-dim11\.workers\.dev\/iss\//);
    assert.match(requested[1], /^http:\/\/iss\.moex\.com\/iss\//);
    assert.match(requested[2], /^https:\/\/proxy\.cors\.dev\/http:\/\/iss\.moex\.com\/iss\//);
  } finally {
    global.fetch = originalFetch;
  }
});

test('lastPrice tries AllOrigins when the first CORS relay returns HTTP 502', async () => {
  const originalFetch = global.fetch;
  const requested = [];
  global.fetch = async url => {
    requested.push(String(url));
    if (requested.length <= 2) throw new TypeError('Failed to fetch');
    if (requested.length === 3) return { ok:false, status:502 };
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
    assert.equal(requested.length,4);
    assert.match(requested[0],/^https:\/\/autumn-mouse-2e3f\.kudrin-dim11\.workers\.dev\//);
    assert.match(requested[2],/^https:\/\/proxy\.cors\.dev\//);
    assert.match(requested[3],/^https:\/\/api\.allorigins\.win\/raw\?/);
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
    assert.match(requested[1], /^http:\/\/iss\.moex\.com\/iss\//);
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
        assert.match(error.message, /Cloudflare Worker \(HTTP upstream\): HTTP 502/);
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
    if (String(url).includes('/securities/VTBL/boards.json')) return {
      ok:true, json:async()=>({ boards:{ columns:['engine','market','boardid','is_primary','is_traded'], data:[['stock','shares','TQTF',1,1]] } })
    };
    return { ok:true, json:async()=>({ marketdata:{columns:['BOARDID','LAST'],data:[['TQTF',123.45]]}, securities:{columns:['FACEVALUE'],data:[[1]]} }) };
  };
  try {
    const market = await MoexAPI.resolveMarket('VTBL','TQBR','fund');
    assert.deepEqual(market,{engine:'stock',market:'shares',board:'TQTF'});
    const quote = await MoexAPI.lastPrice('VTBL','TQBR','fund');
    assert.equal(quote.last,123.45);
    assert.ok(requested.some(url=>url.includes('/markets/shares/securities/VTBL.json')),
      'фонд запрашивается на уровне рынка, чтобы выбрать режим с действующей котировкой');
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
    assert.ok(requestedUrl.includes('/engines/currency/markets/selt/boards/CETS/securities/PLDRUB_TOM.json'));
  } finally { global.fetch=originalFetch; }
});


test('historyClose uses public daily candles instead of subscriber-only history', async () => {
  const originalFetch = global.fetch;
  const requested = [];
  global.fetch = async url => {
    requested.push(String(url));
    return { ok:true, json:async()=>({
      candles:{columns:['begin','close'],data:[
        ['2026-05-18 00:00:00',100],
        ['2026-05-19 00:00:00',102]
      ]}
    }) };
  };
  try {
    const close = await MoexAPI.historyClose('TEST_CANDLES_1','TQBR','stock','2026-05-10','2026-05-20',null);
    assert.equal(close,102);
    assert.match(requested[0],/candles\.json/);
    assert.match(requested[0],/interval=24/);
    assert.match(requested[0],/candles\.columns=begin%2Cclose|candles\.columns=begin,close/);
    assert.doesNotMatch(requested[0],/\/history\//);
  } finally { global.fetch=originalFetch; }
});

test('historyClose checks fund candles at market level before board-specific endpoints', async () => {
  const originalFetch = global.fetch;
  const requested = [];
  global.fetch = async url => {
    requested.push(String(url));
    const value = String(url);
    if (value.includes('/securities/TEST_FUND_CANDLES/boards.json')) return { ok:true, json:async()=>({
      boards:{columns:['engine','market','boardid','is_primary','is_traded'],
        data:[['stock','shares','TQTF',1,1],['stock','shares','TQTE',0,1]]}
    })};
    if (value.includes('/markets/shares/securities/TEST_FUND_CANDLES/candles.json')) return { ok:true, json:async()=>({
      candles:{columns:['begin','close'],data:[['2026-05-19 00:00:00',2.345]]}
    })};
    throw new Error('Unexpected route: '+value);
  };
  try {
    const close = await MoexAPI.historyClose('TEST_FUND_CANDLES','TQTF','fund','2026-05-10','2026-05-20',null);
    assert.equal(close,2.345);
    assert.ok(requested.some(url=>url.includes('/markets/shares/securities/TEST_FUND_CANDLES/candles.json')));
    assert.ok(!requested.some(url=>url.includes('/boards/TQTF/securities/TEST_FUND_CANDLES/candles.json')),
      'market-level result should be used before board-specific fallback');
  } finally { global.fetch=originalFetch; }
});

test('historyClose returns bond candle close converted from percent to nominal rubles', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok:true, json:async()=>({
    candles:{columns:['begin','close'],data:[['2026-05-19 00:00:00',87.5]]}
  }) });
  try {
    assert.equal(await MoexAPI.historyClose('TEST_BOND_CANDLE','TQOB','bond','2026-05-10','2026-05-20',1000),875);
  } finally { global.fetch=originalFetch; }
});

test('legacy VTBL is identified as closed-end RSHL and is not requested as a live quote', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('must not call MOEX for inactive fund'); };
  try {
    const asset={secid:'VTBL',kind:'fund',lastPrice:2,avgPrice:2};
    await MoexAPI.refreshAsset(asset);
    assert.equal(asset.secid,'RSHL');
    assert.equal(asset.legacySecid,'VTBL');
    assert.equal(asset.moexInactive,true);
    assert.equal(asset.yieldMonth,MoexAPI.monthKey());
    assert.equal(asset.lastPrice,undefined);
    assert.equal(asset.avgPrice,2,'цена покупки остаётся доступной для оценки позиции');
    assert.equal(calls,0);
    await MoexAPI.refreshSixMonth(asset);
    assert.equal(asset.sixMonthPct,null);
  } finally { global.fetch=originalFetch; }
});

test('all MOEX upstream URLs use HTTP, with HTTPS only for relay hosts', async () => {
  const originalFetch = global.fetch;
  const requested=[];
  global.fetch=async url=>{
    requested.push(String(url));
    if(requested.length<=2) throw new TypeError('Failed to fetch');
    return {ok:true,json:async()=>({
      marketdata:{columns:['BOARDID','LAST'],data:[['TQBR',10]]},
      securities:{columns:['FACEVALUE'],data:[[1]]}
    })};
  };
  try {
    await MoexAPI.lastPrice('TEST_HTTP_ONLY_1','TQBR','stock');
    assert.match(requested[0],/^https:\/\/autumn-mouse-2e3f\.kudrin-dim11\.workers\.dev/);
    assert.match(requested[1],/^http:\/\/iss\.moex\.com/);
    assert.match(requested[2],/^https:\/\/proxy\.cors\.dev\/http:\/\/iss\.moex\.com/);
    assert.ok(requested.every(url=>!url.startsWith('https://iss.moex.com')));
  } finally { global.fetch=originalFetch; }
});


test('tradable security validation accepts an active normal TQ board', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok:true, json:async()=>({
    boards:{columns:['engine','market','boardid','is_primary','is_traded'],
      data:[['stock','shares','TQBR',1,1],['stock','shares','LIQR',0,1]]}
  })});
  try {
    assert.deepEqual(await MoexAPI.assertTradable('TEST_ACTIVE_TQ','stock'),
      {engine:'stock',market:'shares',board:'TQBR'});
  } finally { global.fetch=originalFetch; }
});

test('closed security is rejected even if a repo board remains technically active', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok:true, json:async()=>({
    boards:{columns:['engine','market','boardid','is_primary','is_traded'],
      data:[['stock','shares','LIQR',1,1],['stock','shares','TQBR',0,0]]}
  })});
  try {
    await assert.rejects(MoexAPI.assertTradable('TEST_CLOSED_TQ','fund'),
      /Закрытые или снятые с торгов инструменты добавить нельзя/);
  } finally { global.fetch=originalFetch; }
});

test('LQDT ISIN overrides a stale legacy ticker and never marks the fund inactive', async () => {
  const originalFetch = global.fetch;
  const requested=[];
  global.fetch = async url => {
    requested.push(String(url));
    if (String(url).includes('/securities/LQDT/boards.json')) return {ok:true,json:async()=>({
      boards:{columns:['engine','market','boardid','is_primary','is_traded'],
        data:[['stock','shares','TQBR',1,1]]}
    })};
    return {ok:true,json:async()=>({
      marketdata:{columns:['BOARDID','LAST'],data:[['TQBR',2.13]]},
      securities:{columns:['FACEVALUE'],data:[[1]]}
    })};
  };
  try {
    const asset={kind:'fund',secid:'VTBL',isin:'ru000a1014l8',lastPrice:2,avgPrice:2};
    await MoexAPI.refreshAsset(asset);
    assert.equal(asset.secid,'LQDT');
    assert.equal(asset.isin,'RU000A1014L8');
    assert.equal(asset.moexInactive,false);
    assert.equal(asset.lastPrice,2.13);
    assert.ok(requested.some(url=>url.includes('/securities/LQDT/boards.json')));
    assert.ok(requested.some(url=>url.includes('/markets/shares/securities/LQDT.json')));
  } finally { global.fetch=originalFetch; }
});

test('security search preserves and normalizes ISIN for safe identity matching', async () => {
  const originalFetch=global.fetch;
  global.fetch=async()=>({ok:true,json:async()=>({
    securities:{columns:['SECID','SHORTNAME','TYPE','PRIMARY_BOARDID','ISIN'],
      data:[['LQDT','Ликвидность','exchange_ppif','TQBR','RU000A1014L8']]}
  })});
  try {
    const rows=await MoexAPI.searchSecurity('RU000A1014L8');
    assert.equal(rows[0].secid,'LQDT');
    assert.equal(rows[0].shortname,'Ликвидность');
    assert.equal(rows[0].isin,'RU000A1014L8');
  } finally { global.fetch=originalFetch; }
});


test('getProxyUrl uses the shared Cloudflare Worker by default and respects a valid user override', () => {
  const originalStorage = global.localStorage;
  try {
    global.localStorage = { getItem: () => null };
    assert.equal(MoexAPI.getProxyUrl(), 'https://autumn-mouse-2e3f.kudrin-dim11.workers.dev');
    global.localStorage = { getItem: () => 'https://custom-worker.example' };
    assert.equal(MoexAPI.getProxyUrl(), 'https://custom-worker.example');
    global.localStorage = { getItem: () => 'http://insecure.example' };
    assert.equal(MoexAPI.getProxyUrl(), 'https://autumn-mouse-2e3f.kudrin-dim11.workers.dev');
  } finally {
    if (originalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalStorage;
  }
});


test('searchSecurity preserves full human-readable name and ISIN', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok:true, json:async()=>({
    securities:{columns:['SECID','SHORTNAME','SECNAME','TYPE','PRIMARY_BOARDID','ISIN'],data:[
      ['VTBR','Банк ВТБ','Банк ВТБ (публичное акционерное общество)','common_share','TQBR','RU000A0JP5V6'],
      ['LQDT','Ликвидность','БПИФ рыночных финансовых инструментов «Ликвидность»','exchange_ppif','TQTF','RU000A1014L8']
    ]}
  })});
  try {
    const rows = await MoexAPI.searchSecurity('VTBR');
    assert.equal(rows[0].secid,'VTBR');
    assert.equal(rows[0].shortname,'Банк ВТБ');
    assert.equal(rows[0].fullname,'Банк ВТБ (публичное акционерное общество)');
    assert.equal(rows[0].isin,'RU000A0JP5V6');
  } finally { global.fetch=originalFetch; }
});


test('refreshAsset hydrates missing ticker-like names from MOEX metadata', async () => {
  const originalFetch = global.fetch;
  const requested = [];
  global.fetch = async url => {
    const value = String(url);
    requested.push(value);
    if (value.includes('/securities/TEST_NAME_HYDRATE/boards.json')) return {ok:true,json:async()=>({
      boards:{columns:['engine','market','boardid','is_primary','is_traded'],data:[['stock','shares','TQBR',1,1]]}
    })};
    if (value.includes('/securities/TEST_NAME_HYDRATE.json') && !value.includes('/markets/')) return {ok:true,json:async()=>({
      securities:{columns:['SHORTNAME','SECNAME','ISIN'],data:[['Тестовая компания','Публичное акционерное общество «Тест»','RU000A0TEST01']]}
    })};
    return {ok:true,json:async()=>({
      marketdata:{columns:['BOARDID','LAST'],data:[['TQBR',123.4]]},
      securities:{columns:['FACEVALUE'],data:[[1]]}
    })};
  };
  try {
    const asset={secid:'TEST_NAME_HYDRATE',shortname:'TEST_NAME_HYDRATE',kind:'stock'};
    await MoexAPI.refreshAsset(asset);
    assert.equal(asset.shortname,'Тестовая компания');
    assert.equal(asset.fullname,'Публичное акционерное общество «Тест»');
    assert.equal(asset.isin,'RU000A0TEST01');
    assert.equal(asset.lastPrice,123.4);
    assert.ok(requested.some(url=>url.includes('/securities/TEST_NAME_HYDRATE.json')));
  } finally { global.fetch=originalFetch; }
});


test('annualizeTrend uses the observed period and never projects a loss below -100%', () => {
  const monthly = MoexAPI.annualizeTrend(100, 101, 1);
  const quarterly = MoexAPI.annualizeTrend(100, 103, 3);
  const yearly = MoexAPI.annualizeTrend(100, 110, 12);
  assert.ok(Math.abs(monthly - (Math.pow(1.01,12)-1)*100) < 1e-9);
  assert.ok(Math.abs(quarterly - (Math.pow(1.03,4)-1)*100) < 1e-9);
  assert.ok(Math.abs(yearly - 10) < 1e-9);
  assert.equal(MoexAPI.annualizeTrend(100, 0, 1), -100);
  assert.equal(MoexAPI.annualizeTrend(0, 100, 1), null);
  assert.equal(MoexAPI.annualizeTrend(100, null, 1), null);
});


test('refreshSixMonth falls back to one-month history and stores annualized trend', async () => {
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-05-31T12:00:00Z'])); }
    static now() { return new Date('2026-05-31T12:00:00Z').getTime(); }
  }
  const requested=[];
  const sandbox={
    navigator:{onLine:true},AbortSignal,Map,Date:FixedDate,
    fetch:async url=>{
      const u=String(url);requested.push(u);
      if(u.includes('/candles.json')){
        const params=new URL(u).searchParams;
        const oneMonth=params.get('from')==='2026-03-18'&&params.get('till')==='2026-04-01';
        return {ok:true,json:async()=>({candles:{columns:['begin','close'],data:oneMonth?[['2026-04-01 00:00:00',100]]:[]}})};
      }
      if(u.includes('/boards.json'))return {ok:true,json:async()=>({boards:{columns:['engine'],data:[]}})};
      return {ok:true,json:async()=>({
        marketdata:{columns:['BOARDID','LAST'],data:[['TQTF',110]]},
        securities:{columns:['FACEVALUE','FACEUNIT','SHORTNAME'],data:[[1,'RUB','Fund']]}
      })};
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('js/moex.js','utf8')+'\nglobalThis.api=MoexAPI;',sandbox);
  const fund={kind:'fund',secid:'TEST_FUND_ONE_MONTH',board:'TQTF'};
  await sandbox.api.refreshSixMonth(fund);
  assert.equal(fund.historyMonths,1);
  assert.equal(fund.historyBase,100);
  assert.equal(fund.historyAnnualPct,(Math.pow(1.1,12)-1)*100);
  assert.ok(Math.abs(fund.sixMonthPct-10)<1e-9);
  assert.equal(fund.yieldMonth,'2026-05');
  assert.equal(requested.filter(x=>x.includes('/candles.json')).length,7);
});
