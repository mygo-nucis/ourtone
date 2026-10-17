/* checks that every preset played by the UT-2 patch engine sounds as it did with its old hand-built voice.
   run: npx vite build -c vite.test.config.ts && node tests/out/ut2.js */
import { OfflineAudioContext, AudioBuffer } from 'node-web-audio-api';
import { setRenderer, type Instrument } from '../src/lib/audio/voices';
import { pluck, piano } from '../src/lib/audio/dsp';
import { PRESETS, type Preset } from '../src/lib/audio/presets';
import { pluckInstrument, pianoInstrument, kitInstrument, driveChain } from '../src/lib/audio/voices';
import { fmInstrument, windInstrument, reedInstrument, bowedInstrument, organInstrument, squeezeInstrument, chipInstrument, brassInstrument, synthBassInstrument } from './legacy-voices';
import { patchInstrument } from '../src/lib/audio/ut2';

(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = AudioBuffer;
setRenderer(async j => j.kind === 'pluck' ? pluck(j.sr, j.pitch, j.p) : piano(j.sr, j.pitch, j.p));
const sr = 48000, LEN = 7;
const CENTER: Record<string, number> = { bass: 40, synthbass: 40, drivebass: 40, accordionbass: 43, glock: 84, musicbox: 79, whistle: 74, ocarina: 76, flute: 74, violin: 72, harp: 64 };

async function render(inst: Instrument, id: string) {
  const ctx = new OfflineAudioContext(2, sr * LEN, sr) as unknown as globalThis.OfflineAudioContext;
  const input = inst.chain ? inst.chain(ctx.destination) : ctx.destination;
  const c = CENTER[id] ?? 60;
  const notes: [number, number, number, number][] = id === 'kit'
    ? [[.1, 36, 100, .1], [.4, 38, 70, .1], [.7, 42, 127, .1], [1, 46, 90, .2], [1.4, 49, 110, .5], [2.2, 45, 80, .2]]
    : [[.1, c, 100, .5], [.7, c + 2, 60, .3], [1.1, c + 4, 127, .25], [1.5, c + 7, 90, .6], [2.3, c, 110, 1.2], [2.3, c + 4, 110, 1.2], [2.3, c + 7, 110, 1.2], [4, c + 12, 80, 2.2]];
  await inst.prepare(ctx, notes.map(n => n[1]));
  for (const [t, p, v, d] of notes) inst.play(input, t, p, v, d);
  // a held note released by hand, as live playing does
  const held = inst.start(input, 6.2, c + 5, 96); held.release(6.6);
  return await ctx.startRendering() as unknown as AudioBuffer;
}
/** the instrument as the old, hand-built voices made it (kept to check UT-2 against) */
function legacyInstrument(pr: Preset): Instrument {
  const o = pr.opts;
  switch (pr.kind) {
    case 'pluck': return pluckInstrument(pr.id, o, pr.drive ? driveChain(...pr.drive) : undefined);
    case 'piano': return pianoInstrument(pr.id, o);
    case 'fm': return fmInstrument(o);
    case 'wind': return windInstrument(o);
    case 'reed': return reedInstrument(o);
    case 'bowed': return bowedInstrument(o);
    case 'organ': return organInstrument(o);
    case 'squeeze': return squeezeInstrument(o);
    case 'chip': return chipInstrument(o);
    case 'brass': return brassInstrument(o);
    case 'synthBass': return synthBassInstrument(o);
    default: return kitInstrument(o);
  }
}
const out: string[] = [];
let worst = -Infinity;
for (const id of Object.keys(PRESETS)) {
  const pr = PRESETS[id];
  // the electronic family was written as UT-2 patches from the start: there is no older voice to compare with
  if (pr.kind === 'raw') continue;
  const a = await render(legacyInstrument(pr), id), b = await render(patchInstrument(pr.patch), id);
  let diff = 0, ref = 0;
  for (let ch = 0; ch < 2; ch++) { const x = a.getChannelData(ch), y = b.getChannelData(ch); for (let i = 0; i < x.length; i++) { const d = x[i] - y[i]; diff += d * d; ref += x[i] * x[i]; } }
  const db = 10 * Math.log10(Math.max(1e-30, diff) / Math.max(1e-30, ref));
  worst = Math.max(worst, db);
  out.push(`${id.padEnd(14)} ${pr.kind.padEnd(10)} difference ${db.toFixed(1).padStart(7)} dB`);
}
console.log(out.join('\n'));
console.log(`worst ${worst.toFixed(1)} dB`);
