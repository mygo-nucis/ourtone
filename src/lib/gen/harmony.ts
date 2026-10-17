/* harmony for the generator: chords written as roman numerals relative to the key's tonic, and voicings that move
   as little as they can from one chord to the next. */

export type Quality = 'maj' | 'min' | 'maj7' | 'min7' | 'dom7' | 'maj9' | 'min9' | 'add9' | 'sus2' | 'sus4' | 'dim' | 'hdim7' | 'maj6' | 'min6' | 'dom9';
export const INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], maj9: [0, 4, 7, 11, 14], min9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14], sus2: [0, 2, 7], sus4: [0, 5, 7], dim: [0, 3, 6], hdim7: [0, 3, 6, 10], maj6: [0, 4, 7, 9], min6: [0, 3, 7, 9], dom9: [0, 4, 7, 10, 14]
};
/** a chord: its root in semitones above the tonic, and its quality */
export interface Chord { root: number; q: Quality; name: string }

const NUM: Record<string, number> = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };
/** 'IVmaj7', 'vi7', 'bVII', '#iv°'... upper case is major, lower case minor; suffixes add sevenths and colours */
export function parseChord(sym: string): Chord {
  const m = /^([b#]?)([ivIV]+)(.*)$/.exec(sym.trim());
  if (!m) throw new Error('bad chord ' + sym);
  const acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0, num = m[2], suf = m[3], upper = num === num.toUpperCase();
  const root = ((NUM[num.toLowerCase()] + acc) % 12 + 12) % 12;
  const q: Quality = upper
    ? ({ '': 'maj', '7': 'dom7', maj7: 'maj7', maj9: 'maj9', add9: 'add9', sus4: 'sus4', sus2: 'sus2', '6': 'maj6', '9': 'dom9' } as Record<string, Quality>)[suf] ?? 'maj'
    : ({ '': 'min', '7': 'min7', '9': 'min9', '6': 'min6', 'o': 'dim', 'ø7': 'hdim7' } as Record<string, Quality>)[suf] ?? 'min';
  return { root, q, name: sym };
}
export const parseProg = (s: string) => s.trim().split(/\s+/).map(parseChord);

/** pitch classes of a chord in a key */
export const tonesOf = (c: Chord, tonic: number) => INTERVALS[c.q].map(x => (tonic + c.root + x) % 12);

/** a voicing of the chord between lo and hi, as close as it can be to the last one (fewest semitones moved);
    `size` notes, the root not always at the bottom */
export function voice(c: Chord, tonic: number, lo: number, hi: number, prev: number[] | null, size = 4): number[] {
  const pcs = INTERVALS[c.q].map(x => (tonic + c.root + x) % 12);
  // the colour notes first (third, seventh, ninth), then the root; the fifth goes when there is no room
  const order = [1, 3, 4, 0, 2].filter(k => k < pcs.length).map(k => pcs[k]);
  const want = order.slice(0, Math.min(size, pcs.length));
  const cands: number[][] = [];
  // every inversion stacked upward from each start near the bottom of the range
  for (let base = lo; base < lo + 12; base++) {
    if (!want.includes(base % 12)) continue;
    const out = [base];
    const rest = want.filter(p => p !== base % 12);
    let cur = base;
    for (const _ of rest) {
      let best = -1;
      for (let q = cur + 1; q <= cur + 12; q++) if (rest.includes(q % 12) && !out.some(o => o % 12 === q % 12)) { best = q; break; }
      if (best < 0) break;
      out.push(best); cur = best;
    }
    if (out.length === want.length && out[out.length - 1] <= hi) cands.push(out);
    // the same shape an octave up, if it fits
    if (out.length === want.length && out[out.length - 1] + 12 <= hi) cands.push(out.map(x => x + 12));
  }
  if (!cands.length) return want.map(pc => lo + ((pc - lo) % 12 + 12) % 12).sort((a, b) => a - b);
  if (!prev) {
    const mid = (lo + hi) / 2;
    return cands.sort((a, b) => Math.abs(avg(a) - mid) - Math.abs(avg(b) - mid))[0];
  }
  const cost = (v: number[]) => { let s = 0; for (const p of v) s += Math.min(...prev.map(q => Math.abs(p - q))); return s + Math.abs(avg(v) - avg(prev)) * .5; };
  return cands.sort((a, b) => cost(a) - cost(b))[0];
}
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** the bass note of a chord nearest to `near` inside lo..hi */
export function bassNote(c: Chord, tonic: number, lo: number, hi: number, near: number) {
  const pc = (tonic + c.root) % 12;
  let best = lo, d = 99;
  for (let p = lo; p <= hi; p++) if (p % 12 === pc && Math.abs(p - near) < d) { d = Math.abs(p - near); best = p; }
  return best;
}
