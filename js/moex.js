/* ============================================================
   moex.js — MOEX ISS API + ключевая ставка ЦБ
   ============================================================ */

const MoexAPI = (() => {
  const ISS = 'https://iss.moex.com/iss';
  const CBR_KEY_RATE = 'https://www.cbr-xml-daily.ru/keyrate.json';
  const CACHE_TTL = 10 * 60 * 1000;
  const cache = new Map();

  async function fetchJSON(url, timeout = 12000){
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Нет подключения к интернету');
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(timeout),
      cache: 'no-store'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function cached(key, ttl, loader){
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && (now - hit.ts) < ttl) return Promise.resolve(hit.data);
    return loader().then(data => {
      cache.set(key, { ts: now, data });
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

  async function lastPrice(secid, board, kind){
    return cached(`price:${kind}:${board}:${secid}`, CACHE_TTL, async () => {
      // Драгметаллы (золото, серебро, платина, палладий) торгуются
      // на валютном рынке СЭЛТ: GLDRUB_TOM и т.п.
      const metal = kind === 'metal';
      const bond = kind === 'bond' || ['TQOB','TQCB','TQOD','TQIR'].includes(board);
      const url = metal
        ? `${ISS}/engines/currency/markets/selt/securities/${encodeURIComponent(secid)}.json?iss.meta=off`
        : `${ISS}/engines/stock/markets/${bond ? 'bonds' : 'shares'}/boards/${encodeURIComponent(board)}/securities/${encodeURIComponent(secid)}.json?iss.meta=off`;
      const json = await fetchJSON(url);
      const md = rows(json.marketdata)[0] || {};
      const security = rows(json.securities)[0] || {};
      const quoted = [md.LAST, md.LCURRENTPRICE, md.MARKETPRICE, md.WAPRICE, security.PREVPRICE, security.PREVLEGALCLOSEPRICE]
        .map(number).find(v => v != null && v > 0);
      const nominal = number(security.FACEVALUE);
      return {
        last: quoted == null ? null : bond ? (nominal == null ? null : quoted * nominal / 100) : quoted,
        pricePercent: bond ? quoted : null,
        nominal, accruedInterest: number(security.ACCRUEDINT),
        maturityDate: security.MATDATE || null,
        currency: security.FACEUNIT || 'RUB',
        updatedAt: new Date().toISOString(),
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
    const target = new Date();
    target.setMonth(target.getMonth() - 6);
    target.setDate(1);
    const from = new Date(target);
    from.setDate(from.getDate() - 14);
    const baseRaw = await historyClose(asset.secid, asset.board, asset.kind, iso(from), iso(target));
    await refreshAsset(asset);
    const cur = asset.lastPrice ?? null;               // металл — уже за грамм
    const base = asset.kind === 'metal' && baseRaw != null ? baseRaw / OUNCE_GRAM : baseRaw;
    asset.sixMonthBase = base;
    asset.sixMonthBaseDate = baseRaw != null ? iso(target) : null;
    asset.sixMonthPct = (base != null && base > 0 && cur != null) ? (cur / base - 1) * 100 : null;
    asset.yieldMonth = monthKey();
    asset.yieldUpdatedAt = new Date().toISOString();
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
    return {
      ...price, lastPrice: price.last,
      nominal: price.nominal ?? number(d.FACEVALUE),
      maturityDate: price.maturityDate || d.MATDATE || null,
      couponType, couponDescription: d.COUPON_DETAILS || d.BOND_TYPE || 'Тип купона не указан MOEX',
      couponRate: number(d.COUPONPERCENT), couponAmount: number(d.COUPONVALUE),
      couponFreq: number(d.COUPONFREQUENCY), nextCouponDate: d.COUPONDATE || null,
      ...schedule, moexUpdatedAt: new Date().toISOString(), priceUnit: 'rub',
    };
  }

  async function refreshAsset(asset){
    const board = asset.board || (asset.kind === 'bond' ? 'TQOB' : asset.kind === 'fund' ? 'TQTF' : 'TQBR');
    if (asset.kind === 'bond') {
      const details = await bondDetails(asset.secid, board);
      // Не заменяем сохранённую рублёвую цену пустой котировкой.
      if (details.lastPrice == null) delete details.lastPrice;
      Object.assign(asset, details);
    } else if (asset.kind === 'metal') {
      // Цена MOEX — за тройскую унцию; храним и показываем за грамм
      const price = await lastPrice(asset.secid, board, 'metal');
      if (price?.last != null){
        asset.ouncePrice = price.last;
        asset.lastPrice = price.last / OUNCE_GRAM;
        asset.unit = 'gram';
        asset.moexUpdatedAt = price.updatedAt;
      }
    } else {
      const price = await lastPrice(asset.secid, board, asset.kind === 'fund' ? 'fund' : 'stock');
      if (price?.last != null) asset.lastPrice = price.last;
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

  return { searchSecurity, lastPrice, bondCoupons, bondDetails, bondSchedule, refreshAsset, refreshSixMonth, monthKey, keyRate };
})();
if (typeof module !== 'undefined') module.exports = MoexAPI;
