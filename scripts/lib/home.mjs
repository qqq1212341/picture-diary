// Where picture-diary keeps its data. Default ~/.picture-diary, override with PICTURE_DIARY_HOME.
import os from 'node:os';
import path from 'node:path';

export function home() {
  return path.resolve(process.env.PICTURE_DIARY_HOME || path.join(os.homedir(), '.picture-diary'));
}
export const paths = (h = home()) => ({
  home: h,
  diary: path.join(h, 'diary'),
  entries: path.join(h, 'entries'),
  rules: path.join(h, 'rules.jsonl'),
});

/** Local calendar date YYYY-MM-DD. */
export function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** Add n days to a YYYY-MM-DD string (calendar math, no timezone drift). */
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}
export function daysBetween(a, b) {
  const t = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 864e5);
}
