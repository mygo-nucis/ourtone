/* play mode's hit sounds: a short, unpitched-enough click laid over the note a hit plays, so a hit can be felt as well
   as heard (the empty-press tap is transport.click, and stays apart from these). each is drawn sample by sample, once
   per sample rate, peak 1; `HIT_GAIN` sets how loud each plays at the middle of the player's volume (`hitLevel`). 1 a
   clap (a few quick bursts, mid), 2 a woodblock (a short wooden knock), 3 a crisp tick (high, like a closed hat). */
export const HIT_SOUNDS = 3;
export const HIT_GAIN = [0, .12, .1, .2];
/** the player's volume (0-1) as a gain: the middle is 1, each end 12 dB from it, and nothing at all at 0 */
export const hitLevel = (v: number) => v <= 0 ? 0 : Math.pow(10, (v - .5) * 24 / 20);

/** a biquad (RBJ cookbook) run over `x` in place */
function biquad(x: Float32Array, sr: number, type: 'hp' | 'bp' | 'lp', f: number, q: number) {
  const w = 2 * Math.PI * f / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
}

/** a fixed noise (the same every time, so a sound never changes from one hit to the next) */
function noise(n: number, seed = 7) {
  const out = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; out[i] = s / 2147483648 - 1; }
  return out;
}

export function hitSamples(kind: number, sr: number): Float32Array {
  let x: Float32Array;
  if (kind === 3) {
    // tick: high noise, gone in a few milliseconds, with a faint ring at 5.4 kHz
    const n = Math.round(sr * .045);
    x = noise(n);
    biquad(x, sr, 'hp', 6500, .8);
    for (let i = 0; i < n; i++) { const t = i / sr; x[i] = x[i] * Math.exp(-t / .004) + .25 * Math.sin(2 * Math.PI * 5400 * t) * Math.exp(-t / .01); }
  } else if (kind === 2) {
    // woodblock: three of a block's modes, the lowest ringing longest, its pitch settling a touch after the strike
    const n = Math.round(sr * .11);
    x = new Float32Array(n);
    const modes = [[1180, 1, .024], [2930, .42, .011], [4470, .16, .006]];
    for (const [f, a, d] of modes) {
      let ph = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; ph += 2 * Math.PI * f * (1 + .04 * Math.exp(-t / .003)) / sr; x[i] += a * Math.sin(ph) * Math.exp(-t / d); }
    }
    const k = noise(Math.round(sr * .003), 11);
    biquad(k, sr, 'bp', 3000, 1);
    for (let i = 0; i < k.length; i++) x[i] += .6 * k[i] * (1 - i / k.length);
    for (let i = 0; i < Math.min(n, sr * .0006); i++) x[i] *= i / (sr * .0006);
  } else {
    // (1) clap: three quick bursts and a short tail, in the middle of the range
    const n = Math.round(sr * .13);
    x = noise(n, 23);
    biquad(x, sr, 'bp', 1500, 1.1);
    biquad(x, sr, 'hp', 600, .7);
    const env = (t: number) => {
      let e = 0;
      for (const at of [0, .009, .018]) if (t >= at) e = Math.max(e, Math.exp(-(t - at) / .0028));
      if (t >= .022) e = Math.max(e, .55 * Math.exp(-(t - .022) / .028));
      return e;
    };
    for (let i = 0; i < n; i++) x[i] *= env(i / sr);
  }
  // fade the last few milliseconds; peak 1
  const fade = Math.round(sr * .004);
  for (let i = 0; i < fade; i++) x[x.length - 1 - i] *= i / fade;
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak) for (let i = 0; i < x.length; i++) x[i] /= peak;
  return x;
}
