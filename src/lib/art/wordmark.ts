import { S, T, radGrad, clipPathD, rectD } from './svg';
import { F } from './type';
import { lozenge, halftone, sparkle } from './marks';
import { clamp } from '../util';

/* the wordmark, Ourtone (after MyGO's game Our Notes): the crossbar of the t runs on as a ledger line, and the o is a
   note head hanging under it — our tone, written on the staff. day: heavy italic, ink letters, MyGO-blue oval head;
   night: sharp blackletter, bone letters, gold hairline, crimson lozenge.
   measures its own letters, so the group must already be in a rendered SVG. returns the width. */
export function wordmark(g: SVGElement, x: number, y: number, s: number, night: boolean, o: { ink?: string; acc?: string; line?: string } = {}) {
  const grp = S('g');
  g.append(grp);
  const ink = o.ink || (night ? '#EDE6E1' : '#1C2030'), acc = o.acc || (night ? '#C4293E' : '#2F86E8'), gold = '#D8B46A', fs = night ? s * 1.2 : s;
  const base = night
    ? { 'font-family': F.goth, 'font-size': fs, 'font-weight': 400, fill: ink, 'letter-spacing': (fs * .012).toFixed(2) }
    : { 'font-family': F.disp, 'font-size': fs, 'font-weight': 900, 'font-style': 'italic', style: 'font-stretch:118%', fill: ink, 'letter-spacing': (-fs * .006).toFixed(2) };
  const t1 = T(x, y, 'Ourt', base);
  grp.append(t1);
  const w1 = t1.getComputedTextLength();
  let xe: number;
  if (night) {
    const top = y - .405 * fs, lh = Math.max(1, .026 * fs), r = (.405 * fs - lh - .026 * fs) / 2, cx = x + w1 + .05 * fs + r * .72, cy = y - r;
    const lx0 = x + w1 - .03 * fs, lx1 = cx + r * .72 + .11 * fs;
    grp.append(S('rect', { x: lx0, y: top, width: lx1 - lx0, height: lh, fill: o.line || gold }));
    lozenge(grp, cx, cy, r, acc, { stroke: gold, 'stroke-width': Math.max(.8, .022 * fs) });
    xe = cx + r * .72 + .1 * fs;
  } else {
    const top = y - .5275 * fs, lh = Math.max(1.2, .058 * fs), h = .5275 * fs - lh - .022 * fs, ry = h / 2.094, rx = ry * 1.42, bw = 2 * Math.sqrt(rx * rx * .883 + ry * ry * .117);
    const cx = x + w1 + .03 * fs + bw / 2, cy = y - h / 2 + .012 * fs, lx0 = x + w1 - .14 * fs, lx1 = cx + bw / 2 + .08 * fs;
    grp.append(S('rect', { x: lx0, y: top, width: lx1 - lx0, height: lh, fill: o.line || ink }));
    grp.append(S('ellipse', { cx, cy, rx, ry, fill: acc, transform: `rotate(-20 ${cx} ${cy})` }));
    xe = cx + bw / 2 + .1 * fs;
  }
  const t2 = T(xe, y, 'ne', base);
  grp.append(t2);
  return xe + t2.getComputedTextLength() - x;
}

/** the symbol: the same ledger line and note, alone on a tile */
export function logoTile(svg: SVGSVGElement, g: SVGElement, x: number, y: number, s: number, night: boolean) {
  if (night) {
    g.append(S('rect', { x, y, width: s, height: s, rx: s * .22, fill: '#0B0A0E' }));
    g.append(S('rect', { x, y, width: s, height: s, rx: s * .22, fill: radGrad(svg, [[0, '#6E1422', .85], [1, '#0B0A0E', 0]]) }));
    g.append(S('rect', { x: x + s * .07, y: y + s * .07, width: s * .86, height: s * .86, rx: s * .16, fill: 'none', stroke: '#D8B46A', 'stroke-width': Math.max(.7, s * .012), opacity: .75 }));
    const top = y + s * .37, lh = Math.max(1, s * .024), r = s * .16;
    g.append(S('rect', { x: x + s * .22, y: top, width: s * .56, height: lh, fill: '#D8B46A' }));
    lozenge(g, x + s * .5, top + lh + s * .035 + r, r, '#C4293E', { stroke: '#D8B46A', 'stroke-width': Math.max(.7, s * .014) });
  } else {
    g.append(S('rect', { x, y, width: s, height: s, rx: s * .24, fill: '#2F86E8' }));
    const clip = S('g', { 'clip-path': clipPathD(svg, rectD(x, y, s, s, s * .24)) });
    g.append(clip);
    if (s > 30) halftone(clip, x, y + s * .45, s * .6, s * .55, s * .09, '#95CEF3', (xx, yy) => clamp(1 - Math.hypot(xx - x, y + s - yy) / (s * .6), 0, 1));
    const top = y + s * .35, lh = Math.max(1.2, s * .045), ry = s * .13, rx = ry * 1.42;
    g.append(S('rect', { x: x + s * .2, y: top, width: s * .6, height: lh, rx: lh / 2, fill: '#FFFFFF' }));
    const cx = x + s * .52, cy = top + lh + s * .03 + ry * 1.05;
    g.append(S('ellipse', { cx, cy, rx, ry, fill: '#FFFFFF', transform: `rotate(-20 ${cx} ${cy})` }));
    if (s > 30) sparkle(g, x + s * .8, y + s * .2, s * .07, '#FFFFFF');
  }
}
