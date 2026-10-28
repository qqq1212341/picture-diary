#!/usr/bin/env node
// Rules ledger: a lesson must prove itself before it is allowed into CLAUDE.md.
//
//   rules.mjs hit <tag> [--date D]             record that a mistake happened today
//   rules.mjs add --tag T --rule "..." [--source diary/D.md] [--expires D] [--date D]
//   rules.mjs status [--json]                  every tag and rule with before/after counts
//   rules.mjs review [--apply]                 candidates / graduates / retirements (dry run unless --apply)
//   rules.mjs sync [--file CLAUDE.md] [--max 10] [--dry-run]   write graduated rules into a marked block
//
// Ledger = <home>/rules.jsonl, append-only events:
//   {"type":"hit","tag","date"}  {"type":"rule","id","tag","rule","source","created","expires"}
//   {"type":"state","id","state":"graduated|retired|active","date","reason"}   (active = regressed back to probation)
//
// Lifecycle:  hit -> hit (2 days) = CANDIDATE -> add = ACTIVE (on probation)
//             ACTIVE + 14 days with 0 repeats = GRADUATED (earns a place in CLAUDE.md)
//             ACTIVE/GRADUATED + repeats >= repeats before the rule, or past expiry = RETIRED
import fs from 'node:fs';
import path from 'node:path';
import { paths, ymd, addDays, daysBetween } from './lib/home.mjs';

export const GRADUATE_DAYS = 14;
export const DEFAULT_TTL_DAYS = 60;
export const BLOCK_START = '<!-- picture-diary:rules -->';
export const BLOCK_END = '<!-- /picture-diary:rules -->';

export function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}
export function append(file, ev) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(ev) + '\n');
}

/** Replay events into { tags, rules } as of `today`. Pure. */
export function replay(events, today = ymd()) {
  const hitDays = new Map(); // tag -> Set(date)
  const rules = new Map();
  for (const e of events) {
    if (e.type === 'hit') {
      if (!hitDays.has(e.tag)) hitDays.set(e.tag, new Set());
      hitDays.get(e.tag).add(e.date);
    } else if (e.type === 'rule') {
      rules.set(e.id, { ...e, state: 'active' });
    } else if (e.type === 'state' && rules.has(e.id)) {
      Object.assign(rules.get(e.id), { state: e.state, stateDate: e.date, reason: e.reason });
    }
  }
  const ruleList = [...rules.values()].map((r) => {
    const days = [...(hitDays.get(r.tag) || [])];
    const before = days.filter((d) => d <= r.created).length;
    const after = days.filter((d) => d > r.created).length;
    const sinceState = r.stateDate ? days.filter((d) => d > r.stateDate).length : after;
    // A regressed rule restarts probation from the day it regressed.
    if (r.state === 'active' && r.stateDate) return { ...r, before, after: sinceState, sinceState, age: daysBetween(r.stateDate, today) };
    return { ...r, before, after, sinceState, age: daysBetween(r.created, today) };
  });
  const tags = [...hitDays.entries()].map(([tag, set]) => ({
    tag, days: set.size, last: [...set].sort().pop(),
    hasRule: ruleList.some((r) => r.tag === tag && r.state !== 'retired'),
  }));
  return { tags, rules: ruleList };
}

/** What review would do right now. Pure. */
export function review(events, today = ymd()) {
  const { tags, rules } = replay(events, today);
  const candidates = tags.filter((t) => t.days >= 2 && !t.hasRule);
  const graduate = [], retire = [], regress = [];
  for (const r of rules) {
    if (r.state === 'retired') continue;
    // Regression guard: a graduated rule whose mistake comes back goes back on probation.
    if (r.state === 'graduated') {
      if (r.sinceState > 0) regress.push({ r, reason: `regressed: repeated ${r.sinceState}x after graduating ${r.stateDate}` });
      continue;
    }
    if (r.expires && today > r.expires) { retire.push({ r, reason: `expired ${r.expires}` }); continue; }
    if (r.after > 0 && r.after >= r.before) {
      retire.push({ r, reason: `repeated ${r.after}x after the rule (${r.before}x before) - it did not help` });
    } else if (r.state === 'active' && r.age >= GRADUATE_DAYS && r.after === 0) {
      graduate.push({ r, reason: `${r.age} days, 0 repeats (was ${r.before}x before)` });
    }
  }
  return { candidates, graduate, retire, regress };
}

export function graduatedRules(events, today, max = 10) {
  return replay(events, today).rules
    .filter((r) => r.state === 'graduated' && !(r.expires && today > r.expires))
    .sort((a, b) => (b.stateDate || '').localeCompare(a.stateDate || ''))
    .slice(0, max);
}

/** Insert or replace the marked block in `text`. Pure. */
export function renderBlock(rules) {
  const lines = rules.map((r) => `- ${r.rule}`);
  return [BLOCK_START,
    '## Rules that earned their place (picture-diary)',
    ...(lines.length ? lines : ['- (none yet)']),
    '<!-- Rules a machine can check belong in a hook, linter or test, not here. -->',
    BLOCK_END].join('\n');
}
export function applyBlock(text, rules) {
  const block = renderBlock(rules);
  const a = text.indexOf(BLOCK_START), b = text.indexOf(BLOCK_END);
  if (a >= 0 && b > a) return text.slice(0, a) + block + text.slice(b + BLOCK_END.length);
  return text.replace(/\s*$/, '') + (text.trim() ? '\n\n' : '') + block + '\n';
}

// ---------------------------------------------------------------- CLI
const flag = (argv, k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const has = (argv, k) => argv.includes(k);

function main(argv) {
  const [cmd, ...rest] = argv;
  const file = paths().rules;
  const today = flag(rest, '--today') || ymd();
  const date = flag(rest, '--date') || today;
  const events = readEvents(file);

  if (cmd === 'hit') {
    const tag = rest.find((a, i) => !a.startsWith('--') && !(rest[i - 1] || '').startsWith('--'));
    if (!tag) throw new Error('usage: rules.mjs hit <tag> [--date D]');
    const dup = events.some((e) => e.type === 'hit' && e.tag === tag && e.date === date);
    if (!dup) append(file, { type: 'hit', tag, date });
    const t = replay(readEvents(file), today).tags.find((x) => x.tag === tag);
    console.log(`${tag}: seen on ${t.days} day(s)${t.days >= 2 && !t.hasRule ? ' -> rule CANDIDATE, write one with: rules.mjs add' : ''}`);
  } else if (cmd === 'add') {
    const tag = flag(rest, '--tag'), rule = flag(rest, '--rule');
    if (!tag || !rule) throw new Error('usage: rules.mjs add --tag T --rule "..." [--source F] [--expires D]');
    const n = events.filter((e) => e.type === 'rule').length + 1;
    const id = `r${String(n).padStart(3, '0')}`;
    const ev = { type: 'rule', id, tag, rule, source: flag(rest, '--source') || null, created: date,
      expires: flag(rest, '--expires') || addDays(date, DEFAULT_TTL_DAYS) };
    append(file, ev);
    console.log(`${id} added (probation until ${addDays(date, GRADUATE_DAYS)}, expires ${ev.expires})`);
  } else if (cmd === 'status') {
    const s = replay(events, today);
    if (has(rest, '--json')) return console.log(JSON.stringify(s, null, 1));
    if (!s.tags.length && !s.rules.length) return console.log('ledger is empty');
    for (const r of s.rules) console.log(`${r.id} [${r.state}] ${r.tag}: ${r.rule}  (before ${r.before} / after ${r.after}, day ${r.age}, expires ${r.expires})`);
    for (const t of s.tags.filter((x) => !x.hasRule)) console.log(`-- [${t.days >= 2 ? 'candidate' : 'seen'}] ${t.tag}: ${t.days} day(s), last ${t.last}`);
  } else if (cmd === 'review') {
    const r = review(events, today);
    r.candidates.forEach((t) => console.log(`CANDIDATE ${t.tag}: repeated on ${t.days} days - write a rule`));
    r.graduate.forEach(({ r: x, reason }) => console.log(`GRADUATE  ${x.id} ${x.tag}: ${reason}\n          tip: if a hook, linter or test can enforce this, promote it there.`));
    r.retire.forEach(({ r: x, reason }) => console.log(`RETIRE    ${x.id} ${x.tag}: ${reason} - do it over`));
    r.regress.forEach(({ r: x, reason }) => console.log(`REGRESS   ${x.id} ${x.tag}: ${reason} - back to probation, out of CLAUDE.md until it holds again`));
    if (!r.candidates.length && !r.graduate.length && !r.retire.length && !r.regress.length) console.log('nothing to do');
    if (has(rest, '--apply')) {
      r.graduate.forEach(({ r: x, reason }) => append(file, { type: 'state', id: x.id, state: 'graduated', date: today, reason }));
      r.retire.forEach(({ r: x, reason }) => append(file, { type: 'state', id: x.id, state: 'retired', date: today, reason }));
      r.regress.forEach(({ r: x, reason }) => append(file, { type: 'state', id: x.id, state: 'active', date: today, reason }));
    } else if (r.graduate.length || r.retire.length || r.regress.length) console.log('(dry run - add --apply to record)');
  } else if (cmd === 'sync') {
    const target = path.resolve(flag(rest, '--file') || 'CLAUDE.md');
    const list = graduatedRules(events, today, Number(flag(rest, '--max') || 10));
    const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    const after = applyBlock(before, list);
    if (has(rest, '--dry-run')) console.log(renderBlock(list));
    else { fs.writeFileSync(target, after); console.log(`${list.length} rule(s) written to ${target}`); }
  } else {
    console.log('usage: rules.mjs hit|add|status|review|sync  (see header of this file)');
    process.exit(cmd ? 2 : 0);
  }
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
}
