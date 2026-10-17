/* renders each built-in song offline and reports loudness per part and for the mix.
   run: npx vite build -c vite.test.config.ts && node tests/out/mix.js [ids...] */
import fs from 'node:fs';
import { OfflineAudioContext, AudioBuffer } from 'node-web-audio-api';
import { setRenderer } from '../src/lib/audio/voices';
import { pluck, piano } from '../src/lib/audio/dsp';
import { renderSong } from '../src/lib/audio/offline';
import { prepareSong, type Song } from '../src/lib/music/song';
import type { SongData } from '../src/lib/music/types';

(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = AudioBuffer;
setRenderer(async j => j.kind === 'pluck' ? pluck(j.sr, j.pitch, j.p) : piano(j.sr, j.pitch, j.p));
const make = (c: number, l: number, sr: number) => new OfflineAudioContext(c, l, sr) as unknown as globalThis.OfflineAudioContext;

const DIR = 'src/data/songs', OUT = 'tests/out';
const ids = process.argv.slice(2).filter(a => !a.startsWith('-'));
const night = process.argv.includes('--night');
const list = ids.length ? ids : fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));

function stats(b: AudioBuffer) {
  let sum = 0, n = 0, peak = 0, clip = 0, nan = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (!Number.isFinite(v)) { nan++; continue; } sum += v * v; n++; const a = Math.abs(v); if (a > peak) peak = a; if (a > .999) clip++; }
  }
  const db = (x: number) => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1);
  return { rms: db(Math.sqrt(sum / Math.max(1, n))), peak: db(peak), clip, nan };
}
function busiest(song: Song, span: number) {
  let best = 0, bestT = 0;
  for (let t = 0; t < Math.max(1, song.duration - span); t += 2) {
    let c = 0;
    for (const p of song.parts) { let k = 0; for (let i = 0; i < p.n; i++) if (p.start[i] >= t && p.start[i] < t + span) k++; if (k > 3) c++; }
    if (c > best) { best = c; bestT = t; }
  }
  return bestT;
}
function wav(b: AudioBuffer, file: string) {
  const ch = b.numberOfChannels, len = b.length, buf = Buffer.alloc(44 + len * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + len * ch * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(b.sampleRate, 24); buf.writeUInt32LE(b.sampleRate * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(len * ch * 2, 40);
  const data = Array.from({ length: ch }, (_, c) => b.getChannelData(c));
  for (let i = 0, o = 44; i < len; i++) for (let c = 0; c < ch; c++, o += 2) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(data[c][i] * 32767))), o);
  fs.writeFileSync(file, buf);
}

fs.mkdirSync(OUT, { recursive: true });
for (const id of list) {
  const song = prepareSong(JSON.parse(fs.readFileSync(`${DIR}/${id}.json`, 'utf-8')) as SongData);
  const at = process.argv.find(a => a.startsWith('--at='));
  const span = 16, from = at ? +at.slice(5) : busiest(song, span), to = from + span;
  const t0 = performance.now();
  const lines: string[] = [];
  for (let i = 0; i < song.parts.length; i++) {
    const b = await renderSong(song, { from, to, parts: [i], night, make, tail: 1 });
    const s = stats(b as unknown as AudioBuffer);
    const p = song.parts[i]; let vs = 0, vn = 0; for (let j = 0; j < p.n; j++) if (p.start[j] >= from && p.start[j] < to) { vs += p.vel[j]; vn++; }
    lines.push(`   ${p.data.id.padEnd(8)} ${p.data.preset.padEnd(13)} rms ${s.rms.padStart(6)} dB  peak ${s.peak.padStart(6)} dB  notes ${String(vn).padStart(4)} vel ${(vn ? vs / vn : 0).toFixed(0).padStart(3)} poly ${p.poly.toFixed(2)}${s.nan ? '  NaN ' + s.nan : ''}`);
  }
  const mix = await renderSong(song, { from, to, night, make, tail: 2 });
  const m = stats(mix as unknown as AudioBuffer);
  wav(mix as unknown as AudioBuffer, `${OUT}/${id}${night ? '-night' : ''}.wav`);
  console.log(`${id} [${from}s–${to}s] mix rms ${m.rms} dB peak ${m.peak} dB clip ${m.clip}${m.nan ? ' NaN ' + m.nan : ''}  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  lines.forEach(l => console.log(l));
}
