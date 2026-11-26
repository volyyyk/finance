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
          let detail = '';
          try {
            const body = await res.text();
            if (body) {
              try {
                const parsed = JSON.parse(body);
                detail = parsed.detail || parsed.error || parsed.message || body;
              } catch { detail = body; }
            }
          } catch {}
          const upstream = res.headers?.get?.('X-MOEX-Upstream-Status');
          const suffix = String(detail || '').replace(/\s+/g, ' ').slice(0, 240);
          const error = new Error('HTTP ' + res.status
            + (upstream ? ' (MOEX upstream ' + upstream + ')' : '')
            + (suffix ? ': ' + suffix : ''));
          error.status = res.status;
          error.upstreamStatus = upstream ? Number(upstream) : null;
          throw error;
        }
        // Native Fetch Response exposes text(); the json() branch also keeps
        // small test doubles and compatible fetch implementations working.
        if (typeof res.text !== 'function') {
          const data = await res.json();
          if (!data || typeof data !== 'object') throw new Error('MOEX ISS вернул пустой или некорректный JSON');
          return data;
        }
        const body = await res.text();
        let data;
        try { data = JSON.parse(body); }
        catch {
          const contentType = res.headers?.get?.('content-type') || 'не указан';
          throw new Error('Ответ не является JSON (Content-Type: ' + contentType + '): '
            + String(body).replace(/\s+/g, ' ').slice(0, 180));
        }
        if (!data || typeof data !== 'object') throw new Error('MOEX ISS вернул пустой или некорректный JSON');
        return data;
      })(),
      timedOut
    ]);
  }

  function compactIssUrl(value){
    const parsed = new URL(value);
    parsed.searchParams.set('iss.json', 'compact');
    parsed.searchParams.set('iss.version', 'on');
    return parsed.toString();
  }

  async function fetchJSON(url, timeout = 12000){
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Нет подключения к интернету');
    const isMoex = url.startsWith(ISS + '/');
    if (!isMoex) return requestJSON(url, timeout);

    // Фиксируем документированный формат compact; версия ответа помогает
    // диагностировать изменения схемы на стороне ISS.
    const requestUrl = compactIssUrl(url);
    const proxy = getProxyUrl();
    const targets = [];
    if (proxy) targets.push({ name: 'Cloudflare Worker', url: proxy + '/iss' + requestUrl.slice(ISS.length) });
    targets.push({ name: 'MOEX ISS', url: requestUrl });
    targets.push({ name: 'cors.dev', url: 'https://proxy.cors.dev/' + requestUrl });
    targets.push({ name: 'AllOrigins', url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(requestUrl) });

    const failures = [];
    for (const target of targets){
      try {
        return await requestJSON(target.url, Math.max(timeout, target.name === 'MOEX ISS' ? timeout : 10000));
      } catch (error) {
        failures.push(target.name + ': ' + String(error?.message || error).slice(0, 260));
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
    throw new Error('Не удалось получить данные MOEX. Проверены: ' + failures.join(' | '));
  }

  async function testProxy(value){
    const proxy = normalizeProxyUrl(value);
    if (!proxy) throw new Error('Укажите корректный HTTPS-адрес Cloudflare Worker без пути');
    const data = await requestJSON(proxy + '/iss/engines/stock/markets/shares/securities/VTBR.json?iss.meta=off&iss.only=marketdata', 12000);
    const marketdata = parseBlock(data?.marketdata);
    if (!marketdata)
      throw new Error('Worker ответил, но блок marketdata не соответствует формату ISS compact/extended');
    return { ok:true, rows:marketdata.data.length };
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
    return requireRows(json, 'securities');
  }

  function parseBlock(block){
    // Обычный ISS JSON (compact и extended): { columns: [], data: [] }.
    if (block && !Array.isArray(block)
      && Array.isArray(block.columns) && Array.isArray(block.data)
      && block.columns.every(column => typeof column === 'string')
      && block.data.every(row => Array.isArray(row))) {
      return { columns: block.columns, data: block.data };
    }
    // Совместимость с компактным позиционным представлением [columns, data].
    if (Array.isArray(block) && block.length >= 2
      && Array.isArray(block[0]) && block[0].every(column => typeof column === 'string')
      && Array.isArray(block[1]) && block[1].every(row => Array.isArray(row))) {
      return { columns: block[0], data: block[1] };
    }
    return null;
  }

  const rows = block => {
    const parsed = parseBlock(block);
    return parsed ? parsed.data.map(row =>
      Object.fromEntries(parsed.columns.map((column, index) => [column, row[index]]))) : [];
  };

  function requireRows(json, blockName){
    const parsed = parseBlock(json?.[blockName]);
    if (!parsed) {
      const keys = json && typeof json === 'object' ? Object.keys(json).join(', ') : 'нет';
      throw new Error('MOEX ISS: блок "' + blockName + '" отсутствует или имеет неизвестную структуру (получены блоки: ' + keys + ')');
    }
    return parsed.data.map(row =>
      Object.fromEntries(parsed.columns.map((column, index) => [column, row[index]])));
  }
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
      const md = chooseMarketRow(requireRows(json, 'marketdata'), board);
      const security = requireRows(json, 'securities')[0] || {};
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
    const page = requireRows(json, 'history');
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

  return { searchSecurity, lastPrice, bondCoupons, bondDetails, bondSchedule, refreshAsset, refreshSixMonth, monthKey, keyRate, chooseMarketRow, parseBlock, normalizeProxyUrl, getProxyUrl, testProxy };
})();
if (typeof module !== 'undefined') module.exports = MoexAPI;
