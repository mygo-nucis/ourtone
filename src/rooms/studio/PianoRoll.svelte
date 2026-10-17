<script lang="ts">
  import { untrack } from 'svelte';
  import { studio, isDrums } from '../../lib/project/studio.svelte';
  import type { Note } from '../../lib/project/doc';
  import { lastTick } from '../../lib/project/ops';
  import { transport } from '../../lib/audio/transport.svelte';
  import { engine } from '../../lib/audio/engine';
  import { theme } from '../../lib/state/theme.svelte';
  import { fonts } from '../../lib/state/fonts.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { drawRoll } from './draw-track';
  import { harmony } from './harmony.svelte';
  import { homeOf } from './playkeys.svelte';
  import { KW, type RollView } from './track.svelte';
  import { refOf } from './reference';

  /* the piano roll.
     ruler: the upper half moves the cursor (click or drag), the lower half selects a stretch of time.
     the cursor (the playhead) can also be grabbed anywhere and dragged.
     pen: click to write a note, drag for its length. select: click or box notes, drag to move them (Alt copies),
     drag a note's end for its length. eraser: sweep notes away. with snap off, notes go exactly where you put them.
     the key column plays pitches; the velocity lane takes drags (notes that start together fan out);
     the overview at the bottom scrolls the whole part. */
  let { view, W, s }: { view: RollView; W: number; s: number } = $props();
  let cv: HTMLCanvasElement, head: HTMLDivElement;
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  let marquee = $state.raw<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  let hoverP = $state<number | null>(null);
  let cursor = $state('default');

  const part = $derived.by(() => { void studio.rev; return studio.doc?.parts[studio.part] ?? null; });
  const drums = $derived(part ? isDrums(part.meta) : false);
  const song = $derived(transport.song);
  const home = $derived.by(() => { void studio.rev; const p = song?.parts[studio.part]; return p && song ? homeOf(p, song.data.key.tonic) : 60; });
  const GX0 = KW;
  const GX1 = $derived(W - 8);
  $effect(() => { view.width = GX1 - GX0; });
  /** notes that start together, spread a few pixels apart in the velocity lane */
  const fan = $derived.by(() => {
    void studio.rev;
    const m = new Map<Note, number>(), ns = part?.notes ?? [];
    for (let i = 0; i < ns.length;) {
      let j = i + 1;
      while (j < ns.length && ns[j].t - ns[i].t <= 3) j++;
      const k = j - i;
      if (k > 1) { const grp = ns.slice(i, j).sort((a, b) => a.p - b.p); grp.forEach((n, q) => m.set(n, (q - (k - 1) / 2) * 5)); }
      i = j;
    }
    return m;
  });
  const range = $derived(studio.range && studio.range.parts.includes(studio.part) ? { a: studio.range.a, b: studio.range.b } : null);
  const loopT = $derived.by(() => { const sg = transport.song, lp = transport.loop; return sg && lp ? { a: sg.tl.tick(lp.a), b: sg.tl.tick(lp.b) } : null; });

  $effect(() => {
    void studio.rev; void fonts.version;
    const d = studio.doc, g = studio.grid, ep = part;
    if (!d || !g || !ep || !cv) return;
    const k = s * dpr, w = Math.round(W * k), h = Math.round(view.H * k);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const ri = refOf(), ref = ri >= 0 ? d.parts[ri] ?? null : null;
    drawRoll(ctx, {
      th: theme.pal, v: view, W, grid: g, part: ep, ref, drums, key: d.meta.key, home, chords: harmony().chords,
      picked: studio.picked, noteGrid: studio.gridTicks(), notation: studio.notation, range, loop: loopT, loopOn: transport.loopOn, fan,
      marquee, hoverP, total: Math.max(g.tickOf(Math.min(g.bars.length, g.barAt(lastTick(d)) + 1)), 1),
      labels: [i18n.t('laneChords'), i18n.t('laneVelocity'), i18n.t('laneWhole')], lang: i18n.lang
    });
  });

  /* the cursor */
  $effect(() => {
    let raf = 0;
    const f = () => {
      const sg = transport.song;
      if (sg && head) {
        const t = sg.tl.tick(transport.shown()), x = GX0 + view.xOf(t);
        head.style.transform = `translateX(${x}px)`;
        head.style.opacity = x < GX0 - 2 || x > GX1 + 2 ? '0' : '1';
        if (transport.playing && studio.follow && !busy && (x > GX1 - (GX1 - GX0) * .1 || x < GX0)) untrack(() => { view.x0 = Math.max(0, t - (view.width * .08) / view.ppt); });
      }
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  });

  /* ---------- geometry ---------- */
  const R = $derived(view.R);
  function local(e: PointerEvent | MouseEvent | WheelEvent) {
    const r = cv.getBoundingClientRect(), k = W / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }
  const g = () => studio.gridTicks();
  /** onto the grid, or exactly where it is with snap off */
  const snap = (t: number, how: 'round' | 'floor' | 'ceil' = 'round') => studio.snapOn ? Math.max(0, Math[how](t / g()) * g()) : Math.max(0, Math.round(t));
  const minLen = () => studio.snapOn ? g() / 2 : 12;
  const tAt = (x: number) => view.tOf(x - GX0);
  const pAt = (y: number) => view.pAt(y - R.grid[0]);
  const X = (t: number) => GX0 + view.xOf(t);
  const rowC = (p: number) => R.grid[0] + view.yOf(p) + view.rh / 2;
  const headX = () => X(studio.cursorTick());
  function hit(x: number, y: number): { n: Note; edge: boolean } | null {
    if (!part) return null;
    let best: { n: Note; edge: boolean } | null = null;
    for (const n of part.notes) {
      const x0 = X(n.t), x1 = Math.max(x0 + 16, X(n.t + n.d));
      if (x < x0 - 2 || x > x1 + 2) continue;
      if (Math.abs(y - rowC(n.p)) > Math.max(6, view.rh / 2)) continue;
      best = { n, edge: x > x1 - 7 && x1 - x0 > 18 };
    }
    return best;
  }
  /** the velocity handle nearest the pointer: heads first (selected notes win ties), then stems */
  function velHit(x: number, y: number): Note | null {
    if (!part) return null;
    const VY0 = R.vel[0], VY1 = R.vel[1];
    let best: Note | null = null, bd = 14 * 14;
    for (const n of part.notes) {
      const nx = X(n.t) + 9 + (fan.get(n) ?? 0);
      if (Math.abs(nx - x) > 16) continue;
      const ny = VY1 - n.v / 127 * (VY1 - VY0), d2 = (nx - x) ** 2 + (ny - y) ** 2 - (studio.picked.has(n) ? 30 : 0);
      if (d2 < bd) { bd = d2; best = n; }
    }
    if (best) return best;
    let sd = 4;
    for (const n of part.notes) { const dx = Math.abs(X(n.t) + 9 + (fan.get(n) ?? 0) - x); if (dx < sd) { sd = dx; best = n; } }
    return best;
  }

  /* ---------- sound while editing ---------- */
  function audition(p: number, ms = 260) {
    void engine.unlock().then(() => {
      const v = transport.noteOn(studio.part, p, 96);
      setTimeout(() => v?.release((engine.ctx?.currentTime ?? 0) + .01), ms);
    });
  }

  let busy = false;
  function down(e: PointerEvent) {
    if (e.button !== 0 || !part || !studio.doc || !studio.grid) return;
    try { cv.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
    const p0 = local(e), r = R;
    const on = (move: (ev: PointerEvent) => void, up: (ev: PointerEvent) => void) => {
      busy = true;
      const m = (ev: PointerEvent) => move(ev);
      const u = (ev: PointerEvent) => { cv.removeEventListener('pointermove', m); cv.removeEventListener('pointerup', u); cv.removeEventListener('pointercancel', u); busy = false; up(ev); };
      cv.addEventListener('pointermove', m); cv.addEventListener('pointerup', u); cv.addEventListener('pointercancel', u);
    };
    /* move the cursor, pausing playback while it is dragged */
    const scrub = () => {
      const wasPlaying = transport.playing;
      if (wasPlaying) transport.pause();
      const set = (x: number) => studio.seekTick(snap(tAt(Math.max(GX0, Math.min(GX1, x)))));
      set(p0.x);
      on(ev => set(local(ev).x), () => { if (wasPlaying) void transport.play(); });
    };

    // ruler: the upper half moves the cursor, the lower half selects a stretch of time
    if (p0.y < r.ruler[1]) {
      if (p0.x < GX0) return;
      if (p0.y < r.ruler[1] / 2) { scrub(); return; }
      const t0 = tAt(p0.x);
      let moved = false;
      on(ev => {
        const x = local(ev).x;
        if (!moved && Math.abs(x - p0.x) < 4) return;
        moved = true;
        const t = tAt(x), a = snap(Math.min(t, t0), 'floor'), b = Math.max(snap(Math.max(t, t0), 'ceil'), a + (studio.snapOn ? g() : 20));
        studio.select({ parts: [studio.part], a, b });
        studio.pick(part.notes.filter(n => n.t >= a && n.t < b));
      }, () => { if (!moved) { studio.select(null); studio.pick([]); studio.seekTick(snap(t0)); } });
      return;
    }
    // the cursor itself, anywhere below the ruler
    if (p0.x >= GX0 && Math.abs(p0.x - headX()) <= 5 && p0.y < r.sep2) { scrub(); return; }
    // chord lane: move the cursor to the start of that bar
    if (p0.y < r.chords[1]) {
      if (p0.x < GX0) return;
      const gr = studio.grid;
      studio.seekTick(gr.tickOf(gr.barAt(tAt(p0.x))));
      return;
    }
    // overview: scroll the whole part
    if (p0.y > r.sep2) {
      const total = Math.max(1, studio.grid.tickOf(Math.min(studio.grid.bars.length, studio.grid.barAt(lastTick(studio.doc)) + 1)));
      const jump = (x: number) => { const t = (x - GX0) / (GX1 - GX0) * total; view.x0 = Math.max(0, t - view.width / view.ppt / 2); };
      jump(p0.x);
      on(ev => jump(local(ev).x), () => { /* done */ });
      return;
    }
    // velocity lane
    if (p0.y > r.sep1) {
      if (p0.x < GX0) return;
      const VY0 = r.vel[0], VY1 = r.vel[1], vel = (y: number) => Math.max(1, Math.min(127, Math.round((VY1 - y) / (VY1 - VY0) * 127)));
      const gest = studio.begin(studio.part);
      const first = velHit(p0.x, p0.y);
      const paint = studio.tool === 'pen';
      const targets = first && studio.picked.has(first) ? [...studio.picked] : first ? [first] : [];
      const v0 = new Map(targets.map(n => [n, n.v])), y0 = p0.y;
      const apply = (ev: PointerEvent) => {
        const p = local(ev);
        if (paint) { const n = velHit(p.x, p.y); if (n) n.v = vel(p.y); }
        else { const dv = Math.round((y0 - p.y) / (VY1 - VY0) * 127); targets.forEach(n => { n.v = Math.max(1, Math.min(127, v0.get(n)! + dv)); }); }
        studio.live(studio.part);
      };
      if (paint && first) { first.v = vel(p0.y); studio.live(studio.part); }
      on(apply, () => studio.commit(gest, 'opVelocity'));
      return;
    }
    // key column: play the pitch
    if (p0.x < GX0) { audition(pAt(p0.y), 400); return; }

    // the grid
    const t0 = tAt(p0.x), pitch0 = pAt(p0.y), h = hit(p0.x, p0.y);
    if (studio.tool === 'erase') {
      const gest = studio.begin(studio.part), gone = new Set<Note>();
      const sweep = (x: number, y: number) => { const k = hit(x, y); if (k && !gone.has(k.n)) { gone.add(k.n); part.notes = part.notes.filter(n => n !== k.n); studio.live(studio.part); } };
      sweep(p0.x, p0.y);
      on(ev => { const p = local(ev); sweep(p.x, p.y); }, () => { studio.picked = new Set([...studio.picked].filter(n => !gone.has(n))); studio.commit(gest, 'opDeleteNotes'); });
      return;
    }
    if (h) {
      const n = h.n;
      if (!studio.picked.has(n)) studio.pick(e.shiftKey ? [...studio.picked, n] : [n]);
      else if (e.shiftKey) { const s2 = new Set(studio.picked); s2.delete(n); studio.pick(s2); return; }
      const gest = studio.begin(studio.part);
      let targets = [...studio.picked];
      if (h.edge) {
        const d0 = new Map(targets.map(x => [x, x.d])), end0 = n.t + n.d;
        cursor = 'ew-resize';
        on(ev => {
          const dt = snap(tAt(local(ev).x)) - end0;
          targets.forEach(x => { x.d = Math.max(minLen(), d0.get(x)! + dt); });
          studio.live(studio.part);
        }, () => { cursor = 'default'; studio.commit(gest, 'opResizeNotes'); });
        return;
      }
      if (e.altKey) {
        const copies = targets.map(x => ({ ...x }));
        part.notes = part.notes.concat(copies);
        studio.pick(copies);
        targets = copies;
      }
      const orig = new Map(targets.map(x => [x, { t: x.t, p: x.p }])), n0 = orig.get(targets.includes(n) ? n : targets[0])!;
      let lastP = n.p, moved = false;
      on(ev => {
        const p = local(ev);
        if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < 3) return;
        moved = true;
        const dt = snap(n0.t + (tAt(p.x) - t0)) - n0.t, dp = drums ? 0 : pAt(p.y) - pitch0;
        const minT = Math.min(...[...orig.values()].map(o => o.t));
        const dtc = Math.max(-minT, dt);
        targets.forEach(x => { const o = orig.get(x)!; x.t = o.t + dtc; x.p = Math.max(0, Math.min(127, o.p + dp)); });
        studio.live(studio.part);
        const np = (targets.includes(n) ? n : targets[0]).p;
        if (np !== lastP) { lastP = np; audition(np, 180); }
      }, () => { studio.commit(gest, e.altKey ? 'opDuplicateNotes' : 'opMoveNotes'); });
      if (!e.altKey) audition(n.p, 200);
      return;
    }
    if (studio.tool === 'pen') {
      const gest = studio.begin(studio.part), t = snap(t0, 'floor');
      const note: Note = { t, d: g(), p: pitch0, v: 96 };
      part.notes = part.notes.concat([note]);
      studio.pick([note]);
      studio.live(studio.part);
      audition(note.p, 240);
      on(ev => { note.d = Math.max(studio.snapOn ? g() : minLen(), snap(tAt(local(ev).x), 'ceil') - note.t); studio.live(studio.part); }, () => { studio.commit(gest, 'opAddNote'); });
      return;
    }
    // on a touch screen, a finger on empty grid pans (there is no wheel)
    if (e.pointerType === 'touch') {
      let last = p0, moved = false;
      on(ev => {
        const p = local(ev);
        if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < 6) return;
        moved = true;
        view.x0 = Math.max(0, view.x0 - (p.x - last.x) / view.ppt);
        const rows = Math.trunc((p.y - last.y) / view.rh);
        if (rows) { view.scrollRows(rows); last = { x: p.x, y: last.y + rows * view.rh }; } else last = { x: p.x, y: last.y };
      }, () => { if (!moved) { studio.pick([]); studio.seekTick(snap(t0)); } });
      return;
    }
    // select tool on empty grid: a box selection, or a click that moves the cursor
    const add = e.shiftKey ? new Set(studio.picked) : new Set<Note>();
    let moved = false;
    on(ev => {
      const p = local(ev);
      if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < 4) return;
      moved = true;
      marquee = { x0: p0.x, y0: p0.y, x1: p.x, y1: p.y };
      const ta = tAt(Math.min(p0.x, p.x)), tb = tAt(Math.max(p0.x, p.x)), pa = pAt(Math.max(p0.y, p.y)), pb = pAt(Math.min(p0.y, p.y));
      const inside = part.notes.filter(n => n.t + n.d > ta && n.t < tb && n.p >= pa && n.p <= pb);
      studio.pick([...add, ...inside]);
    }, () => {
      marquee = null;
      if (!moved) { studio.pick(add); studio.seekTick(snap(t0)); }
    });
  }

  function move(e: PointerEvent) {
    if (busy || !part) return;
    const p = local(e);
    hoverP = p.x < GX0 && p.y > R.grid[0] && p.y < R.grid[1] ? pAt(p.y) : null;
    if (p.y < R.ruler[1]) { cursor = p.x < GX0 ? 'default' : p.y < R.ruler[1] / 2 ? 'ew-resize' : 'text'; return; }
    if (p.x >= GX0 && Math.abs(p.x - headX()) <= 5 && p.y < R.sep2) { cursor = 'ew-resize'; return; }
    if (p.y > R.grid[0] && p.y < R.grid[1] && p.x > GX0) {
      const h = hit(p.x, p.y);
      cursor = h?.edge ? 'ew-resize' : h ? 'grab' : studio.tool === 'pen' ? 'crosshair' : studio.tool === 'erase' ? 'cell' : 'default';
    } else cursor = p.y > R.sep1 && p.y < R.sep2 ? 'ns-resize' : 'default';
  }

  function wheel(e: WheelEvent) {
    const gr = studio.grid;
    if (!gr) return;
    e.preventDefault();
    const p = local(e);
    if (e.ctrlKey || e.metaKey) {
      const t = tAt(p.x), bar = gr.tickOf(1) || 1920;
      view.ppt = Math.max(20 / bar, Math.min(1600 / bar, view.ppt * Math.exp(-e.deltaY * .0025)));
      view.x0 = Math.max(0, t - (p.x - GX0) / view.ppt);
      return;
    }
    if (e.altKey) { view.rh = Math.max(10, Math.min(36, view.rh - Math.sign(e.deltaY) * 2)); return; }
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { view.x0 = Math.max(0, view.x0 + (e.deltaX || e.deltaY) / view.ppt); return; }
    if (p.y > R.sep1) { view.x0 = Math.max(0, view.x0 + e.deltaY / view.ppt); return; }
    view.scrollRows(-Math.sign(e.deltaY) * Math.max(1, Math.round(Math.abs(e.deltaY) / 40)));
  }
</script>

<div class="roll" style="width:{W}px;height:{view.H}px">
  <canvas bind:this={cv} style="width:{W}px;height:{view.H}px;cursor:{cursor}" onpointerdown={down} onpointermove={move} onpointerleave={() => (hoverP = null)} onwheel={wheel}></canvas>
  <div class="head" bind:this={head} style="height:{R.sep2}px" aria-hidden="true">
    <svg width="14" height="10" viewBox="0 0 14 10"><path d="M0 0h14l-7 9Z" fill="var(--now)" /></svg>
  </div>
</div>

<style>
  .roll { position: relative; overflow: hidden; }
  canvas { display: block; touch-action: none; }
  .head { position: absolute; left: -1px; top: 0; width: 2px; background: var(--now); pointer-events: none; will-change: transform; }
  .head svg { position: absolute; left: -6px; top: 0; }
</style>
