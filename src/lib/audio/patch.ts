import type { PluckParams, PianoParams } from './dsp';

/* UT-2: every instrument (drums aside) is one patch of a single voice.
   sources: A, a rendered string (plucked, or a hammered piano string); B, live oscillators (shapes, pulses, harmonics or
   a drawn cycle, FM, unison); plus breath noise, a chiff, a key click and an organ's percussive partial.
   then one chain, each stage only built when the patch uses it: high-pass → EQ peaks → low-pass (with its own envelope)
   → amp envelope → tremolo. vibrato bends the oscillators. the built-in presets are patches that rebuild their old voices
   exactly, so the stage sounds as it did. */

/** a value from a note: (f × mul + add) × (lo + hi × velocity), clamped (before the velocity scaling when clampFirst) */
export interface Track { mul: number; add: number; lo: number; hi: number; min?: number; max?: number; clampFirst?: boolean }
export type Shape = 'sine' | 'triangle' | 'sawtooth' | 'square';
export interface Osc {
  wave: Shape | 'pulse' | 'harm' | 'table';
  duty?: number;
  /** sine partials 1..n (pipes, drawbars) */
  harm?: number[];
  /** a drawn single cycle, 32 steps in -1..1 */
  table?: number[];
  ratio: number;
  detune?: number;
  level: number;
  /** unison: copies spread evenly over ± spread cents */
  voices?: number;
  spread?: number;
  /** follows the vibrato */
  vib?: boolean;
  /** a sawtooth's harmonics shaped by a body: resonances [Hz, Q, dB] the wave is computed through, once per pitch */
  body?: [number, number, number][];
  /** frequency modulation by a sine at f × ratio; the index falls from index to index1 */
  fm?: { ratio: number; index: number; index1: number; tau: number };
  /** a second, bright modulator that dies away fast (electric piano tines) */
  tine?: { ratio: number; index: number; tau: number };
}
export type Source =
  | { kind: 'pluck'; p: PluckParams; gain: number; cut0: number; cut1: number; rel: number; spread?: number }
  | { kind: 'hammer'; p: PianoParams; gain: number; cut0: number; cut1: number; rel: number; width: number };
export interface Patch {
  /** the name that keys rendered buffers; edited patches get their own */
  id: string;
  a?: Source;
  osc?: Osc[];
  /** gain on the summed oscillators */
  mix?: number;
  perc?: { ratio: number; level: number; tau: number };
  breath?: { level: number; q: number; mul: number };
  chiff?: number;
  click?: { level: number; freq: number; q: number; tau: number };
  hp?: { mul: number };
  peaks?: [number, number, number][];
  lp?: { cut: Track; q: number; env?: { start: Track; peak?: Track; atk?: number; sus: Track; tau: number } };
  /** fit: when the note's length is known, the attack takes at most this share of it (a short bow stroke speaks at once) */
  amp?: { a: number; sus: number; tau: number; rel: number; lo: number; hi: number; pow: number; keyTau?: boolean; fit?: number };
  gain: number;
  vib?: { rate: number; depth: number; delay: number; ramp: number; jitter?: boolean; steady?: boolean; ensemble?: boolean };
  trem?: { rate: number; depth: number };
  /** an amp and cabinet shared by a part's notes (driven guitars) */
  drive?: { drive: number; tone: number; level: number; poly?: boolean };
  /** the drum kit, at this gain */
  kit?: number;
  /** which kit: the acoustic GM kit, or the electronic one (808/909-style kick, snare and hats, a longer clap, a riser) */
  kitStyle?: 'acoustic' | 'electronic';
  /** the sound view's own filter, after the instrument's tone shaping (off unless set): drive, a keytracked cutoff,
      an envelope and an LFO, both in octaves on the cutoff */
  /** level correction in dB, set by auto-level so an edited sound stays as loud as its preset */
  trim?: number;
  /** keep the level as set (no auto-level) */
  manual?: boolean;
  vf?: {
    type: 'lp' | 'bp' | 'hp'; cut: number; res: number; key: number; drive: number;
    env?: { amt: number; a: number; d: number; s: number; r: number };
    lfo?: { rate: number; depth: number; delay: number };
  };
}

export const clampT = (x: number, lo?: number, hi?: number) => Math.max(lo ?? -Infinity, Math.min(hi ?? Infinity, x));
export function track(t: Track, f: number, v: number) {
  if (t.clampFirst) return clampT(f * t.mul + t.add, t.min, t.max) * (t.lo + t.hi * v);
  return clampT((f * t.mul + t.add) * (t.lo + t.hi * v), t.min, t.max);
}
export const fixed = (hz: number): Track => ({ mul: 0, add: hz, lo: 1, hi: 0 });
export const clonePatch = (p: Patch): Patch => JSON.parse(JSON.stringify(p));

/** a short stable name for a patch's settings, so an edited sound renders its own buffers */
export function patchKey(base: string, p: Patch) {
  const { id: _id, ...rest } = p;
  const str = JSON.stringify(rest);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${base}~${(h >>> 0).toString(36)}`;
}

/** the rendered-string buffers depend only on the string's own settings: edited sounds that keep them share buffers */
export function aBufferId(p: Patch) {
  if (!p.a || !p.id.includes('~')) return p.id;
  const str = JSON.stringify([p.a.kind, p.a.p]);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${p.id.split('~')[0]}#${(h >>> 0).toString(36)}`;
}
