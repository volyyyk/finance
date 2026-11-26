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

  // Полная рыночная стоимость брокерского счёта:
  // свободные деньги + все позиции (акции, облигации, фонды, металлы).
  function portfolioValue(product){
    if (product.type !== 'investment') return product.amount || 0;
    return (product.amount || 0) + (product.assets || []).reduce((sum,a) =>
      sum + (a.redeemed ? 0 : (a.qty || 0) * Bonds.price(a)), 0);
  }

  // Дата месяца m от «сейчас» — та же точка месяца, что в simulateProduct.
  function monthAt(now, m){
    const monthDate = new Date(now);
    monthDate.setDate(1);
    monthDate.setMonth(monthDate.getMonth() + m);
    monthDate.setDate(Math.min(now.getDate(), new Date(monthDate.getFullYear(), monthDate.getMonth()+1, 0).getDate()));
    return monthDate;
  }

  // Сумма операции в конкретном месяце прогноза или null, если в этом
  // месяце операции нет. Единая логика для продукта-источника и для
  // графика погашения долга.
  function opMonthlyAmount(op, monthDate, noEndLimit){
    const opStart = parseDate(op.date);
    if (!opOccursInMonth(op, monthDate, opStart, noEndLimit)) return null;
    let amount = op.amount;
    if (op.frequency === 'weekly') amount = op.amount * 52 / 12;
    else if (op.frequency === 'yearly'){
      if (monthDate.getMonth() !== opStart.getMonth()) return null;
    }
    return amount;
  }

  // Операции «платёж по долгу» (op.debtTargetId) на других продуктах:
  // деньги уходят с источника и в те же месяцы уменьшают долг
  // кредитки/кредита. Раньше такой платёж просто списывался из баланса,
  // а долг оставался прежним — двойное списание.
  function collectDebtPaydowns(list, months, noEndLimit){
    const targets = new Set();
    for (const p of list){
      for (const op of p.operations || []){
        if (op.direction !== 'out' || !op.debtTargetId || !op.amount) continue;
        const t = list.find(x => x.id === op.debtTargetId);
        if (t && Config.TYPES[t.type] && Config.TYPES[t.type].liability && t.type !== 'expense'){
          targets.add(op.debtTargetId);
        }
      }
    }
    if (!targets.size) return {};
    const now = new Date(); now.setHours(0,0,0,0);
    const out = {};
    for (const id of targets){
      const rows = [];
      for (let m = 1; m <= months; m++){
        let total = 0;
        for (const p of list){
          for (const op of p.operations || []){
            if (op.direction !== 'out' || op.debtTargetId !== id || !op.amount) continue;
            const amount = opMonthlyAmount(op, monthAt(now, m), noEndLimit);
            if (amount != null) total += amount;
          }
        }
        if (total > 0) rows.push({ month: m, amount: total });
      }
      if (rows.length) out[id] = rows;
    }
    return out;
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
  function simulateProduct(product, months, extraInflows, opts = {}, debtPaydowns){
    const isLiab = Config.TYPES[product.type].liability;
    const isExpense = product.type === 'expense';
    const isInvest = product.type === 'investment';
    const isCredit = product.type === 'credit_card';
    const isApartment = product.type === 'apartment';
    const noEvents = opts && opts.noEvents === true;

    const now = new Date(); now.setHours(0,0,0,0);
    const endDate = (!noEvents && product.endDate) ? parseDate(product.endDate) : null;

    // Обязательный расход — это денежный поток, а не актив/долг на балансе.
    // Хранить его сумму в value приводило к ложному росту капитала в прогнозе,
    // когда «остаток расхода» исчезал уже в первый месяц.
    let value = isExpense ? 0 : (isInvest ? portfolioValue(product) : (product.amount || 0));
    let rate = product.rate || 0;
    let currentEnd = endDate;
    let actionIndex = 0;
    const actions = noEvents ? [] : (Array.isArray(product.endActions)
      ? product.endActions
      : (product.endAction ? [product.endAction] : []));

    let cumIncome = 0, cumExpense = 0;
    const history = [{ month:0, value, cumIncome:0, cumExpense:0 }];
    // Переводы при окончании срока: фиксируются в момент закрытия
    // продукта (месяц, получатель, сумма) — см. блок обработки окончания.
    const transfers = [];

    // Все позиции прогнозируются отдельно по фактической динамике цены
    // за последние 6 месяцев. Купоны и погашения облигаций учитываются
    // отдельно, чтобы возврат номинала не считался инвестиционным доходом.
    let cash = isInvest ? (product.amount || 0) : 0;
    const makeItems = kind => isInvest ? (product.assets || [])
      .filter(a => a.kind === kind && !a.redeemed)
      .map(a => ({ a, value: (a.qty || 0) * Bonds.price(a) })) : [];
    const stockItems = makeItems('stock');
    const fundItems = makeItems('fund');
    const metalItems = makeItems('metal');
    const bondList = makeItems('bond').map(item => ({
      ...item, pays: Bonds.payments(item.a)
    }));
    const priceItems = [...stockItems, ...fundItems, ...metalItems, ...bondList];
    const assetValue = () => priceItems.reduce((sum,item) => sum + item.value, 0);
    const resetInvest = () => {
      cash = 0;
      priceItems.forEach(item => { item.value = 0; });
    };
    let previousDate = Utils.dateKey(now);

    for (let m=1; m<=months; m++){
      const monthDate = new Date(now);
      monthDate.setDate(1);
      monthDate.setMonth(monthDate.getMonth() + m);
      monthDate.setDate(Math.min(now.getDate(), new Date(monthDate.getFullYear(), monthDate.getMonth()+1, 0).getDate()));

      if (isExpense){
        // Обязательный расход влияет только на денежный поток, не на капитал.
        cumExpense += product.amount || 0;
      } else {
        if (isInvest) {
          // Повторяем месячный темп, соответствующий изменению за 6 месяцев.
          // Это сценарная экстраполяция, а не обещание будущей доходности.
          let priceGrowth = 0;
          for (const item of priceItems){
            const pct = item.a.sixMonthPct;
            if (pct == null || !Number.isFinite(pct) || 1 + pct/100 <= 0) continue;
            const nextValue = item.value * Math.pow(1 + pct/100, 1/6);
            priceGrowth += nextValue - item.value;
            item.value = nextValue;
          }
          let coupon = 0;
          const through = Utils.dateKey(monthDate);
          for (const bond of bondList){
            const { a, pays } = bond;
            for (const pay of pays){
              if (pay.date <= previousDate || pay.date > through || pay.value == null || a.paidEvents?.[pay.key]) continue;
              if (pay.type !== 'coupon' && noEvents) continue; // без событий тело облигации не возвращается
              const amount = pay.value * (a.qty || 0);
              cash += amount;
              if (pay.type === 'coupon') coupon += amount;
              else {
                const deduction = a.maturityDate === pay.date
                  ? bond.value
                  : Math.min(bond.value, bond.value * pay.value / (a.nominal || 1));
                bond.value = Math.max(0, bond.value - deduction);
              }
            }
          }
          previousDate = through;
          value = cash + assetValue();
          cumIncome += priceGrowth + coupon;
        } else if (isCredit) {
          // Кредитная карта: проценты на остаток долга не начисляются
        } else if (isApartment) {
          // Рост стоимости квартиры задан как эффективный годовой процент:
          // за 12 месяцев цена вырастет ровно на rate%, без скрытых лишних 0.3 п.п.
          // Аренда идёт в доход, ремонт считается от текущей рыночной стоимости.
          const annualGrowth = Math.max(0, 1 + rate / 100);
          const nextValue = value * Math.pow(annualGrowth, 1 / 12);
          const appreciation = nextValue - value;
          value = nextValue;
          cumIncome += appreciation;
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
            // Пополнение карточного/кредитного долга — погашение обязательства,
            // а не заработок. Перевод с источника учитывается отдельно.
            value = Math.max(0, value - amount);
          } else if (isInvest || product.type === 'deposit') {
            // Пополнение собственного вклада/брокерского счёта — движение
            // капитала, не доход. Доходом остаются проценты, купоны и рост.
            if (isInvest) cash += amount;
            value += amount;
          } else if (isExpense) {
            // Возврат/компенсация обязательного расхода.
            cumIncome += amount;
          } else {
            value += amount;
            cumIncome += amount;
          }
        } else {
          if (isLiab && !isExpense){
            value += amount;
            // Покупка по кредитке — расход. Выдача дополнительного кредита
            // меняет обязательство, но сама по себе не является потреблением.
            if (product.type === 'credit_card' && !op.debtTargetId) cumExpense += amount;
          } else if (isInvest || product.type === 'deposit') {
            if (isInvest) cash = Math.max(0, cash - amount);
            value = Math.max(0, value - amount);
            // Снятие собственного капитала не является расходом.
          } else if (isExpense) {
            cumExpense += amount;
          } else {
            value = Math.max(0, value - amount);
            // Платёж по долгу — перевод, а не расход.
            if (!op.debtTargetId) cumExpense += amount;
          }
        }
      });

      // Платежи по этому долгу из других продуктов (операции
      // «платёж по долгу»): деньги уже списаны с источника,
      // здесь уменьшается только сам долг.
      if (debtPaydowns && isLiab && !isExpense){
        debtPaydowns.forEach(t => {
          if (t.month === m) value = Math.max(0, value - t.amount);
        });
      }

      extraInflows?.forEach(t=>{
        if (t.month === m){
          value += t.amount;
          if (isInvest) cash += t.amount;
          // extraInflows здесь — переводы тела закрытого продукта.
          // Перенос собственных денег между счетами не создаёт доход.
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
            // Сумму перевода фиксируем ДО обнуления: из history её брать
            // нельзя — к концу месяца закрытия значение уже ноль, и деньги
            // «исчезали» из прогноза (вклад до 3 января при точке симуляции
            // 5-го числа обнулялся, а перевод не приходил).
            if (act.type === 'transfer' && act.targetId && value > 0)
              transfers.push({ month: m, targetId: act.targetId, amount: value });
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
    return { history, endValue: value, transfers };
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
      // Переводы при окончании срока фиксируются в simulateProduct в момент
      // закрытия: месяц, получатель и точная сумма. Раньше сумма читалась
      // из history месяца окончания, но к концу этого месяца вклад уже
      // обнулён — деньги пропадали из прогноза (провал на графике).
      list.forEach(p => {
        (pass1[p.id].transfers || []).forEach(t => {
          if (t.month > 0 && t.amount > 0){
            (boosts[t.targetId] ??= []).push({ month: t.month, amount: t.amount });
          }
        });
      });
    }

    const result = {};
    // Операции «платёж по долгу»: долг кредитки/кредита уменьшается
    // в те же месяцы, что и списание с продукта-источника.
    const paydowns = collectDebtPaydowns(list, months, noEvents);
    list.forEach(p => { result[p.id] = simulateProduct(p, months, boosts[p.id] || [], opts, paydowns[p.id] || []); });
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

  function annualNet(product){
    const result = simulateAll(12);
    const history = result[product.id]?.history || [];
    const year = history[12];
    return year ? (year.cumIncome || 0) - (year.cumExpense || 0) : 0;
  }

  return { simulateProduct, simulateAll, portfolioValue, annualCouponForAsset, annualNet };
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
      // Вне бюджета исключает продукт только из текущего баланса,
      // но не из расчёта его денежных потоков.
      // Обязательные расходы — денежный поток, а не актив/долг.
      if (p.offBudget === true || p.type === 'expense') return;
      if (p.type === 'investment'){
        assets += Simulator.portfolioValue(p);
      } else if (Config.TYPES[p.type].liability){
        debts += p.amount || 0;
      } else {
        assets += p.amount || 0;
      }
    });

    // Единственный источник прогноза доходов/расходов — тот же движок,
    // который строит графики и прогноз капитала. Это учитывает капитализацию,
    // окончания вкладов, переводы тела вклада, купоны, аренду, ремонт,
    // регулярные операции и погашение долгов без параллельных формул.
    const forecast = Simulator.simulateAll(12);
    list.forEach(p => {
      const h = forecast[p.id]?.history?.[12];
      if (!h) return;
      inc += h.cumIncome || 0;
      exp += h.cumExpense || 0;
    });

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

