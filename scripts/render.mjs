#!/usr/bin/env node
// Bake one diary entry into a kid's picture diary page (PNG).
//
//   render.mjs <entry.json> [--lang ko|en] [--story|--wide] [--copy] [--out file.png] [--html] [--no-mask]
//
// entry = { date, weekday?, weather: sun|cloud|rain|storm|fog, grade: great|good|try|redo,
//           title, drawing (SVG inner markup, viewBox 0 0 1000 560), text, teacher?{comment, stamp?},
//           streak?, footer?, lang? }
// The drawing is plain SVG written by the agent (no image API); the crayon texture comes from the template.
// Browser: system Chrome -> Playwright's Chromium -> $PICTURE_DIARY_CHROME -> HTML file with instructions.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { paths, addDays } from './lib/home.mjs';
import { gridCells, wordCells } from './lib/cells.mjs';
import { maskPaths } from './lib/mask.mjs';
import { wideHtml, copyPng } from './lib/share.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const WEATHER = {
  sun: '<circle cx="22" cy="22" r="9" fill="#f4a623"/><g stroke="#f4a623" stroke-width="3" stroke-linecap="round"><path d="M22 4v5M22 35v5M4 22h5M35 22h5M9 9l4 4M31 31l4 4M35 9l-4 4M13 31l-4 4"/></g>',
  cloud: '<path d="M10 30a8 8 0 0 1 2-15 10 10 0 0 1 19 2 7 7 0 0 1 2 13z" fill="#a9b7c6"/>',
  rain: '<path d="M10 24a8 8 0 0 1 2-15 10 10 0 0 1 19 2 7 7 0 0 1 2 13z" fill="#8fa3b8"/><g stroke="#3d7bd9" stroke-width="3" stroke-linecap="round"><path d="M13 30l-2 7M22 30l-2 7M31 30l-2 7"/></g>',
  storm: '<path d="M10 24a8 8 0 0 1 2-15 10 10 0 0 1 19 2 7 7 0 0 1 2 13z" fill="#6b7785"/><path d="M23 26l-6 9h6l-4 8 10-11h-6l4-6z" fill="#f4d03f"/>',
  fog: '<path d="M10 20a7 7 0 0 1 2-13 9 9 0 0 1 17 2 6 6 0 0 1 2 11z" fill="#c3ccd6"/><g stroke="#9aa7b5" stroke-width="3.5" stroke-linecap="round"><path d="M6 27h32M10 33h28M7 39h22"/></g>',
};

const STAMPS = {
  ko: { great: ['참\n잘했어요', 30, '#d6362b'], good: ['잘\n했어요', 34, '#d6362b'], try: ['노력\n해요', 34, '#e07b1a'], redo: ['다시 해\n오세요', 30, '#a31d14'] },
  en: { great: ['Good\njob!', 34, '#d6362b'], good: ['Nice\nwork', 34, '#d6362b'], try: ['Try\nharder', 32, '#e07b1a'], redo: ['See me\nafter\nclass', 25, '#a31d14'] },
};
const WEEKDAYS = { ko: ['일', '월', '화', '수', '목', '금', '토'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const UI = {
  ko: { weather: '날씨', title: '제목:', guardian: '보호자 확인', streak: (n) => `${n}일째 쓰는 중` },
  en: { weather: 'Weather', title: 'Title:', guardian: 'Parent signs', streak: (n) => `Day ${n} in a row` },
};

/** Consecutive days with an entry file ending at `date` (looks next to the entry file). */
export function streakFor(entryPath, date) {
  const dir = path.dirname(entryPath);
  let n = 0;
  for (let d = date; fs.existsSync(path.join(dir, `${d}.json`)); d = addDays(d, -1)) n++;
  return n;
}

export function buildHtml(entry, { lang = 'ko', story = false, mask = true } = {}) {
  const en = lang === 'en';
  const m = mask ? maskPaths : (x) => x;
  const text = m(entry.text), title = m(entry.title), footer = entry.footer && m(entry.footer);
  const ui = UI[lang];
  const H = story ? 1920 : 1350;
  const PAGE_H = H - 40;
  const PIC_H = story ? 640 : 440;
  const COLS = en ? 6 : 14;
  const cells = en ? wordCells(text, COLS) : gridCells(text, COLS);
  // vertical budget (page px): header 68 + title 85 + picture + gap 18 + padding 34 + bottom strip 170
  const avail = PAGE_H - 34 - 68 - 85 - PIC_H - 18 - 170;
  const CAP = story ? 72 : 64;
  // the story page keeps empty ruled rows so the sheet looks like a real worksheet
  const rows = Math.max(en ? 4 : 5, Math.ceil(cells.length / COLS), story ? Math.floor(avail / CAP) : 0);
  const CELL = Math.max(36, Math.min(CAP, Math.floor(avail / rows)));
  const overflow = CELL * rows > avail + 4;
  while (cells.length < rows * COLS) cells.push('');

  const [y, mo, dd] = entry.date.split('-').map(Number);
  const wd = entry.weekday || WEEKDAYS[lang][new Date(y, mo - 1, dd).getDay()];
  const dateHtml = en
    ? `<b>${y}</b>.<b>${mo}</b>.<b>${dd}</b> <b>${esc(wd)}</b>`
    : `<b>${y}</b>년 <b>${mo}</b>월 <b>${dd}</b>일 <b>${esc(wd)}</b>요일`;

  const weatherRow = Object.entries(WEATHER).map(([k, svg]) => `
  <span class="w ${k === entry.weather ? 'on' : ''}"><svg viewBox="0 0 44 44">${svg}</svg>
  ${k === entry.weather ? '<svg class="circ" viewBox="0 0 60 60"><path d="M30 5c16 0 26 10 25 24s-12 26-27 25S4 43 5 28 16 4 33 6" fill="none" stroke="#d6362b" stroke-width="3.5" stroke-linecap="round" filter="url(#crayon)"/></svg>' : ''}</span>`).join('');

  const grade = STAMPS[lang][entry.grade] ? entry.grade : (entry.teacher?.stamp ? null : 'good');
  const [stampText, stampSize, stampColor] = grade ? STAMPS[lang][grade] : [entry.teacher.stamp, en ? 28 : 30, '#d6362b'];
  const comment = entry.teacher?.comment && m(entry.teacher.comment);
  const streak = Number(entry.streak) || 0;
  const cellFont = en ? Math.round(CELL * 0.66) : Math.round(CELL * 0.78);

  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Nanum+Pen+Script&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:${H}px;background:#e9dfc9;display:flex;align-items:center;justify-content:center}
.page{width:1000px;height:${PAGE_H}px;background:#fffdf6;border-radius:6px;position:relative;padding:34px 52px 0;display:flex;flex-direction:column;
  box-shadow:0 2px 0 #d8ccb2,0 12px 30px rgba(80,60,20,.18);
  background-image:radial-gradient(rgba(150,120,60,.06) 1px,transparent 1px);background-size:7px 7px}
.page:before{content:"";position:absolute;left:0;top:0;bottom:0;width:22px;background:repeating-linear-gradient(#fffdf6 0 18px,#cfc3a8 18px 24px);border-radius:6px 0 0 6px;opacity:.55}
.hd{display:flex;align-items:center;justify-content:space-between;font-family:Gaegu,'Nanum Pen Script',cursive;font-weight:700;font-size:38px;color:#333;
  border:3px solid #444;border-bottom:none;padding:10px 20px;border-radius:4px 4px 0 0}
.hd b{color:#1d4fa0;font-family:'Nanum Pen Script',Gaegu,cursive;font-size:50px;font-weight:400;margin:0 4px}
.wx{display:flex;gap:6px;align-items:center}.w{position:relative;width:44px;height:44px;opacity:.35}.w.on{opacity:1}
.w svg{width:44px;height:44px}.w .circ{position:absolute;left:-8px;top:-8px;width:60px;height:60px}
.ti{font-family:Gaegu,'Nanum Pen Script',cursive;font-weight:700;font-size:38px;color:#333;border:3px solid #444;border-bottom:none;padding:8px 20px;white-space:nowrap;overflow:hidden}
.ti b{font-family:'Nanum Pen Script',Gaegu,cursive;font-size:56px;font-weight:400;color:#222;margin-left:10px}
.pic{border:3px solid #444;height:${PIC_H}px;flex:none;background:#fff;position:relative;overflow:hidden}
.pic svg{width:100%;height:100%}
.grid{display:grid;grid-template-columns:repeat(${COLS},1fr);border-left:3px solid #444;border-top:3px solid #444;margin-top:18px}
.grid i{font-style:normal;height:${CELL}px;border-right:2px solid #7aa5d6;border-bottom:2px solid #7aa5d6;overflow:hidden;white-space:nowrap;
  display:flex;align-items:center;justify-content:center;font-family:'Nanum Pen Script',Gaegu,cursive;font-size:${cellFont}px;line-height:1;color:#262626}
.grid i:nth-child(${COLS}n){border-right:3px solid #444}
.strip{position:absolute;left:66px;right:64px;bottom:34px;height:136px;display:flex;align-items:flex-end;gap:18px}
.cm{flex:1;font-family:'Nanum Pen Script',Gaegu,cursive;font-size:46px;line-height:1.05;color:#d6362b;transform:rotate(-2deg);padding-bottom:4px}
.cm small{display:block;font-family:Gaegu,cursive;font-size:24px;color:#6b5f48;transform:none;margin-top:8px}
.guard{width:190px;height:96px;border:2px dashed #8a7d62;border-radius:4px;font-family:Gaegu,cursive;font-size:22px;color:#8a7d62;padding:6px 10px;margin-bottom:8px}
.guard:after{content:"";display:block;margin-top:34px;border-bottom:2px solid #b3a78d}
.stamp{flex:none;width:130px;height:130px;border:6px solid ${stampColor};border-radius:${grade === 'redo' ? '14px' : '50%'};color:${stampColor};
  font-family:Gaegu,cursive;font-weight:700;font-size:${stampSize}px;line-height:1.05;display:flex;align-items:center;justify-content:center;text-align:center;
  transform:rotate(-14deg);opacity:.82;mix-blend-mode:multiply;filter:url(#crayon)}
.ft{position:absolute;left:66px;bottom:10px;font-family:Gaegu,cursive;font-size:22px;color:#9a8d72}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><defs>
  <filter id="crayon" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="5" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="7" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.45" result="m"/>
    <feComposite in="d" in2="m" operator="in"/>
  </filter>
</defs></svg>
<div class="page">
  <div class="hd"><span>${dateHtml}</span><span class="wx">${ui.weather} ${weatherRow}</span></div>
  <div class="ti">${ui.title}<b>${esc(title)}</b></div>
  <div class="pic"><svg viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice"><g filter="url(#crayon)" stroke-linecap="round" stroke-linejoin="round">${entry.drawing}</g></svg></div>
  <div class="grid">${cells.map((c) => `<i${en && c.length > 5 ? ` style="font-size:${Math.min(cellFont, Math.floor(160 / (c.length * 0.5)))}px"` : ''}>${esc(c)}</i>`).join('')}</div>
  <div class="strip">
    <div class="cm">${comment ? esc(comment) : ''}${streak > 1 ? `<small>${esc(ui.streak(streak))}</small>` : ''}</div>
    <div class="guard">${ui.guardian}</div>
    <div class="stamp">${esc(stampText).replace(/\n/g, '<br>')}</div>
  </div>
  ${footer ? `<div class="ft">${esc(footer)}</div>` : ''}
</div></body></html>`;
  return { html, width: 1080, height: H, overflow, rows, cell: CELL };
}

// Known browser binaries, so a machine with Brave/Edge/Chromium but no Chrome still renders.
const BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

async function launch(chromium) {
  const tries = [];
  if (process.env.PICTURE_DIARY_CHROME) tries.push(() => chromium.launch({ executablePath: process.env.PICTURE_DIARY_CHROME }));
  tries.push(() => chromium.launch({ channel: 'chrome' }), () => chromium.launch());
  for (const b of BROWSERS) if (fs.existsSync(b)) tries.push(() => chromium.launch({ executablePath: b }));
  for (const t of tries) { try { return await t(); } catch { /* next */ } }
  return null;
}

// First run inside an installed plugin has no node_modules. Install playwright-core once into the
// data folder (not the plugin folder, which updates wipe) and, if no browser exists, its headless shell.
function runtimeDir() { return path.join(paths().home, '.runtime'); }

async function loadChromium(root) {
  try { return (await import('playwright-core')).chromium; } catch { /* try runtime */ }
  const rt = runtimeDir();
  const entry = path.join(rt, 'node_modules', 'playwright-core', 'index.mjs');
  if (!fs.existsSync(entry)) {
    if (process.env.PICTURE_DIARY_NO_INSTALL) return null;
    console.error('first run: installing playwright-core (about 10 MB, once)...');
    fs.mkdirSync(rt, { recursive: true });
    try { execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--silent', '--prefix', rt, 'playwright-core@^1.50.0'], { stdio: 'inherit', shell: process.platform === 'win32' }); }
    catch { console.error(`could not install. Run: npm install --omit=dev --prefix "${root}"`); return null; }
  }
  return (await import(pathToFileURL(entry).href)).chromium;
}

function installHeadlessShell() {
  if (process.env.PICTURE_DIARY_NO_INSTALL) return false;
  const cli = path.join(runtimeDir(), 'node_modules', 'playwright-core', 'cli.js');
  if (!fs.existsSync(cli)) return false;
  console.error('no Chrome/Edge/Brave found: downloading a headless Chromium (about 100 MB, once)...');
  try { execFileSync(process.execPath, [cli, 'install', 'chromium-headless-shell'], { stdio: 'inherit' }); return true; }
  catch { return false; }
}

export async function main(argv) {
  const flag = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const src = argv.find((a, i) => !a.startsWith('--') && !['--out', '--lang'].includes(argv[i - 1]));
  if (!src) { console.error('usage: render.mjs <entry.json> [--lang ko|en] [--story|--wide] [--copy] [--out file.png] [--html] [--no-mask]'); process.exit(2); }
  const srcPath = path.resolve(src);
  const entry = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  const lang = flag('--lang') || entry.lang || 'ko';
  const story = argv.includes('--story');
  if (entry.streak == null && /^\d{4}-\d{2}-\d{2}\.json$/.test(path.basename(srcPath))) entry.streak = streakFor(srcPath, entry.date);
  const wide = argv.includes('--wide');
  const suffix = `${lang === 'en' ? '.en' : ''}${story ? '.story' : ''}${wide ? '.wide' : ''}.png`;
  const p = paths();
  const inHome = path.dirname(srcPath) === p.entries;
  const out = path.resolve(flag('--out') || path.join(inHome ? p.diary : path.dirname(srcPath), path.basename(srcPath, '.json') + suffix));
  const built = buildHtml(entry, { lang, story, mask: !argv.includes('--no-mask') });
  if (built.overflow) console.error(`warning: text needs ${built.rows} rows at ${built.cell}px - shorten it so nothing is cramped`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const htmlFile = out.replace(/\.png$/, '.html');
  if (argv.includes('--html')) fs.writeFileSync(htmlFile, built.html);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const chromium = await loadChromium(root);
  let browser = chromium ? await launch(chromium) : null;
  if (chromium && !browser && installHeadlessShell()) browser = await launch(chromium);
  if (!browser) {
    fs.writeFileSync(htmlFile, built.html);
    console.error(`No browser found. Wrote ${htmlFile} - open it and print/screenshot at ${built.width}x${built.height},\n` +
      'or install Google Chrome, or run `npx playwright-core install chromium`, or set PICTURE_DIARY_CHROME=/path/to/chrome.');
    process.exit(3);
  }
  const page = await browser.newPage({ viewport: { width: built.width, height: built.height }, deviceScaleFactor: 1 });
  await page.setContent(built.html, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => page.setContent(built.html));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  if (wide) { // the wide card frames the finished page, so render the page first, then the card around it
    const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await card.setContent(wideHtml(entry, out, lang), { waitUntil: 'networkidle', timeout: 20000 }).catch(() => card.setContent(wideHtml(entry, out, lang)));
    await card.evaluate(() => document.fonts.ready);
    await card.screenshot({ path: out });
  }
  await browser.close();
  console.log(out);
  if (argv.includes('--copy')) console.error(copyPng(out) ? 'copied to clipboard' : 'could not copy (install xclip or wl-copy on Linux)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
