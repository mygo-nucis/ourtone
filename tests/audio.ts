/* audio tracks: a clip renders where it should (from its offset, for its length), and the range edits (split, move,
   copy, cut bars) treat clips the way they treat notes. run: node tests/out/audio.js */
import { OfflineAudioContext, AudioBuffer } from 'node-web-audio-api';
import { setRenderer } from '../src/lib/audio/voices';
import { pluck, piano } from '../src/lib/audio/dsp';
import { renderSong } from '../src/lib/audio/offline';
import { bank } from '../src/lib/audio/bank';
import { prepareSong } from '../src/lib/music/song';
import { docOf, songOf } from '../src/lib/project/doc';
import { Grid, splitAt, passagesOf, moveRange, takeRange, putAt, deleteTime } from '../src/lib/project/ops';
import type { SongData } from '../src/lib/music/types';

(globalThis as unknown as { AudioBuffer: unknown }).AudioBuffer = AudioBuffer;
setRenderer(async j => j.kind === 'pluck' ? pluck(j.sr, j.pitch, j.p) : piano(j.sr, j.pitch, j.p));
const make = (c: number, l: number, sr: number) => new OfflineAudioContext(c, l, sr) as unknown as globalThis.OfflineAudioContext;
const fails: string[] = [];
const ok = (cond: boolean, what: string) => { if (!cond) fails.push(what); console.log(`${cond ? 'ok  ' : 'FAIL'} ${what}`); };

// a second of 440 Hz whose loudness steps up every quarter second, so the offset can be heard in the render
const sr = 48000, src = new AudioBuffer({ numberOfChannels: 1, length: sr, sampleRate: sr }), d = src.getChannelData(0);
for (let i = 0; i < sr; i++) d[i] = Math.sin(2 * Math.PI * 440 * i / sr) * (.1 + .2 * Math.floor(i / (sr / 4)));
bank.put('aud-test', src as unknown as globalThis.AudioBuffer);

// 120 BPM, 480 ppq: a beat is half a second. the clip starts on beat 2 (0.5 s), plays source 0.25–0.75 s
const song: SongData = {
  v: 1, id: 't', title: { zh: 't', en: 't' }, latin: 't', artist: { zh: '', en: '' }, key: { tonic: 0, mode: 'major' }, ppq: 480,
  tempos: [[0, 120]], meters: [[0, 4, 4]], end: 1920 * 2,
  parts: [{ id: 'audio', role: 'other', name: { zh: '录音', en: 'Audio' }, inst: { zh: '音频', en: 'Audio' }, tag: { day: 'AUDIO', night: 'Vox' }, icon: 'mic', preset: 'audio', color: 0, notes: [], kind: 'audio', clips: [{ src: 'aud-test', t: 480, off: .25, dur: .5, name: 'test' }], mix: { vol: 0, pan: 0, rev: 0, dly: 0, mute: false, solo: false } }]
};
const s = prepareSong(song);
ok(Math.abs(s.duration - 1) < 1e-6, `song length counts the clip: ${s.duration.toFixed(3)} s`);
const buf = await renderSong(s, { from: 0, to: 1.5, tail: .2, make }) as unknown as AudioBuffer;
const rms = (a: number, b: number) => { const x = buf.getChannelData(0); let q = 0, n = 0; for (let i = Math.round(a * sr); i < Math.round(b * sr); i++) { q += x[i] * x[i]; n++; } return Math.sqrt(q / Math.max(1, n)); };
const before = rms(0, .49), first = rms(.52, .74), second = rms(.77, .99), after = rms(1.05, 1.19);
console.log(`   rms before ${before.toExponential(1)}  0.5–0.75 s ${first.toFixed(3)}  0.75–1 s ${second.toFixed(3)}  after ${after.toExponential(1)}`);
ok(before < 1e-4, 'silent before the clip');
ok(first > .02 && second > first * 1.3, 'the clip plays from its offset: the second quarter is the louder source quarter');
ok(after < first * .05, 'silent after the clip');

// range edits on the clip
const doc = docOf(song), g = new Grid(s.tl, doc.meta.end), ep = doc.parts[0];
splitAt(ep, 720, s.tl);   // 0.75 s
ok(ep.clips.length === 2 && Math.abs(ep.clips[0].dur - .25) < 1e-6 && Math.abs(ep.clips[1].off - .5) < 1e-6 && ep.clips[1].t === 720, `split: ${JSON.stringify(ep.clips.map(c => [c.t, +c.off.toFixed(3), +c.dur.toFixed(3)]))}`);
const runs = passagesOf(ep, g);
ok(runs.length === 2 && runs[0].a === 480 && runs[0].b === 720 && runs[1].a === 720 && runs[1].b === 960, `passages are the clips: ${JSON.stringify(runs)}`);
moveRange(ep, 720, 960, 1920);
ok(ep.clips[1].t === 2640, `move: the later piece is a bar later (${ep.clips[1].t})`);
putAt(ep, takeRange(ep, 480, 720), 3840);
ok(ep.clips.length === 3 && ep.clips[2].t === 3840 && ep.clips[2].src === 'aud-test', 'copy: a copy plays the same source');
deleteTime(doc, 0, 480);
ok(doc.parts[0].clips[0].t === 0 && doc.parts[0].clips[1].t === 2160, 'cutting bars before the clips moves them earlier');
const back = songOf(doc);
ok(back.parts[0].kind === 'audio' && back.parts[0].clips!.length === 3, 'the song keeps the audio track and its clips');
if (fails.length) { console.log(`${fails.length} FAILED`); process.exitCode = 1; } else console.log('all audio');
