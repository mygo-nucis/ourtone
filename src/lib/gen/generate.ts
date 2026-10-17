import type { PartData, Role, SongData, L10n } from '../music/types';
import { MODES } from '../music/theory';
import { newPart } from '../music/parts';
import { STYLES, type StyleId, type Section, type Style, type Groove, type PartKind } from './styles';
import { prepareSong } from '../music/song';
import { defaultMix } from '../audio/strip';
import { parseProg, parseChord, voice, bassNote, tonesOf, type Chord } from './harmony';
import { songTitle } from './names';

/* the song generator. a seed and a style give a whole song, the same song every time:
   a key and tempo, three chord progressions, a form whose sections rise and fall in energy, and parts written for it —
   a melody grown from a two-bar motif (repeated, sequenced, varied and answered; hooks sit higher and repeat more),
   chords voiced to move as little as they can, a bass and drums in the style's own patterns, fills and builds at the
   seams. nothing is random at playback: the result is an ordinary song, to play, edit or export. */
export interface GenOptions { style: StyleId; seed: number; length: 'short' | 'full'; tonic?: number; bpm?: number }
export interface GenInfo { style: StyleId; seed: number; length: 'short' | 'full' }

const PPQ = 480, BAR = PPQ * 4, STEP = PPQ / 4;
type Rand = () => number;
/** a small fast generator with good low bits (mulberry32) */
export function rand(seed: number): Rand {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = <T>(r: Rand, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
function weighted<T>(r: Rand, xs: readonly (readonly [T, number])[]): T {
  let s = 0; for (const x of xs) s += x[1];
  let k = r() * s;
  for (const x of xs) { k -= x[1]; if (k <= 0) return x[0]; }
  return xs[xs.length - 1][0];
}
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** a note: tick, length, pitch, velocity */
type N = { t: number; d: number; p: number; v: number };

/* ---------- rhythm cells: one bar of sixteenths. x starts a note, - holds it, . rests ---------- */
const cell = (s: string): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i < s.length; i++) if (s[i] === 'x') { let l = 1; while (i + l < s.length && s[i + l] === '-') l++; out.push([i, l]); }
  return out;
};
const SPARSE = ['x-------x---x---', 'x-----x-x-------', '..x-x---x-------', 'x---x---x-------', 'x--x--x---------', '....x---x---x---', 'x-------x-x-----'];
const MEDIUM = ['x--x--x-x---x-x-', 'x-x-x---x--x----', '..x-x-x-x---x---', 'x---x-x-x--x--x-', 'x--x--x---x-x---', 'x-x---x-x-x-x---', '..x-x---x-x-x---'];
const DENSE = ['x-x-x-x-x-x-x-x-', 'x-xxx-x-x-x-xx--', 'x-x-x-xxx-x-x---', 'xx-x-x-x-x-xx-x-'];
const HOOK = ['x--x--x-x-x-----', 'x-x-x--x--x-x---', '..x-x-x--x--x---', 'x--x--x--x--x---', 'x-x--x--x-x-----', 'x-x-x-x-x--x----', 'x-xx-x-x-xx-x---', '..x-xx-x-x-xx---', 'x--x-xx-x-x-----'];
const ENDS = ['x---x---x-------', 'x-x-x-----------', 'x--x--x---------', 'x---------------', '..x-x-x---------'];

/** a two-bar melodic idea: its rhythm, and its shape in scale steps from the first note.
    the line keeps moving: a repeated note is rare (a hook may repeat one for its rhythm, never three times running),
    skips of a third or a fourth give it shape, and a leap is followed by a step back the other way */
interface Motif { rhythm: [number, number][]; steps: number[] }
function makeMotif(r: Rand, density: number, hook: boolean): Motif {
  const lib = hook ? HOOK : density < .45 ? SPARSE : density < .62 ? MEDIUM : DENSE;
  const a = pick(r, lib), b = pick(r, r() < .55 ? SPARSE : lib);
  const rhythm = [...cell(a), ...cell(b).map(([s, l]) => [s + 16, l] as [number, number])];
  const W: [number, number][] = hook
    ? [[0, .1], [1, .27], [-1, .26], [2, .12], [-2, .11], [3, .05], [-3, .05], [4, .02], [-4, .02]]
    : [[0, .08], [1, .32], [-1, .32], [2, .1], [-2, .1], [3, .04], [-3, .03], [4, .01], [-4, .01]];
  const steps = [0];
  let cur = 0, last = 0, still = 0;
  for (let i = 1; i < rhythm.length; i++) {
    let st = Math.abs(last) >= 3 || (Math.abs(last) === 2 && r() < .55) ? -Math.sign(last) : weighted(r, W);
    // an arc: up through the first bar, down through the second
    const firstHalf = rhythm[i][0] < 16;
    if (firstHalf && st < 0 && r() < .3) st = -st;
    if (!firstHalf && st > 0 && r() < .3) st = -st;
    if (st === 0 && (still >= 1 || !hook && rhythm[i][1] >= 4)) st = r() < .5 ? 1 : -1;
    const next = clamp(cur + st, -5, 7);
    // at the edge of the range the line turns back instead of standing still
    cur = next === cur && st !== 0 ? cur - Math.sign(st) : next;
    still = cur === steps[steps.length - 1] ? still + 1 : 0;
    steps.push(cur);
    last = st;
  }
  return { rhythm, steps };
}

/* ---------- drums: one bar of sixteenths per sound, by groove and tier (0 quiet ... 3 peak) ---------- */
type Kit = Partial<Record<'K' | 'S' | 'C' | 'H' | 'O' | 'R' | 'G', string>>;
/* each groove climbs through four tiers. from the second tier up the snare has ghost notes and the kick syncopates;
   the top tier drives with sixteenth hats and a clap on the backbeat. no toms anywhere: fills are snare, clap and hats */
const GROOVES: Record<Groove, Kit[]> = {
  funk: [
    { H: 'x.x.x.x.x.x.x.x.', R: '....x.......x...' },
    { K: 'x.....x...x.....', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', G: '.......x.......x' },
    { K: 'x.....x.x.x.....', S: '....x.......x...', H: 'x.xxx.x.x.xxx.x.', O: '..............x.', G: '.......x..x....x' },
    { K: 'x.....x.x.x...x.', S: '....x.......x...', C: '....x.......x...', H: 'xxxxxxxxxxxxxxxx', O: '......x.......x.', G: '...x...x.......x' }
  ],
  dusty: [
    { K: 'x.........x.....', H: 'x.x.x.x.x.x.x.x.' },
    { K: 'x......x..x.....', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', G: '..........x....x' },
    { K: 'x......x..x..x..', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', R: '..x.......x.....', G: '.......x.......x' },
    { K: 'x......x.xx..x..', S: '....x.......x...', H: 'x.x.x.xxx.x.x.x.', O: '..............x.', R: '..x.......x.....', G: '.......x..x....x' }
  ],
  halftime: [
    { H: '..x...x...x...x.' },
    { K: 'x.........x.....', S: '........x.......', H: 'x.x.x.x.x.x.x.x.' },
    { K: 'x......x..x.....', S: '........x.......', C: '........x.......', H: 'x.x.x.x.x.xxx.x.', O: '..............x.' },
    { K: 'x......x..x...x.', S: '........x.......', C: '........x.......', H: 'x.xxx.x.x.xxxxxx', O: '......x.......x.', G: '.............x..' }
  ],
  four: [
    { K: 'x.......x.......', H: '..x...x...x...x.' },
    { K: 'x...x...x...x...', S: '....x.......x...', H: '..x...x...x...x.', G: '..............x.' },
    { K: 'x...x...x...x...', S: '....x.......x...', C: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', O: '..x...x...x...x.' },
    { K: 'x...x...x...x..x', S: '....x.......x...', C: '....x.......x...', H: 'xxxxxxxxxxxxxxxx', O: '..x...x...x...x.', G: '.......x......x.' }
  ],
  drive: [
    { K: 'x.......x.......', H: '..x...x...x...x.' },
    { K: 'x...x...x...x...', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.' },
    { K: 'x...x...x...x.x.', S: '....x.......x...', C: '....x.......x...', H: 'xxxxxxxxxxxxxxxx', G: '.......x........' },
    { K: 'x...x...x.x.x.x.', S: '....x.......x...', C: '....x.......x...', H: 'xxxxxxxxxxxxxxxx', O: '..............x.', G: '...x...x.......x' }
  ]
};
const STYLE_INDEX: Record<StyleId, number> = { citypop: 0, lofi: 1, futurebass: 2, synthwave: 3, darkwave: 4 };
const DRUM_NOTE = { K: 36, S: 38, C: 39, H: 42, O: 46, R: 37, G: 38 } as const;
const DRUM_VEL = { K: 112, S: 108, C: 96, H: 70, O: 80, R: 70, G: 44 } as const;

export function generate(o: GenOptions, id: string): SongData {
  const st: Style = STYLES[o.style];
  const r = rand(o.seed);
  /** each part draws from its own stream, so a change in one part never reshuffles another */
  const sub = (k: number) => rand((o.seed ^ Math.imul(k + 1, 0x9E3779B1)) >>> 0);
  const bpm = o.bpm ?? Math.round(st.bpm[0] + r() * (st.bpm[1] - st.bpm[0]));
  const tonic = o.tonic ?? pick(r, st.tonics);
  const mode = st.mode, scale = MODES[mode];
  const progA = pick(r, st.progs.a), progB = pick(r, st.progs.b.filter(p => p !== progA).length ? st.progs.b.filter(p => p !== progA) : st.progs.b), progC = pick(r, st.progs.c);
  const progs = { a: parseProg(progA), b: parseProg(progB), c: parseProg(progC) };
  const home = parseChord(mode === 'major' ? 'I' : 'i');
  const form = st.form[o.length];

  /* the bars: which section, which chord */
  interface BarInfo { sec: Section; si: number; i: number; chord: Chord; first: boolean; last: boolean; next: Section | null }
  const bars: BarInfo[] = [];
  form.forEach((sec, si) => {
    for (let i = 0; i < sec.bars; i++) {
      let chord = progs[sec.prog][i % 4];
      if (sec.kind === 'outro' && i === sec.bars - 1) chord = home;
      bars.push({ sec, si, i, chord, first: i === 0, last: i === sec.bars - 1, next: form[si + 1] ?? null });
    }
  });
  const total = bars.length;
  const chordAt = (t: number) => bars[clamp(Math.floor(t / BAR), 0, total - 1)].chord;

  /* ---------- the melody ---------- */
  const lead: N[] = [];
  {
    const rl = sub(1), L = st.lead;
    let base = tonic + 12 * Math.ceil((L.lo - tonic) / 12);
    if (base > L.lo + 7) base -= 12;
    const sp = (s: number, c: Chord) => {
      const oct = Math.floor(s / 7), deg = ((s % 7) + 7) % 7;
      let p = base + 12 * oct + scale[deg];
      // over a major V in a minor key the seventh is raised (harmonic minor)
      if (mode !== 'major' && c.root === 7 && (c.q === 'maj' || c.q === 'dom7') && ((p - tonic) % 12 + 12) % 12 === 10) p += 1;
      return p;
    };
    const isTone = (s: number, c: Chord) => tonesOf(c, tonic).includes(((sp(s, c)) % 12 + 12) % 12);
    /** the chord tone nearest a step, looking the way the line moves first, and not the note it just left */
    const nearestTone = (s: number, c: Chord, dir: number, avoid: number | null) => {
      for (const d of [0, dir || 1, -(dir || 1), 2 * (dir || 1), -2 * (dir || 1), 3, -3]) if (isTone(s + d, c) && s + d !== avoid) return s + d;
      return s;
    };
    const clashes = (s: number, c: Chord) => {
      const pc = ((sp(s, c) % 12) + 12) % 12, tones = tonesOf(c, tonic);
      return !tones.includes(pc) && tones.some(t => ((pc - t + 12) % 12 === 1) || ((t - pc + 12) % 12 === 1 && pc !== (t + 11) % 12));
    };
    const verse = makeMotif(rl, L.density, false), hook = makeMotif(rl, Math.min(.8, L.density + .1), true), bridge = makeMotif(rl, Math.max(.35, L.density - .15), false);
    const start = pick(rl, [0, 2, 4]);
    let lastP: number | null = null;
    /** hook phrases that get a pickup: an eighth before their first note */
    const pickups: number[] = [];
    type Kind = 'same' | 'seq' | 'end' | 'vary';
    /** a two-bar unit of a motif at a bar, from scale step s0 */
    const unit = (m: Motif, bar: number, s0: number, kind: Kind, energy: number, hookUnit = false) => {
      const notes: { t: number; d: number; s: number; strong: boolean }[] = [];
      let rh = m.rhythm, steps = m.steps;
      if (kind === 'end') {
        // the answer: the first bar as it was, then a cadence that steps down (or up) to land and hold
        const e = cell(pick(rl, ENDS)).map(([s, l]) => [s + 16, l] as [number, number]);
        const keep = rh.filter(([s]) => s < 16);
        const from = steps[Math.max(0, keep.length - 1)] ?? 0, dir = rl() < .65 ? -1 : 1;
        rh = [...keep, ...e];
        steps = [...steps.slice(0, keep.length), ...e.map((_, k) => from + dir * (k + 1))];
      }
      if (kind === 'vary') {
        // the same idea played a little differently: a few notes moved by a step, a long note or two split in two
        const r2: [number, number][] = [], s2: number[] = [];
        rh.forEach(([s16, l16], k) => {
          const st = k > 0 && rl() < .3 ? steps[k] + (rl() < .5 ? 1 : -1) : steps[k];
          if (l16 >= 4 && rl() < .4) { const h = l16 >> 1; r2.push([s16, h], [s16 + h, l16 - h]); s2.push(st, st + (rl() < .5 ? 1 : -1)); }
          else { r2.push([s16, l16]); s2.push(st); }
        });
        rh = r2; steps = s2;
      }
      const shift = kind === 'seq' ? (rl() < .6 ? 1 : -1) : 0;
      rh.forEach(([s16, l16], k) => {
        const t = bar * BAR + s16 * STEP;
        notes.push({ t, d: l16 * STEP, s: s0 + shift + steps[Math.min(k, steps.length - 1)], strong: s16 % 8 === 0 || l16 >= 4 });
      });
      // a hook pushes: now and then the note on the middle of a bar comes an eighth early
      if (hookUnit) for (let k = 1; k < notes.length; k++) {
        const n = notes[k], at = (n.t - bar * BAR) / STEP, before = notes[k - 1];
        if ((at === 8 || at === 24) && before.t < n.t - 3 * STEP && rl() < .35) {
          n.t -= 2 * STEP; n.d += 2 * STEP;
          before.d = Math.min(before.d, n.t - before.t);
        }
      }
      // fit to the chords: strong notes onto the chord tone nearest the line that keeps it moving; longer weak notes
      // away from semitone rubs
      let prev = notes.length ? notes[0].s : s0;
      for (const [k, n] of notes.entries()) {
        const c = chordAt(n.t), want = n.s - prev, dir = Math.sign(want);
        if (n.strong) {
          let best = n.s, bd = Infinity;
          for (let q = n.s - 3; q <= n.s + 3; q++) {
            if (!isTone(q, c)) continue;
            let sc = Math.abs(q - n.s) + (k ? .35 * Math.abs(q - prev) : 0);
            // a line on the move neither stops dead on the note it left nor turns back where it meant to go on
            if (k && want !== 0 && q === prev) sc += .7;
            if (k && want !== 0 && q !== prev && Math.sign(q - prev) !== dir) sc += .6;
            if (sc < bd) { bd = sc; best = q; }
          }
          n.s = best;
        } else if (n.d >= 2 * STEP && clashes(n.s, c)) n.s = nearestTone(n.s, c, dir, k ? prev : null);
        // a weak note never jumps far from its neighbour
        if (!n.strong && k && Math.abs(n.s - prev) > 3) n.s = prev + Math.sign(n.s - prev) * 2;
        prev = n.s;
      }
      if (kind === 'end' && notes.length) {
        // the last note: a long, stable one to the end of the unit
        const lastN = notes[notes.length - 1], c = chordAt(lastN.t), before = notes.length > 1 ? notes[notes.length - 2].s : null;
        lastN.d = (bar + 2) * BAR - lastN.t - STEP;
        let best = lastN.s, bd = 99;
        for (let s = lastN.s - 3; s <= lastN.s + 3; s++) {
          const pc = ((sp(s, c) - tonic) % 12 + 12) % 12, tone = isTone(s, c);
          const score = Math.abs(s - lastN.s) + (pc === 0 ? -1.5 : 0) + (tone ? 0 : 5) + (s === before ? 1.2 : 0);
          if (score < bd) { bd = score; best = s; }
        }
        lastN.s = best;
      }
      // the octave for the whole unit: inside the range, and close to where the tune just was
      let oct = 0, best = Infinity;
      for (const o of [-14, -7, 0, 7, 14]) {
        const ps = notes.map(n => sp(n.s + o, chordAt(n.t)));
        const outside = ps.filter(p => p < L.lo || p > L.hi).length;
        const score = outside * 100 + (lastP === null || !ps.length ? Math.abs(o) : Math.abs(ps[0] - lastP)) + Math.abs(o) * .1;
        if (score < best) { best = score; oct = o; }
      }
      for (const n of notes) {
        let p = sp(n.s + oct, chordAt(n.t));
        // a note still outside folds back by an octave
        while (p > L.hi) p -= 12;
        while (p < L.lo) p += 12;
        const v = clamp(Math.round((84 + (n.strong ? 10 : 0) + (rl() * 12 - 6)) * (.72 + .28 * energy)), 30, 124);
        lead.push({ t: n.t, d: Math.max(STEP - 10, n.d - 12), p, v });
        lastP = p;
      }
      if (hookUnit && (kind === 'same' || kind === 'seq') && notes.length && notes[0].t === bar * BAR && rl() < .55) pickups.push(bar * BAR);
    };
    let b0 = 0;
    for (const [si, sec] of form.entries()) {
      const hookSec = sec.kind === 'chorus' || sec.kind === 'drop';
      const m = hookSec ? hook : sec.kind === 'bridge' ? bridge : verse;
      const s0 = start + (hookSec ? L.hook : sec.kind === 'bridge' ? 1 : 0);
      if (sec.kind === 'verse' || hookSec || sec.kind === 'bridge') {
        const units = Math.floor(sec.bars / 2), plan: Kind[] = units >= 4 ? ['same', 'seq', 'same', 'end'] : units === 2 ? ['same', 'end'] : ['end'];
        for (let u = 0; u < units; u++) unit(m, b0 + u * 2, s0, plan[u % plan.length] === 'same' && u >= 4 ? 'vary' : plan[u % plan.length], sec.energy, hookSec);
      } else if (sec.kind === 'outro' && si > 0) {
        // the outro remembers the hook
        unit(hook, b0, start + L.hook, 'end', .6);
      }
      b0 += sec.bars;
    }

    /* the line heard as a whole. a note is never played three times running, and most repeated pairs move to a
       neighbour (a chord tone on a strong beat, a scale tone between); some hook phrases start with a pickup an eighth
       before the bar, which pushes the tune forward */
    lead.sort((a, b) => a.t - b.t);
    const pcOf = (p: number) => ((p % 12) + 12) % 12;
    const inScale = (p: number) => scale.some(x => (tonic + x) % 12 === pcOf(p));
    const toneAt = (p: number, t: number) => tonesOf(chordAt(t), tonic).includes(pcOf(p));
    const rubs = (p: number, t: number) => !toneAt(p, t) && tonesOf(chordAt(t), tonic).some(c => (pcOf(p) - c + 12) % 12 === 1 || (c - pcOf(p) + 12) % 12 === 1);
    /** the nearest pitch a step or so away, the way the tune is going first: a chord tone on a strong beat, a scale tone
        between (a long one that does not rub against the chord) */
    const neighbour = (p: number, t: number, d: number, dir: number) => {
      const strong = t % (BAR / 2) === 0;
      for (const w of [dir, -dir]) for (let k = 1; k <= 5; k++) {
        const q = p + w * k;
        if (q < L.lo || q > L.hi) break;
        if (strong ? toneAt(q, t) : inScale(q) && !(d >= 2 * STEP && rubs(q, t))) return q;
      }
      return null;
    };
    let run = 1;
    for (let i = 1; i < lead.length; i++) {
      const a = lead[i - 1], b = lead[i];
      if (b.t - (a.t + a.d) >= PPQ || a.p !== b.p) { run = 1; continue; }
      run++;
      // a repeated pair can stay, more often in a hook, where it is part of the rhythm
      const inHook = ['chorus', 'drop'].includes(bars[clamp(Math.floor(b.t / BAR), 0, total - 1)].sec.kind);
      if (run < 3 && rl() < (inHook ? .65 : .45)) continue;
      // toward where the tune goes next
      let j = i + 1; while (j < lead.length && lead[j].p === b.p) j++;
      const dir = j < lead.length ? Math.sign(lead[j].p - b.p) || 1 : (rl() < .5 ? 1 : -1);
      const q = neighbour(b.p, b.t, b.d, dir);
      if (q !== null) { b.p = q; run = 1; }
    }
    for (const at of pickups) {
      const i = lead.findIndex(n => n.t === at);
      if (i < 0) continue;
      const first = lead[i], t = at - 2 * STEP, before = lead[i - 1];
      if (before && before.t >= t - STEP) continue;
      const q = neighbour(first.p, t, 2 * STEP, rl() < .65 && first.p - 2 >= L.lo ? -1 : 1);
      if (q === null || q === first.p) continue;
      if (before && before.t + before.d > t - 20) before.d = Math.max(STEP - 10, t - 20 - before.t);
      lead.splice(i, 0, { t, d: 2 * STEP - 12, p: q, v: clamp(first.v - 10, 30, 124) });
    }
  }

  /* ---------- chords ---------- */
  const comp: N[] = [];
  const compPreset = pick(sub(2), st.comp.presets);
  {
    const rc = sub(3), C = st.comp;
    let prev: number[] | null = null;
    const STAB = [[[0, 3], [3, 3], [6, 4], [10, 2], [12, 4]], [[0, 2], [3, 2], [6, 2], [8, 2], [11, 3], [14, 2]], [[0, 4], [6, 2], [8, 4], [14, 2]]];
    const CHOP = [[[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]], [[0, 2], [2, 2], [4, 2], [6, 2], [8, 3], [12, 2], [14, 2]], [[0, 3], [3, 3], [6, 3], [10, 2], [12, 2], [14, 2]]];
    let stab = pick(rc, STAB), chop = pick(rc, CHOP), lastSi = -1;
    bars.forEach((b, bi) => {
      if (b.si !== lastSi) { lastSi = b.si; stab = pick(rc, STAB); if (b.sec.kind === 'drop') chop = pick(rc, CHOP); }
      const v0 = voice(b.chord, tonic, C.lo, C.hi, prev, C.size);
      prev = v0;
      const nextChord = bars[bi + 1]?.chord, nextV = nextChord ? voice(nextChord, tonic, C.lo, C.hi, v0, C.size) : v0;
      const E = b.sec.energy, t0 = bi * BAR;
      let hits: number[][];
      switch (C.kind) {
        case 'stab': hits = E < .5 ? [[0, 16]] : stab; break;
        case 'lazy': hits = E > .6 && rc() < .5 ? [[0, 8], [8, 8]] : [[0, 16]]; break;
        case 'chop':
          hits = b.sec.kind === 'drop' ? chop : b.sec.kind === 'build' ? (b.i >= b.sec.bars / 2 ? [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1]] : [[0, 2], [2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2]]) : [[0, 16]];
          break;
        case 'pad': hits = [[0, 16]]; break;
        // at full energy the saws push on the off-beats, the organ keeps the beat
        default: hits = E >= .9 ? (compPreset === 'organ' ? [[0, 4], [4, 4], [8, 4], [12, 4]] : [[0, 1], [2, 2], [6, 2], [10, 2], [14, 2]]) : [[0, 8], [8, 8]];
      }
      if (b.sec.kind === 'build' && b.last) hits = hits.filter(([s]) => s < 14).map(([s, l]) => [s, Math.min(l, 14 - s)]);
      for (const [s16, l16] of hits) {
        // a hit on the last sixteenth pair can push the next chord in early
        const push = s16 >= 14 && nextChord && nextChord.name !== b.chord.name && rc() < .5;
        const vo = push ? nextV : v0;
        const len = C.kind === 'pad' ? BAR - 20 : l16 * STEP - (l16 >= 8 ? 30 : 12);
        const baseV = C.kind === 'lazy' ? 64 : C.kind === 'pad' ? 70 : C.kind === 'chop' && b.sec.kind === 'build' ? 50 + 50 * (b.i / b.sec.bars) : 78;
        const v = clamp(Math.round((baseV + (s16 % 8 === 0 ? 8 : 0) + rc() * 8 - 4) * (.7 + .3 * E)), 28, 120);
        vo.forEach((p, k) => {
          const strum = C.kind === 'lazy' ? k * 14 + Math.round(rc() * 8) : 0;
          comp.push({ t: t0 + s16 * STEP + strum, d: Math.max(40, len - strum), p, v: clamp(v - k * 2, 20, 127) });
        });
      }
    });
  }

  /* ---------- bass ---------- */
  const bass: N[] = [];
  {
    const rb = sub(4), B = st.bass;
    let prevR = Math.round((B.lo + B.hi) / 2) - 4, lastSi = -1;
    // R root, O octave, F fifth, A a note leading into the next chord, X a ghost (a muted note, felt more than heard)
    type P = [number, number, 'R' | 'O' | 'F' | 'A' | 'X'][];
    const FUNK: P[] = [
      [[0, 2, 'R'], [3, 1, 'O'], [6, 2, 'R'], [8, 2, 'R'], [10, 1, 'O'], [11, 1, 'R'], [14, 2, 'F']],
      [[0, 3, 'R'], [3, 1, 'R'], [6, 2, 'O'], [8, 2, 'R'], [12, 2, 'F'], [14, 1, 'O'], [15, 1, 'A']],
      [[0, 2, 'R'], [2, 1, 'X'], [3, 1, 'O'], [4, 2, 'R'], [7, 1, 'R'], [8, 2, 'F'], [10, 1, 'X'], [11, 1, 'O'], [12, 2, 'R'], [14, 1, 'X'], [15, 1, 'A']]
    ];
    const WALK: P[] = [[[0, 7, 'R'], [8, 4, 'F'], [12, 3, 'A']], [[0, 6, 'R'], [6, 2, 'O'], [8, 6, 'R'], [14, 2, 'A']]];
    // a drop pumps: plain, or three plus three plus two
    const DROP: P[][] = [[[[0, 6, 'R'], [6, 4, 'R'], [10, 6, 'R']], [[0, 10, 'R'], [10, 6, 'O']]], [[[0, 3, 'R'], [3, 3, 'R'], [6, 2, 'O'], [8, 3, 'R'], [11, 3, 'R'], [14, 2, 'O']], [[0, 3, 'R'], [3, 3, 'R'], [6, 2, 'O'], [8, 3, 'R'], [11, 3, 'R'], [14, 2, 'A']]]];
    const GALLOP: P = [[0, 1, 'R'], [1, 1, 'R'], [2, 2, 'O'], [4, 1, 'R'], [5, 1, 'R'], [6, 2, 'O'], [8, 1, 'R'], [9, 1, 'R'], [10, 2, 'O'], [12, 1, 'R'], [13, 1, 'R'], [14, 2, 'A']];
    let funk = pick(rb, FUNK), walk = pick(rb, WALK), drop = pick(rb, DROP), gallop = false;
    bars.forEach((b, bi) => {
      if (b.si !== lastSi) { lastSi = b.si; funk = pick(rb, FUNK); walk = pick(rb, WALK); drop = pick(rb, DROP); gallop = b.sec.energy >= .95 && rb() < .5; }
      const E = b.sec.energy, kind = b.sec.kind, t0 = bi * BAR;
      const R = bassNote(b.chord, tonic, B.lo, B.hi, prevR);
      prevR = R;
      const nextC = bars[bi + 1]?.chord ?? b.chord, NR = bassNote(nextC, tonic, B.lo, B.hi, R);
      const F = R + 7 <= B.hi ? R + 7 : R - 5, O = R + 12 <= B.hi ? R + 12 : R, A = NR === R ? F : rb() < .6 ? NR - 1 : NR + 2;
      let pat: P;
      if (kind === 'intro' && E < .4 && B.kind !== 'octave') pat = b.i >= b.sec.bars - 2 ? [[0, 16, 'R']] : [];
      else if ((kind === 'break' || kind === 'build') && B.kind === 'sub') pat = kind === 'build' && b.last ? [[0, 2, 'R'], [4, 2, 'R'], [8, 2, 'R'], [12, 2, 'O']] : [];
      else switch (B.kind) {
        case 'funk': pat = E < .5 ? [[0, 6, 'R'], [8, 6, 'R']] : funk; break;
        case 'walk': pat = walk; break;
        case 'sub': pat = kind === 'drop' ? drop[b.i % 2] : [[0, 16, 'R']]; break;
        case 'octave': pat = E < .5 ? [[0, 4, 'R'], [4, 4, 'R'], [8, 4, 'R'], [12, 4, 'R']] : gallop ? GALLOP : [[0, 2, 'R'], [2, 2, 'R'], [4, 2, 'O'], [6, 2, 'R'], [8, 2, 'R'], [10, 2, 'R'], [12, 2, 'O'], [14, 2, 'R']]; break;
        default: pat = E >= .9 ? Array.from({ length: 16 }, (_, k) => [k, 1, 'R'] as [number, number, 'R']) : Array.from({ length: 8 }, (_, k) => [k * 2, 2, 'R'] as [number, number, 'R']);
      }
      if (kind === 'outro' && b.last) pat = [[0, 16, 'R']];
      // a driving line walks into the next chord on its last note
      if ((B.kind === 'drive' || B.kind === 'octave') && E >= .6 && NR !== R && pat.length > 4 && rb() < .5) pat = [...pat.slice(0, -1), [pat[pat.length - 1][0], pat[pat.length - 1][1], 'A']];
      // the last eighth of a build is silent: the drop lands on a breath
      const stopAt = kind === 'build' && b.last ? 14 : 16;
      for (const [s16, l16, w] of pat) {
        if (s16 >= stopAt) continue;
        const p = w === 'R' || w === 'X' ? R : w === 'O' ? O : w === 'F' ? F : A;
        const acc = B.kind === 'drive' ? (s16 % 2 === 0 ? 10 : -12) : s16 % 4 === 0 ? 8 : 0;
        const v = w === 'X' ? 40 + Math.round(rb() * 8) : clamp(Math.round((92 + acc + rb() * 8 - 4) * (.78 + .22 * E)), 30, 124);
        const len = Math.min(l16, stopAt - s16);
        bass.push({ t: t0 + s16 * STEP, d: w === 'X' ? 50 : Math.max(60, len * STEP - (len > 2 ? 24 : 18)), p, v });
      }
    });
  }

  /* ---------- drums ----------
     the groove of the section's tier, with a turnaround at the end of every four bars (an open hat, a kick pickup), a
     fill into a livelier section (a snare roll, a half-bar roll into a chorus, or a stop), and a crash on the first
     beat of every section with some energy. a build ends in a breath: the last eighth before the drop is silent. */
  const drums: N[] = [];
  {
    const rd = sub(5), G = GROOVES[st.drums.groove];
    const hit = (t: number, k: keyof typeof DRUM_NOTE, v: number) => drums.push({ t, d: STEP, p: DRUM_NOTE[k], v: clamp(Math.round(v), 1, 127) });
    bars.forEach((b, bi) => {
      const E = b.sec.energy, kind = b.sec.kind, t0 = bi * BAR;
      const tier = E < .4 ? 0 : E < .62 ? 1 : E < .9 ? 2 : 3;
      if (kind === 'build') {
        // a build: the kick steadies, the snare doubles up toward the downbeat, a riser under it all
        const frac = b.i / b.sec.bars, per = frac < .5 ? 4 : frac < .75 ? 2 : 1;
        for (let s = 0; s < 16; s += 4) if (!(b.last && s >= 8)) hit(t0 + s * STEP, 'K', 100);
        for (let s = 0; s < (b.last ? 14 : 16); s += per) hit(t0 + s * STEP, 'S', 50 + 60 * ((b.i * 16 + s) / (b.sec.bars * 16)));
        for (let s = 2; s < (b.last ? 14 : 16); s += 4) hit(t0 + s * STEP, 'H', 56);
        if (b.first && st.drums.riser) drums.push({ t: t0, d: b.sec.bars * BAR - STEP, p: 58, v: 96 });
        return;
      }
      if (kind === 'outro' && b.last) { hit(t0, 'K', 110); drums.push({ t: t0, d: STEP, p: 49, v: 90 }); return; }
      const pat = G[tier], into = b.last && b.next && b.next.energy > E && kind !== 'intro';
      const big = into && (b.next!.kind === 'chorus' || b.next!.kind === 'drop');
      const fill = !into ? '' : big ? (rd() < .6 ? 'half' : 'stop') : rd() < .7 ? 'roll' : 'stop';
      const turn = !b.last && b.i % 4 === 3 && tier >= 1;
      const from = fill === 'half' ? 8 : fill ? 12 : 16;
      for (const [k, str] of Object.entries(pat) as [keyof typeof DRUM_NOTE, string][]) {
        for (let s = 0; s < 16; s++) {
          if (str[s] !== 'x') continue;
          if (s >= from && k !== 'K') continue;
          if (fill === 'stop' && s >= 12) continue;
          if (turn && s === 14 && (k === 'H' || k === 'G')) continue;
          const accent = k === 'H' ? (s % 4 === 0 ? 12 : s % 2 === 0 ? 0 : -14) : 0;
          hit(t0 + s * STEP, k, (DRUM_VEL[k] + accent + rd() * 10 - 5) * (.8 + .2 * E));
        }
      }
      if (fill === 'roll') for (let s = 12; s < 16; s++) hit(t0 + s * STEP, 'S', 70 + (s - 12) * 12);
      if (fill === 'half') for (let s = 8; s < 16; s++) { hit(t0 + s * STEP, 'S', 56 + (s - 8) * 8); if (s >= 14) hit(t0 + s * STEP, 'C', 90); }
      if (fill === 'stop') { hit(t0 + 12 * STEP, 'K', 104); hit(t0 + 15 * STEP, 'S', 96); }
      if (turn) { hit(t0 + 14 * STEP, 'O', 82 * (.8 + .2 * E)); if (tier >= 2 && pat.K?.[15] !== 'x') hit(t0 + 15 * STEP, 'K', 92); }
      if (b.first && E >= .6 && bi > 0) drums.push({ t: t0, d: STEP, p: 49, v: E >= .9 ? 104 : 88 });
    });
  }

  /* ---------- extras: pad, arpeggio, guitar ---------- */
  const pad: N[] = [], arp: N[] = [], gtr: N[] = [];
  if (st.pad) {
    let prev: number[] | null = null;
    bars.forEach((b, bi) => {
      const k = b.sec.kind, on = k === 'intro' || k === 'break' || k === 'bridge' || (b.sec.energy >= .95 && b.sec.bars >= 8);
      const vo = voice(b.chord, tonic, 55, 76, prev, 3);
      prev = vo;
      if (!on) return;
      for (const p of vo) pad.push({ t: bi * BAR, d: BAR - 20, p, v: k === 'intro' || k === 'break' ? 66 : 54 });
    });
  }
  if (st.arp) {
    const ra = sub(6);
    let prev: number[] | null = null;
    const shape = pick(ra, ['up', 'updown', 'up2']);
    bars.forEach((b, bi) => {
      const E = b.sec.energy;
      const vo = voice(b.chord, tonic, 60, 76, prev, 4);
      prev = vo;
      if (E < .4 && b.sec.kind !== 'intro') return;
      const tones = shape === 'up2' ? [...vo, ...vo.map(p => p + 12)] : shape === 'updown' ? [...vo, ...vo.slice(1, -1).reverse()] : vo;
      const per = E >= .8 ? 1 : 2, stopAt = b.sec.kind === 'build' && b.last ? 14 : 16;
      for (let s = 0, k = 0; s < stopAt; s += per, k++) {
        const v = clamp(Math.round((s % 4 === 0 ? 86 : 70) * (.7 + .3 * E) + ra() * 6), 30, 120);
        arp.push({ t: bi * BAR + s * STEP, d: per * STEP - 20, p: tones[k % tones.length], v });
      }
    });
  }
  if (st.guitar) {
    const rg = sub(7);
    let prev: number[] | null = null;
    bars.forEach((b, bi) => {
      const vo = voice(b.chord, tonic, 60, 79, prev, 3);
      prev = vo;
      const k = b.sec.kind;
      const pat = k === 'chorus' ? [2, 6, 10, 12, 14] : k === 'verse' ? [4, 12] : [];
      for (const s of pat) for (const p of vo) gtr.push({ t: bi * BAR + s * STEP, d: STEP - 30, p, v: clamp(Math.round(72 + rg() * 14), 40, 110) });
    });
  }

  /* ---------- feel: swing on the off sixteenths, and a looser hand for lo-fi ---------- */
  const loose = st.id === 'lofi' ? 7 : 2, rh = sub(8);
  const feel = (ns: N[], drumsPart = false) => {
    for (const n of ns) {
      if (st.swing && Math.round(n.t / STEP) % 2 === 1) n.t += Math.round(st.swing * STEP);
      if (!(drumsPart && (n.p === 36 || n.p === 38) && n.t % PPQ === 0)) n.t = Math.max(0, n.t + Math.round((rh() * 2 - 1) * loose));
    }
    return ns;
  };

  /* ---------- the song ---------- */
  const song: SongData = {
    v: 1, id, title: songTitle(sub(9 + 31 * STYLE_INDEX[o.style]), st.night), latin: '', artist: { zh: 'Ourtone 生成', en: 'Made in Ourtone' },
    key: { tonic, mode }, ppq: PPQ, tempos: [[0, bpm]], meters: [[0, 4, 4]], end: total * BAR, parts: [], user: true,
    gen: { style: o.style, seed: o.seed, length: o.length }
  };
  song.latin = song.title.en;
  const kinds: PartKind[] = [];
  const add = (kind: PartKind, preset: string, role: Role, notes: N[], name?: L10n, tag?: { day: string; night: string }) => {
    if (!notes.length) return;
    kinds.push(kind);
    const p: PartData = newPart(song, preset, role);
    if (name) p.name = name;
    if (tag) p.tag = tag;
    notes.sort((a, b) => a.t - b.t || a.p - b.p);
    const flat: number[] = [];
    for (const n of notes) flat.push(Math.max(0, Math.round(n.t)), Math.max(1, Math.round(n.d)), clamp(n.p, 0, 127), clamp(n.v, 1, 127));
    p.notes = flat;
    song.parts.push(p);
  };
  add('lead', pick(sub(10), st.lead.presets), 'melody', feel(lead));
  const compRole: Role = compPreset === 'piano' || compPreset === 'epiano' ? 'piano' : 'other';
  add('comp', compPreset, compRole, feel(comp), { zh: '和弦', en: 'Chords' }, { day: 'CHORDS', night: 'Harmonia' });
  if (st.guitar) add('guitar', st.guitar, 'guitar', feel(gtr));
  if (st.arp) add('arp', st.arp, 'other', feel(arp), { zh: '琶音', en: 'Arpeggio' }, { day: 'ARP', night: 'Scintilla' });
  if (st.pad) add('pad', st.pad, 'other', feel(pad), { zh: '铺底', en: 'Pad' }, { day: 'PAD', night: 'Nebula' });
  add('bass', pick(sub(11), st.bass.presets), 'bass', feel(bass));
  add('drums', st.drums.preset, 'drums', feel(drums, true));
  // the mix: the automatic one, nudged per part so the lead leads and the arpeggio sits behind
  const prepared = prepareSong(song);
  const PAN: Partial<Record<PartKind, number>> = { guitar: .3, arp: -.25 };
  song.parts.forEach((p, i) => {
    const pp = prepared.parts[i], d = defaultMix(p.role, p.preset, pp.poly, pp.drums, pp.density);
    p.mix = { ...d, vol: +(d.vol + (st.mix[kinds[i]] ?? 0)).toFixed(2), pan: PAN[kinds[i]] ?? 0 };
  });
  song.gain = st.gain;
  return song;
}

/** the style's backbeat as sixteen steps (kick, snare or nothing), for a picture of it */
export function grooveRow(style: StyleId): ('k' | 's' | '')[] {
  const g = GROOVES[STYLES[style].drums.groove][2];
  return Array.from({ length: 16 }, (_, i) => g.K?.[i] === 'x' ? 'k' : g.S?.[i] === 'x' || g.C?.[i] === 'x' ? 's' : '');
}
/** a seed as people see it: six letters and digits */
export const seedCode = (seed: number) => (seed >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(-6);
export function parseSeed(code: string): number | null {
  const s = code.trim().replace(/^UT-?/i, '');
  if (!/^[0-9a-z]{1,7}$/i.test(s)) return null;
  const n = parseInt(s, 36);
  return Number.isFinite(n) ? n >>> 0 : null;
}
export const newSeed = () => Math.floor(Math.random() * 36 ** 6) >>> 0;
