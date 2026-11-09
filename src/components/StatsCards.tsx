import React from 'react';
import { FinancialStats } from '../types/finance';
import { Utils } from '../utils/financeCalculations';
import { ShieldCheck, TrendingUp, TrendingDown, Wallet, CreditCard } from 'lucide-react';

interface StatsCardsProps {
  stats: FinancialStats;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      
      {/* 1. Net Capital */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
          <span>Чистый капитал</span>
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
        </div>
        <div className="text-lg sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
          {Utils.fmtMoney(stats.netWorth)}
        </div>
        <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
          Активы минус долги
        </div>
      </div>

      {/* 2. Total Assets */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
          <span>Все активы</span>
          <Wallet className="w-4 h-4 text-blue-500" />
        </div>
        <div className="text-lg sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
          {Utils.fmtMoney(stats.assets)}
        </div>
        <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
          Вклады, акции, квартира, карты
        </div>
      </div>

      {/* 3. Total Debts */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
          <span>Общий долг</span>
          <CreditCard className="w-4 h-4 text-rose-500" />
        </div>
        <div className="text-lg sm:text-2xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">
          {Utils.fmtMoney(stats.debts)}
        </div>
        <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">
          Кредиты и кредитные карты
        </div>
      </div>

      {/* 4. Monthly Savings & Income */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
          <span>Дельта в месяц</span>
          {stats.monthlySavings >= 0 ? (
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          ) : (
            <TrendingDown className="w-4 h-4 text-rose-500" />
          )}
        </div>
        <div className={`text-lg sm:text-2xl font-extrabold tabular-nums ${
          stats.monthlySavings >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
        }`}>
          {Utils.fmtMoney(stats.monthlySavings)}
        </div>
        <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
          <span>Норма сбережений:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{stats.savingsRate}%</span>
        </div>
      </div>

    </div>
  );
};
