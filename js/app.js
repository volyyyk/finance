/* ============================================================
   app.js — точка входа.
   ============================================================ */

const App = (() => {
  const { $ } = Utils;

  function renderProducts(){
    ProductList.render((id) => ProductEditor.open(id, App.refresh));
  }

  function refresh(){
    Bonds.settleAll();
    Dashboard.renderAll();
    renderProducts();
  }

  function deleteSelected(){
    const ids = ProductList.getSelected();
    if (!ids.length){ alert('Выберите продукты для удаления'); return; }
    if (!confirm(`Удалить выбранных продуктов: ${ids.length}?`)) return;
    Storage.remove(ids);
    ProductList.clearSelection();
    refresh();
  }

  function bootstrapData(){
    if (Storage.hasData()) return;
    if (!Storage.loadFromSeed()){
      console.warn('Данные не найдены и seed.js пуст — начинаем с пустого списка');
      Storage.save([]);
    }
  }

  // ===== Экспорт / Импорт / Сброс =====
  function exportData(){
    const data = JSON.stringify(Storage.all(), null, 2);
    const blob = new Blob([data], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = `finance-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(file){
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed)) throw new Error('Ожидался массив продуктов');
        Storage.replaceAll(parsed);
        refresh();
        alert(`Импортировано ${parsed.length} продуктов`);
      } catch(err){
        alert('Ошибка импорта: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function resetToSeed(){
    if (!confirm('Очистить все текущие данные и загрузить из data/seed.js?')) return;
    Storage.clear();
    if (!Storage.loadFromSeed()){
      alert('В data/seed.js нет данных (window.SEED_DATA пуст или отсутствует)');
    }
    refresh();
  }

  function init(){
    // 1. Сначала вешаем обработчики, чтобы кнопки работали в любом случае
    $('addBtn').onclick  = () => ProductEditor.open(null, App.refresh);
    $('addBtn2').onclick = () => ProductEditor.open(null, App.refresh);
    $('deleteBtn').onclick = deleteSelected;
    $('calPrev').onclick = () => Dashboard.prevMonth();
    $('calNext').onclick = () => Dashboard.nextMonth();
    $('exportBtn').onclick = exportData;
    $('resetBtn').onclick  = resetToSeed;
    $('loadCloudBtn').onclick = () => Storage.useRemote();
    $('importBtn').onclick = () => $('importFile').click();
    $('importFile').addEventListener('change', (e)=>{
      const f = e.target.files[0];
      if (f) importData(f);
      e.target.value = '';
    });

    // 2. Потом инициализируем редактор (с защитой)
    try {
      ProductEditor.init();
    } catch (e) {
      console.error('Ошибка инициализации редактора:', e);
    }

    // 3. Загружаем данные
    bootstrapData();
    refresh();

    // Кнопка обновления цен в карточках
    window.__REFRESH__ = () => refresh();

    async function refreshMoex(){
      if (!navigator.onLine || $('modalBg').classList.contains('show')) return;
      for (const p of Storage.all()) {
        if (p.type !== 'investment') continue;
        const assets = structuredClone(p.assets || []);
        let changed = false;
        for (const a of assets) {
          if (a.redeemed || (a.moexUpdatedAt && Date.now() - Date.parse(a.moexUpdatedAt) < 3600000)) continue;
          try { await MoexAPI.refreshAsset(a); changed = true; } catch { /* Сохраняем последние доступные данные. */ }
        }
        if (changed && !$('modalBg').classList.contains('show') && Storage.get(p.id) === p) {
          p.assets = assets;
          Bonds.settleProduct(p);
          Storage.upsert(p);
        }
      }
      refresh();
    }
    Storage.sync().then(() => { refresh(); refreshMoex(); });
    window.addEventListener('online', () => Storage.sync().then(refreshMoex));
    window.addEventListener('remoteData', refresh);
    setInterval(() => {
      if (!document.hidden && !$('modalBg').classList.contains('show')) { refresh(); Storage.sync(); }
    }, 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !$('modalBg').classList.contains('show')) { refresh(); Storage.sync(); }
    });
    document.addEventListener('click', e => {
      const settings = $('settingsMenu');
      if (!settings.contains(e.target)) settings.open = false;
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') $('settingsMenu').open = false; });

    // 4. Пытаемся получить ставку ЦБ (не блокируя UI)
    if (typeof MoexAPI !== 'undefined') {
      MoexAPI.keyRate().then(r => {
        if (r && r.rate){
          window.__KEY_RATE__ = r.rate;
          refresh();
        }
      }).catch(e => {
        console.warn('Ключевая ставка не загружена:', e);
      });
    } else {
      console.warn('Модуль MoexAPI не найден. Проверьте, подключен ли js/moex.js');
    }

    let resizeTimer;
    window.addEventListener('resize', ()=>{
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(()=>Dashboard.renderCharts(), 150);
    });

    // Индикатор сохранения
    window.addEventListener('dataSaved', () => {
      const el = $('saveStatus');
      if (el) {
        el.style.opacity = 1;
        clearTimeout(el._timer);
        el._timer = setTimeout(() => { el.style.opacity = 0; }, 2000);
      }
    });
    

  }

  return { init, refresh };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
window.addEventListener('load', () => App.refresh());