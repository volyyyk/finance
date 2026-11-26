/* ============================================================
   editor.js — ProductEditor
   Зависит: Config, Utils, Storage, MoexAPI
   ============================================================ */

const ProductEditor = (() => {
  const { $, uid, fmtDate, fmtMoney, escapeHtml } = Utils;
  let onSaved = null;
  let editingId = null;
  let draftOps = [];
  let draftEndActions = [];
  let draftAssets = [];
  let pendingAsset = null;
  let searchResults = [];
  let previousFocus;
  let wizardMode = false;
  let wizardStep = 1;

  // Подходит ли бумага выбранному виду актива.
  // Российские биржевые фонды приходят с MOEX с type «exchange_ppif»
  // (БПИФ), старые ETF — «etf», поэтому фильтр фондов шире, чем «fund».
  function typeMatches(t, kind){
    const s = (t || '').toLowerCase();
    if (kind === 'stock') return s.includes('share') || s.includes('depositary_receipt');
    if (kind === 'fund') return s.includes('ppif') || s.includes('fund') || s.includes('etf');
    return s.includes('bond');
  }

  // Быстрые кнопки драгметаллов, отфильтрованные по поисковому запросу:
  // «золот» — только золото, «SLV» — только серебро, мусор — ничего.
  const METALS = [
    ['GLDRUB_TOM', 'Золото'], ['SLVRUB_TOM', 'Серебро'],
    ['PLDRUB_TOM', 'Палладий'], ['PLTRUB_TOM', 'Платина'],
  ];
  function metalQuickList(q){
    const ql = (q || '').trim().toLowerCase();
    if (!ql) return METALS.slice();
    return METALS.filter(([secid, label]) =>
      secid.toLowerCase().includes(ql) || label.toLowerCase().includes(ql));
  }

  function init(){
    injectExtraMarkup();
    $('assetKind').addEventListener('change', () => {
      pendingAsset = null;
      $('addAssetBtn').disabled = true;
      $('searchResults').textContent = '';
      $('bondExtra').style.display = 'none';
      $('assetQty').step = $('assetKind').value === 'metal' ? '0.01' : '1';
      $('assetQty').placeholder = $('assetKind').value === 'metal' ? 'Граммы' : 'Кол-во';
    });

    const typeSel = $('f_type');
    if (typeSel) {
      typeSel.innerHTML = '';
      Object.entries(Config.TYPES).forEach(([k,v])=>{
        const o = document.createElement('option');
        o.value = k; o.textContent = v.label;
        typeSel.appendChild(o);
      });
      typeSel.addEventListener('change', updateVisibility);
    }

    const freqSel = $('op_freq');
    if (freqSel) {
      freqSel.innerHTML = '';
      Object.entries(Config.FREQUENCIES).forEach(([k,v])=>{
        const o = document.createElement('option');
        o.value = k; o.textContent = v.label;
        freqSel.appendChild(o);
      });
    }

    if ($('f_end')) $('f_end').addEventListener('change', updateVisibility);
    if ($('op_dir')) $('op_dir').addEventListener('change', updateDebtRowVisibility);
    if ($('addOpBtn')) $('addOpBtn').addEventListener('click', addOperation);
    if ($('addEndActionBtn')) $('addEndActionBtn').addEventListener('click', addEndAction);
    if ($('searchAssetBtn')) $('searchAssetBtn').addEventListener('click', searchAsset);
    if ($('addAssetBtn')) $('addAssetBtn').addEventListener('click', addAssetFromPending);
    if ($('cancelBtn')) $('cancelBtn').addEventListener('click', close);
    if ($('modalBg')) $('modalBg').addEventListener('click', e=>{ if (e.target.id==='modalBg') close(); });
    if ($('productForm')) $('productForm').addEventListener('submit', handleSubmit);

    document.addEventListener('keydown', e => {
      if (!$('modalBg').classList.contains('show')) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      const controls = [...document.querySelectorAll('.modal button, .modal input, .modal select')]
        .filter(el => !el.disabled && el.type !== 'hidden' && el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement.classList.contains('modal'))) {
        e.preventDefault(); last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    });
    document.querySelectorAll('.field').forEach(field => {
      const label = field.querySelector('label');
      const control = field.querySelector('input[id],select[id]');
      if (label && control) label.htmlFor = control.id;
    });

  }

  function injectExtraMarkup(){
    if (!$('creditCardBlock')) {
      const form = $('productForm');
      if (form) {
        const div = document.createElement('div');
        div.id = 'creditCardBlock';
        div.style.display = 'none';
        div.innerHTML = `
          <div class="row-2">
            <div class="field">
              <label>Кредитный лимит (₽)</label>
              <input type="number" id="f_limit" step="0.01" min="0">
            </div>
            <div class="field">
              <label>Льготный период до</label>
              <input type="date" id="f_gracePeriodEnd">
            </div>
          </div>`;
        const firstRow = form.querySelector('.row-2');
        if (firstRow) form.insertBefore(div, firstRow);
        else form.appendChild(div);
      }
    }

    if (!$('apartmentBlock')) {
      const form = $('productForm');
      if (form) {
        const div = document.createElement('div');
        div.id = 'apartmentBlock';
        div.style.display = 'none';
        div.innerHTML = `
          <div class="row-2">
            <div class="field">
              <label>Аренда в месяц (₽), если сдаётся</label>
              <input type="number" id="f_rentPrice" step="0.01" min="0" placeholder="60000">
            </div>
            <div class="field">
              <label>Расходы на квартиру — ремонт (% стоимости в год)</label>
              <input type="number" id="f_upkeepRate" step="0.01" min="0" placeholder="2">
            </div>
          </div>
          <div class="field">
            <label class="cb-check"><input type="checkbox" id="f_rented"> Квартира сдаётся в аренду</label>
          </div>`;
        const actions = form.querySelector('.modal-actions');
        if (actions) form.insertBefore(div, actions); else form.appendChild(div);
      }
    }

    if (!$('offBudgetBlock')) {
      const form = $('productForm');
      if (form) {
        const div = document.createElement('div');
        div.id = 'offBudgetBlock';
        div.style.display = 'none';
        div.innerHTML = `
          <div class="field">
            <label class="cb-check"><input type="checkbox" id="f_offBudget"> Не считать в текущем бюджете <span class="op-meta">(доходы и расходы учитываются)</span></label>
          </div>`;
        const actions = form.querySelector('.modal-actions');
        if (actions) form.insertBefore(div, actions); else form.appendChild(div);
      }
    }

    const endBlock = $('endActionBlock');
    if (endBlock && !$('endActionsList')) {
      endBlock.innerHTML = `
        <label>Действия при окончании (по порядку)</label>
        <div id="endActionsList"></div>
        <button type="button" class="btn small" id="addEndActionBtn"
                style="margin-top:6px">+ Добавить действие</button>`;
    }

    if (!$('investmentBlock')) {
      const form = $('productForm');
      if (form) {
        const div = document.createElement('div');
        div.id = 'investmentBlock';
        div.style.display = 'none';
        div.innerHTML = `
          <div class="ops-section">
            <h4>Активы в портфеле</h4>
            <div id="assetsList"></div>
            <div class="add-op">
              <div class="row-3">
                <input type="text" id="assetQuery" placeholder="Тикер или название">
                <select id="assetKind">
                  <option value="stock">Акция</option>
                  <option value="bond">Облигация</option>
                  <option value="fund">Фонд</option>
                  <option value="metal">Металл</option>
                </select>
                <button type="button" class="btn small" id="searchAssetBtn">Найти</button>
              </div>
              <div id="searchResults" style="margin:6px 0"></div>
              <div class="row-3">
                <input type="number" id="assetQty" step="1" min="1" placeholder="Кол-во" value="1">
                <input type="number" id="assetAvgPrice" step="0.01" min="0" placeholder="Цена покупки ₽">
                <button type="button" class="btn small" id="addAssetBtn" disabled>+ Добавить</button>
              </div>
              <div class="field asset-human-name-field">
                <label for="assetHumanName">Название актива</label>
                <input type="text" id="assetHumanName" maxlength="100" placeholder="Например: ВТБ — Ликвидность">
                <div class="op-meta">Можно оставить биржевое название или указать своё. Тикер и ISIN сохраняются отдельно.</div>
              </div>
              <div id="bondExtra" style="display:none;margin-top:8px">
                <label for="assetPurchaseDate">Дата покупки (купоны до неё не начисляются)</label>
                <input type="date" id="assetPurchaseDate">
                <p class="op-meta">Цена покупки — в рублях за одну облигацию, без НКД. Свободные деньги укажите уже после покупки. Купоны и погашение учитываются с даты добавления; суммы — до налогов и комиссий.</p>
                <div id="bondPreview" class="op-meta" role="status"></div>
              </div>
            </div>
          </div>`;
        const opsSection = form.querySelector('.ops-section');
        if (opsSection) form.insertBefore(div, opsSection);
        else form.appendChild(div);
      }
    }
    buildEditorSections();
  }

  // Прогрессивное раскрытие: сначала только поля, необходимые для создания
  // продукта. Редкие настройки и операции не исчезают, а живут в отдельных
  // раскрывающихся секциях. DOM-узлы перемещаются без пересоздания контролов,
  // поэтому их id, значения и обработчики остаются прежними.
  function buildEditorSections(){
    const form = $('productForm');
    if (!form || $('editorBasics')) return;
    const hidden = form.querySelector('#f_id');
    const makeSection = (id, title, hint, open=false) => {
      const details = document.createElement('details');
      details.className = 'editor-section';
      details.id = id;
      details.open = open;
      const summary = document.createElement('summary');
      summary.innerHTML = '<span class="editor-section-copy"><b>' + title +
        '</b><small>' + hint + '</small></span><span class="editor-chevron" aria-hidden="true">⌄</span>';
      const body = document.createElement('div');
      body.className = 'editor-section-body';
      details.append(summary, body);
      return { details, body };
    };
    const basics = makeSection('editorBasics','Основное','Тип, название и сумма',true);
    const conditions = makeSection('editorConditions','Условия и доходность','Ставка, даты и дополнительные параметры');
    const activity = makeSection('editorActivity','Операции и состав','Пополнения, снятия, активы и действия при окончании');
    const take = (selector, target) => {
      const node = form.querySelector(selector);
      if (!node) return;
      const controlFields = ['#f_type','#f_name','#f_amount','#f_rate','#f_start','#f_comment'];
      const movable = controlFields.includes(selector) ? (node.closest('.field') || node) : node;
      target.appendChild(movable);
    };
    const field = selector => {
      const node = form.querySelector(selector);
      return node ? (node.closest('.field') || node) : null;
    };
    if (hidden) hidden.after(basics.details, conditions.details, activity.details);
    take('#f_type', basics.body);
    take('#f_name', basics.body);
    take('#f_amount', basics.body);
    take('#f_rate', conditions.body);
    take('#f_start', conditions.body);
    take('#field_end', conditions.body);
    take('#endActionBlock', activity.body);
    take('#f_comment', conditions.body);
    ['#creditCardBlock','#apartmentBlock','#offBudgetBlock'].forEach(sel => take(sel, conditions.body));
    take('#investmentBlock', activity.body);
    const operationsSection = form.querySelector(':scope > .ops-section');
    if (operationsSection) activity.body.appendChild(operationsSection);
    const wizard = document.createElement('div');
    wizard.id = 'productWizard';
    wizard.className = 'product-wizard';
    wizard.innerHTML = `
      <div class="wizard-progress"><span data-wiz-progress="1"></span><span data-wiz-progress="2"></span><span data-wiz-progress="3"></span><span data-wiz-progress="4"></span></div>
      <div class="wizard-step-label" id="wizardStepLabel">Шаг 1 из 4 · Выберите категорию</div>
      <div class="wizard-type-grid" id="wizardTypeGrid"></div>
      <div class="wizard-actions" id="wizardActions">
        <button type="button" class="btn" id="wizardBack" hidden>Назад</button>
        <span></span><button type="button" class="btn primary" id="wizardNext">Продолжить</button>
      </div>`;
    if (hidden) hidden.after(wizard);
    wizard.querySelector('#wizardBack').onclick = () => setWizardStep(wizardStep - 1);
    wizard.querySelector('#wizardNext').onclick = () => {
      if (wizardStep < 4) setWizardStep(wizardStep + 1);
      else {
        ['editorBasics','editorConditions','editorActivity'].forEach(id => { const x=$(id); if(x) x.open=true; });
        $('productForm').requestSubmit();
      }
    };
    wizard.querySelector('#wizardTypeGrid').innerHTML = Object.entries(Config.TYPES).map(([key,t]) =>
      `<button type="button" class="wizard-type-card" data-wiz-type="${key}">
        <span class="wizard-type-icon">${Utils.iconSvg(t.icon,20)}</span><b>${t.label}</b>
        <small>${key==='deposit'?'Сбережения и проценты':key==='investment'?'Брокерский счёт и активы':key==='debit_card'?'Деньги на карте или счёте':key==='credit_card'?'Лимит и задолженность':key==='loan'?'Кредит и выплаты':key==='apartment'?'Стоимость и аренда':'Регулярные платежи'}</small>
      </button>`).join('');
    wizard.querySelectorAll('[data-wiz-type]').forEach(btn => btn.onclick = () => {
      $('f_type').value = btn.dataset.wizType;
      updateVisibility();
      wizard.querySelectorAll('.wizard-type-card').forEach(x => x.classList.toggle('selected', x === btn));
      setWizardStep(2);
    });
    $('f_type').closest('.field').classList.add('wizard-type-select');
    const preview = document.createElement('div');
    preview.id = 'productEffectPreview';
    preview.className = 'product-effect-preview';
    preview.setAttribute('aria-live','polite');
    preview.innerHTML = '<span>Ожидаемый эффект за год</span><b id="effectMoney">—</b><small id="effectPercent">Укажите сумму и ставку</small>';
    const amountField = $('f_amount')?.closest('.field');
    if (amountField) amountField.after(preview);
    ['f_amount','f_rate','f_rentPrice','f_upkeepRate','f_rented','f_type'].forEach(id => {
      const input = $(id);
      if (input) { input.addEventListener('input', renderEffectPreview); input.addEventListener('change', renderEffectPreview); }
    });
    const note = document.createElement('p');
    note.className = 'editor-footnote';
    note.textContent = 'Дополнительные параметры можно раскрыть ниже. Ничего важного не удалено.';
    basics.body.appendChild(note);
  }

  function setWizardStep(step){
    wizardStep = Math.max(1, Math.min(4, step));
    const labels = ['Выберите категорию','Основные данные','Условия и доходность','Операции и состав'];
    const wizard = $('productWizard');
    if (!wizard) return;
    $('wizardStepLabel').textContent = `Шаг ${wizardStep} из 4 · ${labels[wizardStep-1]}`;
    $('wizardTypeGrid').hidden = wizardStep !== 1;
    $('editorBasics').hidden = wizardStep !== 2;
    $('editorConditions').hidden = wizardStep !== 3;
    $('editorActivity').hidden = wizardStep !== 4;
    $('editorBasics').open = wizardStep === 2;
    $('editorConditions').open = wizardStep === 3;
    $('editorActivity').open = wizardStep === 4;
    $('wizardBack').hidden = wizardStep === 1;
    $('wizardNext').textContent = wizardStep === 4 ? 'Сохранить продукт' : 'Продолжить';
    $('wizardTypeGrid').querySelectorAll('[data-wiz-type]').forEach(btn =>
      btn.classList.toggle('selected', btn.dataset.wizType === $('f_type').value));
    wizard.querySelectorAll('[data-wiz-progress]').forEach((bar,i) => bar.classList.toggle('done', i < wizardStep));
    const typeField = $('f_type')?.closest('.field');
    if (typeField) typeField.hidden = wizardMode;
    const note = document.querySelector('.editor-footnote'); if (note) note.hidden = wizardMode;
    const actions = $('productForm').querySelector('.modal-actions'); if (actions) actions.hidden = wizardMode;
  }
  function setWizard(enabled){
    wizardMode = enabled;
    const wizard = $('productWizard'); if (wizard) wizard.hidden = !enabled;
    if (enabled) setWizardStep(1);
    else {
      ['editorBasics','editorConditions','editorActivity'].forEach(id => {
        const el = $(id); if (el) { el.hidden = false; el.open = id === 'editorBasics'; }
      });
      const typeField = $('f_type')?.closest('.field'); if (typeField) typeField.hidden = false;
      const note = document.querySelector('.editor-footnote'); if (note) note.hidden = false;
      const actions = $('productForm').querySelector('.modal-actions'); if (actions) actions.hidden = false;
    }
  }
  function renderEffectPreview(){
    const money = $('effectMoney'), pct = $('effectPercent'); if (!money || !pct) return;
    const type = $('f_type')?.value || 'deposit';
    const amount = Number($('f_amount')?.value) || 0;
    const rate = Number($('f_rate')?.value) || 0;
    let annual = amount * rate / 100;
    if (type === 'expense') annual = -amount * 12;
    if (type === 'credit_card' || type === 'loan') annual = -Math.abs(annual);
    if (type === 'apartment') annual = amount * rate / 100
      + ($('f_rented')?.checked ? (Number($('f_rentPrice')?.value)||0)*12 : 0)
      - amount * (Number($('f_upkeepRate')?.value)||2) / 100;
    let baseValue = amount;
    if (type === 'investment'){
      const assets = draftAssets.length ? draftAssets : (editingId ? (Storage.get(editingId)?.assets || []) : []);
      const previewProduct = { id:'investment-preview', type:'investment', amount, assets, operations:[] };
      const year = Simulator.simulateProduct(previewProduct, 12).history[12];
      annual = year ? (year.cumIncome || 0) - (year.cumExpense || 0) : 0;
      baseValue = Simulator.portfolioValue(previewProduct);
    }
    const pctValue = baseValue > 0 ? annual / baseValue * 100 : 0;
    money.textContent = (annual >= 0 ? '+' : '−') + Utils.fmtMoney(Math.abs(annual));
    money.className = annual >= 0 ? 'green' : 'red';
    pct.textContent = baseValue > 0 ? `${pctValue >= 0 ? '+' : ''}${pctValue.toFixed(2)}% от всего портфеля · сценарий по данным за 6 мес., не гарантия` : 'Укажите сумму или добавьте активы';
  }

  function updateVisibility(){
    const typeEl = $('f_type');
    if (!typeEl) return;
    const type = typeEl.value;
    const t = Config.TYPES[type] || {};
    const hasEnd = t.hasEnd;
    const isExpense = type === 'expense';
    const isInvest = type === 'investment';
    const isCredit = type === 'credit_card';
    const isApartment = type === 'apartment';
    // «Вне бюджета»: дебетовая карта, инвестиции и квартира не участвуют
    // в текущем балансе, но их доходы и расходы учитываются в статистике.
    const canOffBudget = type === 'debit_card' || isInvest || isApartment;

    if ($('creditCardBlock')) $('creditCardBlock').style.display = isCredit ? '' : 'none';
    if ($('apartmentBlock')) $('apartmentBlock').style.display = isApartment ? '' : 'none';
    if ($('offBudgetBlock')) $('offBudgetBlock').style.display = canOffBudget ? '' : 'none';
    if ($('field_end')) $('field_end').style.display = hasEnd ? '' : 'none';
    if ($('endActionBlock')) {
      const hasEndDate = $('f_end') && $('f_end').value;
      $('endActionBlock').style.display = (hasEnd && hasEndDate) ? '' : 'none';
    }
    if ($('investmentBlock')) $('investmentBlock').style.display = isInvest ? '' : 'none';

    if ($('label_amount')) {
      $('label_amount').textContent = isExpense
        ? 'Сумма в месяц (₽)'
        : isCredit ? 'Долг на текущий день (₽)'
        : isInvest   ? 'Свободные деньги (кэш) (₽)'
        : isApartment ? 'Стоимость квартиры (₽)'
        : t.liability ? 'Текущий долг (₽)'
        : 'Текущая сумма (₽)';
    }
    if ($('f_rate')) {
      $('f_rate').required = !isExpense;
      if ($('f_rate').parentElement) {
        $('f_rate').parentElement.style.display = isExpense ? 'none' : '';
        const label = $('f_rate').parentElement.querySelector('label');
        if (label) {
          label.textContent = isCredit ? 'Ставка по долгу (% годовых)'
            : isInvest ? 'Ожидаемый рост акций (% годовых)'
            : isApartment ? 'Рост стоимости квартиры (% в год)'
            : 'Ставка (% годовых)';
        }
      }
      if (isApartment && !$('f_rate').value) {
        $('f_rate').value = 8;
        $('f_rate').placeholder = '8';
      }
    }
  }

  function open(id, savedCb){
    previousFocus = document.activeElement;
    onSaved = savedCb;
    editingId = id || null;
    draftOps = [];
    draftEndActions = [];
    draftAssets = [];
    pendingAsset = null;
    searchResults = [];
    $('addAssetBtn').disabled = true;
    $('searchResults').textContent = '';
    $('bondExtra').style.display = 'none';
    if ($('productForm')) $('productForm').reset();
    populateDebtTargets();

    if (id){
      setWizard(false);
      const p = Storage.get(id);
      if (!p){ close(); return; }
      if ($('modalTitle')) $('modalTitle').textContent = 'Редактировать продукт';
      if ($('f_id')) $('f_id').value = p.id;
      if ($('f_type')) $('f_type').value = p.type;
      if ($('f_name')) $('f_name').value = p.name;
      if ($('f_amount')) $('f_amount').value = p.amount ?? 0;
      if ($('f_rate')) $('f_rate').value = p.rate ?? 0;
      if ($('f_start')) $('f_start').value = p.startDate || '';
      if ($('f_end')) $('f_end').value = p.endDate || '';
      if ($('f_comment')) $('f_comment').value = p.comment || '';
      if ($('f_limit')) $('f_limit').value = p.limit ?? 0;
      if ($('f_gracePeriodEnd')) $('f_gracePeriodEnd').value = p.gracePeriodEndDate || '';
      if ($('f_rented')) $('f_rented').checked = p.rented === true;
      if ($('f_rentPrice')) $('f_rentPrice').value = p.rentPrice ?? '';
      if ($('f_upkeepRate')) $('f_upkeepRate').value = p.upkeepRate ?? '';
      if ($('f_offBudget')) $('f_offBudget').checked = p.offBudget === true;
      draftOps = (p.operations || []).map(o => ({...o}));
      draftEndActions = Array.isArray(p.endActions)
        ? p.endActions.map(a => ({...a}))
        : (p.endAction ? [p.endAction] : []);
      draftAssets = structuredClone(p.assets || []);
    } else {
      if ($('modalTitle')) $('modalTitle').textContent = 'Новый продукт';
      if ($('f_id')) $('f_id').value = '';
      if ($('f_start')) $('f_start').value = new Date().toISOString().slice(0,10);
      if ($('f_rate')) $('f_rate').value = 0;
      if ($('f_end')) $('f_end').value = '';
      if ($('f_limit')) $('f_limit').value = 0;
      if ($('f_gracePeriodEnd')) $('f_gracePeriodEnd').value = '';
      if ($('f_rented')) $('f_rented').checked = false;
      if ($('f_rentPrice')) $('f_rentPrice').value = '';
      if ($('f_upkeepRate')) $('f_upkeepRate').value = '';
      if ($('f_offBudget')) $('f_offBudget').checked = false;
    }

    updateVisibility();
    if (!id) setWizard(true);
    renderEffectPreview();
    renderOps();
    renderEndActions();
    renderAssets();

    if (draftAssets.length){
      refreshDraftAssetsPrices();
    }
    if ($('modalBg')) $('modalBg').classList.add('show');
    document.body.classList.add('editor-open');
    document.querySelector('.modal').focus();
  }

  async function refreshDraftAssetsPrices(){
    if (typeof MoexAPI === 'undefined') return;
    for (const a of draftAssets){
      try {
        await MoexAPI.refreshAsset(a);
      } catch(e){ /* тихо */ }
    }
    renderAssets();
  }

  // Список долгов для пометки снятия как «платёж по долгу»:
  // операция не тратит деньги, а переводит их на погашение
  // кредитки/кредита — иначе прогноз списывает платёж дважды
  // (из баланса и ещё раз держа долг прежним).
  function populateDebtTargets(){
    const sel = $('op_debtTarget');
    if (!sel) return;
    const debts = Storage.all().filter(p =>
      p.id !== editingId && Config.TYPES[p.type] &&
      Config.TYPES[p.type].liability && p.type !== 'expense');
    sel.innerHTML = '<option value="">Обычное снятие (в расход)</option>' +
      debts.map(p =>
        `<option value="${p.id}">Платёж по долгу: ${escapeHtml(p.name)}</option>`).join('');
    updateDebtRowVisibility();
  }

  function updateDebtRowVisibility(){
    const row = $('op_debtRow');
    if (!row) return;
    row.style.display = ($('op_dir') && $('op_dir').value === 'out' && $('op_debtTarget').options.length > 1)
      ? '' : 'none';
  }

  function renderOps(){
    const el = $('opsList');
    if (!el) return;
    if (!draftOps.length){
      el.innerHTML = '<div class="empty" style="padding:10px">Нет операций</div>';
      return;
    }
    el.innerHTML = draftOps.map(op=>{
      const sign = op.direction === 'in' ? `${Utils.iconSvg('arrow-down-left',14)} Пополнить` : `${Utils.iconSvg('arrow-up-right',14)} Снять`;
      const cls  = op.direction === 'in' ? 'in' : 'out';
      const fLabel = Config.FREQUENCIES[op.frequency]?.label || op.frequency;
      const endTxt = op.endDate ? ` до ${fmtDate(op.endDate)}` : '';
      const debtProduct = op.debtTargetId ? Storage.get(op.debtTargetId) : null;
      const debtTxt = debtProduct ? ` · платёж по долгу: ${debtProduct.name}` : '';
      return `<div class="op-row">
        <div class="op-dir ${cls}">${sign}</div>
        <div class="op-body">
          <div>${op.amount.toLocaleString('ru-RU')} ₽ · ${fLabel}${endTxt}</div>
          <div class="op-meta">${op.date ? 'с '+fmtDate(op.date) : ''}${debtTxt}</div>
        </div>
        <button type="button" class="op-del" data-op="${op.id}">×</button>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-op]').forEach(b=>{
      b.onclick = () => {
        draftOps = draftOps.filter(o=>o.id !== b.dataset.op);
        renderOps();
      };
    });
  }

  function addOperation(){
    const dir = $('op_dir').value;
    const amount = parseFloat($('op_amount').value);
    const freq = $('op_freq').value;
    const date = $('op_date').value;
    const endDate = $('op_endDate').value || null;
    if (!amount || amount <= 0){ alert('Укажите сумму операции'); return; }
    if (!date){ alert('Укажите дату'); return; }
    // Снятие можно пометить как платёж по долгу конкретного продукта:
    // тогда в прогнозе платёж уменьшает долг, а не «списывается» второй раз.
    const debtTargetId = dir === 'out' ? ($('op_debtTarget')?.value || null) : null;
    draftOps.push({ id: uid(), direction: dir, amount, frequency: freq, date, endDate, debtTargetId });
    $('op_amount').value = '';
    $('op_date').value = '';
    $('op_endDate').value = '';
    renderOps();
  }

  function renderEndActions(){
    const el = $('endActionsList');
    if (!el) return;
    if (!draftEndActions.length){
      el.innerHTML = '<div class="empty" style="padding:10px">Нет действий</div>';
      return;
    }
    const products = Storage.all().filter(p => p.id !== editingId);
    el.innerHTML = draftEndActions.map((a, i) => {
      let body = '';
      if (a.type === 'transfer'){
        const opts = products.map(p =>
          `<option value="${p.id}" ${a.targetId===p.id?'selected':''}>${p.name}</option>`
        ).join('');
        body = `<select data-act-target="${i}" style="margin-top:4px">
                  <option value="">— выберите —</option>${opts}</select>`;
      } else if (a.type === 'change'){
        body = `<div class="row-2" style="margin-top:4px">
          <input type="number" step="0.01" placeholder="Новая ставка %"
                 data-act-rate="${i}" value="${a.newRate ?? ''}">
          <input type="date" data-act-end="${i}" value="${a.newEndDate ?? ''}">
        </div>`;
      }
      const label = a.type === 'close' ? 'Закрыть'
                  : a.type === 'transfer' ? '↔ Перевести'
                  : 'Изменить условия';
      return `<div class="op-row" style="flex-wrap:wrap">
        <div class="op-body" style="flex:1;min-width:180px">
          <div><b>${i+1}.</b> ${label}</div>
          ${body}
        </div>
        <button type="button" class="op-del" data-act-del="${i}">×</button>
      </div>`;
    }).join('');

    el.querySelectorAll('[data-act-del]').forEach(b=>{
      b.onclick = () => {
        draftEndActions.splice(Number(b.dataset.actDel), 1);
        renderEndActions();
      };
    });
    el.querySelectorAll('[data-act-target]').forEach(sel=>{
      sel.onchange = () => {
        draftEndActions[Number(sel.dataset.actTarget)].targetId = sel.value;
      };
    });
    el.querySelectorAll('[data-act-rate]').forEach(inp=>{
      inp.oninput = () => {
        const v = parseFloat(inp.value);
        draftEndActions[Number(inp.dataset.actRate)].newRate = isNaN(v) ? null : v;
      };
    });
    el.querySelectorAll('[data-act-end]').forEach(inp=>{
      inp.onchange = () => {
        draftEndActions[Number(inp.dataset.actEnd)].newEndDate = inp.value || null;
      };
    });
  }

  function addEndAction(){
    const choice = prompt(
      'Тип действия:\n1 — Закрыть\n2 — Перевести на продукт\n3 — Изменить условия',
      '1'
    );
    if (!choice) return;
    const map = {'1':'close','2':'transfer','3':'change'};
    const type = map[choice];
    if (!type) return;
    const act = { type };
    if (type === 'transfer') act.targetId = '';
    if (type === 'change'){ act.newRate = null; act.newEndDate = null; }
    draftEndActions.push(act);
    renderEndActions();
  }

  async function searchAsset(){
    if (typeof MoexAPI === 'undefined') {
      alert('Модуль MoexAPI не загружен');
      return;
    }
    pendingAsset = null;
    $('addAssetBtn').disabled = true;
    const q = $('assetQuery').value.trim();
    if (!q) return;
    const box = $('searchResults');
    box.innerHTML = '<div class="op-meta">Идёт поиск…</div>';
    try {
      const rows = await MoexAPI.searchSecurity(q);
      const normalize = value => String(value || '').toLocaleLowerCase('ru').replace(/[ё]/g,'е').replace(/[^a-zа-я0-9]/gi,'');
      const needle = normalize(q);
      const score = row => {
        const ticker = normalize(row.secid), short = normalize(row.shortname), full = normalize(row.fullname), isin = normalize(row.isin);
        if (ticker === needle || isin === needle) return 100;
        if (short === needle || full === needle) return 90;
        if (ticker.startsWith(needle)) return 80;
        if (short.startsWith(needle) || full.startsWith(needle)) return 70;
        if (ticker.includes(needle) || short.includes(needle) || full.includes(needle) || isin.includes(needle)) return 50;
        return 0;
      };
      rows.sort((a,b) => score(b)-score(a));
      searchResults = rows;
      if (!rows.length){
        box.innerHTML = '<div class="op-meta">Ничего не найдено</div>';
        return;
      }
      const kind = $('assetKind').value;
      const filtered = rows.filter(r =>
        kind === 'metal'
          ? /^(GLD|SLV|PLD|PLT)RUB/.test(r.secid || '')
          : typeMatches(r.type, kind));

      if (kind === 'metal'){
        searchResults = filtered;
        const quickMetals = metalQuickList(q);
        let html = quickMetals.length
          ? `<div class="op-meta" style="margin-bottom:6px">Драгметаллы MOEX (цена — за грамм):</div>` +
            quickMetals
              .map(([secid,label]) => `<button type="button" class="btn small" data-metal="${secid}" style="margin:0 4px 4px 0">${label} · ${secid}</button>`)
              .join('')
          : '';
        if (filtered.length){
          html += filtered.map((r, i) =>
            `<div class="op-row" data-pick="${i}" style="cursor:pointer">
               <div class="op-body">
                 <div><b>${escapeHtml(r.shortname || r.fullname || r.secid)}</b> <span class="badge">${escapeHtml(r.secid)}</span></div>
                 ${r.fullname && r.fullname !== r.shortname ? `<div class="op-meta">${escapeHtml(r.fullname)}</div>` : ''}
                 <div class="op-meta">${escapeHtml(r.type)} · ${escapeHtml(r.primary_boardid || '')}${r.isin ? ' · ' + escapeHtml(r.isin) : ''}</div>
               </div>
             </div>`).join('');
        } else if (!quickMetals.length){
          html += '<div class="op-meta">Ничего не найдено. Попробуйте название (золото, серебро, платина, палладий) или тикер (GLD, SLV, PLD, PDD).</div>';
        }
        box.innerHTML = html;
        box.querySelectorAll('[data-metal]').forEach(btn => {
          btn.onclick = () => pickAsset({ secid: btn.dataset.metal, shortname: btn.dataset.metal, kind:'metal' });
        });
        box.querySelectorAll('[data-pick]').forEach(el => {
          el.onclick = () => pickAsset({ ...searchResults[Number(el.dataset.pick)], kind:'metal' });
        });
        return;
      }

      if (!filtered.length){
        box.innerHTML = '<div class="op-meta">Нет подходящих бумаг этого типа</div>';
        return;
      }
      searchResults = filtered;
      box.innerHTML = filtered.map((r, i) =>
        `<div class="op-row" data-pick="${i}" style="cursor:pointer">
           <div class="op-body">
             <div><b>${escapeHtml(r.shortname || r.fullname || r.secid)}</b> <span class="badge">${escapeHtml(r.secid)}</span></div>
             ${r.fullname && r.fullname !== r.shortname ? `<div class="op-meta">${escapeHtml(r.fullname)}</div>` : ''}
             <div class="op-meta">${escapeHtml(r.type)} · ${escapeHtml(r.primary_boardid || '')}${r.isin ? ' · ' + escapeHtml(r.isin) : ''}</div>
           </div>
         </div>`).join('');
      box.querySelectorAll('[data-pick]').forEach(el=>{
        el.onclick = () => pickAsset({ ...searchResults[Number(el.dataset.pick)], kind: $('assetKind').value });
      });
    } catch(e){
      box.innerHTML = `<div class="op-meta red">Ошибка: ${e.message}. Проверьте интернет.</div>`;
    }
  }

  let pickSeq = 0;
  async function pickAsset(picked){
    const kind = picked.kind || $('assetKind').value;
    const myPick = ++pickSeq;
    pendingAsset = null;
    $('addAssetBtn').disabled = true;
    const box = $('searchResults');
    const pickedName = picked.customName || picked.shortname || picked.fullname || picked.secid;
    if ($('assetHumanName')) $('assetHumanName').value = pickedName;
    box.innerHTML = `<div class="op-row"><div class="op-body">
      <b>Выбрано:</b> ${escapeHtml(pickedName)} (${escapeHtml(picked.secid)})
      ${picked.fullname && picked.fullname !== pickedName ? `<div class="op-meta">${escapeHtml(picked.fullname)}</div>` : ''}
    </div></div>`;
    if ($('bondExtra')) $('bondExtra').style.display = kind === 'bond' ? '' : 'none';
    $('assetPurchaseDate').value = Bonds.today();
    $('bondPreview').textContent = 'Загрузка данных MOEX…';
    try {
      const asset = { ...picked, isin: String(picked.isin || picked.ISIN || '').trim().toUpperCase(),
        board: kind === 'metal' ? 'CETS' : (picked.primary_boardid || (kind === 'bond' ? 'TQOB' : kind === 'fund' ? 'TQTF' : 'TQBR')), kind };
      // Проверяем допуск к обычным биржевым торгам до загрузки цены.
      // Ошибка сети тоже блокирует добавление: статус бумаги неизвестен.
      await MoexAPI.assertTradable(asset.secid, kind);
      await MoexAPI.refreshAsset(asset);
      if (myPick !== pickSeq) return;
      if (asset.moexInactive) throw new Error(asset.moexStatusText || 'Инструмент больше не торгуется');
      pendingAsset = asset;
      if (asset.lastPrice != null) $('assetAvgPrice').value = asset.lastPrice.toFixed(2);
      $('bondPreview').textContent =
        kind === 'bond'
          ? `${asset.couponDescription} · номинал ${fmtMoney(asset.nominal || 0)} · купон ${asset.couponAmount == null ? 'не объявлен' : fmtMoney(asset.couponAmount)} · ближайший ${fmtDate(asset.nextCouponDate)} · погашение ${fmtDate(asset.maturityDate)}`
          : kind === 'fund' && asset.moexInactive
          ? asset.moexStatusText
          : kind === 'fund'
          ? (asset.lastPrice != null ? `Цена пая: ${fmtMoney(asset.lastPrice)} · данные MOEX` : 'Свежая цена MOEX пока не получена; цену покупки можно указать вручную.')
          : kind === 'metal'
          ? `Цена за грамм: ${fmtMoney(asset.lastPrice || 0)} · унция: ${fmtMoney(asset.ouncePrice || 0)} · данные MOEX`
          : '';
      $('addAssetBtn').disabled = false;
    } catch (e) {
      if (myPick !== pickSeq) return;
      pendingAsset = null;
      $('addAssetBtn').disabled = true;
      $('bondPreview').textContent = 'Не удалось подтвердить, что бумага торгуется: ' + e.message + '. Добавление заблокировано. Повторите проверку позже.';
    }
  }

  async function addAssetFromPending(){
    if (!pendingAsset) return;
    const qty = Number($('assetQty').value);
    const avgPrice = Number($('assetAvgPrice').value);
    const kind = pendingAsset.kind || $('assetKind').value;
    if (!(qty > 0) || (kind !== 'metal' && !Number.isInteger(qty)) || !Number.isFinite(avgPrice) || avgPrice <= 0) {
      alert(kind === 'metal'
        ? 'Укажите вес в граммах (можно дробный) и цену покупки в рублях за грамм'
        : 'Укажите целое положительное количество и цену покупки в рублях'); return;
    }
    try {
      await MoexAPI.assertTradable(pendingAsset.secid, kind);
      if (pendingAsset.moexInactive) throw new Error('Инструмент закрыт или снят с торгов');
    } catch (error) {
      alert('Нельзя добавить бумагу: не удалось подтвердить действующий допуск к торгам. ' + error.message);
      return;
    }
    const purchaseDate = $('assetPurchaseDate').value || Bonds.today();
    if (kind === 'bond' && (purchaseDate > Bonds.today() || (pendingAsset.maturityDate && purchaseDate >= pendingAsset.maturityDate))) {
      alert('Дата покупки должна быть не позже сегодняшней даты и раньше погашения'); return;
    }
    const customName = ($('assetHumanName')?.value || '').trim();
    const asset = {
      ...pendingAsset, ...(customName ? { customName } : {}), id:uid(), qty, avgPrice,
      accountingFrom:Bonds.today(), purchaseDate,
      paidEvents:{}, redeemed:false,
    };

    draftAssets.push(asset);
    renderEffectPreview();
    pendingAsset = null;
    $('addAssetBtn').disabled = true;
    $('searchResults').innerHTML = '';
    $('assetQuery').value = '';
    $('assetAvgPrice').value = '';
    if ($('assetHumanName')) $('assetHumanName').value = '';
    renderAssets();
    renderEffectPreview();
  }

  function assetDisplayName(asset){
    return String(asset?.customName || asset?.shortname || asset?.fullname || asset?.secid || 'Актив').trim();
  }

  // Отдельная запись актива: вся подробная информация (как раньше)
  function assetDetailsHtml(a){
    const price = Bonds.price(a);
    const total = (a.qty || 0) * price;
    const nextCoupon = (a.coupons || []).find(c => c.date >= Bonds.today());
    const paid = Object.values(a.paidEvents || {}).reduce((s,p) => s + p.amount, 0);
    const kindLabel = {stock:'акция', bond:'облигация', fund:'фонд', metal:'металл'}[a.kind] || a.kind;
    const qtyTxt = a.kind === 'metal'
      ? `${a.qty} г × ${fmtMoney(price)}/г`
      : `${a.qty} шт × ${fmtMoney(price)}`;
    // Историческое изменение цены за полгода — основа сценарного прогноза
    // для акций, фондов, облигаций и металлов.
    const yieldTxt = a.moexInactive
      ? `<div class="op-meta">Фонд закрыт и не торгуется; динамика за последние 6 мес. отсутствует, рост в прогнозе не предполагается</div>`
      : a.sixMonthPct != null
      ? `<div class="op-meta">Изменение цены за 6 мес.: <b class="${a.sixMonthPct >= 0 ? 'green' : 'red'}">${Utils.fmtPct(a.sixMonthPct)}</b> · учтено в прогнозе</div>`
      : `<div class="op-meta">История цены за 6 мес. пока недоступна · рост не предполагается</div>`;
    const quoteTime = Date.parse(a.moexUpdatedAt || '');
    const quoteUsable = Number.isFinite(quoteTime) && Date.now() - quoteTime < 30 * 86400000;
    const visibleQuoteError = quoteUsable || a.moexInactive ? '' : (a.moexError || a.moexQuoteStatus || '');
    const quoteTxt = a.moexInactive
      ? `<div class="op-meta">${escapeHtml(a.moexStatusText || 'Биржевые торги прекращены; актуальной котировки MOEX нет')}</div>`
      : `<div class="op-meta">MOEX: ${a.moexUpdatedAt ? 'обновлено ' + new Date(a.moexUpdatedAt).toLocaleString('ru-RU') : 'нет подтверждённой свежей цены'}${a.board ? ' · режим ' + escapeHtml(a.board) : ''}${visibleQuoteError ? ' · ' + escapeHtml(visibleQuoteError) : ''}</div>`;
    const couponTxt = a.kind === 'bond' ? `
      <div class="op-meta">${escapeHtml(a.couponDescription || 'Тип купона не определён')} · номинал ${fmtMoney(a.nominal || 0)}
      · купон ${a.couponAmount == null ? 'не объявлен' : fmtMoney(a.couponAmount)}
      ${a.couponRate != null ? ` (${a.couponRate}% годовых)` : ''}</div>
      <div class="op-meta">Ближайший купон: ${fmtDate(nextCoupon?.date || a.nextCouponDate)}
      · погашение: ${fmtDate(a.maturityDate)}${a.redeemed ? ' · погашена' : ''}
      · зачислено: ${fmtMoney(paid)}</div>
      <div class="op-meta">Покупка: ${fmtMoney(a.avgPrice || 0)} / шт · НКД сейчас: ${fmtMoney(a.accruedInterest || 0)}</div>
      <details><summary>График выплат</summary><div class="bond-schedule">${Bonds.payments(a).map(c =>
        `<div>${fmtDate(c.date)} · ${c.type === 'coupon' ? 'Купон' : 'Основной долг'} · ${c.value == null ? 'сумма не объявлена' : fmtMoney(c.value * (a.qty || 0))}${a.paidEvents?.[c.key] ? ' · зачислено' : ''}</div>`).join('') || 'График пока недоступен'}</div></details>` : '';
    return `<div class="op-row">
      <div class="op-body">
        <div class="asset-detail-title"><b class="asset-name-track">${escapeHtml(assetDisplayName(a))}</b>
          <span class="badge">${kindLabel}</span>
          <span class="badge">${escapeHtml(a.secid)}</span>${a.legacySecid ? `<span class="badge">бывш. ${escapeHtml(a.legacySecid)}</span>` : ''}</div>
        <div class="op-meta">${qtyTxt}
          = ${fmtMoney(total)}
          ${a.lastPrice ? ' · рыночная цена' : ' · цена покупки'}</div>${yieldTxt}${quoteTxt}${couponTxt}
      </div>
      <div class="asset-detail-actions">
        <button type="button" class="btn small" data-asset-rename="${a.id}" title="Изменить отображаемое название">Переименовать</button>
        <button type="button" class="op-del" data-asset-del="${a.id}" title="Убрать этот актив из портфеля">Убрать</button>
      </div>
    </div>`;
  }

  // Шапка группы бумаг одного названия: количество, стоимость и краткие данные.
  // Для облигаций — ближайший купон и сумма купонов в этот день (красным,
  // если в этот же день облигация погашается). Для фондов — доходность.
  function assetNameGroupHtml(kind, grp){
    const first = grp[0];
    const name = assetDisplayName(first);
    const qtyTotal = grp.reduce((s,a) => s + (a.qty || 0), 0);
    const costTotal = grp.reduce((s,a) => s + (a.qty || 0) * Bonds.price(a), 0);
    const qtyTxt = kind === 'metal' ? `${qtyTotal} г` : `${qtyTotal} шт`;
    let extra = '';
    if (kind === 'bond'){
      const today = Bonds.today();
      const dates = new Set();
      grp.forEach(a => (a.coupons || []).forEach(c => {
        if (c.date >= today && !a.paidEvents?.[`coupon:${c.date}`]) dates.add(c.date);
      }));
      const nextDate = dates.size ? [...dates].sort()[0] : null;
      const closesThatDay = nextDate != null && grp.some(a => a.maturityDate === nextDate);
      const couponSum = nextDate
        ? grp.reduce((s,a) => s + (a.coupons || [])
            .filter(c => c.date === nextDate && !a.paidEvents?.[`coupon:${c.date}`])
            .reduce((x,c) => x + (c.value || 0) * (a.qty || 0), 0), 0)
        : 0;
      extra = nextDate
        ? `<span class="ag-extra${closesThatDay ? ' red' : ''}">${Utils.iconSvg('calendar',13)} ${fmtDate(nextDate)} · ${fmtMoney(couponSum)}${closesThatDay ? ' · погашение в этот день' : ''}</span>`
        : grp.every(a => a.redeemed) ? '<span class="ag-extra">погашена</span>' : '';
    } else {
      const pct = grp.map(a => a.sixMonthPct).find(p => p != null && Number.isFinite(p));
      extra = pct != null
        ? `<span class="ag-extra ${pct >= 0 ? 'green' : 'red'}">${Utils.fmtPct(pct)}/6 мес</span>`
        : '';
    }
    return `<details class="asset-item">
      <summary>
        <span class="ai-name"><b class="asset-name-track">${escapeHtml(name)}</b> <span class="badge">${escapeHtml(first.secid || '')}</span></span>
        <span class="ai-meta">${qtyTxt} · ${fmtMoney(costTotal)}</span>
        ${extra}
      </summary>
      <div class="ai-body">${grp.map(assetDetailsHtml).join('')}</div>
    </details>`;
  }

  // Активы портфеля: раскрывающиеся списки по видам (акции, облигации,
  // фонды, металлы) с итогами в шапке, внутри — группы по названию бумаги.
  // В шапке вида — число наименований бумаг, а не суммарное количество
  // штук: 200 акций Сбера + 500 акций ВТБ = 2 наименования.
  function renderAssets(){
    const el = $('assetsList');
    if (!el) return;
    if (!draftAssets.length){
      el.innerHTML = '<div class="empty" style="padding:10px">Активов нет</div>';
      return;
    }
    const KINDS = [
      ['stock', 'Акции'], ['bond', 'Облигации'], ['fund', 'Фонды'], ['metal', 'Металлы']
    ];
    el.innerHTML = KINDS.map(([kind, label]) => {
      const items = draftAssets.filter(a => a.kind === kind);
      if (!items.length) return '';
      const groups = new Map();
      items.forEach(a => {
        const key = a.secid || a.shortname || a.id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(a);
      });
      const costTotal = items.reduce((s,a) => s + (a.qty || 0) * Bonds.price(a), 0);
      const qtyTxt = `${groups.size} наимен.`;
      return `<details class="asset-group">
        <summary>
          <span class="ag-name">${label}</span>
          <span class="ag-meta">${qtyTxt} · ${fmtMoney(costTotal)}</span>
        </summary>
        <div class="ag-body">${[...groups.values()].map(grp => assetNameGroupHtml(kind, grp)).join('')}</div>
      </details>`;
    }).join('');
    el.querySelectorAll('[data-asset-del]').forEach(b=>{
      b.onclick = () => {
        draftAssets = draftAssets.filter(a => a.id !== b.dataset.assetDel);
        renderAssets();
        renderEffectPreview();
      };
    });
    el.querySelectorAll('[data-asset-rename]').forEach(b=>{
      b.onclick = () => {
        const asset = draftAssets.find(a => a.id === b.dataset.assetRename);
        if (!asset) return;
        const next = prompt('Название актива для отображения:', assetDisplayName(asset));
        if (next === null) return;
        const value = next.trim().slice(0,100);
        if (value) asset.customName = value;
        else delete asset.customName;
        renderAssets();
      };
    });
  }

  function handleSubmit(e){
    e.preventDefault();
    if (wizardMode && wizardStep !== 4) { setWizardStep(4); return; }
    const id = $('f_id').value || uid();
    const type = $('f_type').value;
    const isApartment = type === 'apartment';
    let rate = parseFloat($('f_rate').value);
    if (!Number.isFinite(rate)) rate = isApartment ? 8 : 0; // квартира по умолчанию растёт на 8%/год
    const product = {
      id, type,
      name: $('f_name').value.trim(),
      amount: parseFloat($('f_amount').value) || 0,
      rate,
      startDate: $('f_start').value || null,
      endDate: $('f_end').value || null,
      comment: $('f_comment').value.trim(),
      operations: draftOps.slice(),
    };

    if (type === 'credit_card') {
      product.limit = parseFloat($('f_limit').value) || 0;
      product.gracePeriodEndDate = $('f_gracePeriodEnd').value || null;
    }
    if (isApartment) {
      product.rented = $('f_rented') ? $('f_rented').checked : false;
      product.rentPrice = parseFloat($('f_rentPrice')?.value) || 0;
      let upkeep = parseFloat($('f_upkeepRate')?.value);
      product.upkeepRate = Number.isFinite(upkeep) ? upkeep : 2; // ремонт по умолчанию 2%/год
    }
    if (type === 'debit_card' || type === 'investment' || isApartment) {
      product.offBudget = $('f_offBudget') ? $('f_offBudget').checked === true : false;
    }
    if (type === 'investment'){
      product.assets = draftAssets.slice();
    }
    if (Config.TYPES[type].hasEnd && $('f_end').value){
      product.endActions = draftEndActions.slice();
    }

    Storage.upsert(product);
    close();
    if (onSaved) onSaved();
  }

  function close(){
    setWizard(false);
    if ($('modalBg')) $('modalBg').classList.remove('show');
    document.body.classList.remove('editor-open');
    previousFocus?.focus();
    draftOps = [];
    draftEndActions = [];
    draftAssets = [];
    pendingAsset = null;
    editingId = null;
  }

  return { init, open, close, updateVisibility, typeMatches, metalQuickList };
})();

