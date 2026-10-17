import type { SongData } from '../music/types';

/* the viewer's own songs, sounds and audio, kept in this browser (IndexedDB). every call tolerates blocked storage.
   audio: the bytes of recordings and imported audio files, by id; songs refer to them from their audio tracks.
   songs: imported MIDI files, new songs and copies of built-in songs, each saved in place as it is edited.
   projects: edits kept by earlier versions as overlays on a song; they are turned into songs on start. */
const DB = 'ourtone', STORE = 'songs', PROJECTS = 'projects', SOUNDS = 'sounds', AUDIO = 'audio';
/* upgrades only ever add stores: a new version of the site never removes or renames what an older one saved.
   bump the version to add a store, and read old records leniently (missing fields have defaults). */
const VERSION = 4;
let conn: Promise<IDBDatabase | null> | null = null;
/** the one connection to the database, opened on first use */
function open(): Promise<IDBDatabase | null> {
  conn ??= new Promise(res => {
    // some browsers (private windows, file pages) never answer; do not wait on them
    const late = setTimeout(() => res(null), 1500);
    try {
      const r = indexedDB.open(DB, VERSION);
      r.onupgradeneeded = () => {
        for (const st of [STORE, PROJECTS, SOUNDS, AUDIO]) if (!r.result.objectStoreNames.contains(st)) r.result.createObjectStore(st, { keyPath: 'id' });
      };
      r.onsuccess = () => {
        clearTimeout(late);
        const db = r.result;
        // another tab of a newer version wants to upgrade: step aside
        db.onversionchange = () => { db.close(); conn = null; };
        res(db);
      };
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch { res(null); }
  });
  return conn.then(db => { if (!db) conn = null; return db; });
}
/** close the connection (before deleting the database) */
export async function closeDb() { const c = conn; conn = null; const db = c ? await c : null; db?.close(); }
/** delete everything this site keeps in the browser's database */
export async function wipeDb(): Promise<boolean> {
  await closeDb();
  return new Promise(res => {
    try {
      const r = indexedDB.deleteDatabase(DB);
      r.onsuccess = () => res(true); r.onerror = () => res(false); r.onblocked = () => setTimeout(() => res(false), 1500);
    } catch { res(false); }
  });
}
let askedToKeep = false;
/** the first time the viewer saves anything, ask for the data to be kept */
const keepOnce = () => { if (!askedToKeep) { askedToKeep = true; void keepData(); } };
/** ask the browser to keep this site's data even when space runs low (browsers may decide on their own) */
export async function keepData() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* not offered here */ }
}
export async function listSongs(): Promise<SongData[]> {
  const db = await open();
  if (!db) return [];
  return new Promise(res => {
    try {
      const q = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      q.onsuccess = () => res((q.result as SongData[]).sort((a, b) => a.id.localeCompare(b.id)));
      q.onerror = () => res([]);
    } catch { res([]); }
  });
}
export async function saveSong(s: SongData): Promise<boolean> {
  keepOnce();
  const db = await open();
  if (!db) return false;
  return new Promise(res => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(plain(s));
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
    } catch { res(false); }
  });
}
export async function deleteSong(id: string): Promise<boolean> { return write(STORE, st => { st.delete(id); }); }
function plain<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

async function all<T>(store: string): Promise<T[]> {
  const db = await open();
  if (!db) return [];
  return new Promise(res => {
    try { const q = db.transaction(store, 'readonly').objectStore(store).getAll(); q.onsuccess = () => res(q.result as T[]); q.onerror = () => res([]); } catch { res([]); }
  });
}
async function write(store: string, fn: (s: IDBObjectStore) => void): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  return new Promise(res => {
    try { const tx = db.transaction(store, 'readwrite'); fn(tx.objectStore(store)); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch { res(false); }
  });
}
/** edits kept by earlier versions, keyed by the id of the song they edit */
export const listProjects = () => all<SongData>(PROJECTS);
export const deleteProject = (id: string) => write(PROJECTS, st => { st.delete(id); });

/** sounds the viewer saved from the sound view */
export interface SavedSound { id: string; name: string; preset: string; icon: string; patch: import('../audio/patch').Patch; created: number }
export const listSounds = () => all<SavedSound>(SOUNDS).then(l => l.sort((a, b) => b.created - a.created));
export const saveSound = (x: SavedSound) => { keepOnce(); return write(SOUNDS, st => { st.put(plain(x)); }); };
export const deleteSound = (id: string) => write(SOUNDS, st => { st.delete(id); });

/** a recording or an imported audio file, as its encoded bytes (a WAV for recordings, the file itself for imports) */
export interface StoredAudio { id: string; bytes: ArrayBuffer; type: string; name: string; created: number }
export async function getAudio(id: string): Promise<StoredAudio | null> {
  const db = await open();
  if (!db) return null;
  return new Promise(res => {
    try { const q = db.transaction(AUDIO, 'readonly').objectStore(AUDIO).get(id); q.onsuccess = () => res((q.result as StoredAudio) ?? null); q.onerror = () => res(null); } catch { res(null); }
  });
}
export const saveAudio = (x: StoredAudio) => { keepOnce(); return write(AUDIO, st => { st.put(x); }); };
export const deleteAudio = (id: string) => write(AUDIO, st => { st.delete(id); });
export async function audioIds(): Promise<string[]> {
  const db = await open();
  if (!db) return [];
  return new Promise(res => {
    try { const q = db.transaction(AUDIO, 'readonly').objectStore(AUDIO).getAllKeys(); q.onsuccess = () => res(q.result as string[]); q.onerror = () => res([]); } catch { res([]); }
  });
}

/** every saved sound, song and piece of audio, for a backup */
export const allSongs = () => all<SongData>(STORE);
export const allSounds = () => all<SavedSound>(SOUNDS);
export const allAudio = () => all<StoredAudio>(AUDIO);
