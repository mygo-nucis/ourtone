import { studio, isDrums } from '../../lib/project/studio.svelte';
import { chordOf, triads, type Chord, type Sounding } from '../../lib/music/harmony';

/* the chord of every bar, from every pitched part, worked out once per edit */
let rev = -1, cache: { chords: (Chord | null)[]; triads: Chord[] } = { chords: [], triads: [] };
export function harmony() {
  const d = studio.doc, g = studio.grid;
  if (!d || !g) return cache;
  if (studio.rev === rev && cache.chords.length) return cache;
  rev = studio.rev;
  const tri = triads(d.meta.key.tonic, d.meta.key.mode);
  const parts = d.parts.filter(p => !isDrums(p.meta)).map(p => p.notes);
  const ptr = parts.map(() => 0), chords: (Chord | null)[] = [];
  for (let b = 0; b < g.bars.length; b++) {
    const a = g.tickOf(b), e = g.tickOf(b + 1), beat = g.beat(a), sounding: Sounding[] = [];
    parts.forEach((ns, k) => {
      // notes that started up to two bars back may still sound here
      while (ptr[k] < ns.length && ns[ptr[k]].t + 2 * (e - a) < a) ptr[k]++;
      for (let i = ptr[k]; i < ns.length && ns[i].t < e; i++) if (ns[i].t + ns[i].d > a) sounding.push(ns[i]);
    });
    chords.push(chordOf(sounding, a, e, tri, beat));
  }
  cache = { chords, triads: tri };
  return cache;
}
