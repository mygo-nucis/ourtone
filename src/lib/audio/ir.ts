/* synthetic impulse responses: decorrelated stereo noise with a darkening, decaying tail and a few early reflections */
export function makeIR(ctx: BaseAudioContext, o: { seconds: number; decay: number; pre: number; bright: number; dark: number; early: number[] }) {
  const sr = ctx.sampleRate, len = Math.ceil(sr * o.seconds), buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let s = (ch + 1) * 2654435761 >>> 0, lp = 0;
    const pre = Math.round(o.pre * sr);
    for (let i = pre; i < len; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      const n = (s >>> 0) / 4294967296 * 2 - 1, t = (i - pre) / sr, k = t / (o.seconds - o.pre);
      const a = o.bright + (o.dark - o.bright) * Math.min(1, k * 1.4);
      lp += a * (n - lp);
      d[i] = lp * Math.exp(-t / o.decay) * Math.min(1, t / .012);
    }
    o.early.forEach((t, j) => { const i = Math.round((o.pre + t + ch * .0031 * (j % 2 ? 1 : -1)) * sr); if (i > 0 && i < len) d[i] += (j % 2 ? -1 : 1) * .5 * Math.exp(-t / .06); });
    let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    const g = .6 / (peak || 1); for (let i = 0; i < len; i++) d[i] *= g;
  }
  return buf;
}
export const ROOM = { seconds: 1.9, decay: .42, pre: .012, bright: .55, dark: .12, early: [.009, .017, .023, .031, .041] };
export const HALL = { seconds: 4.6, decay: 1.25, pre: .028, bright: .38, dark: .05, early: [.021, .034, .049, .066, .083, .107] };
