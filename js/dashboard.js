/* ============================================================
   dashboard.js — Events, ProductList, Dashboard
   Зависит: Config, Utils, Storage, Simulator, Stats, Charts, MoexAPI
   ============================================================ */

const Events = (() => {
  const { parseDate } = Utils;

  function nextOccurrence(iso, freq){
    if (!iso) return null;
    const d = parseDate(iso); if (!d) return null;
    const now = new Date(); now.setHours(0,0,0,0);
    if (freq === 'once') return d >= now ? d : null;
    while (d < now){
      if (freq==='weekly')  d.setDate(d.getDate()+7);
      if (freq==='monthly') d.setMonth(d.getMonth()+1);
      if (freq==='yearly')  d.setFullYear(d.getFullYear()+1);
    }
    return d;
  }

  function all(){
    const list = [];
    const today = new Date(); today.setHours(0,0,0,0);

    Storage.all().forEach(p => {
      if (p.endDate){
        const d = parseDate(p.endDate);
        if (d && d >= today){
          list.push({ date:d, product:p, icon:'🏁',
            title:`Окончание: ${p.name}`, direction:Config.TYPES[p.type].liability ? 'out' : 'in', amount:p.type === 'investment' ? Simulator.portfolioValue(p) : p.amount });
        }
      }
      // Окончание льготного периода кредитной карты
      if (p.type === 'credit_card' && p.gracePeriodEndDate){
        const d = parseDate(p.gracePeriodEndDate);
        if (d && d >= today){
          list.push({ date:d, product:p, icon:'⏳',
            title:`Льготный период: ${p.name}`, direction:'out', amount: p.amount });
        }
      }
      
      p.operations?.forEach(op=>{
        if (op.frequency === 'once'){
          const d = parseDate(op.date);
          if (d && d >= today){
            list.push({ date:d, product:p, icon: op.direction==='in'?'⬇️':'⬆️',
              title:`${op.direction==='in'?'Пополнение':'Снятие'}: ${p.name}`,
              amount:op.amount, direction:op.direction });
          }
        } else {
          const d = nextOccurrence(op.date, op.frequency);
          if (d && (!op.endDate || d <= parseDate(op.endDate))){
            list.push({ date:d, product:p, icon: op.direction==='in'?'⬇️':'⬆️',
              title:`${op.direction==='in'?'Пополнение':'Снятие'}: ${p.name}`,
              amount:op.amount, direction:op.direction });
          }
        }
      });
      if (p.type === 'expense') {
        const d = nextOccurrence(p.startDate || Utils.dateKey(today), 'monthly');
        if (d) list.push({date:d, product:p, icon:'↗', direction:'out', title:`Расход: ${p.name}`, amount:p.amount});
      }
      if (p.type === 'investment') {
        for (const a of p.assets || []) {
          if (a.kind !== 'bond' || a.redeemed) continue;
          for (const pay of Bonds.payments(a)) {
            if (pay.type !== 'principal' || pay.date < Utils.dateKey(today) || a.paidEvents?.[pay.key]) continue;
            list.push({date:parseDate(pay.date), product:p, icon:'↙', direction:'in', title:`Погашение: ${a.shortname || a.secid}`, amount:pay.value == null ? null : pay.value * a.qty});
          }
        }
      }
    });
    return list.sort((a,b)=>a.date - b.date);
  }
  return { all };
})();

const ProductList = (() => {
  const { $, fmtMoney, fmtDate, escapeHtml, parseDate } = Utils;
  let selected = new Set();

  function nextEventFor(p){
    const evs = [];
    if (p.endDate){
      const d = parseDate(p.endDate);
      const t = new Date(); t.setHours(0,0,0,0);
      if (d && d >= t) evs.push(d);
    }
    p.operations?.forEach(op=>{
      if (op.frequency === 'once'){
        const d = parseDate(op.date);
        const t = new Date(); t.setHours(0,0,0,0);
        if (d && d >= t) evs.push(d);
      }
    });
    if (!evs.length) return null;
    return evs.sort((a,b)=>a-b)[0];
  }

  function render(onEdit){
    const el = $('productsList');
    const list = Storage.all();
    if (!list.length){
      el.innerHTML = '<div class="empty">Пока нет продуктов. Добавьте первый!</div>';
    } else {
      el.innerHTML = list.map(p=>{
        const t = Config.TYPES[p.type];
        const isInvest = p.type === 'investment';
        const isExpense = p.type === 'expense';
        const isCredit = p.type === 'credit_card';

        const value = isInvest ? Simulator.portfolioValue(p) : (p.amount || 0);
        const annual = isExpense
          ? (p.amount || 0) * 12
          : isInvest
            ? (p.assets || []).reduce((s,a)=> s+Simulator.annualCouponForAsset(a), 0)
              + (p.assets || []).filter(a => a.kind !== 'bond').reduce((s,a) => s + a.qty * Bonds.price(a), 0) * (p.rate || 0) / 100
            : value * (p.rate || 0) / 100;
        const sign = (t.liability || isExpense) ? '−' : '+';

        const ev = nextEventFor(p);
        const opsCount = (p.operations||[]).length;
        const assetsCount = (p.assets||[]).length;
        const chainCount = Array.isArray(p.endActions) ? p.endActions.length
                         : p.endAction ? 1 : 0;

        const subParts = [];
        if (!isInvest && !isExpense && !isCredit && p.rate) subParts.push(`${p.rate}% годовых`);
        if (isExpense) subParts.push(`${fmtMoney(p.amount)}/мес`);
        if (isInvest && assetsCount) subParts.push(`портфель: ${assetsCount} актив.`);
        if (isInvest && !assetsCount) subParts.push('без активов');
        if (isInvest) subParts.push(`свободно: ${fmtMoney(p.amount || 0)}`);
        
        if (isCredit) {
          const limit = p.limit || 0;
          const debt = p.amount || 0;
          const avail = Math.max(0, limit - debt);
          subParts.push(`Лимит: ${fmtMoney(limit)}`);
          subParts.push(`Доступно: ${fmtMoney(avail)}`);
          if (p.gracePeriodEndDate) subParts.push(`Льготный до: ${fmtDate(p.gracePeriodEndDate)}`);
        }

        if (ev) subParts.push('след.: '+fmtDate(ev));
        else subParts.push('нет событий');
        if (chainCount) subParts.push(`⚙ ${chainCount} действ.`);

        return `<div class="product-row">
          <input type="checkbox" data-id="${p.id}" ${selected.has(p.id)?'checked':''}>
          <div class="prod-icon">${t.icon}</div>
          <div class="prod-main">
            <div class="prod-name">${escapeHtml(p.name)}
              <span class="badge">${t.label}</span>
              ${opsCount?`<span class="badge">${opsCount} оп.</span>`:''}
              ${assetsCount?`<span class="badge">📊 ${assetsCount}</span>`:''}
            </div>
            <div class="prod-sub">${subParts.join(' · ')}</div>
          </div>
          <div class="prod-amount">
            <div class="amount-val ${(t.liability||isExpense)?'red':''}">${fmtMoney(value)}</div>
            <div class="amount-sub ${(t.liability||isExpense)?'red':'green'}">
              ${sign}${fmtMoney(annual)}/год</div>
          </div>
          ${isInvest ? `<button class="btn small" data-refresh="${p.id}"
                          aria-label="Обновить цены с MOEX" title="Обновить цены с MOEX">⟳</button>` : ''}
          <button class="btn small" data-edit="${p.id}">Открыть</button>
        </div>`;
      }).join('');
    }
    updateDeleteBtn();

    el.querySelectorAll('[data-edit]').forEach(b=>{
      b.onclick = () => onEdit(b.dataset.edit);
    });
    el.querySelectorAll('[data-refresh]').forEach(b=>{
      b.onclick = async () => {
        b.disabled = true;
        b.textContent = '…';
        await refreshProductPrices(b.dataset.refresh);
        b.disabled = false;
        b.textContent = '⟳';
      };
    });
    el.querySelectorAll('input[type=checkbox][data-id]').forEach(cb=>{
      cb.onchange = () => {
        if (cb.checked) selected.add(cb.dataset.id); else selected.delete(cb.dataset.id);
        updateDeleteBtn();
      };
    });
  }

  async function refreshProductPrices(id){
    const p = Storage.get(id);
    if (!p || p.type !== 'investment') return;
    if (!navigator.onLine) { alert('Для обновления MOEX нужен интернет. Используются ранее сохранённые цены.'); return; }
    let failed = 0;
    for (const a of (p.assets || [])){
      try {
        await MoexAPI.refreshAsset(a);
      } catch(e){ failed++; }
    }
    if (failed) alert('Не все данные MOEX удалось обновить. Для недоступных данных сохранены прежние значения.');
    Bonds.settleProduct(p);
    Storage.upsert(p);
    if (typeof window.__REFRESH__ === 'function') window.__REFRESH__();
  }

  function updateDeleteBtn(){
    const b = $('deleteBtn'); if (!b) return;
    b.textContent = selected.size
      ? `Удалить выбранные (${selected.size})`
      : 'Удалить выбранные';
  }
  function getSelected(){ return Array.from(selected); }
  function clearSelection(){ selected.clear(); updateDeleteBtn(); }
  return { render, getSelected, clearSelection, refreshProductPrices };
})();

/* Отчёт с последнего захода: зачисления, списания, купоны и погашения. */
const SinceVisit = (() => {
  const { $, parseDate, fmtMoney, fmtDate, escapeHtml } = Utils;
  const lastVisit = Number(localStorage.getItem('fin_lastVisit') || 0);
  let visitMarked = false;

  // Все даты повторения операции в интервале (fromTs, toTs]
  function occurrencesBetween(op, fromTs, toTs){
    const start = parseDate(op.date); if (!start) return [];
    const end = op.endDate ? parseDate(op.endDate) : null;
    const out = [];
    const push = d => { if (d.getTime() > fromTs && d.getTime() <= toTs) out.push(new Date(d)); };
    if (op.frequency === 'once'){ push(start); return out; }
    let d = new Date(start);
    let guard = 0;
    while (d.getTime() <= toTs && guard++ < 600){
      if (end && d > end) break;
      push(d);
      if (op.frequency === 'weekly')       d.setDate(d.getDate() + 7);
      else if (op.frequency === 'monthly') d.setMonth(d.getMonth() + 1);
      else if (op.frequency === 'yearly')  d.setFullYear(d.getFullYear() + 1);
      else break;
    }
    return out;
  }

  // Что произошло между двумя моментами времени
  function eventsBetween(fromTs, toTs){
    const items = [];
    Storage.all().forEach(p => {
      (p.operations || []).forEach(op => {
        occurrencesBetween(op, fromTs, toTs).forEach(d => items.push({
          ts: d.getTime(), date: d, direction: op.direction === 'out' ? 'out' : 'in',
          amount: op.amount || 0,
          title: `${op.direction === 'out' ? 'Списание' : 'Пополнение'}: ${p.name}`
        }));
      });
      // Купоны и погашения фиксируются в paidEvents при запуске приложения
      if (p.type === 'investment') (p.assets || []).forEach(a => {
        Object.values(a.paidEvents || {}).forEach(ev => {
          const ts = Date.parse(ev.date);
          if (ts > fromTs && ts <= toTs) items.push({
            ts, date: new Date(ts), direction: 'in', amount: ev.amount || 0,
            title: `${ev.type === 'principal' ? 'Погашение' : 'Купон'}: ${a.shortname || a.secid}`
          });
        });
      });
    });
    return items.sort((a,b) => a.ts - b.ts);
  }

  function render(){
    const card = $('sinceVisitCard');
    if (!card) return;
    if (!lastVisit){ card.hidden = true; return; }
    const now = Date.now();
    const items = eventsBetween(lastVisit, now);
    const days = Math.floor((now - lastVisit) / 86400000);
    const sumIn  = items.filter(i => i.direction === 'in').reduce((s,i) => s + i.amount, 0);
    const sumOut = items.filter(i => i.direction === 'out').reduce((s,i) => s + i.amount, 0);
    const net = sumIn - sumOut;
    const agoTxt = days === 0 ? 'сегодня' : days === 1 ? 'вчера' : `${days} дн. назад`;

    const rows = items.map(i => `
      <div class="event ${i.direction === 'in' ? 'event-in' : 'event-out'}">
        <div class="event-icon">${i.direction === 'in' ? '⬇️' : '⬆️'}</div>
        <div class="event-body">
          <div class="event-title">${escapeHtml(i.title)}</div>
          <div class="event-meta">${fmtDate(i.date)}</div>
        </div>
        <div class="event-amount">${i.direction === 'in' ? '+' : '−'}${fmtMoney(i.amount)}</div>
      </div>`).join('');

    card.hidden = false;
    card.innerHTML = `
      <h2>С последнего захода · ${agoTxt} (${fmtDate(new Date(lastVisit))})</h2>
      <div class="since-totals">
        <div class="since-total in"><span>Зачисления</span><b>+${fmtMoney(sumIn)}</b></div>
        <div class="since-total out"><span>Списания</span><b>−${fmtMoney(sumOut)}</b></div>
        <div class="since-total net"><span>Итого</span><b>${net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(net))}</b></div>
      </div>
      ${items.length
        ? `<details class="since-details"><summary>Что произошло (${items.length})</summary>${rows}</details>`
        : '<div class="empty">За это время операций не было</div>'}`;

    // Отмечаем текущий заход один раз за сессию
    if (!visitMarked){
      visitMarked = true;
      localStorage.setItem('fin_lastVisit', String(now));
      if (typeof Notify !== 'undefined' && Notify.syncMeta) Notify.syncMeta();
    }
  }
  return { render };
})();

const Dashboard = (() => {
  const { $, fmtMoney, fmtPct, fmtDate, escapeHtml, dateKey } = Utils;
  let calDate = new Date();

  function renderStats(){
    const s = Stats.aggregate();
    $('stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Общий баланс</div>
        <div class="stat-value ${s.net>=0?'green':'red'}">${fmtMoney(s.net)}</div>
        <div class="stat-sub">Активы ${fmtMoney(s.assets)} · Долги ${fmtMoney(s.debts)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Доходность за год</div>
        <div class="stat-value ${s.netAnnual>=0?'green':'red'}">${fmtMoney(s.netAnnual)}</div>
        <div class="stat-sub">${fmtPct(s.pctAnnual)} годовых</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Доходность за месяц</div>
        <div class="stat-value ${s.netMonthly>=0?'green':'red'}">${fmtMoney(s.netMonthly)}</div>
        <div class="stat-sub">${fmtPct(s.pctMonthly)} в месяц</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Продуктов</div>
        <div class="stat-value">${Storage.all().length}</div>
        <div class="stat-sub">${Storage.all().filter(p=>Config.TYPES[p.type].liability).length} обязательств</div>
      </div>`;
  }

  function renderEvents(){
    const evs = Events.all().slice(0,6);
    const el = $('eventsList');
    if (!evs.length){ el.innerHTML = '<div class="empty">Нет предстоящих событий</div>'; return; }
    const now = new Date(); now.setHours(0,0,0,0);
    el.innerHTML = evs.map(e=>{
      const days = Math.round((e.date - now)/86400000);
      const dtxt = days===0?'сегодня':days===1?'завтра':`через ${days} дн.`;
      return `<div class="event ${e.direction === 'in' ? 'event-in' : e.direction === 'out' ? 'event-out' : ''}">
        <div class="event-icon">${e.icon}</div>
        <div class="event-body">
          <div class="event-title">${escapeHtml(e.title)}</div>
          <div class="event-meta">${fmtDate(e.date)} · ${dtxt}</div>
        </div>
        <div class="event-amount">${e.amount ? (e.direction === 'out' ? '−' : e.direction === 'in' ? '+' : '') + fmtMoney(e.amount) : ''}</div>
      </div>`;
    }).join('');
  }

  function renderCalendar(){
    const y = calDate.getFullYear(), m = calDate.getMonth();
    $('calTitle').textContent = calDate.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
    const evMap = {};
    Events.all().forEach(e=>{
      const k = dateKey(e.date);
      (evMap[k]=evMap[k]||[]).push(e);
    });
    const first = new Date(y,m,1);
    const startDow = (first.getDay()+6)%7;
    const daysInMonth = new Date(y,m+1,0).getDate();
    const today = new Date();
    const isThisMonth = today.getFullYear()===y && today.getMonth()===m;
    let html = '<div class="cal-dows">' +
      ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>`<div class="cal-dow">${d}</div>`).join('') +
      '</div><div class="cal-grid">';
    for (let i=0;i<startDow;i++) html += '<div class="cal-cell empty"></div>';
    for (let d=1; d<=daysInMonth; d++){
      const key = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const evs = evMap[key] || [];
      const isToday = isThisMonth && today.getDate()===d;
      const title = evs.map(e=>e.title).join(' · ');
      html += `<div class="cal-cell${isToday?' today':''}${evs.length?' has-events':''}" title="${escapeHtml(title)}">
        ${d}${evs.length?'<span class="cal-dot"></span>':''}</div>`;
    }
    html += '</div>';
    $('calendar').innerHTML = html;
  }

  function renderCharts(){
    const sim = Simulator.simulateAll(24);
    const ids = Object.keys(sim);
    if (!ids.length){
      ['chartBalance','chartIncome','chartExpense'].forEach(id=>{
        const c = $(id);
        const ctx = c.getContext('2d');
        const r = c.getBoundingClientRect();
        const dpr = window.devicePixelRatio||1;
        c.width = r.width*dpr; c.height = r.height*dpr;
        ctx.scale(dpr,dpr);
        ctx.fillStyle = '#94a3b8'; ctx.font='11px sans-serif'; ctx.textAlign='center';
        ctx.fillText('Нет данных', r.width/2, r.height/2);
      });
      return;
    }
    const balance = [], income = [], expense = [];
    for (let m=0; m<=24; m++){
      let net=0, inc=0, exp=0;
      Storage.all().forEach(p=>{
        const h = sim[p.id].history[m];
        if (!h) return;
        const isL = Config.TYPES[p.type].liability;
        net += isL ? -h.value : h.value;
        inc += h.cumIncome;
        exp += h.cumExpense;
      });
      balance.push(net); income.push(inc); expense.push(exp);
    }
    Charts.draw($('chartBalance'), [{color:'#2563eb', data:balance}]);
    Charts.draw($('chartIncome'),  [{color:'#16a34a', data:income}]);
    Charts.draw($('chartExpense'), [{color:'#dc2626', data:expense}]);
  }

  function renderForecast(){
    const total = (months, withEvents) => {
      const sim = Simulator.simulateAll(months);
      let net = 0;
      Storage.all().forEach(p=>{
        const isL = Config.TYPES[p.type].liability;
        const v = withEvents
          ? sim[p.id].endValue
          : sim[p.id].history[sim[p.id].history.length-1].value;
        net += isL ? -v : v;
      });
      return net;
    };
    const now0 = (() => {
      let net = 0;
      Storage.all().forEach(p=>{
        const isL = Config.TYPES[p.type].liability;
        const v = p.type === 'investment'
          ? Simulator.portfolioValue(p) : (p.amount || 0);
        net += isL ? -v : v;
      });
      return net;
    })();
    const assets0 = Storage.all().reduce(
      (s,p) => Config.TYPES[p.type].liability ? s
        : s + (p.type === 'investment' ? Simulator.portfolioValue(p) : (p.amount||0)),
      0
    );
    const base0 = assets0 > 0 ? assets0 : (Math.abs(now0) || 1);

    const periods = [
      {label:'1 мес', m:1},{label:'1 год', m:12},{label:'5 лет', m:60},{label:'10 лет',m:120},
    ];
    function col(withEvents){
      return periods.map(per=>{
        const val = total(per.m, withEvents);
        const gain = val - now0;
        const pct = gain / base0 * 100;
        return `<div class="fc-row">
          <div class="fc-label">${per.label}</div>
          <div class="fc-value">${fmtMoney(val)}</div>
          <div class="fc-gain ${gain>=0?'green':'red'}">
            ${gain>=0?'+':''}${fmtMoney(gain)} (${pct.toFixed(1)}%)</div>
        </div>`;
      }).join('');
    }
    $('fc1').innerHTML = col(false);
    $('fc2').innerHTML = col(true);
  }

  function prevMonth(){ calDate.setMonth(calDate.getMonth()-1); renderCalendar(); }
  function nextMonth(){ calDate.setMonth(calDate.getMonth()+1); renderCalendar(); }
  function renderAll(){
    renderStats(); renderEvents(); renderCalendar(); renderCharts(); renderForecast();
    SinceVisit.render();
  }
  return { renderAll, renderCharts, prevMonth, nextMonth };
})();