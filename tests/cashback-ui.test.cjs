const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cashback = fs.readFileSync(path.join(__dirname, '../js/cashback.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../styles.css'), 'utf8');

test('cashback action accordions are collapsed on first render', () => {
  const markup = cashback.slice(cashback.indexOf('id="cbAccAdd"') - 100,
    cashback.indexOf('id="cbAccAdd"') + 1200);
  assert.doesNotMatch(markup, /id="cbAccAdd"[^>]*\bopen\b/);
  assert.match(markup, /id="cbAccSettings"/);
  assert.match(markup, /id="cbAll"/);
  assert.match(markup, /cbAccPrompt/);
});

test('cashback accordion stack uses one spacing system and no per-card margin', () => {
  const start = styles.indexOf('.cb-bottom-accordions{');
  const end = styles.indexOf('.cb-accordion{', start);
  assert.ok(start >= 0 && end > start);
  const stack = styles.slice(start, end);
  assert.match(stack, /gap:\s*10px/);
  assert.match(styles.slice(end, styles.indexOf('.cb-quick-chips{', end)), /margin:\s*0!important/);
});
