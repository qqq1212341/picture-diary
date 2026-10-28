import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildHtml } from '../scripts/render.mjs';

const entry = (o = {}) => ({ date: '2026-10-23', weather: 'fog', grade: 'redo', title: 't', drawing: '<circle r="5"/>',
  text: 'Short text.', ...o });

test('stamp follows the grade and language', () => {
  assert.match(buildHtml(entry(), { lang: 'en' }).html, /See me<br>after<br>class/);
  assert.match(buildHtml(entry({ grade: 'great' })).html, /참<br>잘했어요/);
});

test('weekday is computed when missing, fog is a weather icon', () => {
  const { html } = buildHtml(entry({ weather: 'fog' }), { lang: 'en' });
  assert.match(html, /<b>Fri<\/b>/);
  assert.match(html, /class="w on"/);
});

test('streak shows only from day 2, paths in text are masked', () => {
  assert.doesNotMatch(buildHtml(entry({ streak: 1 })).html, /일째/);
  assert.match(buildHtml(entry({ streak: 5 })).html, /5일째/);
  assert.doesNotMatch(buildHtml(entry({ text: 'edited /Users/alice/x.js' })).html, /alice/);
});

test('story is taller and keeps the same page structure', () => {
  assert.equal(buildHtml(entry(), { story: true }).height, 1920);
  assert.equal(buildHtml(entry()).height, 1350);
});

test('long text shrinks cells instead of overflowing silently', () => {
  const r = buildHtml(entry({ text: '가'.repeat(400) }));
  assert.equal(r.overflow, true);
});

test('both sample entries are valid and fit', () => {
  for (const [f, lang] of [['docs/sample-ko.json', 'ko'], ['docs/sample-en.json', 'en']]) {
    const r = buildHtml(JSON.parse(fs.readFileSync(f, 'utf8')), { lang });
    assert.equal(r.overflow, false, f);
  }
});
