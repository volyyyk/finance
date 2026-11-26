/* ============================================================
   vim.js — официальные данные открытых ПИФ Яндекс Пэй / ВИМ
   Источник: wealthim.ru; проксирование только двух разрешённых фондов.
   ============================================================ */
const VIMAPI = (() => {
  const DEFAULT_WORKER = 'https://autumn-mouse-2e3f.kudrin-dim11.workers.dev';
  const FUNDS = {
    '8000': { secid:'PIF8000', name:'Яндекс Пэй — Фонд акций и облигаций' },
    '8002': { secid:'PIF8002', name:'Яндекс Пэй — Фонд рублёвых облигаций' }
  };
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  function workerUrl(){
    try {
      const configured = localStorage.getItem('moex_proxy_url');
      if (configured) {
        const url = new URL(configured);
        if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash &&
            (url.pathname === '/' || url.pathname === '')) return url.origin;
      }
    } catch {}
    return DEFAULT_WORKER;
  }
  async function fetchFund(rulesNumber){
    if (!FUNDS[String(rulesNumber)]) throw new Error('Неизвестный номер правил ПИФ');
    const response = await fetch(workerUrl() + '/vim/' + encodeURIComponent(rulesNumber), {
      headers:{ Accept:'application/json' }, cache:'no-store', credentials:'omit',
      signal:AbortSignal.timeout(12000)
    });
    const body = await response.text();
    let data;
    try { data = JSON.parse(body); }
    catch { throw new Error('VIM вернул не JSON: ' + body.replace(/\\s+/g,' ').slice(0,160)); }
    if (!response.ok) throw new Error(data.error || ('VIM HTTP ' + response.status));
    if (!data || !Array.isArray(data.history) || !data.history.length) throw new Error('ВИМ не вернул историю фонда');
    return data;
  }
  function applyHistory(asset, data){
    const merged = new Map();
    for (const point of [...(asset.vimHistory || []), ...data.history]) {
      if (!point || !/^\\d{4}-\\d{2}-\\d{2}$/.test(point.date) || !(number(point.price) > 0)) continue;
      merged.set(point.date, { date:point.date, price:number(point.price), nav:number(point.nav) });
    }
    asset.vimHistory = [...merged.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-500);
    const current = asset.vimHistory[asset.vimHistory.length-1];
    if (!current || current.date < String(asset.navDate || '').split('.').reverse().join('-')) return;
    asset.lastPrice = current.price;
    asset.nav = current.nav;
    asset.navDate = current.date.split('-').reverse().join('.');
    asset.quoteSource = 'vim';
    asset.rulesNumber = String(data.fundId);
    asset.vimSource = data.source;
    asset.vimFetchedAt = data.fetchedAt || new Date().toISOString();
    const now = new Date();
    let base = null;
    for (const months of [12,6,3,1]) {
      const target = new Date(now.getFullYear(), now.getMonth()-months, now.getDate());
      const key = target.toISOString().slice(0,10);
      const candidate = asset.vimHistory.filter(p=>p.date<=key).at(-1);
      if (candidate && candidate.price>0) { base={months,point:candidate}; break; }
    }
    if (!base) base = asset.vimHistory.length > 1
      ? { months: Math.max(1, Math.round((Date.parse(current.date)-Date.parse(asset.vimHistory[0].date))/2629800000)), point:asset.vimHistory[0] }
      : null;
    asset.historyMonths = base?.months ?? null;
    asset.historyBase = base?.point.price ?? null;
    asset.historyBaseDate = base?.point.date ?? null;
    asset.historyPct = base ? (current.price/base.point.price-1)*100 : null;
    asset.historyAnnualPct = base && base.months>0
      ? (Math.pow(current.price/base.point.price,12/base.months)-1)*100 : null;
    asset.sixMonthBase = asset.historyBase;
    asset.sixMonthBaseDate = asset.historyBaseDate;
    asset.sixMonthPct = asset.historyPct;
    asset.yieldMonth = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    asset.yieldUpdatedAt = new Date().toISOString();
    asset.vimError = null;
    return asset;
  }
  async function refreshAsset(asset){
    const id = String(asset?.rulesNumber || '').replace(/[^0-9]/g,'');
    if (!FUNDS[id]) return asset;
    const data = await fetchFund(id);
    if (!(number(data.price)>0) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(data.date || '')) {
      throw new Error('ВИМ вернул некорректную стоимость пая или дату');
    }
    data.history = [...data.history, {date:data.date,price:data.price,nav:data.nav}];
    return applyHistory(asset,data);
  }
  function isVimAsset(asset){
    return !!asset && !!FUNDS[String(asset.rulesNumber || '').replace(/[^0-9]/g,'')];
  }
  return { FUNDS, fetchFund, refreshAsset, isVimAsset };
})();
