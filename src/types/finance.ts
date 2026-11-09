export type ProductType = 
  | 'deposit' 
  | 'debit_card' 
  | 'credit_card' 
  | 'loan' 
  | 'investment' 
  | 'apartment' 
  | 'expense'
  | 'income';

export type Frequency = 'once' | 'weekly' | 'monthly' | 'yearly';

export interface Operation {
  id: string;
  direction: 'in' | 'out';
  amount: number;
  frequency: Frequency;
  date: string; // YYYY-MM-DD
  endDate?: string | null;
  debtTargetId?: string | null;
}

export interface EndAction {
  type: 'close' | 'transfer' | 'change';
  targetId?: string;
  newRate?: number;
  newEndDate?: string;
}

export type AssetKind = 'stock' | 'bond' | 'fund' | 'metal';

export interface AssetCoupon {
  date: string;
  value: number;
}

export interface AssetAmortization {
  date: string;
  value: number;
}

export interface Asset {
  id: string;
  secid: string;
  shortname: string;
  kind: AssetKind;
  board?: string;
  qty: number;
  avgPrice: number;
  lastPrice: number;
  sixMonthPct?: number;
  couponType?: 'fixed' | 'floater';
  spread?: number;
  nominal?: number;
  couponFreq?: number;
  maturityDate?: string | null;
  coupons?: AssetCoupon[];
  amortizations?: AssetAmortization[];
  unit?: string;
  ouncePrice?: number;
  redeemed?: boolean;
}

export interface Product {
  id: string;
  type: ProductType;
  name: string;
  amount: number;
  rate?: number;
  startDate?: string;
  endDate?: string | null;
  comment?: string;
  operations?: Operation[];
  endActions?: EndAction[];
  assets?: Asset[];
  limit?: number;
  gracePeriodEndDate?: string | null;
  rented?: boolean;
  rentPrice?: number;
  upkeepRate?: number;
  offBudget?: boolean;
  closed?: boolean;
}

export interface Goal {
  name: string;
  amount: number;
}

export interface CashbackCategory {
  id: string;
  name: string;
  sub: string | null;
  value: number;
}

export interface CashbackBank {
  id: string;
  name: string;
  cats: CashbackCategory[];
}

export interface CashbackMonthData {
  month: string; // YYYY-MM
  banks: CashbackBank[];
}

export interface DictionaryItem {
  id: string;
  name: string;
}

export interface CashbackDictionary {
  banks: DictionaryItem[];
  cats: DictionaryItem[];
}

export interface FinancialStats {
  assets: number;
  debts: number;
  netWorth: number;
  monthlyIncome: number;
  yearlyIncome: number;
  monthlyExpenses: number;
  yearlyExpenses: number;
  monthlySavings: number;
  savingsRate: number;
}

export interface FinancialEvent {
  date: Date;
  dateKey: string;
  product?: Product;
  icon: string;
  title: string;
  amount: number;
  direction: 'in' | 'out';
  isMaturity?: boolean;
}

export interface SnapshotItem {
  id: string;
  date: string;
  netWorth: number;
  assets: number;
  debts: number;
  note?: string;
}
