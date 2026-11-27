# -*- coding: utf-8 -*-
# Снапшот котировок: приложение читает data/moex-quotes.json как первый канал.
import io

path = "js/moex.js"
src = io.open(path, encoding="utf-8").read()

# 1. Модуль снапшота — после кэша Map
anchor = "  const cache = new Map();"
snap = anchor + """

  // ── Снапшот котировок: data/moex-quotes.json собирается по расписанию
  // (GitHub Actions, ISS из облака) и публикуется вместе с сайтом. Это
  // первый канал цен: с телефона, где прокси и ISS недоступны, котировки
  // и история обновляются из снапшота без единого сетевого запроса.
  let snapMemo = null;
  async function snapshotQuotes(){
    if (snapMemo && Date.now() - snapMemo.ts < 6 * 3600000) return snapMemo.data;
    let base = null;
    try {
      if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
        base = new URL('./', location.href).toString();
      }
    } catch {}
    if (!base) return null;
    try {
      const r = await fetch(base + 'data/moex-quotes.json', {
        headers: { Accept: 'application/json' }, cache: 'no-store',
        credentials: 'omit', signal: AbortSignal.timeout(8000)
      });
      if (!r.ok) return null;
      const d = await r.json();
      snapMemo = { ts: Date.now(), data: d };
      return d;
    } catch { return null; }
  }
  function snapshotEntry(asset, snap){
    return snap && snap.quotes && snap.quotes[asset.secid] || null;
  }"""
assert anchor in src, "кэш не найден"
src = src.replace(anchor, snap, 1)

# 2. refreshAsset: снапшот применяем, если он свежее сохранённой цены
anchor2 = """    // PDDRUB_TOM was an erroneous legacy alias in the quick-add list;
    // MOEX's palladium spot ticker is PLDRUB_TOM."""
snap_apply = """    // Снапшот свежее сохранённой цены — применяем его и пропускаем сеть:
    // с телефона, где ISS и прокси недоступны, это единственный канал.
    const snap = await snapshotQuotes().catch(() => null);
    const sq = snapshotEntry(asset, snap);
    const snapTs = sq && sq.last > 0 ? Date.parse(sq.generatedAt || '') : NaN;
    const assetTs = Date.parse(asset.moexUpdatedAt || '');
    if (sq && sq.last > 0 && (!Number.isFinite(assetTs) || snapTs > assetTs)){
      asset.lastPrice = sq.last;
      asset.moexUpdatedAt = sq.generatedAt;
      asset.board = sq.board || asset.board;
      if (asset.kind === 'bond' && sq.historyMonths != null){
        asset.nominal = asset.nominal || 1000; asset.priceUnit = 'rub';
      }
      asset.moexError = null; asset.moexErrorSince = null; asset.moexQuoteStatus = null;
      return asset;
    }
    // PDDRUB_TOM was an erroneous legacy alias in the quick-add list;
    // MOEX's palladium spot ticker is PLDRUB_TOM."""
assert anchor2 in src, "PDDRUB anchor не найден"
src = src.replace(anchor2, snap_apply, 1)

# 3. refreshSixMonth: история из снапшота, если есть
anchor3 = """    const now = new Date();
    let selected = null;
    for (const months of [12,6,3,1]){"""
snap_hist = """    // История из снапшота: считается в Actions, где ISS доступен напрямую
    const snapH = snapshotEntry(asset, await snapshotQuotes().catch(() => null));
    if (snapH && snapH.historyAnnualPct != null && cur != null){
      asset.historyMonths = snapH.historyMonths;
      asset.historyBase = snapH.historyBase;
      asset.historyBaseDate = snapH.historyBaseDate;
      asset.historyPct = cur / snapH.historyBase * 100 - 100;
      asset.historyAnnualPct = snapH.historyAnnualPct;
      asset.sixMonthBase = asset.historyBase;
      asset.sixMonthBaseDate = asset.historyBaseDate;
      asset.sixMonthPct = asset.historyPct;
      asset.historyAttemptMonth = monthKey();
      asset.yieldMonth = monthKey();
      asset.yieldUpdatedAt = new Date().toISOString();
      return asset;
    }
    const now = new Date();
    let selected = null;
    for (const months of [12,6,3,1]){"""
assert anchor3 in src, "refreshSixMonth: цикл не найден"
src = src.replace(anchor3, snap_hist, 1)
io.open(path, "w", encoding="utf-8", newline="").write(src)
print("moex.js: снапшот-канал добавлен")
