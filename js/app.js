/* ============================================================
   app.js — точка входа.
   ============================================================ */

const App = (() => {
  const { $ } = Utils;

  function renderProducts(){
    ProductList.render((id) => ProductEditor.open(id, App.refresh), (id) => ProductDetail.open(id, (productId) => { ProductDetail.close(); ProductEditor.open(productId, App.refresh); }));
  }

  function refresh(){
    Bonds.settleAll();
    Dashboard.renderAll();
    renderProducts();
    renderFinancialCheck();
    updateBackupStatus();
  } 
  function renderFinancialCheck(){
    const card = $('financialCheck');
    if (!card) return;
    const issues = [];
    const products = Storage.all();
    if (!products.length) issues.push({icon:'plus-circle',title:'Добавьте первый продукт',detail:'Начните со счетов, вкладов или инвестиций.'});
    const quoteProblems = [];
    products.forEach(p => {
      if (!p || !p.id || !Config.TYPES[p.type] || !Number.isFinite(Number(p.amount))){
        issues.push({icon:'alert-triangle',title:'Проверьте данные продукта',detail:'Обнаружена запись с неполными или некорректными основными данными.'});
        return;
      }
      if (p.type === 'investment') (p.assets || []).forEach(a => {
        if (a.redeemed || !a.secid || a.quoteSource === 'manual') return;
        const stamp = a.moexUpdatedAt || a.updatedAt;
        const age = stamp ? (Date.now() - Date.parse(stamp)) / 86400000 : Infinity;
        const checkSince = Date.parse(a.moexErrorSince || a.moexCheckStartedAt || a.moexAttemptAt || '');
        const checkMatured = Number.isFinite(checkSince) && Date.now() - checkSince >= 30000;
        const quoteStale = (!Number.isFinite(age) || age > 30) && checkMatured;
        // Ошибка старого запроса не должна перечёркивать свежую сохранённую цену.
        if (quoteStale){
          quoteProblems.push({name:a.shortname || a.secid, error:a.moexError || ''});
        }
      });
    });
    if (quoteProblems.length){
      const names = quoteProblems.slice(0,3).map(x => x.name).join(', ');
      const failed = quoteProblems.filter(x => x.error).length;
      issues.push({
        icon:'refresh',
        title:`Проверьте котировки: ${quoteProblems.length} бумаг`,
        detail:(failed ? `${failed} запросов завершились ошибкой. ` : 'Цена устарела или дата обновления неизвестна. ') +
          names + (quoteProblems.length > 3 ? ` и ещё ${quoteProblems.length - 3}` : '')
      });
    }
    const last = Backup.lastExport();
    const days = last ? (Date.now() - last.getTime()) / 86400000 : Infinity;
    if (days > 30) issues.push({icon:'download',title:'Создайте резервную копию',detail:last ? 'Последняя копия старше 30 дней.' : 'Данные хранятся только в этом браузере; резервная копия ещё не создавалась.'});
    const visible = issues.slice(0,3);
    if (!issues.length){
      card.hidden = true;
      card.innerHTML = '';
      return;
    }
    card.hidden = false;
    card.innerHTML = `
      <div class="financial-check-head">
        <div><h2>Состояние финансов</h2><p>Автоматическая проверка данных и резервной копии</p></div>
        <span class="financial-check-count ${issues.length ? 'needs-attention' : 'all-good'}">${issues.length ? `${issues.length} замеч.` : 'Всё в порядке'}</span>
      </div>
      ${visible.length ? visible.map(x => `<div class="financial-check-item"><span class="fc-icon">${Utils.iconSvg(x.icon,16)}</span><div><b>${Utils.escapeHtml(x.title)}</b><small>${Utils.escapeHtml(x.detail)}</small></div></div>`).join('') : '<div class="financial-check-ok">Критичных замечаний по основным данным не обнаружено.</div>'}
      ${issues.length > 3 ? `<small class="financial-check-more">И ещё ${issues.length - 3} замечаний.</small>` : ''}
      ${days > 30 ? '<button class="btn small" id="financialBackupBtn" type="button">Создать резервную копию</button>' : ''}
      ${quoteProblems.length ? `<button class="btn small" id="financialRefreshQuotesBtn" type="button">${Utils.iconSvg('refresh',15)} Повторить обновление цен</button>` : ''}
    `;
    const backupButton = $('financialBackupBtn');
    if (backupButton) backupButton.onclick = exportData;
    const refreshQuotesButton = $('financialRefreshQuotesBtn');
    if (refreshQuotesButton) refreshQuotesButton.onclick = () => {
      if (typeof window.__REFRESH_MARKET__ === 'function') window.__REFRESH_MARKET__();
    };
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
    // Новому пользователю не подставляем демо-портфель автоматически.
    // Пустая база создаётся сразу; выбор демо сохраняется отдельно.
    if (Storage.hasData()) return localStorage.getItem('fin_onboarding_choice') === 'pending';
    Storage.save([]);
    localStorage.setItem('fin_onboarding_choice', 'pending');
    return true;
  }

  function showFirstRun(){
    const card = $('welcomeCard');
    if (!card || localStorage.getItem('fin_onboarding_choice') !== 'pending') return;
    card.hidden = false;
    $('startBlankBtn').onclick = () => {
      localStorage.setItem('fin_onboarding_choice', 'blank');
      card.hidden = true;
      refresh();
    };
    $('startDemoBtn').onclick = () => {
      Storage.clear();
      if (Storage.loadFromSeed()) applySeedGoal();
      localStorage.setItem('fin_onboarding_choice', 'demo');
      card.hidden = true;
      refresh();
    };
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
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1424' : '#234e78');
    const btn = $('themeToggle');
    if (btn) btn.innerHTML = Utils.iconSvg(theme === 'dark' ? 'sun' : 'moon', 16) + (theme === 'dark' ? ' Светлая тема' : ' Тёмная тема');
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

  // ===== Ежемесячное обновление исторической доходности всех бумаг =====
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
        if (typeof VIMAPI !== 'undefined' && VIMAPI.isVimAsset(a)) {
          if (a.yieldMonth !== month) {
            try { const before = JSON.stringify(a); await VIMAPI.refreshAsset(a); if (before !== JSON.stringify(a)) changed = true; }
            catch { /* ВИМ недоступен — сохраняем последнюю подтверждённую цену */ }
          }
          continue;
        }
        if (a.quoteSource === 'manual') continue;
        if (['stock','fund','bond','metal'].includes(a.kind) && (a.yieldMonth !== month || (a.kind === 'fund' && ['VTBL','RSHL'].includes(a.secid) && !a.moexInactive))){
          try {
            const before = JSON.stringify([a.secid, a.legacySecid, a.moexInactive, a.moexStatusText, a.lastPrice, a.moexUpdatedAt, a.sixMonthBase, a.sixMonthPct, a.yieldMonth]);
            await MoexAPI.refreshSixMonth(a);
            if (before !== JSON.stringify([a.secid, a.legacySecid, a.moexInactive, a.moexStatusText, a.lastPrice, a.moexUpdatedAt, a.sixMonthBase, a.sixMonthPct, a.yieldMonth])) changed = true;
          } catch { /* Нет сети или данных MOEX — повторим при следующем заходе */ }
        }
      }
    }
    if (changed && !$('modalBg').classList.contains('show')){
      Storage.save(Storage.all());
      refresh();
    }
  }

  // ===== Экспорт / Импорт / Сброс =====
  function updateBackupStatus(){
    const el = $('backupStatus');
    if (!el || typeof Backup === 'undefined') return;
    const last = Backup.lastExport();
    el.textContent = last
      ? `Последняя копия: ${last.toLocaleString('ru-RU')}`
      : 'Резервная копия ещё не создавалась';
  }

  function exportData(){
    try {
      const data = JSON.stringify(Backup.create(), null, 2);
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
      updateBackupStatus();
      renderFinancialCheck();
    } catch(error) {
      alert('Не удалось создать резервную копию: ' + (error.message || error));
    }
  }

  // ===== Экспорт в Excel (.xls на основе HTML-таблицы) =====
  // Настоящая таблица с колонками и форматированием: открывается в Excel
  // на ПК и телефоне без настройки разделителей (в отличие от CSV).
  // Сверху — итоги: общий баланс, общий долг и чистый капитал.
  function exportExcel(){
    const esc = v => String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const stamp = new Date().toISOString().slice(0, 10);
    const list = Storage.all();
    // Итоги берём из статистики: активы, долги и чистый капитал
    // (продукты «вне бюджета» в баланс не входят — как на дашборде)
    let assets = 0, debts = 0, net = 0;
    if (typeof Stats !== 'undefined'){
      const s = Stats.aggregate();
      assets = s.assets; debts = s.debts; net = s.net;
    } else {
      const isL = t => t === 'credit_card' || t === 'loan';
      list.forEach(p => {
        if (p.offBudget || p.type === 'expense') return;
        if (isL(p.type)) debts += Number(p.amount) || 0;
        else assets += Number(p.amount) || 0;
      });
      net = assets - debts;
    }

    const num = v => `<td class="num" style="mso-number-format:'#,##0.00'">${Number(v) || 0}</td>`;
    const totalRow = (label, value) =>
      `<tr><td class="lbl">${label}</td>${num(value)}</tr>`;

    const cols = ['Тип','Название','Сумма ₽','Ставка % годовых','Начало','Окончание','Комментарий',
      'Сдаётся','Аренда ₽/мес','Ремонт %/год','Вне бюджета','Операций','Активов'];
    const typeLabels = (typeof Config !== 'undefined' && Config.TYPES) || {};
    const rows = list.map(p => `<tr>` +
      `<td>${esc(typeLabels[p.type]?.label || p.type)}</td>` +
      `<td>${esc(p.name)}</td>` +
      num(p.amount) +
      num(p.rate) +
      `<td>${esc(p.startDate || '')}</td>` +
      `<td>${esc(p.endDate || '')}</td>` +
      `<td>${esc(p.comment || '')}</td>` +
      `<td>${p.type === 'apartment' ? (p.rented ? 'да' : 'нет') : ''}</td>` +
      `<td>${p.type === 'apartment' ? (Number(p.rentPrice) || 0) : ''}</td>` +
      `<td>${p.type === 'apartment' ? (Number(p.upkeepRate) || 0) : ''}</td>` +
      `<td>${p.offBudget ? 'да' : 'нет'}</td>` +
      `<td class="num">${(p.operations || []).length}</td>` +
      `<td class="num">${(p.assets || []).length}</td>` +
      `</tr>`).join('');

    const html = '\uFEFF' +
`<!DOCTYPE html><html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
<style>
table{border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:12px}
th{background:#2563eb;color:#fff;font-weight:700;padding:6px 10px;border:1px solid #b6c4d8;text-align:center}
td{border:1px solid #d5dce6;padding:5px 10px;vertical-align:top}
td.num{text-align:right}
td.lbl{font-weight:700;background:#eef2f8}
td.tot{font-weight:700}
h2{font-family:Calibri,Arial,sans-serif;margin:0 0 10px}
h3{font-family:Calibri,Arial,sans-serif;margin:14px 0 6px;font-size:14px}
</style></head><body>
<h2>Финансы — экспорт от ${stamp}</h2>
<table>
${totalRow('Общий баланс (активы), ₽', assets)}
${totalRow('Общий долг, ₽', debts)}
${totalRow('Чистый капитал (баланс − долг), ₽', net)}
</table>
<h3>Продукты (${list.length})</h3>
<table>
<tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>
${rows}
</table>
</body></html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-export-${stamp}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(file){
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = Backup.parse(e.target.result);
        const description = parsed.legacy
          ? 'Это старая копия только со списком продуктов. Остальные разделы текущего приложения сохранятся.'
          : `Будут заменены все данные приложения: ${parsed.products.length} продуктов, кешбэк, словари и сохранённые результаты.`;
        if (!confirm(`Импорт резервной копии?\n\n${description}\n\nРекомендуется сначала скачать текущую копию.`)) return;
        const count = Backup.restore(parsed);
        refresh();
        updateBackupStatus();
        alert(`Восстановлено продуктов: ${count}`);
      } catch(err){
        alert('Импорт отменён: ' + (err.message || err));
      }
    };
    reader.onerror = () => alert('Не удалось прочитать файл резервной копии');
    reader.readAsText(file);
  }

  // Оба сброса защищены тремя последовательными предупреждениями,
  // чтобы случайно не удалить данные.
  function resetToSeed(){
    if (!confirm('Сброс к демо-данным (seed) — шаг 1 из 3\n\nВсе текущие данные будут удалены и заменены демо-примерами. Продолжить?')) return;
    if (!confirm('Сброс к демо-данным — шаг 2 из 3\n\nЕсли данные нужны, сначала сделайте экспорт (Настройки → Экспорт). Удалить всё и загрузить seed?')) return;
    if (!confirm('Сброс к демо-данным — шаг 3 из 3\n\nПоследнее предупреждение: заменить все данные демо-примерами?')) return;
    Backup.clear();
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
    Backup.clear();
    refresh();
  }

  function init(){
    // 0. Тема: светлая или тёмная (плашка настроек)
    applyTheme(currentTheme());
    $('themeToggle').onclick = () =>
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

    // Пользовательский Cloudflare Worker для запросов к публичному MOEX ISS.
    const moexProxyInput = $('moexProxyUrl');
    const moexProxyStatus = $('moexProxyStatus');
    if (moexProxyInput) moexProxyInput.value = MoexAPI.getProxyUrl();
    $('configureMoexProxyBtn').onclick = async () => {
      const raw = moexProxyInput ? moexProxyInput.value.trim() : '';
      if (!raw) {
        localStorage.removeItem('moex_proxy_url');
        if (moexProxyStatus) moexProxyStatus.textContent = 'Собственный Worker отключён. Используются прямой ISS и резервные каналы.';
        if (window.__REFRESH_MARKET__) window.__REFRESH_MARKET__();
        return;
      }
      const proxy = MoexAPI.normalizeProxyUrl(raw);
      if (!proxy) {
        if (moexProxyStatus) moexProxyStatus.textContent = 'Нужен корректный HTTPS-адрес Worker без пути и параметров.';
        return;
      }
      const button = $('configureMoexProxyBtn');
      button.disabled = true;
      if (moexProxyStatus) moexProxyStatus.textContent = 'Проверяем соединение с Worker и MOEX…';
      try {
        const result = await MoexAPI.testProxy(proxy);
        localStorage.setItem('moex_proxy_url', proxy);
        moexProxyInput.value = proxy;
        if (moexProxyStatus) moexProxyStatus.textContent =
          'Подключено. MOEX отвечает через Worker; строк в ответе: ' + result.rows + '.';
        if (window.__REFRESH_MARKET__) window.__REFRESH_MARKET__();
      } catch (error) {
        if (moexProxyStatus) moexProxyStatus.textContent =
          'Проверка не пройдена: ' + String(error?.message || error).slice(0, 220);
      } finally {
        button.disabled = false;
      }
    };
    if (window.matchMedia){
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      (mq.addEventListener ? mq.addEventListener.bind(mq) : mq.addListener.bind(mq))('change', () => {
        if (!localStorage.getItem('fin_theme')){ applyTheme(currentTheme()); afterThemeChange(); }
      });
    }

    // 1. Сначала вешаем обработчики, чтобы кнопки работали в любом случае
    $('addBtn').onclick  = () => {
      if (localStorage.getItem('fin_mode') === 'cashback' && window.Cashback) window.Cashback.openAdd();
      else ProductEditor.open(null, App.refresh);
    };
    $('addBtn2').onclick = () => ProductEditor.open(null, App.refresh);
    $('deleteBtn').onclick = deleteSelected;
    $('calPrev').onclick = () => Dashboard.prevMonth();
    $('calNext').onclick = () => Dashboard.nextMonth();
    $('exportBtn').onclick = exportData;
    $('exportExcelBtn').onclick = exportExcel;
    $('resetBtn').onclick  = resetToSeed;
    $('resetZeroBtn').onclick = resetToZero;
    $('createGoalBtn').onclick = () => GoalBar.createOrEdit();
    $('cbBanksBtn').onclick = () => { if (window.Cashback) window.Cashback.openDict(); };
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

    if (typeof ProductInsights !== 'undefined') ProductInsights.init();
    if (typeof ProductDetail !== 'undefined') ProductDetail.init();

    // 3. Загружаем данные
    const firstRun = bootstrapData();
    refresh();
    if (firstRun) showFirstRun();

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
        $('addBtn').hidden = false;
        $('addBtn').querySelector('span').textContent = isCb ? 'Добавить кешбэк' : 'Добавить продукт';
        $('cbBanksBtn').hidden = true;
        document.querySelectorAll('[data-mobile-nav]').forEach(button => {
          const activeTarget = isCb ? 'cashback'
            : (window.__MOBILE_NAV_TARGET__ === 'portfolio' ? 'portfolio' : 'overview');
          const active = button.dataset.mobileNav === activeTarget;
          button.classList.toggle('active', active);
          if (active) button.setAttribute('aria-current','page');
          else button.removeAttribute('aria-current');
        });
        if (isCb){ if (window.Cashback) window.Cashback.render(); }
        else App.refresh();
      };
      $('tabMain').onclick = () => { window.__MOBILE_NAV_TARGET__ = 'overview'; switchMode('main'); };
      $('tabCashback').onclick = () => switchMode('cashback');
      document.querySelectorAll('[data-mobile-nav]').forEach(button => {
        button.onclick = () => {
          const target = button.dataset.mobileNav;
          if (target === 'cashback') { switchMode('cashback'); window.scrollTo({top:0,behavior:'smooth'}); return; }
          window.__MOBILE_NAV_TARGET__ = target;
          switchMode('main');
          const destination = target === 'portfolio' ? $('portfolioSection') : $('stats');
          destination?.scrollIntoView({behavior:'smooth',block:'start'});
        };
      });
      switchMode(localStorage.getItem('fin_mode') === 'cashback' ? 'cashback' : 'main');
    }
    if (window.Cashback && typeof window.Cashback.init === 'function') window.Cashback.init();

    // Кнопка обновления цен в карточках
    window.__REFRESH__ = () => refresh();

    async function refreshMoex(){
      if (!navigator.onLine || $('modalBg').classList.contains('show')) return;
      let anyChanged = false;
      for (const p of Storage.all()) {
        if (p.type !== 'investment') continue;
        const assets = structuredClone(p.assets || []);
        let changed = false;
        // Небольшие параллельные пачки ускоряют большие портфели,
        // не создавая десятки одновременных запросов к публичному ISS.
        for (let i = 0; i < assets.length; i += 4) {
          await Promise.all(assets.slice(i, i + 4).map(async a => {
            if (a.redeemed) return;
            const now = Date.now();
            if (typeof VIMAPI !== 'undefined' && VIMAPI.isVimAsset(a)) {
              const updated = Date.parse(a.vimFetchedAt || '');
              const attempted = Date.parse(a.vimAttemptAt || '');
              if (Number.isFinite(updated) && now - updated < 12 * 60 * 60 * 1000) return;
              if (Number.isFinite(attempted) && now - attempted < 30 * 60 * 1000) return;
              const before = JSON.stringify(a);
              try { await VIMAPI.refreshAsset(a); a.vimError = null; }
              catch (error) { a.vimError = String(error?.message || 'Ошибка запроса ВИМ').slice(0,180); }
              a.vimAttemptAt = new Date().toISOString();
              if (before !== JSON.stringify(a)) changed = true;
              return;
            }
            const updatedAt = Date.parse(a.moexUpdatedAt || '');
            const attemptedAt = Date.parse(a.moexAttemptAt || '');
            // Цена младше 30 дней остаётся пригодной для баланса. Ошибка
            // более позднего запроса не должна перекрывать сохранённую котировку.
            const quoteUsable = Number.isFinite(updatedAt) && now - updatedAt < 30 * 86400000;
            if (quoteUsable && (a.moexError || a.moexErrorSince)){
              a.moexError = null;
              a.moexErrorSince = null;
              changed = true;
            }
            // Публичный ISS обновляется с задержкой: не опрашиваем чаще 15 минут.
            if (Number.isFinite(updatedAt) && now - updatedAt < 15 * 60 * 1000){
              if (a.moexCheckStartedAt){ a.moexCheckStartedAt = null; changed = true; }
              return;
            }
            if (Number.isFinite(attemptedAt) && now - attemptedAt < (a.moexError ? 5 : 1) * 60 * 1000) return;
            const before = JSON.stringify(a);
            const attemptStartedAt = Date.now();
            a.moexCheckStartedAt = new Date(attemptStartedAt).toISOString();
            try {
              const previousQuoteAt = a.moexUpdatedAt || null;
              await MoexAPI.refreshAsset(a);
              const quoteAt = Date.parse(a.moexUpdatedAt || '');
              const quoteIsFresh = Number.isFinite(quoteAt) && Date.now() - quoteAt < 30 * 86400000;
              if (quoteIsFresh){
                a.moexError = null;
                a.moexErrorSince = null;
              } else if (!a.moexError && !previousQuoteAt){
                // ISS может успешно ответить без LAST (например, нет сделок).
                // Это не HTTP-ошибка, но и цену покупки не выдаём за котировку.
                a.moexQuoteStatus = 'MOEX ответил, но актуальная цена пока недоступна';
              }
            } catch (error) {
              a.moexError = String(error?.message || 'Ошибка запроса MOEX').slice(0, 180);
              if (!a.moexErrorSince) a.moexErrorSince = new Date(attemptStartedAt).toISOString();
              const delay = Math.max(0, 30000 - (Date.now() - attemptStartedAt));
              setTimeout(() => renderFinancialCheck(), delay);
            }
            a.moexAttemptAt = new Date().toISOString();
            if (before !== JSON.stringify(a)) changed = true;
          }));
        }
        if (changed && !$('modalBg').classList.contains('show') && Storage.get(p.id) === p) {
          p.assets = assets;
          Bonds.settleProduct(p);
          Storage.upsert(p);
          anyChanged = true;
        }
      }
      // Не перерисовываем приложение, если котировки фактически не изменились.
      if (anyChanged) refresh();
    }
    // Котировки и доходность обновляются независимо от хранилища: GitHub Pages — статический хостинг.
    let marketRefreshPromise = null;
    const refreshMarketData = () => {
      if (marketRefreshPromise) return marketRefreshPromise;
      marketRefreshPromise = (async () => {
        await refreshMoex();
        await refreshMonthlyYields();
      })().finally(() => { marketRefreshPromise = null; });
      return marketRefreshPromise;
    };
    window.__REFRESH_MARKET__ = refreshMarketData;
    refreshMarketData();
    window.addEventListener('online', refreshMarketData);
    setInterval(() => {
      if (!document.hidden && !$('modalBg').classList.contains('show')) { refresh(); refreshMarketData(); }
    }, 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !$('modalBg').classList.contains('show')) { refresh(); refreshMarketData(); }
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

