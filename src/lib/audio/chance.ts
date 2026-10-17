import type { Patch, Osc, Source } from './patch';
import type { Fx, Macros } from './fx';
import { rng } from '../util';

/* chance in the sound view: random (随机), a new sound with its sources, macros and effects; tweak (微调), a nudge to
   the sound you have */
function mainOsc(p: Patch): Osc {
  if (!p.osc?.length) { p.osc = [{ wave: 'sawtooth', ratio: 1, level: .5 }]; ensureAmp(p); }
  return p.osc[0];
}
function ensureAmp(p: Patch) { if (!p.amp) p.amp = { a: .005, sus: .8, tau: .4, rel: .15, lo: .35, hi: .65, pow: 1 }; }
function ensureVf(p: Patch) { if (!p.vf) p.vf = { type: 'lp', cut: 20000, res: .15, key: 0, drive: 0 }; return p.vf; }
const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
/** the two strings source A can start from */
export interface StringSources { pluck: Source; hammer: Source }

/** a new sound: which sources there are (a string, oscillators, or both) and what kind, then everything about them.
    the instrument's own tone shaping is dropped (the sound view's filter takes over); a driven amp stays sometimes */
export function randomize(p: Patch, seed = Date.now(), strings?: StringSources) {
  const r = rng(seed);
  if (strings) {
    const layout = r();
    const useA = layout < .65, useB = layout >= .35;
    if (useA) p.a = JSON.parse(JSON.stringify(r() < .6 ? strings.pluck : strings.hammer)); else delete p.a;
    if (!useB) { delete p.osc; delete p.amp; } else if (!p.osc?.length || r() < .7) p.osc = [];
    delete p.hp; delete p.peaks; delete p.lp; delete p.perc; delete p.breath; delete p.chiff; delete p.click;
    if (p.drive && r() < .6) delete p.drive;
    // now and then a little air or a key click
    if (r() < .18) p.breath = { level: .02 + r() * .05, q: 1 + r() * 3, mul: 1 + r() * 2 };
    else if (r() < .15) p.click = { level: .05 + r() * .15, freq: 1500 + r() * 3000, q: 1.5, tau: .004 + r() * .01 };
    if (p.a && p.osc) p.a.gain *= .7;
  }
  if (p.a?.kind === 'pluck') { p.a.p.pick = .06 + r() * .4; p.a.p.damp = r() * .35; p.a.p.decay = .6 + r() * 5; p.a.p.excite = r() * .9; }
  if (p.a?.kind === 'hammer') { p.a.p.bright = .7 + r() * .9; p.a.p.decay = .5 + r() * 1; p.a.p.thump = r() * 1.3; }
  if (!p.a || p.osc || (!strings && r() < .5)) {
    const o = mainOsc(p);
    const w = pick(r, ['sine', 'triangle', 'sawtooth', 'square', 'fm', 'table'] as const);
    if (w === 'fm') { o.wave = 'sine'; o.fm = { ratio: pick(r, [1, 2, 3, 3.5, 4, 7]), index: .4 + r() * 2.4, index1: r() * .5, tau: .08 + r() * .8 }; }
    else if (w === 'table') { o.wave = 'table'; delete o.fm; o.table = Array.from({ length: 32 }, (_, i) => { const t = i / 32; return Math.sin(2 * Math.PI * t) * (.5 + r() * .5) + Math.sin(2 * Math.PI * t * (2 + Math.floor(r() * 4))) * r() * .5; }); }
    else { o.wave = w; delete o.fm; delete o.table; }
    o.voices = r() < .4 ? 1 + Math.floor(r() * 3) : 1; o.spread = 6 + r() * 14;
    // under a string an oscillator stays a colour; alone it carries the sound (unison adds up, so it comes down)
    o.level = (p.a ? .04 + r() * .1 : .8) / Math.sqrt(o.voices);
    ensureAmp(p);
    // the attack stays quick (1 to 30 ms): a slow swell only makes a melody sound late
    p.amp!.a = Math.pow(10, -3 + r() * 1.48); p.amp!.tau = Math.pow(10, -1.2 + r() * 1.8); p.amp!.sus = r() < .4 ? 0 : .3 + r() * .7; p.amp!.rel = Math.pow(10, -1.6 + r() * 1.8);
  }
  const f = ensureVf(p);
  // filters stay where the notes are: a band around the voice, a gentle high-pass, or a low-pass above it
  const t = r();
  f.type = t < .7 ? 'lp' : t < .9 ? 'bp' : 'hp';
  f.cut = f.type === 'hp' ? 60 + r() * 300 : f.type === 'bp' ? 300 + r() * 1800 : 800 + r() * 8000;
  f.res = f.type === 'bp' ? .05 + r() * .35 : .1 + r() * (r() < .25 ? .4 : .2);
  f.key = f.type === 'lp' ? r() * .7 : .5 + r() * .5; f.drive = r() < .3 ? r() * .6 : 0;
  f.env = r() < .6 ? { amt: (r() - .3) * 4, a: Math.pow(10, -3 + r() * 1.48), d: .05 + r() * 1.2, s: r(), r: .05 + r() * .8 } : undefined;
  if (r() < .45) p.vib = { rate: 3 + r() * 4, depth: 4 + r() * 18, delay: r() * .5, ramp: .35 };
  else delete p.vib;
  if (r() < .25) p.trem = { rate: 2 + r() * 6, depth: .1 + r() * .4 }; else delete p.trem;
}

/** random macro positions around their neutral places (bright and attack centre on .5; body and grain are often off) */
export function randomMacros(r: () => number): Macros {
  return { bright: .2 + r() * .6, body: r() < .5 ? 0 : r() * .6, attack: .2 + r() * .6, grain: r() < .6 ? 0 : r() * .45 };
}
/** a random insert chain: a gentle EQ, and sometimes drive, compression and chorus */
export function randomFx(r: () => number): Fx {
  const db = (x: number) => Math.round((r() * 2 - 1) * x * 10) / 10;
  return {
    eq: { on: true, low: db(5), mid: db(4), high: db(6) },
    drive: { on: r() < .2, amt: .1 + r() * .4 },
    comp: { on: r() < .35, thr: -24 + r() * 14, ratio: 2 + r() * 3, attack: .002 + r() * .028 },
    chorus: { on: r() < .35, mix: .15 + r() * .35, rate: .3 + r() * 1.2, depth: .2 + r() * .5 }
  };
}
export function mutate(p: Patch, seed = Date.now()) {
  const r = rng(seed), k = (x: number, amt = .15) => x * (1 + (r() * 2 - 1) * amt);
  if (p.a?.kind === 'pluck') { p.a.p.pick = Math.min(.5, Math.max(.03, k(p.a.p.pick))); p.a.p.damp = Math.min(.6, Math.max(0, k(p.a.p.damp + .01))); p.a.p.decay = k(p.a.p.decay); p.a.p.excite = Math.min(.95, Math.max(0, k(p.a.p.excite + .01))); }
  if (p.a?.kind === 'hammer') { p.a.p.bright = k(p.a.p.bright, .1); p.a.p.decay = k(p.a.p.decay, .1); p.a.p.thump = k(p.a.p.thump); }
  for (const o of p.osc ?? []) { o.detune = (o.detune ?? 0) + (r() * 2 - 1) * 4; if (o.fm) { o.fm.index = k(o.fm.index); o.fm.tau = k(o.fm.tau); } }
  if (p.amp) { p.amp.a = k(p.amp.a, .25); p.amp.tau = k(p.amp.tau); p.amp.rel = k(p.amp.rel); }
  const f = ensureVf(p);
  f.cut = Math.min(20000, Math.max(60, k(f.cut === 20000 ? 9000 : f.cut, .25)));
  f.res = Math.min(.7, Math.max(0, k(f.res + .02, .2)));
  if (p.vib) { p.vib.rate = k(p.vib.rate, .1); p.vib.depth = k(p.vib.depth); }
}

