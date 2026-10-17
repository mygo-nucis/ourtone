import type { Grid } from '../../lib/project/ops';

/* where the arrange timeline is looking: the tick at its left edge and the zoom (pixels per tick),
   plus the row sizes, which shrink on a phone */
export const INSPECT = 264;
export class ArrangeView {
  rh = $state(50);
  head = $state(236);
  ruler = $state(30);
  compact = $state(false);
  x0 = $state(0);
  ppt = $state(.02);
  scrollY = $state(0);
  width = $state(940);
  fitted = false;
  /** the song (transport.gen) the view was framed for */
  gen = -1;
  xOf(t: number) { return (t - this.x0) * this.ppt; }
  tOf(x: number) { return this.x0 + x / this.ppt; }
  /** show `bars` bars from the start */
  fit(grid: Grid, bars = 24) {
    const b = Math.min(bars, grid.bars.length);
    this.ppt = this.width / Math.max(1, grid.tickOf(b));
    this.x0 = 0;
    this.fitted = true;
  }
  clampX(grid: Grid) {
    const span = this.width / this.ppt, max = Math.max(0, grid.end - span * .9);
    this.x0 = Math.max(0, Math.min(max, this.x0));
  }
  zoomAt(x: number, factor: number, grid: Grid) {
    const t = this.tOf(x), bar = grid.tickOf(1) || 1920;
    this.ppt = Math.max(6 / bar, Math.min(600 / bar, this.ppt * factor));
    this.x0 = t - x / this.ppt;
    this.clampX(grid);
  }
}
/* the view outlives the arrange view itself: going back to it finds it where it was left */
export const arrangeView = new ArrangeView();
