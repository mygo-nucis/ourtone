/* auto-level, timed and recorded: the trim Random gives a spread of presets and seeds, with random effects on (so the
   drive and compressor passes run too). `node tests/out/level.js save` keeps the trims as a reference; a plain run
   compares against it, so a faster loudness model can be checked to pick the same levels.
   run: npx vite build -c vite.test.config.ts && node tests/out/level.js [save] */
import fs from 'node:fs';
import { OfflineAudioContext, AudioBuffer } from 'node-web-audio-api';
import { setRenderer } from '../src/lib/audio/voices';
import { pluck, piano } from '../src/lib/audio/dsp';
import { PRESETS } from '../src/lib/audio/presets';
import { randomize, randomFx, randomMacros } from '../src/lib/audio/chance';
import { effective } from '../src/lib/audio/fx';
import { patchKey, type Patch } from '../src/lib/audio/patch';
import { rng } from '../src/lib/util';
import { autoTrim, setOfflineMaker, bands, sones, gainFor, loudness, levelStats } from '../src/lib/audio/level';
setOfflineMaker((c, l, sr) => new OfflineAudioContext(c, l, sr) as unknown as globalThis.OfflineAudioContext);
(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = AudioBuffer;
setRenderer(async j => j.kind === 'pluck' ? pluck(j.sr, j.pitch, j.p) : piano(j.sr, j.pitch, j.p));

const REF = 'tests/out/level-ref.json';
const phrase = { key: 'test', notes: Array.from({ length: 14 }, (_, i) => [.02 + i * .28, 55 + (i * 5) % 14, 70 + (i * 13) % 50, .25 + (i % 3) * .2] as [number, number, number, number]) };
const trims: Record<string, number> = {};
let t = 0;
const errOf: Record<string, number> = {};
const renders: number[] = [], passes: number[] = [], errs: number[] = [];
for (const id of Object.keys(PRESETS)) {
  if (id === 'audio' || id === 'kit' || id === 'ekit') continue; // drum parts keep their kit on Random
  for (let seed = 1; seed <= 6; seed++) {
    const r = rng(seed ^ 0x5bd1e995), fx = randomFx(r), macro = randomMacros(r);
    const p: Patch = JSON.parse(JSON.stringify(PRESETS[id].patch));
    randomize(p, seed); p.id = patchKey(id, p);
    const t0 = performance.now();
    const ph = seed % 2 ? phrase : null, fxe = effective(fx, macro), r0 = levelStats.renders, p0 = levelStats.passes;
    const trim = trims[`${id}#${seed}`] = await autoTrim(p, PRESETS[id].patch, 60, fxe, ph);
    t += performance.now() - t0;
    renders.push(levelStats.renders - r0); passes.push(levelStats.passes - p0);
    // how far from its preset's loudness the levelled sound lands (what the trim is for)
    const err = await loudness({ ...p, trim }, 60, fxe, true, ph) - await loudness(PRESETS[id].patch, 60, undefined, false, ph);
    errs.push(err); errOf[`${id}#${seed}`] = err;
  }
}
// the loudness model alone, on one phrase's frames
const sr = 22050, x = new Float32Array(sr * 5); for (let i = 0; i < x.length; i++) x[i] = Math.sin(i * .06) * .3 + Math.sin(i * .31) * .1 * Math.sin(i / 9000);
const fr = bands(x, sr); let t1 = performance.now(); const g = gainFor(fr, sr, sones(fr, sr) - 6); t1 = performance.now() - t1;
const n = Object.keys(trims).length;
const ae = errs.filter(isFinite).map(Math.abs).sort((a, b) => a - b), q = (f: number) => ae[Math.floor(f * (ae.length - 1))];
const mean = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
console.log(`per sound: ${mean(renders)} phrase renders (max ${Math.max(...renders)}), ${mean(passes)} effect passes (max ${Math.max(...passes)}); level error |dB|: median ${q(.5).toFixed(2)}, 90% ${q(.9).toFixed(2)}, max ${q(1).toFixed(2)}`);
console.log(`${n} sounds levelled in ${(t / 1000).toFixed(2)} s (${(t / n).toFixed(0)} ms each); one gainFor over ${fr.length} frames: ${t1.toFixed(1)} ms (gain ${g.toFixed(3)})`);
if (process.argv[2] === 'save') { fs.writeFileSync(REF, JSON.stringify(trims)); console.log('saved', REF); }
else if (fs.existsSync(REF)) {
  const ref = JSON.parse(fs.readFileSync(REF, 'utf-8')) as Record<string, number>;
  const d = Object.keys(ref).map(k => [k, trims[k] - ref[k]] as const).filter(([, v]) => Math.abs(v) > 1e-9);
  const max = Math.max(0, ...d.map(([, v]) => Math.abs(v)));
  for (const [k, v] of d) if (Math.abs(v) > 1) console.log(`  ${k}: trim ${trims[k]} (reference ${ref[k]}), lands ${errOf[k] > 0 ? '+' : ''}${errOf[k].toFixed(2)} dB from its preset`);
  console.log(`vs reference: ${d.length} of ${n} differ, largest ${max.toFixed(2)} dB`, d.slice(0, 8).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v.toFixed(1)}`).join(', '));
}
