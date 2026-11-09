import React, { useState, useEffect } from 'react';
import { Product, ProductType } from '../types/finance';
import { Utils } from '../utils/financeCalculations';
import { X, Check } from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Product) => void;
  editingProduct?: Product | null;
  defaultType?: ProductType;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingProduct,
  defaultType = 'deposit'
}) => {
  const [type, setType] = useState<ProductType>(defaultType);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number | ''>(100000);
  const [rate, setRate] = useState<number | ''>(12);
  const [startDate, setStartDate] = useState(Utils.dateKey(new Date()));
  const [endDate, setEndDate] = useState<string>('');
  const [comment, setComment] = useState('');
  const [offBudget, setOffBudget] = useState(false);

  // Credit card specific
  const [limit, setLimit] = useState<number | ''>(100000);
  const [gracePeriodEndDate, setGracePeriodEndDate] = useState('');

  // Apartment specific
  const [rented, setRented] = useState(false);
  const [rentPrice, setRentPrice] = useState<number | ''>(50000);
  const [upkeepRate, setUpkeepRate] = useState<number | ''>(2);

  useEffect(() => {
    if (editingProduct) {
      setType(editingProduct.type);
      setName(editingProduct.name);
      setAmount(editingProduct.amount);
      setRate(editingProduct.rate !== undefined ? editingProduct.rate : 0);
      setStartDate(editingProduct.startDate || Utils.dateKey(new Date()));
      setEndDate(editingProduct.endDate || '');
      setComment(editingProduct.comment || '');
      setOffBudget(editingProduct.offBudget || false);
      setLimit(editingProduct.limit || 0);
      setGracePeriodEndDate(editingProduct.gracePeriodEndDate || '');
      setRented(editingProduct.rented || false);
      setRentPrice(editingProduct.rentPrice || 0);
      setUpkeepRate(editingProduct.upkeepRate || 2);
    } else {
      setType(defaultType);
      setName('');
      setAmount(100000);
      setRate(12);
      setStartDate(Utils.dateKey(new Date()));
      setEndDate('');
      setComment('');
      setOffBudget(false);
      setLimit(150000);
      setGracePeriodEndDate('');
      setRented(false);
      setRentPrice(50000);
      setUpkeepRate(2);
    }
  }, [editingProduct, defaultType, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const savedProduct: Product = {
      id: editingProduct ? editingProduct.id : Utils.uid(),
      type,
      name: name.trim(),
      amount: Number(amount) || 0,
      rate: Number(rate) || 0,
      startDate: startDate || undefined,
      endDate: endDate || null,
      comment: comment.trim() || undefined,
      offBudget,
      ...(editingProduct?.assets ? { assets: editingProduct.assets } : {}),
      ...(editingProduct?.operations ? { operations: editingProduct.operations } : {}),
      ...(editingProduct?.endActions ? { endActions: editingProduct.endActions } : {}),
      ...(type === 'credit_card' ? { limit: Number(limit) || 0, gracePeriodEndDate: gracePeriodEndDate || null } : {}),
      ...(type === 'apartment' ? { rented, rentPrice: Number(rentPrice) || 0, upkeepRate: Number(upkeepRate) || 2 } : {})
    };

    onSave(savedProduct);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 max-h-[90vh] overflow-y-auto">
        
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {editingProduct ? 'Редактировать продукт' : 'Новый финансовый продукт'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs sm:text-sm">
          
          {/* Type selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Тип продукта
            </label>
            <select
              value={type}
              onChange={e => setType(e.target.value as ProductType)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value="deposit">Вклад / накопительный счёт</option>
              <option value="debit_card">Дебетовая карта</option>
              <option value="credit_card">Кредитная карта</option>
              <option value="loan">Кредит / автокредит / ипотека</option>
              <option value="investment">Инвестиционный портфель (акции, облигации)</option>
              <option value="apartment">Недвижимость / квартира</option>
              <option value="expense">Обязательный регулярный расход</option>
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Название
            </label>
            <input
              type="text"
              placeholder="Например: Вклад «Накопительный», Сбербанк..."
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              required
            />
          </div>

          {/* Amount & Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {type === 'expense' ? 'Сумма в месяц (₽)' : type === 'loan' || type === 'credit_card' ? 'Текущий долг (₽)' : 'Сумма баланса (₽)'}
              </label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {type === 'apartment' ? 'Рост цены (% в год)' : 'Процентная ставка (%/год)'}
              </label>
              <input
                type="number"
                step="0.1"
                value={rate}
                onChange={e => setRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Дата начала
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Дата окончания (срок)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Credit card fields */}
          {type === 'credit_card' && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Кредитный лимит (₽)
                </label>
                <input
                  type="number"
                  value={limit}
                  onChange={e => setLimit(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Конец грейс-периода
                </label>
                <input
                  type="date"
                  value={gracePeriodEndDate}
                  onChange={e => setGracePeriodEndDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          {/* Apartment fields */}
          {type === 'apartment' && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={rented}
                  onChange={e => setRented(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span>Квартира сдаётся в аренду</span>
              </label>

              {rented && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Аренда (₽/мес в доход)
                    </label>
                    <input
                      type="number"
                      value={rentPrice}
                      onChange={e => setRentPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Ремонт (%/год в расход)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={upkeepRate}
                      onChange={e => setUpkeepRate(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Comment */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Комментарий / банк
            </label>
            <input
              type="text"
              placeholder="Сбербанк, Т-Банк, ВТБ..."
              value={comment}
              onChange={e => setComment(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Off budget toggle */}
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={offBudget}
              onChange={e => setOffBudget(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
            />
            <span>Вне бюджета (не учитывается в общем балансе капитала)</span>
          </label>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs sm:text-sm font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm"
            >
              {editingProduct ? 'Сохранить изменения' : 'Добавить продукт'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
