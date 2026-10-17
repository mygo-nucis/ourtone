import { Midi } from '@tonejs/midi';
import { mixOf } from '../audio/strip';
import type { Song } from '../music/song';
import type { Lang } from '../music/types';
import type { Mode } from '../music/types';

/* export: a MIDI file of the edited song, or the mix rendered offline through the same strips as playback (WAV, MP3).
   inside the claude.ai viewer, files go through its downloads capability, which takes a .zip but not .mid/.wav/.mp3,
   so there the file arrives in a small zip; anywhere else it downloads as itself. */
export type ExportKind = 'midi' | 'wav' | 'mp3';

/** General MIDI programs for each preset, so other apps pick similar instruments */
const GM: Record<string, number> = {
  acoustic: 25, nylon: 24, cleangtr: 27, drivegtr: 29, drivebass: 29, bass: 33, pizz: 45, harp: 46, piano: 0, egrand: 2, epiano: 4, vibes: 11,
  glock: 9, musicbox: 10, ocarina: 79, flute: 73, whistle: 78, bottle: 76, reed: 69, oboe: 68, strings: 48, viola: 41, violin: 40,
  percorgan: 17, organ: 19, accordion: 21, accordionbass: 21, square: 80, brass: 61, synthbass: 38, kit: 0
};

/** MIDI text is bytes; write names as UTF-8, which music apps read (and our importer decodes) */
const utf8 = (s: string) => String.fromCharCode(...new TextEncoder().encode(s));
/** sharps (+) or flats (−) in the key signature of a tonic and mode */
const MODE_SHIFT: Record<Mode, number> = { major: 0, minor: 3, dorian: -2, phrygian: -4, lydian: -5, mixolydian: -7, locrian: 1 };
function sharpsOf(tonic: number, mode: Mode) {
  const r = (((tonic + MODE_SHIFT[mode]) % 12) + 12) % 12, x = (r * 7) % 12;
  return x > 6 ? x - 12 : x;
}

export function midiOf(song: Song, lang: Lang): Uint8Array {
  const d = song.data, midi = new Midi(), k = midi.header.ppq / d.ppq;
  midi.header.name = utf8(d.title[lang]);
  midi.header.tempos = d.tempos.map(([t, bpm]) => ({ ticks: Math.round(t * k), bpm }));
  midi.header.timeSignatures = d.meters.map(([t, n, den]) => ({ ticks: Math.round(t * k), timeSignature: [n, den] }));
  // @tonejs/midi writes the key's index + 7 where the reader expects sharps − 7: write C and patch the byte below
  midi.header.keySignatures = [{ ticks: 0, key: 'C', scale: d.key.mode === 'minor' ? 'minor' : 'major' }];
  midi.header.update();
  let ch = 0;
  // audio tracks have no notes: MIDI cannot carry them
  song.parts.filter(p => !p.audio).forEach(p => {
    const tr = midi.addTrack(), drums = p.drums;
    tr.name = utf8(p.data.name[lang]);
    tr.channel = drums ? 9 : ch;
    if (!drums) { ch++; if (ch === 9) ch++; if (ch > 15) ch = 0; }
    tr.instrument.number = GM[p.data.preset] ?? 0;
    const m = mixOf(p);
    tr.addCC({ number: 7, value: Math.max(0, Math.min(1, Math.pow(10, m.vol / 40))), ticks: 0 });
    tr.addCC({ number: 10, value: Math.max(0, Math.min(1, (m.pan + 1) / 2)), ticks: 0 });
    for (let i = 0; i < p.n; i++) tr.addNote({ midi: p.pitch[i], ticks: Math.round(p.tick[i] * k), durationTicks: Math.max(1, Math.round((song.tl.tick(p.start[i] + p.dur[i]) - p.tick[i]) * k)), velocity: p.vel[i] / 127 });
  });
  const bytes = midi.toArray(), sf = sharpsOf(d.key.tonic, d.key.mode) & 0xFF, mi = d.key.mode === 'minor' ? 1 : 0;
  for (let i = 0; i + 4 < bytes.length; i++) if (bytes[i] === 0xFF && bytes[i + 1] === 0x59 && bytes[i + 2] === 0x02 && bytes[i + 3] === 14 && bytes[i + 4] === mi) { bytes[i + 3] = sf; break; }
  return bytes;
}

export function wavOf(b: AudioBuffer): Uint8Array {
  const ch = b.numberOfChannels, len = b.length, sr = b.sampleRate, out = new Uint8Array(44 + len * ch * 2), v = new DataView(out.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, len * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => b.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++, o += 2) { const x = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, x < 0 ? x * 32768 : x * 32767, true); }
  return out;
}

/* ---------- a one-file zip (stored, no compression) ---------- */
let crcT: Uint32Array | null = null;
function crc32(b: Uint8Array) {
  if (!crcT) { crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
export function zipOne(name: string, data: Uint8Array): Uint8Array {
  const nm = new TextEncoder().encode(name), crc = crc32(data), now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const out = new Uint8Array(30 + nm.length + data.length + 46 + nm.length + 22), v = new DataView(out.buffer);
  let o = 0;
  const h = (sig: number) => { v.setUint32(o, sig, true); o += 4; };
  const u16 = (x: number) => { v.setUint16(o, x, true); o += 2; }, u32 = (x: number) => { v.setUint32(o, x, true); o += 4; };
  h(0x04034b50); u16(20); u16(0x0800); u16(0); u16(time); u16(date); u32(crc); u32(data.length); u32(data.length); u16(nm.length); u16(0);
  out.set(nm, o); o += nm.length; out.set(data, o); o += data.length;
  const cd = o;
  h(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(time); u16(date); u32(crc); u32(data.length); u32(data.length); u16(nm.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(0);
  out.set(nm, o); o += nm.length;
  const cdSize = o - cd;
  h(0x06054b50); u16(0); u16(0); u16(1); u16(1); u32(cdSize); u32(cd); u16(0);
  return out;
}

type Downloads = { save(r: { filename: string; data: Blob | ArrayBuffer | Uint8Array | string }): Promise<{ status: string }> };
type ClaudeHost = { use(name: string): Promise<unknown> };
/** hand a file to the viewer: through the claude.ai viewer's downloads capability when framed there, else a plain download */
export async function deliver(filename: string, bytes: Uint8Array, mime: string): Promise<'saved' | 'declined' | 'unavailable' | 'failed'> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host && typeof host.use === 'function') {
    const dl = await host.use('downloads') as Downloads | null;
    if (!dl) return 'unavailable';
    const zipName = filename.replace(/\.[^.]+$/, '') + '.zip';
    try { await dl.save({ filename: zipName, data: new Blob([zipOne(filename, bytes) as Uint8Array<ArrayBuffer>]) }); return 'saved'; }
    catch (e) { const code = (e as { code?: string }).code; return code === 'declined' ? 'declined' : code === 'unavailable' || code === 'not_granted' ? 'unavailable' : 'failed'; }
  }
  try {
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'saved';
  } catch { return 'failed'; }
}

