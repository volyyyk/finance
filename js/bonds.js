/* Учёт выплат: опубликованные суммы MOEX, без предположений о будущих ставках. */
const Bonds = (() => {
  const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Moscow' }).format(new Date());
  const money = n => Math.round((n + Number.EPSILON) * 100) / 100;
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
  function settleProduct(p, date = today()){
    if (p.type !== 'investment') return false;
    let changed = false;
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
    return changed;
  }
  function settleAll(){
    let changed = false;
    const list = Storage.all();
    for (const p of list) changed = settleProduct(p) || changed;
    if (changed) Storage.save(list);
  }
  function futurePayments(a, from, to){
    return payments(a).filter(c => c.date > from && c.date <= to && !a.paidEvents?.[c.key] && c.value != null);
  }
  return { price, payments, settleProduct, settleAll, futurePayments, today };
})();

if (typeof module !== 'undefined') module.exports = Bonds;
