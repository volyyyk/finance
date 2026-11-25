const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('service worker extends fetch lifetime synchronously before async work', () => {
  const source = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const fetchHandler = source.slice(source.indexOf("self.addEventListener('fetch'"));
  const waitUntil = fetchHandler.indexOf('event.waitUntil(revalidate)');
  const respondWith = fetchHandler.indexOf('event.respondWith(');
  assert.ok(waitUntil >= 0, 'fetch handler must register background revalidation');
  assert.ok(respondWith >= 0, 'fetch handler must provide a response');
  assert.ok(waitUntil < respondWith, 'waitUntil must be called synchronously before async response work');
  assert.match(fetchHandler, /const revalidate\s*=\s*cachePromise\.then/);
});
