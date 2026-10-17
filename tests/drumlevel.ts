/* the built-in songs' drums brought up against the rest of the band as heard (balance.ts: drumsUp), every other fader
   and the trim kept. run: npx tsx tests/drumlevel.ts [--write] */
import fs from 'node:fs';
import { OfflineAudioContext, AudioBuffer } from 'node-web-audio-api';
import { setRenderer } from '../src/lib/audio/voices';
import { pluck, piano } from '../src/lib/audio/dsp';
import { drumsUp } from '../src/lib/audio/balance';
import { prepareSong } from '../src/lib/music/song';
import type { SongData } from '../src/lib/music/types';

(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = AudioBuffer;
setRenderer(async j => j.kind === 'pluck' ? pluck(j.sr, j.pitch, j.p) : piano(j.sr, j.pitch, j.p));
const make = (c: number, l: number, sr: number) => new OfflineAudioContext(c, l, sr) as unknown as globalThis.OfflineAudioContext;
const DIR = 'src/data/songs', write = process.argv.includes('--write');
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !f.startsWith('ut-'))) {
  const text = fs.readFileSync(`${DIR}/${f}`, 'utf-8'), data = JSON.parse(text) as SongData;
  const d = data.parts.findIndex(p => p.role === 'drums');
  if (d < 0) continue;
  const up = await drumsUp(prepareSong(data), d, { make, sampleRate: 32000 }), vol = data.parts[d].mix!.vol, next = +(vol + up).toFixed(1);
  console.log(`${data.id.padEnd(14)} drums fader ${vol} → ${next}`);
  if (write && next !== vol) fs.writeFileSync(`${DIR}/${f}`, text.replace(/("id":"drums"[^]*?"mix":\{"vol":)(-?[\d.]+)/, (_, a) => a + next));
}
