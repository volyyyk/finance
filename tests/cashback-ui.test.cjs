const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cashback = fs.readFileSync(path.join(__dirname, '../js/cashback.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');

test('cashback action accordions are collapsed on first render', () => {
  const add = cashback.indexOf('id="cbAccAdd"');
  const settings = cashback.indexOf('id="cbAccSettings"', add);
  const all = cashback.indexOf('id="cbAll"', settings);
  assert.ok(add >= 0 && settings > add && all > settings);
  for (const id of ['cbAccAdd', 'cbAccSettings', 'cbAll']) {
    const tag = cashback.match(new RegExp('<details[^>]*id="' + id + '"[^>]*>'));
    assert.ok(tag, id + ' details element exists');
    assert.doesNotMatch(tag[0], /\bopen(?:\s|=|>)/, id + ' starts collapsed');
  }
  assert.match(cashback, /promptAccordionHtml\(data\)/);
});

test('cashback categories stay two columns on narrow screens and actions become compact tiles', () => {
  assert.ok(styles.includes('.cb-list.cb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}'));
  assert.ok(styles.includes('.cb-list.cb-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}'));
  assert.ok(styles.includes('.cb-bottom-accordions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:18px;gap:9px}'));
  assert.ok(styles.includes('.cb-accordion[open]{grid-column:1/-1;background:var(--card)}'));
  assert.ok(styles.includes('.cb-group.cb-l-low .cb-val{background:color-mix'));
  assert.ok(styles.includes('.cb-summary-copy{display:flex;flex-direction:column'));
  for (const label of ['Добавить новое','Настроить','Все кешбэки','Быстрый ввод']) {
    assert.ok(cashback.includes('<strong>'+label+'</strong>'), label);
  }
});

test('cashback first-use state explains the setup and offers two clear paths', () => {
  assert.match(cashback, /cb-empty-state/);
  assert.match(cashback, /Добавить первый банк/);
  assert.match(cashback, /Заполнить по фото \/ ИИ/);
  assert.match(cashback, /cbEmptyPromptBtn/);
  assert.match(styles, /\.cb-empty-state/);
});

test('portfolio search filters product rows and hides empty groups', () => {
  const dashboard = fs.readFileSync(path.join(__dirname, '../js/dashboard.js'), 'utf8');
  assert.match(dashboard, /\$\('productSearch'\)/);
  assert.match(dashboard, /data-search=/);
  assert.match(dashboard, /\.product-row:not\(\[hidden\]\)/);
  assert.match(dashboard, /productSearchEmpty/);
});

test('portfolio section appears before analytics charts', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const stats = html.indexOf('id="stats"');
  const portfolio = html.indexOf('id="productsList"');
  const charts = html.indexOf('id="chartBalance"');
  assert.ok(stats >= 0 && portfolio > stats && charts > portfolio);
});
