import type { AudioClip, PartData, SongData } from '../music/types';

/* the studio edits a song as objects: a note keeps its identity through sorting and edits, so selections survive.
   the flat [tick, duration, pitch, velocity] runs of SongData are rebuilt from it for playback and saving. */
export interface Note { t: number; d: number; p: number; v: number }
export type PartMeta = Omit<PartData, 'notes' | 'cuts' | 'clips'>;
/** a part being edited: its settings, its notes (or an audio track's clips), and where it is split into passages */
export interface EditPart { meta: PartMeta; notes: Note[]; cuts: number[]; clips: AudioClip[] }
/** a part's notes, cuts and clips, as undo keeps them */
export interface PartSnap { notes: Note[]; cuts: number[]; clips: AudioClip[] }
export const cloneClips = (cs: AudioClip[]) => cs.map(c => ({ ...c }));
export const isAudioPart = (m: { kind?: string }) => m.kind === 'audio';
export type SongMetaData = Omit<SongData, 'parts'>;
export interface EditDoc { meta: SongMetaData; parts: EditPart[] }

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export const byTime = (a: Note, b: Note) => a.t - b.t || a.p - b.p;

export function notesOf(flat: number[]): Note[] {
  const out: Note[] = [];
  for (let i = 0; i + 3 < flat.length; i += 4) out.push({ t: flat[i], d: flat[i + 1], p: flat[i + 2], v: flat[i + 3] });
  return out.sort(byTime);
}
export function flatOf(notes: Note[]): number[] {
  const out = new Array<number>(notes.length * 4);
  notes.forEach((n, i) => { out[i * 4] = Math.round(n.t); out[i * 4 + 1] = Math.max(1, Math.round(n.d)); out[i * 4 + 2] = n.p; out[i * 4 + 3] = n.v; });
  return out;
}
export function editPart(p: PartData): EditPart {
  const { notes, cuts, clips, ...meta } = p;
  return { meta: clone(meta), notes: notesOf(notes), cuts: [...(cuts ?? [])].sort((a, b) => a - b), clips: cloneClips(clips ?? []).sort((a, b) => a.t - b.t) };
}
export function partData(ep: EditPart): PartData {
  return { ...clone(ep.meta), notes: flatOf(ep.notes), ...(ep.cuts.length ? { cuts: [...ep.cuts] } : {}), ...(ep.clips.length || ep.meta.kind === 'audio' ? { clips: cloneClips(ep.clips) } : {}) };
}
export const snapOf = (ep: EditPart): PartSnap => ({ notes: cloneNotes(ep.notes), cuts: [...ep.cuts], clips: cloneClips(ep.clips) });
export function restore(ep: EditPart, s: PartSnap) { ep.notes = cloneNotes(s.notes); ep.cuts = [...s.cuts]; ep.clips = cloneClips(s.clips ?? []); }

export function docOf(s: SongData): EditDoc {
  const { parts, ...meta } = s;
  return { meta: clone(meta), parts: parts.map(editPart) };
}
export function songOf(d: EditDoc): SongData { return { ...clone(d.meta), parts: d.parts.map(partData) } as SongData; }

export const cloneNotes = (ns: Note[]) => ns.map(n => ({ ...n }));
export const cloneMeta = (m: PartMeta): PartMeta => clone(m);
export function cloneDoc(d: EditDoc): EditDoc { return { meta: clone(d.meta), parts: d.parts.map(p => ({ meta: clone(p.meta), notes: cloneNotes(p.notes), cuts: [...p.cuts], clips: cloneClips(p.clips) })) }; }
