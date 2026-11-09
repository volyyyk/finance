import React, { useState } from 'react';
import { Product, Asset, AssetKind } from '../types/finance';
import { Utils, AssetHelper } from '../utils/financeCalculations';
import { TrendingUp, Coins, Building, Award, Plus, Trash2, Search, ExternalLink } from 'lucide-react';

interface InvestmentsSectionProps {
  products: Product[];
  onUpdateProduct: (product: Product) => void;
}

export const InvestmentsSection: React.FC<InvestmentsSectionProps> = ({
  products,
  onUpdateProduct
}) => {
  const investProduct = products.find(p => p.type === 'investment');

  const [assetKindFilter, setAssetKindFilter] = useState<'all' | AssetKind>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddAsset, setShowAddAsset] = useState(false);

  // New asset form state
  const [newSecid, setNewSecid] = useState('');
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<AssetKind>('stock');
  const [newQty, setNewQty] = useState<number>(10);
  const [newPrice, setNewPrice] = useState<number>(100);

  const assets = investProduct?.assets || [];

  const filteredAssets = assets.filter(a => {
    const matchesKind = assetKindFilter === 'all' || a.kind === assetKindFilter;
    const matchesSearch = !searchQuery || 
      a.shortname.toLowerCase().includes(searchQuery.toLowerCase()) || 
      a.secid.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesKind && matchesSearch;
  });

  const totalPortfolio = investProduct ? AssetHelper.portfolioValue(investProduct) : 0;
  const cashBalance = investProduct?.amount || 0;

  // Add Asset Handler
  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!investProduct) return;
    if (!newSecid.trim() || !newName.trim()) return;

    const newAssetItem: Asset = {
      id: Utils.uid(),
      secid: newSecid.toUpperCase().trim(),
      shortname: newName.trim(),
      kind: newKind,
      qty: Number(newQty),
      avgPrice: Number(newPrice),
      lastPrice: Number(newPrice),
      ...(newKind === 'bond' ? { nominal: 1000, couponFreq: 2 } : {})
    };

    const updated = {
      ...investProduct,
      assets: [...(investProduct.assets || []), newAssetItem]
    };
    onUpdateProduct(updated);
    setShowAddAsset(false);
    setNewSecid('');
    setNewName('');
  };

  const handleDeleteAsset = (assetId: string) => {
    if (!investProduct) return;
    const updated = {
      ...investProduct,
      assets: (investProduct.assets || []).filter(a => a.id !== assetId)
    };
    onUpdateProduct(updated);
  };

  return (
    <div className="space-y-6">
      
      {/* Portfolio Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <span>Инвестиции MOEX ISS</span>
              <span>·</span>
              <span>Акции, Облигации, Фонды, Металлы</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
              Инвестиционный портфель
            </h1>
          </div>

          <div className="flex items-center gap-4 text-xs sm:text-sm">
            <div className="bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400 block text-xs">Стоимость портфеля</span>
              <span className="font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                {Utils.fmtMoney(totalPortfolio)}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400 block text-xs">Свободный кэш</span>
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {Utils.fmtMoney(cashBalance)}
              </span>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto no-scrollbar">
            {[
              { id: 'all', label: 'Все активы' },
              { id: 'stock', label: 'Акции' },
              { id: 'bond', label: 'Облигации' },
              { id: 'fund', label: 'Фонды (БПИФ)' },
              { id: 'metal', label: 'Металлы (GLD/SLV)' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setAssetKindFilter(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  assetKindFilter === tab.id
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Поиск по тикеру..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-40 sm:w-48"
              />
            </div>

            <button
              onClick={() => setShowAddAsset(!showAddAsset)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 dark:bg-white dark:text-slate-900 rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Добавить актив</span>
            </button>
          </div>
        </div>

        {/* Add Asset Inline Form */}
        {showAddAsset && (
          <form onSubmit={handleAddAsset} className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Тикер (secid)</label>
                <input
                  type="text"
                  placeholder="SBER, LKOH, SU26238..."
                  value={newSecid}
                  onChange={e => setNewSecid(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Название</label>
                <input
                  type="text"
                  placeholder="Сбербанк, ОФЗ 26238..."
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Тип актива</label>
                <select
                  value={newKind}
                  onChange={e => setNewKind(e.target.value as AssetKind)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="stock">Акции</option>
                  <option value="bond">Облигации</option>
                  <option value="fund">Фонд (БПИФ)</option>
                  <option value="metal">Драгметалл</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Кол-во</label>
                  <input
                    type="number"
                    value={newQty}
                    onChange={e => setNewQty(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Цена (₽)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={newPrice}
                    onChange={e => setNewPrice(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddAsset(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-500"
              >
                Сохранить в портфель
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Assets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredAssets.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-500 dark:text-slate-400 text-sm">
            Активов не найдено
          </div>
        ) : (
          filteredAssets.map(asset => {
            const unitPrice = AssetHelper.price(asset);
            const totalVal = (asset.qty || 0) * unitPrice;

            return (
              <div 
                key={asset.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                          {asset.secid}
                        </span>
                        <span className="text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded uppercase">
                          {asset.kind}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px] mt-0.5">
                        {asset.shortname}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteAsset(asset.id)}
                      className="text-slate-400 hover:text-rose-500 p-1"
                      title="Удалить актив"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      {asset.qty} {asset.unit || 'шт.'} × {Utils.fmtMoney(unitPrice)}
                    </span>
                    <span className="font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                      {Utils.fmtMoney(totalVal)}
                    </span>
                  </div>
                </div>

                {/* Bonds coupons metadata */}
                {asset.kind === 'bond' && asset.coupons && asset.coupons.length > 0 && (
                  <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                    <span>Ближ. купон: {asset.coupons[0].date}</span>
                    <span className="font-semibold">{asset.coupons[0].value} ₽/шт</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};
