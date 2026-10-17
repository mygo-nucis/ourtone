/* what a song asks of the audio thread: how many Web Audio nodes each preset builds per note, how many notes start
   together, and how many nodes are alive at the busiest moment. run: vite build -c vite.test.config.ts && node tests/out/voicecost.js [ids] */
import fs from 'node:fs';
import { OfflineAudioContext, AudioBuffer } from 'node-web-audio-api';
import { setRenderer } from '../src/lib/audio/voices';
import { pluck, piano } from '../src/lib/audio/dsp';
import { instrumentFor } from '../src/lib/audio/presets';
import { prepareSong } from '../src/lib/music/song';
import type { SongData } from '../src/lib/music/types';

(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = AudioBuffer;
setRenderer(async j => j.kind === 'pluck' ? pluck(j.sr, j.pitch, j.p) : piano(j.sr, j.pitch, j.p));

/** nodes one note of a preset builds, and how long they stay (seconds past the note's end) */
const cost = new Map<string, { nodes: number; tail: number }>();
async function costOf(preset: string, pitch: number) {
  if (cost.has(preset)) return cost.get(preset)!;
  const ctx = new OfflineAudioContext(2, 48000 * 8, 48000) as unknown as BaseAudioContext;
  let n = 0;
  const proto = Object.getPrototypeOf(ctx);
  for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(proto)).concat(Object.getOwnPropertyNames(proto))) {
    if (!/^create(Gain|Oscillator|BiquadFilter|BufferSource|WaveShaper|Delay|StereoPanner|ConstantSource|DynamicsCompressor|Convolver|Panner)$/.test(k)) continue;
    const f = (ctx as unknown as Record<string, (...a: unknown[]) => unknown>)[k].bind(ctx);
    (ctx as unknown as Record<string, unknown>)[k] = (...a: unknown[]) => { n++; return f(...a); };
  }
  const inst = instrumentFor({ preset });
  await inst.prepare(ctx, [pitch]);
  const before = n;
  const dest = ctx.createGain(); dest.connect(ctx.destination);
  inst.play(dest, .1, pitch, 100, .5);
  const c = { nodes: n - before - 0, tail: 1 };
  cost.set(preset, c);
  return c;
}

const DIR = 'src/data/songs', want = process.argv.slice(2);
const rows: [string, number, number, number, number][] = [];
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.json'))) {
  const song = prepareSong(JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf-8')) as SongData);
  if (want.length && !want.includes(song.data.id)) continue;
  const ev: [number, number][] = [];   // [time, +nodes / -nodes]
  const allV: { s: number; end: number; n: number }[] = [];
  const starts: number[] = [];
  const per: string[] = [];
  for (const p of song.parts) {
    if (p.audio || !p.n) continue;
    const c = await costOf(p.data.preset, p.pitch[0]);
    per.push(`${p.data.preset}:${c.nodes}`);
    if (want.length) {
      // this part's busiest moment: voices sounding at once (a note and a second of release)
      const e: [number, number][] = [];
      let sum = 0;
      for (let i = 0; i < p.n; i++) { e.push([p.start[i], 1], [p.start[i] + p.dur[i] + .8, -1]); sum += p.dur[i]; }
      e.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let v = 0, pk = 0; for (const [, d] of e) { v += d; pk = Math.max(pk, v); }
      console.log(`   ${p.data.id.padEnd(9)} ${p.data.preset.padEnd(9)} notes ${String(p.n).padStart(5)}  per s ${(p.n / song.duration).toFixed(1).padStart(5)}  mean dur ${(sum / p.n).toFixed(2)}  peak voices ${pk}  peak nodes ${pk * c.nodes}`);
    }
    for (let i = 0; i < p.n; i++) {
      // a voice lives through its note and its release (about a second)
      ev.push([p.start[i], c.nodes], [p.start[i] + p.dur[i] + .8, -c.nodes]);
      starts.push(p.start[i]);
    }
  }
  // the same song with a voice limit: a pitch struck again takes over its own voice, and past CAP voices in a part
  // the one closest to its end gives way (both within 60 ms)
  const CAP = Number(process.env.CAP || 0);
  if (CAP) {
    ev.length = 0;
    for (const p of song.parts) {
      if (p.audio || !p.n) continue;
      const c = cost.get(p.data.preset)!;
      const act: { pitch: number; end: number }[] = [];
      for (let i = 0; i < p.n; i++) {
        const t = p.start[i];
        for (let k = act.length - 1; k >= 0; k--) if (act[k].end <= t) act.splice(k, 1);
        if (!p.drums) {
          const same = act.findIndex(a => a.pitch === p.pitch[i]);
          if (same >= 0) { act[same].end = t + .06; act.splice(same, 1); }
          if (act.length >= CAP) { act.sort((a, b) => a.end - b.end); act[0].end = t + .06; act.shift(); }
        }
        const v = { pitch: p.pitch[i], end: t + p.dur[i] + .8 };
        act.push(v);
        (v as unknown as { s: number }).s = t;
        ev.push([t, c.nodes]);
        // the end is settled once the voice is done; recorded below through the object
        (v as unknown as { n: number }).n = c.nodes;
        allV.push(v as unknown as { s: number; end: number; n: number });
      }
    }
    for (const v of allV) ev.push([v.end, -v.n]);
  }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let live = 0, peak = 0;
  for (const [, d] of ev) { live += d; peak = Math.max(peak, live); }
  starts.sort((a, b) => a - b);
  // the most notes starting within one 25 ms scheduling tick
  let burst = 0;
  for (let i = 0, j = 0; i < starts.length; i++) { while (starts[i] - starts[j] > .025) j++; burst = Math.max(burst, i - j + 1); }
  rows.push([song.data.id, starts.length, burst, peak, Math.round(starts.length / song.duration)]);
  console.log(`${song.data.id.padEnd(12)} notes ${String(starts.length).padStart(5)}  notes/s ${String(Math.round(starts.length / song.duration)).padStart(3)}  most at once ${String(burst).padStart(3)}  live nodes peak ${String(peak).padStart(5)}   ${per.join(' ')}`);
}
