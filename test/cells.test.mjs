import test from 'node:test';
import assert from 'node:assert/strict';
import { gridCells, wordCells } from '../scripts/lib/cells.mjs';
import { maskPaths } from '../scripts/lib/mask.mjs';

test('paragraph starts with an indent cell and pads to a full row', () => {
  const c = gridCells('안녕', 14);
  assert.equal(c.length % 14, 0);
  assert.deepEqual(c.slice(0, 3), [' ', '안', '녕']);
});

test('latin letters go two per cell', () => {
  const c = gridCells('clear', 14).filter(Boolean);
  assert.deepEqual(c.slice(1), ['cl', 'ea', 'r']);
});

test('punctuation never starts a row and a space never starts a row', () => {
  // 13 chars after the indent fill row 1 exactly, so the "." would start row 2
  const c = gridCells('가나다라마바사아자차카타파.', 14);
  assert.equal(c[13], '파.');
  assert.equal(c.length, 14);
  const d = gridCells('가나다라마바사아자차카타파 하', 14);
  assert.equal(d[14], '하');
});

test('each paragraph restarts on a fresh row (a blank at row start is dropped)', () => {
  const c = gridCells('가\n나', 14);
  assert.equal(c.length, 28);
  assert.equal(c[14], '나');
});

test('english: one word per cell, long words are cut, paragraphs pad', () => {
  const c = wordCells('a bb ccc\nsupercalifragilistic', 6, 12);
  assert.deepEqual(c.slice(0, 3), ['a', 'bb', 'ccc']);
  assert.equal(c.length, 12);
  assert.equal(c[6], 'supercalifra-');
});

test('maskPaths hides user names in paths', () => {
  assert.equal(maskPaths('see /Users/alice/proj/x.js and /home/bob/y'), 'see ~/proj/x.js and ~/y');
  assert.equal(maskPaths('C:\\Users\\carol\\app'), '~\\app');
});
