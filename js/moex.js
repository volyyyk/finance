/* ============================================================
   moex.js — MOEX ISS API + ключевая ставка ЦБ
   ============================================================ */

const MoexAPI = (() => {
  const ISS = 'http://iss.moex.com/iss';
  const CBR_KEY_RATE = 'https://www.cbr-xml-daily.ru/keyrate.json';
  const DEFAULT_MOEX_PROXY = 'https://autumn-mouse-2e3f.kudrin-dim11.workers.dev';
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
    try {
      const configured = localStorage.getItem('moex_proxy_url');
      return normalizeProxyUrl(configured || DEFAULT_MOEX_PROXY) || DEFAULT_MOEX_PROXY;
    } catch { return DEFAULT_MOEX_PROXY; }
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
    // String-based query update also works in the lightweight VM used by tests,
    // where the browser URL constructor is intentionally not injected.
    const hashAt = value.indexOf('#');
    const hash = hashAt >= 0 ? value.slice(hashAt) : '';
    const withoutHash = hashAt >= 0 ? value.slice(0, hashAt) : value;
    const queryAt = withoutHash.indexOf('?');
    const path = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash;
    const query = queryAt >= 0 ? withoutHash.slice(queryAt + 1) : '';
    const params = query.split('&').filter(part =>
      part && !part.startsWith('iss.json=') && !part.startsWith('iss.version='));
    params.push('iss.json=compact', 'iss.version=on');
    return path + '?' + params.join('&') + hash;
  }

  async function fetchJSON(url, timeout = 30000){
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Нет подключения к интернету');
    const isMoex = url.startsWith(ISS + '/');
    if (!isMoex) return requestJSON(url, timeout);

    // Фиксируем документированный формат compact; версия ответа помогает
    // диагностировать изменения схемы на стороне ISS.
    const requestUrl = compactIssUrl(url);
    const proxy = getProxyUrl();
    const targets = [];
    // Все обращения к самому MOEX используют HTTP (официальный протокол ISS).
    // На HTTPS-странице браузер блокирует прямой fetch к HTTP как mixed content,
    // поэтому сначала идём через HTTPS Worker, который обращается к MOEX по HTTP.
    if (proxy) targets.push({ name: 'Cloudflare Worker (HTTP upstream)', url: proxy + '/iss' + requestUrl.slice(ISS.length) });
    targets.push({ name: 'MOEX ISS HTTP (direct; may be blocked by mixed-content policy)', url: requestUrl });
    // Резервные HTTPS-реле также получают именно HTTP-адрес MOEX как upstream.
    targets.push({ name: 'cors.dev (HTTP upstream)', url: 'https://proxy.cors.dev/' + requestUrl });
    targets.push({ name: 'AllOrigins (HTTP upstream)', url: 'https://api.allorigins.win/raw?url=' + encodeURIComponent(requestUrl) });

    const failures = [];
    const deadline = Date.now() + Math.max(1000, timeout);
    for (const target of targets){
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      try {
        return await requestJSON(target.url, Math.min(8000, remaining));
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
    const elapsed = Math.max(0, timeout - Math.max(0, deadline - Date.now()));
    throw new Error('Не удалось получить данные MOEX за ' + Math.ceil(elapsed / 1000) + ' с. Проверены: ' + failures.join(' | '));
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
    const query = String(q || '').trim();
    if (!query) return [];
    const url = `${ISS}/securities.json?q=${encodeURIComponent(query)}&iss.meta=off&limit=50`;
    const json = await fetchJSON(url);
    const rows = requireRows(json, 'securities').map(row => {
      const secid = row.secid ?? row.SECID ?? '';
      const shortname = row.shortname ?? row.SHORTNAME ?? row.name ?? row.NAME ?? secid;
      const fullname = row.secname ?? row.SECNAME ?? row.fullname ?? row.FULLNAME ?? row.latinname ?? row.LATINNAME ?? '';
      return {
        ...row, secid, shortname, fullname,
        type: row.type ?? row.TYPE ?? '',
        primary_boardid: row.primary_boardid ?? row.PRIMARY_BOARDID ?? row.primary_board ?? '',
        isin: String(row.isin ?? row.ISIN ?? row.isin_code ?? row.ISINCODE ?? '').trim().toUpperCase()
      };
    });
    const normalize = value => String(value || '').toLocaleLowerCase('ru').replace(/[ё]/g,'е').replace(/[^a-zа-я0-9]/gi,'');
    const needle = normalize(query);
    const score = row => {
      const ticker = normalize(row.secid), short = normalize(row.shortname), full = normalize(row.fullname), isin = normalize(row.isin);
      if (ticker === needle || isin === needle) return 100;
      if (short === needle || full === needle) return 90;
      if (ticker.startsWith(needle)) return 80;
      if (short.startsWith(needle) || full.startsWith(needle)) return 70;
      if (ticker.includes(needle) || short.includes(needle) || full.includes(needle) || isin.includes(needle)) return 50;
      return 0;
    };
    return rows.sort((a,b) => score(b)-score(a));
  }

  async function securityMetadata(secid){
    return cached(`security-meta:${secid}`, 24 * 60 * 60 * 1000, async () => {
      const json = await fetchJSON(`${ISS}/securities/${encodeURIComponent(secid)}.json?iss.meta=off`);
      const info = rows(json.securities)[0] || {};
      return {
        shortname: info.SHORTNAME || info.SHORTNAME_RUS || '',
        fullname: info.SECNAME || info.FULLNAME || '',
        isin: String(info.ISIN || '').trim().toUpperCase()
      };
    });
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
      || usable.find(row => Number(row.IS_PRIMARY) === 1)
      || usable[0];
  }

  async function tradableMarkets(secid, kind){
    if (!['stock','fund','bond'].includes(kind)) return [];
    const expectedMarket = kind === 'bond' ? 'bonds' : 'shares';
    const json = await fetchJSON(`${ISS}/securities/${encodeURIComponent(secid)}/boards.json?iss.meta=off`, 8000);
    const available = requireRows(json, 'boards').filter(row => {
      const engine = String(row.engine ?? row.ENGINE ?? '').toLowerCase();
      const market = String(row.market ?? row.MARKET ?? '').toLowerCase();
      const board = String(row.boardid ?? row.BOARDID ?? '').toUpperCase();
      const traded = row.is_traded ?? row.IS_TRADED;
      // Только обычные биржевые режимы TQ*. Активные режимы РЕПО
      // не означают, что бумагу можно купить/продать на основном рынке.
      return engine === 'stock' && market === expectedMarket && /^TQ[A-Z0-9]+$/.test(board)
        && (traded === true || Number(traded) === 1);
    });
    available.sort((a,b) => Number(b.is_primary === 1 || b.is_primary === true)
      - Number(a.is_primary === 1 || a.is_primary === true));
    const unique = [];
    for (const row of available){
      const engine = String(row.engine ?? row.ENGINE).toLowerCase();
      const market = String(row.market ?? row.MARKET).toLowerCase();
      const board = String(row.boardid ?? row.BOARDID).toUpperCase();
      if (!unique.some(x => x.engine === engine && x.market === market && x.board === board))
        unique.push({ engine, market, board });
    }
    return unique;
  }

  async function assertTradable(secid, kind){
    if (!['stock','fund','bond'].includes(kind)) return true;
    const markets = await tradableMarkets(secid, kind);
    if (!markets.length)
      throw new Error('MOEX не допускает эту бумагу к обычным биржевым торгам. Закрытые или снятые с торгов инструменты добавить нельзя.');
    return markets[0];
  }

  async function resolveMarkets(secid, preferredBoard, kind){
    const fallback = kind === 'metal'
      ? [{ engine:'currency', market:'selt', board:preferredBoard || 'CETS' }]
      : [{ engine:'stock', market:kind === 'bond' ? 'bonds' : 'shares',
          board:preferredBoard || (kind === 'bond' ? 'TQOB' : kind === 'fund' ? 'TQTF' : 'TQBR') }];
    if (kind !== 'fund') return fallback;
    try {
      const available = await tradableMarkets(secid, kind);
      // Успешный ответ без действующих TQ-режимов означает, что торги прекращены.
      return available;
    } catch (error) {
      console.warn('MOEX board discovery failed for ' + secid, error);
      return fallback;
    }
  }
  async function resolveMarket(secid, preferredBoard, kind){
    return (await resolveMarkets(secid, preferredBoard, kind))[0];
  }

  async function lastPrice(secid, board, kind){
    return cached(`price:${kind}:${board || ''}:${secid}`, CACHE_TTL, async () => {
      const bond = kind === 'bond';
      const markets = await resolveMarkets(secid, board, kind);
      let selected = null, security = {};
      if (kind !== 'fund'){
        // Stable, known route for shares, bonds and metals.
        const market = markets[0];
        const url = `${ISS}/engines/${encodeURIComponent(market.engine)}/markets/${encodeURIComponent(market.market)}/boards/${encodeURIComponent(market.board)}/securities/${encodeURIComponent(secid)}.json?iss.meta=off`;
        const json = await fetchJSON(url, 30000);
        const md = chooseMarketRow(requireRows(json, 'marketdata'), market.board);
        security = requireRows(json, 'securities')[0] || {};
        if (md) selected = { md, market };
      } else {
        // Funds may have multiple boards (e.g. TQTE and TQTF). Query market
        // level first, then choose a board that actually has a live quote.
        const visitedMarkets = new Set();
        for (const market of markets){
          const marketKey = market.engine + '/' + market.market;
          if (visitedMarkets.has(marketKey)) continue;
          visitedMarkets.add(marketKey);
          const base = `${ISS}/engines/${encodeURIComponent(market.engine)}/markets/${encodeURIComponent(market.market)}`;
          try {
            const json = await fetchJSON(`${base}/securities/${encodeURIComponent(secid)}.json?iss.meta=off`, 12000);
            const md = chooseMarketRow(requireRows(json, 'marketdata'), board);
            security = requireRows(json, 'securities')[0] || security;
            if (md){ selected = { md, market }; break; }
          } catch (error) {
            console.warn('MOEX market quote lookup failed for ' + secid, error);
          }
        }
        if (!selected){
          const market = markets[0];
          const url = `${ISS}/engines/${encodeURIComponent(market.engine)}/markets/${encodeURIComponent(market.market)}/boards/${encodeURIComponent(market.board)}/securities/${encodeURIComponent(secid)}.json?iss.meta=off`;
          const json = await fetchJSON(url, 8000);
          const md = chooseMarketRow(requireRows(json, 'marketdata'), market.board);
          security = requireRows(json, 'securities')[0] || security;
          if (md) selected = { md, market };
        }
      }
      const md = selected?.md || null;
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
        board: md?.BOARDID || selected?.market?.board || board || null,
        quoteTime: md?.SYSTIME || md?.UPDATETIME || md?.TIME || null,
        updatedAt: last != null ? new Date().toISOString() : null,
      };
    });
  }

  // Дневное закрытие берём из публичного интерфейса свечей ISS.
  // /iss/history для большинства бумаг доступен только подписчикам MOEX,
  // поэтому анонимный клиент получал пустые блоки даже при исправной сети.
  // Candles возвращает begin/close; для фондов запрашиваем рынок целиком,
  // чтобы не зависеть от одного режима торгов (TQTE/TQTF и т.п.).
  // Дневные свечи доступны в публичном ISS namespace. Для фондов сначала
  // запрашиваем свечи на уровне рынка (без board): разные ETF/БПИФ могут
  // иметь нестандартный или меняющийся режим торгов TQTF/TQTE, а board-level
  // endpoint в таком случае возвращает пустой candles.data при живых котировках.
  // Если рыночный endpoint пуст, последовательно пробуем конкретные boards.
  async function historyClose(secid, board, kind, dateFrom, dateTo, nominal){
    const markets = kind === 'metal'
      ? [{ engine:'currency', market:'selt', board:board || 'CETS' }]
      : await resolveMarkets(secid, board, kind);
    const candidates = markets.length ? markets : (kind === 'fund'
      ? [{ engine:'stock', market:'shares', board:board || 'TQTF' }]
      : []);
    const visitedMarkets = new Set(), visitedBoards = new Set();

    async function readCandles(market, selectedBoard){
      const root = ISS + '/engines/' + encodeURIComponent(market.engine) + '/markets/' + encodeURIComponent(market.market);
      const route = selectedBoard ? '/boards/' + encodeURIComponent(selectedBoard) : '';
      const base = root + route + '/securities/' + encodeURIComponent(secid) + '/candles.json';
      const params = ['iss.meta=off','iss.only=candles','candles.columns=begin,close',
        'interval=24','start=0','from='+encodeURIComponent(dateFrom),'till='+encodeURIComponent(dateTo)];
      const json = await fetchJSON(base+'?'+params.join('&'),12000);
      return requireRows(json,'candles').map(row=>({
        date:String(row.begin||row.BEGIN||'').slice(0,10),close:number(row.close??row.CLOSE)
      })).filter(row=>row.date&&row.date<=dateTo&&row.date>=dateFrom&&row.close>0)
        .sort((a,b)=>b.date.localeCompare(a.date));
    }

    for(const market of candidates){
      const marketKey=market.engine+'/'+market.market;
      if(kind==='fund'&&!visitedMarkets.has(marketKey)){
        visitedMarkets.add(marketKey);
        try{
          const candles=await readCandles(market,null);
          if(candles.length)return candles[0].close;
        }catch(error){
          console.warn('MOEX market-level candles lookup failed for '+secid+' on '+marketKey,error);
        }
      }
      const selectedBoard=market.board||board;
      if(!selectedBoard)continue;
      const boardKey=marketKey+'/'+selectedBoard;
      if(visitedBoards.has(boardKey))continue;
      visitedBoards.add(boardKey);
      try{
        const candles=await readCandles(market,selectedBoard);
        if(candles.length){
          const close=candles[0].close;
          return kind==='bond'?close*(Number(nominal)||1000)/100:close;
        }
      }catch(error){
        console.warn('MOEX board-level candles lookup failed for '+secid+' on '+boardKey,error);
      }
    }
    return null;
  }

  const OUNCE_GRAM = 31.1034768;
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

  // Изменение цены за последние 6 месяцев. Применяется к акциям,
  // фондам, облигациям и металлам; облигационные купоны моделируются отдельно.
  function annualizeTrend(base, current, months){
    if (!(Number(base) > 0) || !(Number(current) >= 0) || !(Number(months) > 0)) return null;
    const ratio = Number(current) / Number(base);
    if (ratio <= 0) return -100;
    return (Math.pow(ratio, 12 / Number(months)) - 1) * 100;
  }

  // Выбираем максимально длинную доступную историю: 12, 6, 3 или 1 месяц.
  // Короткий ряд не отбрасываем — пересчитываем его темп в эффективный годовой.
  async function refreshSixMonth(asset){
    if (!['stock','fund','bond','metal'].includes(asset.kind) || asset.moexInactive || asset.quoteSource === 'manual') return asset;
    // Сначала проверяем известные закрытые/переименованные инструменты:
    // сохранённая свежая дата старой котировки не должна обходить миграцию.
    if (asset.kind === 'fund' && (asset.secid === 'VTBL' || asset.secid === 'RSHL'))
      await refreshAsset(asset);
    if (asset.moexInactive) return asset;
    const quoteTimeBefore = Date.parse(asset.moexUpdatedAt || '');
    const quoteAlreadyFresh = Number.isFinite(quoteTimeBefore) && Date.now() - quoteTimeBefore < 10 * 60 * 1000;
    // refreshAsset populates missing bond nominal/board metadata as well as a live quote.
    if (!quoteAlreadyFresh) await refreshAsset(asset);
    if (asset.moexInactive || asset.quoteSource === 'manual') return asset;
    const quoteTime = Date.parse(asset.moexUpdatedAt || '');
    const quoteIsFresh = Number.isFinite(quoteTime) && Date.now() - quoteTime < 10 * 60 * 1000;
    const cur = quoteIsFresh ? (asset.lastPrice ?? null) : null;
    if (!(cur >= 0)){
      asset.historyMonths = null; asset.historyPct = null; asset.historyAnnualPct = null;
      return asset;
    }
    const now = new Date();
    let selected = null;
    for (const months of [12,6,3,1]){
      const target = new Date(now.getFullYear(), now.getMonth() - months, 1);
      const from = new Date(target); from.setDate(from.getDate() - 14);
      const base = await historyClose(asset.secid, asset.board, asset.kind, iso(from), iso(target), asset.nominal);
      if (base != null && base > 0){
        selected = { months, base, date: iso(target) };
        break;
      }
    }
    asset.historyMonths = selected?.months ?? null;
    asset.historyBase = selected?.base ?? null;
    asset.historyBaseDate = selected?.date ?? null;
    asset.historyPct = selected ? (cur / selected.base - 1) * 100 : null;
    asset.historyAnnualPct = selected ? annualizeTrend(selected.base, cur, selected.months) : null;
    // Legacy fields remain populated for older UI/backup compatibility.
    asset.sixMonthBase = asset.historyBase;
    asset.sixMonthBaseDate = asset.historyBaseDate;
    asset.sixMonthPct = asset.historyPct;
    if (selected){
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
      // ISSUENAME — полное название выпуска; SHORTNAME у старых облигаций
      // часто выглядит как технический тикер и не годится для интерфейса.
      fullname: d.ISSUENAME || d.SECNAME || d.SHORTNAME || '',
      ...schedule, ...(price.last != null ? { moexUpdatedAt: price.updatedAt } : {}), priceUnit: 'rub',
    };
  }

  async function refreshAsset(asset){
    if (asset?.quoteSource === 'manual') return asset;
    // ISIN — устойчивый идентификатор выпуска: у ВИМ «Ликвидность»
    // RU000A1014L8 исторические коды VTBM/LQDT, но это не закрытый VTBL/RSHL.
    const isin = String(asset.isin || asset.ISIN || '').trim().toUpperCase();
    if (asset.kind === 'fund' && isin === 'RU000A1014L8'){
      if (asset.secid !== 'LQDT') asset.legacySecid = asset.secid || null;
      asset.isin = isin;
      asset.secid = 'LQDT';
      asset.moexInactive = false;
      delete asset.moexStatusText;
    }
    // VTBL/RSHL — другой, действительно закрытый фонд. Без совпадающего ISIN
    // он не должен быть перепутан с ВИМ «Ликвидность».
    if (asset.kind === 'fund' && (asset.secid === 'VTBL' || asset.secid === 'RSHL')){
      if (asset.secid === 'VTBL') asset.legacySecid = 'VTBL';
      asset.secid = 'RSHL';
      asset.moexInactive = true;
      delete asset.lastPrice;
      asset.moexUpdatedAt = null;
      delete asset.moexError;
      delete asset.moexQuoteStatus;
      asset.moexStatusText = 'Бывший VTBL (RSHL): с 26.12.2023 закрытый ЗПИФ-А, биржевые торги прекращены. Актуальной биржевой котировки нет.';
      asset.sixMonthBase = null;
      asset.sixMonthPct = null;
      asset.sixMonthBaseDate = null;
      asset.yieldMonth = monthKey();
      return asset;
    }
    // PDDRUB_TOM was an erroneous legacy alias in the quick-add list;
    // MOEX's palladium spot ticker is PLDRUB_TOM.
    if (asset.kind === 'metal' && asset.secid === 'PDDRUB_TOM') asset.secid = 'PLDRUB_TOM';
    const board = asset.kind === 'metal' ? 'CETS' : (asset.board || (asset.kind === 'bond' ? 'TQOB' : asset.kind === 'fund' ? 'TQTF' : 'TQBR'));
    if (asset.kind === 'metal') asset.board = 'CETS';
    // Обновляем оба имени даже у старых позиций: ранее сохранённый SHORTNAME
    // может быть лишь технической меткой «ETF AKGD». Полное SECNAME имеет
    // приоритет в интерфейсе. Кэш справочника действует 24 часа.
    try {
      const meta = await securityMetadata(asset.secid);
      if (meta.shortname) asset.shortname = meta.shortname;
      if (meta.fullname) asset.fullname = meta.fullname;
      if (!asset.isin && meta.isin) asset.isin = meta.isin;
      const officialName = Utils.officialAssetName(asset);
      if (officialName) asset.fullname = officialName;
    } catch (error) {
      console.warn('MOEX security name lookup failed for ' + asset.secid, error);
    }
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

  return { searchSecurity, lastPrice, bondCoupons, bondDetails, bondSchedule, refreshAsset, refreshSixMonth, historyClose, annualizeTrend, monthKey, keyRate, chooseMarketRow, parseBlock, normalizeProxyUrl, getProxyUrl, testProxy, resolveMarket, resolveMarkets, tradableMarkets, assertTradable };
})();
if (typeof module !== 'undefined') module.exports = MoexAPI;
