/* plays the same phrase on every preset and reports loudness, so the level trims can be set evenly */
import { OfflineAudioContext, AudioBuffer } from 'node-web-audio-api';
import { setRenderer } from '../src/lib/audio/voices';
import { pluck, piano } from '../src/lib/audio/dsp';
import { buildBus } from '../src/lib/audio/engine';
import { makeStrip } from '../src/lib/audio/strip';
import { PRESETS, instrument } from '../src/lib/audio/presets';

(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = AudioBuffer;
setRenderer(async j => j.kind === 'pluck' ? pluck(j.sr, j.pitch, j.p) : piano(j.sr, j.pitch, j.p));
const CENTER: Record<string, number> = { sublow: 36, bass: 40, synthbass: 40, drivebass: 40, accordionbass: 43, glock: 84, musicbox: 79, piccolo: 84, whistle: 74, ocarina: 76, flute: 74, violin: 72, square: 60, harp: 64 };
const SUSTAINED = new Set(['supersaw', 'leadsaw', 'pad', 'strings', 'viola', 'violin', 'organ', 'percorgan', 'accordion', 'accordionbass', 'brass', 'reed', 'oboe', 'flute', 'ocarina', 'whistle', 'bottle', 'square']);
const sr = 48000;
const out: string[] = [];
for (const id of Object.keys(PRESETS)) {
  if (id === 'audio') continue; // an audio track's channel plays no notes
  const ctx = new OfflineAudioContext(2, sr * 6, sr) as unknown as globalThis.OfflineAudioContext;
  const bus = buildBus(ctx, false);
  bus.wet.gain.value = 0;
  const st = makeStrip(ctx, bus, id);
  st.level.gain.value = .8;
  const inst = instrument(id), input = inst.chain ? inst.chain(st.input) : st.input;
  const c = CENTER[id] ?? 60, scale = id === 'kit' || id === 'ekit' ? [36, 42, 38, 42, 36, 36, 38, 42] : [0, 2, 4, 5, 7, 5, 4, 2].map(x => c + x);
  await inst.prepare(ctx, scale);
  scale.forEach((p, i) => inst.play(input, .1 + i * .6, p, 100, id === 'kit' || id === 'ekit' ? .1 : .55));
  const b = await ctx.startRendering() as unknown as AudioBuffer;
  let sum = 0, n = 0, peak = 0;
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = Math.round(.1 * sr); i < Math.round(5 * sr); i++) { sum += d[i] * d[i]; n++; peak = Math.max(peak, Math.abs(d[i])); } }
  const rms = 20 * Math.log10(Math.sqrt(sum / n)), target = SUSTAINED.has(id) ? -24 : -20;
  const trim = Math.pow(10, (target - rms) / 20);
  out.push(`${id.padEnd(14)} rms ${rms.toFixed(1).padStart(6)} dB  peak ${(20 * Math.log10(peak)).toFixed(1).padStart(6)} dB  -> level ${trim.toFixed(2)}`);
}
console.log(out.join('\n'));
