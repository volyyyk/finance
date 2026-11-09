import { Product, Goal, CashbackMonthData, CashbackDictionary } from '../types/finance';
import { Utils } from './financeCalculations';

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'demo-deposit',
    type: 'deposit',
    name: 'Вклад «Накопительный»',
    amount: 300000,
    rate: 16.5,
    startDate: daysFromNow(-180),
    endDate: daysFromNow(180),
    comment: 'Сбербанк (высокая ставка, ежемесячная капитализация)',
    operations: [
      { id: Utils.uid(), direction: 'in', amount: 15000, frequency: 'monthly', date: daysFromNow(5), endDate: daysFromNow(180) }
    ],
    endActions: [
      { type: 'transfer', targetId: 'demo-invest' }
    ]
  },
  {
    id: 'demo-invest',
    type: 'investment',
    name: 'Портфель: акции, облигации, фонды и металлы',
    amount: 35000,
    rate: 14,
    startDate: daysFromNow(-365),
    endDate: null,
    comment: 'Брокерский счёт Т-Инвестиции',
    operations: [],
    endActions: [],
    assets: [
      {
        id: Utils.uid(),
        secid: 'SBER',
        shortname: 'Сбербанк АО',
        kind: 'stock',
        board: 'TQBR',
        qty: 120,
        avgPrice: 280,
        lastPrice: 308.5
      },
      {
        id: Utils.uid(),
        secid: 'GAZP',
        shortname: 'Газпром',
        kind: 'stock',
        board: 'TQBR',
        qty: 250,
        avgPrice: 135,
        lastPrice: 142.2
      },
      {
        id: Utils.uid(),
        secid: 'SU26238RMFS4',
        shortname: 'ОФЗ 26238',
        kind: 'bond',
        board: 'TQOB',
        qty: 60,
        avgPrice: 720,
        lastPrice: 745,
        couponType: 'fixed',
        nominal: 1000,
        couponFreq: 2,
        maturityDate: daysFromNow(720),
        coupons: [
          { date: daysFromNow(30), value: 35.4 },
          { date: daysFromNow(210), value: 35.4 }
        ]
      },
      {
        id: Utils.uid(),
        secid: 'RU000A105SD4',
        shortname: 'Селектел 001R-02',
        kind: 'bond',
        board: 'TQCB',
        qty: 40,
        avgPrice: 990,
        lastPrice: 1005,
        couponType: 'fixed',
        nominal: 1000,
        couponFreq: 4,
        maturityDate: daysFromNow(200),
        coupons: [
          { date: daysFromNow(20), value: 29.5 },
          { date: daysFromNow(110), value: 29.5 },
          { date: daysFromNow(200), value: 29.5 }
        ],
        amortizations: [
          { date: daysFromNow(110), value: 300 },
          { date: daysFromNow(200), value: 700 }
        ]
      },
      {
        id: Utils.uid(),
        secid: 'TGLD',
        shortname: 'Т-Золото ETF',
        kind: 'fund',
        board: 'TQTF',
        qty: 180,
        avgPrice: 8.4,
        lastPrice: 9.8,
        sixMonthPct: 16.4
      },
      {
        id: Utils.uid(),
        secid: 'GLDRUB_TOM',
        shortname: 'Золото (грамм)',
        kind: 'metal',
        qty: 20,
        avgPrice: 6800,
        lastPrice: 7850,
        unit: 'gram'
      },
      {
        id: Utils.uid(),
        secid: 'SLVRUB_TOM',
        shortname: 'Серебро (грамм)',
        kind: 'metal',
        qty: 500,
        avgPrice: 85,
        lastPrice: 96.5,
        unit: 'gram'
      }
    ]
  },
  {
    id: 'demo-debit',
    type: 'debit_card',
    name: 'Карта Black (Т-Банк)',
    amount: 85000,
    rate: 8,
    startDate: daysFromNow(-90),
    endDate: null,
    comment: 'Зарплатная карта и ежедневные траты',
    operations: [
      { id: Utils.uid(), direction: 'in', amount: 120000, frequency: 'monthly', date: daysFromNow(10), endDate: null },
      { id: Utils.uid(), direction: 'out', amount: 35000, frequency: 'monthly', date: daysFromNow(15), endDate: null }
    ]
  },
  {
    id: 'demo-credit',
    type: 'credit_card',
    name: 'Кредитная карта All Airlines',
    amount: 45000,
    rate: 29.9,
    startDate: daysFromNow(-90),
    endDate: null,
    comment: 'Беспроцентный период 55 дней',
    limit: 150000,
    gracePeriodEndDate: daysFromNow(28),
    operations: []
  },
  {
    id: 'demo-loan',
    type: 'loan',
    name: 'Автокредит на Geely',
    amount: 420000,
    rate: 13.5,
    startDate: daysFromNow(-365),
    endDate: daysFromNow(750),
    comment: 'Платёж 18 500 ₽ в месяц',
    operations: [
      { id: Utils.uid(), direction: 'in', amount: 18500, frequency: 'monthly', date: daysFromNow(5), endDate: daysFromNow(750) }
    ]
  },
  {
    id: 'demo-apartment',
    type: 'apartment',
    name: 'Квартира (2-комнатная, Москва)',
    amount: 14500000,
    rate: 7.5,
    rented: true,
    rentPrice: 65000,
    upkeepRate: 1.5,
    startDate: daysFromNow(-730),
    endDate: null,
    comment: 'Сдаётся в аренду + капитализация стоимости'
  },
  {
    id: 'demo-expense',
    type: 'expense',
    name: 'Коммунальные платежи и интернет',
    amount: 8500,
    rate: 0,
    startDate: daysFromNow(-365),
    endDate: null,
    comment: 'Фиксированный ежемесячный расход'
  }
];

export const INITIAL_GOAL: Goal = {
  name: 'Капитал 10 000 000 ₽',
  amount: 10000000
};

export const INITIAL_CASHBACK_DATA: CashbackMonthData = {
  month: Utils.monthKey(),
  banks: [
    {
      id: 'b-tinkoff',
      name: 'Т-Банк (Тинькофф)',
      cats: [
        { id: Utils.uid(), name: 'Супермаркеты', sub: null, value: 5 },
        { id: Utils.uid(), name: 'Такси', sub: 'Яндекс Go', value: 7 },
        { id: Utils.uid(), name: 'Рестораны и фастфуд', sub: null, value: 5 },
        { id: Utils.uid(), name: 'Аптеки', sub: 'Еаптека', value: 10 },
        { id: Utils.uid(), name: 'Топливо', sub: 'Т-Заправки', value: 7 },
        { id: Utils.uid(), name: 'Книги и искусство', sub: null, value: 3 }
      ]
    },
    {
      id: 'b-sber',
      name: 'Сбербанк (СберСпасибо)',
      cats: [
        { id: Utils.uid(), name: 'Кафе и рестораны', sub: null, value: 5 },
        { id: Utils.uid(), name: 'Одежда и обувь', sub: null, value: 3 },
        { id: Utils.uid(), name: 'Транспорт', sub: 'Метро и автобусы', value: 10 },
        { id: Utils.uid(), name: 'Зоотовары', sub: 'Четыре лапы', value: 5 },
        { id: Utils.uid(), name: 'Красота и косметика', sub: 'Золотое Яблоко', value: 7 }
      ]
    },
    {
      id: 'b-alfa',
      name: 'Альфа-Банк',
      cats: [
        { id: Utils.uid(), name: 'Супермаркеты', sub: 'Магнит / Пятерочка', value: 5 },
        { id: Utils.uid(), name: 'Техника и электроника', sub: 'DNS / М.Видео', value: 5 },
        { id: Utils.uid(), name: 'АЗС и топливо', sub: null, value: 5 },
        { id: Utils.uid(), name: 'Развлечения и кино', sub: null, value: 10 },
        { id: Utils.uid(), name: 'Спорттовары', sub: 'Спортмастер', value: 5 }
      ]
    },
    {
      id: 'b-vtb',
      name: 'ВТБ',
      cats: [
        { id: Utils.uid(), name: 'Аптеки', sub: null, value: 4 },
        { id: Utils.uid(), name: 'Дом и ремонт', sub: 'Леруа Мерлен', value: 6 },
        { id: Utils.uid(), name: 'Цветы', sub: null, value: 15 }
      ]
    },
    {
      id: 'b-yandex',
      name: 'Яндекс Пэй',
      cats: [
        { id: Utils.uid(), name: 'Яндекс Маркет', sub: 'Плюс', value: 12 },
        { id: Utils.uid(), name: 'Яндекс Лавка', sub: 'Доставка', value: 10 },
        { id: Utils.uid(), name: 'Яндекс Заправки', sub: null, value: 5 }
      ]
    }
  ]
};

export const INITIAL_CASHBACK_DICT: CashbackDictionary = {
  banks: [
    { id: 'dict-b1', name: 'Т-Банк (Тинькофф)' },
    { id: 'dict-b2', name: 'Сбербанк' },
    { id: 'dict-b3', name: 'Альфа-Банк' },
    { id: 'dict-b4', name: 'ВТБ' },
    { id: 'dict-b5', name: 'Яндекс Пэй' },
    { id: 'dict-b6', name: 'Райффайзен Банк' },
    { id: 'dict-b7', name: 'Газпромбанк' },
    { id: 'dict-b8', name: 'Совкомбанк (Халва)' },
    { id: 'dict-b9', name: 'Озон Банк' },
    { id: 'dict-b10', name: 'МТС Банк' }
  ],
  cats: [
    { id: 'dict-c1', name: 'Супермаркеты' },
    { id: 'dict-c2', name: 'Кафе и рестораны' },
    { id: 'dict-c3', name: 'Такси и каршеринг' },
    { id: 'dict-c4', name: 'АЗС и топливо' },
    { id: 'dict-c5', name: 'Аптеки и оптика' },
    { id: 'dict-c6', name: 'Одежда и обувь' },
    { id: 'dict-c7', name: 'Дом и ремонт' },
    { id: 'dict-c8', name: 'Электроника и техника' },
    { id: 'dict-c9', name: 'Развлечения и кино' },
    { id: 'dict-c10', name: 'Зоотовары' },
    { id: 'dict-c11', name: 'Красота и косметика' },
    { id: 'dict-c12', name: 'Спорттовары' },
    { id: 'dict-c13', name: 'Путешествия и отели' },
    { id: 'dict-c14', name: 'Книги' },
    { id: 'dict-c15', name: 'Цветы и подарки' }
  ]
};
