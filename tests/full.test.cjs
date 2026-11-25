/* ============================================================================
   full.test.cjs — ультимативный набор: все разделы приложения.
   Запуск: node --test tests/*.test.cjs (входит в общий прогон).

   Разделы:
   1. Config / Utils (core.js)
   2. Storage: CRUD, версия данных, локальное хранилище (core.js)
   3. Облигации: цены, купоны, амортизации, зачёт выплат (bonds.js)
   4. Симулятор и статистика: прогнозы, кэши по версии данных (simulator.js)
   5. Вариабельные тесты: генеративные портфели с фиксированным зерном
   6. Кешбэк: чистая логика (cashback.js → CbLogic)
   7. MOEX: цены, кэш запросов, металлы, облигации (moex.js)
   8. Дашборд и цель: GoalBar, события, сводка (dashboard.js)
   9. Редактор: группировка активов (editor.js)
   10. Уведомления: Android-пути через service worker (notifications.js)
   11. Seed: целостность демонстрационных данных (data/seed.js)
   12. PWA-целостность: sw.js ↔ index.html ↔ манифест
   ========================================================================== */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const Bonds = require('../js/bonds.js');
const CbLogic = require('../js/cashback.js');
const Charts = require('../js/charts.js');

// ----- Детерминированный PRNG (mulberry32): «вариативность» тестов
// воспроизводится от запуска к запуску фиксированным зерном.
function mulberry32(seed){
  return function(){
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dayFromNow = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// ----- Фальшивый DOM-элемент: подходит всем модулям с UI
function fakeEl(id){
  const noop = () => {};
  return {
    id, hidden: false, innerHTML: '', textContent: '', value: '', disabled: false,
    checked: false, open: false, width: 0, height: 0,
    style: {}, dataset: {}, files: [],
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    onclick: null, onchange: null, oninput: null,
    addEventListener: noop, removeEventListener: noop, appendChild: noop,
    removeChild: noop, insertBefore: noop, reset: noop, focus: noop, click: noop,
    setAttribute: noop, scrollIntoView: noop,
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 0, height: 0 }),
    getContext: () => ({
      scale: noop, beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop,
      stroke: noop, fill: noop, clearRect: noop, fillText: noop,
    }),
  };
}

// ----- Песочница vm: как глобальное окно браузера
function makeSandbox(over = {}){
  const sb = {
    console: { log(){}, warn(){}, error(){} },
    Intl, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise,
    setTimeout, clearTimeout, URL, Event, AbortSignal, structuredClone,
    alert(){}, confirm: () => true, prompt: () => null,
    localStorage: {
      _s: new Map(),
      getItem(k){ return this._s.has(String(k)) ? this._s.get(String(k)) : null; },
      setItem(k, v){ this._s.set(String(k), String(v)); },
      removeItem(k){ this._s.delete(String(k)); },
    },
    navigator: { onLine: true, language: 'ru-RU' },
    location: { href: 'https://example.com/finance/index.html' },
    document: {
      _els: {},
      getElementById(id){ if (!this._els[id]) this._els[id] = fakeEl(id); return this._els[id]; },
      querySelector: () => fakeEl('q'),
      querySelectorAll: () => [],
      addEventListener(){},
      documentElement: fakeEl('html'),
      body: fakeEl('body'),
      activeElement: null,
      hidden: false,
    },
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    dispatchEvent(){ return true; }, addEventListener(){}, removeEventListener(){},
    ...over,
  };
  sb.window = sb; // window === globalThis, как в браузере
  vm.createContext(sb);
  return sb;
}

function loadInto(sb, files, exportsExpr){
  const code = files.map(src).join('\n;\n') + '\n;globalThis.__mods = ' + exportsExpr + ';';
  vm.runInContext(code, sb);
  return sb.__mods;
}

// Песочница с реальным ядром: core.js (+ bonds/simulator при необходимости)
function coreMods(over = {}, files = ['js/core.js']){
  const sb = makeSandbox(over);
  const mods = loadInto(sb, files,
    '{Config: typeof Config!=="undefined"?Config:null, Utils: typeof Utils!=="undefined"?Utils:null, ' +
    'Storage: typeof Storage!=="undefined"?Storage:null, Bonds: typeof Bonds!=="undefined"?Bonds:null, ' +
    'Simulator: typeof Simulator!=="undefined"?Simulator:null, Stats: typeof Stats!=="undefined"?Stats:null, ' +
    'Events: typeof Events!=="undefined"?Events:null, Dashboard: typeof Dashboard!=="undefined"?Dashboard:null, ' +
    'GoalBar: typeof GoalBar!=="undefined"?GoalBar:null, Notify: typeof Notify!=="undefined"?Notify:null}');
  return { sb, mods };
}

// ============================================================================
// 1. Config и Utils
// ============================================================================

test('Config.TYPES: полный набор типов с корректными атрибутами', () => {
  const { mods } = coreMods();
  const keys = Object.keys(mods.Config.TYPES).sort();
  assert.deepEqual(keys, ['apartment','credit_card','debit_card','deposit','expense','investment','loan']);
  for (const t of Object.values(mods.Config.TYPES)){
    assert.ok(t.label && t.icon, 'у каждого типа есть подпись и иконка');
    assert.equal(typeof t.liability, 'boolean');
    assert.equal(typeof t.hasEnd, 'boolean');
  }
  assert.deepEqual(Object.keys(mods.Config.FREQUENCIES).sort(), ['monthly','once','weekly','yearly']);
  assert.equal(mods.Config.STORAGE_KEY, 'fin_v3');
});

test('Utils.uid: уникальные id приемлемой длины', () => {
  const { mods } = coreMods();
  const set = new Set();
  for (let i = 0; i < 1000; i++){
    const id = mods.Utils.uid();
    assert.ok(id.length >= 6, 'длина id: ' + id);
    set.add(id);
  }
  assert.equal(set.size, 1000, 'все id уникальны');
});

test('Utils.parseDate/dateKey: обратный круг, включая границы месяца', () => {
  const { mods } = coreMods();
  const cases = ['2026-01-01','2026-02-28','2024-02-29','2026-12-31','2026-11-04'];
  for (const c of cases){
    assert.equal(mods.Utils.dateKey(mods.Utils.parseDate(c)), c);
  }
  assert.equal(mods.Utils.parseDate(null), null);
  assert.equal(mods.Utils.parseDate(''), null);
  assert.equal(mods.Utils.parseDate('мусор'), null, 'нечисловые части даты отбрасываются');
});

test('Utils.fmtMoney/fmtPct/fmtDate: формат детерминирован', () => {
  const { mods } = coreMods();
  const m = mods.Utils.fmtMoney(123456.7);
  assert.ok(m.includes('₽'), 'символ валюты: ' + m);
  assert.ok(!m.includes(',') && !m.includes('.'), 'без копеек: ' + m);
  assert.equal(mods.Utils.fmtPct(12.345), '+12.35%');
  assert.equal(mods.Utils.fmtPct(-1), '-1.00%');
  assert.equal(mods.Utils.fmtDate('2026-01-05'), '05.01.2026');
  assert.equal(mods.Utils.fmtDate(null), '—');
});

test('Utils.escapeHtml: экранируются все спецсимволы', () => {
  const { mods } = coreMods();
  const out = mods.Utils.escapeHtml('<b class="x">&\'текст\'</b>');
  assert.ok(!/[<>"']/.test(out.replace(/&#39;|&quot;/g,'')), 'сырых спецсимволов нет: ' + out);
  assert.ok(out.includes('&lt;') && out.includes('&amp;'));
});

// ============================================================================
// 2. Storage: CRUD и версия данных
// ============================================================================

test('Storage: save/load/upsert/remove/clear работают корректно', () => {
  const { mods } = coreMods();
  const st = mods.Storage;
  assert.equal(typeof st.sync, 'undefined', 'облачный API удалён из локальной версии');
  assert.equal(typeof st.useRemote, 'undefined', 'облачная загрузка удалена');
  assert.equal(st.all().length, 0, 'пустое хранилище в начале');
  st.save([{ id: 'a', type: 'deposit' }]);
  assert.equal(st.all().length, 1);
  st.upsert({ id: 'a', type: 'deposit', amount: 100 });       // замена по id
  st.upsert({ id: 'b', type: 'expense', amount: 5 });          // добавление
  assert.equal(st.all().length, 2);
  assert.equal(st.get('a').amount, 100);
  st.remove(['a', 'неточный-id']);
  assert.equal(st.all().length, 1);
  assert.equal(st.all()[0].id, 'b');
  st.clear();
  assert.equal(st.all().length, 0);
  assert.equal(st.get('нет'), null);
});

test('Storage.version: растёт при каждом изменении и служит ключом кэшей', () => {
  const { mods } = coreMods();
  const st = mods.Storage;
  const v0 = st.version();
  st.save([{ id: 'a' }]);
  const v1 = st.version();
  st.upsert({ id: 'b' });
  const v2 = st.version();
  st.remove(['a']);
  const v3 = st.version();
  st.replaceAll([{ id: 'c' }, { id: 'd' }]);
  const v4 = st.version();
  assert.ok(v1 > v0 && v2 > v1 && v3 > v2 && v4 > v3, `версии строго растут: ${v0},${v1},${v2},${v3},${v4}`);
});

test('Storage.loadFromSeed: загружает window.SEED_DATA и поднимает версию', () => {
  const sb = makeSandbox();
  sb.SEED_DATA = [{ id: 'demo-1' }, { id: 'demo-2' }];
  const mods = loadInto(sb, ['js/core.js'], '{Storage}');
  assert.equal(mods.Storage.loadFromSeed(), true);
  assert.equal(mods.Storage.all().length, 2);
  assert.equal(mods.Storage.hasData(), true);
  assert.ok(mods.Storage.version() > 0);
  // повторная загрузка не должна терять данные
  mods.Storage.loadFromSeed();
  assert.equal(mods.Storage.all().length, 2);
});

// ============================================================================
// 3. Облигации
// ============================================================================

const bondAsset = (extra = {}) => ({
  id: 'b1', kind: 'bond', secid: 'RU000A105SD4', qty: 10, nominal: 1000,
  lastPrice: 980, priceUnit: 'rub', accountingFrom: '2026-01-01',
  purchaseDate: '2025-12-10', maturityDate: '2026-12-01',
  coupons: [{ date: '2026-06-01', value: 40 }, { date: '2026-12-01', value: 40 }],
  paidEvents: {}, ...extra,
});

test('Bonds.payments: объединяет купоны и амортизации, сортирует по датам', () => {
  const a = bondAsset({ amortizations: [{ date: '2026-03-01', value: 300 }] });
  const pays = Bonds.payments(a);
  assert.deepEqual(pays.map(p => p.date), ['2026-03-01','2026-06-01','2026-12-01','2026-12-01']);
  assert.equal(pays[0].type, 'principal');
  assert.equal(pays[0].value, 300);
  assert.equal(pays[1].type, 'coupon');
  assert.equal(pays[1].key, 'coupon:2026-06-01');
  // купон в день погашения платится вместе с номиналом — два события на одну дату
  assert.equal(pays[2].type, 'coupon');
  assert.equal(pays[2].key, 'coupon:2026-12-01');
  // погашение в дату maturity без дубля амортизации и с вычетом ранних частей
  assert.equal(pays[3].value, 700, 'номинал минус амортизации: 1000 − 300');
  assert.equal(pays[3].key, 'principal:2026-12-01');
});

test('Bonds.payments: до даты начала учёта и после погашения ничего не начисляется', () => {
  assert.equal(Bonds.payments(bondAsset({ accountingFrom: '2027-01-01' })).length, 0);
  assert.equal(Bonds.payments({ kind: 'stock' }).length, 0);
  const a = bondAsset();
  a.coupons.push({ date: '2027-06-01', value: 40 }); // после погашения
  assert.ok(Bonds.payments(a).every(p => p.date <= '2026-12-01'));
});

test('Bonds.price: проценты конвертируются, зачтённый долг снижает цену, redeemed = 0', () => {
  assert.equal(Bonds.price(bondAsset({ priceUnit: undefined, lastPrice: 95 })), 950);
  assert.equal(Bonds.price(bondAsset({ lastPrice: null, avgPrice: 965 })), 965);
  const a = bondAsset({
    moexUpdatedAt: '2026-01-01T00:00:00Z',
    paidEvents: { 'principal:2026-03-01': { type: 'principal', date: '2026-03-01', amount: 3000 } },
  });
  assert.equal(Bonds.price(a), 980 * (1 - 3000 / 10 / 1000), 'вычтена амортизация после котировки');
  assert.equal(Bonds.price(bondAsset({ redeemed: true })), 0);
});

test('Bonds.futurePayments: окно (from, to], пропускает null и зачтённое', () => {
  const a = bondAsset({ coupons: [{ date: '2026-06-01', value: null }, { date: '2026-06-15', value: 40 }],
    amortizations: [{ date: '2026-06-10', value: 300 }] });
  const win = Bonds.futurePayments(a, '2026-06-01', '2026-06-15');
  assert.equal(win.length, 2);
  assert.ok(win.every(p => p.date > '2026-06-01' && p.date <= '2026-06-15'));
  a.paidEvents['principal:2026-06-10'] = { date: '2026-06-10', amount: 3000, type: 'principal' };
  assert.equal(Bonds.futurePayments(a, '2026-06-01', '2026-06-15').length, 1);
});

test('Bonds.settleProduct: отрицательные и NaN суммы не зачисляются, погашение ставит redeemed', () => {
  const a = bondAsset({
    coupons: [{ date: '2026-06-01', value: -5 }, { date: '2026-06-02', value: NaN }],
    amortizations: [], maturityDate: null,
  });
  const p = { type: 'investment', amount: 0, assets: [a] };
  assert.equal(Bonds.settleProduct(p, '2026-06-05'), false, 'отрицательный и NaN купоны игнорируются');
  assert.equal(p.amount, 0);
  // теперь валидный купон и погашение в дату maturity
  a.coupons = [{ date: '2026-06-01', value: 40 }];
  a.maturityDate = '2026-06-03';
  assert.equal(Bonds.settleProduct(p, '2026-06-05'), true);
  assert.equal(p.amount, 400 + 10000, 'купон 40×10 + погашение 1000×10');
  assert.equal(a.redeemed, true, 'после погашения актив закрыт');
  assert.equal(Bonds.settleProduct(p, '2026-06-06'), false, 'повторный зачёт ничего не меняет');
  assert.equal(Bonds.settleProduct({ type: 'deposit' }, '2026-06-06'), false, 'не-инвестиции не трогаются');
});

test('Bonds.settleAll: зачисляет ровно один раз и поднимает версию данных', () => {
  const sb = makeSandbox();
  sb.localStorage.setItem('fin_v3', JSON.stringify([{
    id: 'inv', type: 'investment', amount: 0, rate: 0,
    assets: [bondAsset({
      coupons: [{ date: dayFromNow(-3), value: 40 }],
      amortizations: [], maturityDate: null,
    })],
  }]));
  const mods = loadInto(sb, ['js/core.js', 'js/bonds.js'], '{Storage, Bonds}');
  const v0 = mods.Storage.version();
  mods.Bonds.settleAll();
  const p = mods.Storage.get('inv');
  assert.equal(p.amount, 400, '10 шт × 40 ₽ зачислены');
  assert.ok(mods.Storage.version() > v0, 'версия выросла — кэши сбросятся');
  mods.Bonds.settleAll();
  assert.equal(mods.Storage.get('inv').amount, 400, 'повторный зачёт ничего не меняет');
});

// ============================================================================
// 4. Симулятор и статистика: прогнозы + кэши по версии данных
// ============================================================================

function simMods(products){
  const sb = makeSandbox();
  if (products) sb.localStorage.setItem('fin_v3', JSON.stringify(products));
  const mods = loadInto(sb, ['js/core.js', 'js/bonds.js', 'js/simulator.js'], '{Storage, Simulator, Stats}');
  return { sb, mods };
}

test('Stats.aggregate: мемоизация возвращает тот же объект до изменения данных', () => {
  const { mods } = simMods([{ id: 'd1', type: 'deposit', amount: 400000, rate: 75, operations: [] }]);
  const s1 = mods.Stats.aggregate();
  const s2 = mods.Stats.aggregate();
  assert.equal(s1, s2, 'без изменения данных сводка берётся из кэша');
  assert.equal(s1.assets, 400000);
  assert.equal(s1.inc, 300000);
  assert.equal(s1.netMonthly, 25000);
  mods.Storage.save(mods.Storage.all()); // данные «изменились»
  const s3 = mods.Stats.aggregate();
  assert.notEqual(s1, s3, 'после сохранения кэш пересчитан');
  assert.deepEqual(s3, s1, 'значения при этом те же');
});

test('Stats.aggregate: без поддержки version() кэша нет — данные свежие', () => {
  const sb = {
    console, Intl, Date, Math, JSON, Number, Set, window: {},
    Utils: { parseDate: s => new Date(s + 'T00:00:00'), dateKey: d => d.toISOString().slice(0, 10) },
    Bonds, Config: { TYPES: { deposit: { liability: false } } },
    Storage: { all: () => [{ id: 'x', type: 'deposit', amount: 1, rate: 0, operations: [] }] },
  };
  vm.createContext(sb);
  vm.runInContext(src('js/simulator.js') + '\n;globalThis.Stats_ref = Stats;', sb);
  const a1 = sb.Stats_ref.aggregate();
  sb.Storage.all = () => [{ id: 'x', type: 'deposit', amount: 2, rate: 0, operations: [] }];
  const a2 = sb.Stats_ref.aggregate();
  assert.notEqual(a1.assets, a2.assets, 'подмена данных видна сразу (кэш выключен)');
});

test('Simulator.simulateAll: срез короткого горизонта совпадает с длинным', () => {
  const { mods } = simMods([
    { id: 'dep', type: 'deposit', amount: 100000, rate: 10, operations: [] },
    { id: 'exp', type: 'expense', amount: 5000, operations: [], startDate: dayFromNow(-30) },
  ]);
  const big = mods.Simulator.simulateAll(120);
  assert.ok(big.dep.history.length === 121, 'история 121 точка');
  const small = mods.Simulator.simulateAll(12);
  assert.equal(small.dep.history.length, 13, 'срез 12 месяцев');
  for (let m = 0; m <= 12; m++){
    assert.equal(small.dep.history[m].value, big.dep.history[m].value, `месяц ${m} совпадает`);
  }
  assert.equal(small.dep.endValue, big.dep.history[12].value, 'endValue = значение на горизонте');
});

test('Simulator.simulateAll: после сохранения кэш пересчитывается и остаётся согласованным', () => {
  const { mods } = simMods([{ id: 'dep', type: 'deposit', amount: 50000, rate: 12, operations: [] }]);
  const first = mods.Simulator.simulateAll(60);
  mods.Storage.save([{ id: 'dep', type: 'deposit', amount: 60000, rate: 12, operations: [] }]);
  const second = mods.Simulator.simulateAll(12);
  assert.equal(second.dep.history[0].value, 60000, 'новая сумма учтена');
  assert.notEqual(second.dep.history[12].value, first.dep.history[12].value);
  const fresh12 = mods.Simulator.simulateAll(12);
  assert.equal(fresh12.dep.history[12].value, second.dep.history[12].value, 'детерминированность');
});

test('Simulator.simulateAll: пустое хранилище → пустой результат без ошибок', () => {
  const { mods } = simMods([]);
  assert.equal(Object.keys(mods.Simulator.simulateAll(24)).length, 0);
});

test('Simulator.simulateProduct: проценты вклада капитализируются помесячно', () => {
  const { mods } = simMods([]);
  const p = { id: 'd', type: 'deposit', amount: 100000, rate: 12, operations: [] };
  const h = mods.Simulator.simulateProduct(p, 12).history;
  assert.equal(h.length, 13);
  for (let m = 1; m <= 12; m++){
    const expected = h[m - 1].value * (1 + 0.12 / 12);
    assert.ok(Math.abs(h[m].value - expected) < 1e-6, `месяц ${m}`);
  }
});

test('Simulator: перевод (transfer) в конце срока добавляет сумму целику в нужном месяце', () => {
  const { mods } = simMods([
    { id: 'src', type: 'deposit', amount: 10000, rate: 0, endDate: dayFromNow(45),
      endActions: [{ type: 'transfer', targetId: 'dst' }], operations: [] },
    { id: 'dst', type: 'deposit', amount: 0, rate: 0, operations: [] },
  ]);
  const res = mods.Simulator.simulateAll(3);
  const bump = res.dst.history.find(h => h.value > 0);
  assert.ok(bump && bump.month >= 1, 'получатель получил перевод в течение 3 месяцев');
});

test('Simulator: операция «платёж по долгу» уменьшает долг кредитки, а не баланс', () => {
  // Раньше такой платёж списывался с дебетовой карты, а долг кредитки
  // оставался прежним — деньги «списывались» дважды.
  const { mods } = simMods([
    { id: 'dbt', type: 'debit_card', name: 'Дебетовая', amount: 50000, rate: 0, operations: [
      { id: 'o1', direction: 'out', amount: 10000, frequency: 'monthly',
        date: dayFromNow(-5), endDate: null, debtTargetId: 'cc' } ] },
    { id: 'cc', type: 'credit_card', name: 'Кредитка', amount: 100000, rate: 0,
      limit: 205000, gracePeriodEndDate: dayFromNow(20), operations: [] },
  ]);
  const res = mods.Simulator.simulateAll(12);
  // деньги уходят с дебетовой карты…
  assert.ok(Math.abs(res.dbt.history[1].value - 40000) < 1e-9,
    'с дебетовой списано 10 000: ' + res.dbt.history[1].value);
  // …и ровно на столько же уменьшается долг кредитки
  assert.ok(Math.abs(res.cc.history[1].value - 90000) < 1e-9,
    'долг кредитки уменьшился до 90 000: ' + res.cc.history[1].value);
  // чистый баланс в месяц платежа не меняется — перевода хватит один раз
  const net0 = 50000 - 100000;
  const net1 = res.dbt.history[1].value - res.cc.history[1].value;
  assert.ok(Math.abs(net1 - net0) < 1e-9, 'двойного списания нет: ' + net0 + ' → ' + net1);
  // платёж — не расход: в сводку расходов он не попадает
  assert.equal(res.dbt.history[1].cumExpense, 0, 'платёж по долгу не считается расходом');
  // через 10 месяцев долг закрыт и в минус не уходит
  assert.equal(res.cc.history[10].value, 0, 'долг выплачен за 10 месяцев');
  assert.equal(res.cc.history[12].value, 0, 'дальше долг не уходит в минус');
  // без пометки (обычное снятие) долг кредитки не меняется
  const plain = simMods([
    { id: 'dbt', type: 'debit_card', name: 'Дебетовая', amount: 50000, rate: 0, operations: [
      { id: 'o1', direction: 'out', amount: 10000, frequency: 'monthly', date: dayFromNow(-5) } ] },
    { id: 'cc', type: 'credit_card', name: 'Кредитка', amount: 100000, rate: 0, operations: [] },
  ]);
  const res2 = plain.mods.Simulator.simulateAll(12);
  assert.equal(res2.cc.history[12].value, 100000, 'без пометки долг не уменьшается');
  assert.ok(res2.dbt.history[1].cumExpense > 0, 'обычное снятие — расход');
});

test('Stats: операция «платёж по долгу» — перевод, не расход и не доход', () => {
  const { mods } = simMods([
    { id: 'dbt', type: 'debit_card', name: 'Дебетовая', amount: 50000, rate: 0, operations: [
      { id: 'o1', direction: 'out', amount: 10000, frequency: 'monthly',
        date: dayFromNow(-5), debtTargetId: 'cc' } ] },
    { id: 'cc', type: 'credit_card', name: 'Кредитка', amount: 100000, rate: 0, operations: [] },
  ]);
  const s = mods.Stats.aggregate();
  assert.equal(s.exp, 0, 'платёж по долгу не увеличивает годовой расход');
  assert.equal(s.inc, 0, 'и не считается доходом');
  assert.equal(s.assets, 50000);
  assert.equal(s.debts, 100000);
  assert.equal(s.net, -50000);
});

// ============================================================================
// 5. Вариабельные тесты: генеративные портфели с фиксированным зерном
// ============================================================================

test('ВАРИАТИВНОСТЬ: 30 случайных портфелей — инварианты статистики и симуляции', () => {
  const rnd = mulberry32(20261104);
  const TYPES = ['deposit','debit_card','credit_card','loan','expense','investment'];
  const KINDS = ['stock','bond','fund','metal'];
  for (let iter = 0; iter < 30; iter++){
    const products = [];
    const n = 1 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++){
      const type = TYPES[Math.floor(rnd() * TYPES.length)];
      const p = {
        id: 'p' + iter + '_' + i, type,
        name: 'Продукт <' + i + '> & "тест"',
        amount: Math.round(rnd() * 1e6) / 10,
        rate: Math.round(rnd() * 30),
        startDate: dayFromNow(-Math.floor(rnd() * 700)),
        endDate: rnd() < 0.5 ? dayFromNow(Math.floor(rnd() * 400)) : null,
        operations: [],
      };
      const ops = Math.floor(rnd() * 3);
      for (let o = 0; o < ops; o++){
        p.operations.push({
          id: 'op' + o,
          direction: rnd() < 0.5 ? 'in' : 'out',
          amount: Math.round(rnd() * 50000) + 1,
          frequency: ['once','weekly','monthly','yearly'][Math.floor(rnd() * 4)],
          date: dayFromNow(-Math.floor(rnd() * 700)),
        });
      }
      if (type === 'investment'){
        p.assets = [];
        const k = Math.floor(rnd() * 4);
        for (let a = 0; a < k; a++){
          const asset = {
            id: 'a' + a, kind: KINDS[Math.floor(rnd() * KINDS.length)],
            secid: 'SEC' + a, qty: Math.floor(rnd() * 100) + 1,
            lastPrice: Math.round(rnd() * 1000), priceUnit: 'rub',
            accountingFrom: dayFromNow(-Math.floor(rnd() * 200)),
            purchaseDate: dayFromNow(-Math.floor(rnd() * 300)), paidEvents: {},
          };
          if (asset.kind === 'bond'){
            asset.nominal = 1000;
            asset.maturityDate = dayFromNow(Math.floor(rnd() * 365));
            asset.coupons = [{ date: dayFromNow(10 + Math.floor(rnd() * 90)), value: 25 + rnd() * 25 }];
          }
          if (asset.kind === 'fund' || asset.kind === 'metal') asset.sixMonthPct = (rnd() - 0.5) * 40;
          p.assets.push(asset);
        }
      }
      products.push(p);
    }

    const { mods } = simMods(products);

    // Инвариант 1: net = активы − долги, посчитанные напрямую
    const s = mods.Stats.aggregate();
    let assets = 0, debts = 0;
    for (const p of products){
      if (p.type === 'expense') continue;
      if (p.type === 'investment'){
        const v = mods.Simulator.portfolioValue(p);
        assets += v;
        continue;
      }
      const isL = p.type === 'credit_card' || p.type === 'loan';
      if (isL) debts += p.amount || 0; else assets += p.amount || 0;
    }
    assert.ok(Math.abs(s.assets - assets) < 1e-6, `#${iter} активы`);
    assert.ok(Math.abs(s.debts - debts) < 1e-6, `#${iter} долги`);
    assert.ok(Math.abs(s.net - (assets - debts)) < 1e-6, `#${iter} чистый баланс`);
    assert.equal(s.netAnnual, s.inc - s.exp);
    assert.equal(s.netMonthly, s.netAnnual / 12);

    // Инвариант 2: у каждой истории ровно months+1 точка, старт = текущая стоимость
    const res = mods.Simulator.simulateAll(6);
    for (const p of products){
      assert.equal(res[p.id].history.length, 7, `#${iter} длина истории ${p.id}`);
      const startVal = p.type === 'expense' ? 0
        : (p.type === 'investment' ? mods.Simulator.portfolioValue(p) : (p.amount || 0));
      assert.ok(Math.abs(res[p.id].history[0].value - startVal) < 1e-6, `#${iter} старт ${p.id}`);
    }

    // Инвариант 3: версии данных согласованы — кэш не выдаёт прошлых значений
    const ref = mods.Stats.aggregate();
    mods.Storage.save(mods.Storage.all());
    assert.notEqual(mods.Stats.aggregate(), ref, `#${iter} кэш сброшен после сохранения`);
    assert.deepEqual(mods.Stats.aggregate(), ref, `#${iter} значения после сброса те же`);

    // Инвариант 4: сериализация стабильна (id уникальны, JSON круглый)
    const json = JSON.parse(JSON.stringify(mods.Storage.all()));
    assert.deepEqual(json, mods.Storage.all());
  }
});

test('ВАРИАТИВНОСТЬ: случайные операции — события отсортированы и не в прошлом', () => {
  const rnd = mulberry32(777);
  const { sb, mods } = coreMods({}, ['js/core.js', 'js/bonds.js', 'js/simulator.js', 'js/dashboard.js']);
  const products = [];
  for (let i = 0; i < 12; i++){
    products.push({
      id: 'v' + i,
      type: ['deposit','expense','investment','loan'][i % 4],
      name: 'Портфель ' + i,
      amount: 1000 * (i + 1),
      rate: 5,
      startDate: dayFromNow(-100 - i),
      endDate: rnd() < 0.5 ? dayFromNow(30 + i * 10) : null,
      operations: [{
        id: 'o' + i, direction: i % 2 ? 'in' : 'out',
        amount: 100 * (i + 1),
        frequency: ['monthly','weekly','yearly','once'][i % 4],
        date: dayFromNow(-i * 3),
      }],
      assets: i % 4 === 2 ? [{
        id: 'ba' + i, kind: 'bond', secid: 'BND' + i, qty: 2, nominal: 1000,
        lastPrice: 990, priceUnit: 'rub', accountingFrom: dayFromNow(-50),
        maturityDate: dayFromNow(60), paidEvents: {},
        coupons: [{ date: dayFromNow(7 + i), value: 30 }],
      }] : [],
    });
  }
  sb.localStorage.setItem('fin_v3', JSON.stringify(products));
  const evs = mods.Events.all();
  assert.ok(evs.length >= 6, 'события есть: ' + evs.length);
  const today0 = new Date(); today0.setHours(0,0,0,0);
  for (let i = 1; i < evs.length; i++){
    assert.ok(evs[i - 1].date <= evs[i].date, 'список отсортирован по датам');
  }
  assert.ok(evs.every(e => e.date >= today0), 'все события не в прошлом');
  // Мемоизация: до изменения данных возвращается тот же список
  const again = mods.Events.all();
  assert.equal(again, evs, 'кэш событий по версии данных');
  mods.Storage.save(mods.Storage.all());
  assert.notEqual(mods.Events.all(), evs, 'после сохранения список пересобран');
});

// ============================================================================
// 6. Кешбэк: чистая логика (CbLogic)
// ============================================================================

const cbBank = (id, name, cats) => ({ id, name, cats });

test('CbLogic.monthKey: нулевое дополнение месяца', () => {
  assert.equal(CbLogic.monthKey(new Date(2026, 0, 15)), '2026-01');
  assert.equal(CbLogic.monthKey(new Date(2026, 10, 3)), '2026-11');
});

test('CbLogic.normalize: только текущий месяц, чистка пустых записей', () => {
  const data = {
    month: '2026-10', banks: [
      cbBank('b1', '  Банк 1 ', [
        { id: 'c1', name: ' Кафе ', sub: null, value: '5' },
        { id: '', name: 'мусор', value: 1 },
        { id: 'c2', name: '', value: 1 },
      ]),
      null,
      { id: 'b2', name: 'Банк 2', cats: 'не массив' },
    ],
  };
  const norm = CbLogic.normalize(data, '2026-11');
  assert.equal(norm.month, '2026-11');
  assert.equal(norm.banks.length, 0, 'месяц не совпал — данные очищены');
  const same = CbLogic.normalize(data, '2026-10');
  assert.equal(same.banks.length, 2);
  assert.equal(same.banks[0].name, 'Банк 1');
  assert.equal(same.banks[0].cats.length, 1);
  assert.equal(same.banks[0].cats[0].value, 5);
  assert.equal(CbLogic.normalize(null, '2026-11').banks.length, 0);
  assert.equal(same.banks[1].cats.length, 0, 'банк с невалидными cats сохранён с пустым списком');
});

test('CbLogic.groupByCategory: лучший кешбэк без подкатегории, до 3 подкатегорий', () => {
  const banks = [
    cbBank('b1', 'Альфа', [
      { id: 'c1', name: 'Кафе', sub: null, value: 5 },
      { id: 'c2', name: 'Кафе', sub: 'кофейни', value: 7 },
      { id: 'c3', name: 'Кафе', sub: 'фастфуд', value: 3 },
    ]),
    cbBank('b2', 'Бета', [
      { id: 'c4', name: 'Кафе', sub: null, value: 6 },
      { id: 'c5', name: 'Такси', sub: null, value: 10 },
    ]),
  ];
  const groups = CbLogic.groupByCategory(banks);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].name, 'Такси', 'первой идёт категория с максимальным кешбэком');
  assert.equal(groups[0].top.value, 10);
  const cafe = groups.find(g => g.name === 'Кафе');
  assert.equal(cafe.top.bankName, 'Бета', 'лучший кешбэк без подкатегории: 6%');
  assert.equal(cafe.subs.length, 2);
  assert.deepEqual(cafe.subs.map(s => s.value), [7, 3], 'подкатегории отсортированы по убыванию');
});

test('CbLogic.groupByCategory: при равенстве выше банк по алфавиту (ru)', () => {
  const banks = [
    cbBank('b2', 'Яндекс', [{ id: 'c1', name: 'Аптеки', sub: null, value: 5 }]),
    cbBank('b1', 'Альфа', [{ id: 'c2', name: 'Аптеки', sub: null, value: 5 }]),
  ];
  assert.equal(CbLogic.groupByCategory(banks)[0].top.bankName, 'Альфа');
});

test('CbLogic.groupByCategory: не больше трёх подкатегорий', () => {
  const cats = [1,2,3,4,5].map(i => ({ id: 's' + i, name: 'Супермаркеты', sub: 'вид ' + i, value: i }));
  const groups = CbLogic.groupByCategory([cbBank('b', 'Банк', cats)]);
  assert.equal(groups[0].subs.length, 3);
  assert.deepEqual(groups[0].subs.map(s => s.value), [5, 4, 3]);
});

test('CbLogic.allByBank: пустые банки отбрасываются, сортировка по имени', () => {
  const out = CbLogic.allByBank([
    cbBank('b2', 'Юнион', []),
    cbBank('b1', 'Бета', [{ id: 'c1', name: 'Кафе', sub: null, value: 5 }]),
    cbBank('b0', 'Альфа', [{ id: 'c2', name: 'Такси', sub: null, value: 1 }]),
  ]);
  assert.deepEqual(out.map(g => g.bankName), ['Альфа', 'Бета']);
  assert.deepEqual(out[0].entries[0].catName, 'Такси');
});

test('CbLogic.allByCategory: категории по алфавиту, записи по убыванию', () => {
  const out = CbLogic.allByCategory([
    cbBank('b1', 'А', [{ id: 'c1', name: 'Я Categories', sub: null, value: 1 }, { id: 'c2', name: 'Аптеки', sub: null, value: 9 }]),
    cbBank('b2', 'Б', [{ id: 'c3', name: 'Аптеки', sub: null, value: 5 }]),
  ]);
  assert.deepEqual(out.map(g => g.name), ['Аптеки', 'Я Categories']);
  assert.deepEqual(out[0].entries.map(e => e.value), [9, 5]);
  assert.deepEqual(out[0].entries.map(e => e.bankName), ['А', 'Б']);
});

test('CbLogic.entriesAll: плоский список с полями банка', () => {
  const entries = CbLogic.entriesAll([cbBank('b1', 'Альфа', [{ id: 'c1', name: 'Кафе', sub: 'кофейни', value: 7 }])]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].bankId, 'b1');
  assert.equal(entries[0].bankName, 'Альфа');
  assert.equal(entries[0].sub, 'кофейни');
});

test('CbLogic.dict: добавление, регистронезависимый дубликат, удаление независимо', () => {
  let dict = CbLogic.normalizeDict(null);
  dict = CbLogic.dictAdd(dict, 'bank', 'Сбер');
  dict = CbLogic.dictAdd(dict, 'bank', 'сбер');
  dict = CbLogic.dictAdd(dict, 'bank', '   ');
  dict = CbLogic.dictAdd(dict, 'cat', 'Кафе');
  assert.equal(dict.banks.length, 1, 'дубликат по регистру не добавлен');
  assert.equal(dict.cats.length, 1);
  dict = CbLogic.dictRemove(dict, 'bank', dict.banks[0].id);
  assert.equal(dict.banks.length, 0);
  assert.equal(dict.cats.length, 1, 'категории не тронуты');
});

test('CbLogic.groupLevel + бегущая строка: цвет по основной категории, длинные подписи читаются', () => {
  // Цвет категории определяется процентом основной строки, а не максимумом
  // с подкатегориями (раньше из-за смешения типов всё было «случайным»)
  const g = (top, subs) => ({ top, subs: subs || [] });
  assert.equal(CbLogic.groupLevel(g({ value: 3 }, [{ value: 12 }])), 'mid',
    'основная 3% — жёлтый, подкатегория не перекрашивает');
  assert.equal(CbLogic.groupLevel(g({ value: 10 })), 'high', '10% — зелёный');
  assert.equal(CbLogic.groupLevel(g(null, [{ value: 4 }])), 'mid', 'без основной — лучшая подкатегория');
  // Длинный «банк · подкатегория» плавно прокручивается по кругу
  const cb = src('js/cashback.js');
  assert.ok(cb.includes('cb-marquee'), 'класс бегущей строки подключается');
  assert.ok(cb.includes('cb-track'), 'трек с двумя копиями подписи');
  const css = src('styles.css');
  assert.ok(css.includes('@keyframes cb-slide'), 'анимация прокрутки в CSS');
  assert.ok(/\.op-row\{[^}]*flex-wrap:wrap/.test(css),
    'строки активов переносятся — кнопка видна на телефоне');
});

// ============================================================================
// 7. MOEX: цены, кэш запросов, металлы, облигации
// ============================================================================

function moexSandbox(fetchImpl){
  const sb = {
    navigator: { onLine: true }, AbortSignal, Map, Date, console,
    fetch: fetchImpl,
  };
  vm.createContext(sb);
  vm.runInContext(src('js/moex.js') + '\n;globalThis.api = MoexAPI;', sb);
  return sb;
}

test('MoexAPI: повторный запрос цены берётся из кэша (один fetch)', async () => {
  let calls = 0;
  const sb = moexSandbox(async () => {
    calls++;
    return { ok: true, json: async () => ({
      marketdata: { columns: ['LAST'], data: [[100]] },
      securities: { columns: ['FACEVALUE','PREVPRICE','FACEUNIT'], data: [[null, null, 'RUB']] },
    }) };
  });
  const p1 = await sb.api.lastPrice('SBER','TQBR','stock');
  const p2 = await sb.api.lastPrice('SBER','TQBR','stock');
  assert.equal(calls, 1, 'второй вызов обслужен кэшем');
  assert.equal(p1.last, 100);
  assert.equal(p2.last, 100);
});

test('MoexAPI.refreshAsset: котировка металла — руб. за грамм, без пересчёта из унции', async () => {
  const sb = moexSandbox(async () => ({ ok: true, json: async () => ({
    marketdata: { columns: ['LAST'], data: [[10903]] },
    securities: { columns: ['FACEVALUE'], data: [[null]] },
  }) }));
  const asset = { kind: 'metal', secid: 'GLDRUB_TOM', board: 'SGLT' };
  await sb.api.refreshAsset(asset);
  assert.equal(asset.lastPrice, 10903, 'котировка MOEX уже за грамм — делить на унцию нельзя');
  assert.ok(Math.abs(asset.ouncePrice - 10903 * 31.1034768) < 1e-6, 'унция — справочная цена');
  assert.equal(asset.unit, 'gram');
});

test('MoexAPI.refreshSixMonth: доходность металла без искажения унцией', async () => {
  const sb = moexSandbox(async (url) => {
    if (url.includes('/history/')){
      return { ok: true, json: async () => ({
        history: { columns: ['TRADEDATE','CLOSE'], data: [['2026-05-30', 9800]] },
      }) };
    }
    return { ok: true, json: async () => ({
      marketdata: { columns: ['LAST'], data: [[10903]] },
      securities: { columns: ['FACEVALUE'], data: [[null]] },
    }) };
  });
  const asset = { kind: 'metal', secid: 'GLDRUB_TOM', board: 'SGLT' };
  await sb.api.refreshSixMonth(asset);
  assert.equal(asset.sixMonthBase, 9800, 'история CLOSE — в рублях за грамм');
  assert.ok(Math.abs(asset.sixMonthPct - (10903 / 9800 - 1) * 100) < 1e-6,
    'доходность: ' + asset.sixMonthPct);
  assert.equal(asset.lastPrice, 10903, 'текущая цена за грамм');
});

test('MoexAPI.refreshAsset: облигация обогащается данными, пустая котировка не затирает цену', async () => {
  const sb = moexSandbox(async (url) => {
    if (url.includes('bondization')){
      return { ok: true, json: async () => ({
        coupons: { columns: ['coupondate','value_rub','valueprc','startdate','recorddate'], data: [] },
        'coupons.cursor': { columns: ['TOTAL'], data: [[0]] },
        amortizations: { columns: ['amortdate','value'], data: [] },
        'amortizations.cursor': { columns: ['TOTAL'], data: [[0]] },
      }) };
    }
    if (url.includes('/engines/')){
      return { ok: true, json: async () => ({
        marketdata: { columns: ['LAST'], data: [[null]] },
        securities: { columns: ['FACEVALUE','PREVPRICE','FACEUNIT','ACCRUEDINT','MATDATE'], data: [[1000, 95, 'RUB', 12, '2027-06-01']] },
      }) };
    }
    return { ok: true, json: async () => ({
      description: { columns: ['name','value'], data: [
        ['FACEVALUE','1000'], ['MATDATE','2027-06-01'], ['COUPONVALUE','40'],
        ['COUPONPERCENT','8'], ['FACEUNIT','RUB'], ['COUPONDATE','2026-12-10'],
        ['BOND_TYPE','Индексируемая'], ['COUPON_DETAILS','фиксированный купон'],
      ] },
    }) };
  });
  const asset = { kind: 'bond', secid: 'RU000A105SD4', board: 'TQOB', lastPrice: 950, priceUnit: 'rub' };
  await sb.api.refreshAsset(asset);
  assert.equal(asset.lastPrice, 950, 'сохранённая рублёвая цена не затёрта пустой котировкой');
  assert.equal(asset.nominal, 1000);
  assert.equal(asset.couponType, 'fixed');
  assert.equal(asset.priceUnit, 'rub');
  assert.ok(Array.isArray(asset.coupons));
  assert.equal(asset.maturityDate, '2027-06-01');
});

test('MoexAPI.bondDetails: валютная облигация отклоняется', async () => {
  const sb = moexSandbox(async () => ({ ok: true, json: async () => ({
    description: { columns: ['name','value'], data: [['FACEUNIT','USD']] },
    marketdata: { columns: ['LAST'], data: [[null]] },
    securities: { columns: ['FACEVALUE','FACEUNIT'], data: [[1000, 'USD']] },
    coupons: { columns: [], data: [] },
    'coupons.cursor': { columns: ['TOTAL'], data: [[0]] },
  }) }));
  await assert.rejects(() => sb.api.bondDetails('TEST','TQOB'), /рублёвые/i);
});

test('MoexAPI.keyRate: парсинг ставки ЦБ и кэширование', async () => {
  let calls = 0;
  const sb = moexSandbox(async () => { calls++; return { ok: true, json: async () => ({ rate: 16.5, date: '2026-11-01' }) }; });
  const r1 = await sb.api.keyRate();
  const r2 = await sb.api.keyRate();
  assert.equal(r1.rate, 16.5);
  assert.equal(calls, 1, 'ставка кэшируется');
  assert.equal(r2.date, '2026-11-01');
});

test('MoexAPI.searchSecurity: колонки превращаются в объекты строк', async () => {
  const sb = moexSandbox(async () => ({ ok: true, json: async () => ({
    securities: { columns: ['secid','shortname','type'], data: [['SBER','Сбербанк','ordinary_share'], ['TGLD','Глобал','fund_etf']] },
  }) }));
  const rows = await sb.api.searchSecurity('сбер');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].shortname, 'Сбербанк');
  assert.equal(rows[1].type, 'fund_etf');
});

test('MoexAPI: без интернета методы падают с понятной ошибкой', async () => {
  const sb = moexSandbox(async () => { throw new Error('не должно вызываться'); });
  sb.navigator.onLine = false;
  await assert.rejects(() => sb.api.searchSecurity('x'), /интернет/i);
});

// ============================================================================
// 8. Дашборд и цель
// ============================================================================

function dashboardSandbox(over){
  const sb = makeSandbox(over);
  const mods = loadInto(sb,
    ['js/core.js','js/bonds.js','js/simulator.js','js/charts.js','js/dashboard.js'],
    '{Storage, Stats, Events, Dashboard, GoalBar, Simulator, Utils, ProductList}');
  return { sb, mods };
}

function setStorage(sb, products){
  sb.localStorage.setItem('fin_v3', JSON.stringify(products));
}
const deposit400k = () => [{ id: 'd1', type: 'deposit', name: 'Вклад', amount: 400000, rate: 75, operations: [] }];

test('GoalBar: цель 1 млн, темп 25 тыс/мес → «≈ 2 года», заполнение 40%', () => {
  const { sb, mods } = dashboardSandbox();
  setStorage(sb, deposit400k());
  sb.localStorage.setItem('fin_goal', JSON.stringify({ amount: 1000000 }));
  mods.GoalBar.render();
  const card = sb.document.getElementById('goalCard');
  assert.equal(card.hidden, false);
  assert.ok(card.innerHTML.includes('≈ 2 года'), card.innerHTML);
  assert.ok(card.innerHTML.includes('40%'), 'заполнение 40%');
  assert.ok(card.innerHTML.includes('goal-fill'));
  assert.equal(sb.document.getElementById('createGoalBtn').textContent, '🎯 Изменить цель');
});

test('GoalBar: достигнутая цель, отсутствие темпа и удаление', () => {
  const { sb, mods } = dashboardSandbox();
  // Достигнута: цель меньше баланса
  setStorage(sb, deposit400k());
  sb.localStorage.setItem('fin_goal', JSON.stringify({ amount: 100000 }));
  mods.GoalBar.render();
  assert.ok(sb.document.getElementById('goalCard').innerHTML.includes('🎉'), 'цель достигнута');

  // Нет темпа: ставка 0 и цель ещё не достигнута → «≈ —»
  const s2 = dashboardSandbox();
  setStorage(s2.sb, [{ id: 'd1', type: 'deposit', name: 'Вклад', amount: 400000, rate: 0, operations: [] }]);
  s2.sb.localStorage.setItem('fin_goal', JSON.stringify({ amount: 500000 }));
  s2.mods.GoalBar.render();
  assert.ok(s2.sb.document.getElementById('goalCard').innerHTML.includes('≈ —'), 'нет темпа — нет срока');

  // Удаление: карточка скрывается, кнопка возвращается к созданию
  sb.localStorage.removeItem('fin_goal');
  mods.GoalBar.render();
  assert.equal(sb.document.getElementById('goalCard').hidden, true);
  assert.equal(sb.document.getElementById('createGoalBtn').textContent, '🎯 Создать цель');
});

test('GoalBar.createOrEdit: имя и сумма из двух prompt сохраняются и рисуются', () => {
  const answers = ['Квартира', '500000'];
  const { sb, mods } = dashboardSandbox({ prompt: () => answers.shift() });
  setStorage(sb, deposit400k());
  mods.GoalBar.createOrEdit();
  const saved = JSON.parse(sb.localStorage.getItem('fin_goal'));
  assert.equal(saved.name, 'Квартира', 'имя цели сохранено');
  assert.equal(saved.amount, 500000);
  assert.ok(saved.createdAt, 'дата создания цели сохранена');
  const card = sb.document.getElementById('goalCard');
  assert.equal(card.hidden, false);
  assert.ok(card.innerHTML.includes('Квартира'), 'имя видно на карточке');
  assert.ok(card.innerHTML.includes('goal-fill'));

  // Отмена первого prompt ничего не ломает — цель не перезаписывается
  const before = sb.localStorage.getItem('fin_goal');
  const cancel = dashboardSandbox({ prompt: () => null });
  setStorage(cancel.sb, deposit400k());
  cancel.sb.localStorage.setItem('fin_goal', before);
  cancel.mods.GoalBar.createOrEdit();
  assert.equal(cancel.sb.localStorage.getItem('fin_goal'), before, 'отмена ввода — цель без изменений');
});

test('Dashboard.renderAll: сводка, события и прогноз рисуются без ошибок', () => {
  const { sb, mods } = dashboardSandbox();
  setStorage(sb, [
    { id: 'd1', type: 'deposit', name: 'Вклад', amount: 400000, rate: 75, operations: [], endDate: dayFromNow(90) },
    { id: 'cc', type: 'credit_card', name: 'Карта', amount: 50000, rate: 0, limit: 100000, gracePeriodEndDate: dayFromNow(5), operations: [] },
  ]);
  sb.localStorage.setItem('fin_goal', JSON.stringify({ amount: 1000000 }));
  mods.Dashboard.renderAll();
  assert.ok(sb.document.getElementById('stats').innerHTML.includes('₽'));
  assert.ok(sb.document.getElementById('eventsList').innerHTML.includes('Окончание'), 'событие окончания срока');
  assert.ok(sb.document.getElementById('fc1').innerHTML.includes('1 мес'));
  assert.ok(sb.document.getElementById('fc2').innerHTML.includes('10 лет'));
  assert.ok(sb.document.getElementById('calendar').innerHTML.includes('cal-cell'));
  assert.ok(sb.document.getElementById('sinceVisitCard').hidden, 'без прошлого захода отчёт скрыт');
});

test('Dashboard: прогноз «без событий» и «с событиями» согласованы с симуляцией', () => {
  const { sb, mods } = dashboardSandbox();
  setStorage(sb, deposit400k());
  sb.localStorage.setItem('fin_goal', JSON.stringify({ amount: 1000000 }));
  mods.Dashboard.renderAll();
  const fc1 = sb.document.getElementById('fc1').innerHTML;
  const fc2 = sb.document.getElementById('fc2').innerHTML;
  // старт от текущего баланса: 400 000 + один месяц под 75% годовых = 425 000
  assert.ok(/425[\s\u00A0\u202F]?000/.test(fc1), 'старт от текущего баланса: ' + fc1.slice(0, 120));
  assert.ok(fc1.length > 0 && fc2.length > 0);
});

test('Dashboard: события постранично — 6 на страницу с пейджером', () => {
  const { sb, mods } = dashboardSandbox();
  const products = [];
  for (let i = 1; i <= 8; i++){
    products.push({ id: 'd'+i, type: 'deposit', name: 'Вклад '+i, amount: 100000*i, rate: 10,
      operations: [], endDate: dayFromNow(i) });
  }
  setStorage(sb, products);
  mods.Dashboard.renderAll();
  const el = sb.document.getElementById('eventsList');
  const count = html => (html.match(/class="event[ "]/g) || []).length;
  assert.equal(count(el.innerHTML), 6, 'первая страница — 6 событий');
  assert.ok(el.innerHTML.includes('events-pager'), 'пейджер виден');
  assert.ok(el.innerHTML.includes('1–6 из 8'), 'счётчик первой страницы');
  mods.Dashboard.setEventsPage(1);
  assert.equal(count(el.innerHTML), 2, 'вторая страница — 2 события');
  assert.ok(el.innerHTML.includes('7–8 из 8'), 'счётчик второй страницы');
  mods.Dashboard.setEventsPage(2); // дальше второй страницы листаться нельзя
  assert.ok(el.innerHTML.includes('7–8 из 8'), 'страница не ушла за пределы');
  mods.Dashboard.setEventsPage(-5); // назад за пределы тоже нельзя
  assert.ok(el.innerHTML.includes('1–6 из 8'), 'возврат на первую страницу');
});

test('Dashboard: прогноз «без учёта событий» не закрывает вклады', () => {
  const { sb, mods } = dashboardSandbox();
  // Вклад закрывается через месяц: с событиями баланс уходит в ноль,
  // без событий — продолжает расти под ставку.
  setStorage(sb, [
    { id: 'd1', type: 'deposit', name: 'Вклад', amount: 100000, rate: 12,
      startDate: dayFromNow(-30), endDate: dayFromNow(30),
      operations: [], endActions: [{ type: 'close' }] },
  ]);
  mods.Dashboard.renderAll();
  const fc1 = sb.document.getElementById('fc1').innerHTML;
  const fc2 = sb.document.getElementById('fc2').innerHTML;
  const values = html => [...html.matchAll(/class="fc-value">([^<]+)</g)].map(m => m[1]);
  const zero = new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(0);
  // fc2 (с событиями): срок вклада истекает в первый месяц, к горизонту
  // «1 год» вклад закрыт — чистый баланс на всех дальних горизонтах ноль
  assert.ok(values(fc2).slice(1).every(v => v === zero), 'с событиями вклад закрылся: ' + fc2.slice(0, 200));
  // fc1 (без событий): вклад жив и растёт на всех горизонтах
  assert.ok(values(fc1).every(v => v !== zero), 'без событий вклад не закрывается');
  assert.notEqual(fc1, fc2, 'прогнозы различаются');
  assert.ok(values(fc1)[3].length > 0, 'горизонт 10 лет посчитан без событий');
  // прямой прогон симулятора согласован с колонкой fc1
  const sim = mods.Simulator.simulateAll(120, { noEvents: true });
  assert.ok(sim['d1'].history[120].value > 100000, 'вклад без событий вырос за 10 лет');
});

test('Simulator: квартира растёт в цене, аренда — в доход, ремонт — в расход', () => {
  const { mods } = simMods([{ id: 'apt', type: 'apartment', name: 'Квартира', amount: 12000000,
    rate: 8, rented: true, rentPrice: 60000, upkeepRate: 2, operations: [] }]);
  const res = mods.Simulator.simulateAll(12);
  const h = res.apt.history[12];
  assert.ok(h.value > 12900000 && h.value < 13100000, 'стоимость выросла на ~8%: ' + h.value);
  assert.ok(h.cumIncome > 1700000 && h.cumIncome < 1730000, 'доход = рост + аренда 12 мес: ' + h.cumIncome);
  assert.ok(h.cumExpense > 245000 && h.cumExpense < 255000, 'ремонт ~2%/год: ' + h.cumExpense);
  const s = mods.Stats.aggregate();
  assert.equal(s.assets, 12000000, 'квартира в активах');
  assert.equal(s.inc, 12000000 * 0.08 + 60000 * 12, 'доход: рост + аренда за год');
  assert.equal(s.exp, 12000000 * 0.02, 'расход: ремонт за год');
});

test('Stats: продукт «вне бюджета» не входит в баланс, но влияет на доход', () => {
  const { mods } = simMods([
    { id: 'card', type: 'debit_card', name: 'Карта', amount: 100000, rate: 0, offBudget: true,
      operations: [{ id: 'o1', direction: 'in', amount: 5000, frequency: 'monthly', date: dayFromNow(-10) }] },
    { id: 'dep', type: 'deposit', name: 'Вклад', amount: 400000, rate: 0, operations: [] },
  ]);
  const s = mods.Stats.aggregate();
  assert.equal(s.assets, 400000, 'карта вне бюджета — не в активах');
  assert.equal(s.net, 400000, 'чистый баланс без карты');
  assert.equal(s.inc, 60000, 'пополнения карты влияют на доход');
});

test('Events: погашение облигации в событиях; тап по событию ведёт к карточке', () => {
  const { sb, mods } = dashboardSandbox();
  setStorage(sb, [{
    id: 'inv', type: 'investment', name: 'Брокерский счёт', amount: 1000, rate: 5, operations: [],
    assets: [{ id: 'b1', kind: 'bond', secid: 'RU000A105SD4', shortname: 'ОФЗ 105SD4', qty: 2, nominal: 1000,
      lastPrice: 980, priceUnit: 'rub', accountingFrom: dayFromNow(-30), maturityDate: dayFromNow(60),
      paidEvents: {}, coupons: [{ date: dayFromNow(20), value: 40 }] }],
  }]);
  const maturity = mods.Events.all().find(e => e.title.includes('Погашение'));
  assert.ok(maturity, 'событие погашения облигации есть');
  assert.equal(maturity.amount, 2000, 'номинал к получению: 2 × 1000');
  mods.Dashboard.renderAll();
  const el = sb.document.getElementById('eventsList');
  assert.ok(el.innerHTML.includes('Погашение'), 'погашение видно в списке событий');
  assert.ok(el.innerHTML.includes('data-evprod'), 'события кликабельны — открывают карточку продукта');
});

test('Календарь: тап по дате с событием показывает события, пустая дата не реагирует', () => {
  const { sb, mods } = dashboardSandbox();
  const evDate = dayFromNow(3);
  setStorage(sb, [
    { id: 'd1', type: 'deposit', name: 'Вклад', amount: 100000, rate: 10, operations: [], endDate: evDate },
    { id: 'cc', type: 'credit_card', name: 'Карта', amount: 50000, rate: 0, limit: 100000,
      gracePeriodEndDate: evDate, operations: [] },
  ]);
  mods.Dashboard.renderAll();
  const panel = sb.document.getElementById('calDayInfo');
  assert.equal(panel.hidden, true, 'панель дня скрыта до выбора');
  mods.Dashboard.showDay(evDate);
  assert.equal(panel.hidden, false, 'панель дня открыта');
  assert.ok(panel.innerHTML.includes('Окончание'), 'событие окончания на панели');
  assert.ok(panel.innerHTML.includes('Льготный период'), 'событие грейса на панели');
  mods.Dashboard.showDay(dayFromNow(10));
  assert.equal(panel.hidden, true, 'пустой день — панель скрывается, календарь не реагирует');
});

test('ProductList: одинаковые типы сворачиваются в список, одиночный виден сразу', () => {
  const { sb, mods } = dashboardSandbox();
  setStorage(sb, [
    { id: 'd1', type: 'deposit', name: 'Вклад 1', amount: 100000, rate: 10, operations: [] },
    { id: 'd2', type: 'deposit', name: 'Вклад 2', amount: 200000, rate: 12, operations: [] },
    { id: 'i1', type: 'investment', name: 'Брокерский', amount: 50000, rate: 5, operations: [], assets: [] },
  ]);
  mods.ProductList.render(() => {});
  const html = sb.document.getElementById('productsList').innerHTML;
  assert.equal((html.match(/product-group/g) || []).length, 1, 'одна свёрнутая группа — вклады');
  assert.ok(html.includes('2 шт.'), 'счётчик продуктов в заголовке группы');
  assert.ok(/300[\s\u00A0\u202F]?000/.test(html), 'сумма группы в заголовке');
  assert.ok(html.includes('Вклад 1') && html.includes('Вклад 2'), 'вклады внутри группы');
  assert.ok(html.includes('Брокерский'), 'одиночная инвестиция видна сразу');

  // Один продукт типа — без сворачивания
  const single = dashboardSandbox();
  setStorage(single.sb, [{ id: 'd1', type: 'deposit', name: 'Один вклад', amount: 100000, rate: 5, operations: [] }]);
  single.mods.ProductList.render(() => {});
  const html2 = single.sb.document.getElementById('productsList').innerHTML;
  assert.ok(!html2.includes('product-group'), 'одиночный продукт не сворачивается');
  assert.ok(html2.includes('Один вклад'));
});

test('ProductList: закрытые продукты уходят в серый архив в конце списка', () => {
  const { sb, mods } = dashboardSandbox();
  setStorage(sb, [
    { id: 'd1', type: 'deposit', name: 'Действующий вклад', amount: 100000, rate: 10, operations: [], endDate: dayFromNow(90) },
    { id: 'd2', type: 'deposit', name: 'Закрытый вклад', amount: 200000, rate: 12, operations: [], endDate: dayFromNow(-30) },
  ]);
  mods.ProductList.render(() => {});
  const html = sb.document.getElementById('productsList').innerHTML;
  assert.ok(html.includes('product-archive'), 'архив в конце списка');
  assert.ok(html.includes('Архив · 1'), 'счётчик архива');
  assert.ok(html.indexOf('Закрытый вклад') > html.indexOf('product-archive'), 'закрытый вклад внутри архива');
});


// Regression checks: transfers and principal are not investment income.
test('Simulator: deposit top-ups change capital but do not inflate income', () => {
  const { mods } = simMods([{
    id:'dep-topup', type:'deposit', amount:10000, rate:0,
    operations:[{id:'topup',direction:'in',amount:5000,frequency:'monthly',date:dayFromNow(-30)}]
  }]);
  const result=mods.Simulator.simulateAll(2)['dep-topup'];
  assert.equal(result.history[1].value,15000);
  assert.equal(result.history[1].cumIncome,0);
  assert.equal(mods.Stats.aggregate().inc,0);
});

test('Simulator: maturity transfer returns principal without counting it as income twice', () => {
  const { mods } = simMods([
    {id:'source',type:'deposit',amount:10000,rate:12,endDate:dayFromNow(2),
      endActions:[{type:'transfer',targetId:'target'}],operations:[]},
    {id:'target',type:'deposit',amount:0,rate:0,operations:[]}
  ]);
  const result=mods.Simulator.simulateAll(3);
  const source=result.source.history[1];
  const target=result.target.history[1];
  assert.equal(source.value,0);
  assert.ok(Math.abs(target.value-10100)<1e-6,'principal plus earned interest transferred');
  assert.ok(Math.abs(source.cumIncome-100)<1e-6,'only accrued interest is income at source');
  assert.equal(target.cumIncome,0,'incoming principal transfer is not income');
});

test('Simulator: mandatory expenses never appear as an asset or debt in forecast capital', () => {
  const { mods } = simMods([{id:'rent',type:'expense',amount:45000,rate:0,operations:[]}]);
  const result=mods.Simulator.simulateAll(2).rent;
  assert.equal(result.history[0].value,0);
  assert.equal(result.history[1].value,0);
  assert.equal(result.history[1].cumExpense,45000);
  assert.equal(mods.Stats.aggregate().assets,0);
  assert.equal(mods.Stats.aggregate().debts,0);
  assert.equal(mods.Stats.aggregate().exp,540000);
});

test('Simulator: credit-card repayments reduce debt but are not income', () => {
  const { mods } = simMods([{
    id:'cc',type:'credit_card',amount:20000,rate:0,
    operations:[{id:'payment',direction:'in',amount:5000,frequency:'monthly',date:dayFromNow(-30)}]
  }]);
  const result=mods.Simulator.simulateAll(2).cc;
  assert.equal(result.history[1].value,15000);
  assert.equal(result.history[1].cumIncome,0);
  assert.equal(mods.Stats.aggregate().inc,0);
});
