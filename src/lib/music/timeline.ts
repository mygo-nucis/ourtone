/* ticks <-> seconds through the tempo map, and the bar grid through the meter map */
export interface Bar { index: number; tick: number; ticks: number; num: number; den: number }

export class Timeline {
  readonly ppq: number;
  private segTick: number[] = [];
  private segSec: number[] = [];
  private segBpm: number[] = [];
  readonly meters: [number, number, number][];

  constructor(tempos: [number, number][], meters: [number, number, number][], ppq: number) {
    this.ppq = ppq;
    let sec = 0;
    const ts = tempos.length ? tempos : [[0, 120] as [number, number]];
    for (let i = 0; i < ts.length; i++) {
      if (i) sec += (ts[i][0] - ts[i - 1][0]) / ppq * 60 / ts[i - 1][1];
      this.segTick.push(ts[i][0]); this.segSec.push(sec); this.segBpm.push(ts[i][1]);
    }
    this.meters = meters.length ? meters : [[0, 4, 4]];
  }
  private segAtTick(t: number) { let lo = 0, hi = this.segTick.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.segTick[m] <= t) lo = m; else hi = m - 1; } return lo; }
  private segAtSec(s: number) { let lo = 0, hi = this.segSec.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.segSec[m] <= s) lo = m; else hi = m - 1; } return lo; }
  sec(tick: number) { const i = this.segAtTick(tick); return this.segSec[i] + (tick - this.segTick[i]) / this.ppq * 60 / this.segBpm[i]; }
  tick(sec: number) { const i = this.segAtSec(sec); return this.segTick[i] + (sec - this.segSec[i]) * this.segBpm[i] / 60 * this.ppq; }
  bpmAt(tick: number) { return this.segBpm[this.segAtTick(tick)]; }
  get bpm() { return this.segBpm[0]; }
  meterAt(tick: number): [number, number] { let m = this.meters[0]; for (const x of this.meters) if (x[0] <= tick) m = x; return [m[1], m[2]]; }
  /** every bar that starts before `end` */
  bars(end: number): Bar[] {
    const out: Bar[] = [];
    let t = 0, i = 0;
    while (t < end || !out.length) {
      const [num, den] = this.meterAt(t), ticks = Math.round(num * 4 / den * this.ppq);
      out.push({ index: i++, tick: t, ticks, num, den });
      t += ticks;
      if (i > 10000) break;
    }
    return out;
  }
  /** length of the counted beat: a dotted quarter in compound meters (6/8, 9/8, 12/8), else one denominator note */
  beatTicks(num: number, den: number) { return den === 8 && num % 3 === 0 && num > 3 ? this.ppq * 1.5 : this.ppq * 4 / den; }
}
