import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nudge } from '../scripts/nudge.mjs';
import { paths } from '../scripts/lib/home.mjs';

test('nudges once a day only when yesterday has no diary', () => {
  const p = paths(fs.mkdtempSync(path.join(os.tmpdir(), 'pd-nudge-')));
  assert.match(nudge('2026-10-29', p), /2026-10-28 has no diary/);
  assert.equal(nudge('2026-10-29', p), '', 'second session same day stays quiet');
  fs.mkdirSync(p.diary, { recursive: true });
  fs.writeFileSync(path.join(p.diary, '2026-10-29.md'), '#');
  assert.equal(nudge('2026-10-30', p), '', 'diary exists');
});
