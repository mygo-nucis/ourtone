import type { Song, Part } from '../../lib/music/song';
import { drumColumn } from '../../lib/music/theory';

/* how much of the pitch axis a window shows, as a slow function of song time.
   the song is cut into phrases (four bars, kept between 6 and 12 seconds); each phrase gets one robust range over
   the notes that pass through the view while it plays, neighbouring phrases with similar ranges merge, and only
   the boundaries ramp, over a few seconds. so a window holds still within a phrase and changes at most at phrase
   ends; the odd note outside the range is simply left out. */
export interface RangeTrack { dt: number; lo: Float32Array; hi: Float32Array }

const DT = .25;

function percentile(sorted: number[], q: number) {
  const i = (sorted.length - 1) * q, a = Math.floor(i), b = Math.ceil(i);
  return sorted[a] + (sorted[b] - sorted[a]) * (i - a);
}
/** phrase boundaries in seconds: groups of four bars, merged or split to stay between 6 and 12 seconds */
function phrases(song: Song): number[] {
  const bars = song.tl.bars(song.data.end), cuts: number[] = [0];
  let last = 0;
  for (let i = 4; i < bars.length; i += 4) {
    const t = song.tl.sec(bars[i].tick);
    if (t - last >= 6) { cuts.push(t); last = t; }
  }
  const out: number[] = [0];
  for (let i = 1; i <= cuts.length; i++) {
    const a = out[out.length - 1], b = i < cuts.length ? cuts[i] : song.duration + 4;
    for (let t = a + 12; t < b - 3; t += 12) out.push(t);
    if (i < cuts.length) out.push(b);
  }
  out.push(song.duration + 8);
  return out;
}

export function buildRange(p: Part, song: Song, span: number): RangeTrack {
  const val = (i: number) => p.drums ? drumColumn(p.pitch[i]) : p.pitch[i];
  const pad = p.drums ? .7 : 1.8, minSpan = p.drums ? 2.6 : 12, tol = p.drums ? .6 : 3.5;
  const cuts = phrases(song);
  // one robust range per phrase, over every note that is on screen while the phrase plays
  const segs: { a: number; b: number; lo: number; hi: number; empty: boolean }[] = [];
  for (let s = 0; s < cuts.length - 1; s++) {
    const a = cuts[s], b = cuts[s + 1], vals: number[] = [];
    for (let i = 0; i < p.n; i++) {
      const s0 = p.start[i];
      if (s0 > b + span) break;
      if (s0 + p.dur[i] >= a && s0 < b + span) vals.push(val(i));
    }
    if (!vals.length) { segs.push({ a, b, lo: 0, hi: 0, empty: true }); continue; }
    vals.sort((x, y) => x - y);
    const q = vals.length >= 16 ? .05 : 0;
    let lo = percentile(vals, q) - pad, hi = percentile(vals, 1 - q) + pad;
    if (hi - lo < minSpan) { const c = (lo + hi) / 2; lo = c - minSpan / 2; hi = c + minSpan / 2; }
    segs.push({ a, b, lo, hi, empty: false });
  }
  // rests keep the view they had; before the part enters, it waits with its first view
  const firstFull = segs.find(s => !s.empty);
  if (!firstFull) { const lo = (p.lo + p.hi) / 2 - minSpan / 2; segs.forEach(s => { s.lo = lo; s.hi = lo + minSpan; }); }
  else { let cur = firstFull; for (const s of segs) { if (s.empty) { s.lo = cur.lo; s.hi = cur.hi; } else cur = s; } }
  // neighbouring phrases that differ only a little share one view
  // (and a view only narrows for a real change of register: a phrase that fits inside it without shrinking it much keeps it)
  const merged: typeof segs = [];
  for (const s of segs) {
    const m = merged[merged.length - 1];
    const similar = m && Math.abs(s.lo - m.lo) <= tol && Math.abs(s.hi - m.hi) <= tol;
    const inside = m && s.lo >= m.lo - 1 && s.hi <= m.hi + 1 && (m.hi - m.lo) - (s.hi - s.lo) < (p.drums ? 1.5 : 7);
    if (m && (similar || inside)) { m.b = s.b; m.lo = Math.min(m.lo, s.lo); m.hi = Math.max(m.hi, s.hi); }
    else merged.push({ ...s });
  }
  // sample: each view holds for its phrases; boundaries ramp over a time that grows with the size of the change,
  // so even a big change of register glides (about 5 semitones a second at most)
  const len = (m: typeof segs[number]) => m.b - m.a;
  const hw = merged.slice(0, -1).map((m, j) => {
    const nx = merged[j + 1], jump = Math.max(Math.abs(nx.lo - m.lo), Math.abs(nx.hi - m.hi));
    return Math.max(.4, Math.min(Math.max(1.4, jump / 7), len(m) / 2, len(nx) / 2));
  });
  const ease = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
  const n = Math.ceil((song.duration + span + 4) / DT) + 1;
  const lo = new Float32Array(n), hi = new Float32Array(n);
  let si = 0;
  for (let k = 0; k < n; k++) {
    const t = k * DT + 1.2; // ramps run a little early, so arriving notes are already in view
    while (si < merged.length - 1 && t >= merged[si].b) si++;
    const cur = merged[si];
    let l = cur.lo, h = cur.hi;
    if (si > 0 && t < cur.a + hw[si - 1]) {
      const pv = merged[si - 1], f = ease((t - (cur.a - hw[si - 1])) / (2 * hw[si - 1]));
      l = pv.lo + (cur.lo - pv.lo) * f; h = pv.hi + (cur.hi - pv.hi) * f;
    } else if (si < merged.length - 1 && t > cur.b - hw[si]) {
      const nx = merged[si + 1], f = ease((t - (cur.b - hw[si])) / (2 * hw[si]));
      l = cur.lo + (nx.lo - cur.lo) * f; h = cur.hi + (nx.hi - cur.hi) * f;
    }
    lo[k] = l; hi[k] = h;
  }
  return { dt: DT, lo, hi };
}

export function rangeAt(r: RangeTrack, t: number): [number, number] {
  const f = Math.max(0, t) / r.dt, k = Math.min(r.lo.length - 2, Math.floor(f)), a = Math.min(1, f - k);
  return [r.lo[k] + (r.lo[k + 1] - r.lo[k]) * a, r.hi[k] + (r.hi[k + 1] - r.hi[k]) * a];
}
