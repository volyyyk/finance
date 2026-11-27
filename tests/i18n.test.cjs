const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadI18n(savedLang){
  const store = new Map();
  if (savedLang) store.set('fin_lang', savedLang);
  const sb = {
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k,v) => store.set(k, String(v)) },
    navigator: { language: 'en-US' },
    document: {
      documentElement: { lang: '' },
      dispatchEvent(){ return true; },
      addEventListener(){},
    },
    Event, Date, Math, JSON, String, Number, Object, Array,
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(require.resolve('../js/i18n.js'), 'utf8'), sb);
  // top-level const не попадает в объект песочницы — берём I18n из контекста
  sb.I18n = vm.runInContext('I18n', sb);
  return sb;
}

test('I18n: язык по умолчанию берётся из navigator, перевод работает', () => {
  const sb = loadI18n();
  assert.equal(sb.I18n.lang, 'en', 'navigator.language en-US → английский по умолчанию');
  assert.equal(sb.I18n.t('Добавить продукт'), 'Add product');
  assert.equal(sb.I18n.localeTag(), 'en-US');
  sb.I18n.setLang('ru');
  assert.equal(sb.I18n.t('Добавить продукт'), 'Добавить продукт');
  assert.equal(sb.I18n.localeTag(), 'ru-RU');
  assert.equal(sb.localStorage.getItem('fin_lang'), 'ru', 'выбор сохраняется в localStorage');
  assert.equal(sb.document.documentElement.lang, 'ru');
});

test('I18n: сохранённый выбор важнее navigator, отсутствующий перевод возвращается как есть', () => {
  const sb = loadI18n('ru');
  assert.equal(sb.I18n.lang, 'ru', 'fin_lang=ru сильнее navigator en-US');
  assert.equal(sb.I18n.t('Строки, которой нет в словаре'), 'Строки, которой нет в словаре');
  sb.I18n.setLang('en');
  assert.equal(sb.I18n.t('Готово к работе без интернета'), 'Ready to work offline');
  assert.equal(sb.I18n.t('Строки, которой нет в словаре'), 'Строки, которой нет в словаре',
    'нет перевода — не показываем пустоту');
  sb.I18n.setLang('de');
  assert.equal(sb.I18n.lang, 'en', 'неподдерживаемый язык не применяется');
});
