// Share helpers: the wide card (1200x630, X / LinkedIn / link previews) and copy-to-clipboard.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const INSTALL = 'github.com/qqq1212341/picture-diary';

/** Wide card = the finished portrait page on the left, the day in one line on the right, install line at the bottom. */
export function wideHtml(entry, pagePng, lang = 'ko') {
  const en = lang === 'en';
  const img = `data:image/png;base64,${fs.readFileSync(pagePng).toString('base64')}`;
  const label = en ? "Today's waste" : '오늘의 낭비';
  const by = en ? "my coding agent's picture diary" : '내 코딩 에이전트의 그림일기';
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=Nanum+Pen+Script&display=block" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:#e9dfc9;display:flex;font-family:Gaegu}
.l{width:470px;padding:22px 0 22px 34px}.l img{height:586px;transform:rotate(-2deg);box-shadow:0 10px 24px rgba(80,60,20,.25);border-radius:4px}
.r{flex:1;padding:58px 56px 40px 40px;display:flex;flex-direction:column}
.k{font-size:30px;color:#9a6a3a;font-weight:700}.t{font-family:'Nanum Pen Script';font-size:${en ? 78 : 92}px;line-height:1.05;color:#222;margin:10px 0 18px}
.c{font-family:'Nanum Pen Script';font-size:52px;color:#d6362b;transform:rotate(-2deg)}.f{font-size:26px;color:#7d7058;margin-top:auto}
.i{margin-top:14px;font-family:ui-monospace,Menlo,monospace;font-size:24px;white-space:nowrap;background:#2b2b2b;color:#f3e9d2;padding:12px 16px;border-radius:8px}
.b{font-size:24px;color:#7d7058}</style></head><body>
<div class="l"><img src="${img}"></div>
<div class="r"><div class="k">${label} · ${esc(entry.date)}</div><div class="t">${esc(entry.title)}</div>
${entry.teacher?.comment ? `<div class="c">${esc(entry.teacher.comment)}</div>` : ''}
<div class="f"><div class="b">${by}</div>${entry.footer ? esc(entry.footer) : ''}</div><div class="i">${INSTALL}</div></div>
</body></html>`;
}

/** Put a PNG on the clipboard. Returns true when it worked. */
export function copyPng(file) {
  try {
    if (process.platform === 'darwin') {
      execFileSync('osascript', ['-e', `set the clipboard to (read (POSIX file "${file.replace(/"/g, '\\"')}") as «class PNGf»)`]);
    } else if (process.platform === 'win32') {
      execFileSync('powershell', ['-NoProfile', '-Command',
        `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${file.replace(/'/g, "''")}'))`]);
    } else {
      try { execFileSync('wl-copy', ['--type', 'image/png'], { input: fs.readFileSync(file) }); }
      catch { execFileSync('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-i', file]); }
    }
    return true;
  } catch { return false; }
}
