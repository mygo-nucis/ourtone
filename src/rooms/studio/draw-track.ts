import type { Palette } from '../../lib/art/palette';
import { partColor, rgba } from '../../lib/art/palette';
import { F } from '../../lib/art/type';
import type { EditPart, Note } from '../../lib/project/doc';
import type { Grid } from '../../lib/project/ops';
import type { Chord } from '../../lib/music/harmony';
import { jianpu } from '../../lib/music/harmony';
import { MODES, pitchName, usesFlats } from '../../lib/music/theory';
import type { Mode } from '../../lib/music/types';
import { KW, type RollView } from './track.svelte';
import { drawLoop, loopColor } from './draw-arrange';

/* the piano roll, drawn on one canvas: ruler, chord lane, keys and grid, notes, velocities and a whole-track overview.
   by day the rows are ruled like a notebook with the chord tones marked in yellow highlighter, notes are blue capsules;
   by night the grid is dark glass with crimson rules and gold chord outlines, notes are bone bars with lozenge heads. */
export interface RollState {
  th: Palette; v: RollView; W: number; grid: Grid;
  part: EditPart; ref: EditPart | null; drums: boolean;
  key: { tonic: number; mode: Mode }; home: number;
  chords: (Chord | null)[];
  picked: ReadonlySet<Note>;
  noteGrid: number;
  notation: 'letter' | 'jianpu';
  /** the selected stretch of time (ruler, lower half) and the loop, both in ticks */
  range: { a: number; b: number } | null;
  loop: { a: number; b: number } | null; loopOn: boolean;
  /** notes that start together fan out in the velocity lane by this many pixels */
  fan: Map<Note, number>;
  marquee: { x0: number; y0: number; x1: number; y1: number } | null;
  hoverP: number | null;
  /** the song's length in ticks, for the overview */
  total: number;
  /** lane labels: chords, velocity, whole track */
  labels: [string, string, string];
  lang: 'zh' | 'en';
}

/* General MIDI drum names for the key column of a drum part */
const DRUM: Record<number, [string, string]> = {
  35: ['底鼓', 'Kick'], 36: ['底鼓', 'Kick'], 37: ['边击', 'Rim'], 38: ['军鼓', 'Snare'], 39: ['拍手', 'Clap'], 40: ['军鼓', 'Snare'],
  41: ['落地嗵', 'Floor tom'], 42: ['闭镲', 'Hat'], 43: ['落地嗵', 'Floor tom'], 44: ['踩镲', 'Pedal hat'], 45: ['低嗵', 'Low tom'], 46: ['开镲', 'Open hat'],
  47: ['中嗵', 'Mid tom'], 48: ['高嗵', 'High tom'], 49: ['吊镲', 'Crash'], 50: ['高嗵', 'High tom'], 51: ['叮叮镲', 'Ride'], 52: ['中国镲', 'China'],
  53: ['镲帽', 'Bell'], 54: ['铃鼓', 'Tambourine'], 55: ['水镲', 'Splash'], 56: ['牛铃', 'Cowbell'], 57: ['吊镲', 'Crash'], 59: ['叮叮镲', 'Ride'],
  60: ['邦戈', 'Bongo'], 61: ['邦戈', 'Bongo'], 62: ['康加', 'Conga'], 63: ['康加', 'Conga'], 64: ['康加', 'Conga'], 69: ['沙锤', 'Cabasa'], 70: ['沙锤', 'Maracas'], 75: ['响棒', 'Claves'], 76: ['木鱼', 'Woodblock'], 77: ['木鱼', 'Woodblock']
};

const f1 = (v: number) => Math.round(v * 2) / 2;
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else ctx.rect(x, y, w, h);
}
function lozenge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .72, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * .72, y); ctx.closePath();
}
/** mostly one note at a time (few onsets shared by several notes) */
const singles = new WeakMap<Note[], boolean>();
function single(ns: Note[]) {
  let v = singles.get(ns);
  if (v === undefined) {
    let onsets = 0, chords = 0;
    for (let i = 0; i < ns.length; i++) {
      if (i && ns[i].t === ns[i - 1].t) { if (i < 2 || ns[i - 2].t !== ns[i].t) chords++; continue; }
      onsets++;
    }
    v = chords <= onsets * .15;
    singles.set(ns, v);
  }
  return v;
}
const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

export function drawRoll(ctx: CanvasRenderingContext2D, S: RollState) {
  const { th, v, W, grid } = S, R = v.R, night = th.dark;
  const GX0 = KW, GX1 = W - 8, GW = GX1 - GX0, G0 = R.grid[0], G1 = R.grid[1];
  const X = (t: number) => GX0 + (t - v.x0) * v.ppt;
  const t0 = v.x0, t1 = v.x0 + GW / v.ppt;
  const steps = MODES[S.key.mode], inKey = (m: number) => steps.includes(((m - S.key.tonic) % 12 + 12) % 12);
  const flats = usesFlats(S.key.tonic, S.key.mode);
  const rowY = (p: number) => G0 + v.yOf(p), rowC = (p: number) => rowY(p) + v.rh / 2;
  const pTop = v.top, pBot = Math.max(0, Math.ceil(v.top - v.rows));
  ctx.clearRect(0, 0, W, v.H);
  ctx.fillStyle = th.page; ctx.fillRect(0, 0, W, v.H);

  /* the grid's ground */
  ctx.save(); ctx.beginPath(); ctx.rect(GX0, G0, GW, G1 - G0); ctx.clip();
  if (night) { const g = ctx.createLinearGradient(0, G0, 0, G1); g.addColorStop(0, '#1A1419'); g.addColorStop(1, '#121015'); ctx.fillStyle = g; ctx.fillRect(GX0, G0, GW, G1 - G0); }
  // rows outside the key are shaded (a drum part just alternates)
  for (let p = pTop; p >= pBot; p--) if (S.drums ? p % 2 === 1 : !inKey(p)) { ctx.fillStyle = night ? 'rgba(0,0,0,.3)' : 'rgba(28,32,48,.03)'; ctx.fillRect(GX0, rowY(p) + (S.drums ? 0 : 3), GW, v.rh - (S.drums ? 0 : 6)); }
  if (!night && v.rh >= 14) {
    ctx.fillStyle = th.dotGrid;
    const sub = S.noteGrid, step = sub * v.ppt >= 12 ? sub : sub * 2 * v.ppt >= 12 ? sub * 2 : 0;
    if (step) for (let p = pTop; p >= pBot; p--) { const y = rowC(p); for (let t = Math.ceil(t0 / step) * step + step / 2; t < t1; t += step) { ctx.beginPath(); ctx.arc(X(t), y, .9, 0, Math.PI * 2); ctx.fill(); } }
  }
  // chord tones in each bar: a highlighter stroke by day, a gold outline by night
  if (!S.drums) {
    const b0 = grid.barAt(t0), b1 = grid.barAt(t1);
    for (let b = b0; b <= b1; b++) {
      const c = S.chords[b];
      if (!c) continue;
      const xa = X(grid.tickOf(b)), xe = X(grid.tickOf(b + 1));
      for (let p = pTop; p >= pBot; p--) if (c.tones.includes(((p % 12) + 12) % 12)) {
        const y = rowC(p) - Math.min(8, v.rh / 3);
        if (night) { ctx.fillStyle = rgba('#D8B46A', .08); ctx.strokeStyle = rgba('#D8B46A', .45); ctx.lineWidth = 1; ctx.beginPath(); ctx.rect(xa + 6, y, xe - xa - 12, Math.min(16, v.rh * .66)); ctx.fill(); ctx.stroke(); }
        else { ctx.fillStyle = rgba('#FBE38A', .75); rr(ctx, xa + 6, y, xe - xa - 12, Math.min(16, v.rh * .66), 8); ctx.fill(); }
      }
    }
  }
  // ruled lines for the notes of the key, the tonic marked
  if (!S.drums) for (let p = pTop; p >= pBot; p--) if (inKey(p)) {
    const tonic = ((p - S.key.tonic) % 12 + 12) % 12 === 0;
    ctx.fillStyle = tonic ? th.accent : th.rule; ctx.globalAlpha = tonic ? .7 : 1;
    ctx.fillRect(GX0, Math.round(rowC(p)) - (tonic ? .65 : .5), GW, tonic ? 1.3 : 1);
    ctx.globalAlpha = 1;
  }
  // beats (dashed) and bars
  {
    const b0 = grid.barAt(t0), b1 = grid.barAt(t1) + 1;
    ctx.strokeStyle = th.accent; ctx.globalAlpha = .35; ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
    for (let b = b0; b <= b1; b++) { const a = grid.tickOf(b), e = grid.tickOf(b + 1), bt = grid.beat(a); for (let t = a + bt; t < e - 1; t += bt) { const x = Math.round(X(t)) + .5; ctx.beginPath(); ctx.moveTo(x, G0); ctx.lineTo(x, G1); ctx.stroke(); } }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  ctx.restore();
  {
    const b0 = grid.barAt(t0), b1 = grid.barAt(t1) + 1;
    ctx.fillStyle = night ? 'rgba(237,230,225,.3)' : 'rgba(28,32,48,.3)';
    for (let b = b0; b <= b1; b++) { const x = Math.round(X(grid.tickOf(b))); if (x >= GX0 && x <= GX1) ctx.fillRect(x - .6, R.ruler[1], 1.2, G1 - R.ruler[1]); }
  }

  /* ruler */
  const RB = R.ruler[1];
  ctx.fillStyle = th.alt; ctx.fillRect(GX0, 0, GW, RB);
  const RH2 = Math.round(RB / 2);
  if (S.range) { const a = Math.max(GX0, X(S.range.a)), b = Math.min(GX1, X(S.range.b)); if (b > a) { ctx.fillStyle = th.accentSoft; ctx.fillRect(a, RH2, b - a, RB - RH2); ctx.fillStyle = th.accent; ctx.fillRect(a, RB - 3, b - a, 3); } }
  if (S.loop) {
    const a = Math.max(GX0, X(S.loop.a)), b = Math.min(GX1, X(S.loop.b));
    if (b > a) {
      drawLoop(ctx, th, a, b, RH2, S.loopOn);
      // while it loops, a faint band down the grid too
      if (S.loopOn) { ctx.fillStyle = rgba(loopColor(th), night ? .06 : .08); ctx.fillRect(a, RB, b - a, G1 - RB); }
    }
  }
  ctx.fillStyle = th.hair; ctx.fillRect(GX0, RH2 - .5, GW, 1);
  ctx.fillStyle = th.hair; ctx.fillRect(0, RB - .5, W, 1);
  {
    const b0 = grid.barAt(t0), b1 = grid.barAt(t1) + 1, pxBar = (grid.tickOf(1) - grid.tickOf(0)) * v.ppt, every = [1, 2, 4, 8].find(k => k * pxBar >= 40) ?? 8;
    ctx.font = night ? `700 ${Math.round(13 * 1.14)}px ${F.gar}` : `italic 900 13px ${F.disp}`;
    for (let b = b0; b <= b1; b++) {
      const x = Math.round(X(grid.tickOf(b))) + .5;
      if (x < GX0 - 1 || x > GX1 + 1) continue;
      ctx.fillStyle = th.muted; ctx.fillRect(x - .5, 3, 1, RB - 3);
      if (b % every === 0) { ctx.fillStyle = th.ink2; ctx.fillText(String(b + 1), x + 5, RH2 - 3); }
      const a = grid.tickOf(b), e = grid.tickOf(b + 1), bt = grid.beat(a);
      ctx.globalAlpha = .8;
      for (let t = a + bt; t < e - 1; t += bt) { const xx = Math.round(X(t)) + .5; if (xx > GX0 && xx < GX1) ctx.fillRect(xx - .5, RB - 10, 1, 10); }
      ctx.globalAlpha = .5;
      if (S.noteGrid * v.ppt >= 6) for (let t = a + S.noteGrid; t < e - 1; t += S.noteGrid) { const xx = Math.round(X(t)) + .5; if (xx > GX0 && xx < GX1) ctx.fillRect(xx - .5, RB - 4, 1, 4); }
      ctx.globalAlpha = 1;
    }
  }

  /* chord lane */
  ctx.fillStyle = th.hair; ctx.fillRect(0, R.chords[1] - .5, GX1, 1);
  if (!S.drums) {
    const b0 = grid.barAt(t0), b1 = grid.barAt(t1);
    let prev: Chord | null = b0 > 0 ? S.chords[b0 - 1] : null;
    for (let b = b0; b <= b1; b++) {
      const c = S.chords[b], x = X(grid.tickOf(b)), xe = X(grid.tickOf(b + 1));
      if (x > GX1) break;
      const C0 = R.chords[0], C1 = R.chords[1], small = C1 - C0 < 44;
      if (!c) { prev = null; continue; }
      const rep = !!prev && prev.degree === c.degree;
      ctx.save(); ctx.beginPath(); ctx.rect(GX0, C0, GW, C1 - C0); ctx.clip();
      ctx.globalAlpha = rep ? .35 : 1;
      ctx.fillStyle = night ? th.accent : th.ink; ctx.font = `900 ${small ? 17 : 22}px ${F.serif}`;
      drawAcc(ctx, c.name, x + 12, small ? C0 + 22 : C0 + 28, small ? 17 : 22);
      if (!small) {
        ctx.globalAlpha = rep ? .45 : 1;
        ctx.fillStyle = night ? '#D8B46A' : th.muted; ctx.font = `700 12px ${F.serif}`;
        ctx.fillText(c.roman, x + 13, C1 - 8);
      }
      ctx.restore(); ctx.globalAlpha = 1;
      prev = c;
    }
  }

  /* keys */
  ctx.fillStyle = th.ivory; ctx.fillRect(0, G0, KW, G1 - G0);
  ctx.save(); ctx.beginPath(); ctx.rect(0, G0, KW, G1 - G0); ctx.clip();
  for (let p = pTop; p >= pBot; p--) {
    const y = rowY(p), pc = ((p % 12) + 12) % 12;
    if (p === S.hoverP) { ctx.fillStyle = th.accent; ctx.globalAlpha = night ? .35 : .18; ctx.fillRect(0, y, KW, v.rh); ctx.globalAlpha = 1; }
    if (S.drums) { ctx.fillStyle = th.keyLine; ctx.fillRect(0, y - .5, KW, 1); continue; }
    if (isBlack(p)) { ctx.fillStyle = th.keyLine; ctx.fillRect(KW * .6, y + v.rh / 2 - .5, KW * .4, 1); }
    if (pc === 11 || pc === 4) { ctx.fillStyle = th.keyLine; ctx.fillRect(0, y - .5, KW, 1); }
  }
  for (let p = pTop; p >= pBot; p--) {
    const y = rowY(p), pc = ((p - S.key.tonic) % 12 + 12) % 12;
    if (isBlack(p) && !S.drums) {
      ctx.fillStyle = th.ebony; rr(ctx, 0, y + 2, KW * .6, v.rh - 4, night ? 0 : 2.5); ctx.fill();
      if (night) { ctx.fillStyle = 'rgba(216,180,106,.5)'; ctx.fillRect(KW * .6 - .5, y + 2, 1, v.rh - 4); }
    }
    if (S.drums && v.rh >= 12) {
      const nm = DRUM[p];
      if (nm) { ctx.fillStyle = p === S.hoverP ? th.accent : th.keyText; ctx.font = `700 ${S.lang === 'zh' ? 10 : 9}px ${F.sans}`; ctx.textAlign = 'right'; ctx.fillText(nm[S.lang === 'zh' ? 0 : 1], KW - 5, y + v.rh / 2 + 4); ctx.textAlign = 'left'; }
    } else if (inKey(p) && v.rh >= 12) {
      const tonic = pc === 0, on = p === S.hoverP;
      ctx.fillStyle = tonic ? th.accent : on ? (night ? '#8E1728' : th.accentD) : th.keyText;
      ctx.font = `${tonic || on ? 900 : 700} 10px ${F.sans}`;
      ctx.textAlign = 'right';
      if (S.notation === 'jianpu' && !S.drums) {
        const j = jianpu(p, S.key.tonic, S.key.mode, S.home);
        const tx = KW - 6, ty = y + v.rh / 2 + 4;
        ctx.fillText(j.num, tx, ty);
        for (let k = 0; k < Math.abs(j.oct) && k < 3; k++) { ctx.beginPath(); ctx.arc(tx - 3, j.oct > 0 ? ty - 10 - k * 3 : ty + 3 + k * 3, 1.1, 0, Math.PI * 2); ctx.fill(); }
      } else drawAcc(ctx, pitchName(p, flats) + (tonic ? String(Math.floor(p / 12) - 1) : ''), KW - 5, y + v.rh / 2 + 4, 10, true);
      ctx.textAlign = 'left';
    }
  }
  ctx.restore();
  ctx.fillStyle = night ? 'rgba(216,180,106,.4)' : th.hair; ctx.fillRect(GX0 - .5, G0, 1, G1 - G0);

  /* notes */
  ctx.save(); ctx.beginPath(); ctx.rect(GX0, G0, GW, G1 - G0); ctx.clip();
  const pad = 2, capH = Math.min(12, v.rh * .5), headR = Math.min(7, v.rh * .3);
  if (S.ref && !S.drums) {
    const refCol = partColor(th, S.ref.meta.color, true);
    ctx.fillStyle = refCol; ctx.globalAlpha = night ? .5 : .42;
    for (const n of S.ref.notes) {
      if (n.t > t1) break;
      if (n.t + n.d < t0 || n.p > pTop || n.p < pBot) continue;
      const x0 = X(n.t) + 2, x1 = Math.max(x0 + 8, X(n.t + n.d) - 2);
      rr(ctx, x0, rowC(n.p) - Math.min(4, v.rh / 5), x1 - x0, Math.min(8, v.rh * .4), night ? 0 : 4); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const notes = S.part.notes, col = S.drums ? partColor(th, S.part.meta.color, true) : night ? th.ink : partColor(th, S.part.meta.color, true);
  const melodyCol = night ? th.ink : (S.part.meta.role === 'melody' ? th.melody : col);
  // the melodic line, faint, for parts that play one note at a time; it breaks at rests longer than half a bar
  if (!S.drums && single(notes)) {
    ctx.strokeStyle = th.melody; ctx.globalAlpha = night ? .18 : .28; ctx.lineWidth = 1.3; ctx.lineJoin = 'round';
    ctx.beginPath();
    let lastT = -1, lastEnd = -Infinity;
    for (const n of notes) {
      if (n.t + n.d < t0 - 2000) continue;
      if (n.t > t1 + 2000) break;
      if (n.t === lastT) continue;
      const x = X(n.t) + 8, y = rowC(n.p), rest = n.t - lastEnd > (grid.tickOf(grid.barAt(n.t) + 1) - grid.tickOf(grid.barAt(n.t))) / 2;
      if (rest) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      lastT = n.t; lastEnd = Math.max(lastEnd, n.t + n.d);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  for (const n of notes) {
    if (n.t > t1) break;
    if (n.t + n.d < t0 || n.p > pTop + 1 || n.p < pBot - 1) continue;
    const sel = S.picked.has(n), x0 = X(n.t) + pad, x1 = Math.max(x0 + 14, X(n.t + n.d) - pad), y = rowC(n.p);
    const alpha = .35 + .65 * Math.pow(n.v / 127, .7);
    if (night) {
      ctx.globalAlpha = sel ? 1 : .85 * (.55 + .45 * alpha);
      ctx.fillStyle = sel ? th.accent : melodyCol; ctx.fillRect(x0 + 6, y - 2.5, x1 - x0 - 6, 5);
      ctx.globalAlpha = sel ? 1 : .55 + .45 * alpha;
      lozenge(ctx, x0 + 7, y, Math.min(9, v.rh * .38)); ctx.fillStyle = sel ? th.accent : melodyCol; ctx.fill();
      if (sel) { ctx.strokeStyle = '#D8B46A'; ctx.lineWidth = 1.2; ctx.stroke(); }
    } else {
      ctx.globalAlpha = sel ? 1 : .55 + .45 * alpha;
      ctx.fillStyle = sel ? th.accentD : melodyCol;
      rr(ctx, x0, y - capH / 2, x1 - x0, capH, capH / 2); ctx.fill();
      if (sel) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(x0 + 6, y, headR, 0, Math.PI * 2); ctx.fill();
      if (sel) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }
  if (S.marquee) {
    const m = S.marquee, x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1), w = Math.abs(m.x1 - m.x0), h = Math.abs(m.y1 - m.y0);
    ctx.fillStyle = rgba(night ? '#C4293E' : '#2F86E8', .1); ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = night ? '#D8B46A' : th.accent; ctx.lineWidth = 1.3; ctx.setLineDash([4, 3]); ctx.strokeRect(x + .5, y + .5, w, h); ctx.setLineDash([]);
  }
  ctx.restore();
  ctx.fillStyle = th.hair; ctx.fillRect(0, G1 - .5, GX1, 1);

  /* velocity */
  ctx.fillStyle = th.hair; ctx.fillRect(0, R.sep1, GX1, 1);
  const VY0 = R.vel[0], VY1 = R.vel[1], hasVel = VY1 - VY0 > 10;
  ctx.strokeStyle = th.hair; ctx.setLineDash([3, 4]);
  if (hasVel) for (const vv of [64, 127]) { const y = Math.round(VY1 - vv / 127 * (VY1 - VY0)) + .5; ctx.beginPath(); ctx.moveTo(GX0, y); ctx.lineTo(GX1, y); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.save(); ctx.beginPath(); ctx.rect(GX0, VY0 - 8, GW, VY1 - VY0 + 10); ctx.clip();
  if (hasVel) for (const n of notes) {
    if (n.t > t1) break;
    if (n.t < t0 - 10) continue;
    const sel = S.picked.has(n), x = X(n.t) + 9 + (S.fan.get(n) ?? 0), h = n.v / 127 * (VY1 - VY0);
    const c = sel ? (night ? th.accent : th.accentD) : (night ? th.ink2 : th.accent);
    ctx.fillStyle = c; ctx.fillRect(x - 1.2, VY1 - h, 2.4, h);
    if (night) { lozenge(ctx, x, VY1 - h, 5.5); ctx.fill(); } else { ctx.beginPath(); ctx.arc(x, VY1 - h, 4, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();

  /* overview of the whole part */
  ctx.fillStyle = th.hair; ctx.fillRect(0, R.sep2, GX1, 1);
  const OY0 = R.over[0], OY1 = R.over[1], total = Math.max(1, S.total), ox = (t: number) => GX0 + t / total * GW;
  let lo = 127, hi = 0;
  for (const n of notes) { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }
  if (hi < lo) { lo = 60; hi = 72; }
  ctx.fillStyle = night ? th.ink2 : th.accent; ctx.globalAlpha = .55;
  for (const n of notes) { const x = ox(n.t); ctx.fillRect(x, OY1 - 3 - (hi === lo ? .5 : (n.p - lo) / (hi - lo)) * (OY1 - OY0 - 6), Math.max(1, ox(n.t + n.d) - x), 1.6); }
  ctx.globalAlpha = 1;
  const va = ox(t0), vb = ox(t1);
  ctx.fillStyle = th.accentSoft; rr(ctx, va - 2, OY0 - 4, vb - va + 4, OY1 - OY0 + 8, night ? 0 : 3); ctx.fill();
  ctx.strokeStyle = th.accent; ctx.lineWidth = 1.5; ctx.stroke();

  /* lane labels in the key column */
  ctx.fillStyle = th.muted; ctx.font = `700 11px ${F.sans}`; ctx.textAlign = 'center';
  const ys = [(R.chords[0] + R.chords[1]) / 2 + 4, (VY0 + VY1) / 2 + 4, (OY0 + OY1) / 2 + 4];
  S.labels.forEach((l, i) => { if ((i === 0 && S.drums) || (i === 1 && !hasVel)) return; ctx.fillText(l, KW / 2, ys[i]); });
  ctx.textAlign = 'left';
  return { GX0, GX1 };
}

/** text with ♯ and ♭ set smaller and raised, as elsewhere on the site */
export function drawAcc(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, right = false) {
  const parts = s.split(/([♯♭])/).filter(Boolean);
  const base = ctx.font, small = base.replace(/(\d+(\.\d+)?)px/, `${(size * .8).toFixed(1)}px`);
  const widths = parts.map(p => { ctx.font = p === '♯' || p === '♭' ? small : base; return ctx.measureText(p).width - (p === '♯' || p === '♭' ? size * .4 : 0); });
  let cx = right ? x - widths.reduce((a, b) => a + b, 0) : x;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  parts.forEach((p, i) => {
    const acc = p === '♯' || p === '♭';
    ctx.font = acc ? small : base;
    ctx.fillText(p, acc ? cx - size * .2 : cx, acc ? y - size * .3 : y);
    cx += widths[i];
  });
  ctx.font = base; ctx.textAlign = align;
}
export { f1 };
