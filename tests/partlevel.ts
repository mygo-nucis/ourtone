/* how loud one part plays (loudness while playing, as the measured mix hears it) with its sound as it is and with another:
   the fader that keeps the part where it was when its sound changes.
   run: npx vite build -c vite.test.config.ts && node tests/out/partlevel.js <song.json> <part id> <preset> */
import fs from 'node:fs';
import { OfflineAudioContext, AudioBuffer } from 'node-web-audio-api';
import { setRenderer } from '../src/lib/audio/voices';
import { pluck, piano } from '../src/lib/audio/dsp';
import { activeLoudness, busiest } from '../src/lib/audio/balance';
import { renderSong } from '../src/lib/audio/offline';
import { prepareSong } from '../src/lib/music/song';
import type { SongData } from '../src/lib/music/types';

(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = AudioBuffer;
setRenderer(async j => j.kind === 'pluck' ? pluck(j.sr, j.pitch, j.p) : piano(j.sr, j.pitch, j.p));
const make = (c: number, l: number, sr: number) => new OfflineAudioContext(c, l, sr) as unknown as globalThis.OfflineAudioContext;
const [file, id, to] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as SongData;
const i = data.parts.findIndex(p => p.id === id);
async function loud(d: SongData) {
  const neutral: SongData = { ...d, gain: 0, parts: d.parts.map(p => ({ ...p, mix: { vol: 0, pan: 0, rev: 0, dly: 0, mute: false, solo: false } })) };
  const song = prepareSong(neutral), p = song.parts[i];
  let e = 0, k = 0;
  for (const [a, b] of busiest(p.start, song.duration, 20, 3)) {
    const l = activeLoudness(await renderSong(song, { from: a, to: b, parts: [i], make, tail: .5, sampleRate: 32000 }));
    if (l > -100) { e += Math.pow(10, l / 10); k++; }
  }
  return 10 * Math.log10(e / k);
}
const was = await loud(data);
const now = await loud({ ...data, parts: data.parts.map((p, j) => j === i ? { ...p, preset: to, patch: undefined } : p) });
const vol = data.parts[i].mix!.vol;
console.log(`${id}: ${data.parts[i].patch ? 'edited ' : ''}${data.parts[i].preset} ${was.toFixed(1)} dB, ${to} ${now.toFixed(1)} dB: fader ${vol} → ${(vol + was - now).toFixed(1)}`);
