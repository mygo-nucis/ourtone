import { transport } from '../audio/transport.svelte';
import { prepareSong } from '../music/song';
import type { AudioClip, Mix, Mode, PartData, SongData } from '../music/types';
import { app, copyTitle, newSongId } from '../state/app.svelte';
import type { StringKey } from '../i18n/strings';
import { docOf, songOf, partData, cloneNotes, cloneMeta, cloneDoc, cloneClips, byTime, snapOf, restore, isAudioPart, type EditDoc, type EditPart, type Note, type PartMeta, type PartSnap, type SongMetaData } from './doc';
import { newPart } from '../music/parts';
import { PRESETS, patchOf } from '../audio/presets';
import { patchKey, type Patch } from '../audio/patch';
import { bank } from '../audio/bank';
import { MicTake, micError } from '../audio/mic';
import { engine } from '../audio/engine';
import { Grid, lastTick, takeRange, putAt, clearRange, inRange, transposeRange, insertTime, deleteTime, tidyCuts, passagesOf, splitAt, type SnapMode, type Chunk } from './ops';

/* the studio's working copy of the current song, with undo and autosave.
   every change goes through one of three doors, which also keep playback in step:
   notes()  — notes of some parts change (the transport re-reads those parts, even while playing)
   part()   — a part's settings change (mixer, effects, instrument, name, colour)
   song()   — time or the set of parts changes (tempo, inserted bars, added parts): playback reloads in place */
export type View = 'arrange' | 'track' | 'sound';
export type Tool = 'select' | 'pen' | 'erase';
/** a stretch of time in some parts; with every part in it, a section of the song */
export interface Range { parts: number[]; a: number; b: number }
export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'failed';
export type NoteGrid = '1/4' | '1/8' | '1/16' | '1/8T' | '1/16T';
export const GRID_DIV: Record<NoteGrid, number> = { '1/4': 1, '1/8': 2, '1/16': 4, '1/8T': 3, '1/16T': 6 };

type Label = StringKey;
type Entry =
  | { kind: 'notes'; label: Label; parts: number[]; before: PartSnap[]; after: PartSnap[] }
  | { kind: 'part'; label: Label; part: number; before: PartMeta; after: PartMeta; key?: string }
  | { kind: 'parts'; label: Label; parts: number[]; before: PartMeta[]; after: PartMeta[] }
  | { kind: 'meta'; label: Label; before: SongMetaData; after: SongMetaData; key?: string }
  | { kind: 'song'; label: Label; before: EditDoc; after: EditDoc };

const MAX_UNDO = 200;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
/** undo and redo change the music, never which song this is: the id and name stay as they are now */
function keepName(m: SongMetaData, now: SongMetaData) {
  m.id = now.id; m.title = clone(now.title); m.latin = now.latin; m.user = now.user; m.from = now.from;
  return m;
}

class Studio {
  view = $state<View>('arrange');
  /** bumps on every change to the document; views redraw from it */
  rev = $state(0);
  /** the part in focus (inspector, track and sound views) */
  part = $state(0);
  range = $state.raw<Range | null>(null);
  tool = $state<Tool>('select');
  /** the arrange view's tool: select passages and stretches, or split with the scissors */
  arrTool = $state<'select' | 'split'>('select');
  snap = $state<SnapMode>('bar');
  follow = $state(true);
  /** on a phone, the mixer and the inspector slide over the timeline */
  sheet = $state<'' | 'mixer' | 'inspector'>('');
  /* the track view */
  picked = $state.raw<ReadonlySet<Note>>(new Set());
  noteGrid = $state<NoteGrid>('1/8');
  /** the part drawn faintly under the one being edited: -1 picks one, -2 shows none */
  refPart = $state(-1);
  notation = $state<'letter' | 'jianpu'>('letter');
  /** notes land on the grid; off, they go exactly where you put them */
  snapOn = $state(true);
  saving = $state<SaveState>('clean');
  /** a passing message for the status line: a copy of a built-in song was just made, the microphone could not be
      opened, an audio file could not be read */
  notice = $state<Notice>('');
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  say(n: Notice, ms = 6000) { this.notice = n; clearTimeout(this.noticeTimer); this.noticeTimer = setTimeout(() => { this.notice = ''; }, ms); }
  /** an audio take in progress, drawn growing on its track: where it starts (seconds), its outline and length so far */
  liveTake = $state.raw<{ part: number; start: number; peaks: Float32Array; dur: number } | null>(null);
  private mic: { part: number; take: MicTake; loopWas: boolean; from: number; timer: ReturnType<typeof setTimeout> | undefined } | null = null;
  undoLabel = $state<Label | ''>('');
  redoLabel = $state<Label | ''>('');
  doc: EditDoc | null = null;
  grid: Grid | null = null;
  private gen = -1;
  private undos: Entry[] = [];
  private redos: Entry[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private clip: { len: number; parts: Chunk[] } | null = null;
  /** recording: notes land in the part as they are released; the whole take is one undo step */
  recording = $state(false);
  private rec: { part: number; before: PartSnap; open: Map<number, { note: Note; last: number }>; n: number } | null = null;

  /** pick up the song the transport has loaded (a no-op while it is the same song) */
  attach() {
    const s = transport.song;
    if (!s) { this.doc = null; this.grid = null; return; }
    if (this.gen === transport.gen && this.doc) return;
    this.gen = transport.gen;
    this.doc = docOf(s.data);
    this.undos = []; this.redos = []; this.labels();
    const m = s.data.parts.findIndex(p => p.role === 'melody');
    this.part = m >= 0 ? m : 0;
    this.range = null;
    this.picked = new Set();
    this.refPart = -1;
    this.saving = s.data.user ? 'saved' : 'clean';
    this.notice = '';
    this.regrid();
    this.rev++;
  }
  get loaded() { return transport.song; }
  /** the open song is the viewer's own (imported, new, or a copy); a built-in song is copied on its first edit */
  get mine() { return !!this.doc?.meta.user; }

  /* ---------- the three doors ---------- */
  notes(label: Label, parts: number[], fn: (d: EditDoc) => boolean | void) {
    const d = this.doc;
    if (!d || !parts.length) return;
    const before = parts.map(i => snapOf(d.parts[i]));
    if (fn(d) === false) return;
    if (this.grid) for (const i of parts) tidyCuts(d.parts[i], this.grid);
    this.push({ kind: 'notes', label, parts, before, after: parts.map(i => snapOf(d.parts[i])) });
    this.syncNotes(parts);
    this.changed();
  }
  /** `key` merges a run of changes from one gesture (a fader drag) into one undo step */
  setPart(label: Label, i: number, patch: Partial<PartMeta>, key?: string) {
    const d = this.doc;
    if (!d || !d.parts[i]) return;
    const before = cloneMeta(d.parts[i].meta);
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) clean[k] = v === undefined ? undefined : clone(v);
    const meta = d.parts[i].meta as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(clean)) { if (v === undefined) delete meta[k]; else meta[k] = v; }
    const after = cloneMeta(d.parts[i].meta), top = this.undos[this.undos.length - 1];
    if (key && top && top.kind === 'part' && top.key === key && top.part === i) { top.after = after; this.redos = []; }
    else this.push({ kind: 'part', label, part: i, before, after, key });
    // playback gets its own copies, so nothing the studio later changes in place can reach it unannounced
    const forPlay: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(clean)) forPlay[k] = v === undefined ? undefined : clone(v);
    transport.setPart(i, forPlay as Partial<PartData>);
    this.changed();
  }
  setMix(label: Label, i: number, patch: Partial<Mix>, key?: string) {
    const d = this.doc;
    if (!this.loaded || !d?.parts[i]) return;
    const mix = { ...transport.mixOf(i), ...patch };
    // on a built-in song, muting and soloing are for listening: they neither make a copy nor go on the undo list
    if (!d.meta.user && Object.keys(patch).every(k => k === 'mute' || k === 'solo')) {
      d.parts[i].meta.mix = clone(mix);
      transport.setPart(i, { mix: clone(mix) });
      this.rev++;
      return;
    }
    this.setPart(label, i, { mix }, key);
  }
  /* mute and solo. solo is exclusive: soloing a track un-solos the rest (with Ctrl/⌘ or Shift it joins those soloed
     instead), and pressing it on the only soloed track lets everything play again. a track is never muted and soloed
     at once: soloing it un-mutes it, muting it un-solos it. */
  solo(i: number, add = false) {
    const s = transport.song;
    if (!this.doc || !s?.parts[i]) return;
    const now = s.parts.map((_, k) => transport.mixOf(k)), others = now.some((m, k) => k !== i && m.solo);
    const on = !now[i].solo || (!add && others);
    this.mixes('opSolo', now.map((m, k) => k === i ? { ...m, solo: on, mute: on ? false : m.mute } : add ? m : { ...m, solo: false }));
  }
  mute(i: number) {
    const s = transport.song;
    if (!this.doc || !s?.parts[i]) return;
    this.mixes('opMute', s.parts.map((_, k) => transport.mixOf(k)).map((m, k) => k === i ? { ...m, mute: !m.mute, solo: m.mute && m.solo } : m));
  }
  /** several parts' mixes at once, as one step */
  private mixes(label: Label, next: Mix[]) {
    const d = this.doc!;
    const changed = next.map((m, k) => JSON.stringify(m) !== JSON.stringify(transport.mixOf(k)) ? k : -1).filter(k => k >= 0);
    if (!changed.length) return;
    // on a built-in song, muting and soloing are for listening: they neither make a copy nor go on the undo list
    if (!d.meta.user) {
      for (const k of changed) { d.parts[k].meta.mix = clone(next[k]); transport.setPart(k, { mix: clone(next[k]) }); }
      this.rev++;
      return;
    }
    const before = changed.map(k => cloneMeta(d.parts[k].meta));
    for (const k of changed) d.parts[k].meta.mix = clone(next[k]);
    this.push({ kind: 'parts', label, parts: changed, before, after: changed.map(k => cloneMeta(d.parts[k].meta)) });
    for (const k of changed) transport.setPart(k, { mix: clone(next[k]) });
    this.changed();
  }
  setMeta(label: Label, patch: Partial<SongMetaData>, key?: string) {
    const d = this.doc;
    if (!d) return;
    const before = clone(d.meta);
    Object.assign(d.meta, clone(patch));
    const after = clone(d.meta), top = this.undos[this.undos.length - 1];
    if (key && top && top.kind === 'meta' && top.key === key) { top.after = after; this.redos = []; }
    else this.push({ kind: 'meta', label, before, after, key });
    this.syncMeta(before, after);
    this.changed();
  }
  song(label: Label, fn: (d: EditDoc) => boolean | void) {
    const d = this.doc;
    if (!d) return;
    const before = cloneDoc(d);
    if (fn(d) === false) return;
    this.push({ kind: 'song', label, before, after: cloneDoc(d) });
    this.reloadAll();
    this.changed();
  }

  /* ---------- notes (track view) ---------- */
  gridTicks() { return Math.round((this.doc?.meta.ppq ?? 480) / GRID_DIV[this.noteGrid]); }
  /* the one cursor: the playhead is also where typing, pasting and new notes go */
  cursorTick() { const s = transport.song; return s ? Math.max(0, Math.round(s.tl.tick(transport.now()))) : 0; }
  seekTick(t: number) { const s = transport.song; if (s) transport.seek(s.tl.sec(Math.max(0, t)), this.grid ? s.tl.sec(this.grid.end) : 0); }
  pick(ns: Iterable<Note>) { this.picked = new Set(ns); }
  /** start a gesture that edits notes live (a drag): returns what undo needs */
  begin(part: number) { const d = this.doc!; return { part, before: snapOf(d.parts[part]) }; }
  /** show a gesture's changes without recording them yet */
  live(part: number) {
    const d = this.doc!, ep = d.parts[part];
    ep.notes.sort(byTime);
    transport.updatePart(part, partData(ep));
    this.rev++;
  }
  /** finish a gesture: one undo step if anything changed */
  commit(g: { part: number; before: PartSnap }, label: Label) {
    const d = this.doc!, ep = d.parts[g.part];
    ep.notes.sort(byTime);
    if (this.grid) tidyCuts(ep, this.grid);
    const after = snapOf(ep);
    if (JSON.stringify(after) === JSON.stringify(g.before)) return;
    this.push({ kind: 'notes', label, parts: [g.part], before: [g.before], after: [after] });
    transport.updatePart(g.part, partData(ep));
    if (lastTick(d, this.grid?.tl) > (this.grid?.end ?? 0) - 16 * d.meta.ppq * 4) this.regrid();
    this.changed();
  }
  addNotes(part: number, add: Note[], label: Label = 'opAddNote') {
    const d = this.doc;
    if (!d || !add.length) return [];
    const made = add.map(n => ({ t: Math.max(0, Math.round(n.t)), d: Math.max(1, Math.round(n.d)), p: Math.max(0, Math.min(127, n.p)), v: Math.max(1, Math.min(127, n.v)) }));
    this.notes(label, [part], dd => { dd.parts[part].notes = dd.parts[part].notes.concat(made).sort(byTime); });
    return made;
  }
  deleteNotes(part: number, gone: ReadonlySet<Note>, label: Label = 'opDeleteNotes') {
    if (!gone.size) return;
    this.notes(label, [part], dd => { dd.parts[part].notes = dd.parts[part].notes.filter(n => !gone.has(n)); });
    this.picked = new Set([...this.picked].filter(n => !gone.has(n)));
  }
  /** change the picked notes in place (transpose, velocity, a transform) as one undo step */
  editPicked(label: Label, fn: (ns: Note[], all: Note[]) => Note[] | void) {
    const d = this.doc, ns = [...this.picked];
    if (!d || !ns.length) return;
    const part = this.part;
    this.notes(label, [part], dd => {
      const res = fn(ns, dd.parts[part].notes);
      if (res) dd.parts[part].notes = res;
      dd.parts[part].notes.sort(byTime);
    });
  }

  /* ---------- recording ----------
     a note shows the moment its key goes down and grows while the key is held; letting go ends it. with snap on, the start
     lands on the nearest grid line and the end on the next one; with snap off, both are exactly where they were played.
     the take is one undo step; playback hears a note once it is finished, so it is never played twice. */
  /** record into the focused part: an instrument track takes notes from the computer keyboard, an audio track takes
      the microphone (one source at a time) */
  startRecording() {
    const d = this.doc;
    if (!d || !d.parts[this.part]) return;
    if (isAudioPart(d.parts[this.part].meta)) { void this.startMic(); return; }
    this.rec = { part: this.part, before: snapOf(d.parts[this.part]), open: new Map(), n: 0 };
    this.recording = true;
    transport.rolling = true;
    if (!transport.playing) void transport.play();
  }
  stopRecording() {
    if (this.mic) { void this.finishMic(); return; }
    const r = this.rec, d = this.doc;
    this.recording = false;
    transport.rolling = false;
    if (!r || !d) { this.rec = null; return; }
    [...r.open.keys()].forEach(p => this.recOff(p));
    cancelAnimationFrame(this.recRaf);
    this.rec = null;
    if (!r.n) return;
    this.push({ kind: 'notes', label: 'opRecord', parts: [r.part], before: [r.before], after: [snapOf(d.parts[r.part])] });
    this.changed();
  }
  nowTick() { const s = transport.song; return s ? s.tl.tick(transport.now()) : 0; }
  private recRaf = 0;
  /** where a take's note starts and ends, on the grid or not */
  private recSnap(t: number, how: 'round' | 'ceil') {
    if (!this.snapOn) return Math.max(0, Math.round(t));
    const g = this.gridTicks();
    return Math.max(0, Math[how](t / g - (how === 'ceil' ? 1e-6 : 0)) * g);
  }
  /** the loop's end in ticks while it loops (a held note stops there when playback jumps back) */
  private loopEnd() { const s = transport.song, l = transport.loop; return s && l && transport.loopOn ? s.tl.tick(l.b) : Infinity; }
  recOn(p: number, v: number) {
    const r = this.rec, d = this.doc;
    if (!r || !d || !transport.playing || r.open.has(p)) return;
    const now = this.nowTick(), note: Note = { t: this.recSnap(now, 'round'), d: 1, p, v };
    note.d = Math.max(1, Math.round(now - note.t));
    const ep = d.parts[r.part];
    ep.notes = ep.notes.concat([note]).sort(byTime);
    r.open.set(p, { note, last: now });
    r.n++;
    this.rev++;
    if (r.open.size === 1) this.recGrow();
  }
  /** held notes follow the playhead */
  private recGrow() {
    const step = () => {
      const r = this.rec;
      if (!r || !r.open.size) return;
      const now = this.nowTick(), end = this.loopEnd();
      for (const [p, o] of r.open) {
        // playback jumped back to the loop's start: the note ends where the loop did
        if (now < o.last - 1) { o.note.d = Math.max(1, Math.round(Math.min(end, o.last) - o.note.t)); this.recOff(p, true); continue; }
        o.last = now;
        o.note.d = Math.max(1, Math.round(now - o.note.t));
      }
      this.rev++;
      this.recRaf = requestAnimationFrame(step);
    };
    cancelAnimationFrame(this.recRaf);
    this.recRaf = requestAnimationFrame(step);
  }
  recOff(p: number, wrapped = false) {
    const r = this.rec, d = this.doc;
    if (!r || !d) return;
    const o = r.open.get(p);
    if (!o) return;
    r.open.delete(p);
    const n = o.note;
    if (!wrapped) {
      const now = Math.max(n.t + 1, Math.min(this.nowTick(), this.loopEnd()));
      const end = this.recSnap(now, 'ceil');
      n.d = Math.max(this.snapOn ? this.gridTicks() : 20, end - n.t);
    } else if (this.snapOn) n.d = Math.max(this.gridTicks(), this.recSnap(n.t + n.d, 'ceil') - n.t);
    d.parts[r.part].notes.sort(byTime);
    transport.updatePart(r.part, partData(d.parts[r.part]));
    this.rev++;
  }

  /* ---------- recording audio ----------
     the take is placed where the music was when each sample arrived, less the input's and output's latency, so what was
     sung against the music lines up with it. the loop is off while recording audio (a take runs straight through). */
  private async startMic() {
    const part = this.part;
    let take: MicTake;
    try { take = await MicTake.open(engine.get()); }
    catch (e) { this.say(micError(e) === 'missing' ? 'micMissing' : 'micDenied', 9000); return; }
    if (this.part !== part || !this.doc?.parts[part]) { take.cancel(); return; }
    const loopWas = transport.loopOn;
    if (loopWas) transport.setLoop(transport.loop, false);
    const from = transport.song ? transport.song.tl.sec(this.cursorTick()) : 0;
    this.mic = { part, take, loopWas, from, timer: undefined };
    this.recording = true;
    transport.rolling = true;
    if (!transport.playing) await transport.play();
    const grow = () => {
      const m = this.mic;
      if (!m) return;
      const t0 = m.take.startTime;
      this.liveTake = t0 === null ? null : { part, start: Math.max(m.from, transport.songTimeAt(t0) - m.take.latency()), peaks: m.take.peaks, dur: m.take.seconds };
      this.rev++;
      m.timer = setTimeout(grow, 120);
    };
    grow();
  }
  private async finishMic() {
    // playback rolls on until the take is placed, so the song is already long enough when it may end
    try { await this.placeTake(); } finally { if (!this.mic) transport.rolling = false; }
  }
  private async placeTake() {
    const m = this.mic;
    if (!m) return;
    this.mic = null;
    this.recording = false;
    clearTimeout(m.timer);
    if (m.loopWas) transport.setLoop(transport.loop, true);
    // where the first sample falls in the song, worked out now, before playback stops or moves
    const t0 = m.take.startTime, lat = m.take.latency();
    const at = t0 === null ? null : transport.songTimeAt(t0) - lat;
    const res = await m.take.stop();
    this.liveTake = null;
    this.rev++;
    const d = this.doc, s = transport.song;
    if (!res || at === null || !d?.parts[m.part] || !s) return;
    // nothing from before the cursor (the moment record was pressed)
    let start = at, off = 0;
    if (start < m.from) { off = m.from - start; start = m.from; }
    const dur = res.data.length / res.sr - off;
    if (dur < .25) return;
    const now = new Date(), name = `${i18nTake()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const { id } = await bank.addTake(res.data, res.sr, name);
    const clip: AudioClip = { src: id, t: Math.max(0, Math.round(s.tl.tick(start))), off, dur, name };
    this.notes('opRecordAudio', [m.part], dd => { dd.parts[m.part].clips = dd.parts[m.part].clips.concat([clip]).sort((a, b) => a.t - b.t); });
  }

  /* ---------- audio tracks ---------- */
  /** a new audio track: empty (to record into), or holding an audio file at the cursor's bar (or at `at`) */
  async addAudioPart(file?: File, at?: number) {
    if (!this.doc) return;
    const clip = file ? await this.clipFromFile(file, at) : null;
    if (file && !clip) return;
    this.song('opAddAudio', dd => {
      const p = newPart({ parts: dd.parts.map(x => ({ ...x.meta, notes: [] })) }, 'audio', 'other'), { notes: _n, ...meta } = p;
      const n = dd.parts.filter(x => x.meta.kind === 'audio').length + 1;
      Object.assign(meta, { kind: 'audio', name: n > 1 ? { zh: `录音 ${n}`, en: `Audio ${n}` } : { zh: '录音', en: 'Audio' }, inst: { zh: '音频', en: 'Audio' }, icon: 'audio', tag: { day: 'AUDIO', night: 'Vox' } });
      dd.parts.push({ meta, notes: [], cuts: [], clips: clip ? [clip] : [] });
    });
    this.part = this.doc.parts.length - 1;
  }
  /** an audio file onto an audio track, at the cursor's bar (or at `at`) */
  async importAudio(i: number, file: File, at?: number) {
    if (!this.doc?.parts[i] || !isAudioPart(this.doc.parts[i].meta)) return;
    const clip = await this.clipFromFile(file, at);
    if (!clip) return;
    this.notes('opImportAudio', [i], dd => { dd.parts[i].clips = dd.parts[i].clips.concat([clip]).sort((a, b) => a.t - b.t); });
    this.part = i;
  }
  private async clipFromFile(file: File, at?: number): Promise<AudioClip | null> {
    const r = await bank.addFile(file);
    if (!r) { this.say('audioBad'); return null; }
    const g = this.grid, t = at ?? (g ? g.snap(this.cursorTick(), 'bar', 'floor') : 0);
    return { src: r.id, t: Math.max(0, Math.round(t)), off: 0, dur: r.buffer.duration, name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) };
  }

  /* ---------- undo ---------- */
  undo() { if (this.recording) this.stopRecording(); const e = this.undos.pop(); if (!e) return; this.apply(e, 'before'); this.redos.push(e); this.labels(); }
  redo() { if (this.recording) this.stopRecording(); const e = this.redos.pop(); if (!e) return; this.apply(e, 'after'); this.undos.push(e); this.labels(); }
  private push(e: Entry) {
    this.undos.push(e);
    if (this.undos.length > MAX_UNDO) this.undos.shift();
    this.redos = [];
    this.labels();
  }
  private labels() {
    this.undoLabel = this.undos[this.undos.length - 1]?.label ?? '';
    this.redoLabel = this.redos[this.redos.length - 1]?.label ?? '';
  }
  private apply(e: Entry, side: 'before' | 'after') {
    const d = this.doc!;
    if (e.kind === 'notes') { e.parts.forEach((i, k) => restore(d.parts[i], e[side][k])); this.syncNotes(e.parts); this.picked = new Set(); }
    else if (e.kind === 'part') {
      d.parts[e.part].meta = cloneMeta(e[side]);
      const m = cloneMeta(e[side]) as Partial<PartData>;
      transport.setPart(e.part, { ...m, patch: m.patch, fx: m.fx, macro: m.macro, mix: m.mix });
    }
    else if (e.kind === 'parts') e.parts.forEach((k, j) => { d.parts[k].meta = cloneMeta(e[side][j]); transport.setPart(k, { mix: cloneMeta(e[side][j]).mix }); });
    else if (e.kind === 'meta') { const was = clone(d.meta); d.meta = keepName(clone(e[side]), was); this.syncMeta(was, d.meta); }
    else { const was = d.meta; this.doc = cloneDoc(e[side]); keepName(this.doc.meta, was); this.reloadAll(); this.part = Math.min(this.part, this.doc.parts.length - 1); }
    this.changed();
  }

  /* ---------- keeping playback and storage in step ---------- */
  private syncNotes(parts: number[]) {
    const d = this.doc!;
    for (const i of parts) transport.updatePart(i, partData(d.parts[i]));
    if (lastTick(d, this.grid?.tl) > (this.grid?.end ?? 0) - 16 * d.meta.ppq * 4) this.regrid();
  }
  private syncMeta(was: SongMetaData, now: SongMetaData) {
    if (JSON.stringify(was.tempos) !== JSON.stringify(now.tempos) || JSON.stringify(was.meters) !== JSON.stringify(now.meters)) { this.reloadAll(); return; }
    transport.setSongMeta(clone(now) as Partial<SongData>);
  }
  private reloadAll() {
    transport.reload(prepareSong(songOf(this.doc!)));
    this.regrid();
  }
  private regrid() {
    const s = transport.song, d = this.doc;
    if (!s || !d) return;
    this.grid = new Grid(s.tl, Math.max(d.meta.end, lastTick(d, s.tl)));
  }
  private changed() {
    const d = this.doc!;
    if (!d.meta.user) this.fork();
    d.meta.edited = Date.now();
    this.saving = 'dirty';
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), 700);
    this.rev++;
  }
  async flush() {
    clearTimeout(this.saveTimer);
    const d = this.doc;
    if (!d || this.saving !== 'dirty') return;
    this.saving = 'saving';
    const ok = await app.remember(songOf(d));
    if (this.doc === d && this.saving === 'saving') this.saving = ok ? 'saved' : 'failed';
  }
  /** one of the viewer's songs gets a new name, the same in both languages. not an undo step: undo never renames */
  renameSong(id: string, name: string) {
    const t = name.replace(/\s+/g, ' ').trim().slice(0, 80), d = this.doc;
    if (!t) return;
    const named = { title: { zh: t, en: t }, latin: t };
    if (d && d.meta.id === id && d.meta.user) {
      Object.assign(d.meta, named);
      transport.setSongMeta(named);
      this.changed();
      void this.flush();
    } else void app.rename(id, named);
  }
  /** the first edit to a built-in song makes the viewer's own copy of it, beside it in the list; the original never changes */
  private fork() {
    const d = this.doc!, from = d.meta.id;
    Object.assign(d.meta, copyTitle(d.meta.title, d.meta.latin, app.copiesOf(from) + 1), { id: newSongId(), user: true, from });
    transport.setSongMeta({ id: d.meta.id, title: d.meta.title, latin: d.meta.latin, user: true, from });
    app.adopt(songOf(d));
    this.notice = 'forked';
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { this.notice = ''; }, 6000);
  }

  /* ---------- range editing (arrange) ---------- */
  select(r: Range | null) {
    this.range = r && r.b > r.a && r.parts.length ? { parts: [...r.parts].sort((x, y) => x - y), a: r.a, b: r.b } : null;
    if (this.range) this.trackSel = false;
  }
  /** a whole track selected (its header clicked): Delete removes it, Ctrl/⌘+D duplicates it; any stretch selection goes */
  trackSel = $state(false);
  selectTrack(i: number) { this.part = i; this.range = null; this.trackSel = true; }
  /** a range with every part in it: a section of the song */
  get section() { const r = this.range, d = this.doc; return !!r && !!d && r.parts.length === d.parts.length; }
  copy() {
    const r = this.range, d = this.doc;
    if (!r || !d) return false;
    this.clip = { len: r.b - r.a, parts: r.parts.map(i => takeRange(d.parts[i], r.a, r.b)) };
    return true;
  }
  paste(at: number, parts?: number[]) {
    const c = this.clip, d = this.doc;
    if (!c || !d) return;
    const first = parts?.[0] ?? this.range?.parts[0] ?? this.part;
    const targets = c.parts.map((_, k) => first + k).filter(i => i < d.parts.length);
    this.notes('opPaste', targets, dd => { targets.forEach((i, k) => land(dd.parts[i], c.parts[k], at, c.len)); });
    this.select({ parts: targets, a: at, b: at + c.len });
  }
  /** a copy right after the range; a whole section is inserted, pushing the rest of the song later */
  duplicate() {
    const r = this.range, d = this.doc;
    if (!r || !d) return;
    const len = r.b - r.a;
    if (this.section) {
      this.song('opDupSection', dd => { const rel = dd.parts.map(p => takeRange(p, r.a, r.b)); insertTime(dd, r.b, len); dd.parts.forEach((p, i) => putAt(p, rel[i], r.b)); });
      this.select({ parts: r.parts, a: r.b, b: r.b + len });
      return;
    }
    // the copy keeps its place in the bar: it goes a whole number of snap steps later
    const at = r.a + this.unitLen(len, r.a);
    this.notes('opDupClip', r.parts, dd => { r.parts.forEach(i => { const ep = dd.parts[i]; land(ep, takeRange(ep, r.a, r.b), at, len); }); });
    this.select({ parts: r.parts, a: at, b: at + len });
  }
  /** a length rounded up to whole snap steps (beats, bars or four bars) measured where it starts; free leaves it */
  unitLen(len: number, at: number) {
    const g = this.grid;
    if (!g || this.snap === 'free') return len;
    const unit = this.snap === 'beat' ? g.beat(at) : (g.tickOf(g.barAt(at) + 1) - g.tickOf(g.barAt(at))) * (this.snap === 'phrase' ? 4 : 1);
    return Math.max(1, Math.ceil(len / unit - 1e-6)) * unit;
  }
  /** split parts at a tick (the selected parts, or the focused one); notes sounding across it end there.
      a selected passage that was split leaves its later piece selected */
  split(at: number, parts?: number[]) {
    const d = this.doc, g = this.grid, r = this.range;
    if (!d || !g) return;
    const ps = parts ?? (r ? r.parts : [this.part]);
    if (!ps.length) return;
    this.notes('opSplit', ps, dd => { ps.forEach(i => splitAt(dd.parts[i], Math.round(at), g.tl)); });
    if (r && ps.length === 1 && r.parts.length === 1 && at > r.a && at < r.b) {
      const next = passagesOf(this.doc!.parts[ps[0]], g).find(x => x.a >= at && x.a < r.b);
      if (next) this.select({ parts: ps, a: next.a, b: next.b });
    }
  }
  /** join the passages in the selection into one (its cuts go) */
  join() {
    const r = this.range, d = this.doc;
    if (!r || !d) return;
    const has = r.parts.some(i => d.parts[i].cuts.some(c => c > r.a && c < r.b));
    if (!has) return;
    this.notes('opJoin', r.parts, dd => { r.parts.forEach(i => { dd.parts[i].cuts = dd.parts[i].cuts.filter(c => c <= r.a || c >= r.b); }); });
  }
  clear() {
    const r = this.range;
    if (!r) return;
    this.notes('opClear', r.parts, dd => { let n = 0; r.parts.forEach(i => { const ep = dd.parts[i], before = ep.notes.length + ep.clips.length; clearRange(ep, r.a, r.b); n += before - ep.notes.length - ep.clips.length; }); return n > 0; });
  }
  /** cut a section out of the song and close the gap */
  cutSection() {
    const r = this.range;
    if (!r || !this.section) return;
    this.song('opCutBars', dd => deleteTime(dd, r.a, r.b));
    this.range = null;
  }
  /** open empty bars the length of the range, before it */
  insertSection() {
    const r = this.range;
    if (!r) return;
    this.song('opInsertBars', dd => insertTime(dd, r.a, r.b - r.a));
  }
  /** a part notes can be dragged into from another: not drums, not an audio track */
  takesNotes(i: number) { const m = this.doc?.parts[i]?.meta; return !!m && !isDrums(m) && m.kind !== 'audio'; }
  /** move (or copy) the selection `delta` ticks later and `shift` parts down; it lands beside what is there */
  move(delta: number, copy = false, shift = 0) {
    const r = this.range, d = this.doc;
    if (!r || !d || (!delta && !shift) || r.a + delta < 0) return;
    const to = r.parts.map(i => i + shift);
    if (shift && !r.parts.concat(to).every(i => this.takesNotes(i))) return;
    this.notes(copy ? 'opCopyClip' : 'opMoveClip', [...new Set(r.parts.concat(to))], dd => {
      // everything is taken up before anything lands, so parts moving into each other's places carry only their own
      const rel = r.parts.map(i => takeRange(dd.parts[i], r.a, r.b)), inner = r.parts.map(i => dd.parts[i].cuts.filter(c => c > r.a && c < r.b));
      if (!copy) r.parts.forEach(i => { const ep = dd.parts[i]; clearRange(ep, r.a, r.b); ep.cuts = ep.cuts.filter(c => !(c > r.a && c < r.b)); });
      // the cuts inside travel with the notes
      r.parts.forEach((_, k) => land(dd.parts[to[k]], rel[k], r.a + delta, r.b - r.a, inner[k].map(c => c + delta)));
    });
    this.select({ parts: to, a: r.a + delta, b: r.b + delta });
  }
  /* ---------- song settings ---------- */
  /** a new tempo; songs that change tempo keep their shape, scaled */
  setTempo(bpm: number, key?: string) {
    const d = this.doc;
    if (!d || !(bpm > 0)) return;
    const r = Math.max(20, Math.min(320, bpm)) / d.meta.tempos[0][1];
    if (Math.abs(r - 1) < 1e-4) return;
    this.setMeta('opTempo', { tempos: d.meta.tempos.map(([t, b]) => [t, +(b * r).toFixed(3)] as [number, number]) }, key);
  }
  /** the metre the song opens in (later changes of metre stay where they are); notes keep their times, bar lines move */
  setMeter(num: number, den: number) {
    const d = this.doc;
    if (!d || !(num > 0) || ![2, 4, 8, 16].includes(den)) return;
    const [t0, n0, d0] = d.meta.meters[0];
    if (n0 === num && d0 === den) return;
    this.setMeta('opMeter', { meters: [[t0, num, den], ...d.meta.meters.slice(1)] });
    this.range = null;
  }
  /** relabel the key, or move every pitched note into it by the nearest interval */
  setKey(tonic: number, mode: Mode, move: boolean) {
    const d = this.doc;
    if (!d || (d.meta.key.tonic === tonic && d.meta.key.mode === mode)) return;
    if (!move) { this.setMeta('opKey', { key: { tonic, mode } }); return; }
    let delta = ((tonic - d.meta.key.tonic) % 12 + 12) % 12;
    if (delta > 6) delta -= 12;
    this.song('opKey', dd => {
      dd.meta.key = { tonic, mode };
      dd.parts.forEach(p => { if (!isDrums(p.meta)) for (const n of p.notes) n.p = Math.max(0, Math.min(127, n.p + delta)); });
    });
  }

  /* ---------- parts ---------- */
  /** a new part with a preset, or with a sound the viewer saved (its preset, its edited patch and its name) */
  addPart(presetId: string, sound?: { name: string; patch: Patch }) {
    const d = this.doc;
    if (!d) return;
    this.song('opAddPart', dd => {
      const p = newPart({ parts: dd.parts.map(x => ({ ...x.meta, notes: [] })) }, presetId), { notes: _n, ...meta } = p;
      if (sound) { meta.patch = clone(sound.patch); meta.inst = { zh: sound.name, en: sound.name }; }
      dd.parts.push({ meta, notes: [], cuts: [], clips: [] });
    });
    this.part = this.doc!.parts.length - 1;
  }
  /** move a part to another place in the list; the focus, the selection and the reference follow the parts */
  movePart(from: number, to: number) {
    const d = this.doc;
    if (!d || from === to || !d.parts[from] || to < 0 || to >= d.parts.length) return;
    const order = d.parts.map((_, k) => k);
    order.splice(to, 0, order.splice(from, 1)[0]);
    const where = (k: number) => order.indexOf(k);
    this.song('opMovePart', dd => { dd.parts = order.map(k => dd.parts[k]); });
    this.part = where(this.part);
    if (this.refPart >= 0) this.refPart = where(this.refPart);
    if (this.range) this.select({ ...this.range, parts: this.range.parts.map(where) });
  }
  /** a copy of a part, right below it */
  duplicatePart(i: number) {
    const d = this.doc;
    if (!d?.parts[i]) return;
    this.song('opDupPart', dd => {
      const src = dd.parts[i], meta = clone(src.meta);
      meta.id = 'p' + Date.now().toString(36);
      meta.name = { zh: `${src.meta.name.zh} 2`, en: `${src.meta.name.en} 2` };
      dd.parts.splice(i + 1, 0, { meta, notes: cloneNotes(src.notes), cuts: [...src.cuts], clips: cloneClips(src.clips) });
    });
    this.part = i + 1;
  }
  deletePart(i: number) {
    const d = this.doc;
    if (!d || d.parts.length <= 1) return;
    this.trackSel = false;
    this.song('opDeletePart', dd => { dd.parts.splice(i, 1); });
    this.part = Math.max(0, Math.min(this.part > i ? this.part - 1 : this.part, this.doc!.parts.length - 1));
    if (this.range) { const parts = this.range.parts.filter(k => k !== i).map(k => k > i ? k - 1 : k); this.select(parts.length ? { ...this.range, parts } : null); }
  }
  /* ---------- the sound view ---------- */
  /** edit a part's sound: fn changes a copy of its current patch; the copy gets a name that follows its settings */
  setPatch(label: Label, i: number, fn: (p: Patch) => void, key?: string) {
    const d = this.doc;
    if (!d || !d.parts[i]) return;
    // always work on a copy: the part's patch must only change through setPart, or nothing hears about it
    const meta = d.parts[i].meta, p: Patch = clone(patchOf(meta));
    fn(p);
    p.id = patchKey(meta.preset, p);
    if (p.id === meta.patch?.id) return;
    this.setPart(label, i, { patch: p }, key);
  }
  /** back to the preset as it is */
  resetSound(i: number) {
    const d = this.doc;
    if (!d?.parts[i]?.meta.patch) return;
    this.setPart('opResetSound', i, { patch: undefined });
  }
  setPreset(i: number, id: string) {
    const d = this.doc, pr = PRESETS[id];
    if (!d || !pr) return;
    const role = d.parts[i].meta.role;
    this.setPart('opPreset', i, { preset: id, inst: { ...pr.name }, icon: role === 'melody' && pr.icon === 'piano' ? 'mic' : pr.icon, patch: undefined });
  }
  rename(i: number, name: string) {
    const v = name.trim();
    if (!v || !this.doc) return;
    this.setPart('opRename', i, { name: { zh: v, en: v } });
  }

  transpose(k: number) {
    const r = this.range, d = this.doc;
    if (!r || !d) return;
    const parts = r.parts.filter(i => !isDrums(d.parts[i].meta));
    this.notes(k > 0 ? 'opUp' : 'opDown', parts, dd => { let ch = false; parts.forEach(i => { ch = transposeRange(dd.parts[i], r.a, r.b, k) || ch; }); return ch; });
  }
}

export type Notice = '' | 'forked' | 'micDenied' | 'micMissing' | 'audioBad';
export const isAudio = (m: PartMeta) => m.kind === 'audio';
/** the name of a microphone take, in the language of the page */
const i18nTake = () => (typeof document !== 'undefined' && document.documentElement.lang.startsWith('en') ? 'Take' : '录音');
/** a stretch written into a part (pasted, moved, duplicated), beside what is there. landing where the part is silent, it
    stays a passage of its own (with its own cuts); landing on notes, it joins them */
function land(ep: EditPart, rel: Chunk, at: number, len: number, inner: number[] = []) {
  const empty = !ep.notes.some(n => inRange(n, at, at + len)) && !ep.clips.some(c => c.t >= at && c.t < at + len);
  putAt(ep, rel, at);
  if (empty) ep.cuts = ep.cuts.filter(c => c <= at || c >= at + len).concat(inner, [at, at + len]);
}
export const isDrums = (m: PartMeta) => m.role === 'drums' || m.preset === 'kit' || m.preset === 'ekit';
export const studio = new Studio();
