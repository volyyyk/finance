/* ============================================================
   cashback.js — режим «Кешбэк»: категории кешбэка банков на месяц
   Зависит: Utils (в браузере)
   Данные хранятся за текущий месяц и (за 15 дней до нового
   месяца) за следующий как предзаказ; прошлые месяцы удаляются
   при открытии. Постоянные банки и категории хранятся в словаре
   (fin_cbDict) независимо друг от друга.
   «Быстрый ввод по промту» (📑): промт копируется в нейросеть,
   ответ (JSON-блок) вставляется обратно и добавляется в месяц;
   новые банки и категории в постоянный словарь при этом не
   попадают.
   Чистая логика вынесена в CbLogic и покрывается
   tests/cashback.test.cjs.
   ============================================================ */

// ===== Чистая логика без DOM и localStorage =====
const CbLogic = (() => {
  const uid = () => Math.random().toString(36).slice(2, 10);

  function monthKey(d = new Date()){
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const DAY_MS = 86400000;

  // Ключ следующего месяца
  function nextMonthKey(d = new Date()){
    return monthKey(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  // Предзаказ разрешён, когда до начала следующего месяца осталось
  // 15 дней или меньше (например, с 17 декабря можно завести кешбэки на январь).
  function advanceAllowed(d = new Date(), daysAhead = 15){
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const gap = Math.round((new Date(d.getFullYear(), d.getMonth() + 1, 1) - t) / DAY_MS);
    return gap <= daysAhead;
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

  // ===== Быстрый ввод кешбэка: разбор ответа нейросети =====

  // Достаёт первый JSON из ответа: блок кода ```json …```, либо массив,
  // либо объект. Возвращает распарсенное значение или null.
  function extractJsonBlock(text){
    const s = String(text || '');
    const attempts = [];
    const fence = s.match(/```(?:json|js|javascript)?\s*([\s\S]*?)```/i);
    if (fence) attempts.push(fence[1]);
    attempts.push(s);
    const arr = s.match(/\[[\s\S]*\]/);
    const obj = s.match(/\{[\s\S]*\}/);
    if (arr) attempts.push(arr[0]);
    if (obj) attempts.push(obj[0]);
    for (const a of attempts){
      try {
        const v = JSON.parse(String(a).trim());
        if (v && typeof v === 'object') return v;
      } catch {}
    }
    return null;
  }

  // Разбор ответа нейросети → [{ bank, cashbacks: [{ name, sub, value }]}].
  // Понимает и альтернативные названия полей (bankName, category,
  // subcategory, percent, rate), Cast мусорных строк отбрасывается.
  function parseAiAnswer(text){
    const raw = extractJsonBlock(text);
    if (!raw) return null;
    const list = Array.isArray(raw) ? raw
      : Array.isArray(raw.banks) ? raw.banks
      : (raw.bank || raw.bankName) ? [raw]
      : null;
    if (!Array.isArray(list)) return null;
    const out = [];
    list.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const bank = String(item.bank || item.bankName || item.name || '').trim();
      const cats = item.cashbacks || item.categories || item.cats;
      if (!bank || !Array.isArray(cats)) return;
      const rows = [];
      cats.forEach(c => {
        if (!c || typeof c !== 'object') return;
        const name = String(c.category || c.cat || c.name || '').trim();
        if (!name) return;
        const subRaw = c.subcategory !== undefined ? c.subcategory : (c.sub !== undefined ? c.sub : null);
        const sub = subRaw && String(subRaw).trim() ? String(subRaw).trim() : null;
        const rawValue = c.percent ?? c.value ?? c.rate ?? 0;
        const parsedValue = Number(String(rawValue).replace('%', '').replace(',', '.').trim());
        if (!Number.isFinite(parsedValue)) return;
        const value = Math.max(0, Math.min(100, parsedValue));
        rows.push({ name, sub, value });
      });
      if (rows.length) out.push({ bank, cashbacks: rows });
    });
    if (!out.length) return null;
    // Объединяем повторяющиеся банки из одного JSON (без учёта регистра).
    // Это сохраняет уникальные индексы категорий для предпросмотра/исключения.
    const merged = new Map();
    out.forEach(item => {
      const key = item.bank.toLocaleLowerCase('ru');
      if (!merged.has(key)) merged.set(key, { bank: item.bank, cashbacks: [] });
      merged.get(key).cashbacks.push(...item.cashbacks);
    });
    return [...merged.values()];
  }

  // Слияние распознанного ответа с банками месяца. Банк узнаётся без
  // учёта регистра; категория приводится к написанию из постоянного
  // словаря или из уже заведённых категорий месяца. Повтор той же
  // категории с той же подкатегорией обновляет процент. В постоянный
  // словарь быстрый ввод ничего не добавляет — только банки месяца.
  function mergeImported(currentBanks, imported, dict){
    const canon = new Map(); // «нижний регистр» → каноничное имя категории
    ((dict && dict.cats) || []).forEach(x => canon.set(x.name.toLowerCase(), x.name));
    const banks = (currentBanks || []).map(b => ({
      id: b.id, name: b.name, cats: (b.cats || []).map(c => ({ ...c }))
    }));
    banks.forEach(b => (b.cats || []).forEach(c => {
      if (!canon.has(c.name.toLowerCase())) canon.set(c.name.toLowerCase(), c.name);
    }));
    const rows = [];
    (imported || []).forEach(item => {
      const bankName = String(item.bank || '').trim();
      if (!bankName) return;
      let bank = banks.find(b => b.name.toLowerCase() === bankName.toLowerCase());
      const bankNew = !bank;
      if (bankNew){ bank = { id: uid(), name: bankName, cats: [] }; banks.push(bank); }
      (item.cashbacks || []).forEach((c, ci) => {
        if (!c || !String(c.name || '').trim()) return;
        const catName = canon.get(String(c.name).trim().toLowerCase()) || String(c.name).trim();
        const value = Math.max(0, Math.min(100, Number(c.value) || 0));
        const sub = c.sub ? String(c.sub).trim() : null;
        const exists = bank.cats.find(x => x.name.toLowerCase() === catName.toLowerCase() &&
          ((x.sub || null) === sub));
        const catKnown = canon.has(catName.toLowerCase());
        const key = `${bankName.toLowerCase()}::${ci}`;
        if (exists){
          const changed = exists.value !== value;
          exists.value = value;
          rows.push({ key, bankName: bank.name, catName, sub: exists.sub || null, value: exists.value,
            bankNew: false, catKnown, updated: changed });
        } else {
          bank.cats.push({ id: uid(), name: catName, sub, value });
          rows.push({ key, bankName: bank.name, catName, sub, value, bankNew, catKnown, updated: false });
        }
      });
    });
    return { banks, rows };
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
    monthKey, nextMonthKey, advanceAllowed, normalize, entriesAll,
    groupByCategory, allByBank, allByCategory,
    normalizeDict, dictAdd, dictRemove, level, groupLevel,
    extractJsonBlock, parseAiAnswer, mergeImported
  };
})();
if (typeof module !== 'undefined') module.exports = CbLogic;

// ===== UI (только в браузере) =====
const Cashback = typeof document !== 'undefined' ? (() => {
  const { $, uid, escapeHtml } = Utils;
  const LS_M = 'fin_cashback';  // кешбэки месяцев: текущий + предзаказ следующего
  const LS_D = 'fin_cbDict';    // словарь: постоянные банки и категории
  const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля',
                  'августа','сентября','октября','ноября','декабря'];
  const MONTHS_NOM = ['январь','февраль','март','апрель','май','июнь','июль',
                      'август','сентябрь','октябрь','ноябрь','декабрь'];
  let mode = 'view';    // view | edit | dict
  let allSort = 'bank'; // bank | cat — сортировка общего списка
  let activeMonth = null;  // null — текущий месяц, иначе ключ предзаказа
  let importState = null;  // разобранный быстрый ввод: [{ bank, cashbacks }]
  let importSkip = new Set();

  // Месяцы с данными: текущий всегда, следующий — когда до его начала
  // осталось 15 дней или меньше
  function availableKeys(){
    const cur = CbLogic.monthKey();
    return CbLogic.advanceAllowed() ? [cur, CbLogic.nextMonthKey()] : [cur];
  }
  function activeKey(){
    return availableKeys().includes(activeMonth) ? activeMonth : availableKeys()[0];
  }

  // Хранилище: { months: { 'YYYY-MM': { banks: [...] } } }. Прежний
  // одно-месячный формат { month, banks } читается автоматически.
  function loadAll(){
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(LS_M) || 'null'); } catch {}
    const out = {};
    if (raw && raw.months && typeof raw.months === 'object'){
      Object.keys(raw.months).forEach(k => { out[k] = raw.months[k]; });
    } else if (raw && raw.month){
      out[raw.month] = { banks: Array.isArray(raw.banks) ? raw.banks : [] };
    }
    return out;
  }
  function saveAll(months){
    // Хранятся только доступные месяцы: текущий и (в окно предзаказа)
    // следующий; прошлые удаляются.
    const allowed = new Set(availableKeys());
    const pruned = {};
    Object.keys(months).forEach(k => { if (allowed.has(k)) pruned[k] = months[k]; });
    localStorage.setItem(LS_M, JSON.stringify({ months: pruned }));
  }
  function load(){
    const key = activeKey();
    const months = loadAll();
    const m = months[key];
    return CbLogic.normalize({ month: key, banks: m && Array.isArray(m.banks) ? m.banks : [] }, key);
  }
  function mutate(fn){
    const data = load();
    fn(data);
    const months = loadAll();
    months[data.month] = { banks: data.banks };
    saveAll(months);
  }

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
  // Короткое имя месяца для вкладок переключателя
  function monthShort(key){
    const m = Number(key.split('-')[1]);
    const name = MONTHS_NOM[(m || 1) - 1] || '';
    return `${name[0].toUpperCase()}${name.slice(1)}`;
  }
  function isNextMonth(key){ return key === CbLogic.nextMonthKey(); }
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
    const allowed = availableKeys();
    if (allowed.length > 1){
      // Переключатель месяца: текущий и предзаказ следующего (с 15 дней
      // до его начала)
      root.innerHTML =
        `<span class="cb-month-title">Кешбэк · ${monthTitle(data.month)}${isNextMonth(data.month) ? ' · предзаказ' : ''}</span>` +
        `<span class="cb-month-tabs">` + allowed.map(k =>
          `<button class="cb-tab${k === data.month ? ' active' : ''}" data-cbmonth="${k}"` +
          ` title="${isNextMonth(k) ? 'Предзаказ кешбэка на следующий месяц' : 'Кешбэк текущего месяца'}">${monthShort(k)}</button>`
        ).join('') + `</span>`;
    } else {
      root.textContent = `Кешбэк · ${monthTitle(data.month)}`;
    }
    root.querySelectorAll('[data-cbmonth]').forEach(b => b.onclick = () => {
      activeMonth = b.dataset.cbmonth;
      mode = 'view';
      importState = null;
      importSkip = new Set();
      render();
    });
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

  // ===== 4. Быстрый ввод кешбэка по промту =====

  // Копирование в буфер с резервным путём через execCommand
  async function copyText(text, btn){
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {}
    if (!ok){
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    if (btn && ok){
      const old = btn.textContent;
      btn.textContent = '✓ Скопировано';
      setTimeout(() => { btn.textContent = old; }, 1500);
    } else if (!ok){
      alert('Не удалось скопировать автоматически — выделите и скопируйте текст вручную');
    }
  }

  // Промт для любой нейросети: правило оформления ответа, известные
  // банки и категории, просьба согласовать с ними и задавать вопросы.
  function promptText(data, dict){
    const banks = [...new Set([...bankNames(dict), ...(data.banks || []).map(b => b.name)])]
      .sort((a, b) => a.localeCompare(b, 'ru'));
    const cats = catNames(data, dict);
    return [
      'Ты — помощник по кешбэк-программам банков. Я отправлю тебе фото или описание условий кешбэка банка.',
      '',
      'Твоя задача: извлечь условия кешбэка и вернуть их в машиночитаемом виде.',
      '',
      'Правила ответа:',
      '1. В ответе должен быть ровно один блок кода с JSON — и ничего больше, до или после. Если на фото несколько банков, верни все банки отдельными объектами в одном JSON-массиве:',
      '```json',
      '[{"bank":"Название банка","cashbacks":[{"category":"Категория","subcategory":null,"percent":5}]}]',
      '```',
      '2. "subcategory" — null, если подкатегории нет. "percent" — число без знака %, можно дробное (например 3.5).',
      '3. Максимально согласуй ответ с моими справочниками ниже: если банк или категория уже есть в списках, используй точно такое же написание. Новую категорию называй коротко (1–3 слова).',
      '4. Если данных на фото не хватает (не видно процентов, категорию или срок действия) — сначала задай мне уточняющие вопросы и дождись ответа; блок кода пока не присылай. Не выдумывай категории и проценты.',
      '',
      'Банки, которые уже есть в приложении: ' + (banks.join(', ') || 'пока нет'),
      'Категории кешбэка, которые уже есть: ' + (cats.join(', ') || 'пока нет'),
      '',
      'Месяц, для которого добавляем кешбэки: ' + monthTitle(data.month) + '.',
    ].join('\n');
  }

  function promptAccordionHtml(data){
    return `
        <!-- 4. Быстрый ввод по промту (фиолетовая подсветка) -->
        <details class="cb-accordion cb-acc-prompt edge-glow-purple" id="cbAccPrompt">
          <summary><span class="cb-summary-icon">${Utils.iconSvg('file-text',16)}</span><span>4. Быстрый ввод по промту</span></summary>
          <div class="cb-acc-content">
            <div class="op-meta">Скопируйте промт и отправьте его любой нейросети вместе с фото условий банка.
            Ответ нейросети (блок кода) вставьте в поле ниже — кешбэки добавятся за ${monthTitle(data.month)}.
            Новые банки и категории попадут только в этот месяц, постоянный список не изменится.</div>
            <div class="cb-prompt-box">
              <pre id="cbPromptText" title="Нажмите, чтобы скопировать">${escapeHtml(promptText(data, loadDict()))}</pre>
              <button class="btn small" id="cbPromptCopy">Копировать промт</button>
            </div>
            <textarea id="cbPaste" rows="6" placeholder="Вставьте сюда ответ нейросети (блок кода с JSON)"></textarea>
            <div class="actions-bar" style="margin-top:8px;display:flex;gap:8px">
              <button class="btn small primary" id="cbParseBtn">Разобрать и добавить</button>
            </div>
            <div id="cbImportBox"></div>
          </div>
        </details>`;
  }

  // Предпросмотр распознанного ответа: какие записи попадут в месяц,
  // какие из них новые. Перед добавлением можно убрать лишние.
  function renderImportView(){
    const box = $('cbImportBox');
    if (!box) return;
    if (!importState){ box.innerHTML = ''; return; }
    const res = CbLogic.mergeImported(load().banks, importState, loadDict());
    const rows = res.rows.filter(r => !importSkip.has(r.key));
    if (!rows.length){
      box.innerHTML = '<div class="empty">В ответе не нашлось ни одного кешбэка. Попросите нейросеть прислать JSON ещё раз.</div>';
      return;
    }
    const badge = r => r.updated ? '<span class="cb-badge upd">обновлён %</span>'
      : r.bankNew ? '<span class="cb-badge new">новый банк</span>'
      : r.catKnown ? '' : '<span class="cb-badge new">новая категория</span>';
    box.innerHTML = `
      <div class="op-meta" style="margin-top:10px">Найдено ${rows.length} — проверьте и добавьте:</div>
      <div class="cb-import-list">${rows.map(r => `
        <div class="cb-import-row">
          <span class="cb-all-name">${escapeHtml(r.bankName)} · ${escapeHtml(r.catName)}${r.sub ? ` · ${escapeHtml(r.sub)}` : ''}</span>
          <b>${r.value}%</b>${badge(r)}
          <button class="op-del" data-impskip="${escapeHtml(r.key)}" title="Убрать из добавления">×</button>
        </div>`).join('')}</div>
      <div class="actions-bar" style="margin-top:8px">
        <button class="btn small primary" id="cbImportApply">Добавить в ${monthTitle(load().month)}</button>
      </div>`;
    box.querySelectorAll('[data-impskip]').forEach(b => b.onclick = () => {
      importSkip.add(b.dataset.impskip);
      renderImportView();
    });
    const apply = box.querySelector('#cbImportApply');
    if (apply) apply.onclick = () => {
      const kept = importState
        .map(item => ({ bank: item.bank, cashbacks: item.cashbacks
          .filter((c, ci) => !importSkip.has(String(item.bank).toLowerCase() + '::' + ci)) }))
        .filter(x => x.cashbacks.length);
      if (kept.length){
        mutate(d => { d.banks = CbLogic.mergeImported(d.banks, kept, loadDict()).banks; });
      }
      importState = null;
      importSkip = new Set();
      render();
    };
  }

  function wirePrompt(el){
    const txt = el.querySelector('#cbPromptText');
    const copyBtn = el.querySelector('#cbPromptCopy');
    if (txt && copyBtn){
      copyBtn.onclick = () => copyText(txt.textContent, copyBtn);
      txt.onclick = () => copyText(txt.textContent, copyBtn);
    }
    const parseBtn = el.querySelector('#cbParseBtn');
    if (parseBtn) parseBtn.onclick = () => {
      const ta = $('cbPaste');
      const parsed = CbLogic.parseAiAnswer(ta ? ta.value : '');
      if (!parsed){
        alert('Не удалось найти блок кода с JSON. Попросите нейросеть прислать ответ ещё раз — одним блоком кода.');
        return;
      }
      importSkip = new Set();
      importState = parsed;
      renderImportView();
    };
    renderImportView();
  }

  // Основной вид: лучшие кешбэки по категориям
  function renderView(data){
    const el = $('cbView');
    const dict = loadDict();

    if (!hasBanks(data) || !hasData(data)){
      const noBanks = !hasBanks(data);
      const nextHint = isNextMonth(data.month)
        ? '<p class="cb-empty-note">Это предварительный план на следующий месяц — условия можно внести заранее.</p>'
        : '';
      el.innerHTML = `
        <section class="cb-empty-state" aria-labelledby="cbEmptyTitle">
          <div class="cb-empty-art" aria-hidden="true"><span>₽</span><i>✦</i><b>+</b></div>
          <div class="cb-empty-copy">
            <span class="cb-eyebrow">ВАШИ ВЫГОДНЫЕ КАТЕГОРИИ</span>
            <h3 id="cbEmptyTitle">${noBanks ? 'Начнём с первого банка' : 'Добавим первые категории?'}</h3>
            <p>${noBanks
              ? 'Добавьте банки, которыми пользуетесь, и приложение покажет, где выгоднее платить в каждой категории.'
              : 'Банки уже добавлены. Осталось указать проценты кешбэка — вручную или с помощью распознавания условий.'}</p>
            ${nextHint}
            <div class="cb-empty-actions">
              <button class="btn primary" id="cbStartBtn">${noBanks ? '+ Добавить первый банк' : '+ Добавить категории'}</button>
              <button class="btn" id="cbEmptyPromptBtn">Заполнить по фото / ИИ</button>
            </div>
          </div>
          <div class="cb-empty-steps">
            <div><span>01</span><b>Банки</b><small>Добавьте один или несколько</small></div>
            <div><span>02</span><b>Категории</b><small>Укажите процент и подкатегорию</small></div>
            <div><span>03</span><b>Сравнение</b><small>Выбирайте лучший кешбэк</small></div>
          </div>
        </section>` + promptAccordionHtml(data);
      $('cbStartBtn').onclick = () => { mode = 'edit'; render(); };
      $('cbEmptyPromptBtn').onclick = () => {
        const details = $('cbAccPrompt');
        if (details) { details.open = true; details.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      };
      importState = null;
      importSkip = new Set();
      wirePrompt(el);
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
      <div class="cb-bottom-accordions">
        <!-- 1. Добавить новое (красная подсветка в тёмной / пастельная в светлой) -->
        <details class="cb-accordion cb-acc-add edge-glow-red" id="cbAccAdd">
          <summary><span class="cb-summary-icon">${Utils.iconSvg('plus',16)}</span><span>1. Добавить новое</span></summary>
          <div class="cb-acc-content">
            <div class="op-meta">Быстрое добавление кешбэка за ${monthTitle(data.month)}</div>
            <div class="cb-add">
              <input type="text" id="cbQCat" list="cbCatList" placeholder="Категория">
              <label class="cb-check"><input type="checkbox" id="cbQSubOn">подкатегория</label>
              <input type="text" id="cbQSub" class="cb-sub-input" placeholder="Подкатегория" hidden>
              <input type="number" id="cbQVal" step="0.1" min="0" placeholder="%">
              <select id="cbQBank">${bankOpts}</select>
              <button class="btn small primary" id="cbQAdd">+ Добавить</button>
            </div>
            <div class="cb-quick-chips">
              <span class="op-meta">Популярные:</span>
              <button type="button" class="btn chip" data-qchip="Супермаркеты">Супермаркеты</button>
              <button type="button" class="btn chip" data-qchip="Кафе и рестораны">Кафе и рестораны</button>
              <button type="button" class="btn chip" data-qchip="Такси">Такси</button>
              <button type="button" class="btn chip" data-qchip="АЗС">АЗС</button>
              <button type="button" class="btn chip" data-qchip="Аптеки">Аптеки</button>
            </div>
          </div>
        </details>

        <!-- 2. Настроить (жёлтая подсветка в тёмной / пастельная в светлой) -->
        <details class="cb-accordion cb-acc-settings edge-glow-yellow" id="cbAccSettings">
          <summary><span class="cb-summary-icon">${Utils.iconSvg('settings',16)}</span><span>2. Настроить</span></summary>
          <div class="cb-acc-content">
            <div class="op-meta">Управление банками текущего месяца и постоянными справочниками:</div>
            <div class="actions-bar" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn" id="cbEditBtn">✎ Редактировать банки месяца</button>
              <button class="btn banks" id="cbDictOpenBtn">${Utils.iconSvg('list',15)} Постоянные банки и категории</button>
            </div>
          </div>
        </details>

        <!-- 3. Показать все кешбеки (оранжевая подсветка в тёмной / пастельная в светлой) -->
        <details class="cb-accordion cb-acc-all edge-glow-orange cb-all" id="cbAll">
          <summary><span class="cb-summary-icon">${Utils.iconSvg('list',16)}</span><span>3. Показать все кешбеки</span></summary>
          <div class="cb-acc-content">
            <div class="cb-all-sort">
              <button class="btn small${allSort === 'bank' ? ' active' : ''}" data-sort="bank">По банкам</button>
              <button class="btn small${allSort === 'cat' ? ' active' : ''}" data-sort="cat">По категориям</button>
            </div>
            <div id="cbAllBody">${allListHtml(data)}</div>
          </div>
        </details>` + promptAccordionHtml(data) + `
      </div>`;

    wireDelete(el);
    marqueeSubs(el);
    importState = null;
    importSkip = new Set();
    wirePrompt(el);
    const dBtn = el.querySelector("#cbDictOpenBtn");
    if (dBtn) dBtn.onclick = () => { mode = "dict"; render(); };
    el.querySelectorAll("[data-qchip]").forEach(chip => chip.onclick = () => {
      $("cbQCat").value = chip.dataset.qchip;
      $("cbQVal").focus();
    });
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
        <input type="text" id="cbNewBank" list="cbBankList" placeholder="Названия банков через запятую или с новой строки">
        <button class="btn small" id="cbAddBank">+ Добавить банки</button>
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
      const names = [...new Set($('cbNewBank').value.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean))];
      if (!names.length){ alert('Укажите хотя бы один банк'); return; }
      let added = 0;
      mutate(d => names.forEach(name => {
        if (d.banks.some(b => b.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) return;
        d.banks.push({ id: uid(), name, cats: [] });
        added++;
      }));
      names.forEach(name => remember('bank', name));
      if (!added){ alert('Эти банки уже есть в списке'); return; }
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
    // При открытии: прошлые месяцы удаляются, остаются текущий и (в окно
    // предзаказа за 15 дней) следующий. Прежний одно-месячный формат
    // хранилища мигрирует в много-месячный.
    activeMonth = null;
    saveAll(loadAll());
    render();
  }

  // Открыть глобальные настройки раздела (кнопка «♾️ Банки» в шапке)
  function openDict(){
    mode = 'dict';
    render();
  }
  function openAdd(){
    mode = 'edit';
    render();
  }

  return { init, render, openDict, openAdd };
})() : null;
if (typeof window !== 'undefined') window.Cashback = Cashback;

