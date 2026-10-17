import type { SongData, SongMeta } from './types';
import meta from '../../data/library.json';

/* the built-in songs: metadata up front, notes loaded when a song is opened */
const loaders = import.meta.glob<SongData>('../../data/songs/*.json', { import: 'default' });

export const BUILTIN: SongMeta[] = meta as SongMeta[];

export async function loadBuiltin(id: string): Promise<SongData> {
  const f = loaders[`../../data/songs/${id}.json`];
  if (!f) throw new Error('unknown song ' + id);
  return await f();
}
