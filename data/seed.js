(function(){
  function daysFromNow(n){
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0,10);
  }
  function uid(){ return Math.random().toString(36).slice(2,10); }

  window.SEED_DATA = [
    {
      id: 'demo-deposit',
      type: 'deposit',
      name: 'Вклад «Накопительный»',
      amount: 300000,
      rate: 12,
      startDate: daysFromNow(-180),
      endDate: daysFromNow(180),
      comment: 'Сбербанк',
      operations: [
        { id: uid(), direction: 'in', amount: 10000, frequency: 'monthly',
          date: daysFromNow(5), endDate: daysFromNow(180) }
      ],
      endActions: [
        { type: 'change', newRate: 10, newEndDate: daysFromNow(365) },
        { type: 'transfer', targetId: 'demo-invest' }
      ]
    },
    {
      id: 'demo-invest',
      type: 'investment',
      name: 'Портфель: акции, облигации, фонды и металлы',
      amount: 20000,
      rate: 7,
      startDate: daysFromNow(-365),
      endDate: null,
      comment: 'Брокерский счёт',
      operations: [],
      endActions: [],
      assets: [
        { id: uid(), secid: 'SBER', shortname: 'Сбербанк',
          kind: 'stock', board: 'TQBR', qty: 100, avgPrice: 280, lastPrice: 300 },
        { id: uid(), secid: 'GAZP', shortname: 'Газпром',
          kind: 'stock', board: 'TQBR', qty: 200, avgPrice: 130, lastPrice: 142 },
        { id: uid(), secid: 'SU26238RMFS4', shortname: 'ОФЗ 26238',
          kind: 'bond', board: 'TQOB', qty: 50, avgPrice: 950, lastPrice: 970,
          couponType: 'floater', spread: 1.5, nominal: 1000, couponFreq: 2,
          coupons: [
            { date: daysFromNow(30), value: 45 },
            { date: daysFromNow(210), value: 45 }
          ] },
        { id: uid(), secid: 'RU000A105SD4', shortname: 'Корпоративная облигация',
          kind: 'bond', board: 'TQCB', qty: 30, avgPrice: 990, lastPrice: 1002,
          couponType: 'fixed', nominal: 1000, couponFreq: 4,
          coupons: [
            { date: daysFromNow(20), value: 28 },
            { date: daysFromNow(110), value: 28 },
            { date: daysFromNow(200), value: 28 }
          ],
          amortizations: [
            { date: daysFromNow(110), value: 300 },
            { date: daysFromNow(200), value: 700 }
          ] },
        { id: uid(), secid: 'TGLD', shortname: 'Тинькофф iHolding (золото)',
          kind: 'fund', board: 'TQTF', qty: 120, avgPrice: 8.4, lastPrice: 9.1,
          sixMonthPct: 8.3 },
        { id: uid(), secid: 'SBMX', shortname: 'Сбер MOEX',
          kind: 'fund', board: 'TQTF', qty: 80, avgPrice: 19.2, lastPrice: 20.5,
          sixMonthPct: -2.4 },
        { id: uid(), secid: 'GLDRUB_TOM', shortname: 'Золото (грамм)',
          kind: 'metal', board: '', qty: 15.5, avgPrice: 7200, lastPrice: 7450,
          unit: 'gram', ouncePrice: 231820, sixMonthPct: 3.5 },
        { id: uid(), secid: 'SLVRUB_TOM', shortname: 'Серебро (грамм)',
          kind: 'metal', board: '', qty: 400, avgPrice: 86, lastPrice: 92,
          unit: 'gram', ouncePrice: 2861, sixMonthPct: 5.1 }
      ]
    },
    {
      id: 'demo-debit',
      type: 'debit_card',
      name: 'Дебетовая карта',
      amount: 50000,
      rate: 5,
      startDate: daysFromNow(-90),
      endDate: null,
      comment: 'Проценты на остаток',
      operations: [
        { id: uid(), direction: 'in', amount: 30000, frequency: 'monthly',
          date: daysFromNow(10), endDate: null },
        { id: uid(), direction: 'in', amount: 5000, frequency: 'weekly',
          date: daysFromNow(3), endDate: daysFromNow(180) },
        { id: uid(), direction: 'out', amount: 12000, frequency: 'monthly',
          date: daysFromNow(15), endDate: null },
        { id: uid(), direction: 'in', amount: 15000, frequency: 'once',
          date: daysFromNow(25), endDate: null }
      ],
      endActions: []
    },
    {
      id: 'demo-credit',
      type: 'credit_card',
      name: 'Кредитная карта',
      amount: 80000,
      rate: 29.9,
      startDate: daysFromNow(-90),
      endDate: null,
      comment: 'Тинькофф',
      limit: 150000,
      gracePeriodEndDate: daysFromNow(45),
      operations: [
        { id: uid(), direction: 'in', amount: 8000, frequency: 'monthly',
          date: daysFromNow(10), endDate: null }
      ],
      endActions: []
    },
    {
      id: 'demo-loan',
      type: 'loan',
      name: 'Автокредит',
      amount: 450000,
      rate: 15,
      startDate: daysFromNow(-365),
      endDate: daysFromNow(900),
      comment: '',
      operations: [
        { id: uid(), direction: 'in', amount: 15000, frequency: 'monthly',
          date: daysFromNow(5), endDate: daysFromNow(900) }
      ],
      endActions: [
        { type: 'close' }
      ]
    },
    {
      id: 'demo-expense',
      type: 'expense',
      name: 'Аренда квартиры',
      amount: 45000,
      rate: 0,
      startDate: daysFromNow(-365),
      endDate: null,
      comment: 'Постоянный платёж',
      operations: [],
      endActions: []
    }
  ];

  // Демо-цель: применится при первом запуске или сбросе к seed,
  // если своей цели ещё нет.
  window.SEED_GOAL = { amount: 1000000 };
})();
