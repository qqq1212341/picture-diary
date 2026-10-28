import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { collect, summarizeSession, isCorrection, dayRange } from '../scripts/collect.mjs';

test('an empty day does not crash and reports zeros', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-empty-'));
  const r = collect('2026-01-01', { cwd: empty, dir: path.join(empty, 'nope') });
  assert.equal(r.sessions.count, 0);
  assert.equal(r.commits.count, 0);
  assert.equal(r.suggested.weather, 'sun');
  assert.equal(r.suggested.grade, 'good');
});

test('session slice counts tokens once per message, errors and corrections', () => {
  const [t0, t1] = dayRange('2026-01-01');
  const at = new Date(t0 + 3600e3).toISOString();
  const L = JSON.stringify;
  const s = summarizeSession([
    L({ type: 'user', timestamp: at, message: { content: 'build it' } }),
    L({ type: 'assistant', timestamp: at, message: { id: 'm', usage: { input_tokens: 2, output_tokens: 5 } } }),
    L({ type: 'assistant', timestamp: at, message: { id: 'm', usage: { input_tokens: 2, output_tokens: 5 } } }),
    L({ type: 'user', timestamp: at, message: { content: [{ type: 'tool_result', is_error: true }] } }),
    L({ type: 'user', timestamp: at, message: { content: 'wrong, I said use the other file' } }),
    'not json',
  ], [t0, t1]);
  assert.equal(s.tokens.out, 5);
  assert.equal(s.toolErrors, 1);
  assert.equal(s.corrections.length, 1);
});

test('correction heuristic works in Korean and English and ignores normal messages', () => {
  assert.ok(isCorrection('아니 그게 아니라 다시 해줘'));
  assert.ok(isCorrection("Don't touch the config"));
  assert.ok(!isCorrection('looks good, continue'));
  assert.ok(!isCorrection('좋아 계속 진행해'));
});

test('reads sessions from a projects dir and git commits/reverts from cwd', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-col-'));
  const dir = path.join(root, 'projects', 'p'); fs.mkdirSync(dir, { recursive: true });
  const [t0] = dayRange('2026-02-03');
  const ts = new Date(t0 + 7200e3).toISOString();
  fs.writeFileSync(path.join(dir, 's.jsonl'), JSON.stringify({ type: 'user', timestamp: ts, cwd: '/Users/zed/app', message: { content: 'hello' } }) + '\n');
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const env = { ...process.env, GIT_AUTHOR_DATE: ts, GIT_COMMITTER_DATE: ts };
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: repo, env, stdio: 'ignore' });
  git('init', '-q'); fs.writeFileSync(path.join(repo, 'a'), '1'); git('add', '.'); git('commit', '-qm', 'first');
  git('commit', '-q', '--allow-empty', '-m', 'Revert "first"');
  const r = collect('2026-02-03', { cwd: repo, dir: path.join(root, 'projects') });
  assert.equal(r.sessions.count, 1);
  assert.equal(r.commits.count, 2);
  assert.equal(r.commits.reverts.length, 1);
  assert.ok(!JSON.stringify(r).includes('zed'));
});
