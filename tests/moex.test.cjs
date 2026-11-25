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
