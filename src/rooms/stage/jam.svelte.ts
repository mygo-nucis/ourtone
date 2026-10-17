import type { Song, Part } from '../../lib/music/song';
import type { Win } from './layout';
import { degreeOf, MODES, drumColumn } from '../../lib/music/theory';

/* playing along on the stage: the chosen part folds onto eight keys by scale degree
   (six for drums: kick, snare, toms, hats, cymbals, hand percussion). a press close to a written note
   plays that exact note — and the rest of its chord; otherwise the key plays freely in the song's key.
   the column mapping is per part, so a window can glide out of play mode after another part is chosen. */
export const KEYS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K'];
const DRUM_HITS = [36, 38, 45, 42, 49, 54];
const WINDOW = .15;

export class Jam {
  part = $state<number | null>(null);
  pressed = new Float64Array(8).fill(-1e9);
  hits = new Map<number, number>();
  private song: Song | null = null;
  private homes = new Map<Part, number>();

  /** columns of the part being played */
  get cols() { return this.song && this.part !== null ? this.colsOf(this.song.parts[this.part]) : 8; }
  set(song: Song | null, part: number | null) {
    if (song !== this.song) this.homes.clear();
    this.song = song;
    this.part = part;
    this.hits.clear();
    this.pressed.fill(-1e9);
  }
  /** the tonic just below the part's median pitch: its home octave on the keys */
  homeOf(p: Part) {
    let h = this.homes.get(p);
    if (h === undefined) {
      const ps = Array.from(p.pitch).sort((a, b) => a - b), med = ps.length ? ps[Math.floor(ps.length / 2)] : 60;
      const tonic = this.song ? this.song.data.key.tonic : 0;
      h = med - (((med - tonic) % 12) + 12) % 12;
      this.homes.set(p, h);
    }
    return h;
  }
  colsOf(p: Part) { return p.drums ? 6 : 8; }
  keyLabel(c: number) { return KEYS[c]; }
  drumCol(n: number) { return drumColumn(n); }
  col(p: Part, i: number) {
    if (p.drums) return drumColumn(p.pitch[i]);
    const m = p.pitch[i], { degree } = degreeOf(m, this.song!.data.key.tonic, this.song!.data.key.mode);
    return degree === 0 && m >= this.homeOf(p) + 12 ? 7 : degree;
  }
  colX(w: Win, p: Part, c: number) { return w.x + 16 * w.k + (c + .5) * (w.w - 32 * w.k) / this.colsOf(p); }
  active() { const now = performance.now(); for (let c = 0; c < 8; c++) if (now - this.pressed[c] < 360) return true; return false; }

  /** a key went down at song time t; returns the pitches to sound */
  press(c: number, t: number, playing: boolean): number[] {
    this.pressed[c] = performance.now();
    const song = this.song, part = this.part;
    if (!song || part === null) return [];
    const p = song.parts[part];
    if (c >= this.colsOf(p)) return [];
    if (playing) {
      let best = -1, bestD = WINDOW;
      let lo = 0, hi = p.n;
      while (lo < hi) { const m = (lo + hi) >> 1; if (p.start[m] < t - WINDOW) lo = m + 1; else hi = m; }
      for (let i = lo; i < p.n && p.start[i] <= t + WINDOW; i++) {
        if (this.hits.has(i) || this.col(p, i) !== c) continue;
        const d = Math.abs(p.start[i] - t);
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best >= 0) {
        const now = performance.now(), out: number[] = [];
        for (let i = lo; i < p.n && p.start[i] <= p.start[best] + .03; i++) {
          if (Math.abs(p.start[i] - p.start[best]) <= .03 && !this.hits.has(i)) { this.hits.set(i, now); out.push(p.pitch[i]); }
        }
        return out;
      }
    }
    if (p.drums) return [DRUM_HITS[c]];
    const steps = MODES[song.data.key.mode], home = this.homeOf(p);
    return [c === 7 ? home + 12 : home + steps[c]];
  }
}
