/* ============================================================
   moex.js — MOEX ISS API + ключевая ставка ЦБ
   ============================================================ */

const MoexAPI = (() => {
  const ISS = 'https://iss.moex.com/iss';
  const CBR_KEY_RATE = 'https://www.cbr-xml-daily.ru/keyrate.json';
  const CACHE_TTL = 10 * 60 * 1000;
  const cache = new Map();

  function normalizeProxyUrl(value){
    if (!value) return '';
    try {
      const url = new URL(String(value).trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return '';
      return url.origin;
    } catch { return ''; }
  }

  function getProxyUrl(){
    try { return normalizeProxyUrl(localStorage.getItem('moex_proxy_url') || ''); }
    catch { return ''; }
  }

  async function requestJSON(target, ms){
    const signal = AbortSignal.timeout(ms);
    const timedOut = new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('Тайм-аут запроса (' + Math.round(ms / 1000) + ' с)');
        error.code = 'ETIMEDOUT';
        reject(error);
      }, { once: true });
    });
    return Promise.race([
      (async () => {
        const res = await fetch(target, {
          headers: { 'Accept': 'application/json' },
          signal,
          cache: 'no-store',
          credentials: 'omit'
        });
        if (!res.ok) {
          const error = new Error('HTTP ' + res.status);
          error.status = res.status;
          throw error;
        }
        return await res.json();
      })(),
      timedOut
    ]);
  }

  async function fetchJSON(url, timeout = 12000){
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Нет подключения к интернету');
    const isMoex = url.startsWith(ISS + '/');
    if (!isMoex) return requestJSON(url, timeout);

    // При наличии личного Worker сначала идём через него: серверный fetch
    // устраняет зависимость от CORS на стороне MOEX. Прокси получает только
    // публичный URL ISS, никогда не данные портфеля или количество бумаг.
    const proxy = getProxyUrl();
    const targets = [];
    if (proxy) targets.push({ name: 'Cloudflare Worker', url: proxy + url.slice(ISS.length) });
    targets.push({ name: 'MOEX ISS', url });
    targets.push({ name: 'cors.dev', url: 'https://proxy.cors.dev/' + url });
    targets.push({ name: 'AllOrigins', url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url) });

    const failures = [];
    for (let i = 0; i < targets.length; i++){
      const target = targets[i];
      try {
        return await requestJSON(target.url, Math.max(timeout, target.name === 'MOEX ISS' ? timeout : 10000));
      } catch (error) {
        failures.push(target.name + ': ' + String(error?.message || error).slice(0, 90));
        const retryable = error instanceof TypeError
          || error?.code === 'ETIMEDOUT'
          || error?.name === 'AbortError'
          || error?.name === 'TimeoutError'
          || Number(error?.status) === 429
          || Number(error?.status) >= 500
          || /failed to fetch|networkerror|load failed|тайм-аут|timed out/i.test(String(error?.message || error));
        if (!retryable) throw error;
      }
    }
    throw new Error('Не удалось получить данные MOEX: ' + failures.join('; '));
  }

  async function testProxy(value){
    const proxy = normalizeProxyUrl(value);
    if (!proxy) throw new Error('Укажите корректный HTTPS-адрес Cloudflare Worker без пути');
    const data = await requestJSON(proxy + '/iss/engines/stock/markets/shares/securities/VTBR.json?iss.meta=off&iss.only=marketdata', 12000);
    if (!data || !data.marketdata || !Array.isArray(data.marketdata.columns) || !Array.isArray(data.marketdata.data))
      throw new Error('Worker ответил, но формат данных MOEX некорректен');
    return { ok:true, rows:data.marketdata.data.length };
  }

  function cached(key, ttl, loader){
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && (now - hit.ts) < ttl) return Promise.resolve(hit.data);
    return loader().then(data => {
      // Пустой ответ MOEX не кэшируем: следующая попытка сможет получить цену.
      if (!(key.startsWith('price:') && (!data || data.last == null))) cache.set(key, { ts: now, data });
      return data;
    });
  }

  async function searchSecurity(q){
    const url = `${ISS}/securities.json?q=${encodeURIComponent(q)}&iss.meta=off&limit=15`;
    const json = await fetchJSON(url);
    const cols = json.securities.columns;
    const rows = json.securities.data || [];
    return rows.map(r => Object.fromEntries(cols.map((c,i)=>[c, r[i]])));
  }

  const rows = block => (block?.data || []).map(r =>
    Object.fromEntries(block.columns.map((c,i) => [c, r[i]])));
  const number = v => v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;

  function chooseMarketRow(marketRows, preferredBoard){
    const usable = marketRows.filter(row =>
      [row.LAST, row.LCURRENTPRICE, row.MARKETPRICE, row.WAPRICE]
        .some(value => number(value) > 0)
    );
    if (!usable.length) return null;
    return usable.find(row => row.BOARDID === preferredBoard)
      || usable.find(row => row.IS_PRIMARY === 1 || row.IS_PRIMARY === true)
      || usable[0];
  }

  async function lastPrice(secid, board, kind){
    return cached(`price:${kind}:${board || ''}:${secid}`, CACHE_TTL, async () => {
      const metal = kind === 'metal';
      const bond = kind === 'bond';
      // Берём данные по инструменту на всём рынке, а не привязываемся
      // к одному BOARDID: режим торгов может отличаться у разных бумаг.
      const url = metal
        ? `${ISS}/engines/currency/markets/selt/securities/${encodeURIComponent(secid)}.json?iss.meta=off`
        : `${ISS}/engines/stock/markets/${bond ? 'bonds' : 'shares'}/securities/${encodeURIComponent(secid)}.json?iss.meta=off`;
      const json = await fetchJSON(url);
      const md = chooseMarketRow(rows(json.marketdata), board);
      const security = rows(json.securities)[0] || {};
      // PREVPRICE/PREVLEGALCLOSEPRICE — прошлое закрытие, не текущая цена.
      const quoted = md
        ? [md.LAST, md.LCURRENTPRICE, md.MARKETPRICE, md.WAPRICE]
            .map(number).find(value => value != null && value > 0) ?? null
        : null;
      const nominal = number(security.FACEVALUE);
      const last = quoted == null ? null : bond
        ? (nominal == null ? null : quoted * nominal / 100) : quoted;
      return {
        last, pricePercent: bond ? quoted : null, nominal,
        accruedInterest: number(security.ACCRUEDINT),
        maturityDate: security.MATDATE || null,
        currency: security.FACEUNIT || 'RUB',
        board: md?.BOARDID || board || null,
        quoteTime: md?.SYSTIME || md?.UPDATETIME || md?.TIME || null,
        updatedAt: last != null ? new Date().toISOString() : null,
      };
    });
  }

  // Цена закрытия из истории торгов (ближайшая торговая дата до dateTo)
  async function historyClose(secid, board, kind, dateFrom, dateTo){
    const metal = kind === 'metal';
    const url = metal
      ? `${ISS}/history/engines/currency/markets/selt/securities/${encodeURIComponent(secid)}.json?iss.meta=off&iss.only=history&history.columns=TRADEDATE,CLOSE&from=${dateFrom}&till=${dateTo}`
      : `${ISS}/history/engines/stock/markets/shares/boards/${encodeURIComponent(board || 'TQTF')}/securities/${encodeURIComponent(secid)}.json?iss.meta=off&iss.only=history&history.columns=TRADEDATE,CLOSE&from=${dateFrom}&till=${dateTo}`;
    const json = await fetchJSON(url, 12000);
    const page = rows(json.history);
    for (let i = page.length - 1; i >= 0; i--){
      const close = number(page[i].CLOSE);
      if (close != null && close > 0) return close;
    }
    return null;
  }

  const OUNCE_GRAM = 31.1034768;
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

  // Изменение цены за полгода: (цена сейчас / цена на 1-е число месяца
  // полгода назад − 1) × 100%. Обновляется не чаще раза в месяц.
  async function refreshSixMonth(asset){
    if (asset.kind !== 'fund' && asset.kind !== 'metal') return asset;
    const now = new Date();
    // День 1 не даёт JS перепрыгнуть через месяц на датах 29–31.
    const target = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const from = new Date(target);
    from.setDate(from.getDate() - 14);
    const baseRaw = await historyClose(asset.secid, asset.board, asset.kind, iso(from), iso(target));
    await refreshAsset(asset);
    const cur = asset.lastPrice ?? null;               // металл — уже за грамм
    // История торгов металлами (CLOSE) — в тех же рублях за грамм,
    // что и текущая котировка: пересчёт из унции не нужен.
    const base = baseRaw;
    asset.sixMonthBase = base;
    asset.sixMonthBaseDate = baseRaw != null ? iso(target) : null;
    asset.sixMonthPct = (base != null && base > 0 && cur != null) ? (cur / base - 1) * 100 : null;
    // Не считаем месяц успешным, если MOEX не вернул обе цены.
    if (base != null && base > 0 && cur != null && cur > 0){
      asset.yieldMonth = monthKey();
      asset.yieldUpdatedAt = new Date().toISOString();
    }
    return asset;
  }

  async function bondSchedule(secid){
    return cached(`schedule:${secid}`, 60 * 60 * 1000, async () => {
      const result = { coupons: [], amortizations: [] };
      const started = Date.now();
      for (const block of ['coupons', 'amortizations']) {
        let start = 0;
        while (true) {
          const url = `${ISS}/statistics/engines/stock/markets/bonds/bondization/${encodeURIComponent(secid)}.json?iss.meta=off&iss.only=${block},${block}.cursor&start=${start}&limit=100`;
          if (Date.now() - started > 8000) throw new Error('MOEX: превышено время загрузки графика');
          const json = await fetchJSON(url, 4000);
          const page = rows(json[block]);
          result[block].push(...page.map(c => ({
            date: c.coupondate || c.amortdate,
            value: number(c.value_rub ?? c.value), valuePrc: number(c.valueprc),
            startDate: c.startdate, recordDate: c.recorddate,
          })).filter(c => c.date));
          const cursor = rows(json[`${block}.cursor`])[0];
          start += page.length;
          if (!page.length || !cursor || start >= cursor.TOTAL) break;
        }
      }
      return result;
    });
  }

  async function bondCoupons(secid){ return (await bondSchedule(secid)).coupons; }

  async function bondDetails(secid, board){
    const [json, price, schedule] = await Promise.all([
      fetchJSON(`${ISS}/securities/${encodeURIComponent(secid)}.json?iss.meta=off`),
      lastPrice(secid, board, 'bond'), bondSchedule(secid),
    ]);
    const d = Object.fromEntries(rows(json.description).map(r => [r.name, r.value]));
    const description = [d.COUPON_DETAILS, d.BOND_TYPE, d.ISSUENAME].filter(Boolean).join(' · ');
    const couponType = /плавающ|переменн|флоат|floating|variable/i.test(description) ? 'floater'
      : /фиксирован|постоянн|fixed/i.test(description) ? 'fixed' : 'unknown';
    const currency = price.currency || d.FACEUNIT;
    if (!['RUB','SUR'].includes(currency)) throw new Error('Пока поддерживаются только рублёвые облигации');
    const nominal = price.nominal ?? number(d.FACEVALUE);
    const last = price.last ?? (price.pricePercent != null && nominal != null
      ? price.pricePercent * nominal / 100 : null);
    return {
      ...price, last, lastPrice: last, nominal,
      maturityDate: price.maturityDate || d.MATDATE || null,
      couponType, couponDescription: d.COUPON_DETAILS || d.BOND_TYPE || 'Тип купона не указан MOEX',
      couponRate: number(d.COUPONPERCENT), couponAmount: number(d.COUPONVALUE),
      couponFreq: number(d.COUPONFREQUENCY), nextCouponDate: d.COUPONDATE || null,
      ...schedule, ...(price.last != null ? { moexUpdatedAt: price.updatedAt } : {}), priceUnit: 'rub',
    };
  }

  async function refreshAsset(asset){
    const board = asset.board || (asset.kind === 'bond' ? 'TQOB' : asset.kind === 'fund' ? 'TQTF' : 'TQBR');
    if (asset.kind === 'bond') {
      const details = await bondDetails(asset.secid, board);
      // Не заменяем сохранённую рублёвую цену пустой котировкой.
      if (details.lastPrice == null) delete details.lastPrice;
      Object.assign(asset, details);
      if (details.board) asset.board = details.board;
    } else if (asset.kind === 'metal') {
      // Котировка MOEX (GLDRUB_TOM и др.) уже выражена в рублях за 1 грамм —
      // никакого пересчёта из унции не нужно. Унция — только справочно.
      const price = await lastPrice(asset.secid, board, 'metal');
      if (price?.last != null){
        asset.lastPrice = price.last;
        asset.moexUpdatedAt = price.updatedAt;
        if (price.board) asset.board = price.board;
        asset.ouncePrice = price.last * OUNCE_GRAM;
        asset.unit = 'gram';
      }
    } else {
      const price = await lastPrice(asset.secid, board, asset.kind === 'fund' ? 'fund' : 'stock');
      if (price?.last != null){
        asset.lastPrice = price.last;
        asset.moexUpdatedAt = price.updatedAt;
        if (price.board) asset.board = price.board;
      }
    }
    return asset;
  }

  async function keyRate(){
    return cached('cbr:keyrate', 60 * 60 * 1000, async () => {
      try {
        const data = await fetchJSON(CBR_KEY_RATE);
        return { rate: Number(data.rate) || null, date: data.date };
      } catch (e) {
        console.warn('Не удалось получить ключевую ставку:', e);
        return null;
      }
    });
  }

  return { searchSecurity, lastPrice, bondCoupons, bondDetails, bondSchedule, refreshAsset, refreshSixMonth, monthKey, keyRate, chooseMarketRow, normalizeProxyUrl, getProxyUrl, testProxy };
})();
if (typeof module !== 'undefined') module.exports = MoexAPI;
