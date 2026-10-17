/* a part's insert chain: three-band EQ -> drive -> compressor -> chorus.
   neutral settings leave the signal untouched; the compressor and chorus are only wired in while they are on,
   because a compressor always delays its input a few milliseconds (bad for playing along). */

export interface Fx {
  eq: { on: boolean; low: number; mid: number; high: number };
  drive: { on: boolean; amt: number };
  comp: { on: boolean; thr: number; ratio: number; attack: number };
  chorus: { on: boolean; mix: number; rate: number; depth: number };
}
/** the five macro knobs. bright and attack sit neutral at .5; body and grain start at 0 */
export interface Macros { bright: number; body: number; attack: number; grain: number }

export const FX0: Fx = {
  eq: { on: true, low: 0, mid: 0, high: 0 },
  drive: { on: false, amt: .3 },
  comp: { on: false, thr: -18, ratio: 3, attack: .006 },
  chorus: { on: false, mix: .35, rate: .8, depth: .4 }
};
export const MACROS0: Macros = { bright: .5, body: 0, attack: .5, grain: 0 };

export const cloneFx = (f: Fx): Fx => ({ eq: { ...f.eq }, drive: { ...f.drive }, comp: { ...f.comp }, chorus: { ...f.chorus } });
export function fxOf(f?: Partial<Fx>): Fx {
  const b = cloneFx(FX0);
  if (!f) return b;
  return { eq: { ...b.eq, ...f.eq }, drive: { ...b.drive, ...f.drive }, comp: { ...b.comp, ...f.comp }, chorus: { ...b.chorus, ...f.chorus } };
}
export const macrosOf = (m?: Partial<Macros>): Macros => ({ ...MACROS0, ...m });

/** what the chain actually runs: the saved settings with the macros laid on top */
export function effective(f: Fx, m: Macros): Fx {
  const e = cloneFx(f);
  const b = (m.bright - .5) * 2;   // -1..1
  if (Math.abs(b) > .01) { e.eq.on = true; e.eq.high += b * 9; e.eq.mid += b * 1.5; }
  if (m.body > .01) {
    e.eq.on = true; e.eq.low += m.body * 4; e.eq.mid -= m.body * 1;
    if (!e.chorus.on) { e.chorus = { on: true, mix: 0, rate: .6, depth: .45 }; }
    e.chorus.mix = Math.min(.8, e.chorus.mix + m.body * .5);
  }
  const a = (m.attack - .5) * 2;
  if (Math.abs(a) > .02) {
    // slow attack lets the front of each note through before clamping (punchier); a fast one files it down (softer)
    e.comp = a > 0 ? { on: true, thr: -14 - a * 12, ratio: 2 + a * 4, attack: .012 + a * .03 } : { on: true, thr: -12 + a * 14, ratio: 2 - a * 4, attack: .001 };
  }
  if (m.grain > .01) { e.drive = { on: true, amt: Math.min(1, (e.drive.on ? e.drive.amt : 0) + m.grain * .8) }; }
  return e;
}

const dbToGain = (db: number) => Math.pow(10, db / 20);

function driveCurve(amt: number) {
  const n = 1024, c = new Float32Array(n), k = 1 + amt * 14, norm = Math.tanh(k);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
  return c;
}

interface Chorus { input: GainNode; output: GainNode; wetL: GainNode; wetR: GainNode; lfo: OscillatorNode; depthL: GainNode; depthR: GainNode; nodes: AudioNode[] }
function makeChorus(ctx: BaseAudioContext): Chorus {
  const input = ctx.createGain(), output = ctx.createGain();
  input.connect(output);
  const merge = ctx.createChannelMerger(2);
  const dl = ctx.createDelay(.1), dr = ctx.createDelay(.1);
  dl.delayTime.value = .013; dr.delayTime.value = .019;
  const wetL = ctx.createGain(), wetR = ctx.createGain();
  const lfo = ctx.createOscillator(); lfo.frequency.value = .8;
  const depthL = ctx.createGain(), depthR = ctx.createGain();
  lfo.connect(depthL).connect(dl.delayTime);
  lfo.connect(depthR).connect(dr.delayTime);
  input.connect(dl).connect(wetL).connect(merge, 0, 0);
  input.connect(dr).connect(wetR).connect(merge, 0, 1);
  merge.connect(output);
  lfo.start();
  return { input, output, wetL, wetR, lfo, depthL, depthR, nodes: [dl, dr, merge] };
}

interface Eq { lo: BiquadFilterNode; mid: BiquadFilterNode; hi: BiquadFilterNode }
interface Drive { shaper: WaveShaperNode; tone: BiquadFilterNode; post: GainNode; amt: number }
interface Comp { comp: DynamicsCompressorNode; makeup: GainNode }
type Unit = { head: AudioNode; tail: AudioNode };

export class FxChain {
  readonly input: GainNode;
  readonly output: GainNode;
  private eq: Eq | null = null;
  private drive: Drive | null = null;
  private comp: Comp | null = null;
  private chorus: Chorus | null = null;
  private fx: Fx = cloneFx(FX0);
  private active = '';

  constructor(private ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.input.connect(this.output);
  }

  set(fx: Fx) {
    const t = this.ctx.currentTime;
    this.fx = cloneFx(fx);
    const eqOn = fx.eq.on && (fx.eq.low !== 0 || fx.eq.mid !== 0 || fx.eq.high !== 0), driveOn = fx.drive.on && fx.drive.amt > 0;
    if (eqOn) {
      const e = this.eq ??= this.makeEq();
      e.lo.gain.setTargetAtTime(fx.eq.low, t, .02); e.mid.gain.setTargetAtTime(fx.eq.mid, t, .02); e.hi.gain.setTargetAtTime(fx.eq.high, t, .02);
    }
    if (driveOn) {
      const d = this.drive ??= this.makeDrive();
      if (Math.abs(d.amt - fx.drive.amt) > .004) { d.amt = fx.drive.amt; d.shaper.curve = driveCurve(d.amt); }
      d.tone.frequency.setTargetAtTime(11000 - fx.drive.amt * 6500, t, .02);
      // hotter drive comes out louder; bring it back down
      d.post.gain.setTargetAtTime(1 / (1 + fx.drive.amt * 1.4), t, .02);
    }
    if (fx.comp.on) {
      const c = this.comp ??= this.makeComp();
      c.comp.threshold.setTargetAtTime(fx.comp.thr, t, .02);
      c.comp.ratio.setTargetAtTime(fx.comp.ratio, t, .02);
      c.comp.attack.setTargetAtTime(fx.comp.attack, t, .02);
      c.makeup.gain.setTargetAtTime(dbToGain(-fx.comp.thr * (1 - 1 / fx.comp.ratio) * .35), t, .02);
    }
    if (fx.chorus.on) {
      const c = this.chorus ??= makeChorus(this.ctx);
      c.wetL.gain.setTargetAtTime(fx.chorus.mix, t, .02); c.wetR.gain.setTargetAtTime(fx.chorus.mix, t, .02);
      c.lfo.frequency.setTargetAtTime(fx.chorus.rate, t, .02);
      const d = .0005 + fx.chorus.depth * .0035;
      c.depthL.gain.setTargetAtTime(d, t, .02); c.depthR.gain.setTargetAtTime(-d, t, .02);
    }
    const key = [eqOn, driveOn, fx.comp.on, fx.chorus.on].map(Number).join('');
    if (key !== this.active) { this.active = key; this.wire(eqOn, driveOn); }
  }

  private makeEq(): Eq {
    const c = this.ctx;
    const lo = c.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 180; lo.gain.value = 0;
    const mid = c.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = .8; mid.gain.value = 0;
    const hi = c.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 4500; hi.gain.value = 0;
    lo.connect(mid).connect(hi);
    return { lo, mid, hi };
  }
  private makeDrive(): Drive {
    const c = this.ctx;
    const shaper = c.createWaveShaper(); shaper.oversample = '2x';
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.Q.value = .5; tone.frequency.value = 9000;
    const post = c.createGain();
    shaper.connect(tone).connect(post);
    return { shaper, tone, post, amt: -1 };
  }
  private makeComp(): Comp {
    const comp = this.ctx.createDynamicsCompressor(); comp.knee.value = 6; comp.release.value = .18;
    const makeup = this.ctx.createGain();
    comp.connect(makeup);
    return { comp, makeup };
  }

  /** chain the units that are on; with none on the input runs straight to the output */
  private wire(eqOn: boolean, driveOn: boolean) {
    const tails: AudioNode[] = [this.input];
    if (this.eq) tails.push(this.eq.hi);
    if (this.drive) tails.push(this.drive.post);
    if (this.comp) tails.push(this.comp.makeup);
    if (this.chorus) tails.push(this.chorus.output);
    for (const n of tails) { try { n.disconnect(); } catch { /* not connected */ } }
    const units: Unit[] = [];
    if (eqOn && this.eq) units.push({ head: this.eq.lo, tail: this.eq.hi });
    if (driveOn && this.drive) units.push({ head: this.drive.shaper, tail: this.drive.post });
    if (this.fx.comp.on && this.comp) units.push({ head: this.comp.comp, tail: this.comp.makeup });
    if (this.fx.chorus.on && this.chorus) units.push({ head: this.chorus.input, tail: this.chorus.output });
    let tail: AudioNode = this.input;
    for (const u of units) { tail.connect(u.head); tail = u.tail; }
    tail.connect(this.output);
  }
}
