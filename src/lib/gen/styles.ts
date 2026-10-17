import type { L10n, Mode } from '../music/types';

/* the generator's styles. three for the day (MyGO!!!!!'s side) and two for the night (Ave Mujica's).
   a style is data: tempo and swing, keys, chord progressions for three slots (a: verses, b: choruses and drops,
   c: bridges and builds), a song form with an energy curve, and the instruments and patterns of each part. */
export type StyleId = 'citypop' | 'lofi' | 'futurebass' | 'synthwave' | 'darkwave';
export type SectionKind = 'intro' | 'verse' | 'build' | 'chorus' | 'drop' | 'break' | 'bridge' | 'outro';
export interface Section { kind: SectionKind; bars: number; energy: number; prog: 'a' | 'b' | 'c' }
export type Groove = 'funk' | 'dusty' | 'halftime' | 'four' | 'drive';

export interface Style {
  id: StyleId;
  name: L10n;
  blurb: L10n;
  night: boolean;
  bpm: [number, number];
  /** how late the off sixteenths land, as a share of a sixteenth */
  swing: number;
  mode: Mode;
  tonics: number[];
  progs: { a: string[]; b: string[]; c: string[] };
  form: { short: Section[]; full: Section[] };
  lead: { presets: string[]; lo: number; hi: number; density: number; hook: number };
  comp: { presets: string[]; kind: 'stab' | 'lazy' | 'chop' | 'pad' | 'pulse'; lo: number; hi: number; size: number };
  bass: { presets: string[]; kind: 'funk' | 'walk' | 'sub' | 'octave' | 'drive'; lo: number; hi: number };
  drums: { preset: string; groove: Groove; riser: boolean };
  pad?: string; arp?: string; guitar?: string;
  /** fader offsets from the automatic mix, dB, measured on renders so the lead leads and the arpeggio sits behind */
  mix: Partial<Record<PartKind, number>>;
  /** mastering trim, dB, so generated songs play about as loud as the built-in ones */
  gain: number;
}
export type PartKind = 'lead' | 'comp' | 'guitar' | 'arp' | 'pad' | 'bass' | 'drums';

const S = (kind: SectionKind, bars: number, energy: number, prog: 'a' | 'b' | 'c' = 'a'): Section => ({ kind, bars, energy, prog });

export const STYLES: Record<StyleId, Style> = {
  citypop: {
    id: 'citypop', night: false,
    name: { zh: '城市流行', en: 'City pop' },
    blurb: { zh: '霓虹、电钢琴和会跳舞的贝斯', en: 'Neon, electric piano and a bass that dances' },
    bpm: [106, 120], swing: .1, mode: 'major', tonics: [0, 2, 3, 5, 7, 8, 9, 10],
    progs: {
      a: ['IVmaj7 III7 vi7 I7', 'Imaj7 vi7 ii7 V7', 'IVmaj7 V7 iii7 vi7', 'ii7 V7 Imaj7 IVmaj7'],
      b: ['IVmaj7 V7 iii7 vi7', 'IVmaj7 III7 vi7 I7', 'ii7 V7 iii7 vi7'],
      c: ['IVmaj7 iii7 ii7 Vsus4', 'vi7 V7 IVmaj7 III7']
    },
    form: {
      full: [S('intro', 4, .4), S('verse', 8, .6), S('build', 4, .72, 'c'), S('chorus', 8, 1, 'b'), S('verse', 8, .62), S('chorus', 8, 1, 'b'), S('bridge', 8, .5, 'c'), S('chorus', 8, 1, 'b'), S('outro', 4, .3)],
      short: [S('intro', 4, .45), S('verse', 8, .65), S('chorus', 8, 1, 'b'), S('outro', 4, .3)]
    },
    lead: { presets: ['leadsaw', 'square', 'synthpluck'], lo: 62, hi: 86, density: .6, hook: 3 },
    comp: { presets: ['epiano'], kind: 'stab', lo: 52, hi: 76, size: 4 },
    bass: { presets: ['synthbass', 'bass'], kind: 'funk', lo: 31, hi: 55 },
    drums: { preset: 'kit', groove: 'funk', riser: false },
    guitar: 'cleangtr', pad: 'strings',
    mix: { lead: 1.5, guitar: -1 }, gain: -1.5
  },
  lofi: {
    id: 'lofi', night: false,
    name: { zh: '低保真', en: 'Lo-fi' },
    blurb: { zh: '慢一点，摇摆一点，适合写作业', en: 'Slow, swung and dusty: music to study to' },
    bpm: [72, 86], swing: .45, mode: 'major', tonics: [0, 2, 3, 5, 7, 8, 10],
    progs: {
      a: ['ii7 V7 Imaj7 vi7', 'IVmaj7 iii7 ii7 Imaj7', 'Imaj7 IVmaj7 iii7 vi7', 'Imaj9 vi9 ii9 V9'],
      b: ['IVmaj7 III7 vi7 I7', 'ii7 iii7 IVmaj7 V7', 'vi9 ii9 V9 Imaj9'],
      c: ['IVmaj7 iv6 iii7 vi7', 'vi7 ii7 V7 Imaj7']
    },
    form: {
      full: [S('intro', 4, .35), S('verse', 8, .55), S('chorus', 8, .72, 'b'), S('verse', 8, .55), S('chorus', 8, .75, 'b'), S('outro', 4, .3)],
      short: [S('intro', 4, .35), S('verse', 8, .55), S('chorus', 8, .72, 'b'), S('outro', 4, .3)]
    },
    lead: { presets: ['vibes', 'flute', 'musicbox'], lo: 64, hi: 84, density: .38, hook: 2 },
    comp: { presets: ['epiano', 'piano'], kind: 'lazy', lo: 50, hi: 74, size: 4 },
    bass: { presets: ['bass'], kind: 'walk', lo: 31, hi: 52 },
    drums: { preset: 'kit', groove: 'dusty', riser: false },
    mix: { comp: 4.5, bass: 1, drums: -1 }, gain: 0
  },
  futurebass: {
    id: 'futurebass', night: false,
    name: { zh: '未来贝斯', en: 'Future bass' },
    blurb: { zh: '闪亮的锯齿和弦，一拍一拍地起伏', en: 'Shimmering saw chords that swell and chop' },
    bpm: [140, 156], swing: 0, mode: 'major', tonics: [0, 2, 4, 5, 7, 9],
    progs: {
      a: ['IVmaj7 V iii vi', 'I V vi IV', 'vi IV I V', 'IVmaj7 V7 vi Iadd9'],
      b: ['IVmaj7 V iii vi', 'IV V vi vi', 'vi IV I V'],
      c: ['IV V iii vi', 'ii V I vi']
    },
    form: {
      full: [S('intro', 8, .35), S('verse', 8, .55), S('build', 8, .8, 'c'), S('drop', 16, 1, 'b'), S('break', 8, .4), S('build', 8, .82, 'c'), S('drop', 16, 1, 'b'), S('outro', 8, .3)],
      short: [S('intro', 4, .35), S('verse', 8, .55), S('build', 4, .8, 'c'), S('drop', 16, 1, 'b'), S('outro', 4, .3)]
    },
    lead: { presets: ['synthpluck', 'glock'], lo: 67, hi: 88, density: .55, hook: 4 },
    comp: { presets: ['supersaw'], kind: 'chop', lo: 52, hi: 79, size: 4 },
    bass: { presets: ['sublow'], kind: 'sub', lo: 28, hi: 48 },
    drums: { preset: 'ekit', groove: 'halftime', riser: true },
    pad: 'pad',
    mix: { lead: -3.5, comp: 4, pad: 1 }, gain: -2.5
  },
  synthwave: {
    id: 'synthwave', night: true,
    name: { zh: '夜行合成器', en: 'Synthwave' },
    blurb: { zh: '八十年代的夜路：琶音、铺底和门控军鼓', en: 'An eighties night drive: arpeggios, pads and big snares' },
    bpm: [96, 112], swing: 0, mode: 'minor', tonics: [9, 4, 2, 6, 0, 7],
    progs: {
      a: ['i bVI bIII bVII', 'i bVI iv bVII', 'i bVII bVI bVII'],
      b: ['bVI bVII i i', 'bVI bIII bVII i', 'iv bVI bVII i'],
      c: ['bVI bVII bIII bVI', 'iv bVII bIII bVI']
    },
    form: {
      full: [S('intro', 8, .4), S('verse', 8, .6), S('chorus', 8, .9, 'b'), S('verse', 8, .6), S('chorus', 8, .95, 'b'), S('bridge', 8, .5, 'c'), S('chorus', 8, 1, 'b'), S('outro', 8, .3)],
      short: [S('intro', 4, .4), S('verse', 8, .6), S('chorus', 8, .95, 'b'), S('outro', 4, .3)]
    },
    lead: { presets: ['leadsaw'], lo: 62, hi: 86, density: .5, hook: 3 },
    comp: { presets: ['pad'], kind: 'pad', lo: 50, hi: 74, size: 4 },
    bass: { presets: ['synthbass'], kind: 'octave', lo: 28, hi: 52 },
    drums: { preset: 'ekit', groove: 'four', riser: true },
    arp: 'synthpluck',
    mix: { lead: 2, comp: 3, arp: -6.5, bass: -1 }, gain: -2.5
  },
  darkwave: {
    id: 'darkwave', night: true,
    name: { zh: '暗潮', en: 'Darkwave' },
    blurb: { zh: '哥特的夜：管风琴、弦乐和不停的低音', en: 'A gothic night: organ, strings and a restless bass' },
    bpm: [118, 132], swing: 0, mode: 'minor', tonics: [2, 4, 0, 11, 6, 7],
    progs: {
      a: ['i iv V i', 'i bVI bVII i', 'i bVI iv V', 'i iv bVI V'],
      b: ['bVI bVII i i', 'iv V i bVI', 'bVI V i i'],
      c: ['bII bVII i i', 'iv bVII bIII bVI']
    },
    form: {
      full: [S('intro', 8, .45), S('verse', 8, .65), S('build', 4, .8, 'c'), S('chorus', 8, 1, 'b'), S('break', 4, .4), S('verse', 8, .65), S('build', 4, .85, 'c'), S('chorus', 16, 1, 'b'), S('outro', 4, .3)],
      short: [S('intro', 4, .45), S('verse', 8, .65), S('chorus', 8, 1, 'b'), S('outro', 4, .3)]
    },
    lead: { presets: ['violin', 'leadsaw'], lo: 64, hi: 88, density: .5, hook: 3 },
    comp: { presets: ['organ', 'supersaw'], kind: 'pulse', lo: 50, hi: 76, size: 4 },
    bass: { presets: ['synthbass'], kind: 'drive', lo: 28, hi: 50 },
    drums: { preset: 'ekit', groove: 'drive', riser: true },
    arp: 'synthpluck', pad: 'strings',
    mix: { lead: 1.5, comp: 3, arp: -7, bass: -1, drums: -1 }, gain: -3
  }
};
export const STYLE_ORDER: StyleId[] = ['citypop', 'lofi', 'futurebass', 'synthwave', 'darkwave'];
