<script lang="ts">
  import { untrack } from 'svelte';
  import { studio } from '../../lib/project/studio.svelte';
  import { passagesOf, passageAt, clipEnd } from '../../lib/project/ops';
  import { bank } from '../../lib/audio/bank';
  import { isAudioFile } from '../../lib/util';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { transport } from '../../lib/audio/transport.svelte';
  import { audibility, mixOf } from '../../lib/audio/strip';
  import { theme } from '../../lib/state/theme.svelte';
  import { fonts } from '../../lib/state/fonts.svelte';
  import { drawRows, drawRuler, barEvery, type RowsState } from './draw-arrange';
  import type { ArrangeView } from './arrange.svelte';

  /* the arrange timeline: a ruler over one lane per part.
     ruler: the upper half moves the cursor (click or drag), the lower half selects a stretch of the whole song.
     lanes: click a passage to select it, drag it to move it (Alt copies; it moves by whole snap steps, keeping its
     place in the bar); drag across empty space to select a stretch in some parts; click empty space to move the cursor;
     double-click to open that part in the track view. with the scissors, a click splits the passage there.
     the cursor can be grabbed and dragged anywhere. */
  let { view, s, h, onedit }: { view: ArrangeView; s: number; h: number; onedit: (part: number, t: number) => void } = $props();

  let rulerCv: HTMLCanvasElement, rowsCv: HTMLCanvasElement, head: HTMLDivElement;
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;

  let ghost = $state.raw<RowsState['ghost']>(null);
  /** under the pointer: a passage (select) or where the scissors would cut */
  let hover = $state.raw<RowsState['hover']>(null);
  let hoverT = $state<number | null>(null), hoverLow = $state(false);
  let cursor = $state('default');

  /* audio: the song's recordings and files load as it opens; their outlines redraw when they arrive */
  let bankV = $state(0);
  $effect(() => bank.onChange(() => { bankV++; }));
  $effect(() => { void studio.rev; const d = studio.doc; if (d) void bank.loadAll(d.parts.flatMap(p => p.clips.map(c => c.src))); });
  const shape = $derived.by(() => {
    void studio.rev; void bankV;
    const d = studio.doc, g = studio.grid;
    if (!d || !g) return { runs: [], spans: [], waves: [] };
    return {
      runs: d.parts.map(p => passagesOf(p, g)),
      spans: d.parts.map(p => { let lo = 127, hi = 0; for (const n of p.notes) { if (n.p < lo) lo = n.p; if (n.p > hi) hi = n.p; } return lo > hi ? { lo: 60, hi: 60 } : { lo, hi }; }),
      waves: d.parts.map(p => p.meta.kind === 'audio' ? p.clips.map(c => ({ a: c.t, b: clipEnd(c, g.tl), peaks: bank.peaks(c.src), off: c.off, dur: c.dur, name: c.name })) : null)
    };
  });
  const take = $derived.by(() => {
    const lt = studio.liveTake, sg = transport.song;
    return lt && sg ? { part: lt.part, a: sg.tl.tick(lt.start), b: sg.tl.tick(lt.start + lt.dur), peaks: lt.peaks } : null;
  });
  /* an audio file dragged in: onto an audio track it lands there, anywhere else it starts a new audio track */
  let dropLane = $state<number | null>(null);
  function dragOver(e: DragEvent) {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const d = studio.doc, i = partAt(local(e, e.currentTarget as HTMLElement).y);
    dropLane = d && i >= 0 && i < d.parts.length && d.parts[i].meta.kind === 'audio' ? i : d ? Math.min(i, d.parts.length) : null;
  }
  function drop(e: DragEvent) {
    const f = [...(e.dataTransfer?.files ?? [])].find(isAudioFile);
    const d = studio.doc, lane = dropLane;
    dropLane = null;
    if (!f || !d) return;
    e.preventDefault();
    const at = snapT(view.tOf(local(e, e.currentTarget as HTMLElement).x), 'floor');
    if (lane !== null && lane < d.parts.length && d.parts[lane].meta.kind === 'audio') void studio.importAudio(lane, f, at);
    else void studio.addAudioPart(f, at);
  }
  const loopT = $derived.by(() => { const sg = transport.song, lp = transport.loop; return sg && lp ? { a: sg.tl.tick(lp.a), b: sg.tl.tick(lp.b) } : null; });
  const every = $derived(studio.grid ? barEvery(studio.grid, view.ppt) : 4);

  function size(cv: HTMLCanvasElement, w: number, hh: number) {
    const k = s * dpr, W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(hh * k));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    return ctx;
  }
  $effect(() => {
    void studio.rev; void fonts.version;
    const d = studio.doc, g = studio.grid;
    if (!d || !g || !rowsCv) return;
    const ctx = size(rowsCv, view.width, h);
    const silent = audibility((transport.song?.parts ?? []).map(mixOf)).map(on => !on);
    drawRows(ctx, { th: theme.pal, doc: d, grid: g, runs: shape.runs, spans: shape.spans, waves: shape.waves, take, drop: dropLane, dropLabel: i18n.t('dropAudio'), whole: studio.trackSel ? studio.part : -1, silent, x0: view.x0, ppt: view.ppt, w: view.width, h, scrollY: view.scrollY, RH: view.rh, range: studio.range, ghost, hover, loop: loopT, loopOn: transport.loopOn, every }, s * dpr);
  });
  $effect(() => {
    void studio.rev; void fonts.version;
    const g = studio.grid;
    if (!g || !rulerCv) return;
    const ctx = size(rulerCv, view.width, view.ruler);
    drawRuler(ctx, { th: theme.pal, grid: g, x0: view.x0, ppt: view.ppt, w: view.width, h: view.ruler, range: studio.range, section: studio.section, loop: loopT, loopOn: transport.loopOn, hoverT, hoverLow, every });
  });

  /* the cursor follows the music; with "follow" on, the view pages along */
  $effect(() => {
    let raf = 0;
    const f = () => {
      const song = transport.song;
      if (song && head) {
        const t = song.tl.tick(transport.shown()), x = view.xOf(t);
        head.style.transform = `translateX(${x}px)`;
        head.style.opacity = x < -8 || x > view.width + 8 ? '0' : '1';
        if (transport.playing && studio.follow && !drag && (x > view.width * .88 || x < 0)) untrack(() => { view.x0 = Math.max(0, t - (view.width * .1) / view.ppt); });
      }
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  });

  /* ---------- geometry ---------- */
  function local(e: PointerEvent | MouseEvent | WheelEvent, el: HTMLElement) {
    const r = el.getBoundingClientRect(), k = view.width / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }
  const partAt = (y: number) => Math.floor((y + view.scrollY) / view.rh);
  const snapT = (t: number, how: 'floor' | 'round' | 'ceil' = 'round') => studio.grid!.snap(Math.max(0, t), studio.snap, how);
  const headX = () => view.xOf(studio.cursorTick());
  /** a stretch from t0 to t, snapped outwards; never empty */
  function stretch(t0: number, t: number) {
    const a = snapT(Math.min(t, t0), 'floor'), b = snapT(Math.max(t, t0), 'ceil');
    return { a, b: b > a ? b : studio.grid!.step(a, studio.snap, 1) };
  }
  function listen(el: HTMLElement, move: (ev: PointerEvent) => void, up: (ev: PointerEvent) => void) {
    const u = (ev: PointerEvent) => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', u); el.removeEventListener('pointercancel', u); up(ev); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u);
  }
  /** move the cursor with the pointer, pausing playback while it is dragged */
  function scrub(el: HTMLElement, x0: number) {
    const was = transport.playing;
    if (was) transport.pause();
    drag = true;
    const set = (x: number) => studio.seekTick(snapT(view.tOf(Math.max(0, Math.min(view.width, x)))));
    set(x0);
    listen(el, ev => set(local(ev, el).x), () => { drag = false; if (was) void transport.play(); });
  }

  /* ---------- ruler ---------- */
  function rulerDown(e: PointerEvent) {
    if (e.button !== 0 || !studio.doc || !studio.grid) return;
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
    const p0 = local(e, el);
    if (p0.y < view.ruler / 2) { scrub(el, p0.x); return; }
    const t0 = view.tOf(p0.x), all = studio.doc.parts.map((_, i) => i);
    let moved = false;
    listen(el, ev => {
      const p = local(ev, el);
      if (!moved && Math.abs(p.x - p0.x) < 4) return;
      moved = true;
      studio.select({ parts: all, ...stretch(t0, view.tOf(p.x)) });
    }, () => { if (!moved) { studio.select(null); studio.seekTick(snapT(t0)); } });
  }
  function rulerHover(e: PointerEvent) {
    const p = local(e, e.currentTarget as HTMLElement);
    hoverT = view.tOf(p.x); hoverLow = p.y >= view.ruler / 2;
    cursor = hoverLow ? 'text' : 'ew-resize';
  }

  /* ---------- touch: one finger on empty space pans, two fingers pinch to zoom ---------- */
  const touches = new Map<number, { x: number; y: number }>();
  let gestureId = 0;
  function touchTrack(e: PointerEvent, el: HTMLElement) {
    touches.set(e.pointerId, local(e, el));
    const end = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) return; touches.delete(e.pointerId); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    if (touches.size !== 2) return false;
    // a second finger: stop whatever the first one started and pinch
    gestureId++; ghost = null; drag = false;
    const g = studio.grid!, [a, b] = [...touches.values()];
    const d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1, ppt0 = view.ppt, mid = (a.x + b.x) / 2, t = view.tOf(mid);
    const move = (ev: PointerEvent) => {
      if (!touches.has(ev.pointerId)) return;
      touches.set(ev.pointerId, local(ev, el));
      if (touches.size < 2) return;
      const [p, q] = [...touches.values()], d = Math.hypot(p.x - q.x, p.y - q.y), m = (p.x + q.x) / 2;
      const bar = g.tickOf(1) || 1920;
      view.ppt = Math.max(6 / bar, Math.min(600 / bar, ppt0 * d / d0));
      view.x0 = t - m / view.ppt;
      view.clampX(g);
    };
    const up = () => { if (touches.size < 2) { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); } };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    return true;
  }
  function pan(e: PointerEvent, el: HTMLElement, onTap: () => void) {
    const d = studio.doc!, g = studio.grid!, my = gestureId, p0 = local(e, el);
    let last = p0, moved = false;
    const contentH = d.parts.length * view.rh + view.rh;
    listen(el, ev => {
      if (my !== gestureId) return;
      const p = local(ev, el);
      if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < 6) return;
      moved = true;
      view.x0 -= (p.x - last.x) / view.ppt; view.clampX(g);
      if (contentH > h) view.scrollY = Math.max(0, Math.min(contentH - h, view.scrollY - (p.y - last.y)));
      last = p;
    }, () => { if (!moved && my === gestureId) onTap(); });
  }

  /* ---------- lanes ---------- */
  let drag = false;
  /** a move by whole snap steps: the stretch keeps its place in the bar (free: exactly as dragged) */
  function stepDelta(a: number, dt: number) {
    const g = studio.grid!;
    if (studio.snap === 'free') return Math.round(dt);
    return g.snap(Math.max(0, a + dt), studio.snap) - g.snap(a, studio.snap);
  }
  function rowsDown(e: PointerEvent) {
    const d = studio.doc, g = studio.grid;
    if (e.button !== 0 || !d || !g) return;
    const el = e.currentTarget as HTMLElement, touch = e.pointerType === 'touch';
    if (touch && touchTrack(e, el)) return;
    const my = ++gestureId;
    const p0 = local(e, el), i0 = partAt(p0.y), t0 = view.tOf(p0.x);
    try { el.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
    // the cursor itself
    if (!touch && Math.abs(p0.x - headX()) <= 5 && studio.arrTool === 'select') { scrub(el, p0.x); return; }
    studio.trackSel = false;
    if (i0 < 0 || i0 >= d.parts.length) { studio.select(null); studio.seekTick(snapT(t0)); return; }
    studio.part = i0;
    // the scissors: split the passage here
    if (studio.arrTool === 'split') {
      const at = snapT(t0);
      if (passageAt(shape.runs[i0] ?? [], at) || passageAt(shape.runs[i0] ?? [], t0)) studio.split(at, [i0]);
      return;
    }
    let r = studio.range;
    const inside = !!r && r.parts.includes(i0) && t0 >= r.a && t0 < r.b;
    const pass = passageAt(shape.runs[i0] ?? [], t0);
    const tap = () => { studio.select(null); studio.seekTick(snapT(t0)); };
    // shift adds the passage (or this time) to the selection
    if (e.shiftKey && r && !inside) {
      const lo = Math.min(...r.parts, i0), hi = Math.max(...r.parts, i0), parts: number[] = [];
      for (let k = lo; k <= hi; k++) parts.push(k);
      studio.select({ parts, a: Math.min(r.a, pass ? pass.a : snapT(t0, 'floor')), b: Math.max(r.b, pass ? pass.b : snapT(t0, 'ceil')) });
      return;
    }
    // a passage: select it at once, so a drag moves it
    if (!inside && pass) { studio.select({ parts: [i0], a: pass.a, b: pass.b }); r = studio.range; }
    const grabbing = !!r && r.parts.includes(i0) && t0 >= r.a && t0 < r.b;
    if (touch && !grabbing) { pan(e, el, tap); return; }
    drag = true;
    let moved = false, shift = 0;
    listen(el, ev => {
      if (my !== gestureId) return;
      const p = local(ev, el);
      if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < 4) return;
      moved = true;
      const t = view.tOf(p.x);
      if (grabbing && r) {
        let delta = stepDelta(r.a, t - t0);
        if (r.a + delta < 0) delta = -r.a;
        // up or down into other instrument tracks: as far toward the pointer as every part can go (never drums or audio)
        const want = Math.max(0, Math.min(d.parts.length - 1, partAt(p.y))) - i0, sel = r.parts;
        if (want !== shift) {
          shift = 0;
          if (sel.every(i => studio.takesNotes(i))) for (let k = want; k !== 0; k -= Math.sign(k)) if (sel.every(i => studio.takesNotes(i + k))) { shift = k; break; }
        }
        ghost = delta || shift ? { parts: sel.map(i => i + shift), from: sel, a: r.a + delta, b: r.b + delta, copy: ev.altKey } : null;
        cursor = ev.altKey ? 'copy' : 'grabbing';
      } else {
        const i = Math.max(0, Math.min(d.parts.length - 1, partAt(p.y))), parts: number[] = [];
        for (let k = Math.min(i, i0); k <= Math.max(i, i0); k++) parts.push(k);
        studio.select({ parts, ...stretch(t0, t) });
      }
    }, ev => {
      drag = false;
      if (my !== gestureId) return;
      const gh = ghost; ghost = null; cursor = 'default';
      if (gh && r) { studio.move(gh.a - r.a, ev.altKey, gh.parts[0] - r.parts[0]); return; }
      if (!moved && !grabbing) tap();
    });
  }
  function rowsDbl(e: MouseEvent) {
    const d = studio.doc;
    if (!d) return;
    const p = local(e, e.currentTarget as HTMLElement), i = partAt(p.y);
    if (i >= 0 && i < d.parts.length) onedit(i, view.tOf(p.x));
  }
  function rowsMove(e: PointerEvent) {
    if (drag || e.buttons) return;
    const d = studio.doc;
    if (!d) return;
    const p = local(e, e.currentTarget as HTMLElement), i = partAt(p.y), t = view.tOf(p.x), r = studio.range;
    const pass = i >= 0 && i < d.parts.length ? passageAt(shape.runs[i] ?? [], t) : null;
    if (studio.arrTool === 'split') {
      const at = snapT(t);
      hover = pass || (i >= 0 && i < d.parts.length && passageAt(shape.runs[i] ?? [], at)) ? { part: i, a: at, b: at, cut: true } : null;
      cursor = hover ? 'crosshair' : 'not-allowed';
      return;
    }
    hover = pass && !(r && r.parts.includes(i) && t >= r.a && t < r.b) ? { part: i, a: pass.a, b: pass.b, cut: false } : null;
    if (Math.abs(p.x - headX()) <= 5) cursor = 'ew-resize';
    else if ((r && r.parts.includes(i) && t >= r.a && t < r.b) || pass) cursor = 'grab';
    else cursor = 'default';
  }

  function wheel(e: WheelEvent) {
    const g = studio.grid, d = studio.doc;
    if (!g || !d) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement, p = local(e, el);
    if (e.ctrlKey || e.metaKey) { view.zoomAt(p.x, Math.exp(-e.deltaY * .0025), g); return; }
    const contentH = d.parts.length * view.rh + view.rh, fits = contentH <= h;
    let dx = e.deltaX, dy = e.deltaY;
    if (e.shiftKey || (fits && Math.abs(dy) > Math.abs(dx))) { dx = dx || dy; dy = 0; }
    if (dx) { view.x0 += dx / view.ppt; view.clampX(g); }
    if (dy && !fits) view.scrollY = Math.max(0, Math.min(contentH - h, view.scrollY + dy));
  }
</script>

<div class="tl" style="width:{view.width}px">
  <canvas class="ruler" bind:this={rulerCv} style="width:{view.width}px;height:{view.ruler}px;cursor:{cursor}" onpointerdown={rulerDown} onwheel={wheel}
    onpointermove={rulerHover} onpointerleave={() => { hoverT = null; cursor = 'default'; }} aria-label="timeline ruler"></canvas>
  <canvas class="rows" bind:this={rowsCv} style="width:{view.width}px;height:{h}px;cursor:{cursor}" onpointerdown={rowsDown} ondblclick={rowsDbl} onwheel={wheel} onpointermove={rowsMove} onpointerleave={() => { hover = null; if (!drag) cursor = 'default'; }}
    ondragover={dragOver} ondragleave={() => (dropLane = null)} ondrop={drop}></canvas>
  <div class="head" bind:this={head} style="height:{h + view.ruler}px" aria-hidden="true">
    <svg width="14" height="10" viewBox="0 0 14 10"><path d="M0 0h14l-7 9Z" fill="var(--now)" /></svg>
  </div>
</div>

<style>
  .tl { position: relative; overflow: hidden; }
  canvas { display: block; touch-action: none; }
  .head { position: absolute; left: -1px; top: 0; width: 2px; background: var(--now); pointer-events: none; will-change: transform; }
  .head svg { position: absolute; left: -6px; top: 0; }
</style>
