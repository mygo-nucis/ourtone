<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { StageLayout, Win } from './layout';
  import type { Song } from '../../lib/music/song';
  import { buildCharts, LANES, type ChartNote } from './chart';
  import { buildRange, rangeAt } from './range';
  import { paintWindow, shapeD } from './windowArt';
  import { getWarp, type Warp } from './warp';
  import { gpuPath } from './gpuCanvas';
  import { playPerf, probeChoice, type Probe } from './playPerf';
  import { pictureClock, pacedPictureClock } from './pictureClock';
  import { speed, spanAt } from './speed.svelte';
  import { keys, keyLabel } from './keys.svelte';
  import PartChip from '../../components/ui/PartChip.svelte';
  import SpeedControl from './SpeedControl.svelte';
  import Toggle from '../../components/ui/Toggle.svelte';
  import Seg from '../../components/ui/Seg.svelte';
  import { playopts } from './playopts.svelte';
  import { HIT_SOUNDS } from '../../lib/audio/hitsounds';
  import { partColor, mixHex } from '../../lib/art/palette';
  import { NS, archD } from '../../lib/art/svg';
  import { transport } from '../../lib/audio/transport.svelte';
  import { engine } from '../../lib/audio/engine';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { fonts } from '../../lib/state/fonts.svelte';
  import { F } from '../../lib/art/type';
  import { clamp, smooth, fmtTime } from '../../lib/util';

  /* play mode. the chosen window lifts off the stage, tips back in 3D and becomes the floor of a lane highway: the
     same glass, now seen in perspective, with its notes gliding into six lanes (S D F · J K L). the stage stays behind
     it, dimmed. a hit sounds the written notes exactly (and, with key sounds on, a hit sound of its own: hitsounds.ts); a press with nothing to hit is a soft tap. long notes are held:
     the head stays on the line while the tail runs into it, and its end is judged too. light judgements and a combo count. Escape, the back
     button or a click off the highway lays the window back in its place.
     several parts can be played at once (multi-track): their notes share the highway (all six lanes each, or a band of
     lanes each: chart.ts) and wear their parts' colours; the window that tips back is the lead part's, the others' notes join it */
  let { L, song, parts, lead, onexit }: { L: StageLayout; song: Song; parts: number[]; lead: number; onexit: () => void } = $props();

  const P = untrack(() => song.parts[lead]);
  const PS = untrack(() => parts.map(i => song.parts[i]));
  const multi = PS.length > 1;
  /** at most this many keys at once: two thumbs on a touch screen */
  const most = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 2 : 3;
  // (a let: turning arpeggio simplification on or off charts the part again, see rechart)
  let chart = untrack(() => buildCharts(PS, most, playopts.simplify, playopts.split));
  let notes: ChartNote[] = chart.notes;
  const drumParts = new Set(PS.filter(p => p.drums).map(p => p.index));
  const isDrum = (n: ChartNote) => drumParts.has(n.part);
  /** 0 waiting, 1 hit, 2 missed, 3 passed over (a jump, or while the window was still turning) */
  let judged = new Int8Array(notes.length);
  /** when each hit landed (ms), and whether a held note was let go early (and when, in song time) */
  let hitAt = new Float64Array(notes.length);
  let dropped = new Uint8Array(notes.length);
  let dropT = new Float64Array(notes.length);
  /** notes struck together (a chord split over two lanes) share a tie line */
  const tiesOf = (ns: ChartNote[]) => ns.map((n, i) => i + 1 < ns.length && ns[i + 1].t - n.t < .03 && ns[i + 1].lane !== n.lane);
  let tied = tiesOf(notes);
  const PERFECT = .045, GOOD = .11, WINDOW = .14;
  /** a missed note, or the rest of a long note let go early, fades out over this long (song seconds) */
  const GONE = .22;
  const fading = (age: number) => { const e = clamp(age / GONE, 0, 1); return (1 - e) * (1 - e); };
  void GOOD;
  const night = $derived(theme.night);
  const span = $derived(spanAt(speed.level, L.compact) * 1.05);
  const range = untrack(() => buildRange(P, song, spanAt(speed.level, L.compact)));

  // the window this part has on the stage (or, for a part without one, where it would stand)
  const w: Win = $derived.by(() => {
    const v = L.wins.find(x => x.part === lead);
    if (v) return v;
    const PW = L.compact ? 170 : 210, h = L.compact ? L.H - 100 : 560, x = L.W * (L.compact ? .7 : .58) - PW / 2, y = L.compact ? 74 : 150;
    return { part: lead, slot: 0, x, y, w: PW, h, rot: 0, cx: x + PW / 2, cy: y + h / 2, k: clamp(PW / 190, .5, 1.12) };
  });

  /* the highway is laid out on the stage's standard window (one of five) rather than on this one, so it keeps one width
     whatever the stage shows: with every part on the stage its windows are narrower, and with two or three wider. by
     night its border band is slimmed (windowArt's slim), so the lanes are as wide as the day's in the same highway.
     this window is only where the highway starts: the plane is squeezed to its width at first and opens out as it tips */
  const C: Win = $derived.by(() => ({ ...w, x: w.cx - L.std.w / 2, w: L.std.w, k: L.std.k }));

  /** a touch screen (a phone, or a tablet); it gets a wider highway and fewer pixels */
  const phone = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  /** the plane's near end on a phone, as a share of the stage's width (a desktop's short window: .78, at most 860). with
      the phone's narrower margin outside the rim (see tight) the highway as seen is 5% wider than at .88 before (v48) */
  const WIDE = .881;
  /* a phone's highway gives the lanes more of itself: a thinner rim round the window (and night's band), less room
     outside it, a narrower margin inside it, and a shorter fade at the far end */
  const tight = $derived(L.compact && phone);
  /** how steeply a phone's camera looks down on the highway (see Q): what lies on the floor at the hit line is seen .75
      times as tall, for its width, as it is drawn. a desktop's camera sees it .95 times (1440 × 900), and a phone's saw it
      .51 times (v48); it is brought only part of the way, or its notes would stand too tall for a small screen */
  const LAY = .75;

  /* the geometry. everything on the highway is drawn in the window's own units; the plane is that window scaled up by S,
     and one 3D matrix (perspective included) places it on the stage: the window itself at m = 0, the highway at m = 1. */
  const G = $derived.by(() => {
    const c = C, k = c.k, nt = night;
    /* one highway for both themes: the plane is laid out as a full-height window (a day window may stand a little lower,
       on the same bottom), and the notes run at the pace of a day window's whole height, from just under its top. a
       night window's notes come into sight lower, under the arch, but a note so far away stands at the same place on
       either highway, and falls as fast */
    const y0 = c.y + c.h - L.Hw;
    const rm = tight ? 11 : 20, R = { x: c.x - rm, y: y0 - 30, w: c.w + 2 * rm, h: L.Hw + 50 };
    // (one margin in both themes: by night the slimmed band fits in it)
    const lm = (tight ? 4 : 10) * k, lx0 = c.x + lm, lw = (c.w - 2 * lm) / LANES;
    // the notes' top and the line start where the stage window has them (top0, hit0)
    const top0 = L.noteTop(w, nt), top = L.noteTop(c, nt), run = L.noteTop({ ...c, y: y0 }, false), hit0 = L.hitY(w), hit1 = c.y + c.h - 40 * k;
    /** the plane's width at first, as a share of its own: the window's (its labels are painted on that much, Rl) */
    const fx0 = w.w / c.w, Rl = { x: w.cx - R.w * fx0 / 2, y: R.y, w: R.w * fx0, h: R.h };
    let NW: number, hx: number, hy: number, topY: number;
    // the middle of the whole page, wide at the near end and running down nearly to the bottom
    // on a phone wider, so a thumb finds the lanes more easily (and no wider: the notes would flatten), and never held
    // to a set width: a browser's bars take height, not width, and the highway keeps its share of the screen's width
    if (L.compact) { NW = phone ? L.W * WIDE : Math.min(860, L.W * .78); hx = L.W / 2; hy = L.H + 60; topY = 50; }
    else { NW = Math.min(1060, L.W * .7); hx = L.W / 2; hy = L.H + 34; topY = 84; }
    const S = NW / R.w, PWc = R.w * S, PHf = R.h * S;
    // the tilt, and a perspective that puts the far end at topY, a quarter as wide as the near end
    const TH = 63, th = TH * Math.PI / 180, r = .24;
    const Pd = PHf * Math.sin(th) / (1 / r - 1);
    const oy = (topY - r * (hy - PHf * Math.cos(th))) / (1 - r);
    /* the camera's height. a phone held sideways gives the highway a short, wide place on the screen, and a whole window's
       length of floor laid into it is seen at a grazing angle: the notes and the sockets on the line lay flat, a little
       over half as tall for their width as on a monitor. so a phone's camera looks down more steeply, on a shorter floor:
       the floor is drawn Q times as long about the hit line, and the plane stretched back by 1/Q, so the hit line, the
       far end and every beat between land where they did (the notes cross the screen exactly as fast), while whatever
       has a shape of its own (a note, a socket, a line, a ring, the frame) is seen as from above, as on a monitor.
       lay: how tall a thing on the floor at the line is seen, for its width, under the camera as it stood */
    const sh = (R.y + R.h - hit1) * S, f = 1 / (1 + sh * Math.sin(th) / Pd);
    const lay = Math.cos(th) + (hy - sh * Math.cos(th) - oy) * Math.sin(th) / Pd * f;
    const Q = tight ? clamp(lay / LAY, .45, 1) : 1, sq = (y: number) => hit1 + (y - hit1) * Q;
    /** the window as the highway has it, at that length (and its standing floor, R; Rf: as long as the stage's) */
    const cs = { ...c, y: sq(c.y), h: c.h * Q };
    return {
      k, c: cs, R: { ...R, y: sq(R.y), h: R.h * Q }, Rf: R, Rl, fx0, lm, lx0, lw, top0: sq(top0), top: L.noteTop(cs, nt), run: sq(run), hit0: sq(hit0), hit1,
      S, PWc, PHc: PHf * Q, PHf, Q, lay, TH, Pd, ox: hx, oy, hx, hy
    };
  });
  const laneX = (l: number) => G.lx0 + G.lw * (l + .5);

  /* ---------- the motion: m runs 0 → 1 on the way in and back to 0 on the way out ---------- */
  let m = 0, dir = 0, ready = false;
  const IN = 820, OUT = 520;
  const ease = (x: number) => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const backOut = (x: number, s = 1.6) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
  const seg = (x: number, a: number, b: number) => clamp((x - a) / (b - a), 0, 1);
  function matrix(mm: number) {
    const g = G, e = ease(mm), er = night ? smooth(seg(mm, .08, .9)) : backOut(seg(mm, .08, .92), .9);
    // where the window's near edge (its bottom middle) stands now, turned with the window
    const a = w.rot * Math.PI / 180, bx = g.Rf.x + g.Rf.w / 2 - w.cx, by = g.Rf.y + g.Rf.h - w.cy;
    const ax0 = w.cx + bx * Math.cos(a) - by * Math.sin(a), ay0 = w.cy + bx * Math.sin(a) + by * Math.cos(a);
    const s0 = 1 / g.S, sc = s0 * Math.pow(1 / s0, e);
    const lift = Math.sin(Math.PI * Math.min(1, mm * 1.15)) * (L.compact ? 40 : 70);
    // the eye travels with the window, so it tips back square to the viewer instead of shearing
    const persp = new DOMMatrix(); persp.m34 = -1 / g.Pd;
    const ax = ax0 + (g.hx - ax0) * e, ay = ay0 + (g.hy - ay0) * e;
    return new DOMMatrix().translate(ax, g.oy).multiply(persp).translate(-ax, -g.oy)
      .translate(ax, ay).rotate(0, 0, w.rot * (1 - e)).translate(0, 0, lift)
      .rotate(g.TH * er, 0, 0).scale(sc).scale(g.fx0 + (1 - g.fx0) * e, 1).translate(-g.PWc / 2, -g.PHf).scale(1, 1 / g.Q);
  }
  /** window units (the highway's, Q times as long about the hit line) → stage, and back (the plane is flat, so the matrix
      is a homography of it) */
  let H = [1, 0, 0, 0, 1, 0, 0, 0, 1], Hi = H;
  function setH(M: DOMMatrix) {
    const s = G.S, rx = G.R.x, ry = G.R.y;
    // plane px = (wx - rx) * s: fold that in
    const a = [M.m11 * s, M.m21 * s, M.m41 - (M.m11 * rx + M.m21 * ry) * s, M.m12 * s, M.m22 * s, M.m42 - (M.m12 * rx + M.m22 * ry) * s, M.m14 * s, M.m24 * s, M.m44 - (M.m14 * rx + M.m24 * ry) * s];
    H = a;
    const [A, B, C, D, E, Fh, Gh, Hh, I] = a, det = A * (E * I - Fh * Hh) - B * (D * I - Fh * Gh) + C * (D * Hh - E * Gh);
    Hi = [(E * I - Fh * Hh) / det, (C * Hh - B * I) / det, (B * Fh - C * E) / det, (Fh * Gh - D * I) / det, (A * I - C * Gh) / det, (C * D - A * Fh) / det, (D * Hh - E * Gh) / det, (B * Gh - A * Hh) / det, (A * E - B * D) / det];
  }
  const proj = (x: number, y: number) => { const q = H[6] * x + H[7] * y + H[8]; return { x: (H[0] * x + H[1] * y + H[2]) / q, y: (H[3] * x + H[4] * y + H[5]) / q, k: 1 / q }; };
  const unproj = (x: number, y: number) => { const q = Hi[6] * x + Hi[7] * y + Hi[8]; return { x: (Hi[0] * x + Hi[1] * y + Hi[2]) / q, y: (Hi[3] * x + Hi[4] * y + Hi[5]) / q }; };

  /* ---------- the panel's progress and note speed (the stage's own sit under the highway) ---------- */
  const dur = $derived(song.duration || 0);
  let sec = $state(0), fillEl: HTMLDivElement, seeking = false;
  function seekAt(e: PointerEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dismiss();
    transport.seek(clamp((e.clientX - r.left) / r.width, 0, 1) * dur);
    visualClock.reset(); pacedClock.reset();
  }
  /** the speed control laid out from its left edge, inside the panel */
  const speedL = $derived({ ...L, speed: { x: 1, y: 23, anchor: 'start' as const } });

  /* ---------- playing ---------- */
  let combo = $state(0);
  let comboAt = 0;
  /** what happened so far (a test reads it from window.__play) */
  const tally = { perfect: 0, good: 0, miss: 0, ticks: 0 };
  let judge: { k: 'perfect' | 'good' | 'miss'; at: number } | null = null;
  const down = new Array(LANES).fill(false), env = new Float32Array(LANES), flash = new Float32Array(LANES);
  const holding = new Int32Array(LANES).fill(-1);
  const rings: { lane: number; at: number; big: boolean }[] = [];
  interface Spark { x: number; y: number; vx: number; vy: number; at: number; life: number; r: number; c: number; rot: number }
  const sparks: Spark[] = [];

  /* the song's end: play mode plays it once. a light runs along the line, then what the run came to shows on the
     highway until the next start (or a seek). the highway stays as the song left it, empty, rather than showing
     the song's opening notes waiting at the start */
  interface Ending { at: number; t: number; perfect: number; good: number; miss: number }
  let ended: Ending | null = null;
  const swept = new Uint8Array(LANES);
  function finish() { ended = { at: performance.now(), t: song.duration + 1.2, perfect: tally.perfect, good: tally.good, miss: tally.miss }; swept.fill(0); }
  /** the results go (fading) and play mode waits at the start, paused; the next press or tap plays */
  let leaving: { at: number; e: Ending } | null = null;
  function dismiss() {
    if (!ended) return;
    leaving = { at: performance.now(), e: ended };
    ended = null; tally.perfect = tally.good = tally.miss = 0; combo = 0;
  }

  let next = 0;
  /** what the band leaves to the player (none while the song plays as written) */
  let theirs: ReadonlyMap<number, ReadonlySet<number>> = chart.skip;
  function reset() { visualClock.reset(); pacedClock.reset(); judged.fill(0); dropped.fill(0); holding.fill(-1); next = 0; theirs = chart.skip; bandUntil = -Infinity; transport.setSkip(playopts.exact ? null : theirs); }

  /* the song as written: the band plays every note on time, and a hit is judged as ever but sounds nothing of its own.
     switched over while playing, it takes over where the notes already in the audio graph end: switched on, the player's
     notes before that point that were not struck are struck at their time; switched off, the player's notes before it
     are already the band's (`bandUntil`), so a hit on them sounds nothing more */
  let bandUntil = -Infinity;
  function setExact(v: boolean) {
    const now = transport.now(), to = transport.scheduled;
    playopts.setExact(v);
    if (v) {
      transport.setSkip(null);
      if (!transport.playing) return;
      for (let i = next; i < notes.length && notes[i].t < to; i++) {
        const n = notes[i];
        // (not one already struck, or already the band's: before bandUntil, or handed over as the window tipped in)
        if (judged[i] === 1 || n.t < bandUntil || !theirs.get(n.part)?.has(n.notes[0])) continue;
        n.pitches.forEach((p, k) => { if (n.t >= now) transport.strike(n.part, p, n.vels[k], n.durs[k], n.t - now); });
        for (const a of n.after) if (n.t + a.dt >= now && n.t + a.dt < to) transport.strike(n.part, a.pitch, a.vel, a.dur, n.t + a.dt - now);
      }
    } else {
      bandUntil = to;
      transport.setSkip(theirs);
    }
  }
  /* arpeggio simplification turned on or off: the part is charted again. while it plays, the notes up to where the audio
     graph is already filled are passed over (the band has them), as when play mode opens mid-song */
  function setSimplify(v: boolean) {
    playopts.setSimplify(v);
    const from = transport.playing ? transport.scheduled : transport.now();
    chart = buildCharts(PS, most, v, playopts.split); notes = chart.notes; tied = tiesOf(notes);
    judged = new Int8Array(notes.length); hitAt = new Float64Array(notes.length); dropped = new Uint8Array(notes.length); dropT = new Float64Array(notes.length);
    holding.fill(-1);
    const mine = new Map([...chart.skip].map(([k, x]) => [k, new Set(x)]));
    next = 0;
    notes.forEach((n, i) => { if (n.t < from - WINDOW || (transport.playing && n.t < from)) { judged[i] = 3; const s = mine.get(n.part)!; for (const j of n.notes) s.delete(j); for (const a of n.after) s.delete(a.i); } });
    while (next < notes.length && judged[next] === 3) next++;
    theirs = mine;
    transport.setSkip(playopts.exact ? null : theirs);
    hook();
  }
  /* the hit sounds: off or one of three, and their volume (a short slider beside them while one is on); a sound picked,
     or the volume let go, is heard at once */
  const hitItems = $derived([{ id: '0', label: i18n.t('keySoundsOff') }, ...Array.from({ length: HIT_SOUNDS }, (_, i) => ({ id: String(i + 1), label: String(i + 1) }))]);
  async function hearHit() { if (!playopts.hitSound) return; await engine.unlock(); transport.hitSound(playopts.hitSound, playopts.hitVol); }
  function pickHit(v: number) { playopts.setHitSound(v); void hearHit(); }
  let volDrag = false;
  function volAt(e: PointerEvent) { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); playopts.setHitVol(clamp((e.clientX - r.left - 6) / (r.width - 12), 0, 1)); }
  function volDown(e: PointerEvent) { volDrag = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); volAt(e); }
  function volUp() { if (!volDrag) return; volDrag = false; void hearHit(); }
  /** what a test reads (window.__play): the chart and the run so far */
  function hook() { (window as unknown as { __play: unknown }).__play = { notes, tally, combo: () => combo, m: () => m, down: () => down.map(Number).join(''), lane: (l: number) => proj(laneX(l), hitNow), render: renderStats, geo: () => ({ top: G.run, vis: G.top, hit: hitNow, x: laneX(LANES / 2), span, s: L.s, proj, lw: G.lw, k: G.k, Q: G.Q, lay: G.lay }) }; }
  const visualClock = pictureClock(), pacedClock = pacedPictureClock();
  let pictureOffsetMs = 0;
  let probe: Probe = probeChoice();
  const lightProbe = (choice: Probe) => choice.startsWith('light');
  const effectsOff = () => probe === 'effects' || probe === 'light-effects';
  const hitSoundOff = () => probe === 'hit-sound' || probe === 'light-hit-sound';
  let probeScale = $state(probe === 'resolution' || lightProbe(probe) ? .65 : 1);
  function renderStats() {
    const state = warp?.stats();
    const canvasPixels = [cv, ov, artCv].reduce((sum, c) => sum + (c?.width ?? 0) * (c?.height ?? 0), state?.rasterPixels ?? 0);
    const audio = engine.ctx;
    return {
      ...state, gpu: !!state?.gpu, canvasPixels, probe, css: !warp,
      songId: song.data.id, songTime: transport.now(), night, pictureOffsetMs, cadence: probe === 'paced' ? pacedClock.stats() : undefined,
      audioClock: audio ? {
        outputTimestampSupported: typeof audio.getOutputTimestamp === 'function',
        sampleRate: audio.sampleRate, baseLatency: audio.baseLatency, outputLatency: audio.outputLatency
      } : undefined
    };
  }
  function burst(lane: number, big: boolean) {
    const ms = performance.now(), p = proj(laneX(lane), hitNow), n = big ? 12 : 7, k = clamp(p.k * G.S, .6, 1.2);
    rings.push({ lane, at: ms, big });
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - .5) * 2.3, v = (110 + Math.random() * 190) * k;
      sparks.push({ x: p.x + (Math.random() - .5) * G.lw * G.S * p.k * .6, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, at: ms, life: 380 + Math.random() * 300, r: (2 + Math.random() * 3.2) * k, c: Math.random() < .55 ? 0 : 1, rot: Math.random() * 6 });
    }
  }
  /** a lane pressed (at: when; slid: a finger slid into it, which sounds nothing when it strikes no note) */
  async function press(lane: number, at?: number, slid = false) {
    down[lane] = true;
    await engine.unlock();
    const now = at ?? transport.now();
    if (transport.playing && m >= 1) {
      let bestI = -1, bestD = WINDOW;
      for (let i = next; i < notes.length && notes[i].t <= now + WINDOW; i++) {
        const n = notes[i];
        if (n.lane !== lane || judged[i]) continue;
        const d = Math.abs(n.t - now);
        if (d <= bestD) { bestD = d; bestI = i; }
      }
      if (bestI >= 0) {
        const n = notes[bestI];
        judged[bestI] = 1; hitAt[bestI] = performance.now();
        if (!playopts.exact && !hitSoundOff()) {
          if (n.t >= bandUntil) n.pitches.forEach((p, k) => transport.strike(n.part, p, n.vels[k], n.durs[k]));
          for (const a of n.after) if (n.t + a.dt >= bandUntil) transport.strike(n.part, a.pitch, a.vel, a.dur, a.dt);
        }
        if (playopts.hitSound && !hitSoundOff()) transport.hitSound(playopts.hitSound, playopts.hitVol);
        judge = { k: bestD <= PERFECT ? 'perfect' : 'good', at: performance.now() };
        tally[judge.k]++;
        combo++; comboAt = performance.now();
        flash[lane] = 1;
        if (n.long && !isDrum(n) && down[lane]) holding[lane] = bestI;
        burst(lane, judge.k === 'perfect');
        return;
      }
    }
    if (slid) return;
    if (!hitSoundOff()) transport.click();
    tally.ticks++;
  }
  /* capture-only autoplay, for filming the promo (window.__ourtoneAutoplay = true before play mode opens; to be
     removed after it): the band keeps the part on its own clock, so it sounds exactly as written, and every note is
     shown as a Perfect hit at its own time, held for its length */
  const AUTO = !!(window as unknown as { __ourtoneAutoplay?: boolean }).__ourtoneAutoplay;
  const autoUp: { lane: number; at: number }[] = [];
  function autoHit(i: number, now: number) {
    const n = notes[i], lane = n.lane;
    judged[i] = 1; hitAt[i] = performance.now();
    judge = { k: 'perfect', at: performance.now() }; tally.perfect++;
    combo++; comboAt = performance.now();
    down[lane] = true; flash[lane] = 1;
    const long = n.long && !isDrum(n);
    if (long) holding[lane] = i;
    autoUp.push({ lane, at: long ? n.hold : Math.max(n.t + .09, now + .05) });
    burst(lane, true);
  }
  /* a long note's end is judged too: held to it, the moment it comes a Perfect and +1 combo (the key may stay down); let
     go just before it, a Perfect or a Good by how close, and the +1; let go earlier, the rest of it fades and that is
     all: no Miss, the combo stands */
  const END_PERFECT = .08, END_GOOD = .2;
  function holdEnd(lane: number, k: 'perfect' | 'good') {
    holding[lane] = -1;
    judge = { k, at: performance.now() }; tally[k]++;
    combo++; comboAt = performance.now();
    flash[lane] = 1;
    burst(lane, k === 'perfect');
  }
  function release(lane: number) {
    down[lane] = false;
    const i = holding[lane];
    if (i < 0) return;
    const now = transport.now(), left = notes[i].hold - now;
    if (left <= END_GOOD) holdEnd(lane, left <= END_PERFECT ? 'perfect' : 'good');
    else { dropped[i] = 1; dropT[i] = now; holding[lane] = -1; }
  }

  /* ---------- the window's art, painted once for the plane ---------- */
  let plane: HTMLDivElement, artCv: HTMLCanvasElement, cv: HTMLCanvasElement, ov: HTMLCanvasElement, overSvg: SVGSVGElement, hwBox: HTMLDivElement;
  /** the highway drawn with WebGL (warp.ts); without it, the plane is turned in CSS 3D as before */
  let warp: Warp | null = null, gl = $state(false);
  let scrim: HTMLDivElement, glow: HTMLDivElement, hud: HTMLDivElement, inputEl: HTMLDivElement;
  /* a phone's canvases are drawn at no more than twice its CSS pixels: a 3× screen (most iPhones) shows little more, and
     drawing every one of its pixels cost the full-screen layers more than twice the work, each frame */
  const dpr = Math.min(phone ? 2 : Infinity, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  const RES = $derived(Math.min(2, L.s * dpr) * probeScale);
  /* the plane's two canvases get only the pixels the screen shows of them. tipped back, the plane is seen
     foreshortened (its far end a quarter as wide), so at the stage's own resolution a phone's canvases were each
     1720 × 5116, cleared and painted every frame. this samples the plane through the motion (what is on screen)
     and keeps the most pixels any part of it needs, across and along, never more than before. */
  /* the notes' canvas is painted and handed to the GPU every frame, so its size is a phone's cost per frame: Safari
     ran smoothly at 1.39 million pixels (v40) and dropped frames at 1.9 (v41's wider highway, and v40's home-screen
     app, whose taller screen gave it as many) */
  const PHONE_PX = 1.3e6;
  const PR = $derived.by(() => {
    const g = G, k = L.s * dpr, pt = (M: DOMMatrix, u: number, v: number) => { const q = M.transformPoint(new DOMPoint(u, v, 0, 1)); return { x: q.x / q.w, y: q.y / q.w }; };
    let ax = 0, ay = 0;
    for (const mm of [0, .25, .5, .75, 1]) {
      const M = matrix(mm);
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
        const u = g.PWc * i / 4, v = g.PHc * j / 4, p = pt(M, u, v);
        if (p.y < -40 || p.y > L.H + 40 || p.x < -40 || p.x > L.W + 40) continue;
        const pu = pt(M, u + 1, v), pv = pt(M, u, v + 1);
        ax = Math.max(ax, Math.hypot(pu.x - p.x, pu.y - p.y)); ay = Math.max(ay, Math.hypot(pv.x - p.x, pv.y - p.y));
      }
    }
    const x = clamp(ax * k * 1.1, .5, RES), y = clamp(ay * k * 1.1, .5, RES);
    // and never a side longer than a phone's GPU takes as one texture, nor (on a phone) more than PHONE_PX pixels
    const wp = g.PWc * x, hp = g.PHc * y, f = Math.min(1, 4096 / wp, 4096 / hp, phone ? Math.sqrt(PHONE_PX * probeScale * probeScale / (wp * hp)) : 1);
    return { x: x * f, y: y * f };
  });
  $effect(() => {
    const th = theme.pal, g = G, ww = w, cc = g.c, pr = PR;
    void fonts.version; void i18n.lang;
    const under = document.createElementNS(NS, 'svg') as SVGSVGElement;
    /* the glass is the standard window's. the labels are this window's own, and when the two differ, so is a second
       glass: the plane starts as the stage's window exactly, and the standard one shows through as it fades with the
       labels (gone before the plane has opened out) */
    const art = { p: P, L, songId: song.data.id, sel: false, focused: false, sticker: false };
    paintWindow(under, null, th, { ...art, w: { ...cc, rot: 0 }, slim: true, tight });
    const own = cc.w === ww.w && g.Q === 1 ? null : document.createElementNS(NS, 'svg') as SVGSVGElement;
    paintWindow(own ?? document.createElementNS(NS, 'svg') as SVGSVGElement, overSvg, th, { ...art, w: { ...ww, rot: 0 } });
    const pw = Math.round(g.PWc * pr.x), ph = Math.round(g.PHc * pr.y);
    const load = (svg: SVGSVGElement, b: { x: number; y: number; w: number; h: number }) => new Promise<HTMLImageElement>(res => {
      svg.setAttribute('xmlns', NS);
      svg.setAttribute('width', String(pw)); svg.setAttribute('height', String(ph));
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
      const img = new Image();
      img.onload = () => res(img);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
    });
    let live = true;
    void Promise.all([load(under, g.R), own && load(own, g.Rl)]).then(([img, oi]) => {
      if (!live) return;
      artImg = img; ownImg = oi;
      artCv.width = pw; artCv.height = ph;
      // with WebGL the art is painted once, unfaded, handed over, and its canvas let go
      if (warp) {
        paintArt(0, 0);
        let ok = warp.setArt(artCv);
        if (ok && oi) { const c = document.createElement('canvas'); c.width = pw; c.height = ph; c.getContext('2d')!.drawImage(oi, 0, 0, pw, ph); ok = warp.setOwn(c); }
        else warp?.setOwn(null);
        if (ok) artCv.width = artCv.height = 1; else cssPlane();
      } else paintArt(artFade, ownFade);
      if (!ready) { ready = true; dir = 1; }
    });
    return () => { live = false; };
  });

  /* ---------- drawing the highway (window units, on the plane) ---------- */
  let hitNow = 0;
  const hexa = (ctx: CanvasRenderingContext2D, x: number, y: number, wd: number, h: number) => {
    const c = h * .55;
    ctx.beginPath(); ctx.moveTo(x - wd / 2, y); ctx.lineTo(x - wd / 2 + c, y - h / 2); ctx.lineTo(x + wd / 2 - c, y - h / 2); ctx.lineTo(x + wd / 2, y);
    ctx.lineTo(x + wd / 2 - c, y + h / 2); ctx.lineTo(x - wd / 2 + c, y + h / 2); ctx.closePath();
  };
  const capsule = (ctx: CanvasRenderingContext2D, x: number, y: number, wd: number, h: number) => { ctx.beginPath(); ctx.roundRect(x - wd / 2, y - h / 2, wd, h, h / 2); };
  const lozenge = (ctx: CanvasRenderingContext2D, x: number, y: number, wd: number, h: number) => { ctx.beginPath(); ctx.moveTo(x - wd / 2, y); ctx.lineTo(x, y - h / 2); ctx.lineTo(x + wd / 2, y); ctx.lineTo(x, y + h / 2); ctx.closePath(); };

  /** each part's colour on the highway: by day the heart of its notes (as ever); by night, with several parts, their
      table (one part keeps the crimson) */
  const tone = $derived(new Map(PS.map(p => [p.index, partColor(theme.pal, p.data.color, true)])));
  function head(ctx: CanvasRenderingContext2D, x: number, y: number, wd: number, h: number, drum: boolean, glowing: number, part = lead) {
    if (warp?.projected && m === 1) {
      // Hits enlarge the same gem/sticker. Reuse its base appearance at a scaled
      // transform instead of rebuilding all facets and clipping them every frame.
      const k = G.k, pad = 3 * k, baseW = G.lw * .86, baseH = Math.max(5.6 * k, G.lw * .3);
      const box = { x: -baseW / 2 - pad, y: -baseH * .8 - pad, w: baseW + pad * 2, h: baseH * 1.6 + pad * 2 };
      const key = JSON.stringify(['head', night, multi, tone.get(part), baseW, baseH, k, drum]);
      ctx.save(); ctx.translate(x, y); ctx.scale(wd / baseW, h / baseH);
      const cached = warp.cachedNotes(key, box, 0, 0, c => paintHead(c, 0, 0, baseW, baseH, drum, 0, part), false, { x: G.S * PR.x, y: G.S * PR.y });
      ctx.restore();
      if (cached) { paintHeadGlow(ctx, x, y, wd, h, drum, glowing); return; }
    }
    paintHead(ctx, x, y, wd, h, drum, glowing, part);
  }
  function paintHead(ctx: CanvasRenderingContext2D, x: number, y: number, wd: number, h: number, drum: boolean, glowing: number, part = lead) {
    const k = G.k, col = tone.get(part) ?? '#2F86E8';
    if (night) {
      if (drum) {
        lozenge(ctx, x, y, wd * .8, h * 1.5); ctx.fillStyle = '#E4DAD2'; ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = '#FBF6F2'; ctx.fillRect(x - wd, y - h, wd * 2, h); ctx.restore();
        ctx.lineWidth = .55 * k; ctx.strokeStyle = '#D8B46A'; ctx.stroke();
        lozenge(ctx, x, y, wd * .26, h * .5); ctx.fillStyle = multi ? col : '#C4293E'; ctx.fill();
      } else {
        // a cut gem: a pale upper facet over a deeper lower one, a crimson table, a gold girdle
        hexa(ctx, x, y, wd, h); ctx.fillStyle = '#CDBFB5'; ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = '#F7F0EB'; ctx.fillRect(x - wd, y - h, wd * 2, h); ctx.restore();
        ctx.lineWidth = .6 * k; ctx.strokeStyle = '#D8B46A'; ctx.stroke();
        hexa(ctx, x, y, wd * .58, h * .42); ctx.fillStyle = multi ? mixHex(col, '#0B0A0E', .3) : '#9E1C31'; ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = multi ? col : '#D23A50'; ctx.fillRect(x - wd, y - h, wd * 2, h * .79); ctx.restore();
        ctx.beginPath(); ctx.moveTo(x - wd * .36, y - h * .32); ctx.lineTo(x - wd * .08, y - h * .32);
        ctx.lineWidth = .45 * k; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
      }
    } else {
      // a sticker: a soft drop, a white body with an ink line, the part's colour at its heart
      const wd2 = drum ? wd * .62 : wd;
      capsule(ctx, x + .6 * k, y + 1.7 * k, wd2, h); ctx.fillStyle = 'rgba(28,32,48,.2)'; ctx.fill();
      capsule(ctx, x, y, wd2, h); ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.lineWidth = 1 * k; ctx.strokeStyle = '#1C2030'; ctx.stroke();
      if (drum) { ctx.beginPath(); ctx.arc(x, y, h * .2, 0, Math.PI * 2); ctx.fillStyle = multi ? col : '#1C2030'; ctx.fill(); }
      else { capsule(ctx, x, y, wd * .52, h * .3); ctx.fillStyle = col; ctx.fill(); }
    }
    paintHeadGlow(ctx, x, y, wd, h, drum, glowing);
  }
  function paintHeadGlow(ctx: CanvasRenderingContext2D, x: number, y: number, wd: number, h: number, drum: boolean, glowing: number) {
    if (glowing <= 0) return;
    if (night) {
      ctx.globalCompositeOperation = 'lighter';
      hexa(ctx, x, y, wd, h); ctx.fillStyle = `rgba(216,180,106,${.55 * glowing})`; ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      capsule(ctx, x, y, drum ? wd * .62 : wd, h); ctx.fillStyle = `rgba(47,134,232,${.85 * glowing})`; ctx.fill();
      capsule(ctx, x, y, wd * .52, h * .3); ctx.fillStyle = `rgba(255,255,255,${glowing})`; ctx.fill();
    }
  }
  /** a long note's body, from y0 (its head) up to y1 (its end) */
  const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };
  function tail(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, wd: number, state: 'live' | 'held' | 'dim', part = lead) {
    if (y0 - y1 < 2) return;
    const k = G.k, tw = wd * .42, a0 = ctx.globalAlpha, col = tone.get(part) ?? '#2F86E8';
    const deep = multi ? rgb(col) : '196,41,62', deeper = multi ? rgb(mixHex(col, '#0B0A0E', .45)) : '110,20,34';
    ctx.globalAlpha = a0 * (state === 'dim' ? .35 : 1);
    if (night) {
      ctx.beginPath(); ctx.moveTo(x - tw / 2, y0); ctx.lineTo(x - tw / 2, y1 + tw * .7); ctx.lineTo(x, y1); ctx.lineTo(x + tw / 2, y1 + tw * .7); ctx.lineTo(x + tw / 2, y0); ctx.closePath();
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      if (state === 'held') { g.addColorStop(0, 'rgba(255,236,196,.95)'); g.addColorStop(.25, 'rgba(216,180,106,.8)'); g.addColorStop(1, `rgba(${deep},.55)`); }
      else { g.addColorStop(0, `rgba(${deep},.75)`); g.addColorStop(1, `rgba(${deeper},.55)`); }
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = .5 * k; ctx.strokeStyle = state === 'dim' ? 'rgba(237,230,225,.4)' : 'rgba(216,180,106,.85)'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1 + tw * .9); ctx.lineWidth = .35 * k; ctx.strokeStyle = 'rgba(255,243,238,.55)'; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.roundRect(x - tw / 2, y1, tw, y0 - y1, tw / 2);
      ctx.fillStyle = state === 'held' ? '#FFFFFF' : 'rgba(255,255,255,.88)'; ctx.fill();
      ctx.lineWidth = .8 * k; ctx.strokeStyle = '#1C2030'; ctx.stroke();
      const cw = tw * .38;
      ctx.beginPath(); ctx.roundRect(x - cw / 2, y1 + tw * .3, cw, Math.max(0, y0 - y1 - tw * .6), cw / 2);
      ctx.fillStyle = state === 'held' ? '#2F86E8' : col; ctx.fill();
    }
    ctx.globalAlpha = a0;
  }

  /* the far end fades into the dark. the fade is painted into the plane's two canvases, not set as a CSS mask: a mask
     on a layer seen in perspective is drawn as a second layer at the plane's magnified scale, which on a phone runs
     past the graphics memory, and the near end of the highway was left undrawn */
  const FADE = [[0, 0], [.2, .05], [.34, .32], [.48, .72], [.62, 1], [1, 1]];
  /** (a phone's fade is this share as long: more of its highway is in full view) */
  const fadeK = $derived(tight ? .65 : 1);
  function fadeOut(c: CanvasRenderingContext2D, fm: number) {
    if (fm <= 0) return;
    const h = c.canvas.height, gr = c.createLinearGradient(0, 0, 0, h);
    for (const [at, v] of FADE) gr.addColorStop(Math.min(1, at * fadeK), `rgba(0,0,0,${(1 - fm + fm * v).toFixed(3)})`);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-in';
    c.fillStyle = gr; c.fillRect(0, 0, c.canvas.width, h); c.restore();
  }
  let artImg: HTMLImageElement | null = null, ownImg: HTMLImageElement | null = null, artFade = 0, ownFade = 1;
  /** WebGL is gone (or never took the art): the plane goes back to being turned in CSS, with its own canvases */
  function cssPlane() {
    warp?.rest(); warp = null; gl = false;
    if (artImg) { artCv.width = Math.round(G.PWc * PR.x); artCv.height = Math.round(G.PHc * PR.y); artFade = -1; }
  }
  /** the art, fading at the far end by fm, with the stage window's own glass over it at `own` */
  function paintArt(fm: number, own: number) {
    if (!artImg) return;
    const c = artCv.getContext('2d')!;
    c.clearRect(0, 0, artCv.width, artCv.height); c.drawImage(artImg, 0, 0, artCv.width, artCv.height);
    if (ownImg && own > 0) { c.globalAlpha = own; c.drawImage(ownImg, 0, 0, artCv.width, artCv.height); c.globalAlpha = 1; }
    fadeOut(c, fm);
    artFade = fm; ownFade = own;
  }

  function draw(now: number, ms: number, M = matrix(m)) {
    const g = G, c = g.c, k = g.k, nt = night, pr = PR;
    const cw = Math.round(g.PWc * pr.x), ch = Math.round(g.PHc * pr.y);
    const ctx = warp?.gpu ? warp.beginNotes(cw, ch, fonts.version, M, g.PWc, g.PHc, L.W, L.H, Math.round(L.W * RES), Math.round(L.H * RES)) : cv.getContext('2d')!;
    if (!warp?.gpu && (cv.width !== cw || cv.height !== ch)) { cv.width = cw; cv.height = ch; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cw, ch);
    const sx = g.S * pr.x, sy = g.S * pr.y;
    ctx.setTransform(sx, 0, 0, sy, -g.R.x * sx, -g.R.y * sy);
    const gm = smooth(seg(m, .1, .7)), lm = smooth(seg(m, .3, .85)), am = smooth(seg(m, .15, .6));
    // (the pace moves from the window's own to the highway's as it tips)
    const hit = g.hit0 + (g.hit1 - g.hit0) * gm, top = g.top0 + (g.top - g.top0) * gm, pps = (hit - (top + (g.run - top) * gm)) / span;
    hitNow = hit;
    const lw = g.lw, X0 = g.lx0, X1 = g.lx0 + lw * LANES, bottom = c.y + c.h;
    // (heads start the stage window's size, on a plane squeezed to its width)
    const kw = w.k, hw0 = 12 * kw / g.fx0, hh0 = 13 * kw * g.Q;
    const hw = hw0 + (lw * .86 - hw0) * gm, hh = (hh0 + (Math.max(5.6 * k, lw * .3) - hh0) * gm);
    const pal = theme.pal;

    const retain = (name: string, box: { x: number; y: number; w: number; h: number }, paint: (ctx: CanvasRenderingContext2D) => void) => {
      ctx.save();
      const key = JSON.stringify([name, nt, c, k, top, hit, bottom, lw, tight, pal.accent, pal.orn]);
      if (!(m === 1 && warp?.cachedNotes(key, box, 0, 0, paint, true))) paint(ctx);
      ctx.restore();
    };
    retain('base', { x: c.x - 24, y: c.y - 32, w: c.w + 48, h: c.h + 64 }, ctx => {
      // the rim the window wears while it is played
      if (lm > 0) {
        ctx.globalAlpha = lm;
        const q = tight ? .55 : 1;
        if (nt) {
          ctx.fillStyle = 'rgba(216,180,106,.12)'; ctx.fill(gpuPath(archD(c.x - 16 * q, c.y - 24 * q, c.w + 32 * q, c.h + 24 * q), { x: c.x - 16 * q, y: c.y - 24 * q, w: c.w + 32 * q, h: c.h + 24 * q }, 'rim-fill', true));
          ctx.lineWidth = 2.2 * q; ctx.strokeStyle = pal.orn; ctx.stroke(gpuPath(archD(c.x - 9 * q, c.y - 12 * q, c.w + 18 * q, c.h + 12 * q), { x: c.x - 9 * q, y: c.y - 12 * q, w: c.w + 18 * q, h: c.h + 12 * q }, 'rim-stroke', true));
        } else { ctx.beginPath(); ctx.roundRect(c.x - 8 * q, c.y - 8 * q, c.w + 16 * q, c.h + 16 * q, 10 * q); ctx.lineWidth = 5 * q; ctx.strokeStyle = pal.accent; ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.clip(gpuPath(shapeD(nt, c), c, 'floor', nt));
      if (lm > 0) {
        ctx.globalAlpha = lm;
        const fl = ctx.createLinearGradient(0, top, 0, bottom);
        if (nt) { fl.addColorStop(0, 'rgba(8,6,10,0)'); fl.addColorStop(.35, 'rgba(8,6,10,.38)'); fl.addColorStop(1, 'rgba(8,6,10,.62)'); }
        else { fl.addColorStop(0, 'rgba(255,255,255,.55)'); fl.addColorStop(.3, 'rgba(255,255,255,.12)'); fl.addColorStop(1, 'rgba(255,255,255,.34)'); }
        ctx.fillStyle = fl; ctx.fillRect(X0, c.y, X1 - X0, c.h);
      }
      ctx.restore();
    });
    ctx.save();
    ctx.clip(gpuPath(shapeD(nt, c), c, 'floor', nt));

    if (lm > 0) {
      ctx.globalAlpha = lm;
      // beats across the lanes, so speed reads as distance
      const tl = song.tl, ppq = song.data.ppq, b0 = Math.ceil(tl.tick(now) / ppq);
      ctx.lineWidth = .5 * k;
      for (let b = b0; ; b++) {
        const t = tl.sec(b * ppq), y = hit - (t - now) * pps;
        if (y < top - 20) break;
        const a = (1 - (hit - y) / (hit - top)) * .9 + .1;
        ctx.strokeStyle = nt ? `rgba(216,180,106,${.2 * a})` : `rgba(28,32,48,${.16 * a})`;
        ctx.beginPath(); ctx.moveTo(X0, y); ctx.lineTo(X1, y); ctx.stroke();
      }
      // the lane lines draw up from the hit line as the window turns
      const reach = hit - (hit - (c.y - 30)) * lm;
      for (let l = 0; l <= LANES; l++) {
        const x = X0 + l * lw, edge = l === 0 || l === LANES, mid = l === LANES / 2;
        ctx.lineWidth = (edge ? 1.1 : mid ? .8 : .5) * k;
        ctx.strokeStyle = nt ? `rgba(216,180,106,${edge ? .75 : mid ? .45 : .22})` : `rgba(255,255,255,${edge ? 1 : mid ? .95 : .8})`;
        ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, reach); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // light rising from a pressed key: it swells in and dies away
    for (let l = 0; l < LANES; l++) {
      const a = Math.min(1, env[l] * .8 + flash[l] * .7);
      if (a < .01) continue;
      const x = X0 + l * lw, len = (hit - top) * (.32 + .18 * flash[l]);
      const bg = ctx.createLinearGradient(0, hit, 0, hit - len);
      if (nt) { bg.addColorStop(0, `rgba(255,214,170,${.5 * a})`); bg.addColorStop(.35, `rgba(196,41,62,${.25 * a})`); bg.addColorStop(1, 'rgba(196,41,62,0)'); ctx.globalCompositeOperation = 'lighter'; }
      else { bg.addColorStop(0, `rgba(255,255,255,${.85 * a})`); bg.addColorStop(.5, `rgba(255,255,255,${.3 * a})`); bg.addColorStop(1, 'rgba(255,255,255,0)'); }
      ctx.fillStyle = bg; ctx.fillRect(x + .5, hit - len, lw - 1, len);
      ctx.globalCompositeOperation = 'source-over';
    }

    // the apron: the window's label panel, folded down to carry the keys
    if (am > 0) {
      // (the room under the line is as long, as seen, as the floor's: Q)
      const p0 = bottom - L.panel(w) * g.Q, at = hit + hh * .5 + 6 * k * g.Q, py = p0 + (at - p0) * am;
      ctx.globalAlpha = am;
      ctx.fillStyle = nt ? 'rgba(11,10,14,.86)' : 'rgba(255,255,255,.9)';
      ctx.fillRect(c.x, py, c.w, bottom - py);
      ctx.beginPath(); ctx.moveTo(c.x + (nt ? 10 : 0), py); ctx.lineTo(c.x + c.w - (nt ? 10 : 0), py);
      ctx.lineWidth = nt ? .8 : 1.2 * k; ctx.strokeStyle = nt ? 'rgba(216,180,106,.7)' : '#1C2030'; ctx.stroke();
      if (!coarse) {
        const fs = lw * (nt ? .5 : .42);
        ctx.font = nt ? `600 ${fs}px ${F.gar}` : `italic 900 ${fs}px ${F.disp}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let l = 0; l < LANES; l++) {
          const lit = Math.min(1, env[l] + flash[l]);
          ctx.fillStyle = nt ? (lit > .3 ? '#FFF3EE' : '#D8B46A') : (lit > .3 ? pal.accent : '#1C2030');
          ctx.fillText(keys.label(l), laneX(l), py + (bottom - py) * .48);
        }
      } else {
        // a touch screen has no keys to name: six quiet pads instead, a faint tint with a short rule in the middle, so the
        // apron reads as the place to tap without competing with the notes; a pad warms while it is pressed
        const gx = lw * .05, pt = py + 4 * k * g.Q, ph = bottom - 6 * k * g.Q - pt;
        for (let l = 0; l < LANES; l++) {
          const lit = Math.min(1, env[l] + flash[l]), x = X0 + l * lw + gx, pw = lw - 2 * gx;
          ctx.beginPath(); ctx.roundRect(x, pt, pw, ph, nt ? 1.5 * k : lw * .09);
          ctx.fillStyle = nt ? 'rgba(216,180,106,.045)' : `rgba(47,134,232,${.05 + .16 * lit})`; ctx.fill();
          if (nt && lit > .01) { ctx.fillStyle = `rgba(196,41,62,${.24 * lit})`; ctx.fill(); }
          if (nt) { ctx.lineWidth = .5 * k; ctx.strokeStyle = `rgba(216,180,106,${.16 + .3 * lit})`; ctx.stroke(); }
          const cx = laneX(l), cy = pt + ph * .5, rl = lw * .11;
          ctx.beginPath(); ctx.moveTo(cx - rl, cy); ctx.lineTo(cx + rl, cy);
          ctx.lineCap = 'round'; ctx.lineWidth = (nt ? .7 : 1.1) * k;
          ctx.strokeStyle = nt ? `rgba(216,180,106,${.32 + .5 * lit})` : `rgba(28,32,48,${.16 + .3 * lit})`; ctx.stroke(); ctx.lineCap = 'butt';
        }
      }
      ctx.globalAlpha = 1;
    }

    // the hit line and its six sockets, which pop in one after another
    if (lm > 0) {
      ctx.globalAlpha = lm;
      ctx.lineWidth = (nt ? .9 : 1.3) * k; ctx.strokeStyle = nt ? '#D8B46A' : '#1C2030';
      ctx.beginPath(); ctx.moveTo(X0, hit); ctx.lineTo(X1, hit); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (let l = 0; l < LANES; l++) {
      const pr = seg(m, .5 + .05 * l, .78 + .05 * l);
      if (pr <= 0) continue;
      const sc = nt ? smooth(pr) : backOut(pr), x = laneX(l), lit = Math.min(1, env[l] + flash[l] * .6);
      const rw = lw * .86 * sc, rh = Math.max(5.6 * k, lw * .3) * sc;
      ctx.globalAlpha = Math.min(1, pr * 2);
      if (nt) {
        hexa(ctx, x, hit, rw, rh); ctx.fillStyle = 'rgba(11,10,14,.7)'; ctx.fill();
        if (lit > 0) { ctx.fillStyle = `rgba(196,41,62,${.85 * lit})`; ctx.fill(); }
        ctx.lineWidth = .6 * k; ctx.strokeStyle = lit > .2 ? '#F1DDA8' : 'rgba(216,180,106,.85)'; ctx.stroke();
        hexa(ctx, x, hit, rw * .58, rh * .42); ctx.lineWidth = .4 * k; ctx.strokeStyle = 'rgba(216,180,106,.5)'; ctx.stroke();
      } else {
        capsule(ctx, x, hit, rw, rh); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill();
        if (lit > 0) { ctx.fillStyle = `rgba(47,134,232,${lit})`; ctx.fill(); }
        ctx.lineWidth = 1 * k; ctx.strokeStyle = '#1C2030'; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // the notes: they start where the window showed them and glide into their lanes
    const [lo, hi] = rangeAt(range, now), rs = Math.max(.5, hi - lo), px0 = c.x + 26 * k, pxw = c.w - 52 * k;
    // (the lead part's notes glide from where its window showed them; the other parts' are in their lanes, coming in)
    const xOf = (n: ChartNote) => {
      const lx = laneX(n.lane);
      if (gm >= 1 || P.drums || n.part !== lead) return lx;
      const u = clamp((Math.max(...n.pitches) - lo) / rs, -.06, 1.06);
      return px0 + u * pxw + (lx - px0 - u * pxw) * gm;
    };
    const far = (hit - (c.y - 20)) / pps;
    let i0 = Math.max(0, next - 60);
    while (i0 < notes.length && notes[i0].end < now - 2) i0++;
    if (ended) i0 = notes.length;
    // ties, then bodies, then heads, so a head is never covered
    ctx.lineWidth = (nt ? .5 : .7) * k;
    ctx.strokeStyle = nt ? 'rgba(216,180,106,.7)' : 'rgba(28,32,48,.55)';
    for (let i = i0; i < notes.length; i++) {
      const n = notes[i];
      if (n.t - now > far) break;
      if (!tied[i] || judged[i] || judged[i + 1] || n.t < now) continue;
      const y = hit - (n.t - now) * pps, xa = xOf(n), xb = xOf(notes[i + 1]);
      ctx.beginPath(); ctx.moveTo(Math.min(xa, xb) + hw / 2, y); ctx.lineTo(Math.max(xa, xb) - hw / 2, y); ctx.stroke();
    }
    for (let pass = 0; pass < 2; pass++) for (let i = i0; i < notes.length; i++) {
      const n = notes[i];
      if (n.t - now > far) break;
      const x = xOf(n), drum = isDrum(n), long = n.long && !drum, j = judged[i];
      const join = n.part === lead ? 1 : gm;
      const y = hit - (n.t - now) * pps, yEnd = hit - (n.hold - now) * pps;
      if (j === 1) {
        const held = holding[n.lane] === i && !dropped[i];
        // held to its end: done. let go early: what is left above the line dims and fades (what was taken stays taken)
        if (long && now < n.hold && (held || dropped[i])) {
          if (held) {
            if (pass === 0) tail(ctx, x, hit, Math.max(yEnd, top - 40), hw, 'held', n.part);
            else head(ctx, x, hit, hw, hh, drum, .55 + .35 * Math.sin(ms / 70), n.part);
          } else if (pass === 0) {
            const a = fading(now - dropT[i]);
            if (a > 0) { ctx.globalAlpha = a; tail(ctx, x, hit, Math.max(yEnd, top - 40), hw, 'dim', n.part); ctx.globalAlpha = 1; }
          }
          continue;
        }
        // a short hit flares on the line and is gone
        const age = (ms - hitAt[i]) / 170;
        if (pass === 1 && age < 1) { ctx.globalAlpha = 1 - age; head(ctx, x, hit, hw * (1 + .45 * age), hh * (1 + .45 * age), drum, 1, n.part); ctx.globalAlpha = 1; }
        continue;
      }
      // missed (or passed over): dimmed at once and faded out just past the line
      const gone = j >= 2 || (j === 0 && n.t < now - WINDOW);
      const fadeIn = clamp((y - top) / ((hit - top) * .1), 0, 1);
      const a = (gone ? .45 * fading(now - n.t - WINDOW) : fadeIn) * join;
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      if (pass === 0) { if (long) tail(ctx, x, y, Math.max(yEnd, top - 40), hw, gone ? 'dim' : 'live', n.part); }
      else head(ctx, x, y, hw, hh, drum, 0, n.part);
      ctx.globalAlpha = 1;
    }

    // rings where notes were struck: flat on the floor, so the perspective lays them down
    for (const r of rings) {
      const e = (ms - r.at) / 360;
      if (e >= 1) continue;
      const q = 1 - Math.pow(1 - e, 3), x = laneX(r.lane), rad = lw * (.25 + .6 * q);
      ctx.beginPath(); ctx.arc(x, hit, rad, 0, Math.PI * 2);
      ctx.lineWidth = (1.6 * (1 - e) + .2) * k;
      if (nt) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(241,221,168,${.9 * (1 - e)})`; }
      else ctx.strokeStyle = `rgba(47,134,232,${1 - e})`;
      ctx.stroke();
      if (r.big) { ctx.beginPath(); ctx.arc(x, hit, rad * .62, 0, Math.PI * 2); ctx.lineWidth = .6 * k * (1 - e); ctx.strokeStyle = nt ? `rgba(255,243,238,${.8 * (1 - e)})` : `rgba(255,255,255,${1 - e})`; ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
    }
    while (rings.length && ms - rings[0].at > 400) rings.shift();

    if (nt) {
      // notes come out of the glass just under the rose window, as they do on the stage
      ctx.globalCompositeOperation = 'destination-out';
      const fl = 58 * k, fg = ctx.createLinearGradient(0, top, 0, top + fl);
      fg.addColorStop(0, 'rgba(0,0,0,1)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg; ctx.fillRect(c.x - 4, top, c.w + 8, fl);
      ctx.fillStyle = '#000'; ctx.fillRect(c.x - 4, c.y - 40, c.w + 8, top - c.y + 40.5);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /* ---------- the layer over everything: sparks, judgement, combo (upright, in stage units) ---------- */
  const stretch = (ctx: CanvasRenderingContext2D) => { try { (ctx as unknown as { fontStretch: string }).fontStretch = 'semi-expanded'; } catch { /* older canvas */ } };
  let overSig = '';
  function drawOver(ms: number, dt: number) {
    const gpu = !!warp?.gpu, res = RES, cw = Math.round(L.W * res), ch = Math.round(L.H * res);
    const E = ended ?? (leaving && ms - leaving.at < 240 ? leaving.e : null);
    // while nothing on this layer moves (no sparks, no word, the combo settled, playing on), the last frame still stands:
    // the whole screen's layer is neither cleared, repainted nor composited again
    const still = transport.playing && !E && !sparks.length && !(judge && ms - judge.at < 560) && ms - comboAt >= 140;
    const sig = still ? `${cw}x${ch} ${m} ${hitNow} ${combo} ${night} ${i18n.lang} ${fonts.version}` : '';
    if (still && sig === overSig) { if (gpu) warp!.reuseOverlay(); return; }
    const ctx = gpu ? warp!.beginOverlay(RES, fonts.version) : ov.getContext('2d')!;
    overSig = sig;
    ov.style.display = gpu ? 'none' : '';
    if (gpu) { if (ov.width !== 1) { ov.width = ov.height = 1; } }
    else if (ov.width !== cw || ov.height !== ch) { ov.width = cw; ov.height = ch; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cw, ch);
    ctx.setTransform(res, 0, 0, res, 0, 0);
    const nt = night, pal = theme.pal, hm = smooth(seg(m, .75, 1));
    // sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i], e = (ms - p.at) / p.life;
      if (e >= 1) { sparks.splice(i, 1); continue; }
      p.vy += 520 * dt; p.vx *= Math.pow(.2, dt); p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - e * e, r = p.r * (1 - .4 * e);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + e * 2);
      if (nt) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = p.c ? `rgba(255,236,196,${a})` : `rgba(216,180,106,${a})`;
        ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(r * .6, 0); ctx.lineTo(0, r * 1.3); ctx.lineTo(-r * .6, 0); ctx.closePath(); ctx.fill();
      } else {
        const q = r * 1.5, c = q * .2;
        ctx.beginPath(); ctx.moveTo(0, -q); ctx.quadraticCurveTo(c, -c, q, 0); ctx.quadraticCurveTo(c, c, 0, q); ctx.quadraticCurveTo(-c, c, -q, 0); ctx.quadraticCurveTo(-c, -c, 0, -q);
        ctx.fillStyle = p.c ? `rgba(149,206,243,${a})` : `rgba(47,134,232,${a})`; ctx.fill();
      }
      ctx.restore();
    }
    if (hm <= 0) return;
    const mid = proj(G.lx0 + G.lw * LANES / 2, hitNow), big = L.compact ? .72 : 1;
    // the last judgement, just above the line
    if (judge && ms - judge.at < 560) {
      const age = ms - judge.at, a = age < 380 ? 1 : 1 - (age - 380) / 180;
      const word = i18n.t(judge.k === 'perfect' ? 'judgePerfect' : judge.k === 'good' ? 'judgeGood' : 'judgeMiss');
      const y = mid.y - 70 * big;
      ctx.save(); ctx.globalAlpha = hm * a; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      if (nt) {
        const rise = 8 * (1 - Math.min(1, age / 140));
        ctx.font = `italic 600 ${38 * big}px ${F.gar}`;
        ctx.fillStyle = judge.k === 'miss' ? '#8E8792' : judge.k === 'perfect' ? '#F1DDA8' : '#EDE6E1';
        if (judge.k === 'perfect') { ctx.shadowColor = 'rgba(216,180,106,.7)'; ctx.shadowBlur = 16; }
        ctx.fillText(word, mid.x, y + rise);
        ctx.shadowBlur = 0;
        if (judge.k !== 'miss') {
          const tw = ctx.measureText(word).width / 2 + 16 * big;
          ctx.fillStyle = 'rgba(216,180,106,.8)';
          for (const sx of [-1, 1]) { const lx = mid.x + sx * tw, ly = y + rise - 11 * big; ctx.beginPath(); ctx.moveTo(lx, ly - 4 * big); ctx.lineTo(lx + 3 * big, ly); ctx.lineTo(lx, ly + 4 * big); ctx.lineTo(lx - 3 * big, ly); ctx.closePath(); ctx.fill(); }
        }
      } else {
        // a sticker word: it pops in, then fades
        const sc = age < 130 ? 1.3 - .3 * backOut(age / 130, 2.2) : 1;
        ctx.translate(mid.x, y); ctx.scale(sc, sc); ctx.rotate(-.05);
        ctx.font = `italic 900 ${32 * big}px ${F.disp}`; stretch(ctx);
        const txt = word.toUpperCase();
        ctx.lineJoin = 'round'; ctx.lineWidth = 9 * big; ctx.strokeStyle = '#FFFFFF';
        ctx.fillStyle = 'rgba(28,32,48,.16)'; ctx.fillText(txt, 3, 4);
        ctx.strokeText(txt, 0, 0);
        ctx.fillStyle = judge.k === 'miss' ? '#8B93A4' : judge.k === 'perfect' ? pal.accent : '#1C2030';
        ctx.fillText(txt, 0, 0);
      }
      ctx.restore();
    }
    // the combo, high on the highway
    if (combo >= 2 && !ended) {
      const c = proj(G.lx0 + G.lw * LANES / 2, G.top + (hitNow - G.top) * .3), bump = 1 + .14 * Math.max(0, 1 - (ms - comboAt) / 140);
      ctx.save(); ctx.globalAlpha = hm * .92; ctx.translate(c.x, c.y); ctx.scale(bump, bump); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      if (nt) {
        ctx.font = `600 ${62 * big}px ${F.gar}`;
        const gg = ctx.createLinearGradient(0, -48 * big, 0, 0); gg.addColorStop(0, '#F6E6BC'); gg.addColorStop(1, '#B8913F');
        ctx.fillStyle = gg; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 12; ctx.fillText(String(combo), 0, 0); ctx.shadowBlur = 0;
        ctx.font = `italic 600 ${17 * big}px ${F.gar}`; ctx.fillStyle = 'rgba(237,230,225,.75)';
        const lab = i18n.t('combo'), tw = ctx.measureText(lab).width / 2;
        ctx.fillText(lab, 0, 22 * big);
        ctx.strokeStyle = 'rgba(216,180,106,.6)'; ctx.lineWidth = .8;
        for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * (tw + 8 * big), 16 * big); ctx.lineTo(sx * (tw + 34 * big), 16 * big); ctx.stroke(); }
      } else {
        ctx.rotate(-.04);
        ctx.font = `italic 900 ${56 * big}px ${F.disp}`; stretch(ctx);
        ctx.lineJoin = 'round'; ctx.lineWidth = 11 * big; ctx.strokeStyle = '#FFFFFF';
        ctx.fillStyle = 'rgba(28,32,48,.16)'; ctx.fillText(String(combo), 4, 5);
        ctx.strokeText(String(combo), 0, 0); ctx.fillStyle = pal.accent; ctx.fillText(String(combo), 0, 0);
        ctx.font = `italic 900 ${13 * big}px ${F.disp}`; ctx.lineWidth = 6 * big;
        const lab = i18n.t('combo').toUpperCase();
        ctx.strokeText(lab, 0, 20 * big); ctx.fillStyle = '#1C2030'; ctx.fillText(lab, 0, 20 * big);
      }
      ctx.restore();
    }
    // the end: a word, the count, then how to go again
    if (E && m >= 1) {
      const out = ended ? 1 : 1 - (ms - leaving!.at) / 240;
      const e = ms - E.at, a1 = smooth(seg(e, 450, 950)), a2 = smooth(seg(e, 800, 1300)), a3 = smooth(seg(e, 1400, 1900)) * (.7 + .3 * Math.sin(ms / 420));
      const c = proj(G.lx0 + G.lw * LANES / 2, G.top + (hitNow - G.top) * .5), rise = 10 * big * (1 - a1);
      const count = `${i18n.t('judgePerfect')} ${E.perfect}   ${i18n.t('judgeGood')} ${E.good}   ${i18n.t('judgeMiss')} ${E.miss}`;
      const again = coarse ? i18n.t('playAgainTouch') : i18n.t('playAgain');
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (nt) {
        ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 12;
        ctx.globalAlpha = hm * out * a1; ctx.font = `italic 600 ${40 * big}px ${F.gar}`; ctx.fillStyle = '#F1DDA8';
        const word = i18n.t('playEnd'), y = c.y - 36 * big + rise, tw = ctx.measureText(word).width / 2 + 18 * big;
        ctx.fillText(word, c.x, y);
        ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(216,180,106,.8)';
        for (const sx of [-1, 1]) { const lx = c.x + sx * tw; ctx.beginPath(); ctx.moveTo(lx, y - 4 * big); ctx.lineTo(lx + 3 * big, y); ctx.lineTo(lx, y + 4 * big); ctx.lineTo(lx - 3 * big, y); ctx.closePath(); ctx.fill(); }
        ctx.shadowBlur = 10;
        ctx.globalAlpha = hm * out * a2; ctx.font = `600 ${17 * big}px ${F.gar}`; ctx.fillStyle = '#EDE6E1'; ctx.fillText(count, c.x, c.y + 8 * big);
        ctx.globalAlpha = hm * out * a3; ctx.font = `italic 600 ${19 * big}px ${F.gar}`; ctx.fillStyle = 'rgba(237,230,225,.85)'; ctx.fillText(again, c.x, c.y + 50 * big);
      } else {
        ctx.lineJoin = 'round'; ctx.strokeStyle = '#FFFFFF';
        ctx.save(); ctx.globalAlpha = hm * out * a1; ctx.translate(c.x, c.y - 36 * big + rise); ctx.rotate(-.04);
        ctx.font = `italic 900 ${34 * big}px ${F.disp}`; stretch(ctx);
        const word = i18n.t('playEnd').toUpperCase();
        ctx.lineWidth = 9 * big; ctx.fillStyle = 'rgba(28,32,48,.16)'; ctx.fillText(word, 3, 4);
        ctx.strokeText(word, 0, 0); ctx.fillStyle = pal.accent; ctx.fillText(word, 0, 0);
        ctx.restore();
        ctx.globalAlpha = hm * out * a2; ctx.font = `800 ${14 * big}px ${F.sans}`; ctx.letterSpacing = '1px';
        ctx.lineWidth = 6 * big; ctx.strokeText(count, c.x, c.y + 8 * big); ctx.fillStyle = '#1C2030'; ctx.fillText(count, c.x, c.y + 8 * big);
        ctx.globalAlpha = hm * out * a3; ctx.font = `900 ${15 * big}px ${F.sans}`; ctx.letterSpacing = '3px';
        ctx.lineWidth = 7 * big; ctx.strokeText(again, c.x, c.y + 50 * big); ctx.fillStyle = '#1C2030'; ctx.fillText(again, c.x, c.y + 50 * big);
      }
      ctx.restore();
    } else if (!transport.playing && m >= 1) {
      // waiting to start (coming in after the results have gone)
      const fi = leaving ? smooth(seg(ms - leaving.at, 180, 480)) : 1;
      const c = proj(G.lx0 + G.lw * LANES / 2, G.top + (hitNow - G.top) * .56), a = (.7 + .3 * Math.sin(ms / 420)) * fi;
      const txt = coarse ? i18n.t('playStartTouch') : i18n.t('playStart', { keys: keys.codes.map(keyLabel).join(' ') });
      ctx.save(); ctx.globalAlpha = hm * a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (nt) {
        ctx.font = `italic 600 ${24 * big}px ${F.gar}`; ctx.fillStyle = '#EDE6E1'; ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 10;
        ctx.fillText(txt, c.x, c.y);
      } else {
        ctx.font = `900 ${17 * big}px ${F.sans}`; ctx.letterSpacing = '3px';
        ctx.lineJoin = 'round'; ctx.lineWidth = 7 * big; ctx.strokeStyle = '#FFFFFF'; ctx.strokeText(txt, c.x, c.y);
        ctx.fillStyle = '#1C2030'; ctx.fillText(txt, c.x, c.y);
      }
      ctx.restore();
    }
  }

  /* ---------- input ---------- */
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const pointers = new Map<number, number>();
  // touch activation can dirty style; do not synchronously read layout on every press or slide
  let inputRect: DOMRect | null = null;
  const inputBounds = () => inputRect ??= inputEl.getBoundingClientRect();
  function laneAt(e: PointerEvent): number | 'off' | null {
    const r = inputBounds();
    const q = unproj((e.clientX - r.left) / L.s, (e.clientY - r.top) / L.s), g = G;
    if (q.x < g.R.x || q.x > g.R.x + g.R.w || q.y < g.R.y || q.y > g.R.y + g.R.h) return 'off';
    // (beside the lanes, on the rim, counts for the lane nearest it)
    if (q.y < g.top + (hitNow - g.top) * .3) return null;
    return clamp(Math.floor((q.x - g.lx0) / g.lw), 0, LANES - 1);
  }
  function pdown(e: PointerEvent) {
    if (m < 1 || dir < 0) return;
    const l = laneAt(e);
    if (l === 'off') { close(); return; }
    if (ended) { e.preventDefault(); dismiss(); return; }
    if (l === null) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, l);
    if (!transport.playing) void startWith(l);
    else void press(l);
  }
  /* a finger (or a mouse held down) that slides along the highway takes its lane with it: crossing into the next lane
     lets go of the last one (a hold there ends as if lifted) and presses this one, so notes can be struck by sliding.
     it changes lane only once SLIDE past the line between them, so a finger resting on that line doesn't flicker; a
     quick slide presses each lane it crosses in turn; off the highway it keeps the lane it had */
  const SLIDE = .15;
  function pmove(e: PointerEvent) {
    let l = pointers.get(e.pointerId);
    if (l === undefined || m < 1 || dir < 0 || ended) return;
    const r = inputBounds(), g = G;
    const evs = e.getCoalescedEvents?.() ?? [];
    for (const ev of evs.length ? evs : [e]) {
      const q = unproj((ev.clientX - r.left) / L.s, (ev.clientY - r.top) / L.s);
      if (q.x < g.R.x || q.x > g.R.x + g.R.w || q.y < g.R.y || q.y > g.R.y + g.R.h) continue;
      const x = (q.x - g.lx0) / g.lw;
      while (x > l + 1 + SLIDE && l < LANES - 1) l = slide(e.pointerId, l, l + 1);
      while (x < l - SLIDE && l > 0) l = slide(e.pointerId, l, l - 1);
    }
  }
  function slide(id: number, from: number, to: number) {
    pointers.set(id, to);
    if (![...pointers.values()].includes(from)) release(from);
    void press(to, undefined, true);
    return to;
  }
  /** (a lane another finger is still on stays down) */
  function pup(e: PointerEvent) {
    const l = pointers.get(e.pointerId);
    if (l === undefined) return;
    pointers.delete(e.pointerId);
    if (![...pointers.values()].includes(l)) release(l);
  }

  async function start() { dismiss(); await engine.unlock(); if (!transport.playing) await transport.play(); }
  function toggle() { if (ended) dismiss(); else if (transport.playing) transport.pause(); else void start(); }
  /** a lane pressed while paused plays the song and counts as that lane's press at the moment it starts, so a note on
      the very first beat can be hit */
  async function startWith(lane: number) {
    const from = transport.now();
    down[lane] = true;
    await start();
    if (down[lane]) void press(lane, Math.max(from, transport.now()));
  }
  /** the lane whose key is being changed (the panel's key row, on a computer): the next key pressed becomes its key */
  let binding = $state<number | null>(null);
  function onkeydown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (binding !== null) {
      e.preventDefault();
      if (e.key === 'Escape') binding = null;
      else if (!e.repeat && keys.can(e.code)) {
        keys.set(binding, e.code); binding = null;
        // a lane held down meanwhile would never hear its key come up
        for (let i = 0; i < LANES; i++) if (down[i]) release(i);
      }
      return;
    }
    const l = keys.lane(e.code);
    if (l >= 0) {
      e.preventDefault();
      /* a key already down is never pressed again: Chromium (Windows before 138, Linux X11 before 139; Cent Browser is
         134) sends the auto-repeats of the last key pressed while another is held with repeat unset, so half a second
         into a hold played with two keys down, the press found no note and tapped */
      if (e.repeat || keysDown.has(e.code)) return;
      keysDown.add(e.code);
      if (m < 1 || dir < 0) return;
      if (ended) dismiss();
      else if (!transport.playing) void startWith(l);
      else void press(l);
      return;
    }
    switch (e.key) {
      case 'Escape': e.preventDefault(); close(); break;
      case ' ': e.preventDefault(); if (!e.repeat) toggle(); break;
      case 'ArrowLeft': e.preventDefault(); transport.seek(transport.now() - 5); reset(); break;
      case 'ArrowRight': e.preventDefault(); transport.seek(transport.now() + 5); reset(); break;
      case '[': e.preventDefault(); speed.nudge(-1); break;
      case ']': e.preventDefault(); speed.nudge(1); break;
    }
  }
  function onkeyup(e: KeyboardEvent) { keysDown.delete(e.code); const l = keys.lane(e.code); if (l >= 0) release(l); }
  /** the keys down (by code); a key let go while the page was away never comes up, so leaving forgets them */
  const keysDown = new Set<string>();
  function onblur() { keysDown.clear(); for (let i = 0; i < LANES; i++) if (down[i] && ![...pointers.values()].includes(i)) release(i); }
  /** a click anywhere but the key row stops waiting for a key */
  function anyDown(e: PointerEvent) { if (binding !== null && !(e.target as Element | null)?.closest?.('.keys')) binding = null; }

  function close() { if (dir >= 0) dir = -1; }

  onMount(() => {
    // while play mode is open nothing on the page can be selected: on an iPhone, holding a long note otherwise started a
    // text selection that spread blue over the whole page (Safari and the home-screen app alike)
    const root = document.documentElement, noSelect = (e: Event) => e.preventDefault();
    root.classList.add('ut-noselect');
    document.addEventListener('selectstart', noSelect);
    // and iOS Safari only gives up its long-press gestures when the touch itself is cancelled (play goes by pointer
    // events, which still arrive); the listener must not be passive, so it is added here rather than in the markup
    inputEl.addEventListener('touchstart', noSelect, { passive: false });
    const refreshInput = () => { inputRect = inputEl.getBoundingClientRect(); };
    const inputSize = new ResizeObserver(refreshInput);
    inputSize.observe(inputEl);
    window.addEventListener('resize', refreshInput);
    window.addEventListener('scroll', refreshInput, true);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', refreshInput);
    viewport?.addEventListener('scroll', refreshInput);
    refreshInput();
    getSelection()?.removeAllRanges();
    hook();
    transport.setGuide(null);
    transport.once = true; transport.onEnd = finish;
    // the band keeps playing the part while the window tips in (no press counts until it has); the player takes over
    // from the first note after that, so entering mid-song leaves no silent gap in the tune
    const handover = transport.playing ? transport.now() + IN / 1000 + .03 : -Infinity;
    const mine = new Map([...chart.skip].map(([k, v]) => [k, new Set(v)]));
    notes.forEach((n, i) => { if (n.t < handover) { judged[i] = 3; const s = mine.get(n.part)!; for (const j of n.notes) s.delete(j); for (const a of n.after) s.delete(a.i); } });
    theirs = mine;
    transport.setSkip(AUTO || playopts.exact ? null : theirs);
    // CSS remains a bounded comparison path, enabled explicitly rather than selected by device
    const query = new URLSearchParams(location.search), diagnostic = query.has('perf');
    const flat = (window as unknown as { __ourtoneFlat?: boolean }).__ourtoneFlat || (diagnostic && query.get('playRenderer') === 'css');
    warp = flat ? null : getWarp(() => { if (warp) { warp.canvas.remove(); warp = null; gl = false; overSig = ''; if (artImg) { artCv.width = Math.round(G.PWc * PR.x); artCv.height = Math.round(G.PHc * PR.y); paintArt(smooth(seg(m, .25, 1)), 1 - smooth(seg(m, 0, .35))); } } });
    if (warp) { const c = warp.canvas; c.className = 'hw'; c.style.cssText = `position:absolute;left:0;top:0;z-index:13;pointer-events:none;width:${L.W}px;height:${L.H}px`; hwBox.after(c); }
    gl = !!warp;
    // an iPhone or iPad (trackpad or not) draws the highway with the retained GPU renderer, the one found smoother and
    // cooler there; everything else keeps the canvas path it played well on. ?playRenderer=canvas|gpu|retained overrides
    const renderer = query.get('playRenderer');
    const touchApple = navigator.maxTouchPoints > 1 && /Mac|iPad|iPhone/.test(navigator.platform);
    const gpuChoice = renderer === 'canvas' ? false : (renderer === 'gpu' || renderer === 'retained') ? true : (window as unknown as { __ourtoneGPU?: boolean }).__ourtoneGPU;
    const retained = renderer === 'retained' || (!renderer && touchApple);
    if (warp && (gpuChoice ?? (touchApple && !warp.software))) warp.enableGPU(retained);
    const stage = plane.parentElement!, background: Element[] = [];
    const foreground = new Set<Element>([scrim, glow, hwBox, plane, ov, inputEl, hud]);
    if (warp) foreground.add(warp.canvas);
    if (diagnostic) for (const el of stage.children) if (!foreground.has(el)) {
      el.setAttribute('data-play-background', ''); background.push(el);
    }
    let savedIR: AudioBuffer | null = null;
    const changeProbe = (choice: Probe) => {
      if (savedIR && engine.bus?.convolver.buffer === null) engine.bus.convolver.buffer = savedIR;
      savedIR = null; probe = choice; probeScale = choice === 'resolution' || lightProbe(choice) ? .65 : 1;
      root.classList.toggle('ut-perf-stage-off', choice === 'stage' || lightProbe(choice));
      visualClock.reset(); pacedClock.reset(); overSig = '';
      if (choice === 'reverb' && engine.bus) { savedIR = engine.bus.convolver.buffer; engine.bus.convolver.buffer = null; }
      // stale effects must not sit over the next frame when that pass is disabled
      ov.style.visibility = effectsOff() ? 'hidden' : '';
    };
    if (diagnostic) changeProbe(probe);
    const perf = playPerf(renderStats, changeProbe);

    let raf = 0, last = transport.now(), lastMs = performance.now(), done = false;
    const loop = (frameTime: number) => {
      // (the picture's time: see transport.shown)
      const ms = performance.now(), dt = Math.min(.1, (ms - lastMs) / 1000), now = transport.now(), rawSeen = transport.shown();
      const seen = probe === 'paced' ? pacedClock.sample(rawSeen, frameTime, transport.playing) :
        probe === 'clock' ? visualClock.sample(rawSeen, frameTime, transport.playing) : rawSeen;
      pictureOffsetMs = (seen - rawSeen) * 1000;
      lastMs = ms;
      if (dir > 0) m = Math.min(1, m + dt * 1000 / IN);
      else if (dir < 0) m = Math.max(0, m - dt * 1000 / OUT);
      // the song came round again (or jumped back): every note is new again; a jump forward passes notes, never misses them
      if (now < last - .3) reset();
      else if (now > last + .5) while (next < notes.length && notes[next].t < now - WINDOW) { if (!judged[next]) judged[next] = 3; next++; }
      last = now;
      if (AUTO && transport.playing && m >= 1 && dir >= 0) {
        for (let i = next; i < notes.length && notes[i].t <= now; i++) if (!judged[i]) autoHit(i, now);
        for (let j = autoUp.length - 1; j >= 0; j--) if (autoUp[j].at <= now) { const l = autoUp[j].lane; autoUp.splice(j, 1); if (!autoUp.some(u => u.lane === l)) release(l); }
      }
      while (next < notes.length && notes[next].t < now - WINDOW) {
        if (!judged[next]) {
          if (transport.playing && m >= 1) { judged[next] = 2; combo = 0; judge = { k: 'miss', at: ms }; tally.miss++; }
          else judged[next] = 3;
        }
        next++;
      }
      for (let l = 0; l < LANES; l++) {
        const target = down[l] ? 1 : 0;
        env[l] += (target - env[l]) * (1 - Math.exp(-dt / (target ? .04 : .2)));
        flash[l] *= Math.exp(-dt / .16);
        const h = holding[l];
        if (h >= 0 && now >= notes[h].hold) holdEnd(l, 'perfect');
      }
      if (ended && m >= 1 && dir >= 0) {
        const e = ms - ended.at;
        for (let l = 0; l < LANES; l++) if (!swept[l] && e >= 70 * l) { swept[l] = 1; flash[l] = 1; burst(l, false); }
      }
      if (dur > 0) fillEl.style.transform = `scaleX(${clamp(seen / dur, 0, 1)})`;
      if (Math.floor(seen) !== sec) sec = Math.floor(seen);
      if (ready) {
        const M = matrix(m);
        setH(M);
        const fm = smooth(seg(m, .25, 1));
        // the window's frame and labels fade as it tips, and then leave the plane altogether (see fadeOut)
        const so = 1 - smooth(seg(m, 0, .35));
        overSvg.style.opacity = String(so);
        overSvg.style.display = so > 0 ? '' : 'none';
        // with WebGL the CSS plane carries only the labels, and only while they show
        if (!warp || so > 0) plane.style.transform = M.toString();
        plane.style.visibility = warp && so <= 0 ? 'hidden' : 'visible';
        if (!warp && (fm !== artFade || (ownImg && so !== ownFade))) paintArt(fm, so);
        scrim.style.opacity = String(smooth(m));
        glow.style.opacity = String(smooth(seg(m, .3, 1)));
        hud.style.opacity = String(smooth(seg(m, .7, 1)));
        hud.style.pointerEvents = m >= 1 && dir >= 0 ? 'auto' : 'none';
        const c = proj(G.lx0 + G.lw * LANES / 2, G.top + (G.hit1 - G.top) * .2);
        glow.style.transform = `translate(${c.x}px, ${c.y}px)`;
        if (warp) {
          const cw = Math.round(L.W * RES), ch = Math.round(L.H * RES), hw = warp.canvas;
          if (hw.width !== cw || hw.height !== ch) { hw.width = cw; hw.height = ch; }
        }
        warp?.beginFrame();
        try { draw(ended ? ended.t : seen, ms, M); warp?.finishNotes(); }
        catch (e) {
          if (!warp?.gpu) throw e;
          console.warn('play mode GPU drawing failed; using canvas', e);
          warp.disableGPU(); overSig = ''; draw(ended ? ended.t : seen, ms, M);
        }
        try {
          if (!effectsOff()) {
            drawOver(ms, dt);
            if (warp?.gpu) warp.prepareOverlay();
          } else {
            // discard expired particles without issuing the effects pass
            for (let i = sparks.length - 1; i >= 0; i--) if (ms - sparks[i].at >= sparks[i].life) sparks.splice(i, 1);
          }
        } catch (e) {
          if (!warp?.gpu) throw e;
          console.warn('play mode GPU effects failed; using canvas', e);
          warp.disableGPU(); overSig = ''; draw(ended ? ended.t : seen, ms, M); drawOver(ms, 0);
        }
        // Complete offscreen work before touching the display attachment. The highway
        // and effects now share one uninterrupted screen pass on tile-based GPUs.
        if (warp) {
          if (!warp.draw(warp.gpu ? null : cv, M, G.PWc, G.PHc, L.W, L.H, fm, so, fadeK)) { cssPlane(); paintArt(fm, so); fadeOut(cv.getContext('2d')!, fm); }
          else if (warp.gpu && !effectsOff()) warp.compositeOverlay();
        } else fadeOut(cv.getContext('2d')!, fm);
      }
      warp?.endFrame();
      perf?.frame(frameTime, ms, performance.now() - ms, now, rawSeen, seen, transport.playing, probe === 'paced' ? pacedClock.stats().stepMs : undefined);
      if (dir < 0 && m <= 0 && !done) { done = true; onexit(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      perf?.dispose();
      if (savedIR && engine.bus?.convolver.buffer === null) engine.bus.convolver.buffer = savedIR;
      root.classList.remove('ut-perf-stage-off');
      background.forEach(el => el.removeAttribute('data-play-background'));
      cancelAnimationFrame(raf); transport.setSkip(null); warp?.rest(); warp = null;
      transport.once = false; transport.onEnd = null;
      root.classList.remove('ut-noselect'); document.removeEventListener('selectstart', noSelect);
      inputEl.removeEventListener('touchstart', noSelect);
      inputSize.disconnect();
      window.removeEventListener('resize', refreshInput);
      window.removeEventListener('scroll', refreshInput, true);
      viewport?.removeEventListener('resize', refreshInput);
      viewport?.removeEventListener('scroll', refreshInput);
    };
  });
</script>

<svelte:window {onkeydown} {onkeyup} {onblur} onpointerdowncapture={anyDown} />

<div class="scrim" class:night bind:this={scrim}></div>
<div class="glow" class:night bind:this={glow}></div>
<!-- the shared WebGL canvas (warp.ts) goes in here -->
<div class="hwbox" bind:this={hwBox} hidden></div>
<div class="plane" class:gl bind:this={plane} style="width:{G.PWc}px;height:{G.PHc}px">
  <canvas class="art" bind:this={artCv} style="width:{G.PWc}px;height:{G.PHc}px"></canvas>
  <svg bind:this={overSvg} width={G.PWc} height={G.PHc} viewBox="{G.Rl.x} {G.Rl.y} {G.Rl.w} {G.Rl.h}" preserveAspectRatio="none" aria-hidden="true"></svg>
  <canvas bind:this={cv} style="width:{G.PWc}px;height:{G.PHc}px"></canvas>
</div>
<canvas class="over" bind:this={ov} style="width:{L.W}px;height:{L.H}px" aria-hidden="true"></canvas>
<div class="input" bind:this={inputEl} role="application" aria-label={i18n.t('playMode')} onpointerdown={pdown} onpointermove={pmove} onpointerup={pup} onpointercancel={pup} oncontextmenu={(e) => e.preventDefault()}></div>
<div class="hud" class:night class:compact={L.compact} bind:this={hud} style="--x:{L.compact ? L.safe.l + 22 : 58}px;--y:{L.compact ? 62 : 96}px">
  <div class="who">
    {#if multi}
      <div class="chips">
        {#each PS as p (p.index)}<PartChip icon={p.data.icon} color={partColor(theme.pal, p.data.color)} size={L.compact ? 24 : 30} />{/each}
      </div>
    {:else}
      <PartChip icon={P.data.icon} color={partColor(theme.pal, P.data.color)} size={L.compact ? 30 : 40} />
    {/if}
    <div class="tx">
      {#if multi && L.compact}
        <!-- (a phone's top bar marks its room just over the first line: the names go under it) -->
        <span class="nm">{i18n.t('multiParts', { n: PS.length })}</span>
        <span class="sg many">{PS.map(p => i18n.pick(p.data.name)).join(' + ')} · {i18n.pick(song.data.title)}</span>
      {:else if multi}
        <span class="nm many">{PS.map(p => i18n.pick(p.data.name)).join(' + ')}</span>
        <span class="sg">{i18n.pick(song.data.title)} · {i18n.t('multiParts', { n: PS.length })}</span>
      {:else}
        <span class="nm">{i18n.pick(P.data.name)}</span>
        <span class="sg">{i18n.pick(song.data.title)} · {i18n.pick(P.data.inst)}</span>
      {/if}
    </div>
  </div>
  <div class="act">
    <button class="pp" onclick={toggle} aria-label={transport.playing ? i18n.t('pause') : i18n.t('play')}>
      {#if transport.playing}
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5.5v13l10-6.5Z" fill="currentColor" /></svg>
      {/if}
    </button>
    <button class="back" onclick={close}>{i18n.t('playBack')}</button>
  </div>
  <div class="prog">
    <span class="tm">{fmtTime(sec)}<i>/ {fmtTime(dur)}</i></span>
    <div class="bar" role="slider" tabindex="-1" aria-label={i18n.t('seek')} aria-valuemin="0" aria-valuemax={Math.round(dur)} aria-valuenow={sec}
      onpointerdown={(e) => { seeking = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); seekAt(e); }}
      onpointermove={(e) => { if (seeking) seekAt(e); }} onpointerup={() => (seeking = false)} onpointercancel={() => (seeking = false)}>
      <div class="track"><div class="fill" bind:this={fillEl}></div></div>
    </div>
  </div>
  <svg class="spd" width="200" height="32" aria-label={i18n.t('speedLabel')}><SpeedControl L={speedL} /></svg>
  <!-- quick runs and rolled chords as one press, or every note its own -->
  <div class="exact" title={i18n.t('simplifyHint')}>
    <span class="kl">{i18n.t('simplify')}</span>
    <Toggle on={playopts.simplify} label={i18n.t('simplify')} onchange={setSimplify} />
  </div>
  <!-- the song as written, whatever is pressed -->
  <div class="exact" title={i18n.t('exactHint')}>
    <span class="kl">{i18n.t('exact')}</span>
    <Toggle on={playopts.exact} label={i18n.t('exact')} onchange={setExact} />
  </div>
  <!-- a sound of its own on a hit: off, 1, 2 or 3 (each heard as it is picked), and while one is on, its volume -->
  <div class="exact" title={i18n.t('keySoundsHint')}>
    <span class="kl">{i18n.t('keySounds')}</span>
    <Seg items={hitItems} value={String(playopts.hitSound)} onchange={(v) => pickHit(+v)} h={22} fs={night ? 13 : 11} pad={7} label={i18n.t('keySounds')} />
    {#if playopts.hitSound}
      <div class="vol" role="slider" tabindex="-1" aria-label={i18n.t('keySoundsVol')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(playopts.hitVol * 100)} title={i18n.t('keySoundsVol')}
        onpointerdown={volDown} onpointermove={(e) => { if (volDrag) volAt(e); }} onpointerup={volUp} onpointercancel={volUp}>
        <div class="vt"><div class="vf" style="width:{playopts.hitVol * 100}%"></div></div>
        <div class="vk" style="left:calc(6px + {playopts.hitVol} * (100% - 12px))"></div>
      </div>
    {/if}
  </div>
  {#if !coarse}
    <!-- the six keys: click one, then press the key to use instead -->
    <div class="keys" role="group" aria-label={i18n.t('playKeys')} title={i18n.t('keysHint')}>
      <span class="kl">{i18n.t('playKeys')}</span>
      <div class="caps">
        {#each keys.codes as c, l (l)}
          <button class="cap" class:on={binding === l} aria-pressed={binding === l} aria-label="{i18n.t('keysLane', { n: l + 1 })}: {keyLabel(c)}"
            onclick={() => (binding = binding === l ? null : l)}>{binding === l ? '' : keyLabel(c)}</button>
        {/each}
      </div>
      {#if binding !== null}<span class="kx">{i18n.t('keysPress')}</span>
      {:else if keys.custom}<button class="kx reset" onclick={() => keys.reset()}>{i18n.t('keysReset')}</button>{/if}
    </div>
  {/if}
</div>

<style>
  .scrim { position: absolute; inset: 0; z-index: 12; opacity: 0; pointer-events: none; background: rgba(246, 249, 253, .66); }
  .scrim.night { background: radial-gradient(ellipse 60% 70% at 55% 45%, rgba(26, 10, 16, .55), rgba(5, 4, 7, .78)); }
  .glow {
    position: absolute; left: -500px; top: -380px; width: 1000px; height: 760px; z-index: 12; opacity: 0; pointer-events: none;
    background: radial-gradient(closest-side, rgba(255, 255, 255, .95), rgba(214, 236, 252, .5) 45%, rgba(214, 236, 252, 0));
  }
  .glow.night { background: radial-gradient(closest-side, rgba(150, 30, 52, .42), rgba(110, 20, 36, .18) 50%, rgba(110, 20, 36, 0)); }
  .plane { position: absolute; left: 0; top: 0; z-index: 13; transform-origin: 0 0; visibility: hidden; pointer-events: none; }
  .plane canvas, .plane svg { position: absolute; left: 0; top: 0; }
  /* drawn by WebGL instead: the plane's canvases are only painted on, never shown */
  .plane.gl canvas { display: none; }
  .over { position: absolute; left: 0; top: 0; z-index: 14; pointer-events: none; }
  .input { position: absolute; inset: 0; z-index: 14; touch-action: none; -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  :global(.ut-noselect), :global(.ut-noselect *) { -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important; }
  .hud {
    position: absolute; left: var(--x); top: var(--y); z-index: 15; opacity: 0; pointer-events: none;
    display: flex; flex-direction: column; align-items: flex-start; gap: 16px;
  }
  /* a veil behind the panel, so its words and controls stand clear of the stage's own titles beneath */
  .hud::before {
    content: ''; position: absolute; z-index: -1; pointer-events: none;
    left: calc(-1 * var(--x)); top: calc(-1 * var(--y)); width: calc(var(--x) + 360px); height: calc(var(--y) + 100% + 80px);
    background: linear-gradient(90deg, rgba(246, 249, 253, .94) 62%, rgba(246, 249, 253, 0));
    -webkit-mask-image: linear-gradient(180deg, #000 calc(100% - 64px), transparent); mask-image: linear-gradient(180deg, #000 calc(100% - 64px), transparent);
  }
  .hud.night::before { background: linear-gradient(90deg, rgba(7, 5, 9, .9) 62%, rgba(7, 5, 9, 0)); }
  .hud.compact::before { width: calc(var(--x) + 270px); }
  .who { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .tx { display: flex; flex-direction: column; min-width: 0; }
  .chips { display: flex; gap: 6px; flex: none; }
  .nm.many { max-width: 340px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sg.many { max-width: 190px; }
  .nm { font: 900 22px/1.2 var(--f-serif); color: var(--ink); letter-spacing: .04em; }
  .sg { font: 600 12px/1.5 var(--f-sans); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .night .nm { font: 800 23px/1.2 var(--f-title); }
  .night .sg { font: italic 600 15px/1.4 var(--f-gar); color: var(--orn); }
  .act { display: flex; align-items: center; gap: 10px; }
  .act button { height: 36px; display: inline-flex; align-items: center; justify-content: center; }
  .pp { width: 36px; border-radius: 18px; color: #FFFFFF; background: var(--accent); box-shadow: 0 0 0 3px #FFFFFF, 2px 4px 0 3px rgba(28, 32, 48, .14); }
  .back { padding: 0 16px; border-radius: 18px; font: 800 12px/1 var(--f-sans); letter-spacing: 1px; color: var(--ink); background: #FFFFFF; box-shadow: inset 0 0 0 2px var(--ink), 2px 4px 0 0 rgba(28, 32, 48, .14); }
  .back:hover { color: var(--accent); box-shadow: inset 0 0 0 2px var(--accent), 2px 4px 0 0 rgba(28, 32, 48, .14); }
  .night .pp { border-radius: 0; background: #C4293E; box-shadow: 0 0 0 1px rgba(216, 180, 106, .7); }
  .night .back { border-radius: 0; color: var(--orn); background: rgba(11, 10, 14, .7); box-shadow: inset 0 0 0 1px rgba(216, 180, 106, .55); font-family: var(--f-serif); }
  .night .back:hover { color: #FFF3EE; box-shadow: inset 0 0 0 1px #D8B46A; }
  .prog { display: flex; flex-direction: column; gap: 2px; width: 220px; }
  .tm { font: italic 900 14px/1.2 var(--f-disp); font-stretch: 112%; color: var(--ink); font-variant-numeric: tabular-nums; }
  .tm i { font-style: inherit; color: var(--muted); margin-left: .35em; }
  .night .tm { font: 700 17px/1.2 var(--f-gar); color: #EDE6E1; }
  .night .tm i { color: var(--orn); }
  .bar { height: 20px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
  .track { width: 100%; height: 4px; border-radius: 2px; background: rgba(28, 32, 48, .14); overflow: hidden; }
  .fill { width: 100%; height: 100%; background: var(--accent); transform-origin: 0 50%; transform: scaleX(0); }
  .night .track { height: 2px; border-radius: 0; background: rgba(216, 180, 106, .28); }
  .night .fill { background: #D8B46A; }
  .spd { overflow: visible; margin-top: -6px; }
  .exact { display: flex; align-items: center; gap: 12px; margin-top: -8px; white-space: nowrap; }
  /* the key row: set like the note speed's label, then six small caps (a gap between the hands) */
  .keys { display: flex; align-items: center; gap: 12px; margin-top: -8px; white-space: nowrap; }
  .kl { font: 700 12px/1 var(--f-sans); letter-spacing: 1.5px; color: var(--muted); }
  .caps { display: flex; gap: 3px; }
  .cap {
    width: 20px; height: 22px; padding: 0; border-radius: 5px; font: 800 11px/1 var(--f-sans); color: var(--ink);
    background: #FFFFFF; box-shadow: inset 0 0 0 1.3px var(--muted); cursor: pointer; transition: color .15s, background .15s, box-shadow .15s;
  }
  .cap:nth-child(4) { margin-left: 6px; }
  /* the key sounds' volume: a short slot, filled to the level, with a round cap (a square one by night) */
  .vol { position: relative; width: 64px; height: 20px; flex: none; cursor: pointer; touch-action: none; }
  .vt { position: absolute; left: 6px; right: 6px; top: 8.5px; height: 3px; border-radius: 2px; background: #D5DCE6; overflow: hidden; }
  .vf { height: 100%; background: var(--accent); }
  .vk { position: absolute; top: 4px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 0 0 1.5px var(--accent), 0 1px 3px rgba(28, 32, 48, .2); }
  .night .vt { border-radius: 0; background: rgba(237, 230, 225, .2); }
  .night .vf { background: #C4293E; }
  .night .vk { border-radius: 0; transform: rotate(45deg) scale(.85); background: #FFF3EE; box-shadow: 0 0 0 1px #D8B46A; }
  .cap:hover { color: var(--accent); box-shadow: inset 0 0 0 1.3px var(--accent); }
  .cap.on { background: var(--accent); box-shadow: inset 0 0 0 1.3px var(--accent); animation: wait 1s ease-in-out infinite; }
  @keyframes wait { 50% { opacity: .45; } }
  .kx { font: 700 11px/1 var(--f-sans); letter-spacing: .5px; color: var(--muted); }
  .kx.reset { padding: 4px 0; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: rgba(28, 32, 48, .25); }
  .kx.reset:hover { color: var(--accent); }
  .night .kl { font: 600 15px/1 var(--f-gar); letter-spacing: .3px; }
  .night .cap { border-radius: 0; font: 600 14px/1 var(--f-gar); color: #D8B46A; background: rgba(11, 10, 14, .7); box-shadow: inset 0 0 0 1px rgba(216, 180, 106, .45); }
  .night .cap:hover { color: #FFF3EE; box-shadow: inset 0 0 0 1px #D8B46A; }
  .night .cap.on { background: #C4293E; box-shadow: inset 0 0 0 1px rgba(216, 180, 106, .7); }
  .night .kx { font: italic 600 14px/1 var(--f-gar); letter-spacing: 0; color: var(--orn); }
  .night .kx.reset { text-decoration-color: rgba(216, 180, 106, .35); }
  .night .kx.reset:hover { color: #FFF3EE; }
  .compact .prog { width: 180px; }
  .compact .nm { font-size: 16px; }
  .compact .sg { font-size: 11px; }
  .compact { gap: 10px; }
  .compact .act button { height: 32px; }
  .compact .pp { width: 32px; }
</style>
