/* what changed lately, newest first: the major things only, for the ⋯ menu's changelog. written by hand in
   src/data/changelog.txt (a date line, then "- 中文" with the English indented under it) */
import raw from '../data/changelog.txt?raw';

export const CHANGELOG: { date: string; zh: string[]; en: string[] }[] = [];
for (const line of raw.split(/\r?\n/)) {
  const s = line.trim(), cur = CHANGELOG[CHANGELOG.length - 1];
  if (!s || s.startsWith('#')) continue;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) CHANGELOG.push({ date: s, zh: [], en: [] });
  else if (!cur) continue;
  else if (s.startsWith('- ')) { cur.zh.push(s.slice(2).trim()); cur.en.push(s.slice(2).trim()); }
  // the English under a change (a change with none shows its Chinese in both languages)
  else if (cur.zh.length) cur.en[cur.zh.length - 1] = s;
}
