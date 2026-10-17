import { th } from './ctx';
import type { Attrs } from './svg';

export const F = {
  serif: '"Noto Serif SC","Songti SC","STSong","SimSun",serif',
  sans: '"Noto Sans SC","PingFang SC","Microsoft YaHei",system-ui,sans-serif',
  disp: '"Archivo","Noto Sans SC",system-ui,sans-serif',
  goth: '"Manufacturing Consent","Noto Serif SC",serif',
  gar: '"Cormorant Garamond","Noto Serif SC",serif',
  mincho: '"Shippori Mincho B1","Noto Serif SC",serif'
};

export const serif = (size: number, w = 900, fill?: string, extra?: Attrs): Attrs => Object.assign({ 'font-family': F.serif, 'font-size': size, 'font-weight': w, fill: fill || th.ink }, extra || {});
export const sans = (size: number, w = 500, fill?: string, extra?: Attrs): Attrs => Object.assign({ 'font-family': F.sans, 'font-size': size, 'font-weight': w, fill: fill || th.ink }, extra || {});
/** display latin: heavy wide italic by day, blackletter by night (never set whole words in capitals at night) */
export function disp(size: number, fill?: string, extra?: Attrs): Attrs {
  if (th.dark) { const e = Object.assign({}, extra || {}); delete e.style; return Object.assign({ 'font-family': F.goth, 'font-size': Math.round(size * 1.2), 'font-weight': 400, fill: fill || th.ink }, e); }
  return Object.assign({ 'font-family': F.disp, 'font-size': size, 'font-weight': 900, 'font-style': 'italic', style: 'font-stretch:112%', fill: fill || th.ink }, extra || {});
}
/** numerals: the day display face, Cormorant Garamond by night */
export function num(size: number, fill?: string, extra?: Attrs): Attrs {
  if (th.dark) { const e = Object.assign({}, extra || {}); delete e.style; return Object.assign({ 'font-family': F.gar, 'font-size': Math.round(size * 1.14), 'font-weight': 700, fill: fill || th.ink }, e); }
  return disp(size, fill, extra);
}
/** song titles: Noto Serif SC black by day, Shippori Mincho B1 by night */
export function title(size: number, fill?: string, extra?: Attrs): Attrs {
  return th.dark ? Object.assign({ 'font-family': F.mincho, 'font-size': size, 'font-weight': 800, fill: fill || th.ink }, extra || {}) : serif(size, 900, fill, extra);
}
/** Cormorant names and meta (night programme) */
export const gar = (size: number, fill?: string, extra?: Attrs, italic = false): Attrs => Object.assign({ 'font-family': F.gar, 'font-size': size, 'font-weight': 600, 'font-style': italic ? 'italic' : 'normal', fill: fill || th.ink }, extra || {});

const CJK = /[⺀-鿿　-〿＀-￯]/;
/** rough width, good enough before fonts load */
export const tw = (s: string, size: number, ls = 0) => { let w = 0; const cs = [...s]; for (const ch of cs) w += CJK.test(ch) ? size : ch === ' ' ? size * .3 : size * .6; return w + ls * cs.length; };

let mctx: CanvasRenderingContext2D | null = null;
/** exact advance width with the loaded web fonts */
export function measure(text: string, font: string, letterSpacing = 0) {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d');
  if (!mctx) return tw(text, 16);
  mctx.font = font;
  return mctx.measureText(text).width + letterSpacing * [...text].length;
}
