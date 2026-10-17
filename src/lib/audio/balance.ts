import { renderSong } from './offline';
import { preset } from './presets';
import { prepareSong, type Song } from '../music/song';
import type { SongData, Mix } from '../music/types';

/* a song's mix, measured: each part is rendered alone over its busiest stretches and its loudness while it plays
   (400 ms blocks, the quiet ones gated out) is brought to a target for its role. the melody leads; bass and drums sit
   just under it; accompaniment a little further back; pads and sustained strings further still. then the song's trim
   brings its busiest stretch to a common level. used for the built-in songs (offline, tests/automix.ts) and for every
   MIDI file a viewer imports. */
export const MELODY_TARGET = -20;
const REL: Record<string, number> = { melody: 0, bass: -2.5, drums: -1.5, guitar: -3.5, piano: -4, other: -3 };
const SOFT = new Set(['strings', 'pad', 'organ', 'accordion']);
const PAN: Record<string, number[]> = { guitar: [-.22], piano: [.18], other: [-.28, .26, -.16, .14, -.34, .32] };
type Make = (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

/** loudness while playing: mean power of the 400 ms blocks within 20 dB of the loudest, in dB */
export function activeLoudness(b: AudioBuffer) {
  const n = Math.round(b.sampleRate * .4), L = b.getChannelData(0), R = b.numberOfChannels > 1 ? b.getChannelData(1) : L, blocks: number[] = [];
  for (let s = 0; s + n <= b.length; s += n) { let e = 0; for (let i = s; i < s + n; i++) e += L[i] * L[i] + R[i] * R[i]; blocks.push(e / (2 * n)); }
  const top = Math.max(...blocks, 1e-12), keep = blocks.filter(e => e > top * .01 && e > 1e-7);
  return keep.length ? 10 * Math.log10(keep.reduce((a, e) => a + e, 0) / keep.length) : -120;
}
/** loudness as heard: the same blocks after the K-weighting of ITU-R BS.1770 (a high shelf at 1.5 kHz, a high-pass at
    38 Hz). plain power counts a kick's sub-bass at full weight, which the ear (and a small speaker) hardly hears */
export function heardLoudness(b: AudioBuffer) {
  const sr = b.sampleRate, chs = Array.from({ length: Math.min(2, b.numberOfChannels) }, (_, c) => kWeight(b.getChannelData(c), sr));
  const n = Math.round(sr * .4), blocks: number[] = [];
  for (let s = 0; s + n <= b.length; s += n) { let e = 0; for (const d of chs) for (let i = s; i < s + n; i++) e += d[i] * d[i]; blocks.push(e / n); }
  const top = Math.max(...blocks, 1e-12), keep = blocks.filter(e => e > top * .01 && e > 1e-9);
  return keep.length ? -.691 + 10 * Math.log10(keep.reduce((a, e) => a + e, 0) / keep.length) : -120;
}
function kWeight(x: Float32Array, sr: number) {
  const run = (x: Float32Array, b: number[], a: number[]) => { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = (b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2) / a[0]; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; };
  let w = 2 * Math.PI * 1500 / sr, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2;
  const A = Math.pow(10, 4 / 40), sa = 2 * Math.sqrt(A) * al;
  const shelf = run(x, [A * ((A + 1) + (A - 1) * c + sa), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sa)], [(A + 1) - (A - 1) * c + sa, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sa]);
  w = 2 * Math.PI * 38 / sr; c = Math.cos(w); al = Math.sin(w);
  return run(shelf, [(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al]);
}
/* each part is set against the melody alone, so where the accompaniment is many parts, together they buried the drums:
   in Haruhikage, Crazy Dave and Kimi no Kioku the kit sat 7.5-10 dB under the rest of the band as heard (12-14 on a
   laptop's or phone's speaker). so the drums are then brought up to no more than 5 dB under the band, by 4 dB at most,
   and never down */
export const DRUMS_UNDER_BAND = -5, DRUMS_UP_MAX = 4;
/** how far to raise a song's drums (dB, 0 if they are close enough): over their busiest stretch, as mixed */
export async function drumsUp(song: Song, d: number, o: { make?: Make; sampleRate?: number; window?: number } = {}) {
  const rest = song.parts.map((_, i) => i).filter(i => i !== d && !song.parts[i].data.mix?.mute);
  const win = busiest(song.parts[d].start, song.duration, o.window ?? 20, 1)[0];
  if (!rest.length || !win) return 0;
  const at = (parts: number[]) => renderSong(song, { from: win[0], to: win[1], parts, make: o.make, tail: .5, sampleRate: o.sampleRate ?? 32000 }).then(heardLoudness);
  const gap = await at([d]) - await at(rest), up = Math.min(DRUMS_UP_MAX, DRUMS_UNDER_BAND - gap);
  return up >= .3 ? +up.toFixed(1) : 0;
}
/** a part's busiest stretches: up to `max` windows of `w` seconds holding the most note starts */
export function busiest(start: ArrayLike<number>, dur: number, w = 20, max = 3): [number, number][] {
  const cand: [number, number][] = [];
  for (let t = 0; t < Math.max(w, dur); t += w / 4) { let k = 0; for (let i = 0; i < start.length; i++) if (start[i] >= t && start[i] < t + w) k++; if (k) cand.push([t, k]); }
  cand.sort((a, b) => b[1] - a[1]);
  const out: [number, number][] = [];
  for (const [t] of cand) { if (out.every(([a]) => Math.abs(a - t) >= w)) out.push([t, Math.min(dur, t + w)]); if (out.length === max) break; }
  return out;
}
const rms = (b: AudioBuffer) => { let e = 0, n = 0; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { e += d[i] * d[i]; n++; } } return 10 * Math.log10(Math.max(1e-12, e / Math.max(1, n))); };

/** set every part's fader (and a little stereo width) and the song's trim; returns each part's measured loudness.
    `fixed` holds faders set by ear (dB, by part index): those parts keep them, and the trim counts them in */
export async function balance(data: SongData, o: { make?: Make; sampleRate?: number; windows?: number; window?: number; fixed?: (number | undefined)[]; onprogress?: (done: number, total: number) => void } = {}) {
  const sr = o.sampleRate ?? 32000, nw = o.windows ?? 3, w = o.window ?? 20;
  const neutral: SongData = { ...data, gain: 0, parts: data.parts.map(p => ({ ...p, mix: { vol: 0, pan: 0, rev: 0, dly: 0, mute: false, solo: false } })) };
  const song = prepareSong(neutral);
  const loud: number[] = [];
  for (let i = 0; i < song.parts.length; i++) {
    const p = song.parts[i];
    if (p.audio || !p.n) { loud.push(-120); continue; }
    let e = 0, k = 0;
    for (const [a, b] of busiest(p.start, song.duration, w, nw)) {
      const l = activeLoudness(await renderSong(song, { from: a, to: b, parts: [i], make: o.make, tail: .5, sampleRate: sr }));
      if (l > -100) { e += Math.pow(10, l / 10); k++; }
    }
    loud.push(k ? 10 * Math.log10(e / k) : -120);
    o.onprogress?.(i + 1, song.parts.length + 1);
  }
  const used: Record<string, number> = {};
  data.parts.forEach((p, i) => {
    if (p.kind === 'audio') return;
    const soft = p.role !== 'melody' && p.role !== 'bass' && p.role !== 'drums' && SOFT.has(p.preset);
    const target = MELODY_TARGET + (soft ? -5 : REL[p.role] ?? -3);
    // drums never come up much (a lone tambourine is decoration, not a lead)
    const vol = o.fixed?.[i] ?? (loud[i] > -100 ? Math.max(-18, Math.min(p.role === 'drums' ? 2 : 6, target - loud[i])) : 0);
    const pans = PAN[p.role], k = used[p.role] = (used[p.role] ?? -1) + 1;
    const mix: Mix = { vol: +vol.toFixed(1), pan: pans && data.parts.length > 2 ? pans[k % pans.length] : 0, rev: preset(p.preset).send, dly: 0, mute: false, solo: false };
    p.mix = mix;
  });
  data.gain = 0;
  // then the drums against everything else
  for (let i = 0; i < data.parts.length; i++) if (data.parts[i].role === 'drums' && o.fixed?.[i] === undefined && loud[i] > -100) {
    const up = await drumsUp(prepareSong(data), i, { make: o.make, sampleRate: sr, window: w });
    if (up) data.parts[i].mix!.vol = +(data.parts[i].mix!.vol + up).toFixed(1);
  }
  const mixed = prepareSong(data), starts = mixed.parts.flatMap(p => Array.from(p.start));
  const [a, b] = busiest(starts, mixed.duration, w, 1)[0] ?? [0, Math.min(w, mixed.duration)];
  data.gain = +Math.max(-6, Math.min(12, -15.5 - rms(await renderSong(mixed, { from: a, to: b, make: o.make, tail: .5, sampleRate: sr })))).toFixed(1);
  o.onprogress?.(song.parts.length + 1, song.parts.length + 1);
  return loud;
}
