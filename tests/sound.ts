/* the sound view's changes, rendered: random and mutated versions of every preset, and a few hand-made edits,
   must stay audible, finite and out of clipping. run: npx vite build -c vite.test.config.ts && node tests/out/sound.js */
import { OfflineAudioContext, AudioBuffer } from 'node-web-audio-api';
import { setRenderer } from '../src/lib/audio/voices';
import { pluck, piano } from '../src/lib/audio/dsp';
import { PRESETS } from '../src/lib/audio/presets';
import { patchInstrument } from '../src/lib/audio/ut2';
import { randomize, mutate } from '../src/lib/audio/chance';
import { patchKey, type Patch } from '../src/lib/audio/patch';
import { autoTrim, setOfflineMaker, loudest } from '../src/lib/audio/level';
setOfflineMaker((c, l, sr) => new OfflineAudioContext(c, l, sr) as unknown as globalThis.OfflineAudioContext);

(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = AudioBuffer;
setRenderer(async j => j.kind === 'pluck' ? pluck(j.sr, j.pitch, j.p) : piano(j.sr, j.pitch, j.p));
const sr = 48000;
async function render(p: Patch) {
  const inst = patchInstrument(p), ctx = new OfflineAudioContext(2, sr * 3, sr) as unknown as globalThis.OfflineAudioContext;
  const input = inst.chain ? inst.chain(ctx.destination) : ctx.destination;
  const notes = [[.05, 60, 100, .5], [.6, 64, 70, .4], [1.1, 67, 120, 1.2], [1.1, 55, 110, 1.2]];
  await inst.prepare(ctx, notes.map(n => n[1]));
  for (const [t, m, v, d] of notes) inst.play(input, t, m, v, d);
  const b = await ctx.startRendering() as unknown as AudioBuffer;
  let peak = 0, bad = 0;
  for (let c = 0; c < 2; c++) { const x = b.getChannelData(c); for (let i = 0; i < x.length; i++) { const y = x[i]; if (!Number.isFinite(y)) { bad++; continue; } peak = Math.max(peak, Math.abs(y)); } }
  const mono = new Float32Array(b.length), l = b.getChannelData(0), r = b.getChannelData(1);
  for (let i = 0; i < b.length; i++) mono[i] = (l[i] + r[i]) / 2;
  return { rms: loudest(mono, sr), peak: 20 * Math.log10(Math.max(1e-20, peak)), bad };
}
const out: string[] = [];
let problems = 0;
for (const id of Object.keys(PRESETS)) {
  if (id === 'audio') continue; // an audio track's channel plays no notes
  if (id === 'kit') continue;
  const b0 = await render(JSON.parse(JSON.stringify(PRESETS[id].patch)));
  for (const [how, seed] of [['random', 1], ['random', 2], ['random', 3], ['mutate', 4]] as const) {
    const p: Patch = JSON.parse(JSON.stringify(PRESETS[id].patch));
    if (how === 'random') randomize(p, seed); else mutate(p, seed);
    p.id = patchKey(id, p);
    p.trim = await autoTrim(p, PRESETS[id].patch, 60);
    p.id = patchKey(id, p);
    const r = await render(p);
    // against the preset as it was: louder than +9 dB, quieter than -18 dB, or peaks 12 dB over are worth a look
    const d = r.rms - b0.rms, bad = r.bad > 0 || d > 9 || d < -18 || r.peak - b0.peak > 12;
    if (bad) problems++;
    if (bad || seed === 1) out.push(`${id.padEnd(14)} ${how.padEnd(7)} ${seed}  loudest ${d >= 0 ? '+' : ''}${d.toFixed(1).padStart(5)} dB vs preset  peak ${(r.peak - b0.peak).toFixed(1).padStart(5)}${r.bad ? '  NaN ' + r.bad : ''}${bad ? '  <-- check' : ''}`);
  }
}
// hand edits the panels make: an oscillator under a string, a swept filter, the filter lfo, the voice drive
const base: Patch = JSON.parse(JSON.stringify(PRESETS.acoustic.patch));
base.osc = [{ wave: 'table', table: Array.from({ length: 32 }, (_, i) => Math.sin(i / 32 * Math.PI * 2) * .8 + (i % 8 < 4 ? .2 : -.2)), ratio: 1, level: .25, voices: 3, spread: 9 }];
base.amp = { a: .01, sus: .7, tau: .5, rel: .3, lo: .35, hi: .65, pow: 1 };
base.vf = { type: 'lp', cut: 900, res: .6, key: .5, drive: .5, env: { amt: 3, a: .01, d: .3, s: .2, r: .3 }, lfo: { rate: 3, depth: 1, delay: .2 } };
base.id = patchKey('acoustic', base);
const r = await render(base);
out.push(`acoustic+edits         rms ${r.rms.toFixed(1)} dB  peak ${r.peak.toFixed(1)} dB${r.bad ? '  NaN ' + r.bad : ''}`);
if (r.bad || r.rms < -70) problems++;
console.log(out.join('\n'));
console.log(problems ? `${problems} to check` : 'all sound');
