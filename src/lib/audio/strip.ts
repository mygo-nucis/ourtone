import type { Bus } from './engine';
import { preset } from './presets';
import { FxChain, effective, fxOf, macrosOf } from './fx';
import type { Mix, PartData } from '../music/types';
import type { Part } from '../music/song';

/* a part's channel: input -> inserts -> pan -> fader -> mute/solo gate -> dry, plus reverb and delay sends (post-fader) */
export interface Strip {
  input: GainNode;
  fx: FxChain;
  pan: StereoPannerNode;
  level: GainNode;
  gate: GainNode;
  send: GainNode;
  dsend: GainNode;
  /** the preset's calibration: the fader's 0 dB */
  base: number;
  meter?: { l: AnalyserNode; r: AnalyserNode };
}
/** the default mix brings the melody a little forward and sets extra parts a little back */
export const ROLE_GAIN: Record<string, number> = { melody: 1.41, guitar: 1, piano: 1, bass: 1, drums: 1, other: .89 };
/** a part's default volume: its role, less for parts that stack many notes at once (full piano chords, string pads),
    and less for drum parts that hit many times a second */
export function partVolume(role: string, poly: number, drums: boolean, density = 4) {
  const k = drums ? 1 / Math.sqrt(Math.max(1, density / 4)) : 1 / Math.sqrt(Math.max(1, poly));
  return (ROLE_GAIN[role] ?? 1) * Math.max(drums ? .35 : .45, Math.min(1, k));
}
export const dbToGain = (db: number) => db <= -80 ? 0 : Math.pow(10, db / 20);
export const gainToDb = (g: number) => g <= 1e-4 ? -80 : 20 * Math.log10(g);

/** the automatic mix of a part, as fader settings */
export function defaultMix(role: string, presetId: string, poly: number, drums: boolean, density: number): Mix {
  return { vol: gainToDb(partVolume(role, poly, drums, density)), pan: 0, rev: preset(presetId).send, dly: 0, mute: false, solo: false };
}

/** a part's mixer settings: saved ones, or the automatic default */
export function mixOf(p: Part): Mix { return p.data.mix ?? defaultMix(p.data.role, p.data.preset, p.poly, p.drums, p.density); }

export function makeStrip(ctx: BaseAudioContext, bus: Bus, presetId: string, meters = false): Strip {
  const pr = preset(presetId);
  const input = ctx.createGain();
  const fx = new FxChain(ctx);
  const pan = ctx.createStereoPanner(); pan.pan.value = 0;
  const base = pr.level * .8;
  const level = ctx.createGain(); level.gain.value = base;
  const gate = ctx.createGain();
  const send = ctx.createGain(); send.gain.value = pr.send;
  const dsend = ctx.createGain(); dsend.gain.value = 0;
  input.connect(fx.input); fx.output.connect(pan).connect(level).connect(gate);
  gate.connect(bus.dry); gate.connect(send).connect(bus.wet); gate.connect(dsend).connect(bus.delay);
  const st: Strip = { input, fx, pan, level, gate, send, dsend, base };
  if (meters) {
    const split = ctx.createChannelSplitter(2), l = ctx.createAnalyser(), r = ctx.createAnalyser();
    l.fftSize = r.fftSize = 512;
    gate.connect(split); split.connect(l, 0); split.connect(r, 1);
    st.meter = { l, r };
  }
  return st;
}

/** set a strip's fader, pan and sends; `audible` folds in mute and solo across the whole mix */
export function applyMix(st: Strip, m: Mix, audible: boolean, now?: number) {
  const t = now ?? st.level.context.currentTime;
  st.level.gain.setTargetAtTime(st.base * dbToGain(m.vol), t, .012);
  st.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, m.pan)), t, .012);
  st.send.gain.setTargetAtTime(m.rev, t, .012);
  st.dsend.gain.setTargetAtTime(m.dly, t, .012);
  st.gate.gain.setTargetAtTime(audible ? 1 : 0, t, .008);
}
/** mute and solo for every part at once: with any part soloed, only soloed parts sound */
export function audibility(mixes: Mix[]) {
  const solo = mixes.some(m => m.solo);
  return mixes.map(m => solo ? m.solo : !m.mute);
}
export function applyFx(st: Strip, p: PartData) { st.fx.set(effective(fxOf(p.fx), macrosOf(p.macro))); }
/** set a strip's value at once (offline renders start from here) */
export function initStrip(st: Strip, p: PartData, m: Mix, audible: boolean) {
  st.level.gain.value = st.base * dbToGain(m.vol);
  st.pan.pan.value = Math.max(-1, Math.min(1, m.pan));
  st.send.gain.value = m.rev;
  st.dsend.gain.value = m.dly;
  st.gate.gain.value = audible ? 1 : 0;
  applyFx(st, p);
}
