import { DAY, type Palette } from './palette';
/* the palette the drawing helpers read. every renderer sets it before drawing; drawing is synchronous. */
export let th: Palette = DAY;
export function setPalette(p: Palette) { th = p; }
