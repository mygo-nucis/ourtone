import type { Patch } from './patch';
import { patchInstrument } from './ut2';
import { FxChain, type Fx } from './fx';

/* auto-level: how loud a patch plays, rendered offline at a low rate. an edited sound is trimmed to the loudness of
   the preset it came from, so the mix keeps its balance while you design. measured on the part's own notes (a
   phrase) and through the part's effects, so what is matched is what is heard: a compressor brings makeup gain and
   a drive lifts quiet input, and how much depends on the music going through them */
const SR = 22050;
type Make = (ch: number, len: number, sr: number) => OfflineAudioContext;
let make: Make = (c, l, sr) => new OfflineAudioContext(c, l, sr);
export function setOfflineMaker(m: Make) { make = m; }

/** notes to measure on: [time, pitch, velocity, duration], and a key naming them for the cache */
export interface Phrase { notes: [number, number, number, number][]; key: string }
/** the busiest few seconds of a part's notes */
export function phraseOf(part: { n: number; start: ArrayLike<number>; pitch: ArrayLike<number>; vel: ArrayLike<number>; dur: ArrayLike<number> }, len = 4): Phrase | null {
  const { n, start } = part;
  if (!n) return null;
  let best = -1, bi = 0, j = 0;
  for (let i = 0; i < n; i++) {
    while (j < n && start[j] < start[i] + len) j++;
    if (j - i > best) { best = j - i; bi = i; }
  }
  const t0 = start[bi], notes: Phrase['notes'] = [];
  for (let k = bi; k < bi + best; k++) notes.push([start[k] - t0 + .02, part.pitch[k], part.vel[k], Math.min(part.dur[k], len + .5 - (start[k] - t0))]);
  return { notes, key: `${bi}:${best}:${t0.toFixed(3)}` };
}

/** how many phrases were rendered, and how many recordings played through the effects (a test reads them) */
export const levelStats = { renders: 0, passes: 0 };
/** the patch played on the phrase (or three notes around a pitch), through the effects if given: its band frames */
async function rendered(p: Patch, around = 60, fx?: Fx, withTrim = false, phrase?: Phrase | null) {
  levelStats.renders++;
  const q: Patch = JSON.parse(JSON.stringify(p));
  if (!withTrim) delete q.trim;
  q.id = q.id + ':lv';
  const notes = phrase?.notes ?? [[.02, around, 96, .45], [.5, around + 4, 96, .45], [1, around + 7, 96, .5]];
  const span = Math.max(1.6, ...notes.map(n => n[0] + n[3] + .6));
  const inst = patchInstrument(q), ctx = make(1, Math.round(SR * span), SR);
  let out: AudioNode = ctx.destination;
  if (fx) { const ch = new FxChain(ctx); ch.set(fx); ch.output.connect(ctx.destination); out = ch.input; }
  const input = inst.chain ? inst.chain(out) : out;
  await inst.prepare(ctx, notes.map(n => n[1]));
  for (const [t, m, v, d] of notes) inst.play(input, t, m, v, d);
  return bands((await ctx.startRendering()).getChannelData(0), SR);
}
/* an edited sound is measured again and again while its trim settles, and only the end of its path changes: the trim
   is a gain on the voices' output, ahead of the voice drive and the effects. so the voices are rendered once, without
   the trim, in stereo, and each measurement plays that recording through the trim, the drive and the effects: one
   source instead of every note of the phrase, the same signal */
async function dryVoices(p: Patch, around: number, phrase?: Phrase | null) {
  levelStats.renders++;
  const q: Patch = JSON.parse(JSON.stringify(p));
  delete q.trim;
  q.id = q.id + ':lv';
  const notes = phrase?.notes ?? [[.02, around, 96, .45], [.5, around + 4, 96, .45], [1, around + 7, 96, .5]];
  const span = Math.max(1.6, ...notes.map(n => n[0] + n[3] + .6));
  const inst = patchInstrument(q), ctx = make(2, Math.round(SR * span), SR);
  await inst.prepare(ctx, notes.map(n => n[1]));
  for (const [t, m, v, d] of notes) inst.play(ctx.destination, t, m, v, d);
  return ctx.startRendering();
}
async function throughFx(dry: AudioBuffer, p: Patch, trim: number, fx?: Fx) {
  levelStats.passes++;
  const ctx = make(1, dry.length, SR), src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = dry; g.gain.value = 10 ** (trim / 20);
  let out: AudioNode = ctx.destination;
  if (fx) { const ch = new FxChain(ctx); ch.set(fx); ch.output.connect(ctx.destination); out = ch.input; }
  const chain = patchInstrument(p).chain;
  src.connect(g).connect(chain ? chain(out) : out);
  src.start(0);
  return bands((await ctx.startRendering()).getChannelData(0), SR);
}
/** how loud a patch seems (phon-like dB, see below) */
export async function loudness(p: Patch, around = 60, fx?: Fx, withTrim = false, phrase?: Phrase | null): Promise<number> {
  return sones(await rendered(p, around, fx, withTrim, phrase), SR);
}
const bases = new Map<string, Promise<number>>();
/** the trim (dB) that makes an edited patch, through its effects, seem as loud as its preset (on the phrase, if
    given). loudness is perceived loudness, not energy: a bright square lead is brought down further than a dark
    sine of the same energy */
export async function autoTrim(edited: Patch, base: Patch, around = 60, fx?: Fx, phrase?: Phrase | null) {
  const key = `${base.id}@${phrase ? phrase.key : around}`;
  let b = bases.get(key);
  if (!b) { b = loudness(base, around, undefined, false, phrase); bases.set(key, b); }
  const [lb, dry] = await Promise.all([b, dryVoices(edited, around, phrase)]), fe = await throughFx(dry, edited, 0, fx);
  if (!isFinite(lb) || sones(fe, SR) < -60) return 0;
  const clampT = (t: number) => Math.max(-48, Math.min(18, Math.round(t * 10) / 10));
  const g0 = gainFor(fe, SR, lb);
  let trim = clampT(g0);
  // a drive (the amp's, or the effects') and a compressor are not linear: a quieter input loses less than the trim
  // takes off, so measure again with the trim in place until the level settles. each measurement says how much gain
  // the output still lacks; a chain that squashes changes it by less than the trim moved, so the next trim follows
  // the line through the last two measurements (a secant step) instead of adding the shortfall as if 1 dB in made
  // 1 dB out, which crept up on the level over many renders
  if (fx?.drive.on || fx?.comp.on || edited.drive) {
    let t0 = 0, r0 = g0;
    for (let k = 0; k < 5; k++) {
      const f = await throughFx(dry, edited, trim, fx), r = gainFor(f, SR, lb);
      if (!isFinite(r) || Math.abs(r) < .5) break;
      // how much the output moved per dB of trim (1 for a linear chain), kept to a sane range
      const moved = t0 === trim ? 1 : Math.max(.15, Math.min(1.5, (r0 - r) / (trim - t0)));
      const next = clampT(trim + r / moved);
      if (next === trim) break;
      t0 = trim; r0 = r; trim = next;
    }
  }
  return trim;
}

/* how loud a sound seems, after Zwicker's loudness model (ISO 532-1), simplified: the spectrum of each 90 ms frame on
   the critical-band (Bark) scale, weighted by the outer and middle ear, spread the way one band masks the next, and
   turned into specific loudness, which grows with a power of intensity (Zwicker's is 0.23; 0.35 here, fitted so the
   matches agree with the standard's own loudness over 85 Random sounds to within about 1 phon) and so adds up across
   bands. two
   sounds of equal energy are not equally loud: a bright, wide one (a square wave, a buzzy horn) is far louder than a
   dark, narrow one (a sine, a soft string), and an RMS meter cannot tell them apart. the result is in dB-like units
   (on a phon-like scale), full scale taken as 100 dB SPL */
const DZ = .5, NZ = 50, GROW = .35;
const bark = (f: number) => 13 * Math.atan(.00076 * f) + 3.5 * Math.atan((f / 7500) ** 2);
// outer and middle ear (Terhardt's weighting, as in PEAQ), dB; the threshold in quiet (dB SPL)
const earDb = (k: number) => -2.184 * k ** -.8 + 6.5 * Math.exp(-.6 * (k - 3.3) ** 2) - .001 * k ** 3.6;
const quietDb = (k: number) => 3.64 * k ** -.8 - 6.5 * Math.exp(-.6 * (k - 3.3) ** 2) + .001 * k ** 4;
interface Plan { n: number; bins: Int16Array; w: Float32Array; fz: Float32Array; etq: Float32Array; etqG: Float64Array; win: Float32Array; cos: Float32Array; sin: Float32Array }
const plans = new Map<number, Plan>();
function plan(sr: number): Plan {
  let p = plans.get(sr);
  if (p) return p;
  const n = 2 ** Math.round(Math.log2(sr * .09)), bins = new Int16Array(n / 2), w = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    const f = Math.max(20, i * sr / n), z = bark(f);
    bins[i] = i === 0 || f < 25 ? -1 : Math.min(NZ - 1, Math.floor(z / DZ));
    w[i] = 10 ** (earDb(f / 1000) / 10);
  }
  // each slot's centre frequency (for the masking slope) and its threshold excitation
  const fz = new Float32Array(NZ), etq = new Float32Array(NZ);
  for (let k = 0; k < NZ; k++) {
    let lo = 20, hi = 20000; const z = (k + .5) * DZ;
    for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (bark(m) < z) lo = m; else hi = m; }
    fz[k] = lo; etq[k] = 10 ** (Math.min(60, quietDb(Math.max(.02, lo / 1000))) / 10);
  }
  const win = new Float32Array(n); for (let i = 0; i < n; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / n);
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = -Math.sin(2 * Math.PI * i / n); }
  const etqG = new Float64Array(NZ); for (let k = 0; k < NZ; k++) etqG[k] = etq[k] ** GROW;
  p = { n, bins, w, fz, etq, etqG, win, cos, sin }; plans.set(sr, p);
  return p;
}
function fft(re: Float64Array, im: Float64Array, p: Plan) {
  const n = p.n;
  for (let i = 1, j = 0; i < n; i++) {
    let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const h = len >> 1, step = n / len;
    for (let i = 0; i < n; i += len) for (let k = 0; k < h; k++) {
      const c = p.cos[k * step], s = p.sin[k * step], a = i + k, b = a + h;
      const xr = re[b] * c - im[b] * s, xi = re[b] * s + im[b] * c;
      re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
    }
  }
}
/** each frame's ear-weighted power on the Bark slots (mean square, full scale = 1) */
export function bands(x: Float32Array, sr: number) {
  const p = plan(sr), n = p.n, hop = n >> 2, out: Float64Array[] = [];
  const re = new Float64Array(n), im = new Float64Array(n), norm = 2 / (n * n * .375);
  for (let a = 0; a + n <= x.length; a += hop) {
    for (let i = 0; i < n; i++) { re[i] = x[a + i] * p.win[i]; im[i] = 0; }
    fft(re, im, p);
    const e = new Float64Array(NZ);
    for (let i = 1; i < n / 2; i++) { const k = p.bins[i]; if (k >= 0) e[k] += (re[i] * re[i] + im[i] * im[i]) * norm * p.w[i]; }
    out.push(e);
  }
  return out;
}
/** the loudness of a frame from its band powers, scaled by a gain (dB): spread across bands, then specific loudness */
// each slot spreads down by a fixed 27 dB per Bark, and up by a slope that eases as the slot gets louder. the spread
// falls off geometrically, so it is summed as a running product: one power per slot, not one per pair of slots
// (the same sum, about 15 times faster; Random measures loudness some hundreds of times per sound)
const DOWN = 10 ** (-27 * DZ / 10);
function frameSones(e: Float64Array, gainDb: number, p: Plan) {
  const g = 10 ** ((gainDb + 100) / 10), ex = new Float64Array(NZ);
  let below = 0;
  for (let i = NZ - 1; i >= 0; i--) {
    ex[i] = below;
    const P = e[i] * g; if (P <= 0) { below *= DOWN; continue; }
    below = (below + P) * DOWN;
    const L = 10 * Math.log10(P), up = (24 + 230 / p.fz[i] - .2 * L) * DZ, r = 10 ** (-Math.max(5 * DZ, up) / 10);
    for (let j = i, a = P; j < NZ; j++, a *= r) ex[j] += a;
  }
  let N = 0;
  for (let j = 0; j < NZ; j++) { const t = p.etq[j]; N += Math.max(0, p.etqG[j] * ((.5 + .5 * ex[j] / t) ** GROW - 1)); }
  return N * DZ;
}
/** loudness (phon-like dB) of band frames at a gain: the mean of the loudest quarter of frames */
export function sones(fr: Float64Array[], sr: number, gainDb = 0) {
  const p = plan(sr), ns = fr.map(e => frameSones(e, gainDb, p)).sort((a, b) => b - a);
  const top = ns.slice(0, Math.max(1, Math.ceil(ns.length / 4)));
  const N = top.reduce((a, b) => a + b, 0) / top.length;
  return 33.22 * Math.log10(Math.max(1e-9, N));
}
/** the gain (dB) that brings band frames to a target loudness */
export function gainFor(fr: Float64Array[], sr: number, target: number) {
  let lo = -60, hi = 40;
  // 17 halvings of the 100 dB range: within a thousandth of a dB, far finer than the trim's tenths
  for (let it = 0; it < 17; it++) { const m = (lo + hi) / 2; if (sones(fr, sr, m) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** how loud a phrase is: the mean of its loudest quarter of 200 ms windows (dB), steadier than its single peak */
export function upper(x: Float32Array, sr: number) {
  const win = Math.round(sr * .2), hop = Math.round(win / 4), ms: number[] = [];
  for (let a = 0; a + win <= x.length; a += hop) { let s = 0; for (let i = a; i < a + win; i++) s += x[i] * x[i]; ms.push(s / win); }
  ms.sort((a, b) => b - a);
  const top = ms.slice(0, Math.max(1, Math.ceil(ms.length / 4)));
  return 10 * Math.log10(Math.max(1e-12, top.reduce((a, b) => a + b, 0) / top.length));
}
/** the loudest 200 ms of a signal (mean square in dB): close to how loud a sound seems, sustained or struck */
export function loudest(x: Float32Array, sr: number) {
  const win = Math.round(sr * .2), hop = Math.round(win / 4);
  let best = 0;
  for (let a = 0; a + win <= x.length; a += hop) { let s = 0; for (let i = a; i < a + win; i++) s += x[i] * x[i]; best = Math.max(best, s / win); }
  return 10 * Math.log10(Math.max(1e-12, best));
}
