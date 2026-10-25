import type { Part } from '../../lib/music/song';
import { drumColumn } from '../../lib/music/theory';
import { lowerBound } from '../../lib/util';

/* play mode's chart: a part's notes laid onto six lanes (S D F · J K L).
   pitched parts follow the tune's shape, not its scale degrees: within each stretch of a few seconds the higher notes
   sit further right, and a line that climbs moves right (it never wraps round to the left edge as an octave fold
   would). notes struck together are one chart note (a wide chord, two). drums go by sound: kick, snare, toms, hats,
   cymbals, hand percussion.
   a press only ever sounds what the song wrote: a chart note carries its exact pitches. notes too close together to
   play are left off the chart; in a pitched part they ride with the chart note before them, sounding after the press
   as long after it as the song has them (a rolled chord stays one roll however early or late the press), and in a drum
   part the band plays them on time, so the groove never has holes.
   that thinning of a pitched part (a rolled chord, a grace note, a run too quick to play: one press) can be turned
   off (`simplify` false): then every onset is a chart note of its own (notes struck together still one), and one that
   would land on a lane still in use takes the next free lane the line moves toward. drums are thinned either way.
   a long note is held, but only until the next note to play comes up (on any lane): a pedalled or sustained note
   that rings on under the next ones becomes a short hold or a tap, so you never hold one key while the next note
   arrives on it. the sound is untouched: a hit still plays every note for its written length. a hold is asked for
   only when that leaves it long enough to feel held (`HOLD`), so notes a beat apart at a brisk tempo are all taps;
   a part can mark stretches by hand (its `holds`, ticks) where a note written that long is held anyway, to just
   before the next one.
   several parts at once (multi-track play) share the six lanes. by default each part spreads over all six as it would
   on its own; they are merged, the melody first, and a note whose lane is taken moves to the nearest free one (nearer
   the middle first) before it is left to the band. or (`split`) each gets a band of them, by register (drums at the
   left, then low to high), so two parts are two hands (S D F, J K L), three get two lanes each, and more overlap a
   little. the bands follow who is playing: the song is cut into stretches by the parts that play in them (a part
   silent for `IDLE` or longer is out until it comes back; a stretch shorter than `STRETCH` joins a neighbour, its parts
   with it), and only those share the lanes there, so parts that take turns each get the whole six while the other
   rests. then by who is heard: a part that keeps playing but loses most of its notes to the others (the melody wins
   where they meet) gives up lanes, two to the other's four, or all of them under `WEAK` of the notes (its own few
   then fall between the other's, on the lanes it had). a part is charted inside its band as it would be on its own; then the parts are merged, the melody first,
   and a note that would land on a taken lane, a step after another note (too close to play), or a fourth key at once
   is left to the band, which plays it on time. */
export const LANES = 6;
export const LANE_KEYS = ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'];

export interface ChartNote {
  /** the song's part it comes from */
  part: number;
  /** song seconds: when it is struck, and when its longest note ends */
  t: number; end: number;
  /** how long play mode asks for it to be held: to its end, or until a little before the next note to play */
  hold: number;
  /** whether it is a hold at all (a tap if not): its hold is long enough, or the part marks it (`held`) */
  long: boolean;
  /** written long enough to hold, in a stretch the part marks for holds (see the top) */
  held: boolean;
  lane: number;
  /** the part's note indices this chart note stands for, and what they sound */
  notes: number[]; pitches: number[]; vels: number[]; durs: number[];
  /** notes left off the chart that sound with this one: how long after it (seconds), and what */
  after: { i: number; dt: number; pitch: number; vel: number; dur: number }[];
}

const NEAR = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
const TOGETHER = .03, MIN_GAP = .1, LANE_GAP = .14, LOOK = 3, HOLD_GAP = .15;
/** a hold at least this long (seconds); one the part marks, at least `HELD` */
export const HOLD = .42;
const HELD = .25;
const longOf = (c: ChartNote) => c.hold - c.t >= (c.held ? HELD : HOLD);

/** a part's lanes: `w` of them from lane `a` */
export interface Band { a: number; w: number }
/** a drum's column (kick, snare, toms, hats, cymbals, hand percussion) in a band of three lanes, or of two */
const DRUMS3 = [0, 1, 1, 2, 2, 1], DRUMS2 = [0, 1, 0, 1, 1, 1];

export function buildChart(p: Part, band: Band = { a: 0, w: LANES }, simplify = true): { notes: ChartNote[]; skip: Set<number> } {
  const { a: A, w: Wd } = band;
  const drumLane = (n: number) => { const c = drumColumn(n); return A + (Wd >= LANES ? c : Wd >= 3 ? DRUMS3[c] : DRUMS2[c]); };
  const groups: number[][] = [];
  for (let i = 0; i < p.n; i++) {
    const g = groups[groups.length - 1];
    if (g && p.start[i] - p.start[g[0]] <= TOGETHER) g.push(i); else groups.push([i]);
  }
  const out: ChartNote[] = [];
  const make = (idx: number[], lane: number): ChartNote => ({
    part: p.index, t: p.start[idx[0]], end: Math.max(...idx.map(i => p.start[i] + p.dur[i])), hold: 0, long: false, held: false, lane,
    notes: idx, pitches: idx.map(i => p.pitch[i]), vels: idx.map(i => p.vel[i]), durs: idx.map(i => p.dur[i]), after: []
  });
  const laneFree = new Float64Array(LANES).fill(-1e9);
  let lastT = -1e9;
  if (p.drums) {
    for (const g of groups) {
      const t = p.start[g[0]];
      if (t - lastT < MIN_GAP) continue;
      // at most two drums at once, the kick and the snare first
      const byLane = new Map<number, number[]>();
      for (const i of g) { const c = drumLane(p.pitch[i]); if (!byLane.has(c)) byLane.set(c, []); byLane.get(c)!.push(i); }
      const lanes = [...byLane.keys()].sort((a, b) => a - b).filter(c => t - laneFree[c] >= LANE_GAP).slice(0, 2);
      for (const c of lanes) { out.push(make(byLane.get(c)!, c)); laneFree[c] = t; }
      if (lanes.length) lastT = t;
    }
  } else {
    const tops = groups.map(g => Math.max(...g.map(i => p.pitch[i]))), times = groups.map(g => p.start[g[0]]);
    let prevTop = -1, prevLane = -1, prevT = -1e9, a = 0, b = 0;
    for (let k = 0; k < groups.length; k++) {
      const g = groups[k], t = times[k], top = tops[k];
      if (simplify && t - lastT < MIN_GAP) continue;
      // the tune's range around this moment
      while (times[a] < t - LOOK) a++;
      while (b < groups.length && times[b] <= t + LOOK) b++;
      const near = tops.slice(a, b).sort((x, y) => x - y);
      let lo = near[Math.floor(near.length * .1)], hi = near[Math.min(near.length - 1, Math.floor(near.length * .9))];
      if (hi - lo < 7) { const c = (hi + lo) / 2; lo = c - 3.5; hi = c + 3.5; }
      const laneOf = (pitch: number) => A + Math.max(0, Math.min(Wd - 1, Math.round((pitch - lo) / (hi - lo) * (Wd - 1))));
      let lane = laneOf(top);
      // the shape of the line: up moves right, down moves left, the same note stays put
      if (t - prevT < 1.5 && prevLane >= 0) {
        if (top > prevTop && lane <= prevLane) lane = Math.min(A + Wd - 1, prevLane + 1);
        else if (top < prevTop && lane >= prevLane) lane = Math.max(A, prevLane - 1);
        else if (top === prevTop) lane = prevLane;
      }
      if (t - laneFree[lane] < LANE_GAP) {
        if (simplify) continue;
        const dir = top >= prevTop ? 1 : -1;
        const alt = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5].map(d => lane + d * dir).find(l => l >= A && l < A + Wd && t - laneFree[l] >= LANE_GAP);
        if (alt === undefined) continue;
        lane = alt;
      }
      const pitches = g.map(i => p.pitch[i]), bottom = Math.min(...pitches);
      // a wide chord in an accompaniment: its low notes get a lane of their own (in a band wide enough for it)
      if (g.length > 1 && top - bottom >= 12 && p.data.role !== 'melody' && Wd >= 4) {
        const mid = (top + bottom) / 2, upper = g.filter(i => p.pitch[i] >= mid), lower = g.filter(i => p.pitch[i] < mid);
        let low = Math.min(laneOf(bottom), lane - 2), up = lane;
        if (low < A) { low = A; if (up < A + 2) up = A + 2; }
        // (only onto lanes that are free: else the chord stays one note)
        if (t - laneFree[low] >= LANE_GAP && t - laneFree[up] >= LANE_GAP) { lane = up; out.push(make(upper, lane), make(lower, low)); laneFree[low] = t; }
        else out.push(make(g, lane));
      } else out.push(make(g, lane));
      laneFree[lane] = t; lastT = t; prevTop = top; prevLane = lane; prevT = t;
    }
  }
  out.sort((x, y) => x.t - y.t || x.lane - y.lane);
  // holds stop short of the next note to play (notes struck together share their next note)
  for (let i = out.length - 1, nextT = Infinity; i >= 0; i--) {
    const c = out[i];
    c.hold = Math.max(c.t, Math.min(c.end, nextT - HOLD_GAP));
    if (i > 0 && out[i - 1].t < c.t - TOGETHER) nextT = c.t;
  }
  if (!p.drums) for (const c of out) {
    const k = p.tick[c.notes[0]];
    c.held = c.end - c.t >= HOLD && !!p.data.holds?.some(([a, b]) => k >= a && k < b);
    c.long = longOf(c);
  }
  const skip = new Set<number>();
  for (const c of out) for (const i of c.notes) skip.add(i);
  if (!p.drums) {
    // what was left off goes with the last chart note before it (never more than a lane's gap back)
    let k = -1;
    for (let i = 0; i < p.n; i++) {
      if (skip.has(i)) continue;
      while (k + 1 < out.length && out[k + 1].t <= p.start[i] + 1e-6) k++;
      if (k < 0 || p.start[i] - out[k].t > LANE_GAP + .01) continue;
      out[k].after.push({ i, dt: p.start[i] - out[k].t, pitch: p.pitch[i], vel: p.vel[i], dur: p.dur[i] });
      skip.add(i);
    }
  }
  return { notes: out, skip };
}

/** the bands for several parts: by register, drums at the left; each as wide as the lanes allow, two at least */
export function bands(parts: Part[]): Map<number, Band> {
  const out = new Map<number, Band>(), n = parts.length;
  const median = (p: Part) => { const ps = Array.from(p.pitch).sort((a, b) => a - b); return ps.length ? ps[ps.length >> 1] : 60; };
  const order = parts.map(p => ({ p, k: p.drums ? -1 : median(p) })).sort((a, b) => a.k - b.k || a.p.index - b.p.index);
  const w = n <= 1 ? LANES : Math.max(2, Math.floor(LANES / n));
  order.forEach(({ p }, i) => out.set(p.index, { a: n <= 1 ? 0 : Math.round(i * (LANES - w) / (n - 1)), w }));
  return out;
}

/** which part's notes win where they meet: the melody, then the bass, the other parts, the drums */
const rank = (p: Part) => p.data.role === 'melody' ? 0 : p.drums ? 3 : p.data.role === 'bass' ? 1 : 2;

/** a part silent this long (seconds) is out of the bands until it plays again; a stretch with the same parts in it at
    least this long, or it joins a neighbour */
const IDLE = 2.5, STRETCH = 3;

/** the song cut into stretches by the parts that play in each (by index): from `t` to the next stretch */
export function stretches(parts: Part[]): { t: number; on: number[] }[] {
  // each part's spans of playing: its notes, until a silence of IDLE
  const edges: { t: number; part: number; d: number }[] = [];
  for (const p of parts) {
    let a = -1, b = -1;
    for (let i = 0; i < p.n; i++) {
      const s = p.start[i], e = s + Math.min(p.dur[i], IDLE);
      if (a < 0) { a = s; b = e; continue; }
      if (s - b >= IDLE) { edges.push({ t: a, part: p.index, d: 1 }, { t: b, part: p.index, d: -1 }); a = s; b = e; }
      else b = Math.max(b, e);
    }
    if (a >= 0) edges.push({ t: a, part: p.index, d: 1 }, { t: b, part: p.index, d: -1 });
  }
  edges.sort((x, y) => x.t - y.t || x.d - y.d);
  const segs: { t: number; on: Set<number> }[] = [], count = new Map<number, number>();
  for (let k = 0; k < edges.length;) {
    const t = edges[k].t;
    for (; k < edges.length && edges[k].t === t; k++) count.set(edges[k].part, (count.get(edges[k].part) ?? 0) + edges[k].d);
    const on = new Set([...count].filter(([, c]) => c > 0).map(([i]) => i));
    // (a silence where nobody plays goes to the stretch before it)
    if (on.size) segs.push({ t, on });
  }
  const len = (k: number) => k + 1 < segs.length ? segs[k + 1].t - segs[k].t : Infinity;
  const same = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every(i => b.has(i));
  const joinNext = (k: number) => { for (const i of segs[k + 1].on) segs[k].on.add(i); segs.splice(k + 1, 1); };
  // neighbours with the same parts are one stretch; then the shortest too short stretch joins the neighbour it shares
  // most with, until none is short (the first may start late: the song before it has nothing to play)
  for (;;) {
    for (let k = segs.length - 2; k >= 0; k--) if (same(segs[k].on, segs[k + 1].on)) segs.splice(k + 1, 1);
    let m = -1;
    for (let k = 0; k < segs.length; k++) if (len(k) < STRETCH && segs.length > 1 && (m < 0 || len(k) < len(m))) m = k;
    if (m < 0) break;
    const shared = (j: number) => j < 0 || j >= segs.length ? -1 : [...segs[m].on].filter(i => segs[j].on.has(i)).length - segs[j].on.size * .01;
    if (shared(m - 1) >= shared(m + 1)) joinNext(m - 1); else { joinNext(m); }
  }
  return segs.map(s => ({ t: s.t, on: [...s.on].sort((a, b) => a - b) }));
}

/** one chart for several parts (see above); `most` keys pressed at once at most; `simplify` as for one part (a part's
    own notes are then never too close to each other, only to another part's); `split`: a band of lanes each */
export function buildCharts(parts: Part[], most = 3, simplify = true, split = false): { notes: ChartNote[]; skip: Map<number, Set<number>> } {
  if (parts.length === 1) { const c = buildChart(parts[0], undefined, simplify); return { notes: c.notes, skip: new Map([[parts[0].index, c.skip]]) }; }
  if (!split) return assemble(parts, [{ t: 0, bands: new Map(parts.map(p => [p.index, { a: 0, w: LANES }])) }], most, simplify, true);
  return assemble(parts, lanePlan(parts, most, simplify), most, simplify);
}

/** several parts' bands from each time on: charted once with the bands of who plays, then those of who is heard */
export function lanePlan(parts: Part[], most = 3, simplify = true): { t: number; bands: Map<number, Band> }[] {
  const segs = stretches(parts), byIndex = new Map(parts.map(p => [p.index, p]));
  const first = assemble(parts, segs.map(sg => ({ t: sg.t, bands: bands(sg.on.map(i => byIndex.get(i)!)) })), most, simplify);
  return byShare(parts, segs, first.notes);
}

/** under this share of a stretch's chart notes a part is out of the bands (its notes keep the lanes it had among
    everyone, and the others play over them); under `MINOR`, of two parts, it gets two lanes to the other's four */
const WEAK = .15, MINOR = .4, WINDOW = 4;

/** the bands by who is heard: each stretch cut into windows of about `WINDOW` seconds, the parts' shares of a first
    chart's notes in each; a change of bands lasts two windows at least (else the window keeps the bands before it) */
function byShare(parts: Part[], segs: { t: number; on: number[] }[], notes: ChartNote[]): { t: number; bands: Map<number, Band> }[] {
  const byIndex = new Map(parts.map(p => [p.index, p])), last = notes.length ? notes[notes.length - 1].t + 1 : 0;
  const wins: { t: number; bands: Map<number, Band>; key: string }[] = [];
  segs.forEach((sg, k) => {
    const end = Math.max(sg.t, k + 1 < segs.length ? segs[k + 1].t : last), n = Math.max(1, Math.round((end - sg.t) / WINDOW));
    const all = bands(sg.on.map(i => byIndex.get(i)!));
    for (let j = 0; j < n; j++) {
      const a = sg.t + (end - sg.t) * j / n, b = sg.t + (end - sg.t) * (j + 1) / n;
      const count = new Map<number, number>(sg.on.map(i => [i, 0]));
      for (const c of notes) if (c.t >= a && c.t < b && count.has(c.part)) count.set(c.part, count.get(c.part)! + 1);
      const total = [...count.values()].reduce((x, y) => x + y, 0);
      let strong = sg.on.filter(i => total < 6 || count.get(i)! / total >= WEAK);
      if (!strong.length) strong = sg.on;
      const bd = new Map(all);
      if (strong.length < sg.on.length || strong.length === 2) {
        const own = bands(strong.map(i => byIndex.get(i)!));
        if (strong.length === 2) {
          // two heard parts: the one with less of the chart gets two lanes, the other four
          const [lo, hi] = [...own].sort((x, y) => x[1].a - y[1].a).map(([i]) => i), share = count.get(lo)! / Math.max(1, count.get(lo)! + count.get(hi)!);
          const w = total < 6 ? 3 : share < MINOR ? 2 : share > 1 - MINOR ? 4 : 3;
          own.set(lo, { a: 0, w }); own.set(hi, { a: w, w: LANES - w });
        }
        for (const [i, b2] of own) bd.set(i, b2);
      }
      wins.push({ t: j ? a : sg.t, bands: bd, key: [...bd].sort((x, y) => x[0] - y[0]).map(([i, b2]) => `${i}:${b2.a}:${b2.w}`).join(' ') });
    }
  });
  // (a window whose bands differ from both neighbours' keeps the ones before it, within a stretch of the same parts)
  for (let k = 1; k + 1 < wins.length; k++) if (wins[k].key !== wins[k - 1].key && wins[k].key !== wins[k + 1].key && wins[k].bands.size === wins[k - 1].bands.size) { wins[k].bands = wins[k - 1].bands; wins[k].key = wins[k - 1].key; }
  return wins.filter((w, k) => !k || w.key !== wins[k - 1].key);
}

/** the parts charted in the bands they have from each time on (`plan`), and merged (see above); `shared`: a note whose
    lane is taken tries the others, nearest first */
function assemble(parts: Part[], plan: { t: number; bands: Map<number, Band> }[], most: number, simplify: boolean, shared = false): { notes: ChartNote[]; skip: Map<number, Set<number>> } {
  // each part charted in the band it has in each stretch (a part charted once per band it gets), its notes taken
  // from the chart of the stretch they fall in; a note that already sounds with one before it is not taken again
  const byIndex = new Map(parts.map(p => [p.index, p]));
  const cache = new Map<string, ChartNote[]>(), mine = new Map<number, ChartNote[]>(parts.map(p => [p.index, []]));
  const claimed = new Map<number, Set<number>>(parts.map(p => [p.index, new Set<number>()]));
  plan.forEach((sg, k) => {
    const end = k + 1 < plan.length ? plan[k + 1].t : Infinity, from = k ? sg.t : -Infinity;
    for (const [i, b] of sg.bands) {
      const key = `${i}:${b.a}:${b.w}`;
      if (!cache.has(key)) cache.set(key, buildChart(byIndex.get(i)!, b, simplify).notes);
      const got = claimed.get(i)!, list = mine.get(i)!;
      for (const c of cache.get(key)!) {
        if (c.t < from - 1e-6 || c.t >= end - 1e-6 || c.notes.some(n => got.has(n))) continue;
        const d: ChartNote = { ...c, after: c.after.filter(x => !got.has(x.i)) };
        for (const n of d.notes) got.add(n);
        for (const x of d.after) got.add(x.i);
        list.push(d);
      }
    }
  });
  // where a part's band changes, its holds still stop short of its next note to play
  for (const list of mine.values()) {
    list.sort((x, y) => x.t - y.t || x.lane - y.lane);
    for (let i = list.length - 1, nextT = Infinity; i >= 0; i--) {
      const c = list[i];
      if (nextT < Infinity) { c.hold = Math.max(c.t, Math.min(c.hold, nextT - HOLD_GAP)); c.long = c.long && longOf(c); }
      if (i > 0 && list[i - 1].t < c.t - TOGETHER) nextT = c.t;
    }
  }
  const charts = parts.map(p => ({ p, notes: mine.get(p.index)! })).sort((a, b) => rank(a.p) - rank(b.p) || a.p.index - b.p.index);
  // what is taken so far: every start time, and each lane's notes, in time order
  const times: number[] = [], owner: number[] = [], lanes: ChartNote[][] = Array.from({ length: LANES }, () => []);
  const out: ChartNote[] = [];
  for (const { notes } of charts) for (const c of notes) {
    // a step after (or before) another note, or a fourth key at once
    const i = lowerBound(times, c.t - MIN_GAP), j = lowerBound(times, c.t + MIN_GAP);
    let together = 0, close = false;
    for (let q = i; q < j; q++) { if (Math.abs(times[q] - c.t) <= TOGETHER) together++; else if (simplify || owner[q] !== c.part) close = true; }
    if (close || together >= most) continue;
    // its lane is free: no note there within a lane's gap, and not under a held note there (shared lanes: or the nearest
    // free lane, nearer the middle first)
    const tries = shared ? NEAR.map(d => c.lane + (c.lane < LANES / 2 ? d : -d)).filter(l => l >= 0 && l < LANES) : [c.lane];
    let free = -1, at = 0, ln: ChartNote[] = [];
    for (const l of tries) {
      ln = lanes[l]; at = lowerBound(ln.map(x => x.t), c.t);
      const prev = ln[at - 1], nx = ln[at];
      if (prev && (c.t - prev.t < LANE_GAP || c.t < prev.hold + HOLD_GAP)) continue;
      if (nx && nx.t - c.t < LANE_GAP) continue;
      free = l; break;
    }
    if (free < 0) continue;
    c.lane = free;
    const nx = ln[at];
    // (a hold ends short of the next note on its lane)
    if (nx) { c.hold = Math.max(c.t, Math.min(c.hold, nx.t - HOLD_GAP)); c.long = c.long && longOf(c); }
    const at2 = lowerBound(times, c.t);
    times.splice(at2, 0, c.t); owner.splice(at2, 0, c.part);
    ln.splice(at, 0, c);
    out.push(c);
  }
  out.sort((x, y) => x.t - y.t || x.lane - y.lane);
  const skip = new Map<number, Set<number>>(parts.map(p => [p.index, new Set<number>()]));
  for (const c of out) { const s = skip.get(c.part)!; for (const i of c.notes) s.add(i); for (const a of c.after) s.add(a.i); }
  return { notes: out, skip };
}
