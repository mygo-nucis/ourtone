import { buildBus, setTrim, setMasterFader, setEcho } from './engine';
import { instrumentFor, preset } from './presets';
import { bank } from './bank';
import { makeStrip, initStrip, audibility, mixOf } from './strip';
import { setOrigin, Poly, type Instrument } from './voices';
import type { Song, Part } from '../music/song';
import { lowerBound } from '../util';

/* renders a stretch of a song offline, through the same strips and mix as live playback: the basis of WAV/MP3 export
   and of the mix tests.
   notes are scheduled a window at a time while the render runs (it pauses at each window's end), the way live playback
   schedules them: a browser renders a graph holding every note of a long song very slowly (each note's nodes are
   visited on every block, sounding or not), while a graph holding only what sounds now renders many times faster. */
export interface RenderOpts {
  from?: number; to?: number; tail?: number; night?: boolean; parts?: number[]; sampleRate?: number;
  make?: (channels: number, length: number, sampleRate: number) => OfflineAudioContext; onProgress?: (k: number) => void;
  /** a piece of a longer render: that render's end and tail, where notes and clips are cut short (default: this one's) */
  whole?: { to: number; tail: number };
  /** keep each part to this many voices, as live playback does (exports leave it out: every note rings out in full) */
  voices?: number;
  /** a look at the mix bus once it is built (a test can take the master's dynamics out) */
  onBus?: (bus: import('./engine').Bus) => void;
}
/** seconds of notes put in the graph at a time, and how far ahead of the render they go in */
const WINDOW = 1, AHEAD = .5;
interface Lane { p: Part; inst: Instrument | null; input: AudioNode; cursor: number; clipsDone: Set<number>; poly?: Poly }

export async function renderSong(song: Song, o: RenderOpts = {}): Promise<AudioBuffer> {
  const sr = o.sampleRate ?? 48000, from = o.from ?? 0, to = Math.min(o.to ?? song.duration, song.duration), tail = o.tail ?? 2.5;
  const cutTo = o.whole?.to ?? to, cutTail = o.whole?.tail ?? tail;
  const len = Math.ceil((to - from + tail) * sr), total = len / sr;
  const ctx = o.make ? o.make(2, len, sr) : new OfflineAudioContext(2, len, sr);
  setOrigin(ctx, from);
  const bus = buildBus(ctx, !!o.night);
  setTrim(bus, song.data.gain);
  setMasterFader(bus, song.data.master ?? 0, true);
  setEcho(bus, song.data.tempos[0]?.[1] ?? 120, true);
  o.onBus?.(bus);
  const mixes = song.parts.map(mixOf), aud = audibility(mixes);
  const parts = o.parts ?? song.parts.map((_, i) => i);

  // one strip per part, and every instrument ready (strings and pianos render their notes first)
  const lanes: Lane[] = [];
  let k = 0;
  for (const i of parts) {
    const p = song.parts[i], strip = makeStrip(ctx, bus, p.data.preset);
    initStrip(strip, p.data, mixes[i], o.parts ? true : aud[i]);
    if (p.audio) { lanes.push({ p, inst: null, input: strip.input, cursor: 0, clipsDone: new Set() }); continue; }
    const inst = instrumentFor(p.data);
    const pitches: number[] = [];
    for (let j = 0; j < p.n; j++) if (p.start[j] >= from && p.start[j] < to) pitches.push(p.pitch[j]);
    await inst.prepare(ctx, pitches);
    lanes.push({ p, inst, input: inst.chain ? inst.chain(strip.input) : strip.input, cursor: lowerBound(p.start, from - 1e-9), clipsDone: new Set(), poly: o.voices && !p.drums ? new Poly(o.voices) : undefined });
    o.onProgress?.(++k / parts.length * .1);
  }

  /** put everything that starts before `until` (song seconds) into the graph */
  const schedule = (until: number) => {
    const lim = Math.min(until, to);
    for (const L of lanes) {
      const p = L.p;
      if (L.inst) {
        let c = L.cursor;
        for (; c < p.n && p.start[c] < lim; c++) {
          const t = p.start[c];
          if (t < from) continue;
          const d = Math.min(p.dur[c], cutTo - t + cutTail * .5);
          if (L.poly) { L.poly.room(t - from, p.pitch[c]); const v = L.inst.start(L.input, t - from, p.pitch[c], p.vel[c], d); v.release(t - from + d); L.poly.add(v, p.pitch[c], t - from); }
          else L.inst.play(L.input, t - from, p.pitch[c], p.vel[c], d);
        }
        L.cursor = c;
        continue;
      }
      // an audio track's clips, cut to the stretch being rendered
      p.clips.forEach((c, j) => {
        if (L.clipsDone.has(j) || c.start >= lim) return;
        L.clipsDone.add(j);
        const buf = bank.get(c.src), a = Math.max(c.start, from), b = Math.min(c.start + c.dur, cutTo, to + tail);
        if (!buf || b <= a) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(L.input);
        src.start(a - from, c.off + (a - c.start), b - a);
      });
    }
  };

  // the first window now; each later one when the render pauses at the end of the one before
  schedule(from + WINDOW + AHEAD);
  let paused = false;
  if (typeof ctx.suspend === 'function') {
    try {
      for (let t = WINDOW; t < total; t += WINDOW) {
        const at = t;
        ctx.suspend(at).then(() => {
          schedule(from + at + WINDOW + AHEAD);
          o.onProgress?.(.1 + .9 * at / total);
          void ctx.resume();
        }, () => { /* this pause could not be set: the next one schedules what it missed */ });
      }
      paused = true;
    } catch { paused = false; }
  }
  // no pausing here: everything goes in at once (slow for long songs, but correct)
  if (!paused) schedule(Infinity);
  const out = await ctx.startRendering();
  o.onProgress?.(1);
  return out;
}

/* the export: the song cut into pieces rendered side by side (a browser renders each offline context on a thread of
   its own, so six pieces take about a third of the time of one), then joined.
   each piece starts early enough that at its seam it sounds exactly as the whole render would: every note still
   ringing there, and the room and echo after it, already playing; and it starts a whole number of the chorus's
   cycles from the start, so the chorus is in step too. the pieces overlap by a few milliseconds and cross there. */
/** pieces start a whole number of these from the start: four of the chorus's cycles (fx.ts, .8 Hz), and at 48 kHz a
    whole number of the 128-sample blocks a browser renders in, so each piece's blocks line up with the whole render's */
const CYCLE = 5;
/** how long the room (4.6 s at most) and the echo keep sounding after a note has gone */
const ROOM_TAIL = 6;
const XFADE = .03;
/** how long a part's note can still be heard after it is released */
function tailOf(p: Part) {
  if (p.audio) return 0;
  const P = p.data.patch ?? preset(p.data.preset).patch;
  if (P.kit !== undefined) return 8;
  return Math.min(30, Math.max(1, Math.max(P.amp?.rel ?? 0, P.a?.rel ?? 0) * 8));
}
/** how many pieces a render of `span` seconds is worth on this machine */
export function piecesFor(span: number) {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  const mem = typeof navigator !== 'undefined' ? (navigator as { deviceMemory?: number }).deviceMemory ?? 8 : 8;
  return Math.max(1, Math.min(mem <= 2 ? 2 : 6, cores - 1, Math.round(span / 30)));
}

export async function renderSongSplit(song: Song, o: RenderOpts & { pieces?: number } = {}): Promise<AudioBuffer> {
  const sr = o.sampleRate ?? 48000, from = o.from ?? 0, to = Math.min(o.to ?? song.duration, song.duration), tail = o.tail ?? 2.5;
  const k = o.pieces ?? piecesFor(to - from);
  if (k <= 1 || o.parts) return renderSong(song, o);
  const parts = song.parts.map((_, i) => i);
  // the seams, and where the piece after each one starts
  const seams = Array.from({ length: k - 1 }, (_, i) => from + (to - from) * (i + 1) / k);
  const starts = [from, ...seams.map(b => {
    let s = b - ROOM_TAIL;
    for (const i of parts) {
      const p = song.parts[i], ring = tailOf(p) + ROOM_TAIL;
      for (let j = 0; j < p.n && p.start[j] < b; j++) if (p.start[j] + p.dur[j] + ring > b) s = Math.min(s, p.start[j]);
      for (const c of p.clips) if (c.start < b && c.start + c.dur + ROOM_TAIL > b) s = Math.min(s, Math.max(c.start, b - ROOM_TAIL));
    }
    return Math.max(from, from + Math.floor((s - from) / CYCLE) * CYCLE);
  })];
  const edges = [from, ...seams, to + tail];
  const len = Math.ceil((to - from + tail) * sr), n = Math.round(XFADE * sr);
  const res = new AudioBuffer({ numberOfChannels: 2, length: len, sampleRate: sr });
  const out = [res.getChannelData(0), res.getChannelData(1)];
  const done = new Array(k).fill(0), size = starts.map((s, i) => edges[i + 1] + (i < k - 1 ? XFADE : 0) - s);
  const whole = size.reduce((a, b) => a + b, 0);
  const report = () => o.onProgress?.(done.reduce((a, d, i) => a + d * size[i], 0) / whole);

  await Promise.all(starts.map(async (s, i) => {
    const last = i === k - 1;
    const buf = await renderSong(song, {
      ...o, from: s, to: last ? to : edges[i + 1] + XFADE, tail: last ? tail : .05, whole: { to, tail },
      onProgress: d => { done[i] = d; report(); }
    });
    // this piece's stretch, crossing into its neighbours over the overlap
    const off = Math.round((s - from) * sr), a = Math.round((edges[i] - from) * sr), b = Math.min(len, Math.round((edges[i + 1] - from) * sr) + (last ? 0 : n));
    for (let c = 0; c < 2; c++) {
      const src = buf.getChannelData(Math.min(c, buf.numberOfChannels - 1)), dst = out[c];
      for (let x = a; x < b; x++) {
        const y = x - off;
        if (y < 0 || y >= src.length) continue;
        const w = i > 0 && x < a + n ? (x - a + .5) / n : !last && x >= b - n ? (b - x - .5) / n : 1;
        dst[x] += src[y] * w;
      }
    }
  }));
  o.onProgress?.(1);
  return res;
}
