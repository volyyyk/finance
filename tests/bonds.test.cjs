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
function storageSandbox(initial, revision, responses){
  const local = new Map([['fin_v3',JSON.stringify(initial)],['fin_revision',String(revision)]]);
  const writes=[];
  const sandbox={console,Set,JSON,Number,Event,localStorage:{getItem:k=>local.has(k)?local.get(k):null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},navigator:{onLine:true},document:{getElementById:()=>null},window:{dispatchEvent:()=>{}},fetch:async(url,options)=>{
    if(options?.method==='PUT') {writes.push(JSON.parse(options.body));return {ok:true,json:async()=>({revision:revision+1})};}
    return {ok:true,json:async()=>responses.shift()};
  }};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('js/core.js','utf8')+'\nglobalThis.store=Storage;',sandbox);
  return {sandbox,local,writes};
}
test('stats aggregate counts recurring debit card top-ups in monthly and yearly income', () => {
  const sandbox={console,Intl,Date,Utils:{parseDate:s=>new Date(s+'T00:00:00'),dateKey:d=>d.toISOString().slice(0,10)},window:{},Bonds,Config:{TYPES:{debit_card:{liability:false}}},Storage:{all:()=>[{id:'d',type:'debit_card',amount:1000,rate:0,operations:[{direction:'in',amount:5000,frequency:'monthly',date:'2026-01-01'},{direction:'out',amount:1000,frequency:'weekly',date:'2026-01-05'}]}]}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('js/simulator.js','utf8')+'\nglobalThis.stats=Stats;',sandbox);
  const s=sandbox.stats.aggregate();
  assert.equal(s.inc,60000);
  assert.ok(s.exp>=52000&&s.exp<=53000,'weekly withdrawals ~52x1000, got '+s.exp);
  assert.equal(s.netMonthly,(s.inc-s.exp)/12);
  assert.equal(s.assets,1000);
});
test('cloud conflict preserves local pending data and never overwrites on later retries', async()=>{
  const fixture=storageSandbox([{id:'local'}],3,[{products:[{id:'remote'}],revision:4},{products:[{id:'remote'}],revision:4}]);
  fixture.sandbox.store.save([{id:'local-edit'}]);
  await fixture.sandbox.store.sync();await fixture.sandbox.store.sync();
  assert.equal(fixture.writes.length,0);assert.equal(fixture.sandbox.store.all()[0].id,'local-edit');
  assert.equal(fixture.local.get('fin_pending'),'1');
});
test('cloud save sends matching revision and clears the pending marker only after success',async()=>{
  const fixture=storageSandbox([{id:'local'}],3,[{products:[],revision:3}]);
  fixture.sandbox.store.save([{id:'local-edit'}]);await fixture.sandbox.store.sync();
  assert.equal(fixture.writes[0].revision,3);assert.equal(fixture.writes[0].products[0].id,'local-edit');
  assert.equal(fixture.local.has('fin_pending'),false);assert.equal(fixture.local.get('fin_revision'),'4');
});
