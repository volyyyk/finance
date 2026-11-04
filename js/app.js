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

  // Демо-цель из seed.js ставится, только если своей цели ещё нет
  function applySeedGoal(){
    if (window.SEED_GOAL && window.SEED_GOAL.amount > 0 && !localStorage.getItem('fin_goal')){
      localStorage.setItem('fin_goal', JSON.stringify({
        name: window.SEED_GOAL.name || '',
        amount: window.SEED_GOAL.amount, createdAt: new Date().toISOString()
      }));
    }
  }

  function bootstrapData(){
    if (Storage.hasData()) return;
    if (!Storage.loadFromSeed()){
      console.warn('Данные не найдены и seed.js пуст — начинаем с пустого списка');
      Storage.save([]);
    } else {
      applySeedGoal();
    }
  }

  // ===== Тёмная тема =====
  function currentTheme(){
    const saved = localStorage.getItem('fin_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function applyTheme(theme){
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1424' : '#2563eb');
    const btn = $('themeToggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️ Светлая тема' : '🌙 Тёмная тема';
  }
  function afterThemeChange(){
    // Цвета графиков кэшируются по CSS-переменным — при смене темы кэш сбрасывается
    if (typeof Charts !== 'undefined' && Charts.resetThemeCache) Charts.resetThemeCache();
    Dashboard.renderCharts();
    const rd = $('resultsDetails');
    if (rd && rd.open && typeof Results !== 'undefined') Results.render();
  }
  function setTheme(theme){
    localStorage.setItem('fin_theme', theme);
    applyTheme(theme);
    afterThemeChange();
  }

  // ===== Ежемесячное обновление доходности фондов и металлов =====
  // Изменение цены за полгода пересчитывается не чаще 1 раза в месяц:
  // если в этом месяце обновления не было — обновляем, если было — не трогаем.
  async function refreshMonthlyYields(){
    if (typeof MoexAPI === 'undefined' || !navigator.onLine) return;
    const month = MoexAPI.monthKey();
    let changed = false;
    for (const p of Storage.all()){
      if (p.type !== 'investment' || !Array.isArray(p.assets)) continue;
      for (const a of p.assets){
        if (a.redeemed) continue;
        if ((a.kind === 'fund' || a.kind === 'metal') && a.yieldMonth !== month){
          try { await MoexAPI.refreshSixMonth(a); changed = true; }
          catch { /* Нет сети или данных MOEX — обновим при следующем заходе */ }
        }
      }
    }
    if (changed && !$('modalBg').classList.contains('show')){
      Storage.save(Storage.all());
      refresh();
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

  // Оба сброса защищены тремя последовательными предупреждениями,
  // чтобы случайно не удалить данные.
  function resetToSeed(){
    if (!confirm('Сброс к демо-данным (seed) — шаг 1 из 3\n\nВсе текущие данные будут удалены и заменены демо-примерами. Продолжить?')) return;
    if (!confirm('Сброс к демо-данным — шаг 2 из 3\n\nЕсли данные нужны, сначала сделайте экспорт (Настройки → Экспорт). Удалить всё и загрузить seed?')) return;
    if (!confirm('Сброс к демо-данным — шаг 3 из 3\n\nПоследнее предупреждение: заменить все данные демо-примерами?')) return;
    Storage.clear();
    localStorage.removeItem('fin_goal');
    if (!Storage.loadFromSeed()){
      alert('В data/seed.js нет данных (window.SEED_DATA пуст или отсутствует)');
    } else {
      applySeedGoal();
    }
    refresh();
  }

  function resetToZero(){
    if (!confirm('Полный сброс — шаг 1 из 3\n\nБудут удалены ВСЕ данные, включая цель. Продолжить?')) return;
    if (!confirm('Полный сброс — шаг 2 из 3\n\nЭто действие нельзя отменить. Если данные нужны, сначала сделайте экспорт. Удалить всё?')) return;
    if (!confirm('Полный сброс — шаг 3 из 3\n\nПоследнее предупреждение: удалить все данные без возможности восстановления?')) return;
    localStorage.removeItem('fin_goal');
    Storage.clear();
    refresh();
  }

  function init(){
    // 0. Тема: светлая или тёмная (плашка настроек)
    applyTheme(currentTheme());
    $('themeToggle').onclick = () =>
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    if (window.matchMedia){
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      (mq.addEventListener ? mq.addEventListener.bind(mq) : mq.addListener.bind(mq))('change', () => {
        if (!localStorage.getItem('fin_theme')){ applyTheme(currentTheme()); afterThemeChange(); }
      });
    }

    // 1. Сначала вешаем обработчики, чтобы кнопки работали в любом случае
    $('addBtn').onclick  = () => ProductEditor.open(null, App.refresh);
    $('addBtn2').onclick = () => ProductEditor.open(null, App.refresh);
    $('deleteBtn').onclick = deleteSelected;
    $('calPrev').onclick = () => Dashboard.prevMonth();
    $('calNext').onclick = () => Dashboard.nextMonth();
    $('exportBtn').onclick = exportData;
    $('resetBtn').onclick  = resetToSeed;
    $('resetZeroBtn').onclick = resetToZero;
    $('createGoalBtn').onclick = () => GoalBar.createOrEdit();
    $('cbBanksBtn').onclick = () => { if (window.Cashback) window.Cashback.openDict(); };
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

    // Уведомления: недельная сверка расходов и скорые списания
    if (typeof Notify !== 'undefined') Notify.init();

    // Зафиксированные результаты
    if (typeof Results !== 'undefined') Results.init();

    // Переключение режимов: Учёт / Кешбэк
    const main = $('modeMain'), cbMode = $('modeCashback');
    if (main && cbMode){
      const switchMode = (mode) => {
        const isCb = mode === 'cashback';
        localStorage.setItem('fin_mode', isCb ? 'cashback' : 'main');
        main.hidden = isCb; cbMode.hidden = !isCb;
        $('tabMain').classList.toggle('active', !isCb);
        $('tabCashback').classList.toggle('active', isCb);
        $('addBtn').hidden = isCb;
        $('cbBanksBtn').hidden = !isCb;
        if (isCb){ if (window.Cashback) window.Cashback.render(); }
        else App.refresh();
      };
      $('tabMain').onclick = () => switchMode('main');
      $('tabCashback').onclick = () => switchMode('cashback');
      switchMode(localStorage.getItem('fin_mode') === 'cashback' ? 'cashback' : 'main');
    }
    if (window.Cashback && typeof window.Cashback.init === 'function') window.Cashback.init();

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
    Storage.sync().then(() => { refresh(); refreshMoex(); refreshMonthlyYields(); });
    window.addEventListener('online', () => Storage.sync().then(() => { refreshMoex(); refreshMonthlyYields(); }));
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
      resizeTimer = setTimeout(()=>{
        Dashboard.renderCharts();
        const rd = $('resultsDetails');
        if (rd && rd.open && typeof Results !== 'undefined') Results.render();
      }, 150);
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
