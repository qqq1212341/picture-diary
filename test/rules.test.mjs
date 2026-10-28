import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { replay, review, graduatedRules, applyBlock, renderBlock, BLOCK_START, BLOCK_END } from '../scripts/rules.mjs';

const hit = (tag, date) => ({ type: 'hit', tag, date });
const rule = (id, tag, created, expires = '2099-01-01') => ({ type: 'rule', id, tag, rule: `rule ${id}`, created, expires });

test('same mistake on two different days becomes a candidate; same day twice does not', () => {
  assert.equal(review([hit('x', '2026-01-01'), hit('x', '2026-01-01')], '2026-01-02').candidates.length, 0);
  const r = review([hit('x', '2026-01-01'), hit('x', '2026-01-03')], '2026-01-04');
  assert.deepEqual(r.candidates.map((t) => t.tag), ['x']);
});

test('a tag that already has a live rule is no longer a candidate', () => {
  const ev = [hit('x', '2026-01-01'), hit('x', '2026-01-02'), rule('r001', 'x', '2026-01-02')];
  assert.equal(review(ev, '2026-01-03').candidates.length, 0);
});

test('graduates after 14 quiet days, not before', () => {
  const ev = [hit('x', '2026-01-01'), hit('x', '2026-01-02'), rule('r001', 'x', '2026-01-02')];
  assert.equal(review(ev, '2026-01-15').graduate.length, 0);
  assert.equal(review(ev, '2026-01-16').graduate.length, 1);
});

test('retires when it did not reduce repeats', () => {
  const ev = [hit('x', '2026-01-01'), hit('x', '2026-01-02'), rule('r001', 'x', '2026-01-02'),
    hit('x', '2026-01-05'), hit('x', '2026-01-06')];
  const r = review(ev, '2026-01-07');
  assert.equal(r.retire.length, 1);
  assert.match(r.retire[0].reason, /did not help/);
});

test('one repeat after the rule, fewer than before, keeps it on probation', () => {
  const ev = [hit('x', '2026-01-01'), hit('x', '2026-01-02'), rule('r001', 'x', '2026-01-02'), hit('x', '2026-01-05')];
  const r = review(ev, '2026-01-30');
  assert.equal(r.retire.length, 0);
  assert.equal(r.graduate.length, 0);
});

test('expiry retires an unproven rule', () => {
  const ev = [rule('r001', 'x', '2026-01-01', '2026-02-01')];
  assert.equal(review(ev, '2026-02-02').retire.length, 1);
});

test('graduated rules are capped and retired ones leave the block', () => {
  const ev = [];
  for (let i = 1; i <= 12; i++) {
    const id = `r${String(i).padStart(3, '0')}`;
    ev.push(rule(id, `t${i}`, '2026-01-01'), { type: 'state', id, state: 'graduated', date: `2026-02-${String(i).padStart(2, '0')}` });
  }
  ev.push({ type: 'state', id: 'r012', state: 'retired', date: '2026-03-01' });
  const list = graduatedRules(ev, '2026-03-02', 10);
  assert.equal(list.length, 10);
  assert.ok(!list.some((r) => r.id === 'r012'));
});

test('applyBlock appends once, then replaces in place and keeps surrounding text', () => {
  const rules = [{ rule: 'run tests before saying done' }];
  const once = applyBlock('# My project\n', rules);
  assert.ok(once.includes(BLOCK_START) && once.includes('- run tests before saying done'));
  const twice = applyBlock(once + '\nfooter\n', [{ rule: 'new rule' }]);
  assert.equal(twice.split(BLOCK_START).length, 2);
  assert.ok(twice.includes('- new rule') && !twice.includes('run tests') && twice.includes('footer'));
  assert.ok(renderBlock([]).includes(BLOCK_END));
});

test('CLI lifecycle end to end in a temp home', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-'));
  const run = (...a) => execFileSync('node', [path.resolve('scripts/rules.mjs'), ...a], { env: { ...process.env, PICTURE_DIARY_HOME: home }, encoding: 'utf8' });
  run('hit', 'forgot-tests', '--date', '2026-01-01');
  assert.match(run('hit', 'forgot-tests', '--date', '2026-01-02'), /CANDIDATE/);
  run('add', '--tag', 'forgot-tests', '--rule', 'Run the tests before saying done.', '--date', '2026-01-02');
  assert.match(run('review', '--today', '2026-01-20', '--apply'), /GRADUATE/);
  const md = path.join(home, 'CLAUDE.md');
  run('sync', '--file', md, '--today', '2026-01-20');
  assert.match(fs.readFileSync(md, 'utf8'), /Run the tests before saying done\./);
  assert.match(run('status', '--today', '2026-01-20'), /\[graduated\]/);
  assert.equal(replay(JSON.parse('[]')).rules.length, 0);
});

test('regression guard: a graduated rule whose mistake returns goes back on probation, then can graduate again', () => {
  const base = [hit('x', '2026-01-01'), hit('x', '2026-01-02'), rule('r001', 'x', '2026-01-02'),
    { type: 'state', id: 'r001', state: 'graduated', date: '2026-01-16' }];
  assert.equal(review(base, '2026-01-20').regress.length, 0);
  const back = [...base, hit('x', '2026-01-21')];
  assert.match(review(back, '2026-01-22').regress[0].reason, /regressed/);
  const onProbation = [...back, { type: 'state', id: 'r001', state: 'active', date: '2026-01-22' }];
  assert.equal(graduatedRules(onProbation, '2026-01-23').length, 0, 'leaves CLAUDE.md');
  assert.equal(review(onProbation, '2026-01-23').retire.length, 0, 'not retired for the old repeat');
  assert.equal(review(onProbation, '2026-02-05').graduate.length, 1, '14 quiet days after regressing');
});
