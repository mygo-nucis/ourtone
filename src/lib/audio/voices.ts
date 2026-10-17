import type { PluckParams, PianoParams, JobIn } from './dsp';

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** a sounding note. `source`, when there is one, is what ends it (so whatever it feeds can let go).
    `end`: when its nodes stop (as things stand); `steal`: fade it out at once, to make room for another */
export interface Voice { release(when: number): void; source?: AudioScheduledSourceNode; end?: number; steal?(when: number): void }

/* the voices one part has sounding. live playback keeps each part to a few voices, the way a synthesizer does: a pitch
   struck again takes over its own voice, and past the cap the oldest gives way. what gives way is nearly always a
   release tail far down in the mix (a pad keeps ringing for seconds after its note), but every one of them costs the
   audio thread as much as a loud note, and a phone could not keep up with the densest songs. */
export const STEAL = .015;
/** the most voices one part keeps sounding in live playback */
export const VOICES = 24;
export class Poly {
  private v: { voice: Voice; pitch: number; at: number }[] = [];
  constructor(private cap: number) {}
  /** before a note at `when`: drop voices that have ended, then make room */
  room(when: number, pitch: number) {
    const v = this.v;
    for (let i = v.length - 1; i >= 0; i--) if ((v[i].voice.end ?? Infinity) <= when) v.splice(i, 1);
    // (two tracks doubling a note at the same moment both sound, as they always have)
    const same = v.findIndex(x => x.pitch === pitch && x.at < when - .01);
    if (same >= 0) { v[same].voice.steal?.(when); v.splice(same, 1); }
    while (v.length >= this.cap) v.shift()!.voice.steal?.(when);
  }
  add(voice: Voice, pitch: number, when: number) { this.v.push({ voice, pitch, at: when }); }
  clear() { this.v.length = 0; }
}
/** when all of these sources have ended, take `out` out of the graph: finished notes stop costing anything */
export function letGo(sources: AudioScheduledSourceNode[], out: AudioNode) {
  let live = sources.length;
  if (!live) return;
  const done = () => { if (--live === 0) { try { out.disconnect(); } catch { /* already gone */ } } };
  for (const s of sources) s.addEventListener('ended', done, { once: true });
}

/* ---------- envelopes that know their own value, so a release never jumps ---------- */
export class Env {
  constructor(private p: AudioParam, private t0: number, private a: number, private peak: number, private sus: number, private tau: number) {
    p.setValueAtTime(0, t0);
    p.linearRampToValueAtTime(peak, t0 + a);
    p.setTargetAtTime(peak * sus, t0 + a, tau);
  }
  valueAt(t: number) {
    if (t <= this.t0) return 0;
    if (t < this.t0 + this.a) return this.peak * (t - this.t0) / this.a;
    const s = this.peak * this.sus;
    return s + (this.peak - s) * Math.exp(-(t - this.t0 - this.a) / this.tau);
  }
  private relAt = Infinity;
  private relTau = 1;
  release(t: number, rel: number) {
    const v = this.valueAt(t);
    this.p.cancelScheduledValues(t);
    this.p.setValueAtTime(v, t);
    this.p.setTargetAtTime(0, t, rel);
    if (t < this.relAt) { this.relAt = t; this.relTau = rel; }
  }
  /** the level at t, its release included */
  levelAt(t: number) { return t <= this.relAt ? this.valueAt(t) : this.valueAt(this.relAt) * Math.exp(-(t - this.relAt) / this.relTau); }
}

/* ---------- shared per-context material ---------- */
/** where a context's clock stands in the song: an offline render starts partway in. what varies from hit to hit
    follows the song's time, not the clock's, so a song rendered in pieces sounds exactly as it does rendered whole */
const origins = new WeakMap<BaseAudioContext, number>();
export function setOrigin(ctx: BaseAudioContext, songTime: number) { origins.set(ctx, songTime); }

const noiseBufs = new WeakMap<BaseAudioContext, AudioBuffer>();
export function noise(ctx: BaseAudioContext) {
  let b = noiseBufs.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0); let s = 22222;
    for (let i = 0; i < d.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = (s >>> 0) / 4294967296 * 2 - 1; }
    noiseBufs.set(ctx, b);
  }
  return b;
}
const metalBufs = new WeakMap<BaseAudioContext, Record<string, AudioBuffer>>();
/** summed square waves at inharmonic ratios: the classic drum-machine metal, rendered once */
function metal(ctx: BaseAudioContext, kind: 'hat' | 'cym') {
  let m = metalBufs.get(ctx);
  if (!m) { m = {}; metalBufs.set(ctx, m); }
  if (!m[kind]) {
    const fr = kind === 'hat' ? [205.3, 304.4, 369.6, 522.7, 540, 800] : [263, 400, 421, 474, 587, 845, 1127];
    const k = kind === 'hat' ? 1.7 : 1.25, sr = ctx.sampleRate, len = Math.round(sr * 1.5), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    const ph = fr.map((_, i) => i * .37);
    for (let i = 0; i < len; i++) { let v = 0; for (let j = 0; j < fr.length; j++) { ph[j] += fr[j] * k / sr; v += (ph[j] % 1) < .5 ? 1 : -1; } d[i] = v / fr.length; }
    m[kind] = b;
  }
  return m[kind];
}
const waves = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
export function wave(ctx: BaseAudioContext, harm: number[]) {
  let m = waves.get(ctx);
  if (!m) { m = new Map(); waves.set(ctx, m); }
  const key = harm.join(',');
  let w = m.get(key);
  if (!w) { const re = new Float32Array(harm.length + 1), im = new Float32Array(harm.length + 1); harm.forEach((h, i) => { im[i + 1] = h; }); w = ctx.createPeriodicWave(re, im); m.set(key, w); }
  return w;
}
export function pulse(ctx: BaseAudioContext, duty: number) {
  const h: number[] = [];
  for (let n = 1; n <= 48; n++) h.push(2 / (n * Math.PI) * Math.sin(n * Math.PI * duty) * (n % 2 || duty !== .5 ? 1 : 0));
  // PeriodicWave with sine terms only gives the right spectrum; phase does not matter to the ear
  return wave(ctx, h.map(Math.abs));
}

/* ---------- rendered buffers ---------- */
interface Entry { buf: AudioBuffer; rate: number }
export type Renderer = (job: JobIn) => Promise<{ data: Float32Array; rate: number }>;
let renderer: Renderer | null = null;
/** where note buffers get rendered: a worker pool in the browser, inline in tests */
export function setRenderer(r: Renderer) { renderer = r; }
const bank = new Map<string, Promise<Entry>>();
const ready = new Map<string, Entry>();
function render(key: string, job: JobIn): Promise<Entry> {
  let p = bank.get(key);
  if (!p) {
    if (!renderer) throw new Error('no renderer');
    p = renderer(job).then(r => {
      const buf = new AudioBuffer({ length: r.data.length, sampleRate: job.sr, numberOfChannels: 1 });
      buf.copyToChannel(r.data as Float32Array<ArrayBuffer>, 0);
      const e = { buf, rate: r.rate };
      ready.set(key, e);
      return e;
    });
    bank.set(key, p);
  }
  return p;
}

/** forget the buffers rendered for an instrument no part plays any more */
export function dropBank(id: string) {
  const tag = `:${id}:`;
  for (const k of [...bank.keys()]) if (k.includes(tag)) { bank.delete(k); ready.delete(k); }
}

function bufferVoice(dest: AudioNode, e: Entry, when: number, rate: number, gain: number, cutoff: number, rel: number, pan?: number): Voice {
  const ctx = dest.context;
  const src = ctx.createBufferSource(); src.buffer = e.buf; src.playbackRate.value = rate;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(cutoff, 200, 20000); lp.Q.value = .4;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(lp).connect(g);
  let last: AudioNode = g;
  if (pan !== undefined && pan !== 0) { const pn = ctx.createStereoPanner(); pn.pan.value = clamp(pan, -1, 1); g.connect(pn).connect(dest); last = pn; } else g.connect(dest);
  src.start(when);
  letGo([src], last);
  const end = when + e.buf.duration / rate;
  let released = -1, stolen = false;
  const voice: Voice = {
    source: src,
    end,
    release(t: number) {
      if (released >= 0 || stolen || t >= end) return;
      released = t;
      g.gain.setValueAtTime(gain, t);
      g.gain.setTargetAtTime(0, t, rel);
      voice.end = Math.min(end, t + rel * 8);
      src.stop(voice.end);
    },
    steal(t: number) {
      if (stolen || t >= (voice.end ?? end)) return;
      stolen = true;
      const at = Math.max(t, when);
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(released >= 0 && at > released ? gain * Math.exp(-(at - released) / rel) : gain, at);
      g.gain.setTargetAtTime(0, at, STEAL);
      voice.end = Math.min(voice.end ?? end, at + STEAL * 6);
      src.stop(voice.end);
    }
  };
  return voice;
}

/* ---------- instrument definitions ---------- */
export interface Instrument {
  /** schedule a finished note */
  play(dest: AudioNode, when: number, pitch: number, vel: number, dur: number): void;
  /** start a held note (dur: how long it will be held, when that is known) */
  start(dest: AudioNode, when: number, pitch: number, vel: number, dur?: number): Voice;
  /** render whatever buffers these pitches need */
  prepare(ctx: BaseAudioContext, pitches: Iterable<number>): Promise<void>;
  /** optional effect chain between the voices and the part's strip (amp, cabinet) */
  chain?(dest: AudioNode): AudioNode;
}

const NOOP: Voice = { release() { /* nothing */ } };

/** schedule a note whose buffer may still be rendering: play it if it arrives in time */
function withBuffer(key: string, job: () => JobIn, dest: AudioNode, when: number, go: (e: Entry) => Voice, relAt?: number): Voice {
  const e = ready.get(key);
  if (e) { const v = go(e); if (relAt !== undefined) v.release(relAt); return v; }
  let voice: Voice | null = null, rel: number | null = relAt ?? null, stolen: number | null = null;
  render(key, job()).then(e2 => {
    if (dest.context.currentTime > when - .004 || stolen !== null) return;
    voice = go(e2);
    if (rel !== null) voice.release(rel);
  });
  return {
    get end() { return voice ? voice.end : rel !== null ? rel + 1 : undefined; },
    release(t) { rel = t; if (voice) voice.release(t); },
    steal(t) { stolen = t; voice?.steal?.(t); }
  };
}

export interface PluckOpts { p: PluckParams; gain: number; cut0: number; cut1: number; rel: number; spread?: number }
export function pluckInstrument(id: string, o: PluckOpts, chain?: (dest: AudioNode) => AudioNode): Instrument {
  const key = (sr: number, pitch: number) => `pl:${id}:${sr}:${pitch}`;
  const job = (sr: number, pitch: number) => () => ({ kind: 'pluck' as const, sr, pitch, p: o.p });
  const go = (dest: AudioNode, when: number, pitch: number, vel: number) => (e: Entry) => {
    const v = vel / 127;
    return bufferVoice(dest, e, when, e.rate, o.gain * (.16 + .84 * Math.pow(v, 1.5)), o.cut0 + o.cut1 * v * v, o.rel, o.spread ? (pitch - 62) / 40 * o.spread : undefined);
  };
  return {
    play(dest, when, pitch, vel, dur) { const sr = dest.context.sampleRate; withBuffer(key(sr, pitch), job(sr, pitch), dest, when, go(dest, when, pitch, vel), when + dur); },
    start(dest, when, pitch, vel) { const sr = dest.context.sampleRate; return withBuffer(key(sr, pitch), job(sr, pitch), dest, when, go(dest, when, pitch, vel)); },
    async prepare(ctx, pitches) { const sr = ctx.sampleRate; await Promise.all([...new Set(pitches)].map(p => render(key(sr, p), job(sr, p)()))); },
    chain
  };
}

export interface PianoOpts { p: PianoParams; gain: number; cut0: number; cut1: number; rel: number; width: number }
export function pianoInstrument(id: string, o: PianoOpts): Instrument {
  const grid = (pitch: number) => clamp(Math.round((pitch - 21) / 3) * 3 + 21, 21, 108);
  const key = (sr: number, s: number) => `pn:${id}:${sr}:${s}`;
  const job = (sr: number, s: number) => () => ({ kind: 'piano' as const, sr, pitch: s, p: o.p });
  const go = (dest: AudioNode, when: number, pitch: number, vel: number, s: number) => (e: Entry) => {
    const v = vel / 127;
    return bufferVoice(dest, e, when, Math.pow(2, (pitch - s) / 12), o.gain * (.12 + .88 * Math.pow(v, 1.7)), o.cut0 + o.cut1 * Math.pow(v, 1.4) * Math.pow(mtof(pitch) / 262, .3), o.rel, (pitch - 64) / 44 * o.width);
  };
  return {
    play(dest, when, pitch, vel, dur) { const sr = dest.context.sampleRate, s = grid(pitch); withBuffer(key(sr, s), job(sr, s), dest, when, go(dest, when, pitch, vel, s), when + dur); },
    start(dest, when, pitch, vel) { const sr = dest.context.sampleRate, s = grid(pitch); return withBuffer(key(sr, s), job(sr, s), dest, when, go(dest, when, pitch, vel, s)); },
    async prepare(ctx, pitches) { const sr = ctx.sampleRate; await Promise.all([...new Set([...pitches].map(grid))].map(s => render(key(sr, s), job(sr, s)()))); }
  };
}

/** an instrument built from live oscillators: no buffers to prepare */
export function live(voice: (dest: AudioNode, when: number, pitch: number, vel: number) => Voice, chain?: (dest: AudioNode) => AudioNode): Instrument {
  return {
    play(dest, when, pitch, vel, dur) { voice(dest, when, pitch, vel).release(when + dur); },
    start: voice,
    async prepare() { /* nothing to render */ },
    chain
  };
}

/* the option shapes the preset table is written in; patches.ts turns each into a UT-2 patch */
export interface FmOpts { ratio: number; index: number; index1: number; indexTau: number; tine?: { ratio: number; index: number; tau: number }; a: number; tau: number; sus: number; rel: number; trem?: { rate: number; depth: number }; gain: number; detune?: number }
export interface WindOpts { harm: number[]; breath: number; breathQ: number; breathMul: number; a: number; rel: number; vib: number; vibDepth: number; vibDelay: number; gain: number; chiff?: number }
export interface ReedOpts { formants: [number, number, number][]; cut: number; a: number; rel: number; vib: number; vibDepth: number; gain: number }
export interface BowedOpts { voices: number; detune: number; cutMul: number; cutAdd: number; a: number; rel: number; vib: number; vibDepth: number; gain: number; body?: [number, number, number][]; ensemble?: boolean }
export interface OrganOpts { bars: [number, number][]; perc?: { ratio: number; level: number; tau: number }; click: number; a: number; rel: number; gain: number; vib?: number }
export interface SqueezeOpts { musette: number; cut: number; a: number; rel: number; gain: number; bass?: boolean }
export interface ChipOpts { duty: number; a: number; tau: number; sus: number; rel: number; gain: number; vib?: number }
export interface BrassOpts { detune: number; peakMul: number; susMul: number; a: number; rel: number; gain: number }
export interface SynthBassOpts { cut0: number; cut1: number; tau: number; q: number; gain: number; rel: number }

/* amp and cabinet for the driven guitars; one per part per session, so chords distort together */
/** a driven amp and cabinet for a part's notes. `poly`: each string was driven on its own as it was rendered, so only
    the cabinet is shared (a chord's notes never distort one another) */
export function driveChain(drive: number, tone: number, level: number, poly = false) {
  return (dest: AudioNode) => {
    const ctx = dest.context;
    const cab = ctx.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = tone; cab.Q.value = .8;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1600; mid.Q.value = .9; mid.gain.value = 3;
    const low = ctx.createBiquadFilter(); low.type = 'highpass'; low.frequency.value = 75;
    const post = ctx.createGain(); post.gain.value = level;
    cab.connect(mid).connect(low).connect(post).connect(dest);
    if (poly) return cab;
    const pre = ctx.createGain(); pre.gain.value = drive;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
    const sh = ctx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
    sh.curve = curve; sh.oversample = '4x';
    pre.connect(hp).connect(sh).connect(cab);
    return pre;
  };
}

/* ---------- the drum kit, General MIDI note numbers ---------- */
export function kitInstrument(gain: number, style: 'acoustic' | 'electronic' = 'acoustic'): Instrument {
  const hit = (dest: AudioNode, when: number, note: number, vel: number, dur = .25) => {
    const ctx = dest.context, v = Math.pow(vel / 127, 1.25) * gain;
    const out = ctx.createGain(); out.gain.value = 1;
    const pan = ctx.createStereoPanner();
    out.connect(pan).connect(dest);
    // every source this hit starts; when they have all ended, the hit leaves the graph
    const srcs: AudioScheduledSourceNode[] = [];
    const reg = <T extends AudioScheduledSourceNode>(n: T) => { srcs.push(n); return n; };
    sound(ctx, out, pan, when, note, v, dur, reg);
    letGo(srcs, pan);
  };
  const sound = (ctx: BaseAudioContext, out: GainNode, pan: StereoPannerNode, when: number, note: number, v: number, dur: number, reg: <T extends AudioScheduledSourceNode>(n: T) => T) => {
    const tone = (f0: number, f1: number, sweep: number, tau: number, level: number, type: OscillatorType = 'sine') => {
      const o = reg(ctx.createOscillator()); o.type = type;
      o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + sweep);
      const g = ctx.createGain(); g.gain.setValueAtTime(level * v, when); g.gain.setTargetAtTime(0, when + .002, tau);
      o.connect(g).connect(out); o.start(when); o.stop(when + tau * 8 + .02);
    };
    const hiss = (type: BiquadFilterType, f: number, q: number, tau: number, level: number, hp?: number, atk = 0) => {
      const n = reg(ctx.createBufferSource()); n.buffer = noise(ctx); n.loop = true;
      const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const g = ctx.createGain();
      if (atk) { g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(level * v, when + atk); g.gain.setTargetAtTime(0, when + atk, tau); }
      else { g.gain.setValueAtTime(level * v, when); g.gain.setTargetAtTime(0, when + .001, tau); }
      let node: AudioNode = n.connect(flt);
      if (hp) { const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; node = node.connect(h); }
      node.connect(g).connect(out);
      const ms = Math.floor((when + (origins.get(ctx) ?? 0)) * 1000 + 1e-6);
      n.start(when, ((note * 131 + ms) % 150) / 100); n.stop(when + atk + tau * 8 + .02);
    };
    const shimmer = (kind: 'hat' | 'cym', bp: number, hp: number, tau: number, level: number, q = .9) => {
      const n = reg(ctx.createBufferSource()); n.buffer = metal(ctx, kind); n.loop = true;
      const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = bp; b.Q.value = q;
      const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
      const g = ctx.createGain(); g.gain.setValueAtTime(level * v, when); g.gain.setTargetAtTime(0, when + .001, tau);
      n.connect(b).connect(h).connect(g).connect(out);
      n.start(when, (note % 7) * .1); n.stop(when + Math.min(1.35, tau * 8 + .02));
    };
    // the electronic kit's own sounds; anything else it shares with the acoustic kit
    if (style === 'electronic') switch (note) {
      case 35: case 36: tone(150, 43, .09, .3, 1.4); tone(1000, 180, .006, .004, .24, 'triangle'); pan.pan.value = 0; return;
      case 38: case 40: tone(205, 172, .03, .07, .5, 'triangle'); tone(335, 300, .02, .045, .22, 'triangle'); hiss('highpass', note === 40 ? 2600 : 2100, .7, note === 40 ? .12 : .16, 1.1); pan.pan.value = .02; return;
      case 39: [0, .009, .018, .027].forEach((dt, i) => { const n = reg(ctx.createBufferSource()); n.buffer = noise(ctx); const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 1350; b.Q.value = 1.2; const g = ctx.createGain(); g.gain.setValueAtTime(.95 * v, when + dt); g.gain.setTargetAtTime(0, when + dt, i === 3 ? .11 : .005); n.connect(b).connect(g).connect(out); n.start(when + dt, i * .3); n.stop(when + .9); }); pan.pan.value = -.04; return;
      case 42: case 44: shimmer('hat', 10500, 8200, .018, 1.05); pan.pan.value = .22; return;
      case 46: shimmer('hat', 10500, 7600, .2, .85); pan.pan.value = .22; return;
      case 37: tone(1750, 1650, .005, .012, .55, 'triangle'); hiss('bandpass', 2600, 2, .01, .4); return;
      case 49: case 57: shimmer('cym', 7200, 4200, .8, .75, .6); hiss('highpass', 5200, .5, .9, .3); pan.pan.value = note === 49 ? -.28 : .3; return;
      case 41: case 43: case 45: case 47: case 48: case 50: {
        // a machine tom: a short drop into a round body and a click, not a laser sweep
        const f = ({ 41: 70, 43: 84, 45: 100, 47: 118, 48: 138, 50: 160 } as Record<number, number>)[note];
        tone(f * 1.22, f, .045, .2, 1); tone(f * 2.1, f * 2, .02, .03, .14, 'triangle'); hiss('bandpass', 1800, 1, .005, .28);
        pan.pan.value = clamp((note - 45) / 10, -.4, .4); return;
      }
      case 58: {
        // a riser: noise sweeping up to the downbeat, as long as the note
        const len = Math.max(.25, dur), n = reg(ctx.createBufferSource()); n.buffer = noise(ctx); n.loop = true;
        const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 2.2; b.frequency.setValueAtTime(320, when); b.frequency.exponentialRampToValueAtTime(9000, when + len);
        const g = ctx.createGain(); g.gain.setValueAtTime(.0001, when); g.gain.exponentialRampToValueAtTime(.6 * v, when + len * .96); g.gain.linearRampToValueAtTime(0, when + len + .02);
        n.connect(b).connect(g).connect(out); n.start(when); n.stop(when + len + .05); return;
      }
    }
    switch (note) {
      // the kick: its body is under 160 Hz, which a laptop's or phone's speaker barely plays, so a short knock in the low
      // mids and the beater's tick carry it there
      case 35: case 36: tone(160, 46, .07, .16, 1.25); tone(280, 115, .04, .065, .75); tone(1200, 200, .01, .006, .36, 'triangle'); hiss('lowpass', 1800, .7, .006, .18); hiss('bandpass', 3800, 1.2, .004, .3); pan.pan.value = 0; break;
      case 38: case 40: tone(note === 40 ? 210 : 190, 160, .04, .05, .55, 'triangle'); hiss('bandpass', note === 40 ? 3800 : 3000, .7, note === 40 ? .09 : .12, 1.05, 700); pan.pan.value = .02; break;
      // the side stick: the stick's click on the rim and a short knock from the shell
      case 37: hiss('bandpass', 1900, 1.3, .007, 1.1); tone(560, 500, .008, .026, .52); tone(1320, 1250, .004, .007, .24, 'triangle'); break;
      case 39: [0, .011, .022].forEach((dt, i) => { const n = reg(ctx.createBufferSource()); n.buffer = noise(ctx); const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 1150; b.Q.value = 1.1; const g = ctx.createGain(); g.gain.setValueAtTime(1.6 * v, when + dt); g.gain.setTargetAtTime(0, when + dt, i === 2 ? .07 : .006); n.connect(b).connect(g).connect(out); n.start(when + dt, i * .3); n.stop(when + .6); }); pan.pan.value = -.05; break;
      case 42: shimmer('hat', 10000, 7200, .028, .9); pan.pan.value = .28; break;
      case 44: shimmer('hat', 9000, 6500, .045, .6); pan.pan.value = .28; break;
      case 46: shimmer('hat', 10000, 7000, .28, .75); pan.pan.value = .28; break;
      case 41: case 43: case 45: case 47: case 48: case 50: {
        // a tom: the skin drops only a little in pitch (a big sweep is the old disco tom), an overtone that dies fast,
        // the stick and the shell. the low toms ring longer
        const f = ({ 41: 82, 43: 98, 45: 116, 47: 136, 48: 158, 50: 184 } as Record<number, number>)[note], low = (184 - f) / 102;
        tone(f * 1.14, f, .05, .13 + .1 * low, .92); tone(f * 1.6, f * 1.52, .03, .06, .42); tone(f * 2.3, f * 2.1, .02, .05, .3 + .25 * low);
        hiss('bandpass', 2600, .9, .006, .4); hiss('lowpass', f * 5, .7, .05 + .04 * low, .2);
        pan.pan.value = clamp((note - 45) / 10, -.45, .45); break;
      }
      case 49: case 57: shimmer('cym', 8000, 4200, .55, .7, .6); hiss('highpass', 6500, .5, .5, .22); pan.pan.value = note === 49 ? -.32 : .36; break;
      case 52: shimmer('cym', 5200, 2600, .45, .8, .7); hiss('bandpass', 4200, .8, .4, .25); pan.pan.value = .42; break;
      case 55: shimmer('cym', 9000, 5200, .25, .7, .7); pan.pan.value = -.2; break;
      case 51: case 59: shimmer('cym', 6200, 3800, .3, .5, 1.4); tone(4100, 4100, .01, .08, .06); pan.pan.value = .38; break;
      case 53: tone(1050, 1050, .01, .18, .25); tone(1580, 1580, .01, .12, .16); shimmer('cym', 6000, 3500, .2, .3, 2); pan.pan.value = .38; break;
      case 54: hiss('highpass', 7200, .7, .06, .7); hiss('bandpass', 9600, 5, .09, .5); pan.pan.value = .3; break;
      case 56: { const a = reg(ctx.createOscillator()), b = reg(ctx.createOscillator()); a.type = b.type = 'square'; a.frequency.value = 545; b.frequency.value = 810; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 820; bp.Q.value = 2; const g = ctx.createGain(); g.gain.setValueAtTime(.55 * v, when); g.gain.setTargetAtTime(0, when, .07); a.connect(bp); b.connect(bp); bp.connect(g).connect(out); a.start(when); b.start(when); a.stop(when + .6); b.stop(when + .6); pan.pan.value = .15; break; }
      case 60: case 61: case 62: case 63: case 64: case 65: case 66: {
        const f = ({ 60: 420, 61: 310, 62: 220, 63: 250, 64: 180, 65: 340, 66: 270 } as Record<number, number>)[note];
        tone(f * 1.25, f, .03, note === 62 ? .03 : .11, .75); hiss('bandpass', f * 5, 1, .01, .25); pan.pan.value = note < 62 ? -.35 : .3; break;
      }
      case 67: case 68: tone(note === 67 ? 920 : 640, note === 67 ? 920 : 640, .01, .15, .4); tone((note === 67 ? 920 : 640) * 2.76, 1, .01, .05, .1); pan.pan.value = .2; break;
      case 69: case 70: case 82: hiss('highpass', note === 69 ? 5200 : 6500, .8, .03, .5, undefined, .008); pan.pan.value = -.25; break;
      case 71: case 72: tone(note === 71 ? 2300 : 1950, note === 71 ? 2300 : 1950, .01, note === 71 ? .09 : .28, .25); break;
      case 73: case 74: [0, .025, .05, .075].slice(0, note === 73 ? 2 : 4).forEach(dt => { const n = reg(ctx.createBufferSource()); n.buffer = noise(ctx); const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 3800; b.Q.value = 2; const g = ctx.createGain(); g.gain.setValueAtTime(.5 * v, when + dt); g.gain.setTargetAtTime(0, when + dt, .012); n.connect(b).connect(g).connect(out); n.start(when + dt); n.stop(when + dt + .1); }); break;
      case 75: tone(2500, 2500, .01, .025, .5); pan.pan.value = .1; break;
      case 76: case 77: tone(note === 76 ? 1850 : 1350, note === 76 ? 1750 : 1250, .01, .03, .6, 'triangle'); pan.pan.value = -.15; break;
      case 78: case 79: tone(note === 78 ? 520 : 780, note === 78 ? 820 : 520, .12, .07, .35); break;
      case 80: case 81: tone(4400, 4400, .01, note === 80 ? .04 : .45, .22); tone(6610, 6610, .01, note === 80 ? .03 : .3, .12); pan.pan.value = .3; break;
      // the General MIDI 2 extras some files use, and a quiet click for anything else (never a pitched blip)
      case 28: hiss('bandpass', 1150, 1.1, .018, .75); tone(240, 190, .01, .02, .3); pan.pan.value = -.1; break;
      case 29: case 30: hiss('bandpass', note === 29 ? 1400 : 2400, 2, .05, .35, undefined, .02); break;
      case 27: case 31: case 32: case 33: tone(2300, 2150, .003, .005, .3, 'triangle'); hiss('bandpass', 3600, 1.6, .004, .38); pan.pan.value = .12; break;
      case 34: tone(2100, 2100, .01, .12, .28); tone(5250, 5250, .01, .04, .08); break;
      case 85: [0, .016].forEach((dt, i) => { const n = reg(ctx.createBufferSource()); n.buffer = noise(ctx); const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = 2900; b.Q.value = 2.2; const g = ctx.createGain(); g.gain.setValueAtTime((i ? .5 : .75) * v, when + dt); g.gain.setTargetAtTime(0, when + dt, .006); n.connect(b).connect(g).connect(out); n.start(when + dt, i * .4); n.stop(when + dt + .08); }); pan.pan.value = .2; break;
      case 86: case 87: tone(64, 56, .05, note === 86 ? .07 : .26, 1); hiss('lowpass', 420, .7, .03, .25); break;
      default: tone(1900, 1800, .003, .004, .18, 'triangle'); hiss('bandpass', 3200, 1.5, .004, .2);
    }
  };
  const inst: Instrument = {
    play(dest, when, pitch, vel, dur) { hit(dest, when, pitch, vel, dur); },
    start(dest, when, pitch, vel) { hit(dest, when, pitch, vel); return NOOP; },
    async prepare(ctx) { metal(ctx, 'hat'); metal(ctx, 'cym'); noise(ctx); }
  };
  return inst;
}
