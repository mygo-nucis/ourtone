/* the song generator: every style over many seeds. checks the notes (valid, in range, melody on chord tones where it
   matters, mostly stepwise, motifs that repeat) and renders the busiest stretch of a few to check the loudness.
   run: npx vite build -c vite.test.config.ts && node tests/out/gen.js [--render] [--seeds=N] */
import fs from 'node:fs';
import { OfflineAudioContext, AudioBuffer } from 'node-web-audio-api';
import { setRenderer } from '../src/lib/audio/voices';
import { pluck, piano } from '../src/lib/audio/dsp';
import { renderSong } from '../src/lib/audio/offline';
import { prepareSong } from '../src/lib/music/song';
import { generate } from '../src/lib/gen/generate';
import { STYLES, STYLE_ORDER } from '../src/lib/gen/styles';
import { tonesOf } from '../src/lib/gen/harmony';
import type { SongData } from '../src/lib/music/types';

(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = AudioBuffer;
setRenderer(async j => j.kind === 'pluck' ? pluck(j.sr, j.pitch, j.p) : piano(j.sr, j.pitch, j.p));
const make = (c: number, l: number, sr: number) => new OfflineAudioContext(c, l, sr) as unknown as globalThis.OfflineAudioContext;
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const SEEDS = +(arg('seeds') ?? 12), RENDER = process.argv.includes('--render'), LEN = (arg('len') ?? 'full') as 'short' | 'full';

function stats(b: AudioBuffer) {
  let sum = 0, n = 0, peak = 0, clip = 0, nan = 0;
  for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = d[i]; if (!Number.isFinite(v)) { nan++; continue; } sum += v * v; n++; peak = Math.max(peak, Math.abs(v)); if (Math.abs(v) > .999) clip++; } }
  return { rms: 20 * Math.log10(Math.sqrt(sum / Math.max(1, n))), peak: 20 * Math.log10(Math.max(1e-9, peak)), clip, nan };
}
const notesOf = (flat: number[]) => { const out: { t: number; d: number; p: number; v: number }[] = []; for (let i = 0; i < flat.length; i += 4) out.push({ t: flat[i], d: flat[i + 1], p: flat[i + 2], v: flat[i + 3] }); return out; };

const problems: string[] = [];
for (const id of STYLE_ORDER) {
  const st = STYLES[id];
  const rows: string[] = [];
  let agg = { strong: 0, strongTone: 0, steps: 0, small: 0, leaps: 0, reps: 0, units: 0, same: 0, runs: 0 };
  for (let k = 0; k < SEEDS; k++) {
    const seed = 1000 + k * 7919;
    const s: SongData = generate({ style: id, seed, length: LEN }, 'test');
    const song = prepareSong(s);
    // validity
    for (const p of s.parts) for (const n of notesOf(p.notes)) if (!(n.t >= 0 && n.d >= 1 && n.p >= 0 && n.p <= 127 && n.v >= 1 && n.v <= 127) || !Number.isFinite(n.t + n.d + n.p + n.v)) { problems.push(`${id}/${seed} bad note in ${p.id}: ${JSON.stringify(n)}`); break; }
    const mel = s.parts.find(p => p.role === 'melody');
    if (!mel) { problems.push(`${id}/${seed}: no melody`); continue; }
    const ns = notesOf(mel.notes), BAR = s.ppq * 4;
    const prog = (t: number) => t; void prog;
    // the chords the generator used are not stored: rebuild them from the chords part at each bar's first beat
    const chordsPart = s.parts.find(p => p.id.startsWith(p.preset) && (p.name.en === 'Chords'));
    const cn = chordsPart ? notesOf(chordsPart.notes) : [];
    const pcsAt = (t: number) => { const bar = Math.floor(t / BAR) * BAR; const set = new Set<number>(); for (const n of cn) if (n.t < bar + BAR && n.t + n.d > bar + 60 && n.t >= bar - BAR / 4) set.add(n.p % 12); return set; };
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i], pos = ((n.t % (BAR / 2)) + BAR / 2) % (BAR / 2);
      if (pos < 40 || pos > BAR / 2 - 40) { agg.strong++; const pcs = pcsAt(n.t); if (!pcs.size || pcs.has(n.p % 12)) agg.strongTone++; }
      if (i) { const d = Math.abs(n.p - ns[i - 1].p); agg.steps++; if (d <= 2) agg.small++; if (d >= 7) agg.leaps++; if (!d) agg.same++; }
    }
    // the same pitch again and again makes a flat tune: no note four times running inside a phrase
    for (let i = 3; i < ns.length; i++) {
      const run = [ns[i - 3], ns[i - 2], ns[i - 1], ns[i]];
      if (run.every(n => n.p === ns[i].p) && run.every((n, k) => !k || n.t - (run[k - 1].t + run[k - 1].d) < s.ppq)) { agg.runs++; problems.push(`${id}/${seed}: the melody plays ${ns[i].p} four times running at tick ${run[0].t}`); break; }
    }
    // motif reuse: two-bar rhythms that come back
    const units = new Map<string, number>();
    const byUnit = new Map<number, number[]>();
    for (const n of ns) { const u = Math.floor(n.t / (BAR * 2)); if (!byUnit.has(u)) byUnit.set(u, []); byUnit.get(u)!.push(Math.round((n.t % (BAR * 2)) / (s.ppq / 4))); }
    for (const v of byUnit.values()) { const key = v.join(','); units.set(key, (units.get(key) ?? 0) + 1); }
    for (const c of units.values()) { agg.units += c; if (c > 1) agg.reps += c; }
    const lo = Math.min(...ns.map(n => n.p)), hi = Math.max(...ns.map(n => n.p));
    if (lo < st.lead.lo - 1 || hi > st.lead.hi + 1) problems.push(`${id}/${seed}: melody out of range ${lo}-${hi}`);
    if (k < 3) rows.push(`   seed ${String(seed).padStart(6)}  "${s.title.zh} / ${s.title.en}"  ${s.key.tonic}${s.key.mode === 'major' ? '' : 'm'} ${s.tempos[0][1]} bpm  ${song.duration.toFixed(0)} s  parts ${s.parts.map(p => `${p.preset}:${p.notes.length / 4}`).join(' ')}  melody ${lo}-${hi}`);
  }
  console.log(`${id.padEnd(11)} strong beats on chord tones ${(100 * agg.strongTone / Math.max(1, agg.strong)).toFixed(0)}%  repeated notes ${(100 * agg.same / Math.max(1, agg.steps)).toFixed(0)}%  steps ≤2 st ${(100 * agg.small / Math.max(1, agg.steps)).toFixed(0)}%  leaps ≥7 ${(100 * agg.leaps / Math.max(1, agg.steps)).toFixed(1)}%  two-bar rhythms that return ${(100 * agg.reps / Math.max(1, agg.units)).toFixed(0)}%`);
  if (agg.same / Math.max(1, agg.steps) > .18) problems.push(`${id}: ${(100 * agg.same / agg.steps).toFixed(0)}% of the melody's steps repeat a note`);
  rows.forEach(r => console.log(r));
  if (RENDER) {
    const s = generate({ style: id, seed: 1000, length: LEN }, 'test'), song = prepareSong(s);
    // the loudest stretch: the first chorus or drop
    let bar = 0, at = 0; const form = st.form[LEN];
    for (const sec of form) { if (sec.kind === 'chorus' || sec.kind === 'drop') { at = bar; break; } bar += sec.bars; }
    const from = song.data.tempos ? song.tl.sec(at * s.ppq * 4) : 0, to = from + 14;
    const mix = await renderSong(song, { from, to, make, tail: 1 });
    const m = stats(mix as unknown as AudioBuffer);
    const parts: string[] = [];
    for (let i = 0; i < song.parts.length; i++) { const b = await renderSong(song, { from, to, parts: [i], make, tail: 1 }); const q = stats(b as unknown as AudioBuffer); parts.push(`${song.parts[i].data.preset} ${q.rms.toFixed(1)}`); }
    console.log(`   render ${from.toFixed(1)}–${to.toFixed(1)} s: mix rms ${m.rms.toFixed(1)} dB peak ${m.peak.toFixed(1)} dB clip ${m.clip}${m.nan ? ' NaN ' + m.nan : ''} | ${parts.join('  ')}`);
    fs.mkdirSync('tests/out', { recursive: true });
  }
}
if (problems.length) { console.log('PROBLEMS\n' + problems.slice(0, 20).join('\n')); process.exitCode = 1; } else console.log('all generated songs valid');
