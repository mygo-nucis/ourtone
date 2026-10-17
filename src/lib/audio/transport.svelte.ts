import { engine, setTrim, setMasterFader, setEcho } from './engine';
import { bank } from './bank';
import { instrumentFor } from './presets';
import { dropBank, Poly, VOICES } from './voices';
import { makeStrip, applyMix, applyFx, audibility, mixOf, type Strip } from './strip';
import type { Voice } from './voices';
import { preparePart, songDuration, type Part, type Song } from '../music/song';
import type { Mix, PartData, SongData } from '../music/types';
import { lowerBound } from '../util';

/* plays a song: one strip per part (see strip.ts), notes scheduled a little ahead by a worker-driven clock.
   a session is one playthrough of a part: voices -> gate -> the part's strip, faded out as a whole on stop. */
interface Session { gate: GainNode; input: AudioNode; srcs: AudioBufferSourceNode[]; poly: Poly }
interface Loop { a: number; b: number }

/* notes go into the graph AHEAD seconds before they sound, from a 25 ms tick. the margin is what a busy main thread
   may stall for (play mode drawing on a phone, a garbage collection) before notes would start late */
const AHEAD = .3, TICK = 25;

function tickWorker(cb: () => void) {
  try {
    const src = `let t=null;onmessage=e=>{if(e.data==='go'&&!t)t=setInterval(()=>postMessage(0),${TICK});if(e.data==='stop'){clearInterval(t);t=null}}`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = cb;
    return { go: () => w.postMessage('go'), stop: () => w.postMessage('stop') };
  } catch {
    let t: ReturnType<typeof setInterval> | null = null;
    return { go: () => { if (!t) t = setInterval(cb, TICK); }, stop: () => { if (t) clearInterval(t); t = null; } };
  }
}

export { mixOf };

class Transport {
  song = $state.raw<Song | null>(null);
  /** bumps when a different song is loaded (not when the same song is edited) */
  gen = $state(0);
  playing = $state(false);
  /** 0..1 while the song's instruments render their buffers */
  ready = $state(1);
  /** coarse song time for text displays */
  clock = $state(0);
  /** parts that the band leaves out (the one you play) */
  muted = $state.raw<ReadonlySet<number>>(new Set());
  /** repeat a stretch of the song (seconds) */
  loop = $state.raw<Loop | null>(null);
  loopOn = $state(false);
  /** the stage plays the song round and round: a beat after its last note ends, it starts again (the studio stops) */
  repeat = false;
  /** play mode plays the song once: a breath after its end it stops and goes back to the start (and calls onEnd) */
  once = false;
  /** while recording, playback runs on past the song's end instead of stopping and going back to the start: the take
      is what makes the song longer */
  rolling = false;

  private strips: Strip[] = [];
  /** each strip's input for live notes, behind the instrument's own chain (amp, cabinet) */
  private live: AudioNode[] = [];
  private sessions: (Session | null)[] = [];
  private cursor: number[] = [];
  private startCtx = 0;
  private startSong = 0;
  /** the mapping before the last loop jump, until the jump is heard */
  private prevMap: { ctx: number; song: number; until: number } | null = null;
  private scheduledTo = 0;
  /** audio tracks: where this pass began (play, seek or a loop's restart), and which clips it has started */
  private passFrom = 0;
  private clipDone: Set<number>[] = [];
  private pausedAt = 0;
  private prep: Promise<void> = Promise.resolve();
  private loadId = 0;
  private timer = tickWorker(() => this.tick());
  private clockFrame = 0;
  onEnd: (() => void) | null = null;
  /** the part you play along with keeps sounding quietly as a guide */
  private guide = -1;
  private guideLevel = .2;

  /** where in the song an audio-clock time fell (for recordings), as the transport mapped it then */
  songTimeAt(ctxTime: number) {
    const pm = this.prevMap;
    if (pm && ctxTime < pm.until) return pm.song + (ctxTime - pm.ctx);
    return this.startSong + (ctxTime - this.startCtx);
  }
  /** song time that is being heard right now */
  now() {
    if (!this.playing || !engine.ctx) return this.pausedAt;
    const h = engine.heardTime(), pm = this.prevMap;
    if (pm && h < pm.until) return Math.max(0, pm.song + (h - pm.ctx));
    return Math.max(0, this.startSong + (h - this.startCtx));
  }

  /* what the picture shows. play schedules the sound a moment ahead (.06 s) and it is heard later still (the output's
     latency, up to a quarter second on a phone), so for that long now() reads a little before where play was pressed:
     drawn as it is, the notes would jump back and then set off. the picture instead sets off from where play was
     pressed at once, a little slower than the music at first, and meets now() within a second or so (eased, so it never
     stops or turns back). judging and the band keep to now(). */
  private ease: { at: number; lead: number; len: number } | null = null;
  shown() {
    const t = this.now(), e = this.ease;
    if (!this.playing || !e) return t;
    const s = (performance.now() - e.at) / e.len;
    if (s >= 1) { this.ease = null; return t; }
    return t + e.lead * (1 - s) * (1 - s);
  }

  load(song: Song) {
    this.stopSessions();
    this.playing = false;
    this.timer.stop();
    this.pausedAt = 0; this.clock = 0;
    this.muted = new Set();
    this.guide = -1;
    this.loop = null; this.loopOn = false;
    this.rolling = false;
    this.install(song);
    this.gen++;
  }

  /** the same song after an edit that moves many notes at once (tempo, parts added or removed): keeps the place and playback */
  reload(song: Song) {
    const old = this.song, wasPlaying = this.playing;
    const at = old ? song.tl.sec(old.tl.tick(this.now())) : 0;
    if (wasPlaying) { this.playing = false; this.timer.stop(); this.stopSessions(); }
    this.install(song);
    this.pausedAt = Math.min(at, song.duration); this.clock = this.pausedAt;
    if (this.muted.size) this.muted = new Set([...this.muted].filter(i => i < song.parts.length));
    if (wasPlaying) void this.play(this.pausedAt);
  }

  private install(song: Song) {
    this.song = song;
    const ctx = engine.get(), bus = engine.bus!;
    setTrim(bus, song.data.gain);
    setMasterFader(bus, song.data.master ?? 0);
    setEcho(bus, song.data.tempos[0]?.[1] ?? 120);
    this.strips.forEach(s => this.dropStrip(s));
    this.strips = song.parts.map(p => this.buildStrip(p));
    this.live = this.strips.map((s, i) => this.liveInput(s, song.parts[i]));
    this.applyAudibility();
    this.sessions = song.parts.map(() => null);
    this.cursor = song.parts.map(() => 0);
    this.prepareAll(song.parts);
  }
  private buildStrip(p: Part) {
    const st = makeStrip(engine.get(), engine.bus!, p.data.preset, true);
    applyMix(st, mixOf(p), true);
    applyFx(st, p.data);
    return st;
  }
  private liveInput(s: Strip, p: Part) { if (p.audio) return s.input; const inst = instrumentFor(p.data); return inst.chain ? inst.chain(s.input) : s.input; }
  private dropStrip(s: Strip) { try { s.gate.disconnect(); } catch { /* already gone */ } }
  private prepareAll(parts: Part[]) {
    const ctx = engine.get(), id = ++this.loadId;
    const jobs = parts.map(p => p.audio ? bank.loadAll(p.clips.map(c => c.src)).then(() => undefined) : instrumentFor(p.data).prepare(ctx, p.pitch));
    let done = 0;
    this.ready = 0;
    jobs.forEach(j => j.then(() => { if (id === this.loadId) this.ready = ++done / jobs.length; }));
    this.prep = Promise.all(jobs).then(() => { if (id === this.loadId) this.ready = 1; });
  }

  /** replace one part's notes (and anything else about it) while playing */
  updatePart(i: number, data: PartData) {
    const song = this.song;
    if (!song || !song.parts[i]) return;
    const old = song.parts[i], part = preparePart(data, i, song.tl);
    const parts = song.parts.slice(); parts[i] = part;
    this.song = { data: { ...song.data, parts: song.data.parts.map((p, k) => k === i ? data : p) }, tl: song.tl, parts, duration: songDuration(parts) };
    if (old.data.preset !== data.preset) this.swapStrip(i);
    else { applyMix(this.strips[i], mixOf(part), this.audible(i)); applyFx(this.strips[i], data); }
    if (part.audio) {
      // new or moved clips: the track starts again from where the music is
      void bank.loadAll(part.clips.map(c => c.src));
      if (this.playing) { const s = this.sessions[i]; if (s) this.fade(s); this.sessions[i] = this.muted.has(i) ? null : this.session(i); this.clipDone[i] = new Set(); }
      return;
    }
    void instrumentFor(data).prepare(engine.get(), part.pitch);
    if (this.playing) this.cursor[i] = lowerBound(part.start, this.scheduledTo - 1e-6);
  }
  /** change a part's settings without touching its notes (mixer, effects, name, colour, instrument) */
  setPart(i: number, patch: Partial<PartData>) {
    const song = this.song;
    if (!song || !song.parts[i]) return;
    const old = song.parts[i], data = { ...old.data, ...patch };
    const part: Part = { ...old, data };
    const parts = song.parts.slice(); parts[i] = part;
    this.song = { data: { ...song.data, parts: song.data.parts.map((p, k) => k === i ? data : p) }, tl: song.tl, parts, duration: song.duration };
    if (patch.preset !== undefined && patch.preset !== old.data.preset) { this.swapStrip(i); void instrumentFor(data).prepare(engine.get(), part.pitch); this.forget(old.data.patch?.id); return; }
    if ('patch' in patch && patch.patch?.id !== old.data.patch?.id) { this.swapSound(i); this.forget(old.data.patch?.id); }
    if ('mix' in patch) this.applyAudibility();
    if ('fx' in patch || 'macro' in patch) applyFx(this.strips[i], data);
  }
  /** song-level settings that do not move notes in time (title, key, master fader, trim) */
  setSongMeta(patch: Partial<SongData>) {
    const song = this.song;
    if (!song) return;
    const { parts: _p, tempos: _t, meters: _m, ...rest } = patch;
    this.song = { ...song, data: { ...song.data, ...rest } };
    if (engine.bus && rest.master !== undefined) setMasterFader(engine.bus, rest.master);
    if (engine.bus && rest.gain !== undefined) setTrim(engine.bus, rest.gain);
  }
  mixOf(i: number): Mix { const p = this.song!.parts[i]; return mixOf(p); }
  /** the strip's analysers, for the mixer's meters */
  meters() { return { parts: this.strips.map(s => s.meter), master: engine.bus?.meter }; }

  /** the studio listens through its mutes and solos; everywhere else (the stage) every part plays */
  private monitor = false;
  setMonitor(on: boolean) {
    if (this.monitor === on) return;
    this.monitor = on;
    this.applyAudibility();
  }
  private audibleAll(): boolean[] {
    const song = this.song!;
    return this.monitor ? audibility(song.parts.map(mixOf)) : song.parts.map(() => true);
  }
  private audible(i: number) { return this.audibleAll()[i]; }
  private applyAudibility() {
    const song = this.song;
    if (!song) return;
    const aud = this.audibleAll();
    song.parts.forEach((p, i) => applyMix(this.strips[i], mixOf(p), aud[i]));
  }
  private swapStrip(i: number) {
    const song = this.song!, p = song.parts[i];
    const old = this.strips[i], s = this.sessions[i];
    if (s) { this.fade(s); this.sessions[i] = null; }
    this.strips[i] = this.buildStrip(p);
    this.live[i] = this.liveInput(this.strips[i], p);
    applyMix(this.strips[i], mixOf(p), this.audible(i));
    setTimeout(() => this.dropStrip(old), 300);
    if (this.playing && !this.muted.has(i)) this.sessions[i] = this.session(i);
  }

  /** a part's sound changed: new notes use it at once; the playthrough restarts so a changed amp chain takes over */
  private swapSound(i: number) {
    const song = this.song!, p = song.parts[i], s = this.sessions[i];
    if (p.audio) return;
    this.live[i] = this.liveInput(this.strips[i], p);
    void instrumentFor(p.data).prepare(engine.get(), p.pitch);
    if (s) { this.fade(s); this.sessions[i] = this.playing && !this.muted.has(i) ? this.session(i) : null; }
  }
  /** drop an edited sound's rendered buffers once no part plays it */
  private forget(id: string | undefined) {
    if (!id || !id.includes('~')) return;
    if (this.song?.parts.some(p => p.data.patch?.id === id)) return;
    setTimeout(() => dropBank(id), 4000);
  }

  /** the stretch that repeats: on the stage the whole song and a breath after it (a loop set in the studio stays
      the studio's), in the studio its loop when that is on */
  private span(): Loop | null {
    const song = this.song;
    if (this.once) return null;
    if (!this.repeat) return this.loopOn ? this.loop : null;
    if (!song || song.duration <= 0) return null;
    const bpm = song.data.tempos[song.data.tempos.length - 1]?.[1] ?? 120;
    return { a: 0, b: song.duration + Math.min(1.2, 60 / bpm) };
  }
  setLoop(loop: Loop | null, on = this.loopOn) {
    this.loop = loop && loop.b - loop.a > .05 ? loop : null;
    this.loopOn = on && !!this.loop;
  }

  async play(from?: number) {
    if (!this.song) return;
    const gen = this.gen;
    await engine.unlock();
    if (this.ready < 1) await Promise.race([this.prep, new Promise(r => setTimeout(r, 2500))]);
    if (gen !== this.gen || !this.song) return;
    const cur = this.song;
    const ctx = engine.get();
    const t = from ?? this.pausedAt;
    this.startSong = t >= cur.duration && !this.rolling ? 0 : t;
    this.startCtx = ctx.currentTime + .06;
    this.prevMap = null;
    // (as long again as the lead at least four times over: the picture never runs at less than half speed)
    const lead = Math.min(.5, Math.max(0, this.startCtx - engine.heardTime()));
    this.ease = lead > .005 ? { at: performance.now(), lead, len: Math.max(600, 4000 * lead) } : null;
    this.scheduledTo = this.startSong;
    this.cursor = cur.parts.map(p => lowerBound(p.start, this.startSong - 1e-6));
    this.passFrom = this.startSong;
    this.clipDone = cur.parts.map(() => new Set());
    this.newSessions();
    this.playing = true;
    this.timer.go();
    this.tick();
    this.clockLoop();
  }
  pause() {
    if (!this.playing) return;
    this.pausedAt = this.now();
    this.clock = this.pausedAt;
    this.playing = false;
    this.timer.stop();
    this.stopSessions();
  }
  toggle() { if (this.playing) this.pause(); else void this.play(); }
  /** `end`: how far the cursor may go (the studio's drawn bars, past the last note, so a take can start there) */
  seek(t: number, end?: number) {
    const song = this.song;
    if (!song) return;
    t = Math.max(0, Math.min(Math.max(song.duration, end ?? 0), t));
    if (this.playing) { this.stopSessions(); void this.play(t); } else { this.pausedAt = t; this.clock = t; }
  }
  setMuted(parts: Iterable<number>) {
    const next = new Set(parts);
    if (this.playing) this.sessions.forEach((s, i) => { if (next.has(i) && !this.muted.has(i) && s) { this.fade(s); this.sessions[i] = null; } if (!next.has(i) && this.muted.has(i)) this.sessions[i] = this.session(i); });
    this.muted = next;
  }

  setGuide(part: number | null) {
    this.guide = part ?? -1;
    const ctx = engine.ctx;
    if (ctx) this.sessions.forEach((s, i) => s && s.gate.gain.setTargetAtTime(i === this.guide ? this.guideLevel : 1, ctx.currentTime, .03));
  }

  /** play a few notes on a part's instrument from now, outside the song (previews); times in seconds */
  preview(part: number, notes: { at: number; dur: number; p: number; v: number }[]) {
    const song = this.song, live = this.live[part];
    if (!song || !live || song.parts[part].audio) return;
    const ctx = engine.get(), inst = instrumentFor(song.parts[part].data);
    void inst.prepare(ctx, notes.map(n => n.p)).then(() => { const t0 = ctx.currentTime + .05; for (const n of notes) inst.play(live, t0 + n.at, n.p, n.v, n.dur); });
  }
  /** play mode: the notes the player strikes, by part, are left out of the band's playing */
  private skips: ReadonlyMap<number, ReadonlySet<number>> = new Map();
  /** how far into the song notes are already in the audio graph (what is skipped or not from now on starts there) */
  get scheduled() { return this.playing ? this.scheduledTo : this.now(); }
  setSkip(skips: ReadonlyMap<number, ReadonlySet<number>> | null) { this.skips = skips ?? new Map(); }
  /** a note struck now (or `after` seconds from now) on a part's instrument, for its written length (play mode: a hit
      sounds exactly as written) */
  strike(part: number, pitch: number, vel: number, dur: number, after = 0) {
    const song = this.song, live = this.live[part];
    if (!song || !live || song.parts[part].audio) return;
    const ctx = engine.get();
    instrumentFor(song.parts[part].data).play(live, ctx.currentTime + .005 + after, pitch, vel, Math.max(.06, dur));
  }
  /** a soft, pitchless tap: a press with nothing to play. a few milliseconds of filtered noise, no pitch to sweep */
  private tapNoise: AudioBuffer | null = null;
  click() {
    const ctx = engine.ctx, bus = engine.bus;
    if (!ctx || !bus) return;
    if (!this.tapNoise || this.tapNoise.sampleRate !== ctx.sampleRate) {
      const n = Math.round(ctx.sampleRate * .03), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * .0045));
      this.tapNoise = b;
    }
    const t = ctx.currentTime + .005, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.tapNoise;
    bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = .8;
    lp.type = 'lowpass'; lp.frequency.value = 6000;
    g.gain.value = .2;
    src.connect(bp).connect(lp).connect(g).connect(bus.dry); src.start(t);
  }
  /** render a part's sound for these pitches (Studio's keyboards: ahead of time, and before a live note, so a key's
      first press sounds, a moment late at worst, instead of not at all) */
  prepareNotes(part: number, pitches: Iterable<number>): Promise<void> {
    const p = this.song?.parts[part];
    if (!p || p.audio) return Promise.resolve();
    return instrumentFor(p.data).prepare(engine.get(), pitches);
  }
  /** a live note on a part's instrument (jam, audition); returns the voice to release */
  noteOn(part: number, pitch: number, vel = 100): Voice | null {
    const song = this.song, live = this.live[part];
    // an audio track has no instrument: the keyboard is silent on it
    if (!song || !live || song.parts[part].audio) return null;
    const ctx = engine.get();
    return instrumentFor(song.parts[part].data).start(live, ctx.currentTime + .005, pitch, vel);
  }

  private session(i: number): Session {
    const ctx = engine.get(), strip = this.strips[i];
    const gate = ctx.createGain();
    gate.gain.value = i === this.guide ? this.guideLevel : 1;
    gate.connect(strip.input);
    const p = this.song!.parts[i];
    if (p.audio) return { gate, input: gate, srcs: [], poly: new Poly(VOICES) };
    const inst = instrumentFor(p.data);
    return { gate, input: inst.chain ? inst.chain(gate) : gate, srcs: [], poly: new Poly(VOICES) };
  }
  private newSessions() { this.stopSessions(); this.sessions = this.song!.parts.map((_, i) => this.muted.has(i) ? null : this.session(i)); }
  private fade(s: Session) {
    const ctx = engine.ctx!;
    s.gate.gain.setTargetAtTime(0, ctx.currentTime, .015);
    for (const src of s.srcs) { try { src.stop(ctx.currentTime + .12); } catch { /* not started or already stopped */ } }
    setTimeout(() => { try { s.gate.disconnect(); } catch { /* gone */ } }, 250);
  }
  private stopSessions() { this.sessions.forEach(s => s && this.fade(s)); this.sessions = this.sessions.map(() => null); }

  private schedule(until: number) {
    const song = this.song!, ctx = engine.ctx!;
    const L = this.span(), songNow = this.startSong + (ctx.currentTime - this.startCtx);
    song.parts.forEach((p, i) => {
      const s = this.sessions[i];
      if (p.audio) {
        // clips start in the window ahead; one already sounding when the pass began (or loaded late) joins partway in
        const done = this.clipDone[i] ?? (this.clipDone[i] = new Set());
        if (!s) return;
        p.clips.forEach((c, k) => {
          if (done.has(k)) return;
          const end = Math.min(c.start + c.dur, L && this.startSong < L.b ? L.b : Infinity);
          if (c.start >= until || end <= this.passFrom) return;
          const buf = bank.get(c.src);
          if (!buf) return;
          const at = Math.max(c.start, this.passFrom, songNow), len = end - at;
          done.add(k);
          if (len <= .01) return;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(s.input);
          src.start(this.startCtx + (at - this.startSong), c.off + (at - c.start), len);
          s.srcs.push(src);
          src.onended = () => { const j = s.srcs.indexOf(src); if (j >= 0) s.srcs.splice(j, 1); };
        });
        return;
      }
      let c = this.cursor[i] ?? 0;
      if (!s) { while (c < p.n && p.start[c] < until) c++; this.cursor[i] = c; return; }
      const inst = instrumentFor(p.data), skip = this.skips.get(i);
      while (c < p.n && p.start[c] < until) {
        const when = this.startCtx + (p.start[c] - this.startSong);
        if (when >= ctx.currentTime - .02 && !skip?.has(c)) {
          const at = Math.max(when, ctx.currentTime);
          // drum hits are short and play as they are; every other note takes a voice of the part's few
          if (p.drums) inst.play(s.input, at, p.pitch[c], p.vel[c], p.dur[c]);
          else { s.poly.room(at, p.pitch[c]); const v = inst.start(s.input, at, p.pitch[c], p.vel[c], p.dur[c]); v.release(at + p.dur[c]); s.poly.add(v, p.pitch[c], at); }
        }
        c++;
      }
      this.cursor[i] = c;
    });
    this.scheduledTo = until;
  }
  private tick() {
    const song = this.song, ctx = engine.ctx;
    if (!this.playing || !song || !ctx) return;
    const songNow = this.startSong + (ctx.currentTime - this.startCtx);
    let until = songNow + AHEAD;
    const L = this.span();
    if (L && this.startSong < L.b && until >= L.b) {
      // finish the pass, then start the loop again exactly where the pass ends
      this.schedule(L.b);
      const at = this.startCtx + (L.b - this.startSong);
      this.prevMap = { ctx: this.startCtx, song: this.startSong, until: at };
      this.startCtx = at; this.startSong = L.a;
      this.cursor = song.parts.map(p => lowerBound(p.start, L.a - 1e-6));
      this.passFrom = L.a;
      this.clipDone = song.parts.map(() => new Set());
      until = L.a + (until - L.b);
    }
    this.schedule(until);
    if (!L && !this.rolling && songNow > song.duration + 1.2) {
      this.pause();
      this.pausedAt = 0; this.clock = 0;
      this.onEnd?.();
    }
  }
  private clockLoop() {
    cancelAnimationFrame(this.clockFrame);
    let last = -1;
    const f = () => {
      if (!this.playing) return;
      const t = this.now();
      if (Math.floor(t * 4) !== last) { last = Math.floor(t * 4); this.clock = t; }
      this.clockFrame = requestAnimationFrame(f);
    };
    this.clockFrame = requestAnimationFrame(f);
  }
}

export const transport = new Transport();
