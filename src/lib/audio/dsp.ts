/* note-buffer synthesis, shared by the render worker and tests */
export interface PluckParams {
  decay: number;      // seconds to -60 dB at 220 Hz
  decayK: number;     // how much faster high notes die: T60 ~ (220 / f)^decayK
  minDecay: number; maxDecay: number;
  excite: number;     // 0 bright pick .. 0.95 soft thumb
  pick: number;       // pluck position along the string, 0..0.5
  damp: number;       // extra loop damping, 0..0.6 (nylon, pizzicato)
  maxLen: number;     // seconds
  body?: [number, number, number][];  // resonances the bridge drives, rendered into the note: [Hz, Q, gain] (a guitar's air and top)
  drive?: number;     // a driven amp, one per string: how hard the string goes into it (the chord's notes then never distort one another)
}
export interface PianoParams {
  bright: number;     // hammer hardness, ~0.6..1.6
  decay: number;      // scales the whole keyboard's sustain
  thump: number;      // felt noise level
}
export type JobIn = { kind: 'pluck'; sr: number; pitch: number; p: PluckParams } | { kind: 'piano'; sr: number; pitch: number; p: PianoParams };
export type Job = JobIn & { id: number };

/** scale a buffer so its attack has a given RMS loudness: every note speaks at an even level */
function normalise(out: Float32Array, sr: number, window: number, target: number, cap = .9) {
  const n = Math.min(out.length, Math.round(sr * window));
  let sum = 0, peak = 0;
  for (let i = 0; i < n; i++) sum += out[i] * out[i];
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const rms = Math.sqrt(sum / Math.max(1, n));
  if (rms > 1e-9) { const g = Math.min(target / rms, cap / (peak || 1)); for (let i = 0; i < out.length; i++) out[i] *= g; }
}

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
function rand(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

export function pluck(sr: number, pitch: number, p: PluckParams) {
  const f = hz(pitch), N = Math.max(2, Math.round(sr / f));
  const T60 = Math.min(p.maxDecay, Math.max(p.minDecay, p.decay * Math.pow(220 / f, p.decayK)));
  const len = Math.ceil(sr * Math.min(p.maxLen, T60 * .9 + .08));
  const g = Math.pow(10, -3 / (T60 * f));
  const r = rand(pitch * 7919 + 17);
  // excitation: a noise burst softened by a one-pole filter, then combed at the pick position
  const ex = new Float32Array(N);
  let lp = 0, mean = 0;
  for (let i = 0; i < N * 3; i++) { const n = r() * 2 - 1; lp += (1 - p.excite) * (n - lp); if (i >= N * 2) ex[i - N * 2] = lp; }
  const P = Math.max(1, Math.round(p.pick * N));
  const comb = new Float32Array(N);
  for (let i = 0; i < N; i++) comb[i] = ex[i] - ex[(i + P) % N];
  for (let i = 0; i < N; i++) mean += comb[i];
  mean /= N;
  let peak = 0;
  for (let i = 0; i < N; i++) { comb[i] -= mean; peak = Math.max(peak, Math.abs(comb[i])); }
  const out = new Float32Array(len);
  const d = p.damp;
  let fil = 0;
  for (let n = 0; n < len; n++) {
    const a = n >= N ? out[n - N] : 0, b = n >= N + 1 ? out[n - N - 1] : 0;
    fil = (1 - d) * (.5 * (a + b)) + d * fil;
    out[n] = (n < N ? comb[n] / (peak || 1) : 0) + g * fil;
  }
  // DC blocker, then a short fade at the end of the buffer
  let x1 = 0, y1 = 0;
  for (let n = 0; n < len; n++) { const y = out[n] - x1 + .995 * y1; x1 = out[n]; y1 = y; out[n] = y; }
  if (p.body?.length) bodyOf(out, sr, p.body);
  if (p.drive) driveOf(out, sr, p.drive);
  normalise(out, sr, .15, .16 * Math.pow(220 / f, .12));
  const fade = Math.min(len, Math.round(sr * .06));
  for (let i = 0; i < fade; i++) out[len - 1 - i] *= i / fade;
  // the loop's averaging and damping filters lengthen the period; report the playback-rate correction
  const period = N + .5 + d / (1 - d);
  return { data: out, rate: f * period / sr };
}

/** the string alone into a driven amp's first stage: its lows taken off (110 Hz), then a soft clip. the string is
    brought to the level it would reach the amp at (as loud as the first 150 ms of a pick at an even level), then driven */
function driveOf(out: Float32Array, sr: number, drive: number) {
  normalise(out, sr, .15, .16, Infinity);
  const w = 2 * Math.PI * 110 / sr, al = Math.sin(w) / (2 * .707), a0 = 1 + al;
  const b0 = (1 + Math.cos(w)) / 2 / a0, b1 = -(1 + Math.cos(w)) / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0, k = Math.tanh(2.2);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < out.length; n++) {
    const x = out[n], y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[n] = Math.tanh(2.2 * drive * y) / k;
  }
}

/** resonances driven by the string, added to it: each a band-pass (peak gain 1) at [Hz, Q, gain] */
function bodyOf(out: Float32Array, sr: number, modes: [number, number, number][]) {
  const src = out.slice();
  for (const [f, q, g] of modes) {
    const w = 2 * Math.PI * Math.min(f, sr * .45) / sr, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    const b0 = al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let n = 0; n < out.length; n++) {
      const x = src[n], y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      out[n] += g * y;
    }
  }
}
export function piano(sr: number, pitch: number, p: PianoParams) {
  const f0 = hz(pitch);
  const B = Math.min(3e-3, Math.max(5e-5, 1.4e-4 * Math.pow(2, (pitch - 60) / 12 * 1.1)));
  // a grand sings on: long sustains, so held notes and chords bloom instead of cutting off
  const T60 = p.decay * 19 * Math.pow(2, -(pitch - 21) / 12 * .56);
  const len = Math.ceil(sr * Math.min(7, Math.max(1.4, T60 * .75)));
  const out = new Float32Array(len);
  const r = rand(pitch * 104729 + 3);
  const fc = (1500 + 900 * p.bright) * Math.pow(f0 / 262, .25);
  const hpos = .118 + .01 * Math.sin(pitch);
  const nyq = sr * .45, fmax = Math.min(nyq, pitch < 60 ? 6000 : 10000);
  // one string in the low bass, two above it, three from the tenor up: the unison's slow beating is the piano's warmth
  const strings = pitch < 30 ? 1 : pitch < 42 ? 2 : 3;
  let norm = 0;
  for (let k = 1; k <= 64; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > fmax) break;
    let A = Math.pow(k, -.82) * Math.exp(-(k - 1) * f0 / fc) * (.25 + .75 * Math.abs(Math.sin(Math.PI * k * hpos)));
    if (k === 1 && pitch < 48) A *= .55 + .45 * (pitch - 21) / 27;
    norm += A;
    const Tk = T60 / (1 + 9e-5 * Math.pow(fk, 1.25));
    const tau2 = Tk / 6.908, tau1 = tau2 * .22;
    const d1 = Math.exp(-1 / (tau1 * sr)), d2 = Math.exp(-1 / (tau2 * sr));
    const comps = k <= 14 ? strings : 1;
    for (let c = 0; c < comps; c++) {
      // the strings of a note sit a cent or so apart (the middle one of three in tune)
      const side = comps === 3 ? c - 1 : comps === 2 ? (c ? 1 : -1) : 0;
      const det = side * (.3 + .55 * r()) * (k <= 2 ? 1 : .6) + (comps === 3 && !side ? (r() - .5) * .12 : 0);
      const w = 2 * Math.PI * fk * Math.pow(2, det / 1200) / sr;
      const ph = r() * Math.PI * 2, cw = 2 * Math.cos(w);
      let s1 = Math.sin(ph - w), s2 = Math.sin(ph - 2 * w), e1 = A / comps * .7, e2 = A / comps * .3;
      for (let n = 0; n < len; n++) {
        const y = cw * s1 - s2; s2 = s1; s1 = y;
        out[n] += y * (e1 + e2);
        e1 *= d1; e2 *= d2;
      }
    }
  }
  // felt thump: short low noise burst
  const th = p.thump * .06, tl = Math.round(sr * .012);
  let lp = 0; const kf = Math.min(.5, 2 * Math.PI * Math.min(4000, f0 * 5) / sr);
  for (let n = 0; n < tl * 4 && n < len; n++) { lp += kf * ((r() * 2 - 1) - lp); out[n] += lp * th * Math.exp(-n / tl) * norm; }
  // the soundboard and case answer the hammer: a few low wooden resonances, strongest under the bass and tenor
  const body = .02 * norm * Math.min(1, Math.pow(2, -(pitch - 55) / 24)) * p.thump;
  for (const [f, tau, g] of [[96, .11, 1], [168, .09, .8], [252, .075, .7], [395, .06, .5], [590, .05, .35], [880, .04, .22]] as const) {
    const w = 2 * Math.PI * f / sr, cw = 2 * Math.cos(w), d = Math.exp(-1 / (tau * sr)), n1 = Math.min(len, Math.round(sr * tau * 7));
    let s1 = Math.sin(-w), s2 = Math.sin(-2 * w), e = body * g;
    for (let n = 0; n < n1; n++) { const y = cw * s1 - s2; s2 = s1; s1 = y; out[n] += y * e; e *= d; }
  }
  const atk = Math.round(sr * .0015);
  for (let n = 0; n < atk && n < len; n++) out[n] *= n / atk;
  normalise(out, sr, .25, .1 * Math.pow(2, -(pitch - 60) / 48), .8);
  const fade = Math.round(sr * .25);
  for (let i = 0; i < fade && i < len; i++) out[len - 1 - i] *= i / fade;
  return { data: out, rate: 1 };
}

