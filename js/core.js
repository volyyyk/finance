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
  let cache = null;
  let revision = null;
  let syncing = false;
  let generation = 0;
  let initialized = false;
  let dirty = localStorage.getItem('fin_pending') === '1';
  function status(message){
    const el = document.getElementById('syncStatus');
    if (el) el.textContent = message;
  }
  async function sync(){
    if (syncing || !navigator.onLine) return;
    syncing = true;
    try {
      const response = await fetch('/api/portfolio', {cache:'no-store'});
      if (!response.ok) throw new Error();
      const remote = await response.json();
      const previousRevision = revision ?? Number(localStorage.getItem('fin_revision') || 0);
      if (dirty && previousRevision !== remote.revision && remote.revision !== 0) {
        status('Конфликт сохранений: сделайте экспорт, затем откройте облачную версию в настройках');
        return;
      }
      revision = remote.revision;
      if (!initialized && remote.revision === 0 && load().length) dirty = true;
      initialized = true;
      if (!dirty) {
        cache = remote.products;
        generation++; // данные изменились извне — кэши расчётов сбрасываются
        localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(cache));
        localStorage.setItem('fin_revision', String(revision));
        window.dispatchEvent(new Event('remoteData'));
      }
      while (dirty) {
        const currentGeneration = generation;
        const saved = await fetch('/api/portfolio', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({products:load(), revision})});
        if (saved.status === 409) { status('Данные изменены в другой вкладке. Сделайте экспорт, затем откройте облачную версию'); return; }
        if (!saved.ok) throw new Error();
        revision = (await saved.json()).revision;
        localStorage.setItem('fin_revision', String(revision));
        if (generation === currentGeneration) {
          dirty = false;
          localStorage.removeItem('fin_pending');
        }
      }
      status('Сохранено в облаке · доступ привязан к этому браузеру');
    } catch { status('Нет связи с облаком · изменения ожидают отправки'); }
    finally { syncing = false; }
  }
  async function useRemote(){
    if (syncing) return;
    if (!confirm('Заменить локальные изменения облачной версией? Если нужна локальная копия, сначала сделайте экспорт.')) return;
    syncing = true;
    const currentGeneration = generation;
    try {
      const response = await fetch('/api/portfolio', {cache:'no-store'});
      if (!response.ok) throw new Error();
      const remote = await response.json();
      if (currentGeneration !== generation) { status('Во время загрузки появились изменения. Повторите действие'); return; }
      cache = remote.products; revision = remote.revision; dirty = false; initialized = true;
      generation++; // данные изменились извне — кэши расчётов сбрасываются
      localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(cache));
      localStorage.setItem('fin_revision', String(revision));
      localStorage.removeItem('fin_pending');
      window.dispatchEvent(new Event('remoteData'));
      status('Облачная версия загружена');
    } catch { status('Не удалось загрузить облачную версию'); }
    finally { syncing = false; if (dirty) void sync(); }
  }
  function load(){
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(Config.STORAGE_KEY) || '[]'); }
    catch(e){ cache = []; }
    return cache;
  }
  function save(list){
    if (list) cache = list;
    localStorage.setItem(Config.STORAGE_KEY, JSON.stringify(cache || []));
    generation++; dirty = true;
    localStorage.setItem('fin_pending', '1');
    window.dispatchEvent(new Event('dataSaved'));
    if (initialized) void sync();
  }
  function all(){ return load(); }
  function get(id){ return load().find(p=>p.id===id) || null; }
  function upsert(product){
    const list = load().slice();
    const idx = list.findIndex(p=>p.id===product.id);
    if (idx>=0) list[idx] = product; else list.push(product);
    save(list);
  }
  function remove(ids){
    const set = new Set(ids);
    save(load().filter(p=>!set.has(p.id)));
  }
  function hasData(){ return localStorage.getItem(Config.STORAGE_KEY) !== null; }
  function clear(){ save([]); }
  function replaceAll(list){ save(list); }
  // Пытается загрузить данные из data/seed.js (window.SEED_DATA)
  function loadFromSeed(){
    if (Array.isArray(window.SEED_DATA) && window.SEED_DATA.length){
      save(window.SEED_DATA);
      return true;
    }
    return false;
  }
  // Версия данных: растёт при каждом изменении списка продуктов.
  // Используется как ключ кэша тяжёлых расчётов (Stats, Simulator, Events).
  function version(){ return generation; }
  return { all, get, upsert, remove, hasData, clear, replaceAll, loadFromSeed, save, sync, useRemote, version };
})();