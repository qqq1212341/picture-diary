#!/usr/bin/env node
// SessionStart hook: once a day, if yesterday has no diary yet, remind the agent to write it.
// Cheap on purpose (no log parsing) - it runs at the start of every session.
// Silence it with PICTURE_DIARY_NUDGE=0.
import fs from 'node:fs';
import path from 'node:path';
import { paths, ymd, addDays } from './lib/home.mjs';

export function nudge(today = ymd(), p = paths()) {
  if (process.env.PICTURE_DIARY_NUDGE === '0') return '';
  const yesterday = addDays(today, -1);
  if (fs.existsSync(path.join(p.diary, `${yesterday}.md`))) return '';
  const stamp = path.join(p.home, '.nudged');
  try { if (fs.readFileSync(stamp, 'utf8').trim() === today) return ''; } catch { /* first time */ }
  fs.mkdirSync(p.home, { recursive: true });
  fs.writeFileSync(stamp, today);
  return `[picture-diary] ${yesterday} has no diary yet. When the user's first task is done (or if they ask), ` +
    `offer once: "Shall I write yesterday's picture diary?" and if yes run the picture-diary:diary skill for ${yesterday}. Do not interrupt urgent work.`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { const msg = nudge(); if (msg) console.log(msg); } catch { /* never block a session */ }
}
