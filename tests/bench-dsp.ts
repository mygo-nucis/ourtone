import { pluck, piano } from '../src/lib/audio/dsp.ts';
const sr = 48000;
let t0 = performance.now(), n = 0;
for (let p = 21; p <= 108; p += 3) { piano(sr, p, { bright: 1, decay: 1, thump: 1 }); n++; }
const tp = performance.now() - t0;
t0 = performance.now();
for (let p = 40; p <= 88; p++) pluck(sr, p, { decay: 3, decayK: .5, minDecay: .9, maxDecay: 6, excite: .42, pick: .17, damp: .03, maxLen: 3.6 });
const tk = performance.now() - t0;
console.log(`piano: ${n} samples in ${tp.toFixed(0)} ms (${(tp / n).toFixed(1)} ms each); pluck: 49 notes in ${tk.toFixed(0)} ms`);
for (const p of [24, 36, 48, 60, 72, 84, 96]) { const a = performance.now(); const r = piano(sr, p, { bright: 1, decay: 1, thump: 1 }); let pk = 0, nan = 0; for (const v of r.data) { if (!Number.isFinite(v)) nan++; else pk = Math.max(pk, Math.abs(v)); } console.log(`  piano ${p}: ${(performance.now() - a).toFixed(1)} ms, ${(r.data.length / sr).toFixed(2)} s, peak ${pk.toFixed(3)}, nan ${nan}`); }
for (const p of [28, 40, 52, 64, 76, 88]) { const r = pluck(sr, p, { decay: 3, decayK: .5, minDecay: .9, maxDecay: 6, excite: .42, pick: .17, damp: .03, maxLen: 3.6 }); let pk = 0, nan = 0; for (const v of r.data) { if (!Number.isFinite(v)) nan++; else pk = Math.max(pk, Math.abs(v)); } console.log(`  pluck ${p}: ${(r.data.length / sr).toFixed(2)} s, peak ${pk.toFixed(3)}, rate ${r.rate.toFixed(4)}, nan ${nan}`); }
