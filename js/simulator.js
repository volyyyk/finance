/* ============================================================
   simulator.js — Simulator, Stats
   Зависит: Config, Utils, Storage
   ============================================================ */

window.__KEY_RATE__ = window.__KEY_RATE__ ?? 16;

// Сколько раз операция повторится за ближайшие 12 месяцев.
// Используется для сводки «Доходность за год / за месяц» вверху приложения,
// чтобы регулярные пополнения (например, на дебетовую карту) шли в общий зачёт.
function opOccurrencesInYear(op){
  const now = new Date(); now.setHours(0,0,0,0);
  const start = Utils.parseDate(op.date);
  if (!start) return 0;
  const end = op.endDate ? Utils.parseDate(op.endDate) : null;
  const horizon = new Date(now);
  horizon.setFullYear(horizon.getFullYear() + 1);
  if (op.frequency === 'once') return (start >= now && start <= horizon) ? 1 : 0;
  let n = 0;
  const d = new Date(start);
  let guard = 0;
  while (d <= horizon && guard++ < 1200){
    if (d >= now && (!end || d <= end)) n++;
    if (op.frequency === 'weekly')       d.setDate(d.getDate() + 7);
    else if (op.frequency === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (op.frequency === 'yearly')  d.setFullYear(d.getFullYear() + 1);
    else break;
  }
  return n;
}

const Simulator = (() => {
  const { parseDate } = Utils;

  // noEndLimit — режим «без событий»: операции не имеют даты окончания
  function opOccursInMonth(op, monthDate, opStartDate, noEndLimit){
    if (!opStartDate) return false;
    if (op.frequency === 'once'){
      const d = parseDate(op.date);
      return d && d.getFullYear()===monthDate.getFullYear() && d.getMonth()===monthDate.getMonth();
    }
    if (monthDate < opStartDate) return false;
    if (!noEndLimit && op.endDate && monthDate > parseDate(op.endDate)) return false;
    if (op.frequency === 'monthly') return true;
    if (op.frequency === 'yearly')  return monthDate.getMonth() === opStartDate.getMonth();
    if (op.frequency === 'weekly')  return true;
    return false;
  }

  // Стоимость портфеля инвестиций (кэш + стоимость акций/облигаций)
  function portfolioValue(product){
    if (product.type !== 'investment'){
      return product.amount || 0;
    }
    const assets = product.assets || [];
    const stocks = assets.reduce((s,a) =>
      s + (a.qty || 0) * Bonds.price(a), 0);
    return (product.amount || 0) + stocks;
  }

  // Годовой купонный доход по одному активу
  function annualCouponForAsset(a){
    if (a.kind !== 'bond') return 0;
    if (a.redeemed) return 0;
    const from = Bonds.today();
    const end = new Date(); end.setFullYear(end.getFullYear() + 1);
    return Bonds.futurePayments(a, from, Utils.dateKey(end))
      .filter(c => c.type === 'coupon').reduce((s,c) => s + c.value * (a.qty || 0), 0);
  }

  // opts.noEvents — прогноз «без учёта событий»: даты окончания, лимиты
  // операций и действия при окончании не применяются — вклады продолжают
  // действовать с прежней ставкой, пополнения идут до конца горизонта.
  // Облигации в этом режиме не погашаются: купоны капают по графику,
  // тело облигации остаётся в портфеле.
  function simulateProduct(product, months, extraInflows, opts = {}){
    const isLiab = Config.TYPES[product.type].liability;
    const isExpense = product.type === 'expense';
    const isInvest = product.type === 'investment';
    const isCredit = product.type === 'credit_card';
    const isApartment = product.type === 'apartment';
    const noEvents = opts && opts.noEvents === true;

    const now = new Date(); now.setHours(0,0,0,0);
    const endDate = (!noEvents && product.endDate) ? parseDate(product.endDate) : null;

    let value = isInvest ? portfolioValue(product) : (product.amount || 0);
    let rate = product.rate || 0;
    let currentEnd = endDate;
    let actionIndex = 0;
    const actions = noEvents ? [] : (Array.isArray(product.endActions)
      ? product.endActions
      : (product.endAction ? [product.endAction] : []));

    let cumIncome = 0, cumExpense = 0;
    const history = [{ month:0, value, cumIncome:0, cumExpense:0 }];

    // Разделяем кэш, акции, фонды, металлы и облигации для инвестиций.
    // Фонды растут по своей доходности за полгода (sixMonthPct),
    // металлы в прогнозе не растут — только справочно показывают изменение.
    let cash = isInvest ? (product.amount || 0) : 0;
    let stocks = isInvest ? (product.assets || []).filter(a => a.kind === 'stock').reduce((s,a) => s + (a.qty || 0) * Bonds.price(a), 0) : 0;
    let metals = isInvest ? (product.assets || []).filter(a => a.kind === 'metal').reduce((s,a) => s + (a.qty || 0) * Bonds.price(a), 0) : 0;
    const fundItems = isInvest ? (product.assets || []).filter(a => a.kind === 'fund')
      .map(a => ({ a, value: (a.qty || 0) * Bonds.price(a) })) : [];
    let funds = fundItems.reduce((s,f) => s + f.value, 0);
    let bonds = isInvest ? value - cash - stocks - funds - metals : 0;
    const resetInvest = () => { cash = 0; stocks = 0; funds = 0; metals = 0; bonds = 0; fundItems.forEach(f => f.value = 0); };
    let previousDate = Utils.dateKey(now);
    const principalPaid = new Map();
    // Выплаты облигаций считаются один раз на весь прогноз, а не для
    // каждого месяца заново (график выплат не меняется в рамках расчёта).
    const bondList = isInvest ? (product.assets || [])
      .filter(a => a.kind === 'bond' && !a.redeemed)
      .map(a => ({ a, pays: Bonds.payments(a) })) : [];

    for (let m=1; m<=months; m++){
      const monthDate = new Date(now);
      monthDate.setDate(1);
      monthDate.setMonth(monthDate.getMonth() + m);
      monthDate.setDate(Math.min(now.getDate(), new Date(monthDate.getFullYear(), monthDate.getMonth()+1, 0).getDate()));

      if (isExpense){
        // Обязательный расход
        value = Math.max(0, value - (product.amount || 0));
        cumExpense += product.amount || 0;
      } else {
        if (isInvest) {
          // Проценты капают ТОЛЬКО на акции
          const interest = stocks * rate / 100 / 12;
          stocks += interest;
          // Фонды растут по своей доходности за полгода:
          // месячный множитель = (1 + доходность/100)^(1/6)
          let fundGrowth = 0;
          for (const f of fundItems){
            const pct = f.a.sixMonthPct;
            if (pct == null || !Number.isFinite(pct) || 1 + pct/100 <= 0) continue;
            const newValue = f.value * Math.pow(1 + pct/100, 1/6);
            fundGrowth += newValue - f.value;
            f.value = newValue;
          }
          funds += fundGrowth;
          let coupon = 0;
          const through = Utils.dateKey(monthDate);
          for (const { a, pays } of bondList){
            for (const pay of pays){
              if (pay.date <= previousDate || pay.date > through || pay.value == null || a.paidEvents?.[pay.key]) continue;
              const amount = pay.value * (a.qty || 0);
              if (pay.type !== 'coupon' && noEvents) continue; // без событий долг облигации не возвращается
              cash += amount;
              if (pay.type === 'coupon') coupon += amount;
              else {
                const paid = principalPaid.get(a.id) || 0;
                const base = (a.qty || 0) * Bonds.price(a);
                const deduction = a.maturityDate === pay.date ? base - paid
                  : Math.min(base - paid, base * pay.value / (a.nominal || 1));
                bonds -= deduction;
                principalPaid.set(a.id, paid + deduction);
              }
            }
          }
          previousDate = through;
          value = cash + stocks + funds + bonds + metals;
          cumIncome += interest + coupon + fundGrowth;
        } else if (isCredit) {
          // Кредитная карта: проценты на остаток долга не начисляются
        } else if (isApartment) {
          // Квартира: стоимость растёт на заданный процент в год,
          // аренда (если сдаётся) идёт в доход, ремонт — в расход.
          const interest = value * rate / 100 / 12;
          value += interest;
          cumIncome += Math.max(0, interest);
          if (product.rented) cumIncome += product.rentPrice || 0;
          cumExpense += value * (product.upkeepRate || 0) / 100 / 12;
        } else {
          const interest = value * rate / 100 / 12;
          value += interest;
          if (isLiab) cumExpense += Math.max(0, interest);
          else        cumIncome  += Math.max(0, interest);
        }
      }

      // Операции (пополнения/снятия). В режиме «без событий» операции
      // продолжаются до конца горизонта — их дата окончания не учитывается.
      product.operations?.forEach(op => {
        const opStart = parseDate(op.date);
        if (!opOccursInMonth(op, monthDate, opStart, noEvents)) return;

        let amount = op.amount;
        if (op.frequency === 'weekly') amount = op.amount * 52 / 12;
        else if (op.frequency === 'yearly'){
          if (monthDate.getMonth() !== opStart.getMonth()) return;
        }

        if (op.direction === 'in'){
          if (isLiab && !isExpense){
            value = Math.max(0, value - amount);
            cumIncome += amount;
          } else if (isInvest) {
            cash += amount;
            value += amount;
            cumIncome += amount;
          } else {
            value += amount;
            cumIncome += amount;
          }
        } else {
          if (isLiab && !isExpense){
            value += amount;
            cumExpense += amount;
          } else if (isInvest) {
            cash = Math.max(0, cash - amount);
            value -= amount;
            cumExpense += amount;
          } else {
            value = Math.max(0, value - amount);
            cumExpense += amount;
          }
        }
      });

      extraInflows?.forEach(t=>{
        if (t.month === m){
          value += t.amount;
          if (isInvest) cash += t.amount;
          cumIncome += t.amount;
        }
      });

      // Обработка окончания срока (не применяется в режиме «без событий»)
      if (currentEnd && monthDate > currentEnd){
        const act = actions[actionIndex];
        if (act){
          actionIndex++;
          if (act.type === 'change'){
            rate = act.newRate ?? rate;
            currentEnd = act.newEndDate ? parseDate(act.newEndDate) : null;
          } else if (act.type === 'close' || act.type === 'transfer'){
            resetInvest();
            value = 0;
            currentEnd = null;
          }
        } else {
          resetInvest();
          value = 0;
          currentEnd = null;
        }
      }

      history.push({ month:m, value, cumIncome, cumExpense });
    }
    return { history, endValue: value };
  }

  function monthIndexOfDate(iso){
    const d = parseDate(iso); if (!d) return -1;
    const now = new Date();
    return (d.getFullYear()-now.getFullYear())*12 + (d.getMonth()-now.getMonth());
  }

  // Версия данных (ключ кэша). null — если Storage не поддерживает
  // version() (например, упрощённая подстановка в тестах): кэш выключен.
  function dataVersion(){
    return (typeof Storage !== 'undefined' && typeof Storage.version === 'function')
      ? Storage.version() : null;
  }

  function simulateAllRaw(months, opts){
    const noEvents = opts && opts.noEvents === true;
    const list = Storage.all();
    const pass1 = {};
    list.forEach(p => { pass1[p.id] = simulateProduct(p, months, [], opts); });

    // Переводы между продуктами — часть цепочки событий, в режиме
    // «без событий» они не выполняются.
    const boosts = {};
    if (!noEvents){
      list.forEach(p => {
        const chain = Array.isArray(p.endActions) ? p.endActions
                    : (p.endAction ? [p.endAction] : []);
        let mEnd = p.endDate ? monthIndexOfDate(p.endDate) : -1;
        for (const act of chain){
          if (mEnd > 0 && act.type === 'transfer' && act.targetId){
            const amount = pass1[p.id].history[mEnd]?.value || 0;
            if (amount > 0){
              (boosts[act.targetId] ??= []).push({ month: mEnd, amount });
            }
            break;
          }
          if (act.type === 'change' && act.newEndDate){
            mEnd = monthIndexOfDate(act.newEndDate);
          } else {
            break;
          }
        }
      });
    }

    const result = {};
    list.forEach(p => { result[p.id] = simulateProduct(p, months, boosts[p.id] || [], opts); });
    return result;
  }

  // Кэш тяжёлой симуляции: один расчёт на самую длинную глубину
  // обслуживает и все более короткие горизонты (срез истории),
  // пока версия данных не изменилась. Прогностическая таблица и
  // графики запрашивают 1/12/24/60/120 месяцев — без кэша это
  // пять полных прогонов симуляции на каждую перерисовку.
  // Прогноз «без событий» кэшируется отдельно от прогноза «с событиями».
  let simMemo = { version: null, months: 0, results: null };
  let simMemoNoEvents = { version: null, months: 0, results: null };
  function simulateAll(months, opts){
    const noEvents = opts && opts.noEvents === true;
    let memo = noEvents ? simMemoNoEvents : simMemo;
    const v = dataVersion();
    if (v !== null && memo.results && v === memo.version && months <= memo.months){
      const out = {};
      for (const id of Object.keys(memo.results)){
        const r = memo.results[id];
        out[id] = { history: r.history.slice(0, months + 1), endValue: r.history[months].value };
      }
      return out;
    }
    const results = simulateAllRaw(months, opts);
    if (v !== null){
      memo = { version: v, months, results };
      if (noEvents) simMemoNoEvents = memo; else simMemo = memo;
    }
    return results;
  }

  return { simulateProduct, simulateAll, portfolioValue, annualCouponForAsset };
})();

const Stats = (() => {
  // Сводка считается один раз на версию данных: GoalBar, карточки
  // статистики и результаты используют один и тот же aggregate().
  let aggMemo = { version: null, value: null };
  function dataVersion(){
    return (typeof Storage !== 'undefined' && typeof Storage.version === 'function')
      ? Storage.version() : null;
  }
  function aggregate(){
    const v = dataVersion();
    if (v !== null && aggMemo.value && v === aggMemo.version) return aggMemo.value;
    const result = aggregateRaw();
    if (v !== null) aggMemo = { version: v, value: result };
    return result;
  }
  function aggregateRaw(){
    let assets = 0, debts = 0, inc = 0, exp = 0;
    const list = Storage.all();
    list.forEach(p => {
      // offBudget: продукт не участвует в текущем балансе (активах/долгах),
      // но его доходы и расходы по-прежнему влияют на статистику.
      const off = p.offBudget === true;
      if (p.type === 'expense'){
        exp += (p.amount || 0) * 12;
        return;
      }
      if (p.type === 'apartment'){
        const v = p.amount || 0;
        if (!off) assets += v;
        inc += v * (p.rate || 0) / 100 + (p.rented ? (p.rentPrice || 0) * 12 : 0);
        exp += v * (p.upkeepRate || 0) / 100;
        return;
      }
      if (p.type === 'investment'){
        const v = Simulator.portfolioValue(p);
        if (!off) assets += v;
        const cash = p.amount || 0;
        const stocks = (p.assets || []).filter(a => a.kind === 'stock').reduce((s,a) => s + (a.qty || 0) * Bonds.price(a), 0);
        const couponAnnual = (p.assets || [])
          .reduce((s,a) => s + Simulator.annualCouponForAsset(a), 0);
        // Доход считаем с акций, купонов и фондов. На кэш и металлы
        // проценты не капают: металлы показывают изменение справочно.
        const fundAnnual = (p.assets || []).filter(a => a.kind === 'fund').reduce((s,a) => {
          const pct = a.sixMonthPct;
          if (pct == null || !Number.isFinite(pct) || 1 + pct/100 <= 0) return s;
          return s + (a.qty || 0) * Bonds.price(a) * (Math.pow(1 + pct/100, 2) - 1);
        }, 0);
        inc += couponAnnual + stocks * (p.rate || 0) / 100 + fundAnnual;
        return;
      }
      if (p.type === 'credit_card'){
        if (!off) debts += p.amount || 0;
        // На долг кредитной карты проценты автоматически не начисляем
        return;
      }
      if (Config.TYPES[p.type].liability){
        if (!off) debts += p.amount || 0;
        exp += (p.amount || 0) * (p.rate || 0) / 100;
      } else {
        if (!off) assets += p.amount || 0;
        inc += (p.amount || 0) * (p.rate || 0) / 100;
      }
    });

    // Регулярные пополнения и снятия идут в общий годовой зачёт:
    // пополнение — в доход, снятие — в расход (для обязательств пополнение
    // уменьшает долг, снятие — увеличивает).
    list.forEach(p => (p.operations || []).forEach(op => {
      if (!op.amount) return;
      const n = opOccurrencesInYear(op);
      if (!n) return;
      const total = op.amount * n;
      if (op.direction === 'out') exp += total;
      else                        inc += total;
    }));

    const net = assets - debts;
    const netAnnual = inc - exp;
    const netMonthly = netAnnual / 12;
    const base = assets > 0 ? assets : (Math.abs(net) || 1);
    const pctAnnual = netAnnual / base * 100;
    const pctMonthly = netMonthly / base * 100;
    return { assets, debts, net, inc, exp, netAnnual, netMonthly, pctAnnual, pctMonthly };
  }
  return { aggregate };
})();

