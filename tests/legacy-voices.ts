/* the hand-built voices that UT-2 replaced, kept only so tests/ut2.ts can check the patch engine against them */
import { Env, noise, wave, pulse, mtof, live, type Instrument, type FmOpts, type WindOpts, type ReedOpts, type BowedOpts, type OrganOpts, type SqueezeOpts, type ChipOpts, type BrassOpts, type SynthBassOpts } from '../src/lib/audio/voices';
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/* frequency modulation: electric piano, vibraphone, glockenspiel, music box */
export function fmInstrument(o: FmOpts): Instrument {
  return live((dest, when, pitch, vel) => {
    const ctx = dest.context, f = mtof(pitch), v = vel / 127;
    const car = ctx.createOscillator(); car.frequency.value = f; if (o.detune) car.detune.value = o.detune;
    const mod = ctx.createOscillator(); mod.frequency.value = f * o.ratio;
    const mg = ctx.createGain(), depth = f * o.ratio * (.45 + .55 * v);
    mg.gain.setValueAtTime(o.index * depth, when); mg.gain.setTargetAtTime(o.index1 * depth, when, o.indexTau);
    mod.connect(mg).connect(car.frequency);
    const nodes: OscillatorNode[] = [car, mod];
    if (o.tine) {
      const t = ctx.createOscillator(); t.frequency.value = f * o.tine.ratio;
      const tg = ctx.createGain(); tg.gain.setValueAtTime(o.tine.index * f * o.tine.ratio * v, when); tg.gain.setTargetAtTime(0, when, o.tine.tau);
      t.connect(tg).connect(car.frequency); nodes.push(t);
    }
    const amp = ctx.createGain();
    // higher notes decay faster, as struck bars and tines do
    const tau = o.tau * clamp(Math.pow(262 / f, .35), .35, 2);
    const env = new Env(amp.gain, when, o.a, o.gain * (.2 + .8 * Math.pow(v, 1.3)), o.sus, tau);
    let out: AudioNode = amp;
    if (o.trem) {
      const tr = ctx.createGain(); tr.gain.value = 1 - o.trem.depth / 2;
      const lfo = ctx.createOscillator(); lfo.frequency.value = o.trem.rate;
      const lg = ctx.createGain(); lg.gain.value = o.trem.depth / 2;
      lfo.connect(lg).connect(tr.gain); amp.connect(tr); out = tr; nodes.push(lfo);
    }
    car.connect(amp); out.connect(dest);
    nodes.forEach(n => n.start(when));
    const natural = o.sus > 0 ? Infinity : when + o.a + tau * 7;
    if (isFinite(natural)) nodes.forEach(n => n.stop(natural));
    return { release(t) { if (t >= natural) return; env.release(t, o.rel); nodes.forEach(n => n.stop(Math.min(natural, t + o.rel * 7))); } };
  });
}

/* blown pipes: ocarina, flute, whistle, bottle */
export function windInstrument(o: WindOpts): Instrument {
  return live((dest, when, pitch, vel) => {
    const ctx = dest.context, f = mtof(pitch), v = vel / 127;
    const osc = ctx.createOscillator(); osc.setPeriodicWave(wave(ctx, o.harm)); osc.frequency.value = f;
    const lfo = ctx.createOscillator(); lfo.frequency.value = o.vib * (.96 + .08 * ((pitch * 37) % 10) / 10);
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, when); lg.gain.linearRampToValueAtTime(0, when + o.vibDelay); lg.gain.linearRampToValueAtTime(o.vibDepth, when + o.vibDelay + .35);
    lfo.connect(lg).connect(osc.detune);
    const amp = ctx.createGain();
    const env = new Env(amp.gain, when, o.a, o.gain * (.35 + .65 * v), .86, .6);
    osc.connect(amp);
    const n = ctx.createBufferSource(); n.buffer = noise(ctx); n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = clamp(f * o.breathMul, 200, 12000); bp.Q.value = o.breathQ;
    const ng = ctx.createGain(); ng.gain.value = o.breath * 3;
    n.connect(bp).connect(ng).connect(amp);
    if (o.chiff) {
      const cg = ctx.createGain(); cg.gain.setValueAtTime(o.chiff * v, when); cg.gain.setTargetAtTime(0, when, .018);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = f * 2;
      n.connect(hp).connect(cg).connect(amp);
    }
    amp.connect(dest);
    const offs = ((pitch * 7919) % 97) / 97 * 1.5;
    osc.start(when); lfo.start(when); n.start(when, offs);
    return { release(t) { env.release(t, o.rel); const e = t + o.rel * 7; osc.stop(e); lfo.stop(e); n.stop(e); } };
  });
}

/* double reeds: a buzzing sawtooth shaped by two formants */
export function reedInstrument(o: ReedOpts): Instrument {
  return live((dest, when, pitch, vel) => {
    const ctx = dest.context, f = mtof(pitch), v = vel / 127;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f;
    const lfo = ctx.createOscillator(); lfo.frequency.value = o.vib;
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, when); lg.gain.linearRampToValueAtTime(o.vibDepth, when + .5);
    lfo.connect(lg).connect(osc.detune);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.cut * (.7 + .3 * v); lp.Q.value = .5;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = f * .9;
    let node: AudioNode = osc.connect(hp);
    for (const [fr, q, g] of o.formants) { const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = fr; pk.Q.value = q; pk.gain.value = g; node = node.connect(pk); }
    const amp = ctx.createGain();
    const env = new Env(amp.gain, when, o.a, o.gain * (.35 + .65 * v), .8, .5);
    node.connect(lp).connect(amp).connect(dest);
    osc.start(when); lfo.start(when);
    return { release(t) { env.release(t, o.rel); const e = t + o.rel * 7; osc.stop(e); lfo.stop(e); } };
  });
}

/* bowed strings: detuned saws through a soft body filter, slow bow attack, late vibrato */
export function bowedInstrument(o: BowedOpts): Instrument {
  return live((dest, when, pitch, vel) => {
    const ctx = dest.context, f = mtof(pitch), v = vel / 127;
    const lfo = ctx.createOscillator(); lfo.frequency.value = o.vib;
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, when); lg.gain.linearRampToValueAtTime(0, when + .18); lg.gain.linearRampToValueAtTime(o.vibDepth, when + .6);
    lfo.connect(lg);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = clamp(f * o.cutMul + o.cutAdd, 400, 14000) * (.75 + .25 * v); lp.Q.value = .6;
    const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 1100; body.Q.value = 1.2; body.gain.value = 4;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = f * .7;
    const oscs: OscillatorNode[] = [];
    for (let i = 0; i < o.voices; i++) {
      const s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.value = f;
      s.detune.value = o.voices === 1 ? 0 : (i / (o.voices - 1) - .5) * 2 * o.detune;
      lg.connect(s.detune); s.connect(hp); oscs.push(s);
    }
    const amp = ctx.createGain();
    const env = new Env(amp.gain, when, o.a, o.gain / Math.sqrt(o.voices) * (.4 + .6 * v), .92, 1);
    hp.connect(body).connect(lp).connect(amp).connect(dest);
    oscs.forEach(s => s.start(when)); lfo.start(when);
    return { release(t) { env.release(t, o.rel); const e = t + o.rel * 7; oscs.forEach(s => s.stop(e)); lfo.stop(e); } };
  });
}

/* organs: drawbar sines, a percussive harmonic and a little key click */
export function organInstrument(o: OrganOpts): Instrument {
  const harm: number[] = [];
  o.bars.forEach(([r, l]) => { if (Number.isInteger(r)) harm[r - 1] = (harm[r - 1] || 0) + l; });
  return live((dest, when, pitch, vel) => {
    const ctx = dest.context, f = mtof(pitch), v = vel / 127;
    const nodes: AudioScheduledSourceNode[] = [];
    const mix = ctx.createGain();
    const main = ctx.createOscillator(); main.setPeriodicWave(wave(ctx, Array.from(harm, h => h || 0))); main.frequency.value = f; main.connect(mix); nodes.push(main);
    o.bars.filter(([r]) => !Number.isInteger(r)).forEach(([r, l]) => { const s = ctx.createOscillator(); s.frequency.value = f * r; const g = ctx.createGain(); g.gain.value = l; s.connect(g).connect(mix); nodes.push(s); });
    if (o.vib) { const lfo = ctx.createOscillator(); lfo.frequency.value = 6.1; const lg = ctx.createGain(); lg.gain.value = o.vib; lfo.connect(lg).connect(main.detune); nodes.push(lfo); }
    const amp = ctx.createGain();
    const env = new Env(amp.gain, when, o.a, o.gain * (.55 + .45 * v), 1, 1);
    mix.connect(amp);
    if (o.perc) {
      const p = ctx.createOscillator(); p.frequency.value = f * o.perc.ratio;
      const pg = ctx.createGain(); pg.gain.setValueAtTime(o.perc.level * o.gain, when); pg.gain.setTargetAtTime(0, when, o.perc.tau);
      p.connect(pg).connect(amp); nodes.push(p);
    }
    if (o.click) {
      const n = ctx.createBufferSource(); n.buffer = noise(ctx);
      const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2400; hp.Q.value = .8;
      const cg = ctx.createGain(); cg.gain.setValueAtTime(o.click * o.gain, when); cg.gain.setTargetAtTime(0, when, .004);
      n.connect(hp).connect(cg).connect(amp); nodes.push(n);
    }
    amp.connect(dest);
    nodes.forEach(n => n.start(when));
    return { release(t) { env.release(t, o.rel); nodes.forEach(n => n.stop(t + o.rel * 7)); } };
  });
}

/* free reeds: two slightly detuned reeds beat against each other (musette) */
export function squeezeInstrument(o: SqueezeOpts): Instrument {
  return live((dest, when, pitch, vel) => {
    const ctx = dest.context, f = mtof(pitch), v = vel / 127;
    const mix = ctx.createGain(); mix.gain.value = .5;
    const oscs = [-1, 1].map(s => { const x = ctx.createOscillator(); x.setPeriodicWave(pulse(ctx, o.bass ? .5 : .32)); x.frequency.value = f; x.detune.value = s * o.musette; x.connect(mix); return x; });
    if (o.bass) { const sub = ctx.createOscillator(); sub.type = 'triangle'; sub.frequency.value = f; const sg = ctx.createGain(); sg.gain.value = .9; sub.connect(sg).connect(mix); oscs.push(sub); }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.cut * (.75 + .25 * v); lp.Q.value = .7;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1500; pk.Q.value = 1; pk.gain.value = o.bass ? 0 : 3;
    const amp = ctx.createGain();
    const env = new Env(amp.gain, when, o.a, o.gain * (.45 + .55 * v), .9, .8);
    mix.connect(pk).connect(lp).connect(amp).connect(dest);
    oscs.forEach(x => x.start(when));
    return { release(t) { env.release(t, o.rel); oscs.forEach(x => x.stop(t + o.rel * 7)); } };
  });
}

/* chip: band-limited pulse, crisp attack */
export function chipInstrument(o: ChipOpts): Instrument {
  return live((dest, when, pitch, vel) => {
    const ctx = dest.context, f = mtof(pitch), v = vel / 127;
    const osc = ctx.createOscillator(); osc.setPeriodicWave(pulse(ctx, o.duty)); osc.frequency.value = f;
    const nodes: OscillatorNode[] = [osc];
    if (o.vib) { const lfo = ctx.createOscillator(); lfo.frequency.value = 6; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, when); lg.gain.linearRampToValueAtTime(0, when + .2); lg.gain.linearRampToValueAtTime(o.vib, when + .45); lfo.connect(lg).connect(osc.detune); nodes.push(lfo); }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
    const amp = ctx.createGain();
    const env = new Env(amp.gain, when, o.a, o.gain * (.4 + .6 * v), o.sus, o.tau);
    osc.connect(lp).connect(amp).connect(dest);
    nodes.forEach(n => n.start(when));
    return { release(t) { env.release(t, o.rel); nodes.forEach(n => n.stop(t + o.rel * 7)); } };
  });
}

/* brass: saws with a filter that blooms on the attack */
export function brassInstrument(o: BrassOpts): Instrument {
  return live((dest, when, pitch, vel) => {
    const ctx = dest.context, f = mtof(pitch), v = vel / 127;
    const oscs = [-1, 1].map(s => { const x = ctx.createOscillator(); x.type = 'sawtooth'; x.frequency.value = f; x.detune.value = s * o.detune; return x; });
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.1;
    const peak = clamp((f * o.peakMul + 700) * (.6 + .4 * v), 600, 12000), sus = clamp((f * o.susMul + 450) * (.7 + .3 * v), 500, 9000);
    lp.frequency.setValueAtTime(f * 1.1, when); lp.frequency.linearRampToValueAtTime(peak, when + o.a * 1.2); lp.frequency.setTargetAtTime(sus, when + o.a * 1.2, .12);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.3;
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, when); lg.gain.linearRampToValueAtTime(0, when + .3); lg.gain.linearRampToValueAtTime(7, when + .7);
    lfo.connect(lg); oscs.forEach(x => { lg.connect(x.detune); x.connect(lp); });
    const amp = ctx.createGain();
    const env = new Env(amp.gain, when, o.a, o.gain * (.35 + .65 * v), .82, .4);
    lp.connect(amp).connect(dest);
    oscs.forEach(x => x.start(when)); lfo.start(when);
    return { release(t) { env.release(t, o.rel); const e = t + o.rel * 7; oscs.forEach(x => x.stop(e)); lfo.stop(e); } };
  });
}

/* synth bass: saw plus a square an octave down through a resonant, closing filter */
export function synthBassInstrument(o: SynthBassOpts): Instrument {
  return live((dest, when, pitch, vel) => {
    const ctx = dest.context, f = mtof(pitch), v = vel / 127;
    const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = f;
    const sub = ctx.createOscillator(); sub.type = 'square'; sub.frequency.value = f / 2;
    const sg = ctx.createGain(); sg.gain.value = .45;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = o.q;
    lp.frequency.setValueAtTime(o.cut0 * (.5 + .5 * v), when); lp.frequency.setTargetAtTime(o.cut1, when, o.tau);
    const amp = ctx.createGain();
    const env = new Env(amp.gain, when, .004, o.gain * (.45 + .55 * v), .75, .3);
    saw.connect(lp); sub.connect(sg).connect(lp); lp.connect(amp).connect(dest);
    saw.start(when); sub.start(when);
    return { release(t) { env.release(t, o.rel); const e = t + o.rel * 7; saw.stop(e); sub.stop(e); } };
  });
}

