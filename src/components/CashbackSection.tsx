import React, { useState, useMemo } from 'react';
import { 
  PlusCircle, 
  Settings2, 
  Layers, 
  ChevronDown, 
  ChevronUp, 
  Trash2, 
  Sparkles, 
  Search, 
  Building2, 
  Tag, 
  CheckCircle2, 
  ArrowUpDown,
  Percent,
  SlidersHorizontal
} from 'lucide-react';
import { CashbackMonthData, CashbackDictionary, CashbackBank, CashbackCategory } from '../types/finance';
import { CbLogic, Utils } from '../utils/financeCalculations';
import confetti from 'canvas-confetti';

interface CashbackSectionProps {
  cashbackData: CashbackMonthData;
  setCashbackData: (data: CashbackMonthData) => void;
  cbDict: CashbackDictionary;
  setCbDict: (dict: CashbackDictionary) => void;
}

export const CashbackSection: React.FC<CashbackSectionProps> = ({
  cashbackData,
  setCashbackData,
  cbDict,
  setCbDict
}) => {
  // Collapsible lists state: user requested 3 collapsible lists at the bottom
  const [openAdd, setOpenAdd] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [openAll, setOpenAll] = useState(false);

  // Form state for "Добавить новое"
  const [selectedBankName, setSelectedBankName] = useState('');
  const [selectedCatName, setSelectedCatName] = useState('');
  const [cbValue, setCbValue] = useState<number | ''>(5);
  const [hasSubcategory, setHasSubcategory] = useState(false);
  const [subText, setSubText] = useState('');
  const [addSuccessMsg, setAddSuccessMsg] = useState('');

  // Settings / Dictionary state
  const [newDictBank, setNewDictBank] = useState('');
  const [newDictCat, setNewDictCat] = useState('');

  // "Показать все кешбеки" controls
  const [allSortMode, setAllSortMode] = useState<'bank' | 'cat'>('bank');
  const [searchFilter, setSearchFilter] = useState('');
  const [minPercentFilter, setMinPercentFilter] = useState<number>(0);

  // JS-Optimizations: memoized grouped data
  const groupedCategories = useMemo(() => {
    return CbLogic.groupByCategory(cashbackData.banks);
  }, [cashbackData.banks]);

  const allEntriesList = useMemo(() => {
    return CbLogic.entriesAll(cashbackData.banks);
  }, [cashbackData.banks]);

  const top3Categories = useMemo(() => {
    return groupedCategories.slice(0, 3);
  }, [groupedCategories]);

  // Memoized stats
  const stats = useMemo(() => {
    const totalEntries = allEntriesList.length;
    const maxVal = allEntriesList.reduce((max, e) => Math.max(max, e.value), 0);
    const avgVal = totalEntries > 0 
      ? (allEntriesList.reduce((acc, e) => acc + e.value, 0) / totalEntries).toFixed(1)
      : '0';
    return {
      banksCount: cashbackData.banks.length,
      totalEntries,
      maxVal,
      avgVal
    };
  }, [allEntriesList, cashbackData.banks.length]);

  // Add new cashback handler
  const handleAddCashback = (e: React.FormEvent) => {
    e.preventDefault();
    const bankNameTrim = selectedBankName.trim();
    const catNameTrim = selectedCatName.trim();
    const valNum = Number(cbValue);

    if (!bankNameTrim) {
      alert('Пожалуйста, выберите или укажите название банка');
      return;
    }
    if (!catNameTrim) {
      alert('Пожалуйста, выберите или укажите название категории');
      return;
    }
    if (!valNum || valNum <= 0) {
      alert('Укажите корректный процент кешбэка (> 0)');
      return;
    }
    if (hasSubcategory && !subText.trim()) {
      alert('Укажите название подкатегории или снимите галочку');
      return;
    }

    // Clone banks
    const banks = [...cashbackData.banks];
    let bank = banks.find(b => b.name.toLowerCase() === bankNameTrim.toLowerCase());

    if (!bank) {
      bank = {
        id: Utils.uid(),
        name: bankNameTrim,
        cats: []
      };
      banks.push(bank);
    } else {
      // Create new cats array
      bank = { ...bank, cats: [...bank.cats] };
      const bIndex = banks.findIndex(b => b.id === bank!.id);
      banks[bIndex] = bank;
    }

    const newCatItem: CashbackCategory = {
      id: Utils.uid(),
      name: catNameTrim,
      sub: hasSubcategory ? subText.trim() : null,
      value: valNum
    };

    bank.cats.push(newCatItem);

    // Save
    setCashbackData({
      ...cashbackData,
      banks
    });

    // Also auto-remember into dictionaries if new
    let updatedDict = CbLogic.dictAdd(cbDict, 'bank', bankNameTrim);
    updatedDict = CbLogic.dictAdd(updatedDict, 'cat', catNameTrim);
    setCbDict(updatedDict);

    // Visual feedback & celebrate
    confetti({
      particleCount: 25,
      spread: 45,
      origin: { y: 0.8 }
    });

    setAddSuccessMsg(`Кешбэк «${catNameTrim}» ${valNum}% для «${bankNameTrim}» добавлен!`);
    setTimeout(() => setAddSuccessMsg(''), 3500);

    // Reset inputs but keep bank for fast consecutive additions
    setSelectedCatName('');
    setSubText('');
    setHasSubcategory(false);
  };

  // Remove individual category item
  const handleDeleteCategory = (bankId: string, catId: string) => {
    const banks = cashbackData.banks.map(b => {
      if (b.id === bankId) {
        return {
          ...b,
          cats: b.cats.filter(c => c.id !== catId)
        };
      }
      return b;
    }).filter(b => b.cats.length > 0 || b.name);

    setCashbackData({ ...cashbackData, banks });
  };

  // Remove entire bank
  const handleDeleteBank = (bankId: string, bankName: string) => {
    if (!confirm(`Удалить банк «${bankName}» и все его категории за этот месяц?`)) return;
    const banks = cashbackData.banks.filter(b => b.id !== bankId);
    setCashbackData({ ...cashbackData, banks });
  };

  // Dictionary management
  const handleAddDictBank = () => {
    if (!newDictBank.trim()) return;
    setCbDict(CbLogic.dictAdd(cbDict, 'bank', newDictBank.trim()));
    setNewDictBank('');
  };

  const handleAddDictCat = () => {
    if (!newDictCat.trim()) return;
    setCbDict(CbLogic.dictAdd(cbDict, 'cat', newDictCat.trim()));
    setNewDictCat('');
  };

  // Filtered all cashbacks for List 3
  const filteredAllByBank = useMemo(() => {
    const list = CbLogic.allByBank(cashbackData.banks);
    const query = searchFilter.toLowerCase().trim();
    if (!query && minPercentFilter <= 0) return list;

    return list.map(g => ({
      ...g,
      entries: g.entries.filter(e => {
        const matchesQuery = !query || 
          g.bankName.toLowerCase().includes(query) || 
          e.catName.toLowerCase().includes(query) || 
          (e.sub && e.sub.toLowerCase().includes(query));
        const matchesMin = e.value >= minPercentFilter;
        return matchesQuery && matchesMin;
      })
    })).filter(g => g.entries.length > 0);
  }, [cashbackData.banks, searchFilter, minPercentFilter]);

  const filteredAllByCat = useMemo(() => {
    const list = CbLogic.allByCategory(cashbackData.banks);
    const query = searchFilter.toLowerCase().trim();
    if (!query && minPercentFilter <= 0) return list;

    return list.map(g => ({
      ...g,
      entries: g.entries.filter(e => {
        const matchesQuery = !query || 
          g.name.toLowerCase().includes(query) || 
          (e.bankName && e.bankName.toLowerCase().includes(query)) ||
          (e.sub && e.sub.toLowerCase().includes(query));
        const matchesMin = e.value >= minPercentFilter;
        return matchesQuery && matchesMin;
      })
    })).filter(g => g.entries.length > 0);
  }, [cashbackData.banks, searchFilter, minPercentFilter]);

  // Color helper according to cashback spec: <3% red, 3-5% yellow, >=5% green
  const getBadgeStyle = (val: number) => {
    if (val >= 5) {
      return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
    }
    if (val >= 3) {
      return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800';
    }
    return 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800';
  };

  const getAccentBar = (val: number) => {
    if (val >= 5) return 'bg-emerald-500';
    if (val >= 3) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner / Month and Quick Stats */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Категории месяца</span>
              <span>·</span>
              <span>{cashbackData.month}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
              Умный кешбэк по банкам
            </h1>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-4 text-xs sm:text-sm">
            <div className="bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400 block text-xs">Банков</span>
              <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">{stats.banksCount}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400 block text-xs">Всего кешбэков</span>
              <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">{stats.totalEntries}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400 block text-xs">Макс. ставка</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">до {stats.maxVal}%</span>
            </div>
          </div>
        </div>

        {/* Top 3 Best Offers Kicker */}
        {top3Categories.length > 0 && (
          <div className="mt-4 pt-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-2">
              ТОП-3 категории с максимальным возвратом:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {top3Categories.map((cat, idx) => {
                const bestEntry = cat.top || cat.subs[0];
                const bestVal = bestEntry ? bestEntry.value : 0;
                return (
                  <div 
                    key={cat.name} 
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        #{idx + 1} {bestEntry?.bankName || 'Банк'}
                      </div>
                      <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                        {cat.name}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-lg shrink-0 tabular-nums ${getBadgeStyle(bestVal)}`}>
                      {bestVal}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Main Grid: Categories grouped by best offer */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Сравнение категорий кешбэка
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {groupedCategories.length} активных категорий
          </span>
        </div>

        {groupedCategories.length === 0 ? (
          <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm">
            Категорий пока нет. Раскройте список «Добавить новое» ниже, чтобы внести первые кешбэки!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {groupedCategories.map(group => {
              const mainEntry = group.top;
              const maxVal = mainEntry ? mainEntry.value : (group.subs[0]?.value || 0);

              return (
                <div 
                  key={group.name}
                  className="relative p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 transition-all flex flex-col justify-between overflow-hidden"
                >
                  {/* Left edge indicator bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${getAccentBar(maxVal)}`} />

                  <div>
                    {/* Main Category Header */}
                    <div className="flex items-start justify-between gap-2 pl-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 truncate">
                          {group.name}
                        </h3>
                        {mainEntry && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 shrink-0" />
                            {mainEntry.bankName}
                          </span>
                        )}
                      </div>

                      {mainEntry && (
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-lg shrink-0 tabular-nums ${getBadgeStyle(mainEntry.value)}`}>
                          {mainEntry.value}%
                        </span>
                      )}
                    </div>

                    {/* Subcategories (if any) */}
                    {group.subs.length > 0 && (
                      <div className="mt-3 pl-2 space-y-1.5 border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
                        {group.subs.map(sub => (
                          <div 
                            key={sub.catId}
                            className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300"
                          >
                            <span className="truncate pr-2">
                              <span className="text-slate-400 dark:text-slate-500 mr-1.5">↳</span>
                              <strong className="text-slate-700 dark:text-slate-200">{sub.bankName}</strong>
                              {sub.sub && <span className="text-slate-500 dark:text-slate-400"> · {sub.sub}</span>}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${getBadgeStyle(sub.value)}`}>
                              {sub.value}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* =========================================================================
          THE 3 COLLAPSIBLE LISTS AT THE BOTTOM AS REQUESTED BY USER
          - List 1: "Добавить новое" (Edge Illumination: Light pastel rose / Dark Red)
          - List 2: "Настроить" (Edge Illumination: Light pastel amber / Dark Yellow)
          - List 3: "Показать все кешбеки" (Edge Illumination: Light pastel peach / Dark Orange)
          ========================================================================= */}
      <div className="space-y-4 pt-2">
        
        {/* LIST 1: ДОБАВИТЬ НОВОЕ */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 transition-all shadow-xs">
          <button
            type="button"
            onClick={() => setOpenAdd(!openAdd)}
            className="w-full px-5 py-4 flex items-center justify-between text-left transition-colors edge-glow-red hover:bg-slate-50 dark:hover:bg-slate-800/40"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center font-bold">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 block">
                  1. Добавить новое
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Внести банк, категорию и процент кешбэка на текущий месяц
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded">
                Подсветка: Красная
              </span>
              {openAdd ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </div>
          </button>

          {openAdd && (
            <div className="p-5 md:p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/60">
              {addSuccessMsg && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{addSuccessMsg}</span>
                </div>
              )}

              <form onSubmit={handleAddCashback} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  {/* Bank Input / Select */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Банк
                    </label>
                    <input
                      type="text"
                      list="dictBanksList"
                      placeholder="Например: Т-Банк, Сбербанк, Альфа-Банк..."
                      value={selectedBankName}
                      onChange={e => setSelectedBankName(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-red-500"
                      required
                    />
                    <datalist id="dictBanksList">
                      {cbDict.banks.map(b => (
                        <option key={b.id} value={b.name} />
                      ))}
                    </datalist>
                  </div>

                  {/* Category Input / Select */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Категория
                    </label>
                    <input
                      type="text"
                      list="dictCatsList"
                      placeholder="Например: Супермаркеты, Такси, АЗС..."
                      value={selectedCatName}
                      onChange={e => setSelectedCatName(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-red-500"
                      required
                    />
                    <datalist id="dictCatsList">
                      {cbDict.cats.map(c => (
                        <option key={c.id} value={c.name} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* Percent and Subcategory */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Кешбэк (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="100"
                        placeholder="5"
                        value={cbValue}
                        onChange={e => setCbValue(e.target.value === '' ? '' : parseFloat(e.target.value))}
                        className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-red-500 tabular-nums pr-8"
                        required
                      />
                      <Percent className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                    </div>
                  </div>

                  <div className="sm:col-span-2 pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={hasSubcategory}
                        onChange={e => setHasSubcategory(e.target.checked)}
                        className="rounded border-slate-300 text-red-600 focus:ring-red-500 w-4 h-4"
                      />
                      <span>Указать подкатегорию или специальное условие</span>
                    </label>
                  </div>
                </div>

                {hasSubcategory && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Название подкатегории или партнёра
                    </label>
                    <input
                      type="text"
                      placeholder="Например: Пятерочка, Яндекс Go, Метро..."
                      value={subText}
                      onChange={e => setSubText(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                )}

                {/* Popular Category Quick-Select Chips */}
                <div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1.5">
                    Быстрый выбор популярной категории:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {['Супермаркеты', 'Кафе и рестораны', 'Такси', 'АЗС', 'Аптеки', 'Одежда', 'Дом и ремонт'].map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCatName(cat)}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl shadow-xs transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>+ Добавить кешбэк в месяц</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* LIST 2: НАСТРОИТЬ */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 transition-all shadow-xs">
          <button
            type="button"
            onClick={() => setOpenSettings(!openSettings)}
            className="w-full px-5 py-4 flex items-center justify-between text-left transition-colors edge-glow-yellow hover:bg-slate-50 dark:hover:bg-slate-800/40"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <Settings2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 block">
                  2. Настроить
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Управление словарями постоянных банков и категорий для быстрого ввода
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded">
                Подсветка: Жёлтая
              </span>
              {openSettings ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </div>
          </button>

          {openSettings && (
            <div className="p-5 md:p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/60 space-y-6">
              
              {/* Permanent Banks Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-amber-500" />
                    Постоянные банки ({cbDict.banks.length})
                  </h4>
                  <span className="text-xs text-slate-500">Автодополнение при вводе</span>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {cbDict.banks.map(b => (
                    <div 
                      key={b.id}
                      className="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                    >
                      <span>{b.name}</span>
                      <button
                        type="button"
                        onClick={() => setCbDict(CbLogic.dictRemove(cbDict, 'bank', b.id))}
                        className="text-slate-400 hover:text-rose-500 transition-colors ml-1 p-0.5"
                        title="Удалить из словаря"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Новый банк в словарь..."
                    value={newDictBank}
                    onChange={e => setNewDictBank(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddDictBank}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl"
                  >
                    + Добавить банк
                  </button>
                </div>
              </div>

              {/* Permanent Categories Section */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-5">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-amber-500" />
                    Постоянные категории ({cbDict.cats.length})
                  </h4>
                  <span className="text-xs text-slate-500">Сохраняются между месяцами</span>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {cbDict.cats.map(c => (
                    <div 
                      key={c.id}
                      className="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                    >
                      <span>{c.name}</span>
                      <button
                        type="button"
                        onClick={() => setCbDict(CbLogic.dictRemove(cbDict, 'cat', c.id))}
                        className="text-slate-400 hover:text-rose-500 transition-colors ml-1 p-0.5"
                        title="Удалить из словаря"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Новая категория..."
                    value={newDictCat}
                    onChange={e => setNewDictCat(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddDictCat}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl"
                  >
                    + Добавить категорию
                  </button>
                </div>
              </div>

              {/* Bank quick cleanup */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Управление банками текущего месяца:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Очистить все кешбэки за текущий месяц?')) {
                      setCashbackData({ ...cashbackData, banks: [] });
                    }
                  }}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                >
                  Очистить кешбэки текущего месяца
                </button>
              </div>

            </div>
          )}
        </div>

        {/* LIST 3: ПОКАЗАТЬ ВСЕ КЕШБЕКИ */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 transition-all shadow-xs">
          <button
            type="button"
            onClick={() => setOpenAll(!openAll)}
            className="w-full px-5 py-4 flex items-center justify-between text-left transition-colors edge-glow-orange hover:bg-slate-50 dark:hover:bg-slate-800/40"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/80 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 block">
                  3. Показать все кешбеки
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Полная таблица с фильтрами, сортировкой по банкам и категориям
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded">
                Подсветка: Оранжевая
              </span>
              {openAll ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </div>
          </button>

          {openAll && (
            <div className="p-5 md:p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/60 space-y-4">
              
              {/* Filter and Mode Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                {/* Search */}
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Поиск по банку или категории..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {/* Min % quick filter chips */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500 dark:text-slate-400 hidden lg:inline">Мин. %:</span>
                  {[0, 3, 5, 10].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setMinPercentFilter(pct)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                        minPercentFilter === pct
                          ? 'bg-orange-600 text-white font-bold'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {pct === 0 ? 'Все' : `от ${pct}%`}
                    </button>
                  ))}
                </div>

                {/* Grouping switch */}
                <div className="flex items-center p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setAllSortMode('bank')}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      allSortMode === 'bank'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    По банкам
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllSortMode('cat')}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      allSortMode === 'cat'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    По категориям
                  </button>
                </div>
              </div>

              {/* Grouped View Content */}
              {allSortMode === 'bank' ? (
                <div className="space-y-4">
                  {filteredAllByBank.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-500">
                      Ничего не найдено по вашему фильтру
                    </div>
                  ) : (
                    filteredAllByBank.map(bankGroup => (
                      <div 
                        key={bankGroup.bankId}
                        className="bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                      >
                        <div className="px-4 py-2.5 bg-slate-100/70 dark:bg-slate-750 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                          <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-orange-500" />
                            {bankGroup.bankName}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500">
                              {bankGroup.entries.length} предложений
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteBank(bankGroup.bankId, bankGroup.bankName)}
                              className="text-xs text-rose-500 hover:text-rose-700"
                              title="Удалить банк"
                            >
                              Удалить банк
                            </button>
                          </div>
                        </div>

                        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                          {bankGroup.entries.map(e => (
                            <div 
                              key={e.catId}
                              className="px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors"
                            >
                              <div className="min-w-0 pr-2">
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {e.catName}
                                </span>
                                {e.sub && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400 ml-1.5">
                                    · {e.sub}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className={`px-2 py-0.5 text-xs font-bold rounded-lg tabular-nums ${getBadgeStyle(e.value)}`}>
                                  {e.value}%
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategory(bankGroup.bankId, e.catId)}
                                  className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                  title="Убрать этот кешбэк"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredAllByCat.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-500">
                      Ничего не найдено по вашему фильтру
                    </div>
                  ) : (
                    filteredAllByCat.map(catGroup => (
                      <div 
                        key={catGroup.name}
                        className="bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                      >
                        <div className="px-4 py-2 bg-slate-100/70 dark:bg-slate-750 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                          <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                            <Tag className="w-4 h-4 text-orange-500" />
                            {catGroup.name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {catGroup.entries.length} банков
                          </span>
                        </div>

                        <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                          {catGroup.entries.map(e => (
                            <div 
                              key={`${e.bankId}-${e.catId}`}
                              className="px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm hover:bg-slate-50 dark:hover:bg-slate-750/50 transition-colors"
                            >
                              <div className="min-w-0 pr-2">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {e.bankName}
                                </span>
                                {e.sub && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400 ml-1.5">
                                    · {e.sub}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className={`px-2 py-0.5 text-xs font-bold rounded-lg tabular-nums ${getBadgeStyle(e.value)}`}>
                                  {e.value}%
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCategory(e.bankId, e.catId)}
                                  className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                  title="Убрать этот кешбэк"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

            </div>
          )}
        </div>

      </div>

    </div>
  );
};
