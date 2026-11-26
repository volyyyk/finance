/* ============================================================
   core.js — Config, Utils, Storage
   Никаких зависимостей. Подключать первым.
   ============================================================ */

const Config = (() => {
  const TYPES = {
    deposit:     {label:'Вклад',            icon:'banknote', liability:false, hasEnd:true},
    investment:  {label:'Инвестиции',       icon:'chart', liability:false, hasEnd:true},
    debit_card:  {label:'Дебетовая карта',  icon:'credit-card', liability:false, hasEnd:false},
    credit_card: {label:'Кредитная карта',  icon:'credit-card', liability:true,  hasEnd:false},
    loan:        {label:'Кредит',           icon:'house', liability:true,  hasEnd:true},
    apartment:   {label:'Квартира',         icon:'building', liability:false, hasEnd:false},
    expense:     {label:'Обязательный расход', icon:'receipt', liability:true, hasEnd:false, mandatory:true },
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
  const ICONS = {
    banknote:'<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9h.01M17 15h.01"/>',
    chart:'<path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/><path d="M17 6h3v3"/>',
    wallet:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 9h18M16 14h2"/>',
    'credit-card':'<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
    house:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-6h6v6"/>',
    building:'<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M10 21v-3h4v3"/>',
    receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    flag:'<path d="M5 21V4"/><path d="M5 4c5-3 8 3 14 0v10c-6 3-9-3-14 0"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    archive:'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8m-8 4h2"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    bookmark:'<path d="M6 4h12v17l-6-4-6 4z"/>',
    pencil:'<path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    'chart-pie':'<path d="M11 3a9 9 0 1 0 10 10H11z"/><path d="M14 3v7h7a9 9 0 0 0-7-7z"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.5-3"/>',
    'arrow-down-left':'<path d="M17 7 7 17M7 8v9h9"/>',
    'arrow-up-right':'<path d="M7 17 17 7M8 7h9v9"/>',
    workflow:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M10 6h4a2 2 0 0 1 2 2v6"/>',
    'chevron-down':'<path d="m6 9 6 6 6-6"/>',
    settings:'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4 1.4-1.1a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1 0 2Z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    moon:'<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M4 17v4h16v-4"/>',
    upload:'<path d="M12 15V3m-5 5 5-5 5 5"/><path d="M4 17v4h16v-4"/>',
    trash:'<path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
    'file-text':'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6m-6 4h6"/>',
    list:'<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    percent:'<path d="m19 5-14 14"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    'plus-circle':'<circle cx="12" cy="12" r="9"/><path d="M12 8v8m-4-4h8"/>',
    sparkles:'<path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/>'
  };
  function iconSvg(name,size=18,className=''){
    return '<svg class="ui-icon '+className+'" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(ICONS[name]||ICONS.sparkles)+'</svg>';
  }
  function parseDate(s){ if(!s) return null; const [y,m,d]=s.split('-').map(Number); const dt=new Date(y,m-1,d); return isNaN(dt)?null:dt; }
  function dateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  const OFFICIAL_FUND_NAMES = {
    'RU000A1045N8': 'БПИФ Альфа Капитал Золото',
    'RU000A101PN3': 'БПИФ Альфа Управляем облигации',
    'RU000A102E78': 'БПИФ Альфа Управляем Акции',
    'RU000A1014L8': 'БПИФ Ликвидность УК ВИМ'
  };
  function officialAssetName(asset){
    if (!asset || asset.kind !== 'fund') return '';
    const isin = String(asset.isin || asset.ISIN || '').trim().toUpperCase();
    if (isin && OFFICIAL_FUND_NAMES[isin]) return OFFICIAL_FUND_NAMES[isin];
    const ticker = String(asset.secid || '').trim().toUpperCase();
    const byTicker = {
      AKGD: 'БПИФ Альфа Капитал Золото',
      AKMB: 'БПИФ Альфа Управляем облигации',
      AKME: 'БПИФ Альфа Управляем Акции',
      LQDT: 'БПИФ Ликвидность УК ВИМ'
    };
    return byTicker[ticker] || '';
  }
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
  return { uid, $, parseDate, dateKey, fmtMoney, fmtPct, fmtDate, escapeHtml, iconSvg, officialAssetName };
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
