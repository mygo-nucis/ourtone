export const NS = 'http://www.w3.org/2000/svg';
export const XH = 'http://www.w3.org/1999/xhtml';
export type Attrs = Record<string, string | number | undefined | null | false>;
type Kid = Node | null | undefined | false;

export function S<K extends keyof SVGElementTagNameMap>(tag: K, a?: Attrs, kids?: Kid | Kid[]): SVGElementTagNameMap[K];
export function S(tag: string, a?: Attrs, kids?: Kid | Kid[]): SVGElement;
export function S(tag: string, a?: Attrs, kids?: Kid | Kid[]) {
  const e = document.createElementNS(NS, tag);
  if (a) for (const k in a) { const v = a[k]; if (v !== undefined && v !== null && v !== false && v !== '') e.setAttribute(k, String(v)); }
  if (kids) for (const c of ([] as Kid[]).concat(kids)) if (c) e.append(c);
  return e;
}
export function T(x: number, y: number, s: string, a?: Attrs) {
  const e = S('text', Object.assign({ x: +x.toFixed(2), y: +y.toFixed(2) }, a || {}));
  e.textContent = s;
  return e;
}
/** text with ♯ / ♭: the CJK fonts draw them full-width, so shrink, raise and pull them in */
export function Tn(x: number, y: number, s: string, a?: Attrs, o: { k?: number; raise?: number; pull?: number } = {}) {
  const e = S('text', Object.assign({ x, y }, a || {})), size = +((a || {})['font-size'] || 12), k = o.k || .8;
  const raise = o.raise === undefined ? .3 : o.raise, pull = (o.pull === undefined ? .2 : o.pull) * size;
  let up = false;
  for (const p of s.split(/([♯♭])/)) {
    if (!p) continue;
    const acc = p === '♯' || p === '♭';
    const t = S('tspan', acc ? { dx: (-pull).toFixed(1), dy: (-raise * size).toFixed(1), 'font-size': (k * size).toFixed(1) } : up ? { dx: (-pull).toFixed(1), dy: (raise * size).toFixed(1) } : {});
    t.textContent = p; e.append(t); up = acc;
  }
  return e;
}
export function hEl(tag: string, style: string, text?: string) {
  const e = document.createElementNS(XH, tag) as HTMLElement;
  e.setAttribute('style', style);
  if (text !== undefined) e.textContent = text;
  return e;
}

let UID = 0;
export const uid = (p = 'u') => 'ut' + p + (UID++).toString(36);
export function defs(svg: SVGSVGElement) {
  let d = svg.querySelector(':scope > defs') as SVGDefsElement | null;
  if (!d) { d = S('defs'); svg.prepend(d); }
  return d;
}
export function clipPathD(svg: SVGSVGElement, d: string) {
  const id = uid('k');
  defs(svg).append(S('clipPath', { id }, S('path', { d })));
  return `url(#${id})`;
}
type Stop = [number, string, number?];
export function linGrad(svg: SVGSVGElement, stops: Stop[], vertical = true, a?: Attrs) {
  const id = uid('g');
  defs(svg).append(S('linearGradient', Object.assign({ id, x1: 0, y1: 0, x2: vertical ? 0 : 1, y2: vertical ? 1 : 0 }, a || {}), stops.map(([o, c, op]) => S('stop', { offset: o, 'stop-color': c, 'stop-opacity': op === undefined ? 1 : op }))));
  return `url(#${id})`;
}
export function radGrad(svg: SVGSVGElement, stops: Stop[], a?: Attrs) {
  const id = uid('g');
  defs(svg).append(S('radialGradient', Object.assign({ id }, a || {}), stops.map(([o, c, op]) => S('stop', { offset: o, 'stop-color': c, 'stop-opacity': op === undefined ? 1 : op }))));
  return `url(#${id})`;
}
export function lattice(svg: SVGSVGElement, size: number, color: string, w: number) {
  const id = uid('p');
  defs(svg).append(S('pattern', { id, width: size, height: size * 1.5, patternUnits: 'userSpaceOnUse' }, S('path', { d: `M0 0L${size} ${size * 1.5}M${size} 0L0 ${size * 1.5}`, stroke: color, 'stroke-width': w, fill: 'none' })));
  return `url(#${id})`;
}
export function dropShadow(svg: SVGSVGElement, dx: number, dy: number, sd: number, color: string, op: number, box = { x: '-20%', y: '-40%', w: '140%', h: '180%' }) {
  const id = uid('f');
  defs(svg).append(S('filter', { id, x: box.x, y: box.y, width: box.w, height: box.h }, S('feDropShadow', { dx, dy, stdDeviation: sd, 'flood-color': color, 'flood-opacity': op })));
  return `url(#${id})`;
}

const f2 = (v: number) => +v.toFixed(2);
export function rectD(x: number, y: number, w: number, h: number, r = 0) {
  return `M${f2(x + r)} ${f2(y)}H${f2(x + w - r)}Q${f2(x + w)} ${f2(y)} ${f2(x + w)} ${f2(y + r)}V${f2(y + h - r)}Q${f2(x + w)} ${f2(y + h)} ${f2(x + w - r)} ${f2(y + h)}H${f2(x + r)}Q${f2(x)} ${f2(y + h)} ${f2(x)} ${f2(y + h - r)}V${f2(y + r)}Q${f2(x)} ${f2(y)} ${f2(x + r)} ${f2(y)}Z`;
}
/** a pointed gothic arch: two arcs meeting at the top */
export function archD(x: number, y: number, w: number, h: number) {
  const a = w * .62, R = w * .8;
  return `M${f2(x)} ${f2(y + h)}V${f2(y + a)}A${f2(R)} ${f2(R)} 0 0 1 ${f2(x + w / 2)} ${f2(y)}A${f2(R)} ${f2(R)} 0 0 1 ${f2(x + w)} ${f2(y + a)}V${f2(y + h)}Z`;
}
export function chamferD(x: number, y: number, w: number, h: number, c: number) {
  return `M${f2(x + c)} ${f2(y)}H${f2(x + w - c)}L${f2(x + w)} ${f2(y + c)}V${f2(y + h - c)}L${f2(x + w - c)} ${f2(y + h)}H${f2(x + c)}L${f2(x)} ${f2(y + h - c)}V${f2(y + c)}Z`;
}
