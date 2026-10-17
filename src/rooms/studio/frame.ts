/* the studio is laid out on a virtual canvas like the stage: 900 units tall (more on tall windows), as wide as the
   window allows, scaled to fit. wider windows show more of the timeline rather than bigger controls. */
export interface Frame { s: number; W: number; H: number; compact: boolean }
export function studioFrame(vw: number, vh: number): Frame {
  const compact = vh < 560 || vw / vh > 2.05;
  if (compact) { const s = Math.max(.7, Math.min(vh / 430, vw / 900, 1.1)); return { s, W: vw / s, H: vh / s, compact }; }
  const s = Math.max(.72, Math.min(vh / 900, vw / 1280, 1.25));
  return { s, W: vw / s, H: vh / s, compact };
}
/** the heights of the fixed rows */
export const TOP = 64, ROW2 = 40, STATUS = 36;
export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl+';
