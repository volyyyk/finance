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

  function init(){
    injectExtraMarkup();
    $('assetKind').addEventListener('change', () => {
      pendingAsset = null;
      $('addAssetBtn').disabled = true;
      $('searchResults').textContent = '';
      $('bondExtra').style.display = 'none';
    });

    const typeSel = $('f_type');
    if (typeSel) {
      typeSel.innerHTML = '';
      Object.entries(Config.TYPES).forEach(([k,v])=>{
        const o = document.createElement('option');
        o.value = k; o.textContent = v.icon + ' ' + v.label;
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
                </select>
                <button type="button" class="btn small" id="searchAssetBtn">Найти</button>
              </div>
              <div id="searchResults" style="margin:6px 0"></div>
              <div class="row-3">
                <input type="number" id="assetQty" step="1" min="1" placeholder="Кол-во" value="1">
                <input type="number" id="assetAvgPrice" step="0.01" min="0" placeholder="Цена покупки ₽">
                <button type="button" class="btn small" id="addAssetBtn" disabled>+ Добавить</button>
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

    if ($('creditCardBlock')) $('creditCardBlock').style.display = isCredit ? '' : 'none';
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
            : 'Ставка (% годовых)';
        }
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

    if (id){
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
    }

    updateVisibility();
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

  function renderOps(){
    const el = $('opsList');
    if (!el) return;
    if (!draftOps.length){
      el.innerHTML = '<div class="empty" style="padding:10px">Нет операций</div>';
      return;
    }
    el.innerHTML = draftOps.map(op=>{
      const sign = op.direction === 'in' ? '⬇️ Пополнить' : '⬆️ Снять';
      const cls  = op.direction === 'in' ? 'in' : 'out';
      const fLabel = Config.FREQUENCIES[op.frequency]?.label || op.frequency;
      const endTxt = op.endDate ? ` до ${fmtDate(op.endDate)}` : '';
      return `<div class="op-row">
        <div class="op-dir ${cls}">${sign}</div>
        <div class="op-body">
          <div>${op.amount.toLocaleString('ru-RU')} ₽ · ${fLabel}${endTxt}</div>
          <div class="op-meta">${op.date ? 'с '+fmtDate(op.date) : ''}</div>
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
    draftOps.push({ id: uid(), direction: dir, amount, frequency: freq, date, endDate });
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
      const label = a.type === 'close' ? '🏁 Закрыть'
                  : a.type === 'transfer' ? '↔ Перевести'
                  : '✎ Изменить условия';
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
      searchResults = rows;
      if (!rows.length){
        box.innerHTML = '<div class="op-meta">Ничего не найдено</div>';
        return;
      }
      const kind = $('assetKind').value;
      const filtered = rows.filter(r => {
        const t = (r.type || '').toLowerCase();
        if (kind === 'stock') return t.includes('share') || t.includes('depositary_receipt');
        return t.includes('bond');
      });

      if (!filtered.length){
        box.innerHTML = '<div class="op-meta">Нет подходящих бумаг этого типа</div>';
        return;
      }
      searchResults = filtered;
      box.innerHTML = filtered.map((r, i) =>
        `<div class="op-row" data-pick="${i}" style="cursor:pointer">
           <div class="op-body">
             <div><b>${escapeHtml(r.shortname)}</b> <span class="badge">${escapeHtml(r.secid)}</span></div>
             <div class="op-meta">${escapeHtml(r.type)} · ${escapeHtml(r.primary_boardid || '')}</div>
           </div>
         </div>`).join('');
      box.querySelectorAll('[data-pick]').forEach(el=>{
        el.onclick = async () => {
          pendingAsset = searchResults[Number(el.dataset.pick)];
          $('addAssetBtn').disabled = true;
          const picked = pendingAsset;
          box.innerHTML = `<div class="op-row"><div class="op-body">
            <b>Выбрано:</b> ${escapeHtml(pendingAsset.shortname)} (${escapeHtml(pendingAsset.secid)})
          </div></div>`;
          if ($('bondExtra')) $('bondExtra').style.display = $('assetKind').value === 'bond' ? '' : 'none';
          $('assetPurchaseDate').value = Bonds.today();
          $('bondPreview').textContent = 'Загрузка данных MOEX…';
          try {
            const kind = $('assetKind').value;
            const asset = { ...picked, board:picked.primary_boardid || (kind === 'bond' ? 'TQOB' : 'TQBR'), kind };
            await MoexAPI.refreshAsset(asset);
            if (pendingAsset !== picked) return;
            pendingAsset = asset;
            if (asset.lastPrice != null) $('assetAvgPrice').value = asset.lastPrice.toFixed(2);
            $('bondPreview').textContent = kind === 'bond'
              ? `${asset.couponDescription} · номинал ${fmtMoney(asset.nominal || 0)} · купон ${asset.couponAmount == null ? 'не объявлен' : fmtMoney(asset.couponAmount)} · ближайший ${fmtDate(asset.nextCouponDate)} · погашение ${fmtDate(asset.maturityDate)}` : '';
            $('addAssetBtn').disabled = false;
          } catch (e) {
            if (pendingAsset !== picked) return;
            $('bondPreview').textContent = 'Не удалось загрузить данные: ' + e.message + '. Повторите поиск.';
            if ($('assetKind').value !== 'bond') $('addAssetBtn').disabled = false;
          }
        };
      });
    } catch(e){
      box.innerHTML = `<div class="op-meta red">Ошибка: ${e.message}. Проверьте интернет.</div>`;
    }
  }

  async function addAssetFromPending(){
    if (!pendingAsset) return;
    const qty = Number($('assetQty').value);
    const avgPrice = Number($('assetAvgPrice').value);
    const kind = pendingAsset.kind || $('assetKind').value;
    if (!Number.isInteger(qty) || qty <= 0 || !Number.isFinite(avgPrice) || avgPrice <= 0) {
      alert('Укажите целое положительное количество и цену покупки в рублях'); return;
    }
    const purchaseDate = $('assetPurchaseDate').value || Bonds.today();
    if (kind === 'bond' && (purchaseDate > Bonds.today() || (pendingAsset.maturityDate && purchaseDate >= pendingAsset.maturityDate))) {
      alert('Дата покупки должна быть не позже сегодняшней даты и раньше погашения'); return;
    }
    const asset = {
      ...pendingAsset, id:uid(), qty, avgPrice,
      accountingFrom:Bonds.today(), purchaseDate,
      paidEvents:{}, redeemed:false,
    };

    draftAssets.push(asset);
    pendingAsset = null;
    $('addAssetBtn').disabled = true;
    $('searchResults').innerHTML = '';
    $('assetQuery').value = '';
    $('assetAvgPrice').value = '';
    renderAssets();
  }

  function renderAssets(){
    const el = $('assetsList');
    if (!el) return;
    if (!draftAssets.length){
      el.innerHTML = '<div class="empty" style="padding:10px">Активов нет</div>';
      return;
    }
    el.innerHTML = draftAssets.map(a=>{
      const price = Bonds.price(a);
      const total = (a.qty || 0) * price;
      const nextCoupon = (a.coupons || []).find(c => c.date >= Bonds.today());
      const paid = Object.values(a.paidEvents || {}).reduce((s,p) => s + p.amount, 0);
      const couponTxt = a.kind === 'bond' ? `
        <div class="op-meta">${escapeHtml(a.couponDescription || 'Тип купона не определён')} · номинал ${fmtMoney(a.nominal || 0)}
        · купон ${a.couponAmount == null ? 'не объявлен' : fmtMoney(a.couponAmount)}
        ${a.couponRate != null ? ` (${a.couponRate}% годовых)` : ''}</div>
        <div class="op-meta">Ближайший купон: ${fmtDate(nextCoupon?.date || a.nextCouponDate)}
        · погашение: ${fmtDate(a.maturityDate)}${a.redeemed ? ' · погашена' : ''}
        · зачислено: ${fmtMoney(paid)}</div>
        <div class="op-meta">Покупка: ${fmtMoney(a.avgPrice || 0)} / шт · НКД сейчас: ${fmtMoney(a.accruedInterest || 0)}
        · обновлено: ${a.moexUpdatedAt ? new Date(a.moexUpdatedAt).toLocaleString('ru-RU') : 'нет свежих данных'}</div>
        <details><summary>График выплат</summary><div class="bond-schedule">${Bonds.payments(a).map(c =>
          `<div>${fmtDate(c.date)} · ${c.type === 'coupon' ? 'Купон' : 'Основной долг'} · ${c.value == null ? 'сумма не объявлена' : fmtMoney(c.value * (a.qty || 0))}${a.paidEvents?.[c.key] ? ' · зачислено' : ''}</div>`).join('') || 'График пока недоступен'}</div></details>` : '';
      return `<div class="op-row">
        <div class="op-body">
          <div><b>${escapeHtml(a.shortname || a.secid)}</b>
            <span class="badge">${a.kind === 'bond' ? 'облигация' : 'акция'}</span>
            <span class="badge">${escapeHtml(a.secid)}</span></div>
          <div class="op-meta">${a.qty} шт × ${fmtMoney(price)}
            = ${fmtMoney(total)}
            ${a.lastPrice ? ' · рыночная цена' : ' · цена покупки'}</div>${couponTxt}
        </div>
        <button type="button" class="op-del" data-asset-del="${a.id}">×</button>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-asset-del]').forEach(b=>{
      b.onclick = () => {
        draftAssets = draftAssets.filter(a => a.id !== b.dataset.assetDel);
        renderAssets();
      };
    });
  }

  function handleSubmit(e){
    e.preventDefault();
    const id = $('f_id').value || uid();
    const type = $('f_type').value;
    const product = {
      id, type,
      name: $('f_name').value.trim(),
      amount: parseFloat($('f_amount').value) || 0,
      rate: parseFloat($('f_rate').value) || 0,
      startDate: $('f_start').value || null,
      endDate: $('f_end').value || null,
      comment: $('f_comment').value.trim(),
      operations: draftOps.slice(),
    };

    if (type === 'credit_card') {
      product.limit = parseFloat($('f_limit').value) || 0;
      product.gracePeriodEndDate = $('f_gracePeriodEnd').value || null;
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
    if ($('modalBg')) $('modalBg').classList.remove('show');
    document.body.classList.remove('editor-open');
    previousFocus?.focus();
    draftOps = [];
    draftEndActions = [];
    draftAssets = [];
    pendingAsset = null;
    editingId = null;
  }

  return { init, open, close, updateVisibility };
})();