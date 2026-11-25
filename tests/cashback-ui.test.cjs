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

test('cashback accordion stack has consistent spacing and unified card styling', () => {
  const stack = styles.lastIndexOf('.cb-bottom-accordions{');
  const accordion = styles.lastIndexOf('.cb-accordion{');
  assert.ok(stack >= 0 && accordion > stack);
  assert.match(styles.slice(stack, accordion), /gap:\s*10px/);
  assert.match(styles.slice(accordion, styles.indexOf('.cb-accordion>summary', accordion)), /border-radius:\s*15px/);
});
