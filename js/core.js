/* ============================================================
   core.js — Config, Utils, Storage
   Никаких зависимостей. Подключать первым.
   ============================================================ */

const Config = (() => {
  const TYPES = {
    deposit:     {label:'Вклад',            icon:'🏦', liability:false, hasEnd:true},
    investment:  {label:'Инвестиции',       icon:'📈', liability:false, hasEnd:true},
    debit_card:  {label:'Дебетовая карта',  icon:'💳', liability:false, hasEnd:false},
    credit_card: {label:'Кредитная карта',  icon:'💳', liability:true,  hasEnd:false},
    loan:        {label:'Кредит',           icon:'🏠', liability:true,  hasEnd:true},
    apartment:   {label:'Квартира',         icon:'🏢', liability:false, hasEnd:false},
    expense:     {label:'Обязательный расход', icon:'📌', liability:true, hasEnd:false, mandatory:true },
  };
  const FREQUENCIES = {
    once:    {label:'Разово'},
    weekly:  {label:'Еженедельно'},
    monthly: {label:'Ежемесячно'},
    yearly:  {label:'Ежегодно'},
  };
  return { TYPES, FREQUENCIES, STORAGE_KEY: 'fin_v3' };
})();

const Utils = (() => {
  const uid = () => Math.random().toString(36).slice(2,10);
  const $ = id => document.getElementById(id);
  function parseDate(s){ if(!s) return null; const [y,m,d]=s.split('-').map(Number); const dt=new Date(y,m-1,d); return isNaN(dt)?null:dt; }
  function dateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function fmtMoney(n){ return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(n); }
  function fmtPct(n){ return (n>=0?'+':'') + n.toFixed(2) + '%'; }
  function fmtDate(d){
    if(!d) return '—';
    const dt = (typeof d==='string') ? parseDate(d) : d;
    if(!dt) return '—';
    return dt.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'});
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  return { uid, $, parseDate, dateKey, fmtMoney, fmtPct, fmtDate, escapeHtml };
})();

const Storage = (() => {
  // Local-first: данные хранятся в localStorage этого браузера.
  // Для переноса между устройствами используются экспорт/импорт JSON.
  let cache = null;
  let generation = 0;
  function load(){
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(Config.STORAGE_KEY) || '[]'); }
    catch { cache = []; }
    if (!Array.isArray(cache)) cache = [];
    return cache;
  }
  function save(list){
    if (list) cache = list;
    localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(cache || []));
    generation++;
    window.dispatchEvent(new Event('dataSaved'));
  }
  function all(){ return load(); }
  function get(id){ return load().find(p => p.id === id) || null; }
  function upsert(product){
    const list = load().slice();
    const idx = list.findIndex(p => p.id === product.id);
    if (idx >= 0) list[idx] = product; else list.push(product);
    save(list);
  }
  function remove(ids){
    const set = new Set(ids);
    save(load().filter(p => !set.has(p.id)));
  }
  function hasData(){ return localStorage.getItem(Config.STORAGE_KEY) !== null; }
  function clear(){ save([]); }
  function replaceAll(list){ save(list); }
  function loadFromSeed(){
    if (Array.isArray(window.SEED_DATA) && window.SEED_DATA.length){
      save(window.SEED_DATA);
      return true;
    }
    return false;
  }
  function version(){ return generation; }
  return { all, get, upsert, remove, hasData, clear, replaceAll, loadFromSeed, save, version };
})();
