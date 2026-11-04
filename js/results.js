/* ============================================================
   results.js — Results: зафиксированные результаты и их график
   Зависит: Utils, Stats, Charts
   Отметки по оси X выбираются по размаху: день, неделя,
   месяц, полгода, год.
   ============================================================ */

const Results = (() => {
  const { $, uid, fmtMoney, fmtDate, escapeHtml } = Utils;
  const LS = 'fin_snapshots';
  const DAY = 86400000;

  function load(){
    let list;
    try { list = JSON.parse(localStorage.getItem(LS) || '[]'); }
    catch { list = []; }
    return (Array.isArray(list) ? list : []).slice()
      .sort((a,b) => String(a.ts).localeCompare(String(b.ts)));
  }
  function save(list){ localStorage.setItem(LS, JSON.stringify(list)); }

  function current(){
    const s = Stats.aggregate();
    return { net: s.net, assets: s.assets, debts: s.debts };
  }

  function add(){
    const cur = current();
    const list = load();
    list.push({ id: uid(), ts: new Date().toISOString(), ...cur });
    save(list);
    render();
  }
  function remove(id){
    save(load().filter(s => s.id !== id));
    render();
  }

  // Отметки по оси X по масштабу: день → неделя → месяц → полгода → год
  function timeTicks(list){
    const n = list.length;
    if (!n) return [];
    if (n === 1) return [{ x: 0.5, label: fmtDate(new Date(list[0].ts)) }];
    const t0 = Date.parse(list[0].ts), t1 = Date.parse(list[n-1].ts);
    const span = Math.max(1, t1 - t0);
    let unit;
    if      (span <=  3*DAY)   unit = 'day';
    else if (span <= 21*DAY)   unit = 'week';
    else if (span <= 183*DAY)  unit = 'month';
    else if (span <= 730*DAY)  unit = 'half';
    else                       unit = 'year';

    const ticks = [];
    const d = new Date(t0); d.setHours(0,0,0,0);
    const push = (label) => ticks.push({ x: (d.getTime() - t0) / span, label });
    if (unit === 'day'){
      while (d.getTime() <= t1){ push(fmtDate(new Date(d))); d.setDate(d.getDate() + 1); }
    } else if (unit === 'week'){
      d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); // ближайший понедельник
      while (d.getTime() <= t1){ push(fmtDate(new Date(d))); d.setDate(d.getDate() + 7); }
    } else if (unit === 'month'){
      d.setDate(1); d.setMonth(d.getMonth() + 1);
      while (d.getTime() <= t1){
        push(d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }));
        d.setMonth(d.getMonth() + 1);
      }
    } else if (unit === 'half'){
      d.setDate(1);
      if (d.getMonth() >= 6){ d.setMonth(0); d.setFullYear(d.getFullYear() + 1); }
      else d.setMonth(6);
      while (d.getTime() <= t1){
        push(d.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' }));
        d.setMonth(d.getMonth() + 6);
      }
    } else {
      d.setDate(1); d.setMonth(0); d.setFullYear(d.getFullYear() + 1);
      while (d.getTime() <= t1){ push(String(d.getFullYear())); d.setFullYear(d.getFullYear() + 1); }
    }
    // Не плотнее ~8 отметок
    if (ticks.length > 8){
      const step = Math.ceil(ticks.length / 8);
      return ticks.filter((_, i) => i % step === 0);
    }
    return ticks;
  }

  function drawChart(){
    const canvas = $('chartSnapshots');
    if (!canvas) return;
    const list = load();
    if (!list.length){
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, rect.width); canvas.height = Math.max(1, rect.height);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = Charts.cssVar('--chart-text', '#94a3b8'); ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Зафиксируйте первый результат', rect.width/2, rect.height/2);
      return;
    }
    Charts.draw(canvas, [{ color: '#2563eb', data: list.map(s => s.net) }], { xTicks: timeTicks(list) });
  }

  function render(){
    const cur = current();
    const el = $('snapshotCurrent');
    if (el) el.innerHTML = `Сейчас: <b class="${cur.net >= 0 ? 'green' : 'red'}">${fmtMoney(cur.net)}</b>`;

    const list = load();
    const box = $('snapshotsList');
    if (box){
      if (!list.length){
        box.innerHTML = '<div class="empty">Пока нет зафиксированных результатов. Нажмите «Зафиксировать», чтобы сохранить текущую сумму.</div>';
      } else {
        box.innerHTML = list.slice().reverse().map((s, i, arr) => {
          const prev = arr[i + 1];
          const delta = prev ? s.net - prev.net : 0;
          const deltaTxt = prev
            ? ` · <span class="${delta >= 0 ? 'green' : 'red'}">${delta >= 0 ? '+' : '−'}${fmtMoney(Math.abs(delta))}</span>`
            : '';
          return `<div class="snapshot-row">
            <div class="event-body">
              <div class="event-title">${escapeHtml(fmtDate(new Date(s.ts)))}${deltaTxt}</div>
              <div class="event-meta">Активы ${fmtMoney(s.assets)} · Долги ${fmtMoney(s.debts)}</div>
            </div>
            <div class="event-amount">${fmtMoney(s.net)}</div>
            <button class="op-del" data-snap="${s.id}" title="Удалить отметку">×</button>
          </div>`;
        }).join('');
        box.querySelectorAll('[data-snap]').forEach(b => b.onclick = () => remove(b.dataset.snap));
      }
    }
    drawChart();
  }

  function init(){
    const btn = $('snapshotBtn');
    if (btn) btn.onclick = add;
    const details = $('resultsDetails');
    if (details) details.addEventListener('toggle', () => { if (details.open) render(); });
    render();
  }

  return { init, render, add };
})();
