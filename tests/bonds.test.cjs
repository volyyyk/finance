const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Bonds = require('../js/bonds.js');
const asset = (extra={}) => ({ id:'bond', kind:'bond', qty:2, nominal:1000, lastPrice:950, priceUnit:'rub', accountingFrom:'2026-01-01', purchaseDate:'2025-12-10', maturityDate:'2026-12-01', coupons:[{date:'2026-06-01',value:40},{date:'2026-12-01',value:40}], paidEvents:{}, ...extra });
test('legacy percent quotes are converted; stock and ruble purchase prices stay in rubles', () => {
  assert.equal(Bonds.price(asset({priceUnit:undefined,lastPrice:95})),950);
  assert.equal(Bonds.price(asset({lastPrice:null,avgPrice:965})),965);
  assert.equal(Bonds.price({kind:'stock',lastPrice:250}),250);
});
test('coupon catch-up and principal are credited exactly once; no pre-purchase coupon', () => {
  const a=asset({coupons:[{date:'2025-12-01',value:99},{date:'2026-06-01',value:40},{date:'2026-12-01',value:40}]});
  const p={type:'investment',amount:100,assets:[a]};
  Bonds.settleProduct(p,'2026-06-02');assert.equal(p.amount,180);
  assert.equal(Bonds.settleProduct(p,'2026-06-02'),false);assert.equal(p.amount,180);
  Bonds.settleProduct(p,'2026-12-01');assert.equal(p.amount,2260);assert.equal(Bonds.price(a),0);
  assert.equal(Bonds.settleProduct(p,'2027-01-01'),false);assert.equal(p.amount,2260);
});
test('unknown floating coupon stays unpaid until MOEX publishes its amount', () => {
  const a=asset({coupons:[{date:'2026-06-01',value:null}]});const p={type:'investment',amount:0,assets:[a]};
  Bonds.settleProduct(p,'2026-06-02');assert.equal(p.amount,0);
  a.coupons[0].value=37.15;Bonds.settleProduct(p,'2026-06-03');assert.equal(p.amount,74.3);
  Bonds.settleProduct(p,'2026-06-03');assert.equal(p.amount,74.3);
});
test('record date excludes a purchase after entitlement; existing assets start accounting today', () => {
  const a=asset({purchaseDate:'2026-05-31',coupons:[{date:'2026-06-01',recordDate:'2026-05-30',value:40}]});
  const p={type:'investment',amount:0,assets:[a]};Bonds.settleProduct(p,'2026-06-02');assert.equal(p.amount,0);
  const old=asset({accountingFrom:undefined});const q={type:'investment',amount:0,assets:[old]};
  Bonds.settleProduct(q,'2026-07-01');assert.equal(q.amount,0);assert.equal(old.accountingFrom,'2026-07-01');
});
test('amortization credits principal in parts and reduces stale market valuation', () => {
  const a=asset({moexUpdatedAt:'2026-01-01T12:00:00Z',amortizations:[{date:'2026-06-01',value:400},{date:'2026-12-01',value:600}]});
  const p={type:'investment',amount:0,assets:[a]};Bonds.settleProduct(p,'2026-06-02');
  assert.equal(p.amount,880);assert.equal(Bonds.price(a),570);
  Bonds.settleProduct(p,'2026-12-02');assert.equal(p.amount,2160);assert.equal(Bonds.price(a),0);
});
test('forecast pays by exact dates, retains principal as cash and does not grow bonds at stock rate', () => {
  const sandbox={console,Intl,Date,Utils:{parseDate:s=>new Date(s+'T00:00:00'),dateKey:d=>d.toISOString().slice(0,10)},window:{},Bonds,Config:{TYPES:{investment:{liability:false}}},Storage:{all:()=>[]}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('js/simulator.js','utf8')+'\nglobalThis.sim=Simulator;',sandbox);
  const today=new Date();const m1=new Date(today.getFullYear(),today.getMonth()+1,1);const m2=new Date(today.getFullYear(),today.getMonth()+2,1);
  const date=d=>d.toISOString().slice(0,10);
  const a=asset({accountingFrom:date(today),purchaseDate:'2020-01-01',maturityDate:date(m2),coupons:[{date:date(m1),value:40},{date:date(m2),value:40}]});
  const p={type:'investment',amount:100,rate:100,assets:[a],operations:[]};
  assert.equal(sandbox.sim.portfolioValue(p),2000);
  const h=sandbox.sim.simulateProduct(p,3).history;
  assert.equal(h[1].value,2080);assert.equal(h[2].value,2260);assert.equal(h[3].value,2260);
});
test('MOEX bond price uses face value and security fallback when LAST is empty', async () => {
  const sandbox={navigator:{onLine:true},AbortSignal,Map,Date,fetch:async()=>({ok:true,json:async()=>({marketdata:{columns:['LAST'],data:[[null]]},securities:{columns:['FACEVALUE','PREVPRICE','FACEUNIT'],data:[[1000,95,'RUB']]}})})};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('js/moex.js','utf8')+'\nglobalThis.api=MoexAPI;',sandbox);
  const p=await sandbox.api.lastPrice('TEST','OTHER','bond');assert.equal(p.last,950);assert.equal(p.pricePercent,95);
});
test('MOEX calendar follows cursor pages and retains unknown values', async () => {
  let requests=0;
  const sandbox={navigator:{onLine:true},AbortSignal,Map,Date,fetch:async url=>({ok:true,json:async()=>{
    requests++;const u=new URL(url);const block=u.searchParams.get('iss.only').split(',')[0];const start=Number(u.searchParams.get('start'));
    return {[block]:{columns:[block==='coupons'?'coupondate':'amortdate','value'],data:block==='coupons'?[[`2026-0${start+1}-01`,start===0?null:40]]:[]},[block+'.cursor']:{columns:['TOTAL'],data:[[block==='coupons'?2:0]]}};
  }})};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('js/moex.js','utf8')+'\nglobalThis.api=MoexAPI;',sandbox);
  const c=await sandbox.api.bondCoupons('TEST');assert.equal(c.length,2);assert.equal(c[0].value,null);assert.equal(requests,3);
});

test('MOEX refreshAsset stores a freshness timestamp for stocks and funds', async () => {
  const sandbox = {
    navigator: { onLine: true }, AbortSignal, Map, Date,
    fetch: async () => ({ ok: true, json: async () => ({
      marketdata: { columns: ['LAST'], data: [[123.45]] },
      securities: { columns: ['PREVPRICE', 'FACEVALUE', 'FACEUNIT'], data: [[120, 1000, 'RUB']] }
    }) })
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('js/moex.js', 'utf8') + '\nglobalThis.api=MoexAPI;', sandbox);
  const fund = { kind: 'fund', secid: 'TEST_FUND_TIMESTAMP', board: 'TQTF', lastPrice: 100 };
  await sandbox.api.refreshAsset(fund);
  assert.equal(fund.lastPrice, 123.45);
  assert.ok(Number.isFinite(Date.parse(fund.moexUpdatedAt)), 'timestamp сохранён');
});

test('MOEX six-month history uses the correct month even when today is the 31st', async () => {
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-05-31T12:00:00Z'])); }
    static now() { return new Date('2026-05-31T12:00:00Z').getTime(); }
  }
  let historyUrl = '';
  const sandbox = {
    navigator: { onLine: true }, AbortSignal, Map, Date: FixedDate,
    fetch: async url => {
      if (String(url).includes('/history/')) {
        historyUrl = String(url);
        return { ok: true, json: async () => ({ history: { columns: ['TRADEDATE', 'CLOSE'], data: [['2025-11-01', 100]] } }) };
      }
      return { ok: true, json: async () => ({
        marketdata: { columns: ['LAST'], data: [[110]] },
        securities: { columns: ['PREVPRICE', 'FACEVALUE', 'FACEUNIT'], data: [[100, null, 'RUB']] }
      }) };
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('js/moex.js', 'utf8') + '\nglobalThis.api=MoexAPI;', sandbox);
  const fund = { kind: 'fund', secid: 'TEST_FUND_MONTH_EDGE', board: 'TQTF' };
  await sandbox.api.refreshSixMonth(fund);
  assert.ok(historyUrl.includes('from=2025-10-18') && historyUrl.includes('till=2025-11-01'), historyUrl);
  assert.equal(fund.yieldMonth, '2026-05');
  assert.ok(Math.abs(fund.sixMonthPct - 10) < 1e-9, String(fund.sixMonthPct));
});
