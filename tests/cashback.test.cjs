const { test } = require('node:test');
const assert = require('node:assert/strict');
const CbLogic = require('../js/cashback.js');

test('monthKey formats current month with zero padding', () => {
  assert.equal(CbLogic.monthKey(new Date(2026, 0, 15)), '2026-01');
  assert.equal(CbLogic.monthKey(new Date(2026, 10, 3)), '2026-11');
});

test('normalize keeps only the current month and cleans entries', () => {
  const banks = [{ id: 'b1', name: 'Альфа', cats: [
    { id: 'c1', name: 'Супермаркет', sub: 'Дикси', value: 5 },
    { id: 'c2', name: '  Кафе  ', value: 3 },
    { id: '', name: 'Пустой id', value: 99 }
  ]}];
  const fresh = CbLogic.normalize({ month: '2026-11', banks }, '2026-11');
  assert.equal(fresh.month, '2026-11');
  assert.equal(fresh.banks.length, 1);
  assert.equal(fresh.banks[0].cats.length, 2);
  assert.deepEqual(fresh.banks[0].cats[0], { id: 'c1', name: 'Супермаркет', sub: 'Дикси', value: 5 });
  assert.equal(fresh.banks[0].cats[1].name, 'Кафе'); // пробелы убраны
  assert.deepEqual(CbLogic.normalize({ month: '2026-10', banks }, '2026-11'), { month: '2026-11', banks: [] });
  assert.deepEqual(CbLogic.normalize(null, '2026-11'), { month: '2026-11', banks: [] });
  assert.deepEqual(CbLogic.normalize({ month: '2026-11' }, '2026-11'), { month: '2026-11', banks: [] });
});

test('groupByCategory: main row has no subcategory, subs sorted and capped at 3', () => {
  const banks = [
    { id: 'tb', name: 'Т-Банк', cats: [
      { id: 'c1', name: 'Магазины', value: 10 },
      { id: 'c5', name: 'Магазины', sub: 'Пятёрочка', value: 12 },
      { id: 'c6', name: 'Магазины', sub: 'Магнит', value: 11 }
    ]},
    { id: 'sb', name: 'Сбер', cats: [
      { id: 'c2', name: 'Магазины', sub: 'Дикси', value: 20 }
    ]},
    { id: 'yb', name: 'Яндекс Банк', cats: [
      { id: 'c3', name: 'Магазины', sub: 'Перекёсток', value: 30 },
      { id: 'c4', name: 'Такси', value: 15 }
    ]}
  ];
  const groups = CbLogic.groupByCategory(banks);
  assert.equal(groups.length, 2);
  // Категории отсортированы по лучшему кешбэку: Такси (15) — вторая
  const shops = groups.find(g => g.name === 'Магазины');
  const taxi = groups.find(g => g.name === 'Такси');
  assert.ok(groups.indexOf(groups.find(g => g.name === 'Такси')) > groups.indexOf(shops));
  // Главная строка — кешбэк без подкатегории (приоритет по требованию)
  assert.equal(shops.top.bankId, 'tb');
  assert.equal(shops.top.value, 10);
  assert.equal(shops.top.sub, null);
  // Подкатегории: до 3 лучших по убыванию процента
  assert.equal(shops.subs.length, 3);
  assert.deepEqual(shops.subs.map(s => s.sub), ['Перекёсток', 'Дикси', 'Пятёрочка']);
  assert.deepEqual(shops.subs.map(s => s.value), [30, 20, 12]);
  assert.equal(taxi.top.value, 15);
  assert.deepEqual(taxi.subs, []);
});

test('groupByCategory caps subs at 3 even when there are more', () => {
  const banks = [{ id: 'b1', name: 'Банк', cats: [
    { id: 'c1', name: 'Супермаркет', value: 1 },
    { id: 'c2', name: 'Супермаркет', sub: 'A', value: 2 },
    { id: 'c3', name: 'Супермаркет', sub: 'B', value: 3 },
    { id: 'c4', name: 'Супермаркет', sub: 'C', value: 4 },
    { id: 'c5', name: 'Супермаркет', sub: 'D', value: 5 }
  ]}];
  const [g] = CbLogic.groupByCategory(banks);
  assert.equal(g.subs.length, 3);
  assert.deepEqual(g.subs.map(s => s.sub), ['D', 'C', 'B']);
});

test('groupByCategory: category without plain entries still shows subs', () => {
  const banks = [{ id: 'b1', name: 'Банк', cats: [
    { id: 'c1', name: 'Супермаркет', sub: 'Дикси', value: 5 }
  ]}];
  const [g] = CbLogic.groupByCategory(banks);
  assert.equal(g.top, null);
  assert.equal(g.subs.length, 1);
  assert.deepEqual(CbLogic.groupByCategory([]), []);
  assert.deepEqual(CbLogic.groupByCategory(undefined), []);
});

test('entriesAll flattens banks and categories with sub info', () => {
  const banks = [
    { id: 'b1', name: 'Т-Банк', cats: [{ id: 'c1', name: 'Кафе', value: 3 }] },
    { id: 'b2', name: 'Сбер', cats: [{ id: 'c2', name: 'Супермаркет', sub: 'Дикси', value: 5 }] }
  ];
  const all = CbLogic.entriesAll(banks);
  assert.equal(all.length, 2);
  assert.equal(all[0].bankName, 'Т-Банк');
  assert.equal(all[1].sub, 'Дикси');
  assert.deepEqual(CbLogic.entriesAll(undefined), []);
});

test('allByBank groups and sorts entries of the month', () => {
  const banks = [
    { id: 'b2', name: 'Сбер', cats: [
      { id: 'c3', name: 'АЗС', value: 5 },
      { id: 'c4', name: 'Кафе', value: 7 }
    ]},
    { id: 'b1', name: 'Т-Банк', cats: [{ id: 'c1', name: 'Кафе', value: 3 }] },
    { id: 'b3', name: 'Пустой', cats: [] }
  ];
  const byBank = CbLogic.allByBank(banks);
  assert.equal(byBank.length, 2);          // банк без кешбэков не показывается
  assert.equal(byBank[0].bankName, 'Сбер');   // банки по алфавиту
  assert.equal(byBank[1].bankName, 'Т-Банк');
  assert.equal(byBank[1].bankId, 'b1');
  assert.deepEqual(byBank[0].entries.map(e => e.catName), ['Кафе', 'АЗС']); // по убыванию %
  assert.deepEqual(CbLogic.allByBank([]), []);
});

test('allByCategory groups every entry of the month by category', () => {
  const banks = [
    { id: 'b1', name: 'Т-Банк', cats: [{ id: 'c1', name: 'Кафе', value: 3 }] },
    { id: 'b2', name: 'Сбер', cats: [
      { id: 'c2', name: 'Кафе', value: 7 },
      { id: 'c3', name: 'АЗС', value: 5 }
    ]}
  ];
  const byCat = CbLogic.allByCategory(banks);
  assert.equal(byCat.length, 2);
  assert.deepEqual(byCat.map(g => g.name), ['АЗС', 'Кафе']); // категории по алфавиту
  const cafe = byCat.find(g => g.name === 'Кафе');
  assert.deepEqual(cafe.entries.map(e => e.bankName), ['Сбер', 'Т-Банк']); // по убыванию %
  assert.deepEqual(CbLogic.allByCategory([]), []);
});

test('level: подсветка категории по размеру кешбэка', () => {
  assert.equal(CbLogic.level(0), 'low');
  assert.equal(CbLogic.level(1), 'low');
  assert.equal(CbLogic.level(2.9), 'low');
  assert.equal(CbLogic.level(3), 'mid');
  assert.equal(CbLogic.level(4.9), 'mid');
  assert.equal(CbLogic.level(5), 'high');
  assert.equal(CbLogic.level(15), 'high');
  assert.equal(CbLogic.level(null), 'low');
  assert.equal(CbLogic.level('7'), 'high');
});

test('groupLevel: цвет категории зависит от процента основной строки', () => {
  const g = (top, subs) => ({ top, subs: subs || [] });
  assert.equal(CbLogic.groupLevel(g({ value: 3 }, [{ value: 12 }])), 'mid',
    'основная 3% — жёлтый, подкатегории не перекрашивают');
  assert.equal(CbLogic.groupLevel(g({ value: 10 })), 'high',
    '10% без подкатегорий — зелёный');
  assert.equal(CbLogic.groupLevel(g({ value: 1 }, [{ value: 15 }])), 'low',
    'основная 1% — красный, даже если подкатегория даёт 15%');
  assert.equal(CbLogic.groupLevel(g(null, [{ value: 4 }])), 'mid',
    'без основной строки — лучшая подкатегория');
  assert.equal(CbLogic.groupLevel(g(null, [{ value: 7 }, { value: 2 }])), 'high');
  assert.equal(CbLogic.groupLevel(g(null, [])), 'low');
  assert.equal(CbLogic.groupLevel({}), 'low');
});

test('dict stores banks and categories independently', () => {
  let dict = CbLogic.normalizeDict(null);
  dict = CbLogic.dictAdd(dict, 'bank', 'Т-Банк');
  dict = CbLogic.dictAdd(dict, 'cat', 'Супермаркет');
  assert.equal(dict.banks.length, 1);
  assert.equal(dict.cats.length, 1);
  assert.equal(dict.banks[0].name, 'Т-Банк');
  assert.equal(dict.cats[0].name, 'Супермаркет');
  // Дубликаты (без учёта регистра) не добавляются
  dict = CbLogic.dictAdd(dict, 'bank', 'т-банк');
  dict = CbLogic.dictAdd(dict, 'cat', '  ');
  assert.equal(dict.banks.length, 1);
  assert.equal(dict.cats.length, 1);
  // Независимость: удаление банка не трогает категории
  const bankId = dict.banks[0].id;
  dict = CbLogic.dictRemove(dict, 'bank', bankId);
  assert.equal(dict.banks.length, 0);
  assert.equal(dict.cats.length, 1);
  dict = CbLogic.dictAdd(dict, 'bank', 'Сбер');
  assert.equal(dict.banks.length, 1);
  assert.equal(dict.cats.length, 1);
});
