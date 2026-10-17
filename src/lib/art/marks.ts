import { th } from './ctx';
import { S, radGrad, uid, defs, type Attrs } from './svg';
import { tint, mixHex } from './palette';
import { clamp, rng } from '../util';

type G = SVGElement;
const f1 = (v: number) => v.toFixed(1);

/** manga screentone: dot radius follows f(x, y) in 0..1 */
export function halftone(g: G, x: number, y: number, w: number, h: number, s: number, color: string, f: (x: number, y: number) => number, op = 1) {
  const grp = S('g', { fill: color, opacity: op });
  let d = '';
  for (let j = 0, yy = y; yy <= y + h + .01; j++, yy += s * .866)
    for (let xx = x + (j % 2) * s / 2; xx <= x + w + .01; xx += s) {
      const r = s * .5 * clamp(f(xx, yy), 0, 1);
      if (r > .4) d += `M${f1(xx - r)} ${f1(yy)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0`;
    }
  if (d) grp.append(S('path', { d }));
  g.append(grp);
  return grp;
}
export function sparkle(g: G, x: number, y: number, r: number, fill: string, rot = 0) {
  const k = r * .18;
  const e = S('path', { d: `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`, fill, transform: rot ? `rotate(${rot} ${x} ${y})` : undefined });
  g.append(e);
  return e;
}
export function petal(g: G, x: number, y: number, r: number, fill: string, rot = 0, op = .95) {
  const e = S('path', { d: `M${x} ${y - r}C${x + r * .9} ${y - r * .55} ${x + r * .55} ${y + r * .7} ${x} ${y + r}C${x - r * .15} ${y + r * .4} ${x - r * .8} ${y - r * .1} ${x} ${y - r}Z`, fill, opacity: op, transform: `rotate(${rot} ${x} ${y})` });
  g.append(e);
  return e;
}
export function lozenge(g: G, x: number, y: number, r: number, fill: string, extra?: Attrs) {
  const e = S('path', Object.assign({ d: `M${f1(x)} ${f1(y - r)}L${f1(x + r * .72)} ${f1(y)}L${f1(x)} ${f1(y + r)}L${f1(x - r * .72)} ${f1(y)}Z`, fill }, extra || {}));
  g.append(e);
  return e;
}
/** the theme's small flourish: a sparkle by day, a falling petal by night */
export function mark(g: G, x: number, y: number, r: number, rot = 0) { return th.dark ? petal(g, x, y, r * .95, th.accent, rot) : sparkle(g, x, y, r, th.accent, rot); }
export function mark2(g: G, x: number, y: number, r: number, rot = 0) { return th.dark ? petal(g, x, y, r * .9, th.accentD, rot + 40, .9) : sparkle(g, x, y, r, th.accent2, rot); }
export function staff(g: G, x1: number, y1: number, x2: number, y2: number, gap: number, stroke: string, w: number, op = 1) {
  const grp = S('g', { stroke, 'stroke-width': w, opacity: op });
  for (let i = 0; i < 5; i++) grp.append(S('line', { x1, y1: y1 + i * gap, x2, y2: y2 + i * gap }));
  g.append(grp);
  return grp;
}
/** night sky; skip(x, y) keeps stars out of busy corners */
export function stars(g: G, x: number, y: number, w: number, h: number, n: number, seed: number, skip?: (x: number, y: number) => boolean) {
  const r = rng(seed), grp = S('g', { fill: '#EDE6E1' });
  g.append(grp);
  for (let i = 0; i < n; i++) {
    const sx = x + r() * w, sy = y + r() * h, big = r() < .08, op = .2 + r() * .5, sp = r() < .5;
    if (skip && skip(sx, sy)) continue;
    grp.append(S('circle', { cx: f1(sx), cy: f1(sy), r: big ? 1.3 : .7, opacity: op.toFixed(2) }));
    if (big && sp) sparkle(grp, sx, sy, 5, '#EDE6E1');
  }
  return grp;
}

/** a small rose window: rings of glass panes held by lead in a stone ring; restrained by default */
export function roseWin(svg: SVGSVGElement, g: G, cx: number, cy: number, r: number, col: string, o: { lead?: string; n1?: number; n2?: number; k2?: number; k3?: number; ring?: number; fill?: (k: number, ring: number) => string; flat?: boolean; lw?: number; beads?: boolean; gw?: number; go?: number; gold2?: boolean } = {}) {
  const lead = o.lead || '#0E080B', N1 = o.n1 || 16, N2 = o.n2 || 8, r2 = r * (o.k2 || .58), r3 = r * (o.k3 || .25), TAU = Math.PI * 2;
  const P = (rr: number, a: number) => `${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
  const sector = (ra: number, rb: number, a0: number, a1: number) => `M${P(rb, a0)}A${rb} ${rb} 0 0 1 ${P(rb, a1)}L${P(ra, a1)}A${ra} ${ra} 0 0 0 ${P(ra, a0)}Z`;
  const ring = o.ring || 5;
  g.append(S('circle', { cx, cy, r: r + ring, fill: lead }));
  const sh1 = [.1, .24, .16, .3], sh2 = [.34, .48];
  for (let k = 0; k < N1; k++) { const a0 = k / N1 * TAU - Math.PI / 2, a1 = (k + 1) / N1 * TAU - Math.PI / 2; g.append(S('path', { d: sector(r2, r, a0, a1), fill: o.fill ? o.fill(k, 1) : tint(col, sh1[k % 4]) })); }
  for (let k = 0; k < N2; k++) { const a0 = (k + .5) / N2 * TAU - Math.PI / 2, a1 = (k + 1.5) / N2 * TAU - Math.PI / 2; g.append(S('path', { d: sector(r3, r2, a0, a1), fill: o.fill ? o.fill(k, 2) : tint(col, sh2[k % 2]) })); }
  g.append(S('circle', { cx, cy, r: r3, fill: o.fill ? o.fill(0, 3) : tint(col, .66) }));
  if (!o.flat) g.append(S('circle', { cx, cy, r, fill: radGrad(svg, [[0, '#FFF3EE', .22], [.7, '#FFF3EE', .04], [1, '#FFF3EE', 0]]) }));
  const L = S('g', { stroke: lead, 'stroke-width': o.lw || 1.3, fill: 'none', 'stroke-linecap': 'round' });
  g.append(L);
  [r, r2, r3].forEach(rr => L.append(S('circle', { cx, cy, r: rr })));
  for (let k = 0; k < N1; k++) { const a = k / N1 * TAU - Math.PI / 2; L.append(S('line', { x1: cx + Math.cos(a) * r2, y1: cy + Math.sin(a) * r2, x2: cx + Math.cos(a) * r, y2: cy + Math.sin(a) * r })); }
  for (let k = 0; k < N2; k++) { const a = (k + .5) / N2 * TAU - Math.PI / 2; L.append(S('line', { x1: cx + Math.cos(a) * r3, y1: cy + Math.sin(a) * r3, x2: cx + Math.cos(a) * r2, y2: cy + Math.sin(a) * r2 })); }
  if (o.beads) for (let k = 0; k < N1; k++) { const a = (k + .5) / N1 * TAU - Math.PI / 2; g.append(S('circle', { cx: cx + Math.cos(a) * (r + ring * .5), cy: cy + Math.sin(a) * (r + ring * .5), r: ring * .3, fill: tint(col, .45) })); }
  g.append(S('circle', { cx, cy, r: r + ring, fill: 'none', stroke: '#D8B46A', 'stroke-width': o.gw || .9, opacity: o.go || .55 }));
  if (o.gold2) g.append(S('circle', { cx, cy, r: r + ring - 2.5, fill: 'none', stroke: '#D8B46A', 'stroke-width': .6, opacity: .35 }));
}

/** a rose window as stone tracery holds it: the stone is the dark ground, and the glass sits in separate shapes — pointed
    petals around a cusped centre medallion, and small roundels between the petals' tips. no lead line runs straight
    across, so it never reads as a dartboard. `col` tints the glass; a jewel blue and a little gold keep it from being
    one flat colour */
export function tracery(svg: SVGSVGElement, g: G, cx: number, cy: number, r: number, col: string, o: { n?: number; ring?: number } = {}) {
  const N = o.n || 12, ring = o.ring ?? r * .2, TAU = Math.PI * 2, stone = '#0E0A0D';
  const at = (a: number, u: number, v: number) => [cx + Math.cos(a) * u - Math.sin(a) * v, cy + Math.sin(a) * u + Math.cos(a) * v];
  const pt = (a: number, u: number, v: number) => at(a, u, v).map(f1).join(' ');
  const deep = mixHex(col, '#1B2A6B', .4), jewel = mixHex(col, '#3B1E6E', .35);
  g.append(S('circle', { cx, cy, r: r + ring, fill: stone }));
  // lancets: a squared inner end, sides that open out, a pointed arch at the rim, like small windows radiating
  const r0 = r * .34, r1 = r * .7, r2 = r * .95, half = Math.sin(Math.PI / N) * r1 * .82, rin = Math.sin(Math.PI / N) * r0 * .7;
  for (let k = 0; k < N; k++) {
    const a = k / N * TAU - Math.PI / 2;
    const d = `M${pt(a, r0, -rin)}L${pt(a, r0, rin)}L${pt(a, r1, half)}Q${pt(a, r1 + (r2 - r1) * .6, half)} ${pt(a, r2, 0)}Q${pt(a, r1 + (r2 - r1) * .6, -half)} ${pt(a, r1, -half)}Z`;
    g.append(S('path', { d, fill: linGradR(svg, at(a, r0, 0), at(a, r2, 0), [[0, tint(col, .3)], [.5, k % 2 ? deep : col], [1, jewel]]) }));
  }
  // small roundels in the stone between the petals' tips
  for (let k = 0; k < N; k++) {
    const a = (k + .5) / N * TAU - Math.PI / 2, [x, y] = at(a, r * .9, 0);
    g.append(S('circle', { cx: f1(x), cy: f1(y), r: f1(r * .075), fill: mixHex(col, '#D8B46A', .5) }));
  }
  // the centre medallion, cusped
  const rc = r * .24;
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU, [x, y] = at(a, rc * .72, 0); g.append(S('circle', { cx: f1(x), cy: f1(y), r: f1(rc * .4), fill: tint(col, .45) })); }
  g.append(S('circle', { cx, cy, r: f1(rc * .78), fill: tint(col, .55) }));
  g.append(S('circle', { cx, cy, r: f1(rc * .3), fill: mixHex(col, '#C4293E', .5) }));
  // light through the glass, and the gilded edge of the stone
  g.append(S('circle', { cx, cy, r, fill: radGrad(svg, [[0, '#FFF3EE', .12], [.6, '#FFF3EE', .03], [1, '#FFF3EE', 0]]) }));
  g.append(S('circle', { cx, cy, r: r + ring, fill: 'none', stroke: '#D8B46A', 'stroke-width': .9, opacity: .55 }));
}
/** a linear gradient between two points (user space) */
function linGradR(svg: SVGSVGElement, a: number[], b: number[], stops: [number, string][]) {
  const id = uid('g');
  defs(svg).append(S('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: f1(a[0]), y1: f1(a[1]), x2: f1(b[0]), y2: f1(b[1]) }, stops.map(([o, c]) => S('stop', { offset: o, 'stop-color': c }))));
  return `url(#${id})`;
}
