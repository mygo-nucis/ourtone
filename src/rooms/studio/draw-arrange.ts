import type { Palette } from '../../lib/art/palette';
import { partColor, rgba } from '../../lib/art/palette';
import type { EditDoc, Note } from '../../lib/project/doc';
import type { Grid, Run } from '../../lib/project/ops';
import type { Range } from '../../lib/project/studio.svelte';
import { F } from '../../lib/art/type';
import { PEAK_RATE } from '../../lib/audio/bank';

/* the arrange timeline, drawn on canvas: one lane per part, a tint where the part plays and its notes as short dashes.
   there are no clips: what you select is a stretch of time in some parts */
export interface RowsState {
  th: Palette; doc: EditDoc; grid: Grid;
  /** where each part plays, and its lowest and highest pitch */
  runs: Run[][]; spans: { lo: number; hi: number }[];
  x0: number; ppt: number; w: number; h: number; scrollY: number; RH: number;
  range: Range | null;
  /** a selection being dragged: where it would land */
  /** a selection being dragged: where it would land (`parts`), and where it comes from */
  ghost: { parts: number[]; from: number[]; a: number; b: number; copy: boolean } | null;
  loop: { a: number; b: number } | null; loopOn: boolean;
  /** the bar lines the ruler numbers (drawn a little stronger) */
  every: number;
  /** the passage under the pointer, or where the scissors would cut */
  hover: { part: number; a: number; b: number; cut: boolean } | null;
  /** audio tracks: each clip's span (ticks), outline (min/max pairs, PEAK_RATE a second), offset and length (seconds) */
  waves: (Wave[] | null)[];
  /** a microphone take being recorded, growing on its track */
  take: { part: number; a: number; b: number; peaks: Float32Array } | null;
  /** the lane an audio file is being dragged over */
  drop: number | null; dropLabel: string;
  /** a whole track selected by its header (-1: none) */
  whole: number;
  /** parts not heard: muted, or left out by another part's solo (drawn faint) */
  silent: boolean[];
}
export interface Wave { a: number; b: number; peaks: Float32Array | null; off: number; dur: number; name?: string }

/** an audio outline between xa and xb: one bar per pixel, the loudest and quietest moment it covers */
function drawWave(ctx: CanvasRenderingContext2D, xa: number, xb: number, top: number, hgt: number, peaks: Float32Array | null, off: number, dur: number, w: number) {
  const px = xb - xa;
  if (px < 2 || !peaks || dur <= 0) return;
  const mid = top + hgt / 2, amp = hgt / 2, n = peaks.length / 2;
  ctx.beginPath();
  for (let x = Math.max(Math.floor(xa), 0); x < Math.min(xb, w); x++) {
    const s0 = off + (x - xa) / px * dur, s1 = off + (x + 1 - xa) / px * dur;
    const i0 = Math.max(0, Math.floor(s0 * PEAK_RATE)), i1 = Math.min(n, Math.max(i0 + 1, Math.ceil(s1 * PEAK_RATE)));
    let lo = 0, hi = 0;
    for (let k = i0; k < i1; k++) { if (peaks[k * 2] < lo) lo = peaks[k * 2]; if (peaks[k * 2 + 1] > hi) hi = peaks[k * 2 + 1]; }
    const y0 = mid - Math.min(1, hi) * amp, y1 = mid - Math.max(-1, lo) * amp;
    ctx.rect(x, y0, 1, Math.max(1, y1 - y0));
  }
  ctx.fill();
}

/** the loop's colour: amber by day, gold by night */
export const loopColor = (th: Palette) => (th.dark ? '#D8B46A' : '#E9A93A');
/** the loop in a ruler: a band with a bracket at each end, faint while the loop is off */
export function drawLoop(ctx: CanvasRenderingContext2D, th: Palette, xa: number, xb: number, y: number, on: boolean) {
  if (xb <= xa) return;
  ctx.globalAlpha = on ? 1 : .35;
  ctx.fillStyle = loopColor(th);
  ctx.fillRect(xa, y, xb - xa, 4);
  ctx.fillRect(xa, y, 2, 9); ctx.fillRect(xb - 2, y, 2, 9);
  ctx.globalAlpha = 1;
}
/** how many bars between numbered bar lines at this zoom */
export function barEvery(grid: Grid, ppt: number, min = 46) {
  const pxBar = (grid.tickOf(1) - grid.tickOf(0) || 1920) * ppt;
  return [1, 2, 4, 8, 16, 32, 64].find(k => k * pxBar >= min) ?? 64;
}

const patterns = new WeakMap<CanvasRenderingContext2D, Record<string, CanvasPattern | null>>();
/** screentone by day, lattice by night: the texture of a selection */
function texture(ctx: CanvasRenderingContext2D, th: Palette, k: number) {
  let m = patterns.get(ctx);
  if (!m) { m = {}; patterns.set(ctx, m); }
  const key = (th.dark ? 'n' : 'd') + k.toFixed(2);
  if (m[key] === undefined) {
    const c = document.createElement('canvas'), s = th.dark ? 12 : 7, px = Math.max(1, Math.round(s * k));
    c.width = px; c.height = th.dark ? Math.round(px * 1.5) : Math.round(px * .866 * 2);
    const g = c.getContext('2d')!;
    if (th.dark) {
      g.strokeStyle = 'rgba(196,41,62,.45)'; g.lineWidth = Math.max(1, k);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(c.width, c.height); g.moveTo(c.width, 0); g.lineTo(0, c.height); g.stroke();
    } else {
      g.fillStyle = 'rgba(47,134,232,.28)';
      const r = px * .34, hy = c.height / 2;
      for (const [x, y] of [[0, 0], [px, 0], [px / 2, hy], [0, c.height], [px, c.height]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    }
    const p = ctx.createPattern(c, 'repeat');
    p?.setTransform(new DOMMatrix().scale(1 / k, 1 / k));
    m[key] = p;
  }
  return m[key];
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else ctx.rect(x, y, w, h);
}
function firstAt(ns: Note[], t: number) { let lo = 0, hi = ns.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ns[m].t < t) lo = m + 1; else hi = m; } return lo; }

export function drawRows(ctx: CanvasRenderingContext2D, S: RowsState, scale: number) {
  const { th, doc, grid, x0, ppt, w, h, RH } = S;
  const X = (t: number) => (t - x0) * ppt;
  const t0 = x0, t1 = x0 + w / ppt;
  const night = th.dark, rad = night ? 1 : 5;
  ctx.clearRect(0, 0, w, h);
  const first = Math.max(0, Math.floor(S.scrollY / RH)), last = Math.min(doc.parts.length - 1, Math.floor((S.scrollY + h) / RH));
  // lanes and bar lines
  for (let i = first; i <= last; i++) { ctx.fillStyle = i % 2 ? th.alt : th.base; ctx.fillRect(0, i * RH - S.scrollY, w, RH); }
  const endY = doc.parts.length * RH - S.scrollY;
  if (endY < h) { ctx.fillStyle = th.bg; ctx.fillRect(0, endY, w, h - endY); }
  const b0 = grid.barAt(t0), b1 = grid.barAt(t1) + 1;
  for (let b = b0; b <= b1; b++) {
    const x = Math.round(X(grid.tickOf(b))) + .5;
    if (x < -1 || x > w + 1) continue;
    ctx.fillStyle = b % S.every === 0 ? th.hair : rgba(night ? '#EDE6E1' : '#1C2030', .045);
    ctx.fillRect(x - .5, 0, 1, Math.min(h, endY));
  }
  // the loop, faintly, across every lane
  if (S.loop && S.loopOn) {
    const a = X(S.loop.a), b = X(S.loop.b);
    ctx.fillStyle = rgba(night ? '#D8B46A' : '#E9A93A', night ? .06 : .09); ctx.fillRect(a, 0, b - a, Math.min(h, endY));
  }
  for (let i = first; i <= last; i++) {
    const y = i * RH - S.scrollY, ep = doc.parts[i], col = partColor(th, ep.meta.color), runs = S.runs[i] || [], sp = S.spans[i];
    ctx.fillStyle = th.hair; ctx.fillRect(0, y + RH - 1, w, 1);
    const inSel = S.range && S.range.parts.includes(i) ? S.range : null;
    const moving = S.ghost && !S.ghost.copy && S.ghost.from.includes(i) ? S.ghost : null, dim = S.silent[i] ? .4 : 1;
    // where the part plays
    ctx.fillStyle = col; ctx.globalAlpha = (night ? .34 : .42) * dim;
    for (const r of runs) {
      if (r.b < t0 || r.a > t1) continue;
      const x = X(r.a) + .5, cw = Math.max(3, X(r.b) - x - 1);
      rr(ctx, x, y + 6, cw, RH - 12, rad); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // an audio track's clips: their sound as an outline, and their names
    const wv = S.waves[i];
    if (wv) {
      for (const c of wv) {
        if (c.b < t0 || c.a > t1) continue;
        const xa = X(c.a), xb = X(c.b), sel = !!inSel && c.a >= inSel.a && c.a < inSel.b;
        ctx.fillStyle = sel ? (night ? th.ink : th.accentD) : th.ink2; ctx.globalAlpha = (moving && sel ? .3 : night ? .72 : .6) * dim;
        drawWave(ctx, xa, xb, y + 9, RH - 18, c.peaks, c.off, c.dur, w);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba(night ? '#EDE6E1' : '#1C2030', .22); ctx.lineWidth = 1; rr(ctx, xa + 1, y + 6.5, Math.max(2, xb - xa - 2), RH - 13, rad); ctx.stroke();
        if (c.name && xb - xa > 70) { ctx.font = `600 10px ${F.sans}`; ctx.fillStyle = th.ink2; ctx.globalAlpha = .85; ctx.fillText(c.name, Math.max(xa, 0) + 6, y + 17, Math.max(10, xb - Math.max(xa, 0) - 12)); ctx.globalAlpha = 1; }
      }
    }
    if (S.take && S.take.part === i) {
      const xa = X(S.take.a), xb = Math.max(xa + 2, X(S.take.b));
      ctx.fillStyle = rgba(night ? '#C4293E' : '#E2483F', .16); rr(ctx, xa, y + 6, xb - xa, RH - 12, rad); ctx.fill();
      ctx.fillStyle = night ? '#E36A7C' : '#E2483F';
      drawWave(ctx, xa, xb, y + 9, RH - 18, S.take.peaks, 0, (S.take.peaks.length / 2) / PEAK_RATE, w);
    }
    if (S.drop === i) {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = th.accent; ctx.lineWidth = 2; rr(ctx, 2, y + 4, w - 4, RH - 8, rad); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = `700 12px ${F.sans}`; ctx.fillStyle = th.accent; ctx.fillText(S.dropLabel, 12, y + RH / 2 + 4);
    }
    // a whole track selected
    if (S.whole === i) {
      ctx.fillStyle = th.accentSoft; ctx.globalAlpha = .55; ctx.fillRect(0, y + 1, w, RH - 2); ctx.globalAlpha = 1;
      ctx.strokeStyle = th.accent; ctx.lineWidth = 2; ctx.strokeRect(1, y + 1.5, w - 2, RH - 3);
    }
    // the selection
    if (inSel) {
      const x = X(inSel.a), cw = X(inSel.b) - x;
      ctx.fillStyle = th.accentSoft; ctx.globalAlpha = .8; rr(ctx, x, y + 3, cw, RH - 6, rad); ctx.fill(); ctx.globalAlpha = 1;
      const pat = texture(ctx, th, scale);
      if (pat) { ctx.save(); rr(ctx, x + 2, y + 5, cw - 4, RH - 10, rad); ctx.clip(); ctx.fillStyle = pat; ctx.fillRect(x, y, cw, RH); ctx.restore(); }
    }
    // notes, placed by pitch within the part's own range
    const ns = ep.notes, lo = sp?.lo ?? 60, hi = sp?.hi ?? 60;
    const k0 = firstAt(ns, t0 - grid.tickOf(2)), plain: number[] = [], picked: number[] = [];
    for (let k = k0; k < ns.length; k++) {
      const n = ns[k];
      if (n.t > t1) break;
      const nx = X(n.t), nw = Math.max(1.5, X(n.t + n.d) - nx - .5);
      if (nx + nw < 0) continue;
      const ny = y + RH - 12 - (hi === lo ? .5 : (n.p - lo) / (hi - lo)) * (RH - 26);
      const sel = !!inSel && n.t >= inSel.a && n.t < inSel.b;
      (sel ? picked : plain).push(nx, ny, nw);
    }
    for (const [list, c, al] of [[plain, th.ink2, .75], [picked, night ? th.ink : th.accentD, moving ? .3 : .85]] as const) {
      ctx.globalAlpha = al * dim; ctx.fillStyle = c; ctx.beginPath();
      for (let q = 0; q < list.length; q += 3) ctx.rect(list[q], list[q + 1], list[q + 2], 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (inSel) {
      const x = X(inSel.a), cw = X(inSel.b) - x;
      ctx.strokeStyle = th.accent; ctx.lineWidth = 2; rr(ctx, x + 1, y + 4, cw - 2, RH - 8, rad); ctx.stroke();
    }
    // what a click would select, or cut
    if (S.hover && S.hover.part === i) {
      const hv = S.hover;
      if (hv.cut) {
        const x = Math.round(X(hv.a)) + .5;
        ctx.strokeStyle = th.accent; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.lineTo(x, y + RH - 2); ctx.stroke(); ctx.setLineDash([]);
      } else { ctx.strokeStyle = night ? 'rgba(237,230,225,.45)' : 'rgba(28,32,48,.35)'; ctx.lineWidth = 1.2; rr(ctx, X(hv.a) + 1, y + 5, X(hv.b) - X(hv.a) - 2, RH - 10, rad); ctx.stroke(); }
    }
    // a selection being dragged, where it would land
    if (S.ghost && S.ghost.parts.includes(i)) {
      const g = S.ghost, x = X(g.a), cw = X(g.b) - x;
      ctx.fillStyle = rgba(night ? '#C4293E' : '#2F86E8', .14); rr(ctx, x, y + 4, cw, RH - 8, rad); ctx.fill();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = th.accent; ctx.lineWidth = 2; rr(ctx, x + 1, y + 4, cw - 2, RH - 8, rad); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}

export interface RulerState {
  th: Palette; grid: Grid; x0: number; ppt: number; w: number; h: number; range: Range | null; section: boolean;
  loop: { a: number; b: number } | null; loopOn: boolean; hoverT: number | null; hoverLow: boolean; every: number;
}
/** the ruler: bar numbers in the upper half (click or drag there to move the cursor); the lower half is where a stretch
    of time is selected, and shows the selection and the loop */
export function drawRuler(ctx: CanvasRenderingContext2D, R: RulerState) {
  const { th, grid, x0, ppt, w, h } = R, night = th.dark;
  const X = (t: number) => (t - x0) * ppt, H2 = Math.round(h / 2);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = th.alt; ctx.fillRect(0, 0, w, H2);
  ctx.fillStyle = th.base; ctx.fillRect(0, H2, w, h - H2);
  if (R.range) {
    const a = X(R.range.a), b = X(R.range.b);
    ctx.fillStyle = th.accentSoft; ctx.fillRect(a, H2, b - a, h - H2);
    ctx.fillStyle = th.accent; ctx.fillRect(a, h - 3, b - a, 3);
  }
  const b0 = grid.barAt(x0), b1 = grid.barAt(x0 + w / ppt) + 1, pxBar = (grid.tickOf(1) - grid.tickOf(0) || 1920) * ppt;
  const tick = [1, 2, 4].find(k => k * pxBar >= 7) ?? 4;
  ctx.font = night ? `700 ${Math.round(12 * 1.14)}px ${F.gar}` : `italic 900 12px ${F.disp}`;
  for (let b = b0; b <= b1; b++) {
    if (b % tick) continue;
    const x = Math.round(X(grid.tickOf(b))) + .5, big = b % R.every === 0;
    ctx.fillStyle = th.muted; ctx.globalAlpha = big ? 1 : .7;
    ctx.fillRect(x - .5, big ? 3 : H2, 1, big ? h - 3 : h - H2);
    ctx.globalAlpha = 1;
    if (big) { ctx.fillStyle = th.ink2; ctx.fillText(String(b + 1), x + 5, H2 - 3); }
  }
  // beats when zoomed in
  if (pxBar > 90) {
    ctx.fillStyle = th.muted; ctx.globalAlpha = .5;
    for (let b = b0; b <= b1; b++) { const a = grid.tickOf(b), e = grid.tickOf(b + 1), bt = grid.beat(a); for (let t = a + bt; t < e - 1; t += bt) ctx.fillRect(Math.round(X(t)), h - 6, 1, 6); }
    ctx.globalAlpha = 1;
  }
  if (R.loop) drawLoop(ctx, th, X(R.loop.a), X(R.loop.b), H2, R.loopOn);
  ctx.fillStyle = th.hair; ctx.fillRect(0, H2 - .5, w, 1);
  if (R.hoverT !== null) {
    ctx.fillStyle = th.accent; ctx.globalAlpha = .55;
    ctx.fillRect(Math.round(X(R.hoverT)), R.hoverLow ? H2 : 0, 1, R.hoverLow ? h - H2 : H2);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = th.hair; ctx.fillRect(0, h - 1, w, 1);
}
