/* imports MIDI files that are not in the library and checks the result plays */
import fs from 'node:fs';
import { OfflineAudioContext, AudioBuffer } from 'node-web-audio-api';
import { setRenderer } from '../src/lib/audio/voices';
import { pluck, piano } from '../src/lib/audio/dsp';
import { renderSong } from '../src/lib/audio/offline';
import { prepareSong } from '../src/lib/music/song';
import { midiToSong } from '../src/lib/music/midi-import';
import { keyName } from '../src/lib/music/theory';

(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = AudioBuffer;
setRenderer(async j => j.kind === 'pluck' ? pluck(j.sr, j.pitch, j.p) : piano(j.sr, j.pitch, j.p));
for (const f of process.argv.slice(2)) {
  const buf = fs.readFileSync(f);
  const data = midiToSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, f.split('/').pop()!);
  const song = prepareSong(data);
  console.log(`${data.title.zh}: ${keyName(data.key.tonic, data.key.mode, 'en')}, ${data.tempos[0][1]} bpm, ${data.meters.map(m => m[1] + '/' + m[2]).join(' ')}, ${song.duration.toFixed(0)} s`);
  data.parts.forEach(p => console.log(`   ${p.role.padEnd(7)} ${p.preset.padEnd(11)} ${p.icon.padEnd(9)} colour ${p.color}  ${p.name.en} · ${p.name.zh} (${p.notes.length / 4} notes)`));
  const b = await renderSong(song, { from: 10, to: 20, make: (c, l, sr) => new OfflineAudioContext(c, l, sr) as unknown as globalThis.OfflineAudioContext, tail: 1 }) as unknown as AudioBuffer;
  let peak = 0, sum = 0; const d = b.getChannelData(0); for (const v of d) { peak = Math.max(peak, Math.abs(v)); sum += v * v; }
  console.log(`   render 10–20 s: rms ${(10 * Math.log10(sum / d.length)).toFixed(1)} dB, peak ${(20 * Math.log10(peak)).toFixed(1)} dB`);
}
