import { Env, noise, wave, pulse, mtof, pluckInstrument, pianoInstrument, kitInstrument, driveChain, letGo, STEAL, type Instrument, type Voice } from './voices';
import { track, aBufferId, type Patch, type Osc } from './patch';

/* the UT-2 voice: builds a note from a patch (see patch.ts) */
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** a drawn cycle as a periodic wave: its Fourier series, cached per context */
const tables = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
function tableWave(ctx: BaseAudioContext, t: number[]) {
  let m = tables.get(ctx);
  if (!m) { m = new Map(); tables.set(ctx, m); }
  const key = t.map(x => x.toFixed(3)).join(',');
  let w = m.get(key);
  if (!w) {
    const N = t.length, H = Math.floor(N / 2), re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    for (let k = 1; k <= H; k++) { let a = 0, b = 0; for (let n = 0; n < N; n++) { const ph = 2 * Math.PI * k * n / N; a += t[n] * Math.cos(ph); b += t[n] * Math.sin(ph); } re[k] = a * 2 / N; im[k] = b * 2 / N; }
    w = ctx.createPeriodicWave(re, im);
    m.set(key, w);
  }
  return w;
}
/** a sawtooth at f, its harmonics shaped by resonances (a bowed string through its body), cached per context */
const bodies = new WeakMap<BaseAudioContext, Map<string, PeriodicWave>>();
function bodyWave(ctx: BaseAudioContext, f: number, body: [number, number, number][]) {
  let m = bodies.get(ctx);
  if (!m) { m = new Map(); bodies.set(ctx, m); }
  const key = `${Math.round(f * 4)}|${body.join(';')}`;
  let w = m.get(key);
  if (!w) {
    const H = Math.max(1, Math.min(256, Math.floor(ctx.sampleRate * .45 / f))), re = new Float32Array(H + 1), im = new Float32Array(H + 1);
    for (let k = 1; k <= H; k++) {
      let g = 1 / k;
      for (const [f0, q, db] of body) { const x = q * (k * f / f0 - f0 / (k * f)); g *= 1 + (Math.pow(10, db / 20) - 1) / (1 + x * x); }
      im[k] = g;
    }
    w = ctx.createPeriodicWave(re, im);
    m.set(key, w);
  }
  return w;
}
function setWave(ctx: BaseAudioContext, o: OscillatorNode, l: Osc, f: number) {
  if (l.body?.length && l.wave === 'sawtooth') o.setPeriodicWave(bodyWave(ctx, f, l.body));
  else if (l.wave === 'pulse') o.setPeriodicWave(pulse(ctx, l.duty ?? .5));
  else if (l.wave === 'harm') o.setPeriodicWave(wave(ctx, l.harm ?? [1]));
  else if (l.wave === 'table') o.setPeriodicWave(tableWave(ctx, l.table ?? [0, 1, 0, -1]));
  else o.type = l.wave;
}

const trimOf = (P: Patch) => P.trim ? Math.pow(10, P.trim / 20) : 1;
function sourceA(P: Patch, alone: boolean): Instrument | null {
  const a = P.a;
  if (!a) return null;
  // on its own, the string carries the level trim; under the chain, the amp envelope does
  const g = a.gain * (alone ? trimOf(P) : 1), id = aBufferId(P);
  if (a.kind === 'pluck') return pluckInstrument(id, { p: a.p, gain: g, cut0: a.cut0, cut1: a.cut1, rel: a.rel, spread: a.spread });
  return pianoInstrument(id, { p: a.p, gain: g, cut0: a.cut0, cut1: a.cut1, rel: a.rel, width: a.width });
}

export function patchInstrument(P: Patch): Instrument {
  if (P.kit !== undefined) return kitInstrument(P.kit, P.kitStyle);
  const chain = P.drive ? driveChain(P.drive.drive, P.drive.tone, P.drive.level, P.drive.poly) : undefined;
  const live = !!(P.osc?.length || P.breath || P.chiff || P.click || P.perc);
  const staged = !!(P.hp || P.peaks?.length || P.lp || P.amp || P.trem || P.vf);
  const A = sourceA(P, !live && !staged);
  // a rendered string alone plays exactly as it always did
  if (A && !live && !staged) return { play: A.play, start: A.start, prepare: A.prepare, chain };

  const voice = (dest: AudioNode, when: number, pitch: number, vel: number, dur?: number): Voice => {
    const ctx = dest.context, f = mtof(pitch), v = vel / 127;
    // the attack (a known short note may take less of it: amp.fit)
    const fit = P.amp?.fit, atk = P.amp ? (fit && dur ? Math.min(P.amp.a, Math.max(.02, dur * fit)) : P.amp.a) : .002;
    const nodes: AudioScheduledSourceNode[] = [];
    const starts: [AudioScheduledSourceNode, number][] = [];
    const mix = ctx.createGain(); mix.gain.value = P.mix ?? 1;

    // vibrato (an ensemble's players at two paces, the unison's copies shared out between them)
    const lgs: GainNode[] = [];
    if (P.vib) {
      const V = P.vib;
      for (const k of V.ensemble ? [1, 1.12] : [1]) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = (V.jitter ? V.rate * (.96 + .08 * ((pitch * 37) % 10) / 10) : V.rate) * k;
        const lg = ctx.createGain();
        if (V.steady) lg.gain.value = V.depth;
        else { lg.gain.setValueAtTime(0, when); if (V.delay > 0) lg.gain.linearRampToValueAtTime(0, when + V.delay * k); lg.gain.linearRampToValueAtTime(V.depth, when + V.delay * k + V.ramp); }
        lfo.connect(lg); nodes.push(lfo); lgs.push(lg);
      }
    }
    // oscillators
    for (const l of P.osc ?? []) {
      const n = Math.max(1, l.voices ?? 1);
      const out = l.level === 1 ? mix : ctx.createGain();
      if (out !== mix) { (out as GainNode).gain.value = l.level; out.connect(mix); }
      for (let i = 0; i < n; i++) {
        const o = ctx.createOscillator(); setWave(ctx, o, l, f * l.ratio);
        o.frequency.value = f * l.ratio;
        const det = (l.detune ?? 0) + (n === 1 ? 0 : (i / (n - 1) - .5) * 2 * (l.spread ?? 0));
        if (det) o.detune.value = det;
        if (l.vib && lgs.length) lgs[i % lgs.length].connect(o.detune);
        if (l.fm) {
          const mod = ctx.createOscillator(); mod.frequency.value = f * l.fm.ratio;
          const mg = ctx.createGain(), depth = f * l.fm.ratio * (.45 + .55 * v);
          mg.gain.setValueAtTime(l.fm.index * depth, when); mg.gain.setTargetAtTime(l.fm.index1 * depth, when, l.fm.tau);
          mod.connect(mg).connect(o.frequency); nodes.push(mod);
        }
        if (l.tine) {
          const t = ctx.createOscillator(); t.frequency.value = f * l.tine.ratio;
          const tg = ctx.createGain(); tg.gain.setValueAtTime(l.tine.index * f * l.tine.ratio * v, when); tg.gain.setTargetAtTime(0, when, l.tine.tau);
          t.connect(tg).connect(o.frequency); nodes.push(t);
        }
        o.connect(out); nodes.push(o);
      }
    }
    // breath and chiff share one looping noise; a key click has its own
    if (P.breath || P.chiff) {
      const nz = ctx.createBufferSource(); nz.buffer = noise(ctx); nz.loop = true;
      if (P.breath) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = clamp(f * P.breath.mul, 200, 12000); bp.Q.value = P.breath.q;
        const ng = ctx.createGain(); ng.gain.value = P.breath.level * 3;
        nz.connect(bp).connect(ng).connect(mix);
      }
      if (P.chiff) {
        const cg = ctx.createGain(); cg.gain.setValueAtTime(P.chiff * v, when); cg.gain.setTargetAtTime(0, when, .018);
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = f * 2;
        nz.connect(hp).connect(cg).connect(mix);
      }
      starts.push([nz, ((pitch * 7919) % 97) / 97 * 1.5]);
      nodes.push(nz);
    }
    if (P.perc) {
      const p = ctx.createOscillator(); p.frequency.value = f * P.perc.ratio;
      const pg = ctx.createGain(); pg.gain.setValueAtTime(P.perc.level * P.gain, when); pg.gain.setTargetAtTime(0, when, P.perc.tau);
      p.connect(pg).connect(mix); nodes.push(p);
    }
    if (P.click) {
      const nz = ctx.createBufferSource(); nz.buffer = noise(ctx);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = P.click.freq; bp.Q.value = P.click.q;
      const cg = ctx.createGain(); cg.gain.setValueAtTime(P.click.level * P.gain, when); cg.gain.setTargetAtTime(0, when, P.click.tau);
      nz.connect(bp).connect(cg).connect(mix); nodes.push(nz);
    }
    // the rendered string joins the oscillators
    const aVoice = A ? A.start(mix, when, pitch, vel) : null;

    // the chain
    let node: AudioNode = mix;
    if (P.hp) { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = f * P.hp.mul; node = node.connect(hp); }
    for (const [fr, q, g] of P.peaks ?? []) { const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = fr; pk.Q.value = q; pk.gain.value = g; node = node.connect(pk); }
    if (P.lp) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = P.lp.q;
      const E = P.lp.env;
      if (E) {
        lp.frequency.setValueAtTime(track(E.start, f, v), when);
        let t1 = when;
        if (E.peak) { t1 = when + (P.amp ? atk : 0) * (E.atk ?? 1); lp.frequency.linearRampToValueAtTime(track(E.peak, f, v), t1); }
        lp.frequency.setTargetAtTime(track(E.sus, f, v), t1, E.tau);
      } else lp.frequency.value = track(P.lp.cut, f, v);
      node = node.connect(lp);
    }
    // the sound view's filter
    let vfDet: AudioParam | null = null;
    if (P.vf) {
      const F = P.vf;
      if (F.drive > .01) {
        const sh = ctx.createWaveShaper(), k = 1 + F.drive * 9, N = 512, c = new Float32Array(N);
        for (let i = 0; i < N; i++) { const x = i / (N - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
        sh.curve = c;
        const g = ctx.createGain(); g.gain.value = 1 / (1 + F.drive * .9);
        node = node.connect(sh).connect(g);
      }
      const flt = ctx.createBiquadFilter();
      flt.type = F.type === 'bp' ? 'bandpass' : F.type === 'hp' ? 'highpass' : 'lowpass';
      flt.frequency.value = clamp(F.cut * Math.pow(f / 262, F.key), 20, 20000);
      // resonance 0..1: a bandpass narrows (Q .5–12); low- and high-pass gain a peak (-3–18 dB)
      flt.Q.value = F.type === 'bp' ? .5 + F.res * 11.5 : -3 + F.res * 21;
      if (F.env && Math.abs(F.env.amt) > .01) {
        const E = F.env, top = E.amt * 1200;
        flt.detune.setValueAtTime(0, when); flt.detune.linearRampToValueAtTime(top, when + Math.max(.002, E.a)); flt.detune.setTargetAtTime(top * E.s, when + Math.max(.002, E.a), Math.max(.005, E.d));
        vfDet = flt.detune;
      }
      if (F.lfo && F.lfo.depth > .01) {
        const lfo = ctx.createOscillator(); lfo.frequency.value = F.lfo.rate;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0, when + F.lfo.delay); g.gain.linearRampToValueAtTime(F.lfo.depth * 1200, when + F.lfo.delay + .3);
        lfo.connect(g).connect(flt.detune); nodes.push(lfo);
      }
      node = node.connect(flt);
    }
    const amp = ctx.createGain();
    const M = P.amp ?? { a: .002, sus: 1, tau: 1, rel: .05, lo: 1, hi: 0, pow: 1 };
    const tau = M.keyTau ? M.tau * clamp(Math.pow(262 / f, .35), .35, 2) : M.tau;
    const env = new Env(amp.gain, when, atk, P.gain * (M.lo + M.hi * Math.pow(v, M.pow)) * trimOf(P), M.sus, tau);
    node.connect(amp);
    let out: AudioNode = amp;
    if (P.trem) {
      const tr = ctx.createGain(); tr.gain.value = 1 - P.trem.depth / 2;
      const lfo = ctx.createOscillator(); lfo.frequency.value = P.trem.rate;
      const tl = ctx.createGain(); tl.gain.value = P.trem.depth / 2;
      lfo.connect(tl).connect(tr.gain); amp.connect(tr); out = tr; nodes.push(lfo);
    }
    out.connect(dest);

    const startAt = new Map(starts);
    nodes.forEach(n => { const off = startAt.get(n); if (off !== undefined) (n as AudioBufferSourceNode).start(when, off); else n.start(when); });
    const natural = M.sus > 0 ? Infinity : when + atk + tau * 7;
    if (isFinite(natural)) nodes.forEach(n => n.stop(natural));
    // once every source has ended (the string too), the whole voice leaves the graph
    letGo(aVoice?.source ? [...nodes, aVoice.source] : nodes, out);
    let stolen = false;
    const self: Voice = {
      end: natural,
      release(t) {
        aVoice?.release(t);
        if (t >= natural || stolen) return;
        env.release(t, M.rel);
        if (vfDet && P.vf?.env) vfDet.setTargetAtTime(0, t, Math.max(.005, P.vf.env.r / 3));
        self.end = Math.min(natural, t + M.rel * 7);
        nodes.forEach(n => n.stop(self.end!));
      },
      // fade out at once from wherever the envelope stands (the voice may be deep in its release)
      steal(t) {
        if (stolen || t >= (self.end ?? natural)) return;
        stolen = true;
        aVoice?.steal?.(t);
        const at = Math.max(t, when), lv = env.levelAt(at);
        amp.gain.cancelScheduledValues(at); amp.gain.setValueAtTime(lv, at); amp.gain.setTargetAtTime(0, at, STEAL);
        self.end = Math.min(self.end ?? natural, at + STEAL * 6);
        nodes.forEach(n => n.stop(self.end!));
      }
    };
    return self;
  };
  return {
    play(dest, when, pitch, vel, dur) { voice(dest, when, pitch, vel, dur).release(when + dur); },
    start: voice,
    async prepare(ctx, pitches) { if (A) await A.prepare(ctx, pitches); },
    chain
  };
}
