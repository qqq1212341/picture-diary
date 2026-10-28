#!/usr/bin/env node
// Objective signals for one day, from Claude Code's own session logs. No dependencies, nothing leaves the machine.
//
//   collect.mjs [--date YYYY-MM-DD] [--cwd <git repo>] [--top 10] [--no-mask]   -> JSON on stdout
//   collect.mjs --selftest
//
// Reads <CLAUDE_CONFIG_DIR or ~/.claude>/projects/**/*.jsonl and `git log` of --cwd (default: current dir).
// An empty day is a normal day: you get zeros, not an error.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ymd } from './lib/home.mjs';
import { maskPaths } from './lib/mask.mjs';

const projectsDir = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');

/** Local-time [start, end) of a calendar day, in ms. */
export function dayRange(date) {
  const [y, m, d] = date.split('-').map(Number);
  return [new Date(y, m - 1, d).getTime(), new Date(y, m - 1, d + 1).getTime()];
}

const textOf = (c) => typeof c === 'string' ? c
  : Array.isArray(c) ? c.filter((x) => x && x.type === 'text').map((x) => x.text).join('\n') : '';

const clean = (t) => t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').replace(/\s+/g, ' ').trim();

function isPrompt(d) {
  if (d.type !== 'user' || d.isMeta || d.isSidechain) return false;
  const c = d.message?.content;
  if (Array.isArray(c) && c.some((x) => x?.type === 'tool_result')) return false;
  const t = textOf(c).trim();
  return !!t && !t.startsWith('<command-') && !t.startsWith('<local-command') && !t.startsWith('Caveat:');
}

// Heuristic: the user is correcting the agent. Deliberately conservative - short messages that START like a correction.
const CORRECTION = [
  /^(아니|아냐|그게 아니|그거 말고|다시 해|다시 하|왜 (이래|안|그렇게)|틀렸|잘못|그만|하지 ?마|되돌려|취소|내가 (말|시킨)|말했잖)/,
  /^(no[,.! ]|nope|that'?s not|that is not|wrong|not what i|i said|i asked|don'?t |do not |stop[,.! ]|undo|revert|why did you|why are you|you (forgot|missed|broke))/i,
];
export const isCorrection = (t) => t.length <= 300 && CORRECTION.some((re) => re.test(t.trim()));

const COMPACT = /^This session is being continued from a previous conversation|^\[?Previous conversation (summary|compacted)|^<summary>/i;

/** One jsonl file (array of lines) -> summary of that day's slice, or null if nothing happened that day. */
export function summarizeSession(lines, [t0, t1]) {
  const s = { prompts: [], corrections: [], tokens: { in: 0, cacheRead: 0, cacheWrite: 0, out: 0 },
    toolErrors: 0, stopHook: 0, compactions: 0, first: null, last: null, cwd: null };
  const seen = new Set();
  for (const l of lines) {
    let d; try { d = JSON.parse(l); } catch { continue; }
    const ts = Date.parse(d.timestamp || '');
    if (!(ts >= t0 && ts < t1)) continue;
    s.first ??= ts; s.last = ts; s.cwd ??= d.cwd;
    if (d.type === 'assistant') {
      const m = d.message || {};
      if (m.id && !seen.has(m.id) && m.usage) {
        seen.add(m.id); const u = m.usage;
        s.tokens.in += u.input_tokens || 0; s.tokens.out += u.output_tokens || 0;
        s.tokens.cacheRead += u.cache_read_input_tokens || 0; s.tokens.cacheWrite += u.cache_creation_input_tokens || 0;
      }
    } else if (d.type === 'user') {
      const c = d.message?.content;
      if (Array.isArray(c)) s.toolErrors += c.filter((x) => x?.type === 'tool_result' && x.is_error).length;
      const t = textOf(c);
      if (/Stop hook feedback/i.test(t)) s.stopHook++;
      else if (COMPACT.test(t.trim()) || d.isCompactSummary) s.compactions++;
      else if (isPrompt(d)) {
        const p = clean(t);
        s.prompts.push(p.slice(0, 200));
        if (isCorrection(p)) s.corrections.push(p.slice(0, 200));
      }
    } else if (d.type === 'summary') s.compactions++;
  }
  return s.first == null ? null : s;
}

function walk(dir, out = []) {
  let list; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of list) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

/** Spread the sample so it is not just the first N prompts of the busiest session. */
const sample = (arr, n) => arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.floor(i * arr.length / n)]);

export function sessionsFor(range, top = 10, dir = projectsDir()) {
  const all = [];
  for (const f of walk(dir)) {
    let st; try { st = fs.statSync(f); } catch { continue; }
    if (st.mtimeMs < range[0]) continue;
    let s; try { s = summarizeSession(fs.readFileSync(f, 'utf8').split('\n'), range); } catch { continue; }
    if (!s) continue;
    all.push({ file: path.relative(dir, f), sub: f.includes(`${path.sep}subagents${path.sep}`), ...s,
      minutes: Math.round((s.last - s.first) / 6e4) });
  }
  const main = all.filter((s) => !s.sub);
  const sum = (k) => all.reduce((a, s) => a + s.tokens[k], 0);
  const pick = (s) => ({ file: s.file, minutes: s.minutes, toolErrors: s.toolErrors, stopHook: s.stopHook,
    promptCount: s.prompts.length, firstPrompt: s.prompts[0] || null, project: path.basename(s.cwd || '') || null });
  return {
    count: main.length, subagents: all.length - main.length,
    promptCount: main.reduce((a, s) => a + s.prompts.length, 0),
    promptSample: sample(main.flatMap((s) => s.prompts.slice(0, 3)), 12),
    tokens: { out: sum('out'), in: sum('in'), cacheWrite: sum('cacheWrite'), cacheRead: sum('cacheRead') },
    corrections: { count: main.reduce((a, s) => a + s.corrections.length, 0),
      samples: main.flatMap((s) => s.corrections.slice(0, 2)).slice(0, 8) },
    compactions: main.reduce((a, s) => a + s.compactions, 0),
    mostErrors: [...main].sort((a, b) => b.toolErrors - a.toolErrors).filter((s) => s.toolErrors >= 5).slice(0, top).map(pick),
    stopHookLoops: main.filter((s) => s.stopHook >= 2).slice(0, top).map(pick),
    longest: [...main].sort((a, b) => b.minutes - a.minutes).slice(0, 3).map(pick),
  };
}

export function commitsFor(date, cwd) {
  const [t0, t1] = dayRange(date);
  try {
    const out = execFileSync('git', ['log', '--all', `--since=${new Date(t0).toISOString()}`, `--until=${new Date(t1).toISOString()}`,
      '--format=%h\t%s'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const list = out ? out.split('\n').map((l) => { const [h, ...r] = l.split('\t'); return { h, s: r.join('\t') }; }) : [];
    return { repo: path.basename(cwd), count: list.length, reverts: list.filter((c) => /^revert\b|revert|되돌/i.test(c.s)), list: list.slice(0, 40) };
  } catch { return { repo: null, count: 0, reverts: [], list: [] }; }
}

/** Suggested weather and stamp. A starting point for the agent, not a verdict. */
export function suggest({ sessions: s, commits: c }) {
  const storm = c.reverts.length >= 2 || s.stopHookLoops.length >= 2;
  const rain = s.mostErrors.length >= 1 || s.corrections.count >= 3;
  const weather = storm ? 'storm' : rain ? 'rain' : s.compactions >= 1 ? 'fog' : s.corrections.count >= 1 ? 'cloud' : 'sun';
  const loss = 2 * c.reverts.length + 2 * s.stopHookLoops.length + s.corrections.count + s.mostErrors.length;
  const grade = s.count === 0 ? 'good' : loss === 0 ? 'great' : loss <= 3 ? 'good' : loss <= 7 ? 'try' : 'redo';
  return { weather, grade, loss };
}

export function collect(date, { cwd = process.cwd(), top = 10, mask = true, dir } = {}) {
  const range = dayRange(date);
  const sessions = sessionsFor(range, top, dir);
  const commits = commitsFor(date, cwd);
  const result = { date, sessions, commits, suggested: suggest({ sessions, commits }) };
  return mask ? JSON.parse(maskPaths(JSON.stringify(result))) : result;
}

function selftest() {
  const r = dayRange('2026-10-23');
  const at = (h) => new Date(2026, 9, 23, h).toISOString();
  const L = (o) => JSON.stringify(o);
  const lines = [
    L({ type: 'user', timestamp: at(10), message: { content: 'fix the build' } }),
    L({ type: 'assistant', timestamp: at(10), message: { id: 'a', usage: { input_tokens: 1, output_tokens: 10 } } }),
    L({ type: 'assistant', timestamp: at(10), message: { id: 'a', usage: { input_tokens: 1, output_tokens: 10 } } }),
    L({ type: 'user', timestamp: at(11), message: { content: [{ type: 'tool_result', is_error: true }] } }),
    L({ type: 'user', timestamp: at(12), message: { content: 'No, that is not what I asked' } }),
    L({ type: 'user', timestamp: new Date(2026, 9, 22, 1).toISOString(), message: { content: 'yesterday' } }),
  ];
  const s = summarizeSession(lines, r);
  const ok = s.tokens.out === 10 && s.toolErrors === 1 && s.prompts.length === 2 && s.corrections.length === 1
    && summarizeSession(lines.slice(5), r) === null && isCorrection('아니 그게 아니라 다시 해') && !isCorrection('좋아 계속 해');
  console.log(ok ? 'selftest ok' : `selftest FAIL ${JSON.stringify(s)}`);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  if (a.includes('--selftest')) selftest();
  else console.log(JSON.stringify(collect(arg('--date', ymd()), { cwd: path.resolve(arg('--cwd', process.cwd())),
    top: Number(arg('--top', 10)), mask: !a.includes('--no-mask') }), null, 1));
}
