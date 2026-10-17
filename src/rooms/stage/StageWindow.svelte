<script lang="ts">
  import { untrack } from 'svelte';
  import { backOut, cubicOut, cubicIn } from 'svelte/easing';
  import type { StageLayout, Win } from './layout';
  import type { Song, Part } from '../../lib/music/song';
  import type { Jam } from './jam.svelte';
  import { buildRange, rangeAt, type RangeTrack } from './range';
  import { paintWindow, shapeD } from './windowArt';
  import { F } from '../../lib/art/type';
  import { partColor, mixHex } from '../../lib/art/palette';
  import { lowerBound, clamp, smooth } from '../../lib/util';
  import { transport } from '../../lib/audio/transport.svelte';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { fonts } from '../../lib/state/fonts.svelte';

  let { L, w, song, jam, span, order, away = false, behind = false, picking = false, picked = false, onpick }: { L: StageLayout; w: Win; song: Song; jam: Jam; span: number; order: number; away?: boolean; behind?: boolean; picking?: boolean; picked?: boolean; onpick: (part: number) => void } = $props();
  const p: Part = $derived(song.parts[w.part]);
  let under: SVGSVGElement, over: SVGSVGElement, cv: HTMLCanvasElement, backdrop: HTMLDivElement;
  /** sounds that keep ringing while held; everything else decays, and its tails fade */
  /** a note this far outside the view (in view widths) still shows in full; over the next FADE_W it fades out */
  const EDGE = .06, FADE_W = .1;
  const PERF = new URLSearchParams(location.search).has('perf');
  const PHONE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const TOUCH = PHONE || (navigator.maxTouchPoints > 1 && /Mac|iPad|iPhone/.test(navigator.platform));
  const resting = $derived(behind && TOUCH);
  let tucked = $state(false), fading = $state(false);
  $effect(() => {
    const hide = resting;
    return untrack(() => {
      if (hide) {
        fading = true;
        const finish = (e: TransitionEvent) => { if (e.target === backdrop && e.propertyName === 'opacity') tucked = true; };
        backdrop.addEventListener('transitionend', finish);
        // the timeout also covers a cancelled transition or a page hidden during the fade
        const timer = setTimeout(() => { tucked = true; }, 240);
        return () => { clearTimeout(timer); backdrop.removeEventListener('transitionend', finish); };
      }
      const restoring = tucked || fading;
      tucked = false;
      if (!restoring) return;
      // give the restored pixels one frame at zero opacity before fading them back in
      let raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => { fading = false; }); });
      return () => cancelAnimationFrame(raf);
    });
  });
  const SUSTAINED = new Set(['strings', 'viola', 'violin', 'organ', 'percorgan', 'accordion', 'accordionbass', 'brass', 'reed', 'oboe', 'flute', 'ocarina', 'whistle', 'bottle', 'square', 'synthbass']);

  /** this window's own box on the stage: room for its frame, its sticker and its marks */
  const box = $derived({ x: Math.floor(w.x - 110), y: Math.floor(w.y - 84), w: Math.ceil(w.w + 230), h: Math.ceil(w.h + 124) });
  const on = $derived(jam.part === w.part);
  let focused = $state(false);

  // ---------- static art: frame, glass, label panel, sticker ----------
  $effect(() => {
    const th = theme.pal, sel = on, foc = focused;
    void fonts.version; void i18n.lang; void box;
    paintWindow(under, over, th, { w, p, L, songId: song.data.id, sel, focused: foc, sticker: true });
  });

  // ---------- live notes ----------
  const maxDur = $derived.by(() => { let m = 0; for (let i = 0; i < p.n; i++) m = Math.max(m, p.dur[i]); return m; });
  /** a note is drawn only until the next attack on the same pitch, so repeated notes never overlap */
  const shown = $derived.by(() => {
    const out = new Float64Array(p.n), last = new Map<number, number>();
    for (let i = p.n - 1; i >= 0; i--) {
      const nx = last.get(p.pitch[i]);
      out[i] = nx === undefined ? p.dur[i] : Math.max(.03, Math.min(p.dur[i], p.start[nx] - p.start[i] - .03));
      last.set(p.pitch[i], i);
    }
    return out;
  });
  /** the smoothed view of the pitch axis for the current fall speed */
  const range: RangeTrack = $derived(buildRange(p, song, span));

  let mixV = untrack(() => jam.part === w.part ? 1 : 0), spanV = untrack(() => span), lastMs = 0;
  interface Head { x: number; i: number; yb: number; yt: number; u: number; a: number }

  // only the clipped glass contains live pixels; the SVG frame and labels keep their larger box
  let surfaceKey = '', surfaceX = 0, surfaceY = 0;
  function fitSurface(w: Win, b: { x: number; y: number; w: number; h: number }, s: number) {
    const key = [w.x, w.y, w.w, w.h, w.cx, w.cy, w.rot, b.x, b.y, b.w, b.h, s].join(',');
    if (key === surfaceKey && cv.width > 1) return;
    surfaceKey = key;
    const pw = Math.max(1, Math.round(b.w * s)), ph = Math.max(1, Math.round(b.h * s));
    const angle = w.rot * Math.PI / 180, c = Math.cos(angle), sn = Math.sin(angle);
    const corners = [[w.x, w.y], [w.x + w.w, w.y], [w.x, w.y + w.h], [w.x + w.w, w.y + w.h]].map(([x, y]) => [
      (w.cx + (x - w.cx) * c - (y - w.cy) * sn - b.x) * s,
      (w.cy + (x - w.cx) * sn + (y - w.cy) * c - b.y) * s
    ]);
    // retain the old pixel grid and two pixels of clip antialiasing, including rotated windows
    const x = Math.max(0, Math.floor(Math.min(...corners.map(p => p[0]))) - 2);
    const y = Math.max(0, Math.floor(Math.min(...corners.map(p => p[1]))) - 2);
    const right = Math.min(pw, Math.ceil(Math.max(...corners.map(p => p[0]))) + 2);
    const bottom = Math.min(ph, Math.ceil(Math.max(...corners.map(p => p[1]))) + 2);
    cv.width = Math.max(1, right - x); cv.height = Math.max(1, bottom - y);
    cv.style.left = x * b.w / pw + 'px'; cv.style.top = y * b.h / ph + 'px';
    cv.style.width = cv.width * b.w / pw + 'px'; cv.style.height = cv.height * b.h / ph + 'px';
    surfaceX = b.x * s + x; surfaceY = b.y * s + y;
  }

  interface Snap { p: Part; w: Win; L: StageLayout; jam: Jam; box: { x: number; y: number; w: number; h: number }; on: boolean; maxDur: number; shown: Float64Array; range: RangeTrack; span: number }
  /** draws this window's notes; returns true while something is still gliding.
      it reads only the snapshot it is given, so a window playing its exit keeps drawing from plain values */
  function draw(v: Snap): boolean {
    const { p, w, L, jam, box, on, maxDur, shown, range, span } = v;
    const ctx = cv.getContext('2d');
    if (!ctx) return false;
    const th = theme.pal, night = th.dark, dpr = Math.min(2.5, window.devicePixelRatio || 1), s = L.s * dpr, b = box;
    fitSurface(w, b, s);
    ctx.setTransform(s, 0, 0, s, -surfaceX, -surfaceY);
    ctx.clearRect(b.x, b.y, b.w, b.h);
    const t = transport.shown(), nowMs = performance.now();
    const dt = lastMs ? Math.min(.1, Math.max(0, (nowMs - lastMs) / 1000)) : 0;
    lastMs = nowMs;
    // glide toward play mode and toward the chosen fall speed
    const target = on ? 1 : 0;
    mixV += (target - mixV) * (1 - Math.exp(-dt / .13));
    if (Math.abs(mixV - target) < .002) mixV = target;
    spanV += (span - spanV) * (1 - Math.exp(-dt / .18));
    if (Math.abs(spanV - span) < .002) spanV = span;
    const moving = mixV !== target || spanV !== span;
    const mix = smooth(clamp(mixV, 0, 1)), k = w.k, SPAN = spanV;

    ctx.save();
    if (w.rot) { ctx.translate(w.cx, w.cy); ctx.rotate(w.rot * Math.PI / 180); ctx.translate(-w.cx, -w.cy); }
    ctx.clip(new Path2D(shapeD(night, w)));
    const top = L.noteTop(w, night), hit = L.hitY(w), pps = (hit - top) / SPAN;
    const nw = (p.drums ? 16 : 12) * k, headMax = 30 * k, tw = Math.max(2.4, nw * .36);
    const [lo, hi] = rangeAt(range, t), x0 = w.x + 26 * k, xw = w.w - 52 * k, rs = Math.max(.5, hi - lo);
    const uOf = (i: number) => ((p.drums ? jam.drumCol(p.pitch[i]) : p.pitch[i]) - lo) / rs;
    const xOf = (i: number, u: number) => { const a = x0 + u * xw; return mix <= 0 ? a : a + (jam.colX(w, p, jam.col(p, i)) - a) * mix; };
    const fillC = on ? th.selNote : th.noteFill, strokeC = on ? th.selNoteStroke : th.noteStroke;
    // several notes sharing one head keep the width and take a quiet tint instead: a wash of the member's colour by day,
    // warm bone by night (and a slightly deeper shade of the play colour on your own part)
    const clusterC = night ? (on ? mixHex(th.selNote, '#D8B46A', .32) : mixHex(th.noteFill, '#D8B46A', .42))
      : (on ? mixHex(th.selNote, th.accentD, .45) : mixHex('#FFFFFF', partColor(th, p.data.color, true), .2));
    const clusterS = on ? th.selNoteStroke : th.noteStroke;
    const flashC = night ? th.orn : '#FFFFFF', flashS = night ? '#0B0A0E' : th.accent;
    const decays = !SUSTAINED.has(p.data.preset);
    const glows: [number, number][] = [];
    const sd = shown;
    const i0 = lowerBound(p.start, t - maxDur - .01), i1 = lowerBound(p.start, t + SPAN + .3);
    let pulse = 0;

    const headPath = (x: number, yb: number, hl: number) => {
      ctx.beginPath();
      if (night) { const tp = yb - hl; ctx.moveTo(x, tp - nw * .5); ctx.lineTo(x + nw / 2, tp); ctx.lineTo(x + nw / 2, yb); ctx.lineTo(x, yb + nw * .5); ctx.lineTo(x - nw / 2, yb); ctx.lineTo(x - nw / 2, tp); ctx.closePath(); ctx.lineJoin = 'round'; }
      else ctx.roundRect(x - nw / 2, yb - hl, nw, hl, nw / 2);
    };
    const tail = (x: number, from: number, to: number) => {
      const c = night ? (on ? '196,41,62' : '237,230,225') : (on ? '47,134,232' : '255,255,255');
      const g = ctx.createLinearGradient(0, from, 0, to);
      g.addColorStop(0, `rgba(${c},${night ? .85 : .95})`); g.addColorStop(1, `rgba(${c},${decays ? .08 : .45})`);
      ctx.beginPath(); ctx.moveTo(x - tw / 2, from); ctx.lineTo(x - tw / 2, to + tw); ctx.lineTo(x, to); ctx.lineTo(x + tw / 2, to + tw); ctx.lineTo(x + tw / 2, from); ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
    };

    for (let i = i0; i < i1;) {
      let j = i + 1;
      while (j < i1 && p.start[j] - p.start[i] < .03) j++;
      const heads: Head[] = [];
      for (let q = i; q < j; q++) {
        const s0 = p.start[q], e0 = s0 + Math.max(sd[q], p.drums ? 0 : .06);
        if (e0 < t && !(p.drums && s0 > t - .09)) continue;
        const u = uOf(q);
        // outside the current view: as the view rescales, a note carries on past the edge and fades out (and one coming
        // into view fades in), unless this is the part being played
        const out = u < 0 ? -u : u - 1, a = Math.max(out <= EDGE ? 1 : 1 - smooth(clamp((out - EDGE) / FADE_W, 0, 1)), mix >= .5 ? 1 : smooth(mix * 2));
        if (a <= .01) continue;
        const x = xOf(q, clamp(u, -EDGE - FADE_W, 1 + EDGE + FADE_W)), yb = s0 <= t ? hit : hit - (s0 - t) * pps;
        heads.push({ x, i: q, yb, yt: Math.max(top - 70, hit - (e0 - t) * pps), u, a });
        if (s0 <= t && (e0 > t || p.drums)) glows.push([x, (t - s0 < .12 ? 1 : .6) * a]);
        if (s0 <= t && t - s0 < .5) pulse = Math.max(pulse, Math.exp(-(t - s0) / .22) * (.5 + .5 * p.vel[q] / 127));
      }
      i = j;
      if (!heads.length) continue;
      const hitNow = (h: Head) => on && jam.hits.has(h.i) && nowMs - (jam.hits.get(h.i) || 0) < 260;
      if (p.drums) {
        for (const h of heads) {
          if (p.start[h.i] < t - .02) continue;
          const f = hitNow(h);
          ctx.globalAlpha = h.a;
          ctx.beginPath();
          if (night) { const r = 9 * k; ctx.moveTo(h.x, h.yb - r); ctx.lineTo(h.x + r * .72, h.yb); ctx.lineTo(h.x, h.yb + r); ctx.lineTo(h.x - r * .72, h.yb); ctx.closePath(); }
          else ctx.roundRect(h.x - nw / 2, h.yb - nw / 2, nw, nw, nw / 2);
          ctx.fillStyle = f ? flashC : fillC; ctx.fill(); ctx.lineWidth = night ? 1.4 : 1.8; ctx.strokeStyle = f ? flashS : strokeC; ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }
      const yb = heads[0].yb;
      const since = t - p.start[heads[0].i], headA = since <= 0 ? 1 : clamp(1 - since / .12, 0, 1);
      // heads that would touch become one head at their centre
      const sorted = [...heads].sort((a, b) => a.x - b.x);
      const clusters: Head[][] = [];
      for (const h of sorted) { const last = clusters[clusters.length - 1]; if (last && h.x - last[last.length - 1].x < nw * .95) last.push(h); else clusters.push([h]); }
      const hl = Math.max(nw, Math.min(headMax, yb - Math.min(...heads.map(h => h.yt))));
      const cx = clusters.map(c => c.reduce((a, h) => a + h.x, 0) / c.length), ca = clusters.map(c => Math.max(...c.map(h => h.a)));
      // sustain: one slim tail per head, fading away for plucked and struck sounds
      clusters.forEach((c, n) => {
        const yt = Math.min(...c.map(h => h.yt)), headTop = headA > 0 ? yb - Math.min(hl, Math.max(nw, yb - yt)) : yb;
        if (headTop - yt >= 6) { ctx.globalAlpha = ca[n]; tail(cx[n], headTop, yt); }
      });
      ctx.globalAlpha = 1;
      if (headA <= 0) continue;
      if (clusters.length > 1 && yb < hit - 1) {
        ctx.globalAlpha = Math.min(ca[0], ca[ca.length - 1]);
        ctx.beginPath(); ctx.moveTo(cx[0], yb - hl / 2); ctx.lineTo(cx[cx.length - 1], yb - hl / 2);
        ctx.lineWidth = night ? .9 : 1.2; ctx.strokeStyle = night ? 'rgba(216,180,106,.6)' : on ? 'rgba(47,134,232,.45)' : 'rgba(28,32,48,.38)'; ctx.stroke();
      }
      ctx.globalAlpha = headA;
      clusters.forEach((c, n) => {
        const x = cx[n], many = c.length > 1, f = c.some(hitNow);
        // stacked notes: one or two offset copies peek out behind the head
        for (let s2 = Math.min(2, c.length - 1); s2 >= 1 && many; s2--) {
          ctx.save(); ctx.translate(2.2 * k * s2, -2.2 * k * s2);
          headPath(x, yb, hl); ctx.globalAlpha = headA * ca[n] * (.42 - .12 * s2);
          ctx.fillStyle = clusterC; ctx.fill(); ctx.lineWidth = night ? 1.2 : 1.4; ctx.strokeStyle = clusterS; ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = headA * ca[n];
        headPath(x, yb, hl);
        ctx.fillStyle = f ? flashC : many ? clusterC : fillC; ctx.fill();
        ctx.lineWidth = night ? 1.6 : 1.8; ctx.strokeStyle = f ? flashS : many ? clusterS : strokeC; ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    // the hit line: dotted at rest, solid when this is your part; the key sockets rise with it
    const lx0 = w.x + 12, lx1 = w.x + w.w - 12;
    ctx.lineCap = 'round';
    if (mix < 1) {
      ctx.globalAlpha = (1 - mix) * (night ? .6 : 1); ctx.setLineDash([1, 7]); ctx.lineWidth = 2; ctx.strokeStyle = th.ink;
      ctx.beginPath(); ctx.moveTo(lx0, hit); ctx.lineTo(lx1, hit); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (mix > 0) {
      ctx.globalAlpha = mix; ctx.lineWidth = 3.5; ctx.strokeStyle = night ? th.orn : th.accent;
      ctx.beginPath(); ctx.moveTo(lx0, hit); ctx.lineTo(lx1, hit); ctx.stroke();
      const n = jam.colsOf(p), grow = .6 + .4 * mix;
      ctx.font = `${night ? 700 : 900} ${(night ? 9 : 9.5) * k}px ${F.sans}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let c = 0; c < n; c++) {
        const sx = jam.colX(w, p, c);
        ctx.beginPath();
        if (night) { const r = 10 * k * grow; ctx.moveTo(sx, hit - r); ctx.lineTo(sx + r * .72, hit); ctx.lineTo(sx, hit + r); ctx.lineTo(sx - r * .72, hit); ctx.closePath(); ctx.fillStyle = '#0B0A0E'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = th.orn; ctx.stroke(); ctx.fillStyle = th.ink; }
        else { ctx.arc(sx, hit, 8.5 * k * grow, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = th.accent; ctx.stroke(); ctx.fillStyle = th.accent; }
        ctx.fillText(jam.keyLabel(c), sx, hit + .5);
      }
    }
    ctx.globalAlpha = 1;
    for (const [x, a] of glows) {
      const r = 16 * k, g = ctx.createRadialGradient(x, hit, 0, x, hit, r);
      const c = night ? '216,180,106' : on ? '47,134,232' : '255,255,255';
      g.addColorStop(0, `rgba(${c},${.85 * a})`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.fillRect(x - r, hit - r, r * 2, r * 2);
    }
    if (on) for (let c = 0; c < jam.colsOf(p); c++) {
      const age = nowMs - jam.pressed[c];
      if (age > 320) continue;
      const a = 1 - age / 320, x = jam.colX(w, p, c), r = (12 + 18 * (1 - a)) * k;
      ctx.beginPath(); ctx.arc(x, hit, r, 0, Math.PI * 2);
      ctx.strokeStyle = night ? `rgba(216,180,106,${a})` : `rgba(47,134,232,${a})`; ctx.lineWidth = 2.5; ctx.stroke();
    }
    if (night) {
      // notes emerge from the glass just under the rose window
      ctx.globalCompositeOperation = 'destination-out';
      const fl = 58 * k, g = ctx.createLinearGradient(0, top, 0, top + fl);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(w.x - 4, top, w.w + 8, fl);
      ctx.fillStyle = '#000'; ctx.fillRect(w.x - 4, w.y - 40, w.w + 8, top - w.y + 40.5);
      ctx.globalCompositeOperation = 'source-over';
      // the rose window catches the light when this part plays
      if (pulse > .02) {
        const ry = w.y + 72 * k, r = 40 * k, g2 = ctx.createRadialGradient(w.cx, ry, 0, w.cx, ry, r);
        g2.addColorStop(0, `rgba(255,236,190,${.5 * pulse})`); g2.addColorStop(.55, `rgba(216,180,106,${.22 * pulse})`); g2.addColorStop(1, 'rgba(216,180,106,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g2; ctx.fillRect(w.cx - r, ry - r, r * 2, r * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
    return moving || pulse > .02;
  }

  $effect(() => {
    void L; void w; void song; void theme.sky;
    const snap: Snap = { p, w, L, jam, box, on, maxDur, shown, range, span };
    // entering mobile play mode cancels this loop and releases its surface; exit starts it afresh
    if (tucked) { cv.width = cv.height = 1; lastMs = 0; return; }
    let alive = true, lastT = -1, settle = 0, req = 0;
    const loop = () => {
      if (!alive) return;
      const t = transport.shown();
      // mobile play mode puts every stage window away; none paints behind the highway
      const skip = away || tucked || (behind && PERF && document.documentElement.classList.contains('ut-perf-stage-off'));
      // (glides carry on from the last drawn frame; and once play mode closes, the window draws itself afresh)
      if (skip) settle = 30;
      else if (transport.playing || t !== lastT || jam.active() || settle > 0) {
        const moving = draw(snap);
        lastT = t;
        settle = moving ? 30 : Math.max(0, settle - 1);
      } else lastMs = 0;
      req = requestAnimationFrame(loop);
    };
    lastMs = 0;
    settle = 30;
    if (!away && !tucked) draw(snap);
    req = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(req); };
  });

  // entrances and exits when the song changes: stickers drop in by day, windows light up from the dark by night. the
  // entrance is global, so it also plays when the stage first opens (the windows arrive with the song)
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function enter(_node: Element) {
    const night = theme.night;
    if (reduced) return { duration: 200, css: (t: number) => `opacity:${t}` };
    return night
      ? { delay: 160 + order * 85, duration: 820, easing: cubicOut, css: (t: number) => `opacity:${t};filter:brightness(${(.12 + .88 * t).toFixed(3)});transform:translateY(${((1 - t) * 16).toFixed(2)}px)` }
      : { delay: 140 + order * 60, duration: 640, easing: backOut, css: (t: number, u: number) => `opacity:${Math.min(1, t * 1.8).toFixed(3)};transform:translateY(${(-u * 40).toFixed(2)}px) rotate(${(u * 5).toFixed(2)}deg) scale(${(.94 + .06 * t).toFixed(3)})` };
  }
  function leave(_node: Element) {
    const night = theme.night;
    if (reduced) return { duration: 150, css: (t: number) => `opacity:${t}` };
    return night
      ? { delay: order * 35, duration: 340, easing: cubicIn, css: (t: number) => `opacity:${t};filter:brightness(${(.1 + .9 * t).toFixed(3)})` }
      : { delay: order * 30, duration: 300, easing: cubicIn, css: (t: number, u: number) => `opacity:${t};transform:translateY(${(u * 34).toFixed(2)}px) rotate(${(-u * 3).toFixed(2)}deg)` };
  }
</script>

<div class="win" class:sel={on} class:away class:tucked class:fading class:picking class:picked style="left:{box.x}px;top:{box.y}px;width:{box.w}px;height:{box.h}px;transform-origin:{w.cx - box.x}px {w.cy - box.y}px" in:enter|global out:leave>
  <div class="backdrop-layer" bind:this={backdrop}>
    <div class="art" style="transform-origin:{w.cx - box.x}px {w.cy - box.y}px">
      <svg bind:this={under} width={box.w} height={box.h} viewBox="{box.x} {box.y} {box.w} {box.h}" aria-hidden="true"></svg>
      <canvas bind:this={cv} aria-hidden="true"></canvas>
      <svg bind:this={over} width={box.w} height={box.h} viewBox="{box.x} {box.y} {box.w} {box.h}" aria-hidden="true"></svg>
    </div>
    <!-- on hover a small cue says what a click does; it stands on the hit line, turned with the window -->
    <div class="cue" style="left:{w.x - box.x}px;top:{w.y - box.y}px;width:{w.w}px;height:{w.h}px;transform:rotate({w.rot}deg)" aria-hidden="true">
      <span class="chip" style="top:{L.hitY(w) - w.y - 40 * Math.max(.8, w.k)}px">
        {#if !picking}<svg viewBox="0 0 10 12" width="9" height="11"><path d="M1 1.2v9.6L9.2 6Z" fill="currentColor" /></svg>{i18n.t('playPart')}
        {:else if picked}<svg viewBox="0 0 12 12" width="11" height="11"><path d="M1.6 6.4 4.7 9.3 10.4 2.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>{i18n.t('multiPicked')}
        {:else}<svg viewBox="0 0 12 12" width="10" height="10"><path d="M6 1.5v9M1.5 6h9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>{i18n.t('multiAdd')}{/if}
      </span>
    </div>
    <button class="hit" style="left:{w.x - box.x}px;top:{w.y - box.y}px;width:{w.w}px;height:{w.h}px;transform:rotate({w.rot}deg)"
      aria-pressed={picking ? picked : on} aria-label="{i18n.pick(p.data.name)} · {picking ? (picked ? i18n.t('multiPicked') : i18n.t('multiAdd')) : i18n.t('youPlay')}"
      onfocus={(e) => { if ((e.currentTarget as HTMLElement).matches(':focus-visible')) focused = true; }}
      onblur={() => (focused = false)}
      onclick={(e) => { onpick(w.part); if (e.detail > 0) (e.currentTarget as HTMLElement).blur(); }}></button>
  </div>
</div>

<style>
  .win { position: absolute; pointer-events: none; }
  .win.sel { z-index: 2; }
  /* picking parts for multi-track play: the windows stand over the dimmed stage, and a picked one stays lifted as a
     window does under the pointer, its cue saying so */
  .win.picking { z-index: 6; }
  /* its part is out in play mode: the highway stands in for it */
  .win.away { visibility: hidden; }
  .win.tucked { display: none; }
  .backdrop-layer { position: absolute; inset: 0; opacity: 1; transition: opacity 180ms ease; }
  .win.fading .backdrop-layer { opacity: 0; }
  .art { position: absolute; inset: 0; transition: transform .35s cubic-bezier(.2, .9, .3, 1), filter .35s; }
  .art svg, .art canvas { position: absolute; left: 0; top: 0; }
  .hit { position: absolute; cursor: pointer; pointer-events: auto; }
  .hit:focus-visible { box-shadow: none; outline: none; }
  /* hover: by day the sticker lifts off the page (its shadow stays down, so the gap shows the height); by night the
     glass brightens and the arch takes a candle-gold glow. either way the cue rises onto the hit line */
  .cue { position: absolute; pointer-events: none; }
  .chip {
    position: absolute; left: 50%; display: flex; align-items: center; gap: 7px; padding: 7px 13px 7px 11px; white-space: nowrap;
    font: 900 13px/1 var(--f-sans); letter-spacing: .06em; color: #FFFFFF; background: #2F86E8; border-radius: 999px;
    box-shadow: 0 0 0 3px #FFFFFF, 2px 5px 0 3px rgba(28, 32, 48, .14);
    opacity: 0; transform: translate(-50%, 8px) scale(.92); transition: opacity .2s, transform .35s cubic-bezier(.3, 1.6, .5, 1);
  }
  :global([data-sky='night']) .chip {
    font: 700 14px/1 var(--f-serif); letter-spacing: .1em; color: #EDE6E1; background: rgba(11, 10, 14, .82); border-radius: 0;
    box-shadow: 0 0 0 1px rgba(216, 180, 106, .7), inset 0 0 0 3px rgba(11, 10, 14, .82), inset 0 0 0 4px rgba(216, 180, 106, .22);
    padding: 8px 15px 8px 13px;
  }
  :global([data-sky='night']) .chip svg { color: #D8B46A; }
  .art :global(.shade) { transition: transform .35s cubic-bezier(.2, .9, .3, 1), opacity .35s; }
  @media (hover: hover) {
    .win:has(.hit:hover) .art { transform: translateY(-9px); }
    .win:has(.hit:hover) .art :global(.shade) { transform: translate(3px, 12px); opacity: .8; }
    :global([data-sky='night']) .win:has(.hit:hover) .art { transform: translateY(-3px); filter: brightness(1.14) drop-shadow(0 0 14px rgba(216, 180, 106, .28)); }
    .win:has(.hit:hover) .chip { opacity: 1; transform: translate(-50%, -9px) scale(1); }
    :global([data-sky='night']) .win:has(.hit:hover) .chip { transform: translate(-50%, -3px) scale(1); }
  }
  .win.picked .art { transform: translateY(-9px); }
  .win.picked .art :global(.shade) { transform: translate(3px, 12px); opacity: .8; }
  :global([data-sky='night']) .win.picked .art { transform: translateY(-3px); filter: brightness(1.14) drop-shadow(0 0 14px rgba(216, 180, 106, .28)); }
  .win.picked .chip { opacity: 1; transform: translate(-50%, -9px) scale(1); }
  :global([data-sky='night']) .win.picked .chip { transform: translate(-50%, -3px) scale(1); }
  .win:has(.hit:active) .art { transform: translateY(-4px) scale(.992); transition-duration: .08s; }
  .win :global(.ut-fadein) { animation: ut-fadein .35s ease-out both; }
  .win :global(.ut-pop) { transform-box: fill-box; transform-origin: 30% 60%; animation: ut-pop .42s cubic-bezier(.2, 1.5, .4, 1) both; }
  @keyframes ut-fadein { from { opacity: 0; } }
  @keyframes ut-pop { from { opacity: 0; transform: scale(.6) rotate(-4deg); } to { opacity: 1; transform: none; } }
</style>
