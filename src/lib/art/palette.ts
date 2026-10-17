/* the two skies. member colours run in the order melody, guitar, piano, bass, drums,
   followed by two extra colours for any other parts. */
export interface Palette {
  dark: boolean;
  bg: string; desk: string; surface: string; page: string; base: string; p2: string; alt: string; well: string;
  ink: string; ink2: string; muted: string; hair: string;
  accent: string; accentD: string; accentSoft: string; accent2: string; sky: string;
  wash: string; washOp: number; signal: string; now: string; on: string; melody: string; dotGrid: string; tone: string; halo: string; orn: string;
  rule: string; off: string; track: string; ivory: string; ebony: string; keyLine: string; keyText: string;
  parts: string[]; partsInk: string[];
  noteFill: string; noteStroke: string; selNote: string; selNoteStroke: string; frameStroke: string;
}

export const DAY: Palette = {
  dark: false, bg: '#F6F8FB', desk: '#EBEEF3', surface: '#FFFFFF', page: '#FDFDFB', base: '#FFFFFF', p2: '#F7F9FC', alt: '#FBFCFE', well: '#FFFFFF',
  ink: '#1C2030', ink2: '#474E5F', muted: '#8B93A4', hair: '#DCE2EA', accent: '#2F86E8', accentD: '#1E5DB6', accentSoft: '#E4F0FC', accent2: '#95CEF3', sky: '#CBE8FB',
  wash: '#FBE38A', washOp: .75, signal: '#E2483F', now: '#E2483F', on: '#FFFFFF', melody: '#2F86E8', dotGrid: '#D8E1EC', tone: 'rgba(28,32,48,.16)', halo: '#D7E3F2', orn: '#2F86E8',
  rule: '#A9C3E3', off: '#D5DCE6', track: '#DCE3EC', ivory: '#FFFFFF', ebony: '#1C2030', keyLine: '#DCE2EA', keyText: '#8B93A4',
  parts: ['#95CEF3', '#F6B0C3', '#A3DECA', '#F4D98A', '#C8C0F2', '#CDEBDF', '#F9D2B8'],
  partsInk: ['#2F86E8', '#E0668A', '#2FA37E', '#D29A12', '#7A6CD6', '#3E9C86', '#D9824E'],
  noteFill: '#FFFFFF', noteStroke: '#1C2030', selNote: '#2F86E8', selNoteStroke: '#FFFFFF', frameStroke: '#FFFFFF'
};

export const NIGHT: Palette = {
  dark: true, bg: '#0B0A0E', desk: '#0E0C11', surface: '#16141B', page: '#131117', base: '#121015', p2: '#16141B', alt: '#17151C', well: '#0E0C11',
  ink: '#EDE6E1', ink2: '#C9C0BD', muted: '#8E8792', hair: 'rgba(237,230,225,.12)', accent: '#C4293E', accentD: '#8E1728', accentSoft: 'rgba(196,41,62,.16)', accent2: '#6E1422', sky: '#2A0F16',
  wash: '#D8B46A', washOp: .2, signal: '#C4293E', now: '#D8B46A', on: '#FFF3EE', melody: '#EDE6E1', dotGrid: 'rgba(169,173,186,.16)', tone: 'rgba(0,0,0,.4)', halo: '#2A1218', orn: '#D8B46A',
  rule: 'rgba(196,41,62,.6)', off: '#2C2832', track: '#2A2630', ivory: '#D9D2CD', ebony: '#0B0A0E', keyLine: 'rgba(11,10,14,.35)', keyText: '#5A5360',
  parts: ['#C0973F', '#2E6E52', '#2F559E', '#A3243A', '#65408F', '#3D6C8C', '#8C4F2C'],
  partsInk: ['#E2BC62', '#56AE86', '#6B92E0', '#DA4D63', '#A57AD8', '#6FA3C4', '#C98252'],
  noteFill: '#EDE6E1', noteStroke: '#0B0A0E', selNote: '#C4293E', selNoteStroke: '#EDE6E1', frameStroke: 'rgba(237,230,225,.55)'
};

/** colour for a part slot; slots past the palette reuse it, lightened or deepened */
export function partColor(p: Palette, i: number, ink = false) {
  const list = ink ? p.partsInk : p.parts, n = list.length, base = list[((i % n) + n) % n];
  const round = Math.floor(i / n);
  if (!round) return base;
  return p.dark ? mixHex(base, '#0B0A0E', .25 * round) : tint(base, .35 * round);
}

export function tint(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16), f = (v: number) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0');
  return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255);
}
export function mixHex(a: string, b: string, t: number) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const f = (sh: number) => Math.round(((A >> sh) & 255) * (1 - t) + ((B >> sh) & 255) * t).toString(16).padStart(2, '0');
  return '#' + f(16) + f(8) + f(0);
}
export function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
