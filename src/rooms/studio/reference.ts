import { studio, isDrums } from '../../lib/project/studio.svelte';

/** the part to show faintly under the one being edited: the chosen one, or (for the melody) the guitar or piano, else the melody */
export function refOf(): number {
  const d = studio.doc, i = studio.part;
  if (!d || studio.refPart === -2 || !d.parts[i] || isDrums(d.parts[i].meta) || d.parts[i].meta.kind === 'audio') return -2;
  if (studio.refPart >= 0 && studio.refPart !== i && studio.refPart < d.parts.length && d.parts[studio.refPart].meta.kind !== 'audio') return studio.refPart;
  // audio tracks have no notes to show
  const roles = d.parts.map(p => p.meta.kind === 'audio' ? 'audio' : p.meta.role);
  const pick = (r: string) => roles.findIndex((x, k) => x === r && k !== i);
  if (roles[i] === 'melody') { const g = pick('guitar'); if (g >= 0) return g; const p = pick('piano'); if (p >= 0) return p; }
  const m = pick('melody');
  return m >= 0 ? m : -2;
}
