/* picks the built-in "Ourtone Originals": for each style, many seeds are generated and scored on the melody
   (mostly stepwise, few big leaps, chord tones on strong beats, motifs that return, a singable range and pace).
   run: node tests/out/originals.js            lists the best seeds per style
        node tests/out/originals.js --write style:seed ...   writes those songs into the library */
import fs from 'node:fs';
import { generate } from '../src/lib/gen/generate';
import { STYLES, STYLE_ORDER, type StyleId } from '../src/lib/gen/styles';
import { prepareSong } from '../src/lib/music/song';
import type { SongData } from '../src/lib/music/types';

const notesOf = (flat: number[]) => { const out: { t: number; d: number; p: number; v: number }[] = []; for (let i = 0; i < flat.length; i += 4) out.push({ t: flat[i], d: flat[i + 1], p: flat[i + 2], v: flat[i + 3] }); return out; };
function score(s: SongData) {
  const BAR = s.ppq * 4, mel = notesOf(s.parts.find(p => p.role === 'melody')!.notes), chords = notesOf(s.parts.find(p => p.name.en === 'Chords')!.notes);
  let steps = 0, small = 0, leaps = 0, strong = 0, tone = 0;
  const pcsAt = (t: number) => { const bar = Math.floor(t / BAR) * BAR, set = new Set<number>(); for (const n of chords) if (n.t < bar + BAR && n.t + n.d > bar + 60 && n.t >= bar - BAR / 4) set.add(n.p % 12); return set; };
  mel.forEach((n, i) => {
    const pos = ((n.t % (BAR / 2)) + BAR / 2) % (BAR / 2);
    if (pos < 40 || pos > BAR / 2 - 40) { strong++; const pc = pcsAt(n.t); if (!pc.size || pc.has(n.p % 12)) tone++; }
    if (i) { const d = Math.abs(n.p - mel[i - 1].p); steps++; if (d <= 2) small++; if (d >= 7) leaps++; }
  });
  const units = new Map<string, number>(), by = new Map<number, number[]>();
  for (const n of mel) { const u = Math.floor(n.t / (BAR * 2)); if (!by.has(u)) by.set(u, []); by.get(u)!.push(Math.round((n.t % (BAR * 2)) / (s.ppq / 4))); }
  for (const v of by.values()) { const k = v.join(','); units.set(k, (units.get(k) ?? 0) + 1); }
  let reps = 0, all = 0; for (const c of units.values()) { all += c; if (c > 1) reps += c; }
  const lo = Math.min(...mel.map(n => n.p)), hi = Math.max(...mel.map(n => n.p)), range = hi - lo;
  const st = small / steps, lp = leaps / steps, ct = tone / strong, mr = reps / all;
  const titleLen = Math.max([...s.title.zh].length / 7, s.title.en.length / 20);
  const sc = 40 * Math.min(1, Math.max(0, (st - .55) / .2)) - 300 * lp + 30 * ct + 20 * Math.min(1, Math.max(0, (mr - .5) / .3)) - 2 * Math.max(0, 10 - range) - 2 * Math.max(0, range - 19) - 12 * Math.max(0, titleLen - 1);
  return { sc, st, lp, ct, mr, range };
}

const write = process.argv.indexOf('--write');
if (write < 0) {
  for (const id of STYLE_ORDER) {
    const rows: { seed: number; s: SongData; m: ReturnType<typeof score> }[] = [];
    for (let k = 0; k < 80; k++) {
      const seed = (k * 2654435761 + 12345) >>> 0 % 2176782336;
      const s = generate({ style: id, seed, length: 'full' }, 'x');
      rows.push({ seed, s, m: score(s) });
    }
    rows.sort((a, b) => b.m.sc - a.m.sc);
    console.log(id);
    for (const r of rows.slice(0, 8)) console.log(`  ${String(r.seed).padStart(10)}  ${r.m.sc.toFixed(1).padStart(6)}  steps ${(r.m.st * 100).toFixed(0)}% leaps ${(r.m.lp * 100).toFixed(1)}% tones ${(r.m.ct * 100).toFixed(0)}% motifs ${(r.m.mr * 100).toFixed(0)}% range ${r.m.range}  key ${r.s.key.tonic}${r.s.key.mode === 'major' ? '' : 'm'} ${r.s.tempos[0][1]} bpm  "${r.s.title.zh} / ${r.s.title.en}"  ${r.s.parts.map(p => p.preset).join(',')}`);
  }
} else {
  const lib = JSON.parse(fs.readFileSync('src/data/library.json', 'utf-8')) as { id: string }[];
  const keep = lib.filter(x => !x.id.startsWith('ut-'));
  for (const arg of process.argv.slice(write + 1)) {
    const [style, seedS, zh, en] = arg.split(':');
    const id = `ut-${style}`, s = generate({ style: style as StyleId, seed: +seedS, length: 'full' }, id);
    delete s.user;
    s.artist = { zh: 'Ourtone 原创', en: 'Ourtone Originals' };
    if (zh && en) { s.title = { zh, en }; }
    s.latin = s.title.en;
    fs.writeFileSync(`src/data/songs/${id}.json`, JSON.stringify(s));
    const song = prepareSong(s);
    keep.push({ id, title: s.title, latin: s.latin, artist: s.artist, key: s.key, meter: [4, 4], bpm: Math.round(s.tempos[0][1]), duration: +song.duration.toFixed(2), parts: s.parts.length } as never);
    console.log('wrote', id, s.title, STYLES[style as StyleId].name.en);
  }
  fs.writeFileSync('src/data/library.json', JSON.stringify(keep, null, 1));
}
