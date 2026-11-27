#!/usr/bin/env node
/* Снапшот котировок MOEX для бумаг из data/watchlist.json.
   Источник: ISS HTTPS (из облака сертификаты валидны). Для каждой бумаги:
   последняя цена + годовая экстраполяция по свечам 12/6/3/1 мес.
   Результат: data/moex-quotes.json — приложение читает его с Pages. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WL = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'watchlist.json'), 'utf8'));
const OUT = path.join(ROOT, 'data', 'moex-quotes.json');
const UA = 'Mozilla/5.0 FinApp/1.0';
const DAY = 86400000;

async function getJSON(url, ms = 15000){
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: c.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

async function lastPrice(secid, board, kind){
  const market = kind === 'bond' ? 'bonds' : 'shares';
  const url = `https://iss.moex.com/iss/engines/stock/markets/${market}/boards/${board}/securities/${secid}.json?iss.meta=off&iss.only=marketdata,securities&iss.json=compact&iss.version=on`;
  const d = await getJSON(url);
  const md = d.marketdata, s = d.securities;
  const col = i => Object.fromEntries(md.columns.map((c, x) => [c, i[x]]));
  let best = null;
  for (const r of (md.data || []).map(col)){
    const v = [r.LAST, r.LCURRENTPRICE, r.MARKETPRICE, r.WAPRICE].find(x => x > 0);
    if (v != null && (!best || r.BOARDID === board)) best = v;
  }
  const sec = s.data?.length ? Object.fromEntries(s.columns.map((c, x) => [c, s.data[0][x]])) : {};
  const nominal = Number(sec.FACEVALUE) || (kind === 'bond' ? 1000 : null);
  const last = best == null ? null : (kind === 'bond' && nominal ? best * nominal / 100 : best);
  return { last, nominal: nominal || null };
}

async function candleClose(secid, board, kind, dateFrom, dateTo){
  const market = kind === 'bond' ? 'bonds' : 'shares';
  const url = `https://iss.moex.com/iss/engines/stock/markets/${market}/boards/${board}/securities/${secid}/candles.json?iss.meta=off&iss.only=candles&candles.columns=begin,close&interval=24&start=0&from=${dateFrom}&till=${dateTo}`;
  const d = await getJSON(url);
  const rows = (d.candles?.data || []).map(r => ({ date: String(r[0]).slice(0,10), close: Number(r[1]) }))
    .filter(r => r.date && r.close > 0).sort((a,b) => b.date.localeCompare(a.date));
  const c = rows[0]?.close;
  return c == null ? null : (kind === 'bond' ? c * 1000 / 100 : c);
}

function annualTrend(base, cur, months){
  if (!(base > 0) || !(cur >= 0) || !(months > 0)) return null;
  const ratio = cur / base;
  if (ratio <= 0) return -100;
  return (Math.pow(ratio, 12 / months) - 1) * 100;
}

const now = new Date();
const quotes = {};
let failed = 0;
for (const item of WL){
  const { secid, board, kind } = item;
  try {
    const price = await lastPrice(secid, board, kind);
    let base = null, months = null, baseDate = null;
    for (const m of [12, 6, 3, 1]){
      const target = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const from = new Date(target); from.setDate(from.getDate() - 14);
      const c = await candleClose(secid, board, kind, iso(from), iso(target)).catch(() => null);
      if (c != null && c > 0){ base = c; months = m; baseDate = iso(target); break; }
    }
    const cur = price.last;
    if (cur == null && base == null){ quotes[secid] = { stale: true }; failed++; continue; }
    const hPct = base != null && cur != null ? (cur / base - 1) * 100 : null;
    quotes[secid] = {
      last: cur, board, kind,
      date: iso(now),
      historyMonths: months,
      historyBase: base,
      historyBaseDate: baseDate,
      historyPct: hPct,
      historyAnnualPct: base != null && cur != null ? annualTrend(base, cur, months) : null,
    };
  } catch (e){
    quotes[secid] = { stale: true, error: String(e?.message || e).slice(0, 120) };
    failed++;
  }
}

const snapshot = { generatedAt: new Date().toISOString(), count: Object.keys(quotes).length, quotes };
fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 1));
console.log(`moex-quotes: ${snapshot.count} бумаг, ошибок: ${failed}`);
if (failed >= WL.length) process.exit(1);
