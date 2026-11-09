import React, { useState } from 'react';
import { Product, ProductType } from '../types/finance';
import { Utils, AssetHelper } from '../utils/financeCalculations';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  Landmark, 
  TrendingUp, 
  CreditCard, 
  Home, 
  AlertCircle, 
  ChevronDown, 
  ChevronRight,
  EyeOff
} from 'lucide-react';

interface ProductsSectionProps {
  products: Product[];
  onOpenAddModal: (type?: ProductType) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
}

const TYPE_CONFIG: Record<ProductType, { label: string; icon: any; color: string }> = {
  deposit: { label: 'Вклады и счета', icon: Landmark, color: 'text-blue-500' },
  debit_card: { label: 'Дебетовые карты', icon: CreditCard, color: 'text-emerald-500' },
  credit_card: { label: 'Кредитные карты', icon: CreditCard, color: 'text-amber-500' },
  loan: { label: 'Кредиты и займы', icon: AlertCircle, color: 'text-rose-500' },
  investment: { label: 'Инвестиционные портфели', icon: TrendingUp, color: 'text-purple-500' },
  apartment: { label: 'Недвижимость и имущество', icon: Home, color: 'text-indigo-500' },
  expense: { label: 'Обязательные расходы', icon: AlertCircle, color: 'text-slate-500' },
  income: { label: 'Дополнительные доходы', icon: Landmark, color: 'text-teal-500' },
};

export const ProductsSection: React.FC<ProductsSectionProps> = ({
  products,
  onOpenAddModal,
  onEditProduct,
  onDeleteProduct
}) => {
  // Collapsed sections tracker
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Group products by type
  const grouped = React.useMemo(() => {
    const map: Partial<Record<ProductType, Product[]>> = {};
    products.forEach(p => {
      if (!map[p.type]) map[p.type] = [];
      map[p.type]!.push(p);
    });
    return map;
  }, [products]);

  const activeTypes = Object.keys(grouped) as ProductType[];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-xs transition-colors space-y-6">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
            Мои финансовые продукты
          </h2>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {products.length} активных счетов, вкладов, кредитов и активов
          </div>
        </div>

        <button
          onClick={() => onOpenAddModal()}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 rounded-xl transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>+ Добавить продукт</span>
        </button>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm">
          Список пуст. Нажмите «+ Добавить продукт» или загрузите демо-данные в настройках.
        </div>
      ) : (
        <div className="space-y-5">
          {activeTypes.map(type => {
            const list = grouped[type] || [];
            const cfg = TYPE_CONFIG[type] || { label: type, icon: Landmark, color: 'text-slate-500' };
            const Icon = cfg.icon;
            const isCollapsed = collapsed[type];

            // Subtotal
            const groupSum = list.reduce((acc, p) => {
              if (p.type === 'investment') return acc + AssetHelper.portfolioValue(p);
              return acc + (p.amount || 0);
            }, 0);

            return (
              <div 
                key={type}
                className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/30 dark:bg-slate-900/40"
              >
                {/* Group Header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(type)}
                  className="w-full px-4 py-3 bg-slate-100/70 dark:bg-slate-800/60 flex items-center justify-between text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                      {cfg.label}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      ({list.length})
                    </span>
                  </div>

                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {Utils.fmtMoney(groupSum)}
                  </span>
                </button>

                {/* Products in this category */}
                {!isCollapsed && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {list.map(p => {
                      const displayAmount = p.type === 'investment' 
                        ? AssetHelper.portfolioValue(p) 
                        : (p.amount || 0);

                      return (
                        <div
                          key={p.id}
                          className="px-4 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-white dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                                {p.name}
                              </span>
                              {p.offBudget && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.2 rounded" title="Не участвует в общем балансе">
                                  <EyeOff className="w-3 h-3" /> Вне бюджета
                                </span>
                              )}
                              {p.closed && (
                                <span className="text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                                  Закрыт
                                </span>
                              )}
                            </div>

                            {/* Clean unboxed metadata with · separator */}
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {p.rate !== undefined && p.rate > 0 && (
                                <>
                                  <span>{p.rate}% годовых</span>
                                  <span aria-hidden="true">·</span>
                                </>
                              )}
                              {p.endDate && (
                                <>
                                  <span>до {Utils.fmtDate(p.endDate)}</span>
                                  <span aria-hidden="true">·</span>
                                </>
                              )}
                              {p.gracePeriodEndDate && (
                                <>
                                  <span>грейс до {Utils.fmtDate(p.gracePeriodEndDate)}</span>
                                  <span aria-hidden="true">·</span>
                                </>
                              )}
                              {p.comment && (
                                <span className="truncate max-w-xs">{p.comment}</span>
                              )}
                            </div>
                          </div>

                          {/* Right: Amount & Action buttons */}
                          <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 tabular-nums">
                              {Utils.fmtMoney(displayAmount)}
                            </span>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => onEditProduct(p)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Редактировать продукт"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Удалить продукт «${p.name}»?`)) {
                                    onDeleteProduct(p.id);
                                  }
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                title="Удалить продукт"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};
