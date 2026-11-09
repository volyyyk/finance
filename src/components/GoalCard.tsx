import React, { useState } from 'react';
import { Target, TrendingUp, Edit2, Check, X } from 'lucide-react';
import { Goal, FinancialStats } from '../types/finance';
import { Utils } from '../utils/financeCalculations';

interface GoalCardProps {
  goal: Goal;
  onSaveGoal: (goal: Goal) => void;
  stats: FinancialStats;
}

export const GoalCard: React.FC<GoalCardProps> = ({ goal, onSaveGoal, stats }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [goalName, setGoalName] = useState(goal.name);
  const [goalAmount, setGoalAmount] = useState(goal.amount);

  const capital = Math.max(0, stats.netWorth);
  const pct = goal.amount > 0 ? Math.min(100, Math.round((capital / goal.amount) * 100)) : 0;
  
  // Calculate remaining months based on savings
  const remaining = Math.max(0, goal.amount - capital);
  const monthsRemaining = stats.monthlySavings > 0 ? Math.ceil(remaining / stats.monthlySavings) : null;

  const handleSave = () => {
    if (!goalName.trim() || goalAmount <= 0) return;
    onSaveGoal({ name: goalName.trim(), amount: goalAmount });
    setIsEditing(false);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-xs transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <Target className="w-4 h-4" />
          </div>
          <div>
            {isEditing ? (
              <input
                type="text"
                value={goalName}
                onChange={e => setGoalName(e.target.value)}
                className="px-2 py-0.5 text-sm font-bold border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            ) : (
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                {goal.name}
              </h2>
            )}
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Цель накоплений и финансового плана
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={goalAmount}
                onChange={e => setGoalAmount(Number(e.target.value))}
                className="w-32 px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
              />
              <button
                type="button"
                onClick={handleSave}
                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="p-1 text-slate-400 hover:bg-slate-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                {Utils.fmtMoney(goal.amount)}
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Изменить цель"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
          <div
            className="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all duration-500 shadow-xs"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
          <span>
            Капитал: <strong className="text-slate-800 dark:text-slate-200 tabular-nums">{Utils.fmtMoney(capital)}</strong> ({pct}%)
          </span>
          {monthsRemaining !== null && monthsRemaining > 0 ? (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" />
              При темпе {Utils.fmtMoney(stats.monthlySavings)}/мес срок: ~{monthsRemaining} мес. ({Math.ceil(monthsRemaining / 12)} г.)
            </span>
          ) : (
            <span>{pct >= 100 ? '🎉 Цель достигнута!' : 'Укажите доход/расход для расчёта срока'}</span>
          )}
        </div>
      </div>
    </div>
  );
};
