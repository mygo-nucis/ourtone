import { transport } from '../../lib/audio/transport.svelte';
import { theme } from '../../lib/state/theme.svelte';

/* live level meters. every meter canvas registers here (a Svelte action); one animation loop reads the analysers
   and draws them all. levels jump up at once and fall back at 24 dB a second. a meter is drawn again only when its
   lit dots change. */
type Kind = 'strip' | 'mini' | 'lufs';
interface Reg { kind: Kind; i: number; el: HTMLElement; s: number; key?: string }
const regs = new Set<Reg>();
const buf = new Float32Array(2048);
let level: number[] = [];
let raf = 0, last = 0;
const kHist: number[] = [];

function peak(a?: AnalyserNode) {
  if (!a) return -120;
  const n = Math.min(buf.length, a.fftSize), b = buf.subarray(0, n);
  a.getFloatTimeDomainData(b);
  let m = 0;
  for (let i = 0; i < n; i++) { const v = Math.abs(b[i]); if (v > m) m = v; }
  return m > 1e-6 ? 20 * Math.log10(m) : -120;
}
function meanSquare(a?: AnalyserNode) {
  if (!a) return 0;
  const n = Math.min(buf.length, a.fftSize), b = buf.subarray(0, n);
  a.getFloatTimeDomainData(b);
  let s = 0;
  for (let i = 0; i < n; i++) s += b[i] * b[i];
  return s / n;
}

/** how many dots a level lights: the strip's 13 (4 dB apart), or the mini meter's 8 (6 dB apart) */
const lit = (lv: number, kind: Kind) => kind === 'strip' ? Math.max(0, Math.min(13, Math.floor((lv + 48) / 4) + 1)) : Math.max(0, Math.min(8, Math.floor((lv + 42) / 6) + 1));

function frame(now: number) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  const m = transport.meters(), parts = m.parts, n = parts.length;
  const raw: number[] = [];
  parts.forEach(p => { raw.push(peak(p?.l), peak(p?.r)); });
  raw.push(peak(m.master?.l), peak(m.master?.r));
  if (level.length !== raw.length) level = raw.map(() => -120);
  for (let k = 0; k < raw.length; k++) level[k] = raw[k] >= level[k] ? raw[k] : Math.max(raw[k], level[k] - 24 * dt);
  // short-term loudness over the last three seconds
  if (transport.playing && m.master) { kHist.push(meanSquare(m.master.k)); if (kHist.length > 180) kHist.shift(); } else if (kHist.length) kHist.length = 0;
  const th = theme.pal, on = th.dark ? '#D8B46A' : th.accent, hot = th.dark ? '#EBD29A' : th.now;
  for (const r of regs) {
    const i = r.i < 0 ? n : r.i, L = level[i * 2] ?? -120, R = level[i * 2 + 1] ?? -120;
    if (r.kind === 'lufs') {
      const ms = kHist.length ? kHist.reduce((a, b) => a + b, 0) / kHist.length : 0;
      const t = ms > 1e-9 ? (-.691 + 10 * Math.log10(ms)).toFixed(1).replace('-', '−') : '−∞';
      if (r.el.textContent !== t) r.el.textContent = t;
      continue;
    }
    // a hidden meter (the track list on a phone) is skipped: its size must come from its box, never from the canvas's
    // own width, which this sets, or each frame grew it again until the phone stalled for seconds
    const cv = r.el as HTMLCanvasElement, w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) continue;
    const dpr = (devicePixelRatio || 1) * r.s;
    const key = `${r.kind}${lit(L, r.kind)},${lit(R, r.kind)},${Math.round(w * dpr)}x${Math.round(h * dpr)}${th.dark}`;
    if (key === r.key) continue;
    r.key = key;
    const ctx = cv.getContext('2d');
    if (!ctx) continue;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (r.kind === 'strip') {
      for (const [col, lv] of [[0, L], [1, R]] as const) for (let k = 0; k < 13; k++) {
        const isLit = lv >= -48 + k * 4;
        ctx.fillStyle = isLit ? (k > 10 ? hot : on) : th.off; ctx.globalAlpha = isLit && th.dark && k <= 10 ? .85 : 1;
        ctx.beginPath(); ctx.arc(4 + col * 10, h - 4 - k * 8, 2.6, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      const lv = Math.max(L, R);
      for (let k = 0; k < 8; k++) {
        const isLit = lv >= -42 + k * 6;
        ctx.fillStyle = isLit ? (k > 5 ? hot : on) : th.off; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(3 + k * 6.5, h / 2, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  raf = regs.size ? requestAnimationFrame(frame) : 0;
}

/** use:meter={{ kind, i, s }} on a canvas (or a span for 'lufs'); i = -1 for the master */
export function meter(el: HTMLElement, p: { kind: Kind; i: number; s: number }) {
  const r: Reg = { ...p, el };
  regs.add(r);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  return {
    update(q: { kind: Kind; i: number; s: number }) { r.kind = q.kind; r.i = q.i; r.s = q.s; },
    destroy() { regs.delete(r); }
  };
}
