import { BUILTIN, loadBuiltin } from '../music/library';
import { prepareSong, type Song } from '../music/song';
import type { L10n, SongData, SongMeta } from '../music/types';
import { transport } from '../audio/transport.svelte';
import { listSongs, saveSong, deleteSong, listProjects, deleteProject, deleteAudio } from './db';
import { bank } from '../audio/bank';
import { midiToSong } from '../music/midi-import';
import { balance } from '../audio/balance';
import { newPart } from '../music/parts';
import { mod } from '../util';

export type Room = 'stage' | 'studio';
const ROOMS: Room[] = ['stage', 'studio'];
const fromHash = (): Room => { const h = location.hash.replace('#', '') as Room; return ROOMS.includes(h) ? h : 'stage'; };

function metaOf(s: SongData): SongMeta {
  const song = prepareSong(s);
  return { id: s.id, title: s.title, latin: s.latin, artist: s.artist, key: s.key, meter: [s.meters[0][1], s.meters[0][2]], bpm: Math.round(s.tempos[0][1]), duration: song.duration, parts: s.parts.length, user: true, from: s.from };
}
export const newSongId = () => 'mine-' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');

/** an empty song to write in: four bars of 4/4 at 100 BPM, with a melody, chords, bass and drums */
function blankSong(n: number): SongData {
  const ppq = 480;
  const s: SongData = { v: 1, id: newSongId(), title: { zh: `我的歌 ${n}`, en: `My song ${n}` }, latin: `My song ${n}`, artist: { zh: '我', en: 'Me' }, key: { tonic: 0, mode: 'major' }, ppq, tempos: [[0, 100]], meters: [[0, 4, 4]], end: ppq * 4 * 16, parts: [], user: true };
  for (const [pr, role] of [['piano', 'melody'], ['epiano', 'piano'], ['bass', 'bass'], ['kit', 'drums']] as const) s.parts.push(newPart(s, pr, role));
  return s;
}

const ORDER_KEY = 'ut-order';
function readOrder(): string[] {
  try { const v: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
}

/** the name of the viewer's n-th copy of a song */
export function copyTitle(t: L10n, latin: string, n: number): { title: L10n; latin: string } {
  const k = n > 1 ? ` ${n}` : '';
  return { title: { zh: `${t.zh}（我的版本${k}）`, en: `${t.en} (my version${k})` }, latin: `${latin} (my version${k})` };
}

/** how each room listens: mutes and solos are the studio's way of listening (the stage always plays the whole band),
    and the stage plays a song round and round where the studio stops at its end */
function listenIn(r: Room) {
  transport.setMonitor(r === 'studio');
  transport.repeat = r === 'stage';
}

class App {
  room = $state<Room>(fromHash());
  library = $state.raw<SongMeta[]>(BUILTIN);
  /** index of the song on the selector (may run past the ends; wraps) */
  index = $state(0);
  /** the part the viewer plays along with, or null */
  jam = $state<number | null>(null);
  allParts = $state(false);
  loading = $state(false);
  message = $state('');
  /** a MIDI file is being read and its parts' levels measured */
  importing = $state(false);
  /** the file being imported, and how far along: reading it, then measuring its parts one by one */
  importJob = $state<{ name: string; parts: number; done: number } | null>(null);
  /** the viewer's songs: imported, new, and copies of built-in songs */
  private user = new Map<string, SongData>();
  private loadSeq = 0;
  /** the order the viewer dragged the songs into (ids), or empty for the usual order */
  private order = $state.raw<string[]>(readOrder());

  get meta(): SongMeta { return this.library[mod(this.index, this.library.length)]; }
  get song(): Song | null { return transport.song; }

  constructor() {
    addEventListener('hashchange', () => { this.room = fromHash(); listenIn(this.room); });
  }
  go(r: Room) {
    if (r === this.room) return;
    history.replaceState(null, '', r === 'stage' ? location.pathname + location.search : '#' + r);
    this.room = r;
    listenIn(r);
  }
  async init() {
    // the first song's notes are fetched while the viewer's own songs are read (the fetch is shared with open())
    void loadBuiltin(BUILTIN[0].id).catch(() => {});
    const [mine, edits] = await Promise.all([listSongs(), listProjects()]);
    mine.forEach(s => this.user.set(s.id, s));
    await this.migrate(edits);
    this.library = this.ordered();
    // audio no song refers to any more (a deleted song's, an undone take's) goes; only when songs loaded at all
    if (this.user.size) void bank.prune(new Set([...this.user.values()].flatMap(s => s.parts.flatMap(p => (p.clips ?? []).map(c => c.src)))));
    listenIn(this.room);
    await this.open(0);
  }
  /** edits kept by earlier versions become songs: an edited import is saved over itself, an edited built-in song
      becomes the viewer's own copy of it */
  private async migrate(edits: SongData[]) {
    for (const e of edits) {
      if (this.user.has(e.id)) {
        const s: SongData = { ...e, user: true };
        this.user.set(s.id, s);
        await saveSong(s);
      } else if (BUILTIN.some(m => m.id === e.id)) {
        const c: SongData = { ...e, ...copyTitle(e.title, e.latin, this.copiesOf(e.id) + 1), id: newSongId(), user: true, from: e.id };
        this.user.set(c.id, c);
        await saveSong(c);
      } else continue;
      await deleteProject(e.id);
    }
  }
  /** built-in songs in order, each followed by the viewer's copies of it; then imported and new songs. songs the viewer
      has dragged into another order keep it */
  private ordered(): SongMeta[] {
    // ids carry the time they were made, after a prefix: oldest first
    const when = (id: string) => id.replace(/^(mine-|u)/, '');
    const mine = [...this.user.values()].sort((a, b) => when(a.id).localeCompare(when(b.id))), base: SongMeta[] = [];
    for (const b of BUILTIN) { base.push(b); for (const s of mine) if (s.from === b.id) base.push(metaOf(s)); }
    for (const s of mine) if (!s.from || !BUILTIN.some(b => b.id === s.from)) base.push(metaOf(s));
    if (!this.order.length) return base;
    const at = new Map(this.order.map((id, i) => [id, i]));
    const out = base.filter(m => at.has(m.id)).sort((a, b) => at.get(a.id)! - at.get(b.id)!);
    // a song added since: a new or imported one at the end, a copy (or a new built-in song) after the song before it
    base.forEach((m, i) => {
      if (at.has(m.id)) return;
      if (m.user && !m.from) out.push(m);
      else out.splice(i ? out.findIndex(x => x.id === base[i - 1].id) + 1 : 0, 0, m);
    });
    return out;
  }
  /** the viewer drags songs into another order: `ids` (one song, or a song and its copies) go to position `to` among
      the others */
  reorder(ids: string[], to: number) {
    const open = this.meta.id, rest = this.library.filter(m => !ids.includes(m.id)), moved = this.library.filter(m => ids.includes(m.id));
    rest.splice(Math.max(0, Math.min(rest.length, to)), 0, ...moved);
    this.setOrder(rest.map(m => m.id));
    this.keepOpen(open);
  }
  /** back to the usual order */
  defaultOrder() { const open = this.meta.id; this.setOrder([]); this.keepOpen(open); }
  get reordered() { return this.order.length > 0; }
  private setOrder(ids: string[]) {
    this.order = ids;
    try { if (ids.length) localStorage.setItem(ORDER_KEY, JSON.stringify(ids)); else localStorage.removeItem(ORDER_KEY); } catch { /* no storage */ }
    this.library = this.ordered();
  }
  /** the selector stays on the open song (on the same lap of the wheel) */
  private keepOpen(id: string) {
    const n = this.library.length, i = this.library.findIndex(m => m.id === id);
    if (i >= 0) this.index = this.index - mod(this.index, n) + i;
  }
  copiesOf(id: string) { let n = 0; for (const s of this.user.values()) if (s.from === id) n++; return n; }
  isUser(id: string) { return this.user.has(id); }
  /** move the selector by `delta` songs */
  step(delta: number) { void this.open(this.index + delta); }
  async open(index: number) {
    this.index = index;
    const meta = this.meta, seq = ++this.loadSeq, wasPlaying = transport.playing;
    this.jam = null;
    this.allParts = false;
    this.loading = true;
    transport.pause();
    const data = this.user.get(meta.id) || await loadBuiltin(meta.id);
    if (seq !== this.loadSeq) return;
    transport.load(prepareSong(data));
    this.loading = false;
    if (wasPlaying && this.room === 'stage') void transport.play(0);
  }
  /** open a song by id */
  async openId(id: string) { const i = this.library.findIndex(m => m.id === id); if (i >= 0) await this.open(i); }
  /** the studio made a copy of the built-in song that is open (it stays loaded; only the selector moves to the copy) */
  adopt(data: SongData) {
    this.user.set(data.id, data);
    this.library = this.ordered();
    const i = this.library.findIndex(m => m.id === data.id);
    if (i >= 0) this.index = i;
  }
  /** the studio saved one of the viewer's songs */
  async remember(data: SongData) {
    if (!data.user) return false;
    this.user.set(data.id, data);
    const i = this.library.findIndex(m => m.id === data.id);
    if (i >= 0) { const lib = this.library.slice(); lib[i] = metaOf(data); this.library = lib; }
    return saveSong(data);
  }
  /** a song of the viewer's that is not open in the studio gets a new name */
  async rename(id: string, named: Pick<SongData, 'title' | 'latin'>) {
    const s = this.user.get(id);
    return s ? this.remember({ ...s, ...named, edited: Date.now() }) : false;
  }
  /** add a song of the viewer's (a generated one) and open it; `play` starts it at once */
  async addSong(data: SongData, play = false) {
    this.user.set(data.id, data);
    void saveSong(data);
    this.library = this.ordered();
    await this.openId(data.id);
    if (play) void transport.play(0);
  }
  /** a song of the viewer's that has not been edited since it was made */
  untouched(id: string) { const s = this.user.get(id); return !!s && !s.edited; }
  /** delete one of the viewer's songs; built-in songs cannot be deleted */
  async remove(id: string, reopen = true) {
    const s = this.user.get(id);
    if (!s) return;
    const wasOpen = this.meta.id === id, at = this.library.findIndex(m => m.id === id);
    this.user.delete(id);
    // the list changes at once; the browser's storage catches up
    this.library = this.ordered();
    void deleteSong(id);
    // its recordings and audio files go too, unless another song of the viewer's uses them
    const used = new Set([...this.user.values()].flatMap(x => x.parts.flatMap(p => (p.clips ?? []).map(c => c.src))));
    for (const src of new Set(s.parts.flatMap(p => (p.clips ?? []).map(c => c.src)))) if (!used.has(src)) void deleteAudio(src);
    if (!wasOpen || !reopen) { this.index = Math.max(0, this.library.findIndex(m => m.id === transport.song?.data.id)); return; }
    // the song that was open goes: show its original, or the song before it
    const orig = s.from ? this.library.findIndex(m => m.id === s.from) : -1;
    await this.open(orig >= 0 ? orig : Math.max(0, Math.min(this.library.length - 1, at - 1)));
  }
  async newSong() {
    const s = blankSong([...this.user.values()].filter(x => !x.from).length + 1);
    this.user.set(s.id, s);
    void saveSong(s);
    this.library = this.ordered();
    await this.openId(s.id);
  }
  async importFile(file: File) {
    this.importing = true;
    this.importJob = { name: file.name, parts: 0, done: 0 };
    try {
      // let the importing panel show before the file is parsed (parsing holds the page for a moment)
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
      const s = midiToSong(await file.arrayBuffer(), file.name);
      this.importJob = { name: file.name, parts: s.parts.length, done: 0 };
      // each part's level measured, as the built-in songs' are (if that fails, the parts keep the default levels by role)
      try { await balance(s, { windows: 1, window: 12, sampleRate: 22050, onprogress: (d) => { this.importJob = { name: file.name, parts: s.parts.length, done: Math.min(d, s.parts.length) }; } }); } catch (e) { console.warn(e); }
      this.user.set(s.id, s);
      void saveSong(s);
      this.library = this.ordered();
      await this.openId(s.id);
      return true;
    } catch (e) {
      console.warn(e);
      return false;
    } finally {
      this.importing = false;
      this.importJob = null;
    }
  }
}
export const app = new App();
