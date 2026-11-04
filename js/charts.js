/* ============================================================
   charts.js — Charts (рисование на Canvas)
   Зависит: ничего, кроме DOM
   draw(canvas, series, opts) — opts.xTicks = [{x: 0..1, label, grid}]
   задаёт отметки по оси X (день, неделя, месяц, полгода, год).
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

    // Сетка и подписи по оси Y
    const gridColor = cssVar('--chart-grid', '#e2e8f0');
    const textColor = cssVar('--chart-text', '#94a3b8');
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    ctx.fillStyle = textColor; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    for (let i=0; i<=3; i++){
      const v = min + (max-min) * i/3;
      const y = yOf(v);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W-pad.right, y); ctx.stroke();
      ctx.fillText(shortNum(v), pad.left - 6, y + 3);
    }

    // Отметки по оси X
    if (opts.xTicks?.length){
      ctx.strokeStyle = gridColor; ctx.fillStyle = textColor; ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      opts.xTicks.forEach(t => {
        const x = pad.left + plotW * Math.max(0, Math.min(1, Number(t.x) || 0));
        if (t.grid !== false){
          ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, H - pad.bottom); ctx.stroke();
        }
        ctx.fillText(t.label, x, H - pad.bottom + 15);
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
  }

  return { draw, cssVar, resetThemeCache };
})();
if (typeof module !== 'undefined') module.exports = Charts;
