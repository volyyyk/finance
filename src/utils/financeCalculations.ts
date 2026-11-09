import { 
  Product, 
  Asset, 
  FinancialStats, 
  FinancialEvent, 
  CashbackBank, 
  CashbackMonthData,
  CashbackDictionary,
  DictionaryItem,
  Frequency
} from '../types/finance';

export const Utils = {
  uid(): string {
    return Math.random().toString(36).slice(2, 10);
  },

  parseDate(s?: string | null): Date | null {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return isNaN(dt.getTime()) ? null : dt;
  },

  dateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  monthKey(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  fmtMoney(n: number): string {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0,
    }).format(Math.round(n || 0));
  },

  fmtPct(n: number): string {
    return (n >= 0 ? '+' : '') + (n || 0).toFixed(1) + '%';
  },

  fmtDate(d?: string | Date | null): string {
    if (!d) return '—';
    const dt = typeof d === 'string' ? Utils.parseDate(d) : d;
    if (!dt) return '—';
    return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },

  clamp(num: number, min: number, max: number): number {
    return Math.min(Math.max(num, min), max);
  }
};

export const AssetHelper = {
  price(asset: Asset): number {
    if (asset.kind === 'bond') {
      const faceValue = asset.nominal || 1000;
      // Bond prices are typically in % of nominal on MOEX
      const p = asset.lastPrice > 0 ? asset.lastPrice : (asset.avgPrice > 0 ? asset.avgPrice : faceValue);
      return (p / 100) * faceValue;
    }
    return asset.lastPrice > 0 ? asset.lastPrice : (asset.avgPrice || 0);
  },

  portfolioValue(product: Product): number {
    let sum = product.amount || 0; // Uninvested cash balance
    if (product.assets && Array.isArray(product.assets)) {
      for (const a of product.assets) {
        if (!a.redeemed) {
          sum += (a.qty || 0) * AssetHelper.price(a);
        }
      }
    }
    return sum;
  },

  annualCouponForAsset(asset: Asset): number {
    if (asset.kind !== 'bond' || asset.redeemed) return 0;
    const nominal = asset.nominal || 1000;
    const qty = asset.qty || 0;
    if (asset.couponType === 'fixed') {
      const freq = asset.couponFreq || 2;
      const couponVal = asset.coupons?.[0]?.value || 0;
      return couponVal * freq * qty;
    }
    const spread = asset.spread || 0;
    const cbrRate = 18; // Benchmark CBR rate fallback
    return nominal * ((cbrRate + spread) / 100) * qty;
  }
};

export const Simulator = {
  simulateMonths(products: Product[], months: number, opts: { noEvents?: boolean } = {}) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const historyTimeline: { date: Date; label: string; totalAssets: number; totalDebts: number; netWorth: number }[] = [];

    // Calculate initial state
    let initialAssets = 0;
    let initialDebts = 0;

    for (const p of products) {
      if (p.offBudget || p.closed) continue;
      if (p.type === 'deposit') initialAssets += p.amount || 0;
      else if (p.type === 'investment') initialAssets += AssetHelper.portfolioValue(p);
      else if (p.type === 'debit_card') initialAssets += p.amount || 0;
      else if (p.type === 'apartment') initialAssets += p.amount || 0;
      else if (p.type === 'credit_card' || p.type === 'loan') initialDebts += p.amount || 0;
    }

    historyTimeline.push({
      date: new Date(today),
      label: 'Сейчас',
      totalAssets: initialAssets,
      totalDebts: initialDebts,
      netWorth: initialAssets - initialDebts,
    });

    let currentAssets = initialAssets;
    let currentDebts = initialDebts;

    // Monthly step projection
    for (let m = 1; m <= months; m++) {
      const simDate = new Date(today.getFullYear(), today.getMonth() + m, 1);
      
      let monthlyIncomeGenerated = 0;
      let monthlyExpenseDeducted = 0;

      for (const p of products) {
        if (p.closed) continue;
        const rate = (p.rate || 0) / 100;

        if (p.type === 'deposit') {
          // monthly interest compounding
          const gain = (p.amount || 0) * (rate / 12);
          monthlyIncomeGenerated += gain;
          if (!p.offBudget) currentAssets += gain;
        } else if (p.type === 'investment') {
          const pVal = AssetHelper.portfolioValue(p);
          const annualReturn = rate * pVal;
          const couponIncome = (p.assets || []).reduce((acc, a) => acc + AssetHelper.annualCouponForAsset(a), 0);
          const monthlyYield = (annualReturn + couponIncome) / 12;
          monthlyIncomeGenerated += monthlyYield;
          if (!p.offBudget) currentAssets += monthlyYield;
        } else if (p.type === 'apartment') {
          const val = p.amount || 0;
          const appreciation = (val * rate) / 12;
          const rent = p.rented ? (p.rentPrice || 0) : 0;
          const upkeep = (val * (p.upkeepRate || 2) / 100) / 12;
          monthlyIncomeGenerated += appreciation + rent;
          monthlyExpenseDeducted += upkeep;
          if (!p.offBudget) currentAssets += appreciation;
        } else if (p.type === 'expense') {
          monthlyExpenseDeducted += p.amount || 0;
        } else if (p.type === 'loan') {
          // debt amortization
          const interestPortion = ((p.amount || 0) * rate) / 12;
          monthlyExpenseDeducted += interestPortion;
        }

        // Apply operations
        if (!opts.noEvents && p.operations) {
          for (const op of p.operations) {
            if (op.frequency === 'monthly') {
              if (op.direction === 'in') {
                if (!p.offBudget) currentAssets += op.amount;
              } else {
                if (!p.offBudget) currentAssets = Math.max(0, currentAssets - op.amount);
              }
            }
          }
        }
      }

      // Net impact on assets
      const netSavings = monthlyIncomeGenerated - monthlyExpenseDeducted;
      if (netSavings > 0) {
        currentAssets += netSavings * 0.4; // Conservative reinvestment proportion
      }

      // Debt payments slowly reduce debts
      if (currentDebts > 0) {
        const debtRepayment = Math.min(currentDebts, currentDebts * 0.02 + 5000);
        currentDebts = Math.max(0, currentDebts - debtRepayment);
      }

      const label = m <= 12 ? `${m} мес.` : `${(m / 12).toFixed(1)} г.`;

      historyTimeline.push({
        date: simDate,
        label,
        totalAssets: Math.round(currentAssets),
        totalDebts: Math.round(currentDebts),
        netWorth: Math.round(currentAssets - currentDebts),
      });
    }

    return historyTimeline;
  }
};

export const StatsCalculator = {
  calculate(products: Product[]): FinancialStats {
    let assets = 0;
    let debts = 0;
    let monthlyIncome = 0;
    let yearlyIncome = 0;
    let monthlyExpenses = 0;
    let yearlyExpenses = 0;

    for (const p of products) {
      const off = p.offBudget === true;
      const rate = (p.rate || 0) / 100;

      if (p.type === 'expense') {
        const amt = p.amount || 0;
        monthlyExpenses += amt;
        yearlyExpenses += amt * 12;
        continue;
      }

      if (p.type === 'apartment') {
        const v = p.amount || 0;
        if (!off) assets += v;
        const rentAnnual = p.rented ? (p.rentPrice || 0) * 12 : 0;
        const appreciationAnnual = v * rate;
        const upkeepAnnual = v * ((p.upkeepRate || 2) / 100);
        
        yearlyIncome += rentAnnual + appreciationAnnual;
        monthlyIncome += (rentAnnual + appreciationAnnual) / 12;
        yearlyExpenses += upkeepAnnual;
        monthlyExpenses += upkeepAnnual / 12;
        continue;
      }

      if (p.type === 'investment') {
        const v = AssetHelper.portfolioValue(p);
        if (!off) assets += v;
        const couponAnnual = (p.assets || []).reduce((acc, a) => acc + AssetHelper.annualCouponForAsset(a), 0);
        const stocksVal = (p.assets || []).filter(a => a.kind === 'stock').reduce((acc, a) => acc + (a.qty || 0) * AssetHelper.price(a), 0);
        const stockGrowth = stocksVal * rate;
        const annualInc = couponAnnual + stockGrowth;
        yearlyIncome += annualInc;
        monthlyIncome += annualInc / 12;
        continue;
      }

      if (p.type === 'deposit') {
        const v = p.amount || 0;
        if (!off) assets += v;
        const annualInc = v * rate;
        yearlyIncome += annualInc;
        monthlyIncome += annualInc / 12;
      } else if (p.type === 'debit_card') {
        const v = p.amount || 0;
        if (!off) assets += v;
        if (rate > 0) {
          const annualInc = v * rate;
          yearlyIncome += annualInc;
          monthlyIncome += annualInc / 12;
        }
      } else if (p.type === 'credit_card' || p.type === 'loan') {
        const v = p.amount || 0;
        if (!off) debts += v;
        if (p.type === 'loan') {
          const annualCost = v * rate;
          yearlyExpenses += annualCost;
          monthlyExpenses += annualCost / 12;
        }
      }

      // Check recurring operations (salary, subscriptions, etc.)
      if (p.operations) {
        for (const op of p.operations) {
          let factor = 0;
          if (op.frequency === 'monthly') factor = 12;
          else if (op.frequency === 'weekly') factor = 52;
          else if (op.frequency === 'yearly') factor = 1;

          if (factor > 0) {
            const annualAmt = op.amount * factor;
            if (op.direction === 'in') {
              yearlyIncome += annualAmt;
              monthlyIncome += annualAmt / 12;
            } else {
              yearlyExpenses += annualAmt;
              monthlyExpenses += annualAmt / 12;
            }
          }
        }
      }
    }

    const netWorth = assets - debts;
    const monthlySavings = monthlyIncome - monthlyExpenses;
    const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0;

    return {
      assets: Math.round(assets),
      debts: Math.round(debts),
      netWorth: Math.round(netWorth),
      monthlyIncome: Math.round(monthlyIncome),
      yearlyIncome: Math.round(yearlyIncome),
      monthlyExpenses: Math.round(monthlyExpenses),
      yearlyExpenses: Math.round(yearlyExpenses),
      monthlySavings: Math.round(monthlySavings),
      savingsRate: Number(savingsRate.toFixed(1)),
    };
  }
};

export const EventsManager = {
  extractEvents(products: Product[]): FinancialEvent[] {
    const list: FinancialEvent[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const p of products) {
      if (p.closed) continue;

      if (p.endDate) {
        const d = Utils.parseDate(p.endDate);
        if (d && d >= today) {
          list.push({
            date: d,
            dateKey: Utils.dateKey(d),
            product: p,
            icon: '🏁',
            title: `Окончание: ${p.name}`,
            direction: p.type === 'credit_card' || p.type === 'loan' ? 'out' : 'in',
            amount: p.type === 'investment' ? AssetHelper.portfolioValue(p) : p.amount,
            isMaturity: true,
          });
        }
      }

      if (p.type === 'credit_card' && p.gracePeriodEndDate) {
        const d = Utils.parseDate(p.gracePeriodEndDate);
        if (d && d >= today) {
          list.push({
            date: d,
            dateKey: Utils.dateKey(d),
            product: p,
            icon: '⏳',
            title: `Грейс-период: ${p.name}`,
            direction: 'out',
            amount: p.amount,
          });
        }
      }

      if (p.operations) {
        for (const op of p.operations) {
          const d = Utils.parseDate(op.date);
          if (d && d >= today) {
            list.push({
              date: d,
              dateKey: Utils.dateKey(d),
              product: p,
              icon: op.direction === 'in' ? '⬇️' : '⬆️',
              title: `${op.direction === 'in' ? 'Пополнение' : 'Списание'}: ${p.name}`,
              amount: op.amount,
              direction: op.direction,
            });
          }
        }
      }

      if (p.type === 'investment' && p.assets) {
        for (const a of p.assets) {
          if (a.kind === 'bond' && a.coupons) {
            for (const c of a.coupons) {
              const d = Utils.parseDate(c.date);
              if (d && d >= today) {
                list.push({
                  date: d,
                  dateKey: Utils.dateKey(d),
                  product: p,
                  icon: '🪙',
                  title: `Купон: ${a.shortname} (${a.qty} шт.)`,
                  amount: c.value * (a.qty || 1),
                  direction: 'in',
                });
              }
            }
          }
          if (a.kind === 'bond' && a.amortizations) {
            for (const am of a.amortizations) {
              const d = Utils.parseDate(am.date);
              if (d && d >= today) {
                list.push({
                  date: d,
                  dateKey: Utils.dateKey(d),
                  product: p,
                  icon: '💼',
                  title: `Амортизация: ${a.shortname}`,
                  amount: am.value * (a.qty || 1),
                  direction: 'in',
                });
              }
            }
          }
        }
      }
    }

    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }
};

/**
 * Cashback Domain Logic matching volyyyk/finance CbLogic specifications
 */
export const CbLogic = {
  level(value: number): 'low' | 'mid' | 'high' {
    const v = Number(value) || 0;
    if (v >= 5) return 'high';
    if (v >= 3) return 'mid';
    return 'low';
  },

  groupLevel(g: { top: { value: number } | null; subs: { value: number }[] }): 'low' | 'mid' | 'high' {
    const main = g && g.top ? Number(g.top.value) || 0 : (g && g.subs ? g.subs : []).reduce((m, e) => Math.max(m, Number(e.value) || 0), 0);
    return CbLogic.level(main);
  },

  entriesAll(banks: CashbackBank[]) {
    const out: { bankId: string; bankName: string; catId: string; catName: string; sub: string | null; value: number }[] = [];
    (banks || []).forEach(b => (b.cats || []).forEach(c => {
      out.push({
        bankId: b.id,
        bankName: b.name,
        catId: c.id,
        catName: c.name,
        sub: c.sub || null,
        value: Number(c.value) || 0,
      });
    }));
    return out;
  },

  groupByCategory(banks: CashbackBank[]) {
    const map = new Map<string, { name: string; noSub: any[]; withSub: any[] }>();
    const byValueDesc = (a: any, b: any) => (b.value - a.value) || String(a.bankName || '').localeCompare(String(b.bankName || ''), 'ru');

    CbLogic.entriesAll(banks).forEach(e => {
      const g = map.get(e.catName) || { name: e.catName, noSub: [], withSub: [] };
      if (e.sub) g.withSub.push(e); else g.noSub.push(e);
      map.set(e.catName, g);
    });

    const groups = [...map.values()].map(g => ({
      name: g.name,
      top: g.noSub.slice().sort(byValueDesc)[0] || null,
      subs: g.withSub.slice().sort(byValueDesc).slice(0, 3),
    }));

    const best = (g: any) => Math.max(0, ...(g.top ? [g.top] : []).concat(g.subs).map((e: any) => e.value));
    return groups.sort((a, b) => best(b) - best(a) || a.name.localeCompare(b.name, 'ru'));
  },

  allByBank(banks: CashbackBank[]) {
    const byValueDesc = (a: any, b: any) => (b.value - a.value) || String(a.catName || '').localeCompare(String(b.catName || ''), 'ru');
    return (banks || [])
      .map(b => ({
        bankId: b.id,
        bankName: b.name,
        entries: (b.cats || []).map(c => ({ catId: c.id, catName: c.name, sub: c.sub || null, value: Number(c.value) || 0 }))
          .sort(byValueDesc),
      }))
      .filter(g => g.entries.length)
      .sort((a, b) => a.bankName.localeCompare(b.bankName, 'ru'));
  },

  allByCategory(banks: CashbackBank[]) {
    const byValueDesc = (a: any, b: any) => (b.value - a.value) || String(a.bankName || '').localeCompare(String(b.bankName || ''), 'ru');
    const map = new Map<string, { name: string; entries: any[] }>();

    CbLogic.entriesAll(banks).forEach(e => {
      const g = map.get(e.catName) || { name: e.catName, entries: [] };
      g.entries.push(e);
      map.set(e.catName, g);
    });

    return [...map.values()]
      .map(g => ({ name: g.name, entries: g.entries.slice().sort(byValueDesc) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  },

  dictAdd(dict: CashbackDictionary, kind: 'bank' | 'cat', name: string): CashbackDictionary {
    const n = String(name || '').trim();
    if (!n) return dict;
    const isBank = kind === 'bank';
    const list = isBank ? [...dict.banks] : [...dict.cats];
    if (!list.some(x => x.name.toLowerCase() === n.toLowerCase())) {
      list.push({ id: Utils.uid(), name: n });
    }
    return isBank ? { ...dict, banks: list } : { ...dict, cats: list };
  },

  dictRemove(dict: CashbackDictionary, kind: 'bank' | 'cat', id: string): CashbackDictionary {
    if (kind === 'bank') {
      return { ...dict, banks: dict.banks.filter(x => x.id !== id) };
    }
    return { ...dict, cats: dict.cats.filter(x => x.id !== id) };
  }
};
