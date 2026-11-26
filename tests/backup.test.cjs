const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function makeStorage(){
  const data = new Map();
  return {
    get length(){ return data.size; },
    key(i){ return [...data.keys()][i] ?? null; },
    getItem(k){ return data.has(k) ? data.get(k) : null; },
    setItem(k,v){ data.set(String(k),String(v)); },
    removeItem(k){ data.delete(k); },
    dump(){ return Object.fromEntries(data); }
  };
}

function fixture(){
  const localStorage = makeStorage();
  const products = [];
  const Storage = { replaceAll(list){ products.splice(0,products.length,...list); } };
  const Config = {
    STORAGE_KEY:'fin_v3',
    TYPES:{ deposit:{}, investment:{}, debit_card:{}, credit_card:{}, loan:{}, apartment:{}, expense:{} }
  };
  const source = fs.readFileSync(require.resolve('../js/backup.js'),'utf8');
  const Backup = new Function('localStorage','Config','Storage', source + '\nreturn Backup;')(localStorage,Config,Storage);
  return { Backup, localStorage, products, Config };
}

const validProduct = () => ({ id:'p1', type:'deposit', name:'Вклад', amount:1000, operations:[], assets:[] });

test('full backup includes all app-owned data and can restore it', () => {
  const { Backup, localStorage, products } = fixture();
  localStorage.setItem('fin_v3', JSON.stringify([validProduct()]));
  localStorage.setItem('fin_cashback', JSON.stringify({ months:{'2026-11':{banks:[]}} }));
  localStorage.setItem('fin_cbDict', JSON.stringify({ banks:[], cats:[] }));
  localStorage.setItem('fin_snapshots', JSON.stringify([{ id:'s1', net:1000 }]));
  localStorage.setItem('unrelated_app_key', 'keep');
  const backup = Backup.create();
  assert.equal(backup.format, 'finance-local-backup');
  assert.equal(backup.version, 2);
  assert.ok(backup.storage.fin_cashback);
  assert.ok(backup.storage.fin_cbDict);
  assert.ok(backup.storage.fin_snapshots);
  assert.equal(backup.storage['unrelated_app_key'], undefined);

  const parsed = Backup.parse(JSON.stringify(backup));
  localStorage.setItem('fin_cashback', '{}');
  localStorage.setItem('fin_goal', '{"amount":5}');
  assert.equal(Backup.restore(parsed), 1);
  assert.deepEqual(products, [validProduct()]);
  assert.equal(localStorage.getItem('fin_cashback'), backup.storage.fin_cashback);
  assert.equal(localStorage.getItem('fin_goal'), null);
  assert.equal(localStorage.getItem('unrelated_app_key'), 'keep');
});

test('legacy product-array backup remains importable without deleting other app sections', () => {
  const { Backup, localStorage, products } = fixture();
  localStorage.setItem('fin_cashback', '{"months":{}}');
  const parsed = Backup.parse(JSON.stringify([validProduct()]));
  assert.equal(parsed.legacy, true);
  Backup.restore(parsed);
  assert.deepEqual(products, [validProduct()]);
  assert.equal(localStorage.getItem('fin_cashback'), '{"months":{}}');
});

test('invalid backups are rejected before any data is changed', () => {
  const { Backup, localStorage } = fixture();
  localStorage.setItem('fin_v3', JSON.stringify([validProduct()]));
  const before = localStorage.dump();
  assert.throws(() => Backup.parse('not json'), /корректным JSON/);
  assert.throws(() => Backup.parse(JSON.stringify([{ ...validProduct(), type:'unknown' }])), /неизвестный тип/);
  assert.throws(() => Backup.parse(JSON.stringify([{ ...validProduct(), id:'' }])), /идентификатор/);
  assert.throws(() => Backup.parse(JSON.stringify({
    format:'finance-local-backup',version:2,storage:{ fin_v3:'broken' }
  })), /повреждён/);
  assert.deepEqual(localStorage.dump(), before);
});

test('backup restore validates duplicated identifiers and unknown storage keys', () => {
  const { Backup } = fixture();
  assert.throws(() => Backup.parse(JSON.stringify([
    validProduct(), { ...validProduct(), name:'Дубликат' }
  ])), /Повторяется идентификатор/);
  assert.throws(() => Backup.parse(JSON.stringify({
    format:'finance-local-backup',version:2,storage:{
      fin_v3:JSON.stringify([validProduct()]), 'external_key':'x'
    }
  })), /некорректные данные/);
});
