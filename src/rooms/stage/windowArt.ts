import type { StageLayout, Win } from './layout';
import type { Part } from '../../lib/music/song';
import type { Palette } from '../../lib/art/palette';
import { S, T, linGrad, radGrad, lattice, clipPathD, archD, rectD } from '../../lib/art/svg';
import { setPalette } from '../../lib/art/ctx';
import { halftone, lozenge, tracery, mark, mark2 } from '../../lib/art/marks';
import { serif, sans, disp, measure, F } from '../../lib/art/type';
import { picon } from '../../lib/art/icons';
import { partColor, tint } from '../../lib/art/palette';
import { rng, clamp } from '../../lib/util';
import { i18n } from '../../lib/i18n/index.svelte';

/* a stage window's art: the frame and glass under the notes, the label panel over them. the stage draws it for each
   part, and play mode draws the same window again as the floor of its highway. */
export const shapeD = (night: boolean, v: { x: number; y: number; w: number; h: number }) => night ? archD(v.x, v.y, v.w, v.h) : rectD(v.x, v.y, v.w, v.h, 4);

export function fitText(text: string, font: (px: number) => string, max: number, size: number, min = 11) {
  const w1 = measure(text, font(100)) / 100;
  return w1 > 0 ? clamp(Math.min(size, max / w1), min, size) : size;
}

export interface WindowArt {
  w: Win; p: Part; L: StageLayout; songId: string;
  /** chosen: the gold halo by night, the blue rim by day */
  sel: boolean; focused: boolean;
  /** the "you play" sticker beside a chosen window */
  sticker: boolean;
  /** play mode's highway: the night's border band is drawn at under half its width, so the lanes take the room */
  slim?: boolean;
  /** a phone's highway: the rim round the window (white by day, the frame by night) and the night's band thinner still */
  tight?: boolean;
}

export function paintWindow(under: SVGSVGElement, over: SVGSVGElement | null, th: Palette, o: WindowArt) {
  const { w, p, L, sel, focused } = o, night = th.dark;
  setPalette(th);
  under.replaceChildren(); over?.replaceChildren();
  const d = p.data, col = partColor(th, d.color), k = w.k;
  const { x, y, w: PW, h: H, cx, cy } = w;
  const grp = S('g', { transform: w.rot ? `rotate(${w.rot} ${cx} ${cy})` : undefined });
  under.append(grp);
  if (night) {
    if (sel) grp.append(S('path', { d: archD(x - 16, y - 24, PW + 32, H + 24), fill: th.orn, opacity: .12, class: 'ut-fadein' }));
    const fr = o.tight ? 5 : 9;
    grp.append(S('path', { d: archD(x - fr, y - fr * 4 / 3, PW + 2 * fr, H + fr * 4 / 3), fill: '#0B0A0E', stroke: sel ? th.orn : th.frameStroke, 'stroke-width': sel ? 2.2 : 1.2, class: 'frame' }));
  } else {
    grp.append(S('rect', { x: x + 7, y: y + 10, width: PW, height: H, rx: 6, fill: 'rgba(28,32,48,.13)', class: 'shade' }));
    const wr = o.tight ? 4 : 8;
    grp.append(S('rect', { x: x - wr, y: y - wr, width: PW + 2 * wr, height: H + 2 * wr, rx: wr + 2, fill: '#FFFFFF' }));
  }
  const inner = S('g', { 'clip-path': clipPathD(under, shapeD(night, w)) });
  grp.append(inner);
  if (night) {
    inner.append(S('rect', { x, y, width: PW, height: H, fill: linGrad(under, [[0, col], [.18, col, .92], [.6, '#1A0D14'], [1, '#0B0A0E']]) }));
    inner.append(S('ellipse', { cx, cy: y + 90 * k, rx: PW * .7, ry: 120 * k, fill: radGrad(under, [[0, '#FFF3EE', .22], [1, '#FFF3EE', 0]]) }));
    const qr = rng(w.part * 97 + 13 + o.songId.length * 7);
    let dl = '', dd = '';
    for (let jj = Math.floor((y - 40) / 19.5); jj * 19.5 < y + H + 40; jj++) for (let ii = Math.floor((x - 40) / 26); ii * 26 < x + PW + 40; ii++) {
      const qx = ii * 26 + (jj % 2 ? 0 : 13), qy = jj * 19.5, v = qr();
      const path = `M${qx} ${qy - 19.5}L${qx + 13} ${qy}L${qx} ${qy + 19.5}L${qx - 13} ${qy}Z`;
      if (v > .72) dl += path; else if (v < .3) dd += path;
    }
    inner.append(S('path', { d: dl, fill: '#FFF3EE', opacity: .035 }));
    inner.append(S('path', { d: dd, fill: '#000000', opacity: .06 }));
    inner.append(S('rect', { x, y, width: PW, height: H, fill: lattice(under, 26, 'rgba(11,10,14,.5)', 1.6) }));
    inner.append(S('rect', { x, y, width: PW, height: H, fill: lattice(under, 26, 'rgba(237,230,225,.12)', .8) }));
    halftone(inner, x, y, PW, H, 8, 'rgba(0,0,0,.45)', (_xx, yy) => Math.pow((yy - y) / H, 1.4));
    const b = (o.tight ? .22 : o.slim ? .45 : 1) * k, band = archD(x + 11 * b, y + 13 * b, PW - 22 * b, H - 13 * b);
    inner.append(S('path', { d: band, fill: 'none', stroke: '#0B0A0E', 'stroke-width': 11 * b, opacity: .92 }));
    inner.append(S('path', { d: band, fill: 'none', stroke: tint(col, .3), 'stroke-width': 7 * b, 'stroke-dasharray': `${10 * b} ${4 * b}` }));
    inner.append(S('path', { d: band, fill: 'none', stroke: '#D8B46A', 'stroke-width': 7 * b, 'stroke-dasharray': `${3 * b} ${11 * b}`, 'stroke-dashoffset': -10.5 * b, opacity: sel ? .9 : .6 }));
    tracery(under, inner, cx, y + 72 * k, 24 * k, col, { ring: 5 * k });
  } else {
    inner.append(S('rect', { x, y, width: PW, height: H, fill: col }));
    halftone(inner, x, y, PW, H, 10, th.tone, (_xx, yy) => Math.pow((yy - y) / H, 1.8) * .95);
  }
  if (!over) return;

  const og = S('g', { transform: w.rot ? `rotate(${w.rot} ${cx} ${cy})` : undefined });
  over.append(og);
  const oi = S('g', { 'clip-path': clipPathD(over, shapeD(night, w)) });
  og.append(oi);
  const panel = L.panel(w), pk = panel / (132 * k);
  oi.append(S('rect', { x, y: y + H - panel, width: PW, height: panel, fill: night ? 'rgba(11,10,14,.8)' : 'rgba(255,255,255,.8)' }));
  if (night) { oi.append(S('line', { x1: x + 14, y1: y + H - panel, x2: x + PW - 14, y2: y + H - panel, stroke: th.frameStroke, 'stroke-width': 1 })); lozenge(oi, cx, y + H - panel, 5, sel ? th.orn : th.frameStroke); }
  const ic = 64 * k * pk;
  picon(oi, d.icon, x + 14 * k, y + H - panel + 6 * k, ic, col);
  const name = shownName(d, night);
  // English names by day are instruments of every length ("Drums", "Acoustic guitar"): one modest size for all of them,
  // so the windows read as a set
  const nsz = fitText(name, px => `900 ${px}px ${F.serif}`, PW - ic - 32 * k, (!night && i18n.lang === 'en' ? 17 : 24) * k * pk);
  oi.append(T(x + PW - 18 * k, y + H - panel + 56 * k * pk, name, serif(nsz, 900, th.ink, { 'text-anchor': 'end' })));
  const tag = night ? d.tag.night : d.tag.day;
  const tfont = night ? (px: number) => `400 ${px * 1.2}px ${F.goth}` : (px: number) => `italic 900 ${px}px ${F.disp}`;
  const tsz = fitText(tag, tfont, PW - 36 * k, 28 * k * pk, 12);
  oi.append(T(x + 18 * k, y + H - 24 * k * pk, tag, disp(tsz, night ? (sel ? th.orn : th.ink2) : th.ink, { style: 'font-stretch:108%', 'letter-spacing': night ? 1 : 0 })));
  if (sel && !night) og.append(S('rect', { x: x - 8, y: y - 8, width: PW + 16, height: H + 16, rx: 10, fill: 'none', stroke: th.accent, 'stroke-width': 5, class: 'ut-fadein' }));
  if (focused) {
    if (night) og.append(S('path', { d: archD(x - 15, y - 21, PW + 30, H + 24), fill: 'none', stroke: th.orn, 'stroke-width': 1.6, 'stroke-dasharray': '5 5' }));
    else og.append(S('rect', { x: x - 14, y: y - 14, width: PW + 28, height: H + 28, rx: 14, fill: 'none', stroke: th.accent, 'stroke-width': 2.5, 'stroke-dasharray': '7 6' }));
  }
  if (sel && o.sticker) {
    const c = L.compact, lw = c ? 128 : 170, lh = c ? 38 : 48, size = c ? 15 : 20;
    const lx = x - (c ? 40 : 74), ly = y - (c ? 30 : 46);
    const pop = S('g', { class: 'ut-pop' });
    over.append(pop);
    label(th, pop, lx, ly, lw, lh, i18n.t('youPlay'), night ? -3 : -6, size);
    mark(pop, lx + lw + 12, ly + 2, c ? 11 : 15, 12);
    mark2(pop, lx + lw + 36, ly + 30, c ? 6 : 8);
  }
}

/* by day the tag repeats the role in capitals, so an English name that only says the same ("Melody" over MELODY) gives
   way to the instrument ("Violin" over MELODY), keeping a part number ("Overdriven guitar 2"). an instrument that is
   not the named one (a cello part played on the viola preset) leaves the name alone. */
function shownName(d: Part['data'], night: boolean) {
  const name = i18n.pick(d.name);
  if (night || i18n.lang !== 'en') return name;
  const [, base, num] = name.match(/^(.*?)\s*(\d+)?$/) ?? [name, name, undefined];
  const inst = d.inst.en, b = base.toLowerCase();
  if (b !== d.tag.day.toLowerCase()) return name;
  if (b !== 'melody' && !inst.toLowerCase().includes(b)) return name;
  return num ? `${inst} ${num}` : inst;
}

function label(th: Palette, g: SVGElement, x: number, y: number, lw: number, h: number, text: string, rot: number, size: number) {
  const cx = x + lw / 2, cy = y + h / 2, grp = S('g', { transform: `rotate(${rot} ${cx} ${cy})` });
  g.append(grp);
  const fsz = fitText(text, px => `900 ${px}px ${th.dark ? F.serif : F.sans}`, lw - (th.dark ? 34 : 20), size, 10);
  if (th.dark) {
    const n = 14;
    grp.append(S('path', { d: `M${x - 8} ${y + 4}H${x + lw + 8}L${x + lw + 8 - n} ${cy + 4}L${x + lw + 8} ${y + h + 4}H${x - 8}L${x - 8 + n} ${cy + 4}Z`, fill: th.accentD }));
    grp.append(S('path', { d: `M${x} ${y}H${x + lw}L${x + lw - n} ${cy}L${x + lw} ${y + h}H${x}L${x + n} ${cy}Z`, fill: th.accent }));
    grp.append(S('path', { d: `M${x + n + 2} ${y + 4}H${x + lw - n - 2}M${x + n + 2} ${y + h - 4}H${x + lw - n - 2}`, stroke: 'rgba(216,180,106,.55)', 'stroke-width': 1 }));
    grp.append(T(cx, cy + fsz * .36, text, serif(fsz, 900, th.on, { 'text-anchor': 'middle', 'letter-spacing': 2 })));
  } else {
    grp.append(S('rect', { x: x + 3, y: y + 5, width: lw, height: h, rx: 6, fill: 'rgba(28,32,48,.14)' }));
    grp.append(S('rect', { x: x - 5, y: y - 5, width: lw + 10, height: h + 10, rx: 10, fill: '#FFFFFF' }));
    grp.append(S('rect', { x, y, width: lw, height: h, rx: 6, fill: th.accent }));
    grp.append(T(cx, cy + fsz * .36, text, sans(fsz, 900, th.on, { 'text-anchor': 'middle', 'letter-spacing': 2 })));
    grp.append(S('path', { d: `M${x + lw - 17} ${y - 5}L${x + lw + 5} ${y + 17}L${x + lw - 10} ${y + 10}Z`, fill: 'rgba(28,32,48,.18)', transform: 'translate(1 2)' }));
    grp.append(S('path', { d: `M${x + lw - 17} ${y - 5}L${x + lw + 5} ${y + 17}L${x + lw - 10} ${y + 10}Z`, fill: '#EEF3F9', stroke: '#FFFFFF', 'stroke-width': 1 }));
  }
}
