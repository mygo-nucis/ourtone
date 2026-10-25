/* play mode's charts for every built-in song: a hold never runs into the next note to play, and lanes never get a
   note while that lane is still held (nor, with arpeggios not simplified, a note within a lane's gap of the last). multi-track: every part of a song at once, and the melody with each other part (all on the six lanes, and in bands of
   lanes), never puts a note on a lane still held, two notes a step apart (too close to play), or four keys at once. a part's
   passages marked for holds hold every note written long enough there, and none elsewhere. run: vite build -c vite.test.config.ts && node tests/out/chart.js */
import fs from 'node:fs';
import { prepareSong } from '../src/lib/music/song';
import { buildChart, buildCharts, lanePlan, type ChartNote } from '../src/rooms/stage/chart';
import type { SongData } from '../src/lib/music/types';

const DIR = 'src/data/songs';
let bad = 0;
const oneHand = [0, 0];
let total = 0, totalShared = 0, mins = 0, turns = 0, shortest = Infinity;
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.json'))) {
  const song = prepareSong(JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf-8')) as SongData);
  const rows: string[] = [];
  for (const p of song.parts) {
    if (p.audio || !p.n) continue;
    const { notes } = buildChart(p);
    let holds = 0, cut = 0, clash = 0, clashBefore = 0;
    const laneUntil = new Float64Array(6).fill(-1), laneUntilEnd = new Float64Array(6).fill(-1);
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.long) holds++;
      if (n.hold < n.end - 1e-6) cut++;
      if (n.t < laneUntil[n.lane]) clash++;
      if (n.t < laneUntilEnd[n.lane] && n.end - n.t >= .42) clashBefore++;
      const later = notes.find((m, j) => j > i && m.t > n.t + .03);
      if (later && n.hold > later.t - .15 + 1e-6 && n.hold > n.t) { bad++; console.log('  hold runs into the next note', f, p.data.id, n.t); }
      if (n.long) laneUntil[n.lane] = n.hold;
      if (!p.drums) laneUntilEnd[n.lane] = n.end;
    }
    bad += clash;
    // arpeggio simplification off: every onset charted, still never two notes on a lane within its gap, nor under a hold
    const all = buildChart(p, undefined, false).notes, lastOn = new Float64Array(6).fill(-1e9), heldTo = new Float64Array(6).fill(-1);
    let tight = 0;
    for (const n of all) {
      // (a lane's gap, less the .03 s over which notes struck together may spread)
      if (n.t - lastOn[n.lane] < .11 || n.t < heldTo[n.lane]) tight++;
      lastOn[n.lane] = n.t;
      if (n.long) heldTo[n.lane] = n.hold;
    }
    bad += tight;
    // passages marked for holds (a part's `holds`): each note written a hold's length is held there, and only there
    let marked = 0;
    if (p.data.holds) for (const n of notes) {
      const k = p.tick[n.notes[0]], inside = p.data.holds.some(([a, b]) => k >= a && k < b);
      if (n.held) marked++;
      if (n.held && !inside) { bad++; console.log('  held outside its passages', f, p.data.id, n.t); }
      if (inside && n.end - n.t >= .42 && !n.long) { bad++; console.log('  not held in a marked passage', f, p.data.id, n.t.toFixed(2)); }
      if (inside && n.end - n.t < .42 && n.long) { bad++; console.log('  a short note held', f, p.data.id, n.t.toFixed(2)); }
    }
    if (marked) rows.push(`${p.data.id}: ${marked} held in marked passages`);
    rows.push(`${p.data.id}:${notes.length} notes (${all.length} unsimplified${tight ? `, ${tight} TIGHT` : ''}), ${holds} holds, ${cut} shortened, same-lane clashes ${clashBefore} → ${clash}`);
  }
  // several parts at once
  const P = song.parts.filter(p => !p.audio && p.n), mel = P.find(p => p.data.role === 'melody') ?? P[0];
  const combos = [P, ...(P.length > 2 ? P.filter(p => p !== mel).map(p => [mel, p]) : [])];
  const multi: string[] = [];
  for (const c of combos) for (const split of [true, false]) {
    if (c.length < 2) continue;
    const { notes } = buildCharts(c, 3, true, split), held = new Float64Array(6).fill(-1);
    let flam = 0, crowd = 0, clash = 0;
    for (let i = 0; i < notes.length; i++) {
      const n: ChartNote = notes[i];
      if (n.t < held[n.lane]) clash++;
      if (n.long) held[n.lane] = n.hold;
      let tog = 1;
      for (let j = i + 1; j < notes.length && notes[j].t - n.t < .1; j++) { if (notes[j].t - n.t > .03) flam++; else tog++; }
      if (tog > 3) crowd++;
    }
    bad += flam + crowd + clash;
    if (!split) {
      totalShared += notes.length;
      if (flam + crowd + clash || c.length === P.length) multi.push(`${c.length === P.length ? 'all' : c.map(p => p.data.id).join('+')} shared: ${notes.length} notes, flams ${flam}, crowds ${crowd}, clashes ${clash}`);
      continue;
    }
    // how much of it is played with one hand: two-second spans with a few notes, all on S D F or all on J K L
    let spans = 0, one = 0;
    for (let t = notes.length ? notes[0].t : 0, k = 0; notes.length && t < notes[notes.length - 1].t; t += .5) {
      while (k < notes.length && notes[k].t < t) k++;
      const ls: number[] = [];
      for (let j = k; j < notes.length && notes[j].t < t + 2; j++) ls.push(notes[j].lane);
      if (ls.length < 3) continue;
      spans++;
      if (Math.max(...ls) <= 2 || Math.min(...ls) >= 3) one++;
    }
    oneHand[0] += one; oneHand[1] += spans; total += notes.length;
    // the bands' changes: how many, and the shortest time between two (the last bands run to the end)
    const sg = lanePlan(c, 3);
    turns += sg.length - 1; mins += (notes.length ? notes[notes.length - 1].t - notes[0].t : 0) / 60; for (let k = 1; k < sg.length - 1; k++) shortest = Math.min(shortest, sg[k + 1].t - sg[k].t);
    // a part's own hold never runs into its next note to play, where its band changes too
    for (const p of c) {
      const own = notes.filter(n => n.part === p.index);
      for (let k = 0; k < own.length; k++) {
        const later = own.find((m, j) => j > k && m.t > own[k].t + .03);
        if (later && own[k].hold > later.t - .15 + 1e-6 && own[k].hold > own[k].t) { bad++; console.log('  multi-track hold runs into its next note', f, p.data.id, own[k].t.toFixed(2)); }
      }
    }
    if (flam + crowd + clash || c.length === P.length) multi.push(`${c.length === P.length ? 'all' : c.map(p => p.data.id).join('+')}: ${notes.length} notes, flams ${flam}, crowds ${crowd}, clashes ${clash}, one hand ${spans ? Math.round(one / spans * 100) : 0}%`);
  }
  console.log(f.replace('.json', ''), '\n  ' + rows.join('\n  ') + '\n  multi-track ' + multi.join('; '));
}
console.log(`multi-track: ${totalShared} notes on shared lanes; in bands ${total} notes, one hand ${Math.round(oneHand[0] / oneHand[1] * 100)}% of the time; ${(turns / mins).toFixed(1)} band changes a minute, the shortest ${shortest.toFixed(1)} s`);
console.log(bad ? `FAIL ${bad}` : 'ok');
process.exit(bad ? 1 : 0);
