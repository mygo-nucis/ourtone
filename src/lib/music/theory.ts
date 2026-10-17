import type { Lang, Mode } from './types';

export const MODES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], locrian: [0, 1, 3, 5, 6, 8, 10]
};
const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
/** relative major of a mode's tonic, used to decide sharps or flats */
const MODE_SHIFT: Record<Mode, number> = { major: 0, minor: 3, dorian: -2, phrygian: -4, lydian: -5, mixolydian: -7, locrian: 1 };
const FLAT_MAJORS = new Set([5, 10, 3, 8, 1, 6]);

export function usesFlats(tonic: number, mode: Mode) { return FLAT_MAJORS.has(((tonic + MODE_SHIFT[mode]) % 12 + 12) % 12); }
export function pitchName(p: number, flats = false) { return (flats ? FLAT : SHARP)[((p % 12) + 12) % 12]; }
export function noteName(p: number, flats = false) { return pitchName(p, flats) + (Math.floor(p / 12) - 1); }

const MODE_NAME: Record<Mode, { zh: string; en: string }> = {
  major: { zh: '大调', en: 'major' }, minor: { zh: '小调', en: 'minor' }, dorian: { zh: '多利亚', en: 'Dorian' }, phrygian: { zh: '弗里几亚', en: 'Phrygian' },
  lydian: { zh: '利底亚', en: 'Lydian' }, mixolydian: { zh: '混合利底亚', en: 'Mixolydian' }, locrian: { zh: '洛克里亚', en: 'Locrian' }
};
export function keyName(tonic: number, mode: Mode, lang: Lang) {
  return `${pitchName(tonic, usesFlats(tonic, mode))} ${MODE_NAME[mode][lang]}`;
}

/** scale degree 0..6 of a pitch, or the nearest one below for notes outside the key */
export function degreeOf(p: number, tonic: number, mode: Mode) {
  const steps = MODES[mode], pc = ((p - tonic) % 12 + 12) % 12;
  let d = 0;
  for (let i = 0; i < 7; i++) if (steps[i] <= pc) d = i;
  return { degree: d, inKey: steps[d] === pc };
}
/** the pitch of a scale degree (may exceed 6 for higher octaves) nearest to a reference pitch */
export function degreePitch(deg: number, tonic: number, mode: Mode, near: number) {
  const steps = MODES[mode], oct = Math.floor(deg / 7), d = ((deg % 7) + 7) % 7;
  let p = tonic + steps[d] + 12 * oct;
  while (p < near - 6) p += 12;
  while (p > near + 6) p -= 12;
  return p;
}

/** General MIDI drums, grouped into six playable columns: kick, snare, toms, hats, cymbals, hand percussion */
export function drumColumn(n: number) {
  if (n === 35 || n === 36) return 0;
  if (n >= 37 && n <= 40) return 1;
  if ([41, 43, 45, 47, 48, 50].includes(n)) return 2;
  if (n === 42 || n === 44 || n === 46) return 3;
  if ([49, 51, 52, 53, 55, 57, 59].includes(n)) return 4;
  return 5;
}
