import { Midi } from '@tonejs/midi';
import type { PartData, Role, SongData, Mode } from './types';
import { PRESETS } from '../audio/presets';
import { ROLE_NAME, TAGS } from './parts';

/* a MIDI file becomes a song: one part per track that has notes, sounds chosen from the General MIDI program,
   roles guessed from programs and registers, key found by pitch-class profile */
const PPQ = 480;

function presetFor(program: number, drums: boolean): string {
  if (drums) return 'kit';
  const p = program;
  if (p <= 1) return 'piano';
  if (p === 2 || p === 3) return 'egrand';
  if (p <= 5) return 'epiano';
  if (p === 6) return 'harp';
  if (p === 7) return 'cleangtr';
  if (p === 8 || p === 10) return 'musicbox';
  if (p === 9 || p === 13 || p === 14) return 'glock';
  if (p === 11 || p === 12) return 'vibes';
  if (p === 15) return 'harp';
  if (p <= 18) return 'percorgan';
  if (p === 19) return 'organ';
  if (p <= 23) return 'accordion';
  if (p === 24) return 'nylon';
  if (p === 25) return 'acoustic';
  if (p <= 28 || p === 31) return 'cleangtr';
  if (p <= 30) return 'drivegtr';
  if (p <= 37) return 'bass';
  if (p <= 39) return 'synthbass';
  if (p === 40 || p === 110) return 'violin';
  if (p === 41 || p === 42) return 'viola';
  if (p === 45) return 'pizz';
  if (p === 46) return 'harp';
  if (p <= 54) return 'strings';
  if (p === 55) return 'brass';
  if (p <= 63) return 'brass';
  if (p === 68 || p === 111) return 'oboe';
  if (p <= 71) return 'reed';
  if (p <= 75 || p === 77) return 'flute';
  if (p === 76) return 'bottle';
  if (p === 78) return 'whistle';
  if (p === 79) return 'ocarina';
  if (p === 81 || p === 87) return 'brass';
  if (p <= 87) return 'square';
  if (p <= 103) return 'strings';
  if (p <= 105) return 'acoustic';
  if (p === 106) return 'pizz';
  if (p === 107) return 'harp';
  if (p === 108) return 'musicbox';
  if (p === 109) return 'reed';
  if (p <= 119) return 'glock';
  return 'strings';
}

const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export function detectKey(hist: number[]): [number, Mode] {
  const corr = (a: number[], b: number[]) => { const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12; let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return da && db ? n / Math.sqrt(da * db) : 0; };
  let best: [number, number, Mode] = [-2, 0, 'major'];
  for (let t = 0; t < 12; t++) { const rot = hist.map((_, i) => hist[(t + i) % 12]); for (const [mode, prof] of [['major', KS_MAJOR], ['minor', KS_MINOR]] as const) { const c = corr(rot, prof); if (c > best[0]) best = [c, t, mode]; } }
  return [best[1], best[2]];
}

/** track names that state a role */
const NAMED: [RegExp, Role][] = [
  [/^(主旋律|旋律|melody|lead|lead vocal|vocals?|voice)$/, 'melody'], [/^(吉他|guitar)$/, 'guitar'], [/^(钢琴|piano)$/, 'piano'],
  [/^(贝斯|bass|bass guitar)$/, 'bass'], [/^(鼓|drums?|drum kit|kit)$/, 'drums']
];
/** MIDI text arrives as one character per byte; names written as UTF-8 (by us and most apps) decode back here */
function text(s: string) {
  if (!/[\x80-\xff]/.test(s) || /[^\x00-\xff]/.test(s)) return s;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(s, c => c.charCodeAt(0))); } catch { return s; }
}

export function midiToSong(buf: ArrayBuffer, fileName: string): SongData {
  const midi = new Midi(buf);
  const f = PPQ / (midi.header.ppq || 480), tk = (t: number) => Math.round(t * f);
  let tempos: [number, number][] = midi.header.tempos.map(t => [tk(t.ticks), +t.bpm.toFixed(3)] as [number, number]).sort((a, b) => a[0] - b[0]);
  if (!tempos.length || tempos[0][0] > 0) tempos.unshift([0, tempos.length ? tempos[0][1] : 120]);
  tempos = tempos.filter((t, i, a) => i === a.length - 1 || a[i + 1][0] !== t[0]).filter((t, i, a) => !i || t[1] !== a[i - 1][1]);
  let meters: [number, number, number][] = midi.header.timeSignatures.map(t => [tk(t.ticks), t.timeSignature[0], t.timeSignature[1]] as [number, number, number]);
  if (!meters.length) meters = [[0, 4, 4]];
  meters = meters.filter((m, i, a) => !i || m[1] !== a[i - 1][1] || m[2] !== a[i - 1][2]);

  interface Raw { notes: number[]; program: number; drums: boolean; name: string; mean: number; mono: number; count: number; distinct: number; cover: number }
  const raws: Raw[] = [];
  for (const tr of midi.tracks) {
    if (!tr.notes.length) continue;
    const drums = tr.channel === 9 || tr.instrument.percussion;
    if (!drums && tr.instrument.number >= 120) continue;
    const notes: number[] = [];
    let sum = 0, overlap = 0, lastEnd = -1;
    const sorted = [...tr.notes].sort((a, b) => a.ticks - b.ticks || a.midi - b.midi);
    for (const n of sorted) {
      const t = tk(n.ticks), d = Math.max(1, tk(n.durationTicks));
      notes.push(t, d, n.midi, Math.max(1, Math.round(n.velocity * 127)));
      sum += n.midi;
      if (t < lastEnd - 10) overlap++;
      lastEnd = Math.max(lastEnd, t + d);
    }
    const distinct = new Set(sorted.map(n => n.midi)).size, span = Math.max(1, midi.durationTicks);
    raws.push({ notes, program: tr.instrument.number, drums, name: text(tr.name || '').trim(), mean: sum / sorted.length, mono: 1 - overlap / sorted.length, count: sorted.length, distinct, cover: Math.min(1, (sorted[sorted.length - 1].ticks - sorted[0].ticks) / span) });
  }
  if (!raws.length) throw new Error('no notes');

  // roles: drums by channel, bass by program or register, melody = the busiest high, mostly single line
  const roles: Role[] = raws.map(r => r.drums ? 'drums' : (r.program >= 32 && r.program <= 39) || r.program === 43 || (r.mean < 48 && r.mono > .8) ? 'bass' : 'other');
  // a track that says what it is (our own exports do, in either language) is taken at its word
  const claimed = new Set<Role>();
  raws.forEach((r, i) => {
    const nm = r.name.toLowerCase();
    const role = NAMED.find(([re]) => re.test(nm))?.[1];
    if (!role || claimed.has(role) || (role === 'drums') !== r.drums) return;
    roles[i] = role; claimed.add(role);
  });
  // melody: a real line (several pitches, not a percussion program) that runs through the song, high and mostly single
  let cands = raws.map((r, i) => ({ r, i })).filter(({ r, i }) => roles[i] === 'other' && r.program < 112 && r.distinct >= 5 && r.count >= 16);
  if (!cands.length) cands = raws.map((r, i) => ({ r, i })).filter(({ i }) => roles[i] === 'other');
  if (cands.length && !claimed.has('melody')) {
    const score = ({ r }: { r: Raw }) => r.mean * .5 + r.mono * 25 + Math.min(40, Math.log2(r.count + 1) * 4) + r.cover * 20;
    const best = cands.reduce((a, b) => score(b) > score(a) ? b : a);
    roles[best.i] = 'melody';
  }
  raws.forEach((r, i) => { if (roles[i] !== 'other') return; if (r.program >= 24 && r.program <= 31 && !claimed.has('guitar')) roles[i] = 'guitar'; else if (r.program <= 7 && !claimed.has('piano')) roles[i] = 'piano'; });
  // one of each named role keeps its colour; the rest become extra parts
  const seen = new Set<Role>();
  const order: Role[] = ['melody', 'guitar', 'piano', 'bass', 'drums', 'other'];
  const idx = raws.map((_, i) => i).sort((a, b) => order.indexOf(roles[a]) - order.indexOf(roles[b]) || raws[b].count - raws[a].count).slice(0, 12);
  let extra = 5;
  const parts: PartData[] = idx.map((i, k) => {
    const r = raws[i];
    let role = roles[i];
    if (role !== 'other' && seen.has(role)) role = 'other';
    seen.add(role);
    const color = role === 'other' ? extra++ : order.indexOf(role);
    const pid = presetFor(r.program, r.drums), pr = PRESETS[pid];
    const nice = r.name && !/^(track|staff|untitled)\s*\d*$/i.test(r.name) && /^[\x20-\x7e -ɏ　-鿿＀-￯]+$/.test(r.name) ? r.name.slice(0, 18) : '';
    const name = role === 'other' ? (nice ? { zh: nice, en: nice } : pr.name) : ROLE_NAME[role];
    return { id: 'p' + k, role, name, inst: pr.name, tag: role === 'other' ? { day: pr.name.en.split(/[ ·]/)[0].toUpperCase().slice(0, 10), night: TAGS.other.night } : TAGS[role], icon: role === 'melody' && pr.icon === 'piano' ? 'mic' : pr.icon, preset: pid, color, notes: r.notes };
  });

  const hist = new Array(12).fill(0);
  parts.forEach(p => { if (p.role === 'drums') return; for (let i = 0; i < p.notes.length; i += 4) hist[p.notes[i + 2] % 12] += p.notes[i + 1]; });
  const [tonic, mode] = detectKey(hist);
  let end = 0;
  parts.forEach(p => { for (let i = 0; i < p.notes.length; i += 4) end = Math.max(end, p.notes[i] + p.notes[i + 1]); });
  const base = fileName.replace(/\.(mid|midi)$/i, '').trim().slice(0, 40) || 'MIDI';
  // the header name is often just the first track's name; prefer the file name then
  const hn = text(midi.header.name || '').trim();
  const title = hn && hn.length <= 40 && !midi.tracks.some(t => text(t.name || '').trim() === hn) ? hn : base;
  return {
    v: 1, id: 'u' + Date.now().toString(36), title: { zh: title, en: title }, latin: /^[\x20-\x7e]+$/.test(title) ? '' : '', artist: { zh: '你的 MIDI', en: 'Your MIDI' },
    key: { tonic, mode }, ppq: PPQ, tempos, meters, end, parts, user: true
  };
}
