import type { Patch, Osc } from './patch';
import { fixed } from './patch';
import type { PluckOpts, PianoOpts, FmOpts, WindOpts, ReedOpts, BowedOpts, OrganOpts, SqueezeOpts, ChipOpts, BrassOpts, SynthBassOpts } from './voices';

/* the old voice recipes, written as UT-2 patches. each builds the same graph as the voice it replaces */
export const pluckP = (id: string, o: PluckOpts, drive?: [number, number, number]): Patch => ({ id, a: { kind: 'pluck', p: o.p, gain: o.gain, cut0: o.cut0, cut1: o.cut1, rel: o.rel, spread: o.spread }, gain: 1, drive: drive ? { drive: drive[0], tone: drive[1], level: drive[2] } : undefined });
export const pianoP = (id: string, o: PianoOpts): Patch => ({ id, a: { kind: 'hammer', p: o.p, gain: o.gain, cut0: o.cut0, cut1: o.cut1, rel: o.rel, width: o.width }, gain: 1 });
export const fmP = (id: string, o: FmOpts): Patch => ({
  id, osc: [{ wave: 'sine', ratio: 1, detune: o.detune, level: 1, fm: { ratio: o.ratio, index: o.index, index1: o.index1, tau: o.indexTau }, tine: o.tine }],
  amp: { a: o.a, sus: o.sus, tau: o.tau, rel: o.rel, lo: .2, hi: .8, pow: 1.3, keyTau: true }, gain: o.gain, trem: o.trem
});
export const windP = (id: string, o: WindOpts): Patch => ({
  id, osc: [{ wave: 'harm', harm: o.harm, ratio: 1, level: 1, vib: true }], breath: { level: o.breath, q: o.breathQ, mul: o.breathMul }, chiff: o.chiff,
  amp: { a: o.a, sus: .86, tau: .6, rel: o.rel, lo: .35, hi: .65, pow: 1 }, gain: o.gain, vib: { rate: o.vib, depth: o.vibDepth, delay: o.vibDelay, ramp: .35, jitter: true }
});
export const reedP = (id: string, o: ReedOpts): Patch => ({
  id, osc: [{ wave: 'sawtooth', ratio: 1, level: 1, vib: true }], hp: { mul: .9 }, peaks: o.formants.map(x => [...x] as [number, number, number]),
  lp: { cut: { mul: 0, add: o.cut, lo: .7, hi: .3 }, q: .5 }, amp: { a: o.a, sus: .8, tau: .5, rel: o.rel, lo: .35, hi: .65, pow: 1 }, gain: o.gain,
  vib: { rate: o.vib, depth: o.vibDepth, delay: 0, ramp: .5 }
});
export const bowedP = (id: string, o: BowedOpts): Patch => ({
  // a body's resonances, when given, are computed into the wave and stand in for the one fixed peak
  id, osc: [{ wave: 'sawtooth', ratio: 1, level: 1, voices: o.voices, spread: o.detune, vib: true, body: o.body }], hp: { mul: .7 }, peaks: o.body ? undefined : [[1100, 1.2, 4]],
  lp: { cut: { mul: o.cutMul, add: o.cutAdd, lo: .75, hi: .25, min: 400, max: 14000, clampFirst: true }, q: .6 },
  amp: { a: o.a, sus: .92, tau: 1, rel: o.rel, lo: .4, hi: .6, pow: 1, fit: .3 }, gain: o.gain / Math.sqrt(o.voices),
  vib: { rate: o.vib, depth: o.vibDepth, delay: .18, ramp: .42, ensemble: o.ensemble }
});
export function organP(id: string, o: OrganOpts): Patch {
  const harm: number[] = [];
  o.bars.forEach(([r, l]) => { if (Number.isInteger(r)) harm[r - 1] = (harm[r - 1] || 0) + l; });
  const osc: Osc[] = [{ wave: 'harm', harm: Array.from(harm, h => h || 0), ratio: 1, level: 1, vib: !!o.vib }];
  o.bars.filter(([r]) => !Number.isInteger(r)).forEach(([r, l]) => osc.push({ wave: 'sine', ratio: r, level: l }));
  return {
    id, osc, perc: o.perc ? { ...o.perc } : undefined, click: o.click ? { level: o.click, freq: 2400, q: .8, tau: .004 } : undefined,
    amp: { a: o.a, sus: 1, tau: 1, rel: o.rel, lo: .55, hi: .45, pow: 1 }, gain: o.gain,
    vib: o.vib ? { rate: 6.1, depth: o.vib, delay: 0, ramp: 0, steady: true } : undefined
  };
}
export const squeezeP = (id: string, o: SqueezeOpts): Patch => ({
  id, osc: [{ wave: 'pulse', duty: o.bass ? .5 : .32, ratio: 1, level: 1, voices: 2, spread: o.musette }, ...(o.bass ? [{ wave: 'triangle', ratio: 1, level: .9 } as Osc] : [])],
  mix: .5, peaks: [[1500, 1, o.bass ? 0 : 3]], lp: { cut: { mul: 0, add: o.cut, lo: .75, hi: .25 }, q: .7 },
  amp: { a: o.a, sus: .9, tau: .8, rel: o.rel, lo: .45, hi: .55, pow: 1 }, gain: o.gain
});
export const chipP = (id: string, o: ChipOpts): Patch => ({
  id, osc: [{ wave: 'pulse', duty: o.duty, ratio: 1, level: 1, vib: !!o.vib }], lp: { cut: fixed(9000), q: 1 },
  amp: { a: o.a, sus: o.sus, tau: o.tau, rel: o.rel, lo: .4, hi: .6, pow: 1 }, gain: o.gain,
  vib: o.vib ? { rate: 6, depth: o.vib, delay: .2, ramp: .25 } : undefined
});
export const brassP = (id: string, o: BrassOpts): Patch => ({
  id, osc: [{ wave: 'sawtooth', ratio: 1, level: 1, voices: 2, spread: o.detune, vib: true }],
  lp: { cut: fixed(2000), q: 1.1, env: { start: { mul: 1.1, add: 0, lo: 1, hi: 0 }, peak: { mul: o.peakMul, add: 700, lo: .6, hi: .4, min: 600, max: 12000 }, atk: 1.2, sus: { mul: o.susMul, add: 450, lo: .7, hi: .3, min: 500, max: 9000 }, tau: .12 } },
  amp: { a: o.a, sus: .82, tau: .4, rel: o.rel, lo: .35, hi: .65, pow: 1 }, gain: o.gain, vib: { rate: 5.3, depth: 7, delay: .3, ramp: .4 }
});
export const synthBassP = (id: string, o: SynthBassOpts): Patch => ({
  id, osc: [{ wave: 'sawtooth', ratio: 1, level: 1 }, { wave: 'square', ratio: .5, level: .45 }],
  lp: { cut: fixed(o.cut1), q: o.q, env: { start: { mul: 0, add: o.cut0, lo: .5, hi: .5 }, sus: fixed(o.cut1), tau: o.tau } },
  amp: { a: .004, sus: .75, tau: .3, rel: o.rel, lo: .45, hi: .55, pow: 1 }, gain: o.gain
});
export const kitP = (gain: number): Patch => ({ id: 'kit', gain: 1, kit: gain });
