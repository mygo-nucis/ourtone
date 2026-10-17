import { byTime, type EditDoc, type EditPart, type Note } from './doc';
import type { AudioClip } from '../music/types';
import type { Timeline, Bar } from '../music/timeline';
import { lowerBound } from '../util';

/* the bar grid of a song, extended past its end so there is room to write */
export type SnapMode = 'phrase' | 'bar' | 'beat' | 'free';
export class Grid {
  readonly bars: Bar[];
  readonly starts: number[];
  constructor(readonly tl: Timeline, end: number, extra = 32) {
    const base = tl.bars(end);
    const last = base[base.length - 1];
    let t = last.tick + last.ticks, i = base.length;
    for (let k = 0; k < extra; k++) { base.push({ index: i++, tick: t, ticks: last.ticks, num: last.num, den: last.den }); t += last.ticks; }
    this.bars = base;
    this.starts = base.map(b => b.tick);
  }
  get end() { const l = this.bars[this.bars.length - 1]; return l.tick + l.ticks; }
  /** the bar a tick falls in (0-based) */
  barAt(tick: number) { return Math.max(0, Math.min(this.bars.length - 1, lowerBound(this.starts, tick + 1e-6) - 1)); }
  tickOf(bar: number) {
    if (bar < this.bars.length) return this.starts[Math.max(0, bar)];
    const l = this.bars[this.bars.length - 1];
    return l.tick + (bar - l.index) * l.ticks;
  }
  beat(tick: number) { const b = this.bars[this.barAt(tick)]; return this.tl.beatTicks(b.num, b.den); }
  /** snap a tick to the grid: phrase = 4 bars; free leaves it where it is */
  snap(tick: number, mode: SnapMode, how: 'floor' | 'round' | 'ceil' = 'round') {
    if (mode === 'free') return Math.max(0, Math.round(tick));
    const f = how === 'floor' ? Math.floor : how === 'ceil' ? Math.ceil : Math.round;
    if (mode === 'beat') { const b = this.bars[this.barAt(tick)], bt = this.beat(tick); return b.tick + f((tick - b.tick) / bt) * bt; }
    const i = this.barAt(tick), per = mode === 'phrase' ? 4 : 1;
    const a = Math.floor(i / per) * per, ta = this.tickOf(a), tb = this.tickOf(a + per);
    return f((tick - ta) / (tb - ta)) >= 1 ? tb : ta;
  }
  /** one snap step from a tick (for nudging a selection) */
  step(tick: number, mode: SnapMode, dir: 1 | -1) {
    if (mode === 'beat' || mode === 'free') return tick + dir * this.beat(tick);
    const per = mode === 'phrase' ? 4 : 1;
    return this.tickOf(this.barAt(tick) + dir * per);
  }
}

export const inRange = (n: Note, a: number, b: number) => n.t >= a && n.t < b;

/** what a stretch of a part holds: its notes and (on an audio track) its clips, by where they start */
export interface Chunk { notes: Note[]; clips: AudioClip[] }
const clipIn = (c: AudioClip, a: number, b: number) => c.t >= a && c.t < b;
const byStart = (x: AudioClip, y: AudioClip) => x.t - y.t;
export function clearRange(ep: EditPart, a: number, b: number) { ep.notes = ep.notes.filter(n => !inRange(n, a, b)); ep.clips = ep.clips.filter(c => !clipIn(c, a, b)); }
/** what starts in [a, b), with times relative to a */
export function takeRange(ep: EditPart, a: number, b: number): Chunk {
  return { notes: ep.notes.filter(n => inRange(n, a, b)).map(n => ({ ...n, t: n.t - a })), clips: ep.clips.filter(c => clipIn(c, a, b)).map(c => ({ ...c, t: c.t - a })) };
}
/** write a chunk (relative times) at `at`, beside whatever is there already. a note the same as one already there (the
    same pitch struck at the same tick) is one note: the longer and the louder of the two. a clip already there, likewise */
export function putAt(ep: EditPart, rel: Chunk, at: number) {
  const add = rel.notes.filter(n => n.t + at >= 0).map(n => ({ ...n, t: n.t + at }));
  const have = new Map<string, Note>();
  for (const n of ep.notes) have.set(n.t + ':' + n.p, n);
  const fresh: Note[] = [];
  for (const n of add) {
    const o = have.get(n.t + ':' + n.p);
    if (o) { o.d = Math.max(o.d, n.d); o.v = Math.max(o.v, n.v); } else { have.set(n.t + ':' + n.p, n); fresh.push(n); }
  }
  ep.notes = ep.notes.concat(fresh).sort(byTime);
  const same = (x: AudioClip, y: AudioClip) => x.src === y.src && x.t === y.t && x.off === y.off;
  const clips = rel.clips.filter(c => c.t + at >= 0).map(c => ({ ...c, t: c.t + at }));
  ep.clips = ep.clips.concat(clips.filter(c => !ep.clips.some(o => same(o, c)))).sort(byStart);
  return add;
}
/** move what starts in [a, b) of one part by `delta` ticks, into the same part or another (`to`), beside what is there */
export function moveRange(ep: EditPart, a: number, b: number, delta: number, to: EditPart = ep) {
  const rel = takeRange(ep, a, b);
  clearRange(ep, a, b);
  return putAt(to, rel, a + delta);
}
export function transposeRange(ep: EditPart, a: number, b: number, k: number) {
  let changed = false;
  for (const n of ep.notes) if (inRange(n, a, b)) { const p = Math.max(0, Math.min(127, n.p + k)); if (p !== n.p) { n.p = p; changed = true; } }
  if (changed) ep.notes.sort(byTime);
  return changed;
}

/** open up `len` ticks of silence at `at` in every part, moving the tempo and meter maps with it */
export function insertTime(doc: EditDoc, at: number, len: number) {
  for (const p of doc.parts) {
    for (const n of p.notes) if (n.t >= at) n.t += len;
    for (const c of p.clips) if (c.t >= at) c.t += len;
    p.cuts = p.cuts.map(c => c >= at ? c + len : c);
  }
  doc.meta.tempos = doc.meta.tempos.map(([t, bpm]) => [t >= at && t > 0 ? t + len : t, bpm]);
  doc.meta.meters = doc.meta.meters.map(([t, a, b]) => [t >= at && t > 0 ? t + len : t, a, b]);
  doc.meta.end += len;
}
/** cut [a, b) out of every part and close the gap */
export function deleteTime(doc: EditDoc, a: number, b: number) {
  const len = b - a;
  for (const p of doc.parts) {
    p.notes = p.notes.filter(n => !inRange(n, a, b));
    for (const n of p.notes) if (n.t >= b) n.t -= len;
    p.clips = p.clips.filter(c => !clipIn(c, a, b));
    for (const c of p.clips) if (c.t >= b) c.t -= len;
    p.cuts = p.cuts.filter(c => c < a || c >= b).map(c => c >= b ? c - len : c);
  }
  const shift = <T extends number[]>(ev: T[]): T[] => {
    const out: T[] = [];
    for (const e of ev) {
      const t = e[0];
      const nt = t < a ? t : t < b ? a : t - len;
      const x = [nt, ...e.slice(1)] as T;
      if (out.length && out[out.length - 1][0] === nt) out[out.length - 1] = x; else out.push(x);
    }
    return out;
  };
  doc.meta.tempos = shift(doc.meta.tempos);
  doc.meta.meters = shift(doc.meta.meters);
  doc.meta.end = Math.max(0, doc.meta.end - len);
}

/** the length of the bar a tick is in */
export const barLen = (grid: Grid, t: number) => { const b = grid.barAt(t); return grid.tickOf(b + 1) - grid.tickOf(b); };

/** a part's passages: runs of notes, split at rests of a bar or more and at the part's cuts. a passage ends at the cut
    after it, so the stretch [a, b) holds exactly its own notes' starts */
export interface Run { a: number; b: number }
export function passagesOf(ep: EditPart, grid: Grid): Run[] {
  // on an audio track the passages are its clips
  if (ep.meta.kind === 'audio') return ep.clips.map(c => ({ a: c.t, b: Math.max(c.t + 1, clipEnd(c, grid.tl)) }));
  const cuts = ep.cuts, out: Run[] = [];
  let cur: Run | null = null, ci = 0;
  for (const n of ep.notes) {
    if (cur) {
      while (ci < cuts.length && cuts[ci] <= cur.a) ci++;
      const cut = ci < cuts.length && cuts[ci] <= n.t ? cuts[ci] : -1;
      if (cut < 0 && n.t - cur.b < barLen(grid, cur.b)) { cur.b = Math.max(cur.b, n.t + n.d); continue; }
      if (cut >= 0) cur.b = Math.min(cur.b, cut);
    }
    cur = { a: n.t, b: n.t + n.d };
    out.push(cur);
  }
  // a long note can reach past the next cut: the passage still stops there
  for (const r of out) { const c = cuts.find(x => x > r.a); if (c !== undefined && c < r.b) r.b = c; }
  return out;
}
/** the passage a tick falls in, if any */
export function passageAt(runs: Run[], t: number) { for (const r of runs) if (t >= r.a && t < r.b) return r; return null; }
/** keep only the cuts that separate something: notes on both sides that would otherwise run together */
export function tidyCuts(ep: EditPart, grid: Grid) {
  if (!ep.cuts.length || ep.meta.kind === 'audio') return;
  const ns = ep.notes;
  ep.cuts = [...new Set(ep.cuts.map(c => Math.round(c)))].sort((a, b) => a - b).filter(c => {
    let endBefore = -Infinity, startAfter = Infinity;
    for (const n of ns) { if (n.t < c) { if (n.t + n.d > endBefore) endBefore = n.t + n.d; } else if (n.t < startAfter) startAfter = n.t; }
    return endBefore > -Infinity && startAfter < Infinity && startAfter - endBefore < barLen(grid, c);
  });
}
/** where a clip ends, in ticks */
export const clipEnd = (c: AudioClip, tl: Timeline) => Math.round(tl.tick(tl.sec(c.t) + c.dur));
/** split a part at a tick: notes sounding across it end there; a clip across it becomes two, cut at that moment */
export function splitAt(ep: EditPart, at: number, tl: Timeline) {
  if (ep.meta.kind === 'audio') {
    const sAt = tl.sec(at), out: AudioClip[] = [];
    for (const c of ep.clips) {
      const s0 = tl.sec(c.t), d1 = sAt - s0;
      if (d1 > .005 && d1 < c.dur - .005) out.push({ ...c, dur: d1 }, { ...c, t: at, off: c.off + d1, dur: c.dur - d1 });
      else out.push(c);
    }
    ep.clips = out.sort(byStart);
    return;
  }
  for (const n of ep.notes) if (n.t < at && n.t + n.d > at) n.d = at - n.t;
  ep.cuts = [...ep.cuts, at].sort((a, b) => a - b);
}
/** the last tick any part sounds */
export function lastTick(doc: EditDoc, tl?: Timeline) {
  let e = 0;
  for (const p of doc.parts) {
    for (const n of p.notes) e = Math.max(e, n.t + n.d);
    for (const c of p.clips) e = Math.max(e, tl ? clipEnd(c, tl) : c.t);
  }
  return e;
}
