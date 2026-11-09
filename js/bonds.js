/* Учёт выплат: опубликованные суммы MOEX, без предположений о будущих ставках. */
const Bonds = (() => {
  const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Moscow' }).format(new Date());
  const money = n => Math.round((n + Number.EPSILON) * 100) / 100;

  // ===== Зачёт операций: наступившие пополнения/списания по балансу =====
  // Раньше операции жили только в прогнозе: наступившие начисления
  // (например, еженедельное пополнение дебетовой карты) никогда не
  // попадали в реальный баланс. Теперь каждая наступившая дата
  // операции проводится по балансу ровно один раз: последний зачтённый
  // случай фиксируется в op.settledThrough, поэтому повторные запуски
  // ничего не задваивают.
  const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  // Все наступившие (≤ date) и ещё не зачтённые даты операции.
  function opSettleDates(op, date){
    const start = String(op.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
    const end = op.endDate ? String(op.endDate).slice(0, 10) : null;
    const through = op.settledThrough ? String(op.settledThrough).slice(0, 10) : null;
    if (op.frequency === 'once' || !op.frequency){
      return (start <= date && (!end || start <= end) && (!through || start > through)) ? [start] : [];
    }
    if (op.frequency !== 'weekly' && op.frequency !== 'monthly' && op.frequency !== 'yearly') return [];
    const d = new Date(start + 'T00:00:00');
    if (isNaN(d.getTime())) return [];
    const out = [];
    let guard = 0;
    while (guard++ < 3000){
      const iso = isoOf(d);
      if (iso > date) break;
      if ((!end || iso <= end) && (!through || iso > through)) out.push(iso);
      if (op.frequency === 'weekly') d.setDate(d.getDate() + 7);
      else if (op.frequency === 'monthly') d.setMonth(d.getMonth() + 1);
      else d.setFullYear(d.getFullYear() + 1);
    }
    return out;
  }

  function settleOperations(p, date, list){
    if (p.type === 'expense' || !Array.isArray(p.operations)) return false;
    const isLiab = p.type === 'credit_card' || p.type === 'loan';
    let changed = false;
    for (const op of p.operations){
      if (!op || !op.amount) continue;
      const dates = opSettleDates(op, date);
      if (!dates.length) continue;
      const total = money(op.amount * dates.length);
      if (!Number.isFinite(total) || total <= 0) continue;
      if (op.direction === 'in'){
        // Пополнение: на карте/вкладе — рост баланса, на кредитке — уменьшение долга.
        p.amount = isLiab
          ? money(Math.max(0, (p.amount || 0) - total))
          : money((p.amount || 0) + total);
      } else {
        // Снятие: на карте/вкладе — уменьшение баланса, на кредитке — рост долга.
        p.amount = isLiab
          ? money((p.amount || 0) + total)
          : money(Math.max(0, (p.amount || 0) - total));
        // Снятие, помеченное «платёж по долгу», — это перевод: деньги ушли
        // с этого продукта и на ту же сумму уменьшили долг кредитки/кредита.
        if (op.debtTargetId && Array.isArray(list)){
          const t = list.find(x => x && x.id === op.debtTargetId && (x.type === 'credit_card' || x.type === 'loan'));
          if (t) t.amount = money(Math.max(0, (t.amount || 0) - total));
        }
      }
      op.settledThrough = dates[dates.length - 1];
      changed = true;
    }
    return changed;
  }

  function price(a){
    if (a.redeemed) return 0;
    // Старые котировки облигаций были сохранены в процентах от номинала.
    if (a.kind === 'bond' && a.priceUnit !== 'rub' && a.lastPrice != null)
      return a.lastPrice * (a.nominal || 1000) / 100;
    let value = a.lastPrice ?? a.avgPrice ?? 0;
    if (a.kind === 'bond' && a.nominal > 0) {
      const quotedOn = (a.moexUpdatedAt || a.accountingFrom || today()).slice(0,10);
      const principalSinceQuote = Object.values(a.paidEvents || {})
        .filter(p => p.type === 'principal' && p.date > quotedOn)
        .reduce((s,p) => s + p.amount / (a.qty || 1), 0);
      value *= Math.max(0, 1 - principalSinceQuote / a.nominal);
    }
    return value;
  }
  function payments(a){
    if (a.kind !== 'bond') return [];
    const start = a.accountingFrom || today();
    const coupons = (a.coupons || []).filter(c => c.date >= start &&
      (!a.purchaseDate || a.purchaseDate < (c.recordDate || c.date)) &&
      (!a.maturityDate || c.date <= a.maturityDate))
      .map(c => ({ ...c, type:'coupon', key:`coupon:${c.date}` }));
    const amortizations = (a.amortizations || []).filter(c => c.date >= start)
      .map(c => ({ ...c, type:'principal', key:`principal:${c.date}` }));
    if (a.maturityDate && a.maturityDate >= start && !amortizations.some(c => c.date === a.maturityDate)) {
      const earlier = amortizations.filter(c => c.date < a.maturityDate).reduce((s,c) => s + (c.value || 0), 0);
      amortizations.push({ date:a.maturityDate, value:Math.max(0, (a.nominal || 0) - earlier), type:'principal', key:`principal:${a.maturityDate}` });
    }
    return [...coupons, ...amortizations].sort((a,b) => a.date.localeCompare(b.date));
  }
  function settleProduct(p, date = today(), list){
    let changed = false;
    if (p.type === 'investment') {
      for (const a of p.assets || []) {
        if (a.kind !== 'bond') continue;
        if (!a.accountingFrom) { a.accountingFrom = date; changed = true; }
        a.paidEvents ||= {};
        for (const pay of payments(a)) {
          if (pay.date > date || pay.value == null || !Number.isFinite(pay.value) || pay.value < 0 || a.paidEvents[pay.key]) continue;
          const amount = money(pay.value * (a.qty || 0));
          p.amount = money((p.amount || 0) + amount);
          a.paidEvents[pay.key] = { date:pay.date, amount, type:pay.type };
          changed = true;
        }
        if (a.maturityDate && a.maturityDate <= date && a.paidEvents[`principal:${a.maturityDate}`] && !a.redeemed) {
          a.redeemed = true; changed = true;
        }
      }
    }
    // Операции продукта (пополнения/списания) — у всех типов, кроме расходов.
    changed = settleOperations(p, date, list) || changed;
    return changed;
  }
  function settleAll(){
    let changed = false;
    const list = Storage.all();
    for (const p of list) changed = settleProduct(p, today(), list) || changed;
    if (changed) Storage.save(list);
  }
  function futurePayments(a, from, to){
    return payments(a).filter(c => c.date > from && c.date <= to && !a.paidEvents?.[c.key] && c.value != null);
  }
  return { price, payments, settleProduct, settleAll, settleOperations, opSettleDates, futurePayments, today };
})();

if (typeof module !== 'undefined') module.exports = Bonds;
