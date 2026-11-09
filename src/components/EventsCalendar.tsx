import React, { useState, useMemo } from 'react';
import { Product, FinancialEvent } from '../types/finance';
import { EventsManager, Utils } from '../utils/financeCalculations';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

interface EventsCalendarProps {
  products: Product[];
  onSelectProduct?: (product: Product) => void;
}

export const EventsCalendar: React.FC<EventsCalendarProps> = ({ products, onSelectProduct }) => {
  const [calMonthOffset, setCalMonthOffset] = useState<number>(0);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [eventPage, setEventPage] = useState<number>(0);

  const PAGE_SIZE = 5;

  // JS-Optimizations: memoize events extraction
  const allEvents = useMemo(() => {
    return EventsManager.extractEvents(products);
  }, [products]);

  // Calendar dates generation
  const activeDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + calMonthOffset);
    return d;
  }, [calMonthOffset]);

  const year = activeDate.getFullYear();
  const month = activeDate.getMonth();

  const monthName = activeDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  // Map events by dateKey
  const eventsByDate = useMemo(() => {
    const map = new Map<string, FinancialEvent[]>();
    allEvents.forEach(e => {
      const list = map.get(e.dateKey) || [];
      list.push(e);
      map.set(e.dateKey, list);
    });
    return map;
  }, [allEvents]);

  // Calendar days
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Russian week: Monday is 0, Sunday is 6
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days: { date: Date; dateKey: string; isCurrentMonth: boolean; hasEvents: boolean }[] = [];

    // Leading days from previous month
    for (let i = startDayOfWeek; i > 0; i--) {
      const prevDate = new Date(year, month, 1 - i);
      const k = Utils.dateKey(prevDate);
      days.push({ date: prevDate, dateKey: k, isCurrentMonth: false, hasEvents: eventsByDate.has(k) });
    }

    // Days of current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const curDate = new Date(year, month, d);
      const k = Utils.dateKey(curDate);
      days.push({ date: curDate, dateKey: k, isCurrentMonth: true, hasEvents: eventsByDate.has(k) });
    }

    return days;
  }, [year, month, eventsByDate]);

  // Paginated events
  const paginatedEvents = useMemo(() => {
    const start = eventPage * PAGE_SIZE;
    return allEvents.slice(start, start + PAGE_SIZE);
  }, [allEvents, eventPage]);

  const totalPages = Math.ceil(allEvents.length / PAGE_SIZE) || 1;

  // Selected date events
  const selectedDateEvents = selectedDateKey ? eventsByDate.get(selectedDateKey) || [] : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      
      {/* 1. Upcoming Events List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-colors flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-500" />
              Ближайшие события ({allEvents.length})
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Купоны, платежи, сроки
            </span>
          </div>

          {allEvents.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Нет запланированных событий на ближайшее время
            </div>
          ) : (
            <div className="space-y-2">
              {paginatedEvents.map((e, idx) => (
                <div
                  key={`${e.dateKey}-${idx}`}
                  onClick={() => e.product && onSelectProduct?.(e.product)}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer transition-colors flex items-center justify-between text-xs sm:text-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="text-base shrink-0">{e.icon}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {e.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {Utils.fmtDate(e.date)}
                      </div>
                    </div>
                  </div>

                  <span className={`font-bold tabular-nums shrink-0 ${
                    e.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {e.direction === 'in' ? '+' : '-'}{Utils.fmtMoney(e.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500">
              Страница {eventPage + 1} из {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={eventPage === 0}
                onClick={() => setEventPage(p => Math.max(0, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={eventPage >= totalPages - 1}
                onClick={() => setEventPage(p => Math.min(totalPages - 1, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Interactive Calendar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-colors">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 capitalize">
            {monthName}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCalMonthOffset(o => o - 1)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCalMonthOffset(0)}
              className="px-2 py-1 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              Сегодня
            </button>
            <button
              type="button"
              onClick={() => setCalMonthOffset(o => o + 1)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Days of week */}
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400 mb-1">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((cd, idx) => {
            const isSelected = selectedDateKey === cd.dateKey;
            const isToday = cd.dateKey === Utils.dateKey(new Date());

            return (
              <button
                key={`${cd.dateKey}-${idx}`}
                type="button"
                onClick={() => setSelectedDateKey(isSelected ? null : cd.dateKey)}
                className={`h-9 rounded-lg flex flex-col items-center justify-center text-xs transition-colors relative ${
                  !cd.isCurrentMonth
                    ? 'text-slate-300 dark:text-slate-600'
                    : isSelected
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold'
                    : isToday
                    ? 'border border-emerald-500 font-bold text-slate-900 dark:text-slate-100'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span>{cd.date.getDate()}</span>
                {cd.hasEvents && (
                  <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                    isSelected ? 'bg-amber-400' : 'bg-emerald-500'
                  }`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Details for selected date */}
        {selectedDateKey && (
          <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs">
            <div className="font-bold text-slate-800 dark:text-slate-200 mb-1">
              События {selectedDateKey}:
            </div>
            {selectedDateEvents.length === 0 ? (
              <span className="text-slate-500">На этот день событий нет</span>
            ) : (
              <div className="space-y-1">
                {selectedDateEvents.map((ev, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="truncate pr-2">{ev.icon} {ev.title}</span>
                    <span className="font-semibold tabular-nums shrink-0">{Utils.fmtMoney(ev.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
};
