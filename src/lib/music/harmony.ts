import type { Mode } from './types';
import { MODES, pitchName, usesFlats } from './theory';

/* harmony for the track view: the diatonic triads of the key, the chord each bar most likely sits on,
   and what a note is doing against that chord (a chord tone, a passing or neighbour note, or outside the key). */
export type Quality = 'maj' | 'min' | 'dim' | 'aug';
export interface Chord { degree: number; root: number; quality: Quality; tones: number[]; name: string; roman: string }

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
export function triads(tonic: number, mode: Mode): Chord[] {
  const st = MODES[mode], flats = usesFlats(tonic, mode);
  return st.map((_, d) => {
    const r = st[d], t3 = st[(d + 2) % 7] + (d + 2 >= 7 ? 12 : 0), t5 = st[(d + 4) % 7] + (d + 4 >= 7 ? 12 : 0);
    const a = t3 - r, b = t5 - t3;
    const quality: Quality = a === 4 && b === 3 ? 'maj' : a === 3 && b === 4 ? 'min' : a === 3 && b === 3 ? 'dim' : 'aug';
    const root = (tonic + r) % 12, tones = [root, (tonic + t3) % 12, (tonic + t5) % 12];
    const suffix = quality === 'min' ? 'm' : quality === 'dim' ? '°' : quality === 'aug' ? '+' : '';
    const rn = quality === 'maj' || quality === 'aug' ? ROMAN[d] : ROMAN[d].toLowerCase();
    return { degree: d, root, quality, tones, name: pitchName(root, flats) + suffix, roman: rn + (quality === 'dim' ? '°' : quality === 'aug' ? '+' : '') };
  });
}

export interface Sounding { t: number; d: number; p: number }
/** the chord a stretch of music sits on: tones weighted by length, strong beats and the bass count extra */
export function chordOf(notes: Sounding[], a: number, b: number, chords: Chord[], beat: number): Chord | null {
  if (!notes.length) return null;
  const w = new Array(12).fill(0);
  let lowest = 999, lowT = Infinity, total = 0;
  for (const n of notes) {
    const s = Math.max(a, n.t), e = Math.min(b, n.t + n.d);
    if (e <= s) continue;
    let k = e - s;
    if (n.t >= a && Math.abs((n.t - a) % beat) < beat * .1) k *= 1.5;
    w[n.p % 12] += k; total += k;
    if (n.p < lowest || (n.p === lowest && n.t < lowT)) { lowest = n.p; lowT = n.t; }
  }
  if (!total) return null;
  let best: Chord | null = null, score = -Infinity;
  for (const c of chords) {
    let s = 0;
    for (let pc = 0; pc < 12; pc++) s += c.tones.includes(pc) ? w[pc] : -w[pc] * .6;
    if (lowest < 999 && lowest % 12 === c.root) s += total * .35;
    if (c.quality === 'dim') s -= total * .15;
    if (s > score) { score = s; best = c; }
  }
  return score > total * .1 ? best : null;
}

export type Role = 'chord' | 'passing' | 'neighbor' | 'other' | 'outside';
/** what a note does against its chord, from its neighbours in the same part */
export function roleOf(p: number, chord: Chord | null, prev: number | null, next: number | null, tonic: number, mode: Mode): Role {
  const pc = ((p - tonic) % 12 + 12) % 12;
  if (!MODES[mode].includes(pc)) return 'outside';
  if (!chord || chord.tones.includes(p % 12)) return 'chord';
  if (prev !== null && next !== null) {
    const a = p - prev, b = next - p;
    if (Math.abs(a) <= 2 && Math.abs(b) <= 2 && a !== 0 && b !== 0) return Math.sign(a) === Math.sign(b) ? 'passing' : 'neighbor';
  }
  return 'other';
}

/** a note name in 简谱: the scale degree, with dots for octaves above or below the home octave */
export function jianpu(p: number, tonic: number, mode: Mode, home: number) {
  const st = MODES[mode], rel = p - home, oct = Math.floor(rel / 12), pc = ((rel % 12) + 12) % 12;
  let d = st.indexOf(pc), acc = '';
  if (d < 0) { d = st.findIndex(x => x > pc) - 1; if (d < 0) d = 6; acc = '♯'; }
  return { num: acc + String(d + 1), oct };
}
