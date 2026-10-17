import { makeIR, ROOM, HALL } from './ir';

/* the mix: parts feed `dry` directly, `wet` through the reverb and `delay` through a tempo-synced echo.
   master (song trim) -> fader (studio) -> glue compressor -> make-up -> limiter -> soft clipper -> out */
export interface Bus {
  ctx: BaseAudioContext; dry: GainNode; wet: GainNode; delay: GainNode; convolver: ConvolverNode; echo: DelayNode; master: GainNode; fader: GainNode;
  meter?: { l: AnalyserNode; r: AnalyserNode; k: AnalyserNode };
}
export const MASTER = .55;
/** a song's mastering trim, in dB */
export function setTrim(bus: Bus, db = 0) { bus.master.gain.value = MASTER * Math.pow(10, db / 20); }
/** the studio's master fader, in dB */
export function setMasterFader(bus: Bus, db = 0, now = false) {
  const g = db <= -80 ? 0 : Math.pow(10, db / 20);
  if (now) bus.fader.gain.value = g; else bus.fader.gain.setTargetAtTime(g, bus.ctx.currentTime, .015);
}
/** echoes land on the dotted eighth */
export function setEcho(bus: Bus, bpm: number, now = false) {
  const t = Math.min(1.9, .75 * 60 / Math.max(30, bpm));
  if (now) bus.echo.delayTime.value = t; else bus.echo.delayTime.setTargetAtTime(t, bus.ctx.currentTime, .05);
}

export function buildBus(ctx: BaseAudioContext, night: boolean, meters = false): Bus {
  const master = ctx.createGain(); master.gain.value = MASTER;
  const fader = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = .004; comp.release.value = .25;
  const makeup = ctx.createGain(); makeup.gain.value = 1.5;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 1; limiter.ratio.value = 20; limiter.attack.value = .001; limiter.release.value = .06;
  const clip = ctx.createWaveShaper();
  const n = 2048, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); curve[i] = Math.sign(x) * (a < .8 ? a : .8 + .2 * Math.tanh((a - .8) / .2)); }
  clip.curve = curve;
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.buffer = makeIR(ctx, night ? HALL : ROOM);
  const wetOut = ctx.createGain(); wetOut.gain.value = night ? .9 : .75;
  const lowcut = ctx.createBiquadFilter(); lowcut.type = 'highpass'; lowcut.frequency.value = 180;
  wet.connect(lowcut).connect(convolver).connect(wetOut).connect(master);
  // the echo: a darkening feedback loop, a little of it sent on into the reverb
  const delay = ctx.createGain();
  const echo = ctx.createDelay(2); echo.delayTime.value = .45;
  const fb = ctx.createGain(); fb.gain.value = .34;
  const fbLo = ctx.createBiquadFilter(); fbLo.type = 'lowpass'; fbLo.frequency.value = 3200;
  const fbHi = ctx.createBiquadFilter(); fbHi.type = 'highpass'; fbHi.frequency.value = 240;
  const echoOut = ctx.createGain(); echoOut.gain.value = .8;
  const echoVerb = ctx.createGain(); echoVerb.gain.value = .22;
  delay.connect(echo); echo.connect(fb).connect(fbLo).connect(fbHi).connect(echo);
  echo.connect(echoOut).connect(master); echoOut.connect(echoVerb).connect(wet);
  dry.connect(master);
  master.connect(fader).connect(comp).connect(makeup).connect(limiter).connect(clip).connect(ctx.destination);
  const bus: Bus = { ctx, dry, wet, delay, convolver, echo, master, fader };
  if (meters) {
    const split = ctx.createChannelSplitter(2), l = ctx.createAnalyser(), r = ctx.createAnalyser();
    l.fftSize = r.fftSize = 1024;
    clip.connect(split); split.connect(l, 0); split.connect(r, 1);
    // K-weighting (ITU-R BS.1770): a high shelf and a low cut, read as loudness
    const kShelf = ctx.createBiquadFilter(); kShelf.type = 'highshelf'; kShelf.frequency.value = 1680; kShelf.gain.value = 4;
    const kCut = ctx.createBiquadFilter(); kCut.type = 'highpass'; kCut.frequency.value = 38; kCut.Q.value = .5;
    const k = ctx.createAnalyser(); k.fftSize = 2048;
    clip.connect(kShelf).connect(kCut).connect(k);
    bus.meter = { l, r, k };
  }
  return bus;
}

class Engine {
  ctx: AudioContext | null = null;
  bus: Bus | null = null;
  night = false;
  get(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      // a phone gets a somewhat larger output buffer: with the smallest one, any moment the audio thread runs long
      // (a big chord starting) is heard as a crackle or a gap. heardTime() allows for it, so the picture stays in step
      const phone = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
      this.ctx = new AC({ latencyHint: phone ? 'balanced' : 'interactive' });
      this.bus = buildBus(this.ctx, this.night, true);
    }
    return this.ctx;
  }
  /** browsers only start audio after a gesture; call from click/key handlers */
  async unlock() {
    const ctx = this.get();
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* ignored */ } }
  }
  setNight(night: boolean) {
    if (this.night === night) return;
    this.night = night;
    if (this.ctx && this.bus) this.bus.convolver.buffer = makeIR(this.ctx, night ? HALL : ROOM);
  }
  /** audio-clock time that matches what is heard right now (accounts for output latency) */
  heardTime() {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    if (ts && ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) return ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  }
}
export const engine = new Engine();
