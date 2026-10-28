// Mask local paths and user names before anything leaves the machine.
import os from 'node:os';

export function maskPaths(s) {
  if (s == null) return s;
  let out = String(s);
  const h = os.homedir();
  if (h && h.length > 1) out = out.split(h).join('~');
  return out
    .replace(/\/Users\/[^/\s'"]+/g, '~')
    .replace(/\/home\/[^/\s'"]+/g, '~')
    .replace(/[A-Za-z]:\\Users\\[^\\\s'"]+/g, '~');
}
