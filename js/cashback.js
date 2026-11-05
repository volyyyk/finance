/* ============================================================
   cashback.js — режим «Кешбэк»: категории кешбэка банков на месяц
   Зависит: Utils (в браузере)
   Данные хранятся только за текущий месяц: при открытии
   прошлые месяцы удаляются. Постоянные банки и категории
   хранятся в словаре (fin_cbDict) независимо друг от друга.
   Чистая логика вынесена в CbLogic и покрывается
   tests/cashback.test.cjs.
   ============================================================ */

// ===== Чистая логика без DOM и localStorage =====
const CbLogic = (() => {
  const uid = () => Math.random().toString(36).slice(2, 10);

  function monthKey(d = new Date()){
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  // Нормализация: остаётся только текущий месяц, прошлые удаляются
  function normalize(data, key){
    if (!data || data.month !== key || !Array.isArray(data.banks)) return { month: key, banks: [] };
    return {
      month: key,
      banks: data.banks
        .filter(b => b && b.id)
        .map(b => ({
          id: b.id,
          name: String(b.name || '').trim() || 'Банк',
          cats: (Array.isArray(b.cats) ? b.cats : [])
            .filter(c => c && c.id && String(c.name || '').trim())
            .map(c => ({
              id: c.id,
              name: String(c.name).trim(),
              sub: c.sub ? String(c.sub).trim() : null,
              value: Number(c.value) || 0
            }))
        }))
    };
  }

  // Все записи месяца одним списком
  function entriesAll(banks){
    const out = [];
    (banks || []).forEach(b => (b.cats || []).forEach(c => {
      out.push({
        bankId: b.id, bankName: b.name, catId: c.id, catName: c.name,
        sub: c.sub || null, value: c.value || 0
      });
    }));
    return out;
  }

  const byValueDesc = (a, b) =>
    (b.value - a.value) || String(a.bankName || '').localeCompare(String(b.bankName || ''), 'ru');

  // Группировка по категориям: главная строка — лучший кешбэк без
  // подкатегории, под ней до 3 лучших подкатегорий.
  function groupByCategory(banks){
    const map = new Map();
    entriesAll(banks).forEach(e => {
      const g = map.get(e.catName) || { name: e.catName, noSub: [], withSub: [] };
      if (e.sub) g.withSub.push(e); else g.noSub.push(e);
      map.set(e.catName, g);
    });
    const groups = [...map.values()].map(g => ({
      name: g.name,
      top: g.noSub.slice().sort(byValueDesc)[0] || null,
      subs: g.withSub.slice().sort(byValueDesc).slice(0, 3)
    }));
    const best = g => Math.max(0, ...(g.top ? [g.top] : []).concat(g.subs).map(e => e.value));
    return groups.sort((a, b) => best(b) - best(a) || a.name.localeCompare(b.name, 'ru'));
  }

  // Общий список: все кешбэки месяца, сгруппированные по банкам
  function allByBank(banks){
    return (banks || [])
      .map(b => ({
        bankId: b.id, bankName: b.name,
        entries: (b.cats || []).map(c => ({ catId: c.id, catName: c.name, sub: c.sub || null, value: c.value || 0 }))
          .sort(byValueDesc)
      }))
      .filter(g => g.entries.length)
      .sort((a, b) => a.bankName.localeCompare(b.bankName, 'ru'));
  }

  // Общий список: все кешбэки месяца, сгруппированные по категориям
  function allByCategory(banks){
    const map = new Map();
    entriesAll(banks).forEach(e => {
      const g = map.get(e.catName) || { name: e.catName, entries: [] };
      g.entries.push(e);
      map.set(e.catName, g);
    });
    return [...map.values()]
      .map(g => ({ name: g.name, entries: g.entries.slice().sort(byValueDesc) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  // ===== Словарь постоянных банков и категорий =====
  function normalizeDict(dict){
    const clean = list => (Array.isArray(list) ? list : [])
      .filter(x => x && x.id && String(x.name || '').trim())
      .map(x => ({ id: x.id, name: String(x.name).trim() }));
    return { banks: clean(dict && dict.banks), cats: clean(dict && dict.cats) };
  }
  function dictAdd(dict, kind, name){
    const d = normalizeDict(dict);
    const n = String(name || '').trim();
    if (!n) return d;
    const list = kind === 'bank' ? d.banks : d.cats;
    if (!list.some(x => x.name.toLowerCase() === n.toLowerCase())) list.push({ id: uid(), name: n });
    return d;
  }
  function dictRemove(dict, kind, id){
    const d = normalizeDict(dict);
    if (kind === 'bank') d.banks = d.banks.filter(x => x.id !== id);
    else d.cats = d.cats.filter(x => x.id !== id);
    return d;
  }

  // Уровень кешбэка для подсветки категории: слабый (красный) до 3%,
  // средний (жёлтый) 3–5%, высокий (зелёный) от 5%.
  function level(value){
    const v = Number(value) || 0;
    if (v >= 5) return 'high';
    if (v >= 3) return 'mid';
    return 'low';
  }

  // Цвет всей категории: определяется процентом основной категории
  // (подкатегории на него не влияют); если основной записи нет
  // (только подкатегории) — лучшей из подкатегорий.
  function groupLevel(g){
    const main = g && g.top ? Number(g.top.value) || 0
      : (g && g.subs ? g.subs : []).reduce((m, e) => Math.max(m, Number(e.value) || 0), 0);
    return level(main);
  }

  return {
    monthKey, normalize, entriesAll, groupByCategory, allByBank, allByCategory,
    normalizeDict, dictAdd, dictRemove, level, groupLevel
  };
})();
if (typeof module !== 'undefined') module.exports = CbLogic;

// ===== UI (только в браузере) =====
const Cashback = typeof document !== 'undefined' ? (() => {
  const { $, uid, escapeHtml } = Utils;
  const LS_M = 'fin_cashback';  // кешбэки текущего месяца
  const LS_D = 'fin_cbDict';    // словарь: постоянные банки и категории
  const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля',
                  'августа','сентября','октября','ноября','декабря'];
  let mode = 'view';    // view | edit | dict
  let allSort = 'bank'; // bank | cat — сортировка общего списка

  function load(){
    let data = null;
    try { data = JSON.parse(localStorage.getItem(LS_M) || 'null'); } catch {}
    return CbLogic.normalize(data, CbLogic.monthKey());
  }
  function save(data){ localStorage.setItem(LS_M, JSON.stringify(data)); }
  function mutate(fn){ const data = load(); fn(data); save(data); }

  function loadDict(){
    let dict = null;
    try { dict = JSON.parse(localStorage.getItem(LS_D) || 'null'); } catch {}
    return CbLogic.normalizeDict(dict);
  }
  function saveDict(dict){ localStorage.setItem(LS_D, JSON.stringify(dict)); }
  // Новое имя банка или категории автоматически попадает в словарь
  function remember(kind, name){ saveDict(CbLogic.dictAdd(loadDict(), kind, name)); }

  function monthTitle(key){
    const [y, m] = key.split('-').map(Number);
    const name = MONTHS[(m || 1) - 1] || '';
    return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
  }
  function hasData(data){ return data.banks.some(b => (b.cats || []).length); }
  function hasBanks(data){ return data.banks.length > 0; }

  function datalist(id, names){
    return `<datalist id="${id}">${names.map(n => `<option value="${escapeHtml(n)}"></option>`).join('')}</datalist>`;
  }
  function catNames(data, dict){
    const names = new Set();
    (dict.cats || []).forEach(c => names.add(c.name));
    (data.banks || []).forEach(b => (b.cats || []).forEach(c => names.add(c.name)));
    return [...names].sort((a, b) => a.localeCompare(b, 'ru'));
  }
  function bankNames(dict){
    return (dict.banks || []).map(b => b.name).sort((a, b) => a.localeCompare(b, 'ru'));
  }

  // Удаление записи кешбэка (в любом из видов)
  function wireDelete(scope){
    scope.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      mutate(d => {
        const bank = d.banks.find(x => x.id === b.dataset.bank);
        if (bank) bank.cats = (bank.cats || []).filter(c => c.id !== b.dataset.cat);
      });
      render();
    });
  }

  function render(){
    const root = $('cbMonth');
    if (!root) return;
    const data = load();
    root.textContent = `Кешбэк · ${monthTitle(data.month)}`;
    $('cbView').hidden = mode !== 'view';
    $('cbEdit').hidden = mode === 'view';
    if (mode === 'view'){ $('cbEdit').innerHTML = ''; renderView(data); }
    else if (mode === 'edit'){ $('cbView').innerHTML = ''; renderEdit(data); }
    else { $('cbView').innerHTML = ''; renderDict(data); }
  }

  // Длинные подписи «банк · подкатегория» плавно прокручиваются по кругу:
  // текст дублируется в трек, и анимация сдвигает его ровно на одну копию —
  // движение бесшовное, весь текст можно прочитать без обрезки.
  function marqueeSubs(root){
    try {
      if (!root || typeof root.querySelectorAll !== 'function') return;
      root.querySelectorAll('.cb-sub-txt').forEach(el => {
        const cw = el.clientWidth, sw = el.scrollWidth;
        if (!(cw > 0) || sw <= cw + 1) return; // влезает — не крутим
        if (el.classList.contains('cb-marquee')) return;
        const raw = el.textContent;
        el.classList.add('cb-marquee');
        el.textContent = '';
        const track = document.createElement('span');
        track.className = 'cb-track';
        for (let i = 0; i < 2; i++){
          const part = document.createElement('span');
          part.className = 'cb-part';
          part.textContent = raw;      // textContent — без HTML, экранировать не нужно
          track.appendChild(part);
        }
        el.appendChild(track);
        // Одна копия текста с зазором; скорость прокрутки ~25px/с
        const one = (track.firstChild && track.firstChild.offsetWidth) || sw;
        el.style.setProperty('--cb-dur', Math.min(20, Math.max(4, Math.round(one / 25))) + 's');
      });
    } catch (e) { /* DOM недоступен (тестовая песочница) — просто пропускаем */ }
  }

  // Основной вид: лучшие кешбэки по категориям
  function renderView(data){
    const el = $('cbView');
    const dict = loadDict();

    if (!hasBanks(data) || !hasData(data)){
      el.innerHTML = `
        <div class="empty">В ${monthTitle(data.month)} кешбэки ещё не добавлены.<br>Добавьте банки и категории кешбэка на этот месяц.</div>
        <div class="actions-bar">
          <button class="btn primary" id="cbStartBtn">+ Добавить кешбэк</button>
        </div>`;
      $('cbStartBtn').onclick = () => { mode = 'edit'; render(); };
      return;
    }

    const groups = CbLogic.groupByCategory(data.banks);
    const groupHtml = groups.map(g => {
      // Подсветка категории: цвет зависит от процента основной строки
      // (подкатегории на него не влияют); если основной строки нет —
      // берётся лучшая из подкатегорий.
      const lvl = CbLogic.groupLevel(g);
      // Компактная строка: категория и % — сверху, банк — под ней
      // (муниципальное имя банка больше не растягивает блок по ширине)
      const top = g.top ? `
        <div class="cb-row">
          <div class="cb-txt">
            <div class="cb-line"><span class="cb-cat">${escapeHtml(g.name)}</span><b class="cb-val">${g.top.value}%</b></div>
            <div class="cb-bank">${escapeHtml(g.top.bankName)}</div>
          </div>
          <button class="op-del" data-bank="${g.top.bankId}" data-cat="${g.top.catId}" title="Убрать этот кешбэк">×</button>
        </div>` : `
        <div class="cb-row">
          <div class="cb-txt">
            <div class="cb-line"><span class="cb-cat">${escapeHtml(g.name)}</span></div>
            <div class="cb-bank">только подкатегории</div>
          </div>
        </div>`;
      // Подкатегории: процент вынесен в отдельный несжимаемый элемент —
      // он виден всегда, даже когда «банк · подкатегория» не влезает
      // и обрезается многоточием.
      const subs = (g.subs || []).map(s => `
        <div class="cb-sub cb-l-${CbLogic.level(s.value)}">
          <span class="cb-sub-txt">${escapeHtml(s.bankName)} · ${escapeHtml(s.sub)}</span>
          <b class="cb-sub-val">${s.value}%</b>
          <button class="op-del" data-bank="${s.bankId}" data-cat="${s.catId}" title="Убрать этот кешбэк">×</button>
        </div>`).join('');
      return `<div class="cb-group cb-l-${lvl}">${top}${subs ? `<div class="cb-subs">${subs}</div>` : ''}</div>`;
    }).join('');

    const bankOpts = data.banks.map(b =>
      `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');

    el.innerHTML = `
      <h3>Лучшие кешбэки по категориям</h3>
      <div class="cb-list cb-grid">${groupHtml}</div>
      ${datalist('cbCatList', catNames(data, dict))}
      <div class="cb-quick">
        <div class="op-meta">Добавить кешбэк за ${monthTitle(data.month)}</div>
        <div class="cb-add">
          <input type="text" id="cbQCat" list="cbCatList" placeholder="Категория">
          <label class="cb-check"><input type="checkbox" id="cbQSubOn">подкатегория</label>
          <input type="text" id="cbQSub" class="cb-sub-input" placeholder="Подкатегория" hidden>
          <input type="number" id="cbQVal" step="0.1" min="0" placeholder="%">
          <select id="cbQBank">${bankOpts}</select>
          <button class="btn small" id="cbQAdd">+ Добавить кешбэк</button>
        </div>
        <div class="actions-bar">
          <button class="btn" id="cbEditBtn">✎ Редактировать</button>
        </div>
      </div>
      <details class="cb-all" id="cbAll">
        <summary>Общий список</summary>
        <div class="cb-all-sort">
          <button class="btn small${allSort === 'bank' ? ' active' : ''}" data-sort="bank">По банкам</button>
          <button class="btn small${allSort === 'cat' ? ' active' : ''}" data-sort="cat">По категориям</button>
        </div>
        <div id="cbAllBody">${allListHtml(data)}</div>
      </details>`;

    wireDelete(el);
    marqueeSubs(el);
    $('cbQSubOn').onchange = () => { $('cbQSub').hidden = !$('cbQSubOn').checked; };
    $('cbQAdd').onclick = () => {
      const name = $('cbQCat').value.trim();
      const value = parseFloat($('cbQVal').value);
      const bankId = $('cbQBank').value;
      const sub = $('cbQSubOn').checked ? $('cbQSub').value.trim() : '';
      if (!name){ alert('Укажите категорию (выберите из списка или впишите новую)'); return; }
      if (!(value > 0)){ alert('Укажите процент кешбэка'); return; }
      if ($('cbQSubOn').checked && !sub){ alert('Укажите подкатегорию или снимите галочку'); return; }
      mutate(d => {
        const bank = d.banks.find(x => x.id === bankId);
        if (bank) (bank.cats ||= []).push({ id: uid(), name, sub: sub || null, value });
      });
      remember('cat', name);
      render();
    };
    $('cbEditBtn').onclick = () => { mode = 'edit'; render(); };    el.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => {
      allSort = b.dataset.sort;
      $('cbAllBody').innerHTML = allListHtml(data);
      el.querySelectorAll('[data-sort]').forEach(x =>
        x.classList.toggle('active', x.dataset.sort === allSort));
      wireDelete($('cbAllBody'));
    });
  }

  // Общий список: сортировка по банкам или по категориям
  function allListHtml(data){
    const row = (e, bankId, main, sub) => `
      <div class="cb-all-row">
        <span class="cb-all-name">${escapeHtml(main)}${sub ? ` · ${escapeHtml(sub)}` : ''}</span>
        <b>${e.value}%</b>
        <button class="op-del" data-bank="${bankId}" data-cat="${e.catId}" title="Убрать этот кешбэк">×</button>
      </div>`;
    if (allSort === 'cat'){
      return CbLogic.allByCategory(data.banks).map(g =>
        `<div class="cb-all-cat">${escapeHtml(g.name)}</div>` +
        g.entries.map(e => row(e, e.bankId, e.bankName, e.sub)).join('')
      ).join('');
    }
    return CbLogic.allByBank(data.banks).map(g =>
      `<div class="cb-all-bank">${escapeHtml(g.bankName)}</div>` +
      g.entries.map(e => row(e, g.bankId, e.catName, e.sub)).join('')
    ).join('');
  }

  // Редактирование: банки и их кешбэки за месяц
  function renderEdit(data){
    const el = $('cbEdit');
    const dict = loadDict();
    const bankBlocks = data.banks.map(b => `
      <div class="cb-bank">
        <div class="cb-bank-head">
          <input type="text" data-rename="${b.id}" value="${escapeHtml(b.name)}" title="Название банка">
          <button class="op-del" data-bankdel="${b.id}" title="Удалить банк">×</button>
        </div>
        <div class="cb-list">
          ${(b.cats || []).map(c => `
            <div class="cb-row">
              <div class="cb-cat">${escapeHtml(c.name)}${c.sub ? ` <span class="cb-sub-txt">· ${escapeHtml(c.sub)}</span>` : ''}</div>
              <div class="cb-best"><b>${c.value}%</b></div>
              <button class="op-del" data-catdel="${b.id}:${c.id}" title="Удалить кешбэк">×</button>
            </div>`).join('') || '<div class="empty">Кешбэков нет</div>'}
        </div>
        <div class="cb-add">
          <input type="text" data-newcat="${b.id}" list="cbCatList" placeholder="Категория">
          <label class="cb-check"><input type="checkbox" data-subon="${b.id}">подкатегория</label>
          <input type="text" data-newsub="${b.id}" class="cb-sub-input" placeholder="Подкатегория" hidden>
          <input type="number" data-newval="${b.id}" step="0.1" min="0" placeholder="%">
          <button class="btn small" data-addcat="${b.id}">+</button>
        </div>
      </div>`).join('');

    el.innerHTML = `
      ${bankBlocks || '<div class="empty">Банков пока нет — добавьте первый</div>'}
      ${datalist('cbCatList', catNames(data, dict))}
      ${datalist('cbBankList', bankNames(dict))}
      <div class="cb-add">
        <input type="text" id="cbNewBank" list="cbBankList" placeholder="Название банка">
        <button class="btn small" id="cbAddBank">+ Добавить банк</button>
      </div>
      <div class="actions-bar">
        <button class="btn primary" id="cbDone">✓ Готово</button>
      </div>`;

    el.querySelectorAll('[data-rename]').forEach(inp => inp.onchange = () => {
      const name = inp.value.trim();
      if (!name) return;
      mutate(d => { const bank = d.banks.find(x => x.id === inp.dataset.rename); if (bank) bank.name = name; });
      remember('bank', name);
      render();
    });
    el.querySelectorAll('[data-bankdel]').forEach(b => b.onclick = () => {
      const bank = data.banks.find(x => x.id === b.dataset.bankdel);
      if (!confirm(`Удалить банк «${bank?.name || ''}» вместе с его кешбэками за этот месяц?`)) return;
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
    el.querySelectorAll('[data-subon]').forEach(ch => ch.onchange = () => {
      const sub = el.querySelector(`[data-newsub="${ch.dataset.subon}"]`);
      if (sub) sub.hidden = !ch.checked;
    });
    el.querySelectorAll('[data-addcat]').forEach(b => b.onclick = () => {
      const bankId = b.dataset.addcat;
      const name = el.querySelector(`[data-newcat="${bankId}"]`).value.trim();
      const value = parseFloat(el.querySelector(`[data-newval="${bankId}"]`).value);
      const subOn = el.querySelector(`[data-subon="${bankId}"]`).checked;
      const sub = subOn ? el.querySelector(`[data-newsub="${bankId}"]`).value.trim() : '';
      if (!name){ alert('Укажите категорию (выберите из списка или впишите новую)'); return; }
      if (!(value > 0)){ alert('Укажите процент кешбэка'); return; }
      if (subOn && !sub){ alert('Укажите подкатегорию или снимите галочку'); return; }
      mutate(d => {
        const bank = d.banks.find(x => x.id === bankId);
        if (bank) (bank.cats ||= []).push({ id: uid(), name, sub: sub || null, value });
      });
      remember('cat', name);
      render();
    });
    $('cbAddBank').onclick = () => {
      const name = $('cbNewBank').value.trim();
      if (!name){ alert('Укажите название банка'); return; }
      mutate(d => d.banks.push({ id: uid(), name, cats: [] }));
      remember('bank', name);
      render();
    };
    $('cbDone').onclick = () => { mode = 'view'; render(); };
  }

  // Глобальные настройки раздела: постоянные банки и категории
  function renderDict(data){
    const el = $('cbEdit');
    const dict = loadDict();
    const rowHtml = (kind, list) => (list.length ? list.map(x => `
      <div class="cb-dict-row">
        <span>${escapeHtml(x.name)}</span>
        <button class="op-del" data-dictdel="${kind}:${x.id}" title="Удалить">×</button>
      </div>`).join('') : '<div class="empty">Пока пусто</div>');

    el.innerHTML = `
      <p class="op-meta">Постоянные банки и категории: сохраняются между месяцами и предлагаются
      при вводе. Можно удалять. Банки и категории хранятся независимо друг от друга.</p>
      <div class="cb-dict-head"><h3>Банки</h3></div>
      <div class="cb-dict-list">${rowHtml('bank', dict.banks)}</div>
      <div class="cb-dict-add">
        <input type="text" id="cbDictBankName" placeholder="Название банка">
        <button class="btn small" id="cbDictBankAdd">+</button>
      </div>
      <div class="cb-dict-head"><h3>Категории</h3></div>
      <div class="cb-dict-list">${rowHtml('cat', dict.cats)}</div>
      <div class="cb-dict-add">
        <input type="text" id="cbDictCatName" placeholder="Название категории">
        <button class="btn small" id="cbDictCatAdd">+</button>
      </div>
      <div class="actions-bar">
        <button class="btn primary" id="cbDictDone">✓ Готово</button>
      </div>`;

    el.querySelectorAll('[data-dictdel]').forEach(b => b.onclick = () => {
      const [kind, id] = b.dataset.dictdel.split(':');
      saveDict(CbLogic.dictRemove(loadDict(), kind, id));
      render();
    });
    $('cbDictBankAdd').onclick = () => {
      const name = $('cbDictBankName').value.trim();
      if (!name){ alert('Укажите название банка'); return; }
      saveDict(CbLogic.dictAdd(loadDict(), 'bank', name));
      render();
    };
    $('cbDictCatAdd').onclick = () => {
      const name = $('cbDictCatName').value.trim();
      if (!name){ alert('Укажите название категории'); return; }
      saveDict(CbLogic.dictAdd(loadDict(), 'cat', name));
      render();
    };
    $('cbDictDone').onclick = () => { mode = 'view'; render(); };
  }

  function init(){
    // При открытии: прошлые месяцы удаляются, остаётся только текущий
    save(load());
    render();
  }

  // Открыть глобальные настройки раздела (кнопка «♾️ Банки» в шапке)
  function openDict(){
    mode = 'dict';
    render();
  }

  return { init, render, openDict };
})() : null;
if (typeof window !== 'undefined') window.Cashback = Cashback;

