/* ============================================================
   charts.js — Charts (рисование на Canvas)
   Зависит: ничего, кроме DOM
   draw(canvas, series, opts) — opts.xTicks = [{x: 0..1, label, grid}]
   задаёт отметки по оси X (день, неделя, месяц, полгода, год).
   На каждой отметке оси X рисуется точка линии. Точки интерактивны:
   наведение на ПК и тап на телефоне показывают подсказку со значением
   (подпись точки задаётся opts.pointLabel(index, value)).
   ============================================================ */

const Charts = (() => {
  // Кэш цветов из CSS-переменных: getComputedStyle не должен вызываться
  // на каждую отрисовку. Сбрасывается при смене темы (resetThemeCache).
  let cssCache = new Map();
  function cssVar(name, fallback){
    if (cssCache.has(name)) return cssCache.get(name);
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
      cssCache.set(name, v);
      return v;
    } catch { return fallback; }
  }
  function resetThemeCache(){ cssCache = new Map(); }

  function shortNum(v){
    const a = Math.abs(v);
    if (a >= 1e6) return (v/1e6).toFixed(1) + 'М';
    if (a >= 1e3) return (v/1e3).toFixed(0) + 'К';
    return Math.round(v).toString();
  }

  // Полная сумма с разделителями — для подсказки на точке
  function fmtFull(v){
    const rounded = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
    try {
      return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(rounded) + ' ₽';
    } catch { return String(rounded) + ' ₽'; }
  }

  // Состояние каждого canvas: геометрия, точки линии и параметры
  // последней отрисовки — нужно для подсказок без повторного расчёта.
  const states = new Map();
  const interactive = new WeakSet();

  function draw(canvas, series, opts = {}){
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const pad = {top: 8, right: 8, bottom: 26, left: 44};
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    let all = [];
    series.forEach(s => all.push(...s.data));
    if (!all.length) return;
    let min = Math.min(...all), max = Math.max(...all);
    if (min > 0) min = 0;
    if (max < 0) max = 0;
    if (max === min) max = min + 1;

    const yOf = v => pad.top + plotH * (1 - (v - min) / (max - min));
    const xOf = (i, n) => pad.left + plotW * (n <= 1 ? 0 : i / (n - 1));

    // Точки линий в экранных координатах: по ним находится ближайшая
    // к пальцу/курсору точка для подсказки.
    const points = [];
    series.forEach((s, si) => {
      if (!s.data.length) return;
      s.data.forEach((v, i) => points.push({
        x: xOf(i, s.data.length), y: yOf(v), value: v, series: si, index: i
      }));
    });

    states.set(canvas, { series, opts, W, H, pad, plotW, plotH, min, max, xOf, yOf, points });
    attach(canvas);
    paint(canvas, null);
  }

  function paint(canvas, highlight){
    const st = states.get(canvas);
    if (!st) return;
    const { series, opts, W, H, pad, plotW, plotH, min, max, xOf, yOf, points } = st;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const gridColor = cssVar('--chart-grid', '#e2e8f0');
    const textColor = cssVar('--chart-text', '#94a3b8');
    const cardBg = cssVar('--card', '#ffffff');
    const lineColor = cssVar('--border', '#e2e8f0');

    // Сетка и подписи по оси Y
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    ctx.fillStyle = textColor; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    for (let i=0; i<=3; i++){
      const v = min + (max-min) * i/3;
      const y = yOf(v);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W-pad.right, y); ctx.stroke();
      ctx.fillText(shortNum(v), pad.left - 6, y + 3);
    }

    // Отметки по оси X. Подпись первой отметки прижимается к левому
    // краю («сейчас» не наползает на «1 мес»), последней — к правому,
    // чтобы она не обрезалась за границей canvas.
    const tickIndex = new Set();
    if (opts.xTicks?.length){
      ctx.strokeStyle = gridColor; ctx.fillStyle = textColor; ctx.font = '10px sans-serif';
      opts.xTicks.forEach(t => {
        const xf = Math.max(0, Math.min(1, Number(t.x) || 0));
        const x = pad.left + plotW * xf;
        if (t.grid !== false){
          ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, H - pad.bottom); ctx.stroke();
        }
        let tx = x, align = 'center';
        if (Number(t.x) <= 0){ tx = 2; align = 'left'; }
        else if (Number(t.x) >= 1){ tx = W - 2; align = 'right'; }
        ctx.textAlign = align;
        ctx.fillText(t.label, tx, H - pad.bottom + 15);
        // Индекс точки линии на этой отметке — на ней рисуем точку
        const first = series.find(s => s.data.length > 1) || series[0];
        if (first && first.data.length){
          const idx = Math.round(xf * (first.data.length - 1));
          if (idx >= 0 && idx < first.data.length) tickIndex.add(idx);
        }
      });
    }

    series.forEach(s=>{
      if (!s.data.length) return;
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      s.data.forEach((v,i)=>{
        const x = xOf(i, s.data.length);
        const y = yOf(v);
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();

      ctx.lineTo(xOf(s.data.length-1, s.data.length), yOf(0));
      ctx.lineTo(xOf(0, s.data.length), yOf(0));
      ctx.closePath();
      ctx.fillStyle = s.color + '20';
      ctx.fill();
    });

    // Точки на отметках оси X: видны на графике и по ним можно тапнуть
    series.forEach(s => {
      if (!s.data.length) return;
      const n = s.data.length;
      ctx.fillStyle = s.color; ctx.strokeStyle = cardBg; ctx.lineWidth = 1.5;
      tickIndex.forEach(i => {
        if (i >= n) return;
        const x = xOf(i, n), y = yOf(s.data[i]);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    });

    if (highlight) drawHighlight(ctx, st, highlight, cardBg, lineColor, textColor);
  }

  // Подсказка на выбранной точке: увеличенная точка + рамка со значением
  function drawHighlight(ctx, st, pt, cardBg, lineColor, textColor){
    const { series, opts } = st;
    const s = series[pt.series];
    if (!s) return;

    ctx.beginPath(); ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = s.color; ctx.fill();
    ctx.strokeStyle = lineColor; ctx.lineWidth = 1.5; ctx.stroke();

    let label;
    if (typeof opts.pointLabel === 'function'){
      try { label = String(opts.pointLabel(pt.index, pt.value) ?? ''); }
      catch { label = ''; }
    } else {
      label = pt.index === 0 ? 'сейчас' : 'через ' + pt.index + ' мес.';
    }
    const valueTxt = fmtFull(pt.value);
    ctx.font = '10px sans-serif';
    const wLabel = ctx.measureText(label).width;
    ctx.font = 'bold 11px sans-serif';
    const wValue = ctx.measureText(valueTxt).width;
    const bw = Math.max(wLabel, wValue) + 16;
    const bh = 34;
    let bx = pt.x - bw / 2;
    bx = Math.max(2, Math.min(st.W - bw - 2, bx));
    let by = pt.y - bh - 10;
    if (by < 2) by = pt.y + 10;
    by = Math.min(by, st.H - st.pad.bottom - bh);

    const r = 5;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
    ctx.fillStyle = cardBg; ctx.fill();
    ctx.strokeStyle = lineColor; ctx.lineWidth = 1; ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = textColor; ctx.font = '10px sans-serif';
    ctx.fillText(label, bx + 8, by + 13);
    ctx.fillStyle = cssVar('--text', '#0f172a'); ctx.font = 'bold 11px sans-serif';
    ctx.fillText(valueTxt, bx + 8, by + 27);
  }

  // Обработчики указателя: наведение на ПК (pointermove без touch),
  // тап на телефоне (pointerdown). Повторный тап в ту же точку
  // закрывает подсказку. Обработатели вешаются один раз на canvas.
  function attach(canvas){
    if (interactive.has(canvas)) return;
    interactive.add(canvas);
    let active = null;
    try { canvas.style.touchAction = 'pan-y'; } catch { /* style недоступен в тестах */ }

    function nearest(e){
      const st = states.get(canvas);
      if (!st || !st.points.length) return null;
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      // Палец больше курсора: радиус захвата по X и Y с запасом
      const reach = 30;
      let best = null, bestD = Infinity;
      for (const p of st.points){
        const dx = Math.abs(p.x - px), dy = Math.abs(p.y - py);
        if (dx > reach || dy > reach * 1.5) continue;
        const d = dx + dy * 0.25; // близость по горизонтали важнее
        if (d < bestD){ bestD = d; best = p; }
      }
      return best;
    }
    function show(e, toggle){
      const p = nearest(e);
      if (toggle && p === active){ // повторный тап в ту же точку — закрыть
        active = null;
        paint(canvas, null);
        return;
      }
      if (p === active) return;
      active = p;
      paint(canvas, p);
    }
    function hide(){
      if (!active) return;
      active = null;
      paint(canvas, null);
    }
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      show(e, false);
    });
    canvas.addEventListener('pointerleave', hide);
    canvas.addEventListener('pointercancel', hide);
    canvas.addEventListener('pointerdown', e => show(e, true));
  }

  return { draw, cssVar, resetThemeCache };
})();
if (typeof module !== 'undefined') module.exports = Charts;

