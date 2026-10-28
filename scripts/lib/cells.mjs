// Manuscript-paper ("wongoji") cell splitting.

/**
 * Korean / CJK: one character per cell. Latin letters and digits go two per cell.
 * A paragraph starts with one blank cell (indent). A space never starts a row.
 * . , ! ? that would start a row is tucked into the last cell of the previous row.
 */
export function gridCells(text, cols = 14) {
  const cells = [];
  for (const para of String(text).split('\n')) {
    const chars = [' ', ...(para.trim().match(/[A-Za-z0-9]{1,2}|./gu) || [])];
    for (const ch of chars) {
      const atLineStart = cells.length % cols === 0 && cells.length;
      if (ch === ' ' && atLineStart) continue;
      if (/[.,!?]/.test(ch) && atLineStart) { cells[cells.length - 1] += ch; continue; }
      cells.push(ch);
    }
    while (cells.length % cols) cells.push('');
  }
  return cells;
}

/** English: one word per cell. Words longer than `max` are cut into pieces. */
export function wordCells(text, cols = 6, max = 12) {
  const cells = [];
  for (const para of String(text).split('\n')) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    for (const w of words) {
      for (let i = 0; i < w.length; i += max) cells.push(w.slice(i, i + max) + (i + max < w.length ? '-' : ''));
    }
    while (cells.length % cols) cells.push('');
  }
  return cells;
}
