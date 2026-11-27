var T = typeof T === 'function' ? T : (typeof I18n !== 'undefined' ? s => I18n.t(s) : s => s);
/* Full local-first backup/restore for all application-owned localStorage keys. */
const Backup = (() => {
const PREFIX = 'fin_';
  const FORMAT = 'finance-local-backup';
  const VERSION = 2;

  function appEntries(){
    const out = {};
    for (let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) out[key] = localStorage.getItem(key);
    }
    return out;
  }

  function validateProducts(list){
    if (!Array.isArray(list)) throw new Error(T('В резервной копии нет списка продуктов'));
    const ids = new Set();
    for (const [i, p] of list.entries()){
      if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error(`Продукт №${i + 1}: неверный формат`);
      if (typeof p.id !== 'string' || !p.id.trim()) throw new Error(`Продукт №${i + 1}: отсутствует идентификатор`);
      if (ids.has(p.id)) throw new Error(`Повторяется идентификатор продукта: ${p.id}`);
      ids.add(p.id);
      if (!Config.TYPES[p.type]) throw new Error(`Продукт «${p.name || p.id}»: неизвестный тип`);
      if (p.name != null && typeof p.name !== 'string') throw new Error(`Продукт №${i + 1}: неверное название`);
      if (p.amount != null && !Number.isFinite(Number(p.amount))) throw new Error(`Продукт «${p.name || p.id}»: неверная сумма`);
      if (p.operations != null && !Array.isArray(p.operations)) throw new Error(`Продукт «${p.name || p.id}»: неверный список операций`);
      if (p.assets != null && !Array.isArray(p.assets)) throw new Error(`Продукт «${p.name || p.id}»: неверный список активов`);
    }
    return list;
  }

  function parse(text){
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw new Error(T('Файл не является корректным JSON')); }

    // Совместимость с прежними резервными копиями: массив продуктов.
    if (Array.isArray(parsed)){
      return { legacy:true, entries:{ [Config.STORAGE_KEY]:JSON.stringify(validateProducts(parsed)) }, products:parsed };
    }

    if (!parsed || parsed.format !== FORMAT || parsed.version !== VERSION || !parsed.storage || typeof parsed.storage !== 'object' || Array.isArray(parsed.storage)){
      throw new Error(T('Неизвестный формат резервной копии или неподдерживаемая версия'));
    }
    const entries = {};
    for (const [key, value] of Object.entries(parsed.storage)){
      if (!/^fin_[a-z0-9_]+$/i.test(key) || typeof value !== 'string') throw new Error(T('В резервной копии обнаружены некорректные данные приложения'));
      entries[key] = value;
    }
    if (!(Config.STORAGE_KEY in entries)) throw new Error(T('В резервной копии отсутствует основной список продуктов'));
    let products;
    try { products = JSON.parse(entries[Config.STORAGE_KEY]); }
    catch { throw new Error(T('Основной список продуктов повреждён')); }
    validateProducts(products);
    for (const key of ['fin_cashback','fin_cbDict','fin_snapshots','fin_goal']){
      if (entries[key] == null) continue;
      try { JSON.parse(entries[key]); }
      catch { throw new Error(`Раздел ${key} повреждён — импорт отменён`); }
    }
    return { legacy:false, entries, products };
  }

  function create(){
    const now = new Date().toISOString();
    localStorage.setItem('fin_backup_last_export', now);
    return {
      format:FORMAT, version:VERSION, exportedAt:now,
      app:'Финансовый учёт', storage:appEntries()
    };
  }

  function restore(parsed){
    const before = appEntries();
    const beforeProducts = (() => {
      try { return JSON.parse(before[Config.STORAGE_KEY] || '[]'); } catch { return []; }
    })();
    try {
      if (!parsed.legacy){
        Object.keys(before).forEach(key => localStorage.removeItem(key));
      }
      Object.entries(parsed.entries).forEach(([key,value]) => localStorage.setItem(key,value));
      Storage.replaceAll(parsed.products);
    } catch (error){
      Object.keys(appEntries()).forEach(key => localStorage.removeItem(key));
      Object.entries(before).forEach(([key,value]) => localStorage.setItem(key,value));
      Storage.replaceAll(beforeProducts);
      throw new Error(T('Не удалось восстановить данные. Предыдущие данные возвращены: ') + (error.message || error));
    }
    return parsed.products.length;
  }

  function clear(){
    Object.keys(appEntries()).forEach(key => localStorage.removeItem(key));
    Storage.replaceAll([]);
  }

  function lastExport(){
    const value = localStorage.getItem('fin_backup_last_export');
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return { create, parse, restore, clear, lastExport, validateProducts };
})();
