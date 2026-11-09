import { Product, Goal, CashbackMonthData, CashbackDictionary, SnapshotItem } from '../types/finance';
import { INITIAL_PRODUCTS, INITIAL_GOAL, INITIAL_CASHBACK_DATA, INITIAL_CASHBACK_DICT } from '../utils/seedData';
import { Utils } from '../utils/financeCalculations';

const KEY_PRODUCTS = 'fin_v3';
const KEY_GOAL = 'fin_goal';
const KEY_CASHBACK = 'fin_cashback';
const KEY_CB_DICT = 'fin_cbDict';
const KEY_SNAPSHOTS = 'fin_snapshots';
const KEY_THEME = 'fin_theme';

export const StorageService = {
  getProducts(): Product[] {
    try {
      const data = localStorage.getItem(KEY_PRODUCTS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load products from localStorage', e);
    }
    // Default seed
    StorageService.saveProducts(INITIAL_PRODUCTS);
    return INITIAL_PRODUCTS;
  },

  saveProducts(products: Product[]): void {
    try {
      localStorage.setItem(KEY_PRODUCTS, JSON.stringify(products));
      window.dispatchEvent(new CustomEvent('finance_data_changed'));
    } catch (e) {
      console.error('Failed to save products to localStorage', e);
    }
  },

  getGoal(): Goal {
    try {
      const data = localStorage.getItem(KEY_GOAL);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load goal', e);
    }
    return INITIAL_GOAL;
  },

  saveGoal(goal: Goal): void {
    try {
      localStorage.setItem(KEY_GOAL, JSON.stringify(goal));
      window.dispatchEvent(new CustomEvent('finance_data_changed'));
    } catch (e) {
      console.error('Failed to save goal', e);
    }
  },

  getCashbackData(): CashbackMonthData {
    const curMonth = Utils.monthKey();
    try {
      const data = localStorage.getItem(KEY_CASHBACK);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.month === curMonth && Array.isArray(parsed.banks)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load cashback data', e);
    }
    // New month or empty:
    const initial: CashbackMonthData = {
      month: curMonth,
      banks: INITIAL_CASHBACK_DATA.banks
    };
    StorageService.saveCashbackData(initial);
    return initial;
  },

  saveCashbackData(data: CashbackMonthData): void {
    try {
      localStorage.setItem(KEY_CASHBACK, JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('cashback_data_changed'));
    } catch (e) {
      console.error('Failed to save cashback data', e);
    }
  },

  getCbDict(): CashbackDictionary {
    try {
      const data = localStorage.getItem(KEY_CB_DICT);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load cashback dict', e);
    }
    return INITIAL_CASHBACK_DICT;
  },

  saveCbDict(dict: CashbackDictionary): void {
    try {
      localStorage.setItem(KEY_CB_DICT, JSON.stringify(dict));
      window.dispatchEvent(new CustomEvent('cashback_dict_changed'));
    } catch (e) {
      console.error('Failed to save cashback dict', e);
    }
  },

  getSnapshots(): SnapshotItem[] {
    try {
      const data = localStorage.getItem(KEY_SNAPSHOTS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load snapshots', e);
    }
    return [];
  },

  saveSnapshots(list: SnapshotItem[]): void {
    try {
      localStorage.setItem(KEY_SNAPSHOTS, JSON.stringify(list));
    } catch (e) {
      console.error('Failed to save snapshots', e);
    }
  },

  getTheme(): 'dark' | 'light' {
    const saved = localStorage.getItem(KEY_THEME);
    if (saved === 'dark' || saved === 'light') return saved;
    return 'dark'; // Dark theme default with vibrant cashback accents
  },

  saveTheme(theme: 'dark' | 'light'): void {
    localStorage.setItem(KEY_THEME, theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },

  resetToSeed(): void {
    StorageService.saveProducts(INITIAL_PRODUCTS);
    StorageService.saveGoal(INITIAL_GOAL);
    StorageService.saveCashbackData(INITIAL_CASHBACK_DATA);
    StorageService.saveCbDict(INITIAL_CASHBACK_DICT);
    window.location.reload();
  },

  resetToZero(): void {
    StorageService.saveProducts([]);
    StorageService.saveGoal({ name: 'Цель не задана', amount: 0 });
    StorageService.saveCashbackData({ month: Utils.monthKey(), banks: [] });
    window.location.reload();
  },

  exportJSON(): void {
    const backup = {
      version: 'finance-pwa-v3',
      exportDate: new Date().toISOString(),
      products: StorageService.getProducts(),
      goal: StorageService.getGoal(),
      cashback: StorageService.getCashbackData(),
      cbDict: StorageService.getCbDict(),
      snapshots: StorageService.getSnapshots()
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance_backup_${Utils.dateKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  exportExcel(): void {
    const products = StorageService.getProducts();
    let totalAssets = 0;
    let totalDebts = 0;

    let rowsHtml = '';
    products.forEach((p, idx) => {
      const isDebt = p.type === 'credit_card' || p.type === 'loan' || p.type === 'expense';
      const amt = p.amount || 0;
      if (!p.offBudget) {
        if (isDebt) totalDebts += amt;
        else totalAssets += amt;
      }
      rowsHtml += `
        <tr>
          <td>${idx + 1}</td>
          <td>${p.name}</td>
          <td>${p.type}</td>
          <td>${amt}</td>
          <td>${p.rate || 0}%</td>
          <td>${p.startDate || '—'}</td>
          <td>${p.endDate || '—'}</td>
          <td>${p.comment || ''}</td>
        </tr>
      `;
    });

    const netCapital = totalAssets - totalDebts;

    const excelTemplate = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <title>Финансовый учёт</title>
      </head>
      <body>
        <h2>Финансовый учёт: выгрузка данных</h2>
        <p>Дата формирования: ${new Date().toLocaleString('ru-RU')}</p>
        <table border="1">
          <thead>
            <tr style="background-color: #2563eb; color: #ffffff; font-weight: bold;">
              <th>№</th>
              <th>Наименование</th>
              <th>Тип</th>
              <th>Сумма (₽)</th>
              <th>Ставка (%)</th>
              <th>Дата начала</th>
              <th>Дата окончания</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <br/>
        <h3>Итоги</h3>
        <table border="1">
          <tr><td><b>Общие активы:</b></td><td>${totalAssets} ₽</td></tr>
          <tr><td><b>Общий долг:</b></td><td>${totalDebts} ₽</td></tr>
          <tr><td><b>Чистый капитал:</b></td><td><b>${netCapital} ₽</b></td></tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelTemplate], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance_export_${Utils.dateKey(new Date())}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }
};
