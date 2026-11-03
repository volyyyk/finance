const { test } = require('node:test');
const assert = require('node:assert/strict');
const CbLogic = require('../js/cashback.js');

test('monthKey formats current month with zero padding', () => {
  assert.equal(CbLogic.monthKey(new Date(2026, 0, 15)), '2026-01');
  assert.equal(CbLogic.monthKey(new Date(2026, 10, 3)), '2026-11');
});

test('normalize keeps only the current month and resets data from other months', () => {
  const banks = [{ id: 'b1', name: 'Альфа', cats: [{ id: 'c1', name: 'Кафе', value: 5 }] }];
  const fresh = CbLogic.normalize({ month: '2026-11', banks }, '2026-11');
  assert.equal(fresh.month, '2026-11');
  assert.equal(fresh.banks.length, 1);
  assert.deepEqual(CbLogic.normalize({ month: '2026-10', banks }, '2026-11'), { month: '2026-11', banks: [] });
  assert.deepEqual(CbLogic.normalize(null, '2026-11'), { month: '2026-11', banks: [] });
  assert.deepEqual(CbLogic.normalize({ month: '2026-11' }, '2026-11'), { month: '2026-11', banks: [] });
});

test('bestByCategory picks the highest cashback across banks', () => {
  const banks = [
    { id: 'b1', name: 'Т-Банк', cats: [
      { id: 'c1', name: 'Кафе', value: 3 },
      { id: 'c2', name: 'АЗС', value: 5 }
    ]},
    { id: 'b2', name: 'Альфа', cats: [
      { id: 'c3', name: 'Кафе', value: 7 },
      { id: 'c4', name: '', value: 99 }
    ]}
  ];
  const best = CbLogic.bestByCategory(banks);
  assert.equal(best.length, 2); // пустое имя игнорируется
  assert.equal(best[0].name, 'Кафе');          // 7% выше 3%
  assert.equal(best[0].value, 7);
  assert.equal(best[0].bankId, 'b2');
  assert.equal(best[0].catId, 'c3');
  assert.equal(best[1].name, 'АЗС');
  assert.deepEqual(CbLogic.bestByCategory([]), []);
  assert.deepEqual(CbLogic.bestByCategory(undefined), []);
});

test('bestByBank returns the top category of each bank', () => {
  const banks = [
    { id: 'b1', name: 'Т-Банк', cats: [{ id: 'c1', name: 'Кафе', value: 3 }, { id: 'c2', name: 'АЗС', value: 5 }] },
    { id: 'b2', name: 'Пустой', cats: [] }
  ];
  const byBank = CbLogic.bestByBank(banks);
  assert.equal(byBank.length, 2);
  assert.equal(byBank[0].bankId, 'b1');
  assert.equal(byBank[0].cat.name, 'АЗС');
  assert.equal(byBank[0].cat.value, 5);
  assert.equal(byBank[1].cat, null); // банк без категорий
});
