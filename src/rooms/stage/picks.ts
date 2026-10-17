import type { Song } from '../../lib/music/song';

/* the parts picked for multi-track play, kept per song on this device (by the parts' ids, so a part that moves in the
   studio stays picked and one deleted drops out) */
const STORE = 'ut-multi';

function all(): Record<string, string[]> {
  try { const v = JSON.parse(localStorage.getItem(STORE) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
/** the song's picked parts (indices), as last left */
export function recall(song: Song): number[] {
  const ids = all()[song.data.id];
  return Array.isArray(ids) ? song.parts.filter(p => !p.audio && ids.includes(p.data.id)).map(p => p.index) : [];
}
export function keep(song: Song, parts: Iterable<number>) {
  const m = all(), ids = [...parts].map(i => song.parts[i]?.data.id).filter(Boolean) as string[];
  if (ids.length) m[song.data.id] = ids; else delete m[song.data.id];
  try { localStorage.setItem(STORE, JSON.stringify(m)); } catch { /* no storage */ }
}
