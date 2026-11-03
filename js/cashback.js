/* ============================================================
   cashback.js — режим «Кешбэк»: категории кешбэка банков на месяц
   Зависит: Utils (в браузере)
   Данные хранятся только за текущий месяц: при открытии
   прошлые месяцы удаляются. Чистая логика вынесена в CbLogic
   и покрывается tests/cashback.test.cjs.
   ============================================================ */

// Чистая логика без DOM и localStorage
const CbLogic = (() => {
  function monthKey(d = new Date()){
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  // Нормализация: остаётся только текущий месяц, прошлые удаляются
  function normalize(data, key){
    if (!data || data.month !== key || !Array.isArray(data.banks)) return { month: key, banks: [] };
    return { month: key, banks: data.banks };
  }
  // Лучший кешбэк по каждой категории (по всем банкам)
  function bestByCategory(banks){
    const map = new Map();
    (banks || []).forEach(b => (b.cats || []).forEach(c => {
      const name = String(c.name || '').trim();
      if (!name) return;
      const prev = map.get(name);
      if (!prev || (c.value || 0) > (prev.value || 0))
        map.set(name, { name, value: c.value || 0, catId: c.id, bankId: b.id, bankName: b.name });
    }));
    return [...map.values()]
      .sort((a,b) => (b.value - a.value) || a.name.localeCompare(b.name, 'ru'));
  }
  // Лучший кешбэк в каждом банке
  function bestByBank(banks){
    return (banks || []).map(b => {
      const best = (b.cats || []).slice()
        .sort((a,c) => (c.value || 0) - (a.value || 0))[0] || null;
      return { bankId: b.id, bankName: b.name, cat: best };
    });
  }
  return { monthKey, normalize, bestByCategory, bestByBank };
})();
if (typeof module !== 'undefined') module.exports = CbLogic;

const Cashback = typeof document !== 'undefined' ? (() => {
  const { $, uid, escapeHtml } = Utils;
  const LS = 'fin_cashback';
  const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля',
                  'августа','сентября','октября','ноября','декабря'];
  let editing = false;

  function load(){
    let data = null;
    try { data = JSON.parse(localStorage.getItem(LS) || 'null'); } catch {}
    return CbLogic.normalize(data, CbLogic.monthKey());
  }
  function save(data){ localStorage.setItem(LS, JSON.stringify(data)); }
  function mutate(fn){ const data = load(); fn(data); save(data); }

  function monthTitle(key){
    const [y, m] = key.split('-').map(Number);
    const name = MONTHS[(m || 1) - 1] || '';
    return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
  }
  function hasData(data){
    return data.banks.some(b => (b.cats || []).length);
  }

  function render(){
    const root = $('cbMonth');
    if (!root) return;
    const data = load();
    root.textContent = `Кешбэк · ${monthTitle(data.month)}`;
    $('cbView').hidden = editing;
    $('cbEdit').hidden = !editing;
    if (editing) renderEdit(data);
    else renderView(data);
  }

  // Основной вид: лучшие кешбэки по категориям и по банкам
  function renderView(data){
    const el = $('cbView');
    if (!hasData(data)){
      el.innerHTML = `
        <div class="empty">В ${monthTitle(data.month)} кешбэки ещё не добавлены.<br>Добавьте банки и категории кешбэка на этот месяц.</div>
        <div class="actions-bar">
          <button class="btn primary" id="cbStartBtn">+ Добавить кешбэк</button>
        </div>`;
      const b = $('cbStartBtn');
      if (b) b.onclick = () => { editing = true; render(); };
      return;
    }

    const byCat = CbLogic.bestByCategory(data.banks);
    const byBank = CbLogic.bestByBank(data.banks).filter(r => r.cat);
    const catRows = byCat.map(r => `
      <div class="cb-row">
        <div class="cb-cat">${escapeHtml(r.name)}</div>
        <div class="cb-best"><b>${r.value}%</b> · ${escapeHtml(r.bankName)}</div>
        <button class="op-del" data-bank="${r.bankId}" data-cat="${r.catId}" title="Убрать этот кешбэк">×</button>
      </div>`).join('');
    const bankRows = byBank.map(r => `
      <div class="cb-row">
        <div class="cb-cat">${escapeHtml(r.bankName)}</div>
        <div class="cb-best"><b>${r.cat.value}%</b> · ${escapeHtml(r.cat.name)}</div>
      </div>`).join('');
    const bankOpts = data.banks.map(b =>
      `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');

    el.innerHTML = `
      <h3>Лучшие кешбэки по категориям</h3>
      <div class="cb-list">${catRows}</div>
      <h3>Лучший кешбэк в каждом банке</h3>
      <div class="cb-list">${bankRows}</div>
      <details class="cb-quick"><summary>Быстро добавить категорию</summary>
        <div class="cb-add">
          <input type="text" id="cbQCat" placeholder="Категория">
          <input type="number" id="cbQVal" step="0.1" min="0" placeholder="%">
          <select id="cbQBank">${bankOpts}</select>
          <button class="btn small" id="cbQAdd">+</button>
        </div>
      </details>
      <div class="actions-bar">
        <button class="btn" id="cbEditBtn">✎ Редактировать</button>
      </div>`;

    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      mutate(d => {
        const bank = d.banks.find(x => x.id === b.dataset.bank);
        if (bank) bank.cats = (bank.cats || []).filter(c => c.id !== b.dataset.cat);
      });
      render();
    });
    const qAdd = $('cbQAdd');
    if (qAdd) qAdd.onclick = () => {
      const name = $('cbQCat').value.trim();
      const value = parseFloat($('cbQVal').value);
      const bankId = $('cbQBank').value;
      if (!name){ alert('Укажите категорию'); return; }
      if (!(value > 0)){ alert('Укажите процент кешбэка'); return; }
      mutate(d => {
        const bank = d.banks.find(x => x.id === bankId);
        if (bank) (bank.cats ||= []).push({ id: uid(), name, value });
      });
      render();
    };
    const editBtn = $('cbEditBtn');
    if (editBtn) editBtn.onclick = () => { editing = true; render(); };
  }

  // Редактирование: банки и их категории
  function renderEdit(data){
    const el = $('cbEdit');
    const bankBlocks = data.banks.map(b => `
      <div class="cb-bank">
        <div class="cb-bank-head">
          <input type="text" data-rename="${b.id}" value="${escapeHtml(b.name)}" title="Название банка">
          <button class="op-del" data-bankdel="${b.id}" title="Удалить банк">×</button>
        </div>
        <div class="cb-list">
          ${(b.cats || []).map(c => `
            <div class="cb-row">
              <div class="cb-cat">${escapeHtml(c.name)}</div>
              <div class="cb-best"><b>${c.value}%</b></div>
              <button class="op-del" data-catdel="${b.id}:${c.id}" title="Удалить категорию">×</button>
            </div>`).join('') || '<div class="empty">Категорий нет</div>'}
        </div>
        <div class="cb-add">
          <input type="text" data-newcat="${b.id}" placeholder="Категория">
          <input type="number" data-newval="${b.id}" step="0.1" min="0" placeholder="%">
          <button class="btn small" data-addcat="${b.id}">+</button>
        </div>
      </div>`).join('');

    el.innerHTML = `
      ${bankBlocks || '<div class="empty">Банков пока нет</div>'}
      <div class="actions-bar">
        <button class="btn" id="cbAddBank">+ Добавить банк</button>
        <button class="btn primary" id="cbDone">✓ Готово</button>
      </div>`;

    el.querySelectorAll('[data-rename]').forEach(inp => inp.onchange = () => {
      const name = inp.value.trim();
      if (!name) return;
      mutate(d => { const bank = d.banks.find(x => x.id === inp.dataset.rename); if (bank) bank.name = name; });
      render();
    });
    el.querySelectorAll('[data-bankdel]').forEach(b => b.onclick = () => {
      const bank = data.banks.find(x => x.id === b.dataset.bankdel);
      if (!confirm(`Удалить банк «${bank?.name || ''}» вместе с его кешбэками?`)) return;
      mutate(d => { d.banks = d.banks.filter(x => x.id !== b.dataset.bankdel); });
      render();
    });
    el.querySelectorAll('[data-catdel]').forEach(b => b.onclick = () => {
      const [bankId, catId] = b.dataset.catdel.split(':');
      mutate(d => {
        const bank = d.banks.find(x => x.id === bankId);
        if (bank) bank.cats = (bank.cats || []).filter(c => c.id !== catId);
      });
      render();
    });
    el.querySelectorAll('[data-addcat]').forEach(b => b.onclick = () => {
      const bankId = b.dataset.addcat;
      const name = el.querySelector(`[data-newcat="${bankId}"]`).value.trim();
      const value = parseFloat(el.querySelector(`[data-newval="${bankId}"]`).value);
      if (!name){ alert('Укажите категорию'); return; }
      if (!(value > 0)){ alert('Укажите процент кешбэка'); return; }
      mutate(d => {
        const bank = d.banks.find(x => x.id === bankId);
        if (bank) (bank.cats ||= []).push({ id: uid(), name, value });
      });
      render();
    });
    $('cbAddBank').onclick = () => {
      const name = prompt('Название банка:');
      if (!name || !name.trim()) return;
      mutate(d => d.banks.push({ id: uid(), name: name.trim(), cats: [] }));
      render();
    };
    $('cbDone').onclick = () => { editing = false; render(); };
  }

  function init(){
    // При открытии: прошлые месяцы удаляются, остаётся только текущий
    save(load());
    render();
  }

  return { init, render };
})() : null;
if (typeof window !== 'undefined') window.Cashback = Cashback;
