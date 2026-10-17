import type { Grid } from '../../lib/project/ops';

/* where the piano roll is looking: time across (tick at the left edge, pixels per tick), pitch down (the pitch in the top row,
   pixels per row). regions are measured from the top of the roll: ruler, chord lane, the grid, then velocity and the overview. */
export const LP = 256, RP = 260, KW = 62;
export class RollView {
  x0 = $state(0);
  ppt = $state(.05);
  width = $state(854);
  top = $state(76);
  rh = $state(24);
  /** the whole roll's height; the regions follow from it */
  H = $state(760);
  /** which song and part the pitches were last centred for, and which song the time was framed for */
  fitKey = '';
  spanGen = -1;
  /** a stretch to show when the view next opens (a double-click in the arrange view asks for one) */
  want: { a: number; b: number } | null = null;
  /** on a phone: a shorter ruler and chord lane, no velocity lane */
  compact = $state(false);
  get R() {
    const H = this.H;
    if (this.compact) return { ruler: [0, 24], chords: [24, 58], grid: [58, H - 38], vel: [H - 38, H - 38], over: [H - 30, H - 6], sep1: H - 38, sep2: H - 36 } as const;
    return { ruler: [0, 28], chords: [28, 82], grid: [82, H - 174], vel: [H - 148, H - 54], over: [H - 34, H - 6], sep1: H - 164, sep2: H - 42 } as const;
  }
  get gridH() { const g = this.R.grid; return g[1] - g[0]; }
  xOf(t: number) { return (t - this.x0) * this.ppt; }
  tOf(x: number) { return this.x0 + x / this.ppt; }
  /** top edge of pitch p's row, from the top of the grid */
  yOf(p: number) { return (this.top - p) * this.rh; }
  pAt(y: number) { return this.top - Math.floor(y / this.rh); }
  get rows() { return this.gridH / this.rh; }
  /** show ticks a..b across the grid */
  span(a: number, b: number) { this.ppt = this.width / Math.max(1, b - a); this.x0 = a; }
  /** put pitches lo..hi in view, centred */
  centre(lo: number, hi: number) {
    const rows = Math.floor(this.rows), mid = (lo + hi) / 2;
    this.top = Math.min(127, Math.max(rows - 1, Math.round(mid + rows / 2)));
  }
  scrollRows(d: number) { this.top = Math.max(Math.floor(this.rows) - 1, Math.min(127, this.top + d)); }
  /** what to show around tick t: a selection there of eight bars at most, whole; else as much as the view shows now
      (four bars, the first time), from a bar or so before t's bar */
  around(g: Grid, t: number, sel: { a: number; b: number } | null, framed: boolean) {
    const bar = g.barAt(t);
    if (sel && t >= sel.a && t < sel.b && g.barAt(sel.b - 1) - g.barAt(sel.a) < 8) return { a: sel.a, b: sel.b };
    const span = framed ? this.width / this.ppt : g.tickOf(bar + 4) - g.tickOf(bar), at = g.tickOf(bar);
    const a = g.tickOf(g.barAt(Math.max(0, at - span * .2)));
    return { a, b: a + span };
  }
}
/* the views outlive the track view itself: going back to it finds it where it was left */
export const rollView = new RollView();
