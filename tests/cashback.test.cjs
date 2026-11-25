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

// ===== Предзаказ следующего месяца и быстрый ввод по промту =====

test('advanceAllowed: предзаказ разрешён за 15 дней до начала месяца', () => {
  assert.equal(CbLogic.advanceAllowed(new Date(2026, 11, 17)), true, '17 декабря — ровно за 15 дней');
  assert.equal(CbLogic.advanceAllowed(new Date(2026, 11, 31)), true, 'последний день месяца');
  assert.equal(CbLogic.advanceAllowed(new Date(2026, 11, 16)), false, '16 декабря — рано');
  assert.equal(CbLogic.advanceAllowed(new Date(2026, 1, 17)), true, 'февраль → март: 12+1 дней впритык');
  assert.equal(CbLogic.nextMonthKey(new Date(2026, 11, 5)), '2027-01', 'январь следующего года');
  assert.equal(CbLogic.nextMonthKey(new Date(2026, 0, 15)), '2026-02');
});

test('parseAiAnswer: достаёт JSON из блока кода и приводит поля', () => {
  const ans = 'Вот условия:\n```json\n[{"bank":"Т-Банк","cashbacks":' +
    '[{"category":"Супермаркеты","subcategory":null,"percent":5},' +
    '{"category":"АЗС","subcategory":"95,95","percent":3.5}]}]\n```\nПодойдёт?';
  const parsed = CbLogic.parseAiAnswer(ans);
  assert.ok(Array.isArray(parsed) && parsed.length === 1);
  assert.equal(parsed[0].bank, 'Т-Банк');
  assert.equal(parsed[0].cashbacks[0].name, 'Супермаркеты');
  assert.equal(parsed[0].cashbacks[0].sub, null);
  assert.equal(parsed[0].cashbacks[0].value, 5);
  assert.equal(parsed[0].cashbacks[1].value, 3.5);
  assert.equal(parsed[0].cashbacks[1].sub, '95,95');
  // Сырой JSON без ограждения блока
  const raw = CbLogic.parseAiAnswer('[{"bank":"Банк","cashbacks":[{"category":"Кафе","percent":7}]}]');
  assert.ok(raw && raw[0].bank === 'Банк' && raw[0].cashbacks[0].value === 7);
  // Обёртка { banks: [...] } и альтернативные поля bankName/value
  const wrapped = CbLogic.parseAiAnswer('```json\n{"banks":[{"bankName":"Сбер","cashbacks":[{"category":"Такси","value":10}]}]}\n```');
  assert.ok(wrapped && wrapped[0].bank === 'Сбер' && wrapped[0].cashbacks[0].value === 10);
  // Мусор, пустые строки и ответы без данных
  assert.equal(CbLogic.parseAiAnswer('просто текст без данных'), null);
  assert.equal(CbLogic.parseAiAnswer(''), null);
  assert.equal(CbLogic.parseAiAnswer('[{"bank":"Банк","cashbacks":[]}'), null);
});

test('mergeImported: банк узнаётся без учёта регистра, категория берётся из справочников', () => {
  const monthBanks = [
    { id: 'b1', name: 'Т-Банк', cats: [{ id: 'c1', name: 'Супермаркеты', sub: null, value: 3 }] },
  ];
  const dict = CbLogic.normalizeDict({
    banks: [{ id: 'db1', name: 'Т-Банк' }],
    cats: [{ id: 'dc1', name: 'Супермаркеты' }, { id: 'dc2', name: 'Такси' }],
  });
  const imported = [{ bank: 'т-банк', cashbacks: [
    { name: 'супермаркеты', sub: null, value: 5 },   // обновление процента известной категории
    { name: 'такси', sub: null, value: 7 },          // известная категория
    { name: 'Электроника', sub: 'Ситилинк', value: 2 }, // полностью новая
  ]}];
  const res = CbLogic.mergeImported(monthBanks, imported, dict);
  const tb = res.banks.find(b => b.name === 'Т-Банк');
  assert.ok(tb, 'банк узнан без учёта регистра — новый не создан');
  assert.ok(res.rows[0].updated, 'процент супермаркетов обновлён');
  assert.equal(res.rows[0].value, 5);
  assert.equal(tb.cats[0].value, 5);
  assert.equal(res.rows[1].catName, 'Такси', 'написание из словаря, а не «такси»');
  assert.ok(res.rows[1].catKnown && !res.rows[1].bankNew);
  assert.equal(res.rows[2].catName, 'Электроника');
  assert.ok(res.rows[2].catNew === undefined || res.rows[2].catKnown === false, 'новая категория помечена');
  assert.equal(res.banks.length, 1, 'словарь и месяц не наполнились дублями');
  // Идентичная запись повторно — без «обновления»
  const again = CbLogic.mergeImported(res.banks, [{ bank: 'Т-Банк', cashbacks: [{ name: 'Такси', sub: null, value: 7 }] }], dict);
  assert.ok(!again.rows[0].updated);
  assert.equal(again.banks[0].cats.length, 3, ' дублей не добавлено');
});

test('mergeImported: новый банк создаётся только в месяце (данные чистые)', () => {
  const res = CbLogic.mergeImported([], [{ bank: 'Райффайзен', cashbacks: [{ name: 'Супермаркеты', sub: null, value: 4 }] }],
    CbLogic.normalizeDict(null));
  assert.equal(res.banks.length, 1);
  assert.ok(res.rows[0].bankNew, 'новый банк помечен');
  assert.equal(res.rows[0].value, 4);
  // Словарь mergeImported не изменяет (это чистая функция)
  assert.deepEqual(CbLogic.normalizeDict(null).banks, []);
});

test('parseAiAnswer supports several banks, merges repeated names and accepts comma decimals', () => {
  const parsed = CbLogic.parseAiAnswer('[{"bank":"Т-Банк","cashbacks":[{"category":"Кафе","percent":"3,5"}]},{"bank":"Сбер","cashbacks":[{"category":"АЗС","percent":5}]},{"bank":"т-банк","cashbacks":[{"category":"Такси","percent":7}]}]');
  assert.equal(parsed.length, 2, 'повторяющийся банк объединён');
  assert.equal(parsed[0].bank, 'Т-Банк');
  assert.deepEqual(parsed[0].cashbacks.map(x => x.name), ['Кафе', 'Такси']);
  assert.equal(parsed[0].cashbacks[0].value, 3.5, 'запятая в дробном проценте обработана');
  assert.equal(parsed[1].bank, 'Сбер');
  assert.equal(parsed[1].cashbacks[0].value, 5);
});

test('mergeImported adds several banks from one prompt response without collisions', () => {
  const imported = [
    { bank: 'Т-Банк', cashbacks: [{ name: 'Кафе', sub: null, value: 5 }, { name: 'АЗС', sub: null, value: 3 }] },
    { bank: 'Сбер', cashbacks: [{ name: 'Такси', sub: null, value: 7 }] }
  ];
  const res = CbLogic.mergeImported([], imported, CbLogic.normalizeDict(null));
  assert.equal(res.banks.length, 2);
  assert.equal(res.rows.length, 3);
  assert.equal(new Set(res.rows.map(x => x.key)).size, 3, 'ключи строк уникальны');
  assert.deepEqual(res.banks.map(x => x.name), ['Т-Банк', 'Сбер']);
});
