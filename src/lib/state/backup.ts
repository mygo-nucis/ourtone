import type { SongData } from '../music/types';
import { allSongs, allSounds, allAudio, saveSong, saveSound, saveAudio, wipeDb, type SavedSound, type StoredAudio } from './db';

/* the viewer's data in one file, and the way back to a fresh start.
   everything the site keeps lives in this browser, for this address: a backup carries it to another browser, or from
   the preview to the site's own address. restoring adds to what is there (the same song or sound is replaced). */
export interface Backup {
  ourtone: 'backup';
  v: 1;
  created: string;
  songs: SongData[];
  sounds: SavedSound[];
  audio: (Omit<StoredAudio, 'bytes'> & { b64: string })[];
  settings: Record<string, string>;
}
const PREFIX = 'ut-';

function toB64(buf: ArrayBuffer) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string): ArrayBuffer {
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
/** the first file inside a zip that stores its files uncompressed (the Claude preview's downloads) */
function unzipFirst(b: Uint8Array): Uint8Array | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 30 || v.getUint32(0, true) !== 0x04034b50 || v.getUint16(8, true) !== 0) return null;
  const size = v.getUint32(18, true), start = 30 + v.getUint16(26, true) + v.getUint16(28, true);
  return start + size <= b.length ? b.subarray(start, start + size) : null;
}

export async function makeBackup(): Promise<Uint8Array> {
  const [songs, sounds, audio] = await Promise.all([allSongs(), allSounds(), allAudio()]);
  const settings: Record<string, string> = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(PREFIX)) settings[k] = localStorage.getItem(k) ?? ''; } } catch { /* no storage */ }
  const body: Backup = {
    ourtone: 'backup', v: 1, created: new Date().toISOString(), songs, sounds,
    audio: audio.map(a => ({ id: a.id, type: a.type, name: a.name, created: a.created, b64: toB64(a.bytes) })), settings
  };
  return new TextEncoder().encode(JSON.stringify(body));
}
/** what a backup file holds, or null when it is not one */
export async function readBackup(file: File): Promise<Backup | null> {
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) bytes = unzipFirst(bytes) ?? bytes;
  try {
    const x = JSON.parse(new TextDecoder().decode(bytes));
    return x && x.ourtone === 'backup' && Array.isArray(x.songs) ? x as Backup : null;
  } catch { return null; }
}
export async function restoreBackup(b: Backup) {
  for (const s of b.songs) await saveSong(s);
  for (const x of b.sounds ?? []) await saveSound(x);
  for (const a of b.audio ?? []) await saveAudio({ id: a.id, type: a.type, name: a.name, created: a.created, bytes: fromB64(a.b64) });
  try { for (const [k, v] of Object.entries(b.settings ?? {})) if (k.startsWith(PREFIX)) localStorage.setItem(k, v); } catch { /* no storage */ }
}
/** back to how the site first opens: no songs of the viewer's, no saved sounds or recordings, default settings */
export async function resetAll() {
  await wipeDb();
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k); } catch { /* no storage */ }
}
