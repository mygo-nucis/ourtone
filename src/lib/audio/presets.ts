import type { L10n } from '../music/types';
import type { Patch } from './patch';
import { patchInstrument } from './ut2';
import { pluckP, pianoP, fmP, windP, reedP, bowedP, organP, squeezeP, chipP, brassP, synthBassP, kitP } from './patches';
import type { Instrument } from './voices';

export interface Preset {
  id: string;
  name: L10n;
  icon: string;
  /** reverb send, 0..1 */
  send: number;
  /** strip level trim, linear */
  level: number;
  /** the UT-2 patch that plays it */
  patch: Patch;
  kind: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: any;
  drive?: [number, number, number];
}

type Kind = 'pluck' | 'piano' | 'fm' | 'wind' | 'reed' | 'bowed' | 'organ' | 'squeeze' | 'chip' | 'brass' | 'synthBass' | 'kit' | 'raw';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P = (id: string, zh: string, en: string, icon: string, send: number, level: number, kind: Kind, o: any, drive?: [number, number, number]): Preset => ({ id, name: { zh, en }, icon, send, level, kind, opts: o, drive, patch: toPatch(id, kind, o, drive) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPatch(id: string, kind: Kind, o: any, drive?: [number, number, number]): Patch {
  switch (kind) {
    case 'pluck': return pluckP(id, o, drive);
    case 'piano': return pianoP(id, o);
    case 'fm': return fmP(id, o);
    case 'wind': return windP(id, o);
    case 'reed': return reedP(id, o);
    case 'bowed': return bowedP(id, o);
    case 'organ': return organP(id, o);
    case 'squeeze': return squeezeP(id, o);
    case 'chip': return chipP(id, o);
    case 'brass': return brassP(id, o);
    case 'synthBass': return synthBassP(id, o);
    case 'raw': return { ...o, id };
    default: return kitP(o);
  }
}

const STR_LEVEL = Math.pow(10, -2.2 / 20);

export const PRESETS: Record<string, Preset> = Object.fromEntries([
  // the body's air and top answer the string (rendered into each note's buffer: nothing more to play)
  P('acoustic', '木吉他 · 温暖', 'Acoustic · warm', 'acoustic', .22, 1.67, 'pluck', { p: { decay: 3, decayK: .5, minDecay: .9, maxDecay: 6, excite: .42, pick: .17, damp: .03, maxLen: 3.6, body: [[100, 2.5, .35], [215, 3, .25], [450, 2.5, .12]] }, gain: .9, cut0: 1500, cut1: 9000, rel: .1, spread: .25 }),
  P('nylon', '古典吉他', 'Nylon guitar', 'acoustic', .24, 1.52, 'pluck', { p: { decay: 2.6, decayK: .5, minDecay: .8, maxDecay: 5, excite: .62, pick: .21, damp: .14, maxLen: 3.2, body: [[100, 2.5, .35], [215, 3, .25], [450, 2.5, .12]] }, gain: 1, cut0: 1200, cut1: 6000, rel: .12, spread: .2 }),
  P('cleangtr', '清音电吉他', 'Clean electric', 'cleangtr', .2, 2.27, 'pluck', { p: { decay: 3.6, decayK: .45, minDecay: 1, maxDecay: 6, excite: .24, pick: .11, damp: .01, maxLen: 3.6 }, gain: .75, cut0: 1600, cut1: 5200, rel: .08 }),
  P('drivegtr', '过载吉他', 'Overdriven guitar', 'cleangtr', .12, 0.5, 'pluck', { p: { decay: 4.2, decayK: .4, minDecay: 1.2, maxDecay: 6, excite: .2, pick: .1, damp: 0, maxLen: 3.2, drive: 4.7 }, gain: .7, cut0: 1600, cut1: 4800, rel: .06 }, [1.6, 3800, .65]),
  P('drivebass', '低音过载', 'Driven low guitar', 'bass', .08, 0.47, 'pluck', { p: { decay: 4, decayK: .3, minDecay: 1.4, maxDecay: 6, excite: .3, pick: .13, damp: .02, maxLen: 3 }, gain: .7, cut0: 900, cut1: 3200, rel: .05 }, [5, 2600, .42]),
  P('bass', '指弹贝斯', 'Finger bass', 'bass', .05, 1.32, 'pluck', { p: { decay: 3.8, decayK: .28, minDecay: 1.4, maxDecay: 6, excite: .58, pick: .22, damp: .1, maxLen: 3.2 }, gain: 1.1, cut0: 450, cut1: 2400, rel: .06 }),
  P('pizz', '弦乐拨奏', 'Pizzicato strings', 'viola', .3, 1.67, 'pluck', { p: { decay: .8, decayK: .35, minDecay: .25, maxDecay: 1.4, excite: .72, pick: .3, damp: .32, maxLen: 1.3 }, gain: 1.05, cut0: 900, cut1: 4200, rel: .12, spread: .3 }),
  P('harp', '竖琴', 'Harp', 'harp', .34, 1.45, 'pluck', { p: { decay: 4.4, decayK: .45, minDecay: 1, maxDecay: 7, excite: .56, pick: .3, damp: .05, maxLen: 4 }, gain: .85, cut0: 1100, cut1: 5200, rel: .5, spread: .45 }),
  P('piano', '三角钢琴', 'Grand piano', 'piano', .22, 1.83, 'piano', { p: { bright: 1, decay: 1, thump: 1 }, gain: 1, cut0: 1400, cut1: 11000, rel: .2, width: .55 }),
  P('egrand', '电子三角钢琴', 'Electric grand', 'piano', .2, 2.01, 'piano', { p: { bright: 1.5, decay: .62, thump: .5 }, gain: .95, cut0: 2600, cut1: 10000, rel: .14, width: .3 }),
  P('epiano', '电钢琴', 'Electric piano', 'piano', .22, 0.53, 'fm', { ratio: 1, index: 1.6, index1: .22, indexTau: .45, tine: { ratio: 14, index: .9, tau: .025 }, a: .002, tau: 1.4, sus: 0, rel: .16, trem: { rate: 4.2, depth: .14 }, gain: .5 }),
  P('vibes', '颤音琴', 'Vibraphone', 'bells', .32, 0.52, 'fm', { ratio: 4, index: .55, index1: .04, indexTau: .12, a: .002, tau: 1.7, sus: 0, rel: .45, trem: { rate: 5.4, depth: .34 }, gain: .5 }),
  P('glock', '钟琴', 'Glockenspiel', 'bells', .34, 0.79, 'fm', { ratio: 3.5, index: 1.3, index1: .08, indexTau: .05, a: .001, tau: .75, sus: 0, rel: .7, gain: .42 }),
  P('musicbox', '八音盒', 'Music box', 'musicbox', .36, 0.8, 'fm', { ratio: 5.8, index: 1.05, index1: 0, indexTau: .04, a: .001, tau: .55, sus: 0, rel: .55, gain: .46, detune: 3 }),
  P('ocarina', '陶笛', 'Ocarina', 'ocarina', .32, 0.25, 'wind', { harm: [1, .07, .025], breath: .05, breathQ: 7, breathMul: 1, a: .045, rel: .09, vib: 5.2, vibDepth: 13, vibDelay: .28, gain: .5, chiff: .12 }),
  P('flute', '长笛', 'Flute', 'flute', .3, 0.27, 'wind', { harm: [1, .22, .07, .03], breath: .1, breathQ: 4, breathMul: 1.5, a: .06, rel: .11, vib: 5, vibDepth: 11, vibDelay: .22, gain: .46, chiff: .3 }),
  P('whistle', '口哨', 'Whistle', 'flute', .26, 0.38, 'wind', { harm: [1, .015], breath: .025, breathQ: 9, breathMul: 1, a: .02, rel: .05, vib: 6.2, vibDepth: 20, vibDelay: .07, gain: .46 }),
  P('bottle', '吹瓶', 'Blown bottle', 'flute', .34, 0.27, 'wind', { harm: [1, .04], breath: .2, breathQ: 3, breathMul: 1, a: .09, rel: .15, vib: 4, vibDepth: 7, vibDelay: .3, gain: .46 }),
  P('reed', '英国管', 'English horn', 'reed', .28, 0.38, 'reed', { formants: [[850, 3.5, 9], [2400, 4, 5]], cut: 3000, a: .045, rel: .1, vib: 5, vibDepth: 9, gain: .32 }),
  P('oboe', '双簧管', 'Oboe', 'reed', .28, 0.42, 'reed', { formants: [[1150, 4, 10], [2900, 5, 6]], cut: 4600, a: .04, rel: .09, vib: 5.4, vibDepth: 11, gain: .3 }),
  // a violin family's body (air, wood, the bridge's presence) and players each at their own vibrato; 2 dB under the old
  // section's measured loudness, which it otherwise seems to exceed
  P('strings', '弦乐组', 'String section', 'viola', .36, 0.56, 'bowed', { voices: 3, detune: 7, cutMul: 5, cutAdd: 900, a: .2, rel: .42, vib: 5.2, vibDepth: 9, gain: .22 * STR_LEVEL, body: [[290, 2.2, 4], [500, 3, 2], [1400, 1.6, -2], [2700, 1.2, 5]], ensemble: true }),
  P('viola', '中提琴', 'Viola', 'viola', .3, 0.47, 'bowed', { voices: 2, detune: 4, cutMul: 5, cutAdd: 700, a: .11, rel: .3, vib: 5.4, vibDepth: 12, gain: .24 }),
  P('violin', '小提琴', 'Violin', 'viola', .32, 0.46, 'bowed', { voices: 2, detune: 3, cutMul: 6, cutAdd: 1200, a: .08, rel: .26, vib: 5.8, vibDepth: 15, gain: .22 }),
  P('percorgan', '打击风琴', 'Percussive organ', 'organ', .22, 0.42, 'organ', { bars: [[.5, .35], [1, 1], [2, .55], [3, .22], [4, .18]], perc: { ratio: 3, level: .5, tau: .16 }, click: .12, a: .004, rel: .05, gain: .3 }),
  P('organ', '管风琴 · 圣堂', 'Pipe organ · nave', 'organ', .55, 0.43, 'organ', { bars: [[.5, .6], [1, 1], [2, .7], [3, .35], [4, .45], [6, .2], [8, .22]], click: .03, a: .05, rel: .22, gain: .26, vib: 3 }),
  P('accordion', '探戈手风琴', 'Tango accordion', 'accordion', .22, 0.53, 'squeeze', { musette: 11, cut: 2700, a: .03, rel: .07, gain: .34 }),
  P('accordionbass', '手风琴低音', 'Accordion bass', 'accordion', .1, 0.18, 'squeeze', { musette: 3, cut: 1100, a: .02, rel: .06, gain: .5, bass: true }),
  P('square', '方波 · 八位', 'Square · 8-bit', 'chip', .12, 0.43, 'chip', { duty: .5, a: .002, tau: .22, sus: .72, rel: .03, gain: .28, vib: 10 }),
  P('brass', '铜管组', 'Brass section', 'horn', .26, 0.46, 'brass', { detune: 5, peakMul: 9, susMul: 5, a: .05, rel: .12, gain: .24 }),
  P('synthbass', '合成贝斯', 'Synth bass', 'bass', .06, 0.43, 'synthBass', { cut0: 2600, cut1: 420, tau: .14, q: 5, gain: .5, rel: .05 }),
  P('kit', '架子鼓', 'Drum kit', 'kit', .14, 0.62, 'kit', .9),
  /* the electronic family, written directly as UT-2 patches */
  P('supersaw', '超级锯齿', 'Supersaw', 'synth', .28, 0.55, 'raw', {
    gain: .32, osc: [{ wave: 'sawtooth', ratio: 1, level: .36, voices: 5, spread: 22 }],
    amp: { a: .012, sus: .85, tau: .6, rel: .28, lo: .45, hi: .55, pow: 1 },
    vf: { type: 'lp', cut: 4200, res: .12, key: .35, drive: 0, env: { amt: 1.1, a: .004, d: .4, s: .55, r: .3 } }
  }),
  P('leadsaw', '锯齿主音', 'Saw lead', 'synth', .24, 0.41, 'raw', {
    gain: .34, osc: [{ wave: 'sawtooth', ratio: 1, level: .55, voices: 2, spread: 7, vib: true }, { wave: 'square', ratio: .5, level: .18, vib: true }],
    amp: { a: .008, sus: .9, tau: .5, rel: .14, lo: .4, hi: .6, pow: 1 },
    vf: { type: 'lp', cut: 3200, res: .22, key: .5, drive: .15, env: { amt: .9, a: .003, d: .25, s: .4, r: .15 } },
    vib: { rate: 5.6, depth: 12, delay: .28, ramp: .3 }
  }),
  P('synthpluck', '合成拨弦', 'Synth pluck', 'synth', .3, 1.29, 'raw', {
    gain: .46, osc: [{ wave: 'sawtooth', ratio: 1, level: .5, voices: 2, spread: 9 }, { wave: 'square', ratio: 2, level: .12 }],
    amp: { a: .002, sus: 0, tau: .28, rel: .18, lo: .4, hi: .6, pow: 1 },
    vf: { type: 'lp', cut: 700, res: .28, key: .6, drive: 0, env: { amt: 3.2, a: .001, d: .16, s: 0, r: .12 } }
  }),
  P('pad', '合成铺底', 'Synth pad', 'pad', .45, 0.79, 'raw', {
    gain: .26, osc: [{ wave: 'sawtooth', ratio: 1, level: .3, voices: 4, spread: 16 }, { wave: 'triangle', ratio: 2, level: .16 }],
    amp: { a: .5, sus: .9, tau: 2, rel: 1.1, lo: .5, hi: .5, pow: 1 },
    vf: { type: 'lp', cut: 1700, res: .1, key: .25, drive: 0, lfo: { rate: .25, depth: .25, delay: .6 } }
  }),
  P('sublow', '808 低音', '808 sub bass', 'speaker', .02, 0.35, 'raw', {
    gain: .62, osc: [{ wave: 'sine', ratio: 1, level: .9 }, { wave: 'sine', ratio: 2, level: .12 }],
    amp: { a: .003, sus: .55, tau: .9, rel: .1, lo: .5, hi: .5, pow: 1 },
    vf: { type: 'lp', cut: 900, res: .05, key: .3, drive: .35 }
  }),
  P('ekit', '电子鼓组', 'Electronic kit', 'drummachine', .1, 0.4, 'raw', { gain: 1, kit: .9, kitStyle: 'electronic' }),
  /* an audio track's channel: it plays recordings and files, never notes (not offered in instrument menus) */
  P('audio', '音频', 'Audio', 'audio', .06, 0.7, 'raw', { gain: 1 })
].map(p => [p.id, p]));

const made = new Map<string, Instrument>();
export function instrument(id: string): Instrument {
  let i = made.get(id);
  if (!i) { i = patchInstrument((PRESETS[id] || PRESETS.piano).patch); made.set(id, i); }
  return i;
}
export function preset(id: string): Preset { return PRESETS[id] || PRESETS.piano; }

/** what plays a part: its own edited sound when it has one, else its preset */
const edited = new Map<string, Instrument>();
export function instrumentFor(d: { preset: string; patch?: Patch }): Instrument {
  if (!d.patch) return instrument(d.preset);
  let i = edited.get(d.patch.id);
  if (!i) { i = patchInstrument(d.patch); edited.set(d.patch.id, i); if (edited.size > 24) edited.delete(edited.keys().next().value!); }
  return i;
}
/** the patch a part plays: its edited sound or a copy of its preset's */
export function patchOf(d: { preset: string; patch?: Patch }): Patch { return d.patch ?? JSON.parse(JSON.stringify(preset(d.preset).patch)); }

/** presets by family, for menus */
export const FAMILIES: { id: string; name: L10n; presets: string[] }[] = [
  { id: 'pluck', name: { zh: '拨弦', en: 'Plucked' }, presets: ['acoustic', 'nylon', 'cleangtr', 'drivegtr', 'harp', 'pizz'] },
  { id: 'keys', name: { zh: '键盘', en: 'Keys' }, presets: ['piano', 'egrand', 'epiano', 'vibes', 'glock', 'musicbox', 'percorgan', 'organ', 'accordion'] },
  { id: 'orch', name: { zh: '管弦', en: 'Winds & strings' }, presets: ['flute', 'ocarina', 'whistle', 'bottle', 'reed', 'oboe', 'strings', 'violin', 'viola', 'brass'] },
  { id: 'low', name: { zh: '低音', en: 'Bass' }, presets: ['bass', 'synthbass', 'sublow', 'drivebass', 'accordionbass'] },
  { id: 'synth', name: { zh: '合成器', en: 'Synths' }, presets: ['supersaw', 'leadsaw', 'synthpluck', 'pad', 'square'] },
  { id: 'drums', name: { zh: '鼓', en: 'Drums' }, presets: ['kit', 'ekit'] }
];
