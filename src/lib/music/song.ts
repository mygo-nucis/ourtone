import { Timeline } from './timeline';
import type { PartData, SongData } from './types';
import { drumColumn } from './theory';

/** a part with its notes laid out in seconds, ready for the scheduler and the visuals */
export interface Part {
  data: PartData;
  index: number;
  n: number;
  start: Float64Array;
  dur: Float64Array;
  tick: Int32Array;
  pitch: Uint8Array;
  vel: Uint8Array;
  lo: number;
  hi: number;
  drums: boolean;
  /** average number of notes sounding together while the part plays */
  poly: number;
  /** notes per second across the part's span */
  density: number;
  /** an audio track: it plays clips, not notes */
  audio: boolean;
  /** an audio track's clips in seconds: where each starts in the song, where it starts in its source, how long it plays */
  clips: { src: string; start: number; off: number; dur: number }[];
}
export interface Song {
  data: SongData;
  tl: Timeline;
  parts: Part[];
  duration: number;
}

/** lay one part's notes out in seconds against the song's timeline */
export function preparePart(p: PartData, index: number, tl: Timeline): Part {
  const n = p.notes.length / 4, start = new Float64Array(n), dur = new Float64Array(n), tick = new Int32Array(n), pitch = new Uint8Array(n), vel = new Uint8Array(n);
  let lo = 127, hi = 0;
  const drums = p.role === 'drums' || p.preset === 'kit' || p.preset === 'ekit';
  for (let i = 0; i < n; i++) {
    const t = p.notes[i * 4], d = p.notes[i * 4 + 1], m = p.notes[i * 4 + 2];
    tick[i] = t; start[i] = tl.sec(t); dur[i] = Math.max(.03, tl.sec(t + d) - start[i]); pitch[i] = m; vel[i] = p.notes[i * 4 + 3];
    const v = drums ? drumColumn(m) : m;
    if (v < lo) lo = v; if (v > hi) hi = v;
  }
  if (!n) { lo = 60; hi = 72; }
  // total note time over the time covered by at least one note
  let busy = 0, sum = 0, end = -1;
  for (let i = 0; i < n; i++) { const a = start[i], b = a + dur[i]; sum += dur[i]; if (a >= end) busy += dur[i]; else if (b > end) busy += b - end; end = Math.max(end, b); }
  const poly = busy > 0 ? sum / busy : 1;
  const density = n > 1 ? n / Math.max(1, start[n - 1] - start[0]) : 1;
  const audio = p.kind === 'audio';
  const clips = audio ? (p.clips ?? []).map(c => ({ src: c.src, start: tl.sec(c.t), off: c.off, dur: c.dur })).sort((a, b) => a.start - b.start) : [];
  return { data: p, index, n, start, dur, tick, pitch, vel, lo, hi, drums, poly, density, audio, clips };
}

export function songDuration(parts: Part[]) {
  let duration = 0;
  for (const p of parts) {
    for (let i = 0; i < p.n; i++) duration = Math.max(duration, p.start[i] + p.dur[i]);
    for (const c of p.clips) duration = Math.max(duration, c.start + c.dur);
  }
  return duration;
}

export function prepareSong(data: SongData): Song {
  const tl = new Timeline(data.tempos, data.meters, data.ppq);
  const parts = data.parts.map((p, index) => preparePart(p, index, tl));
  return { data, tl, parts, duration: songDuration(parts) };
}
