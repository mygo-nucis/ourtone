import { studio } from '../../lib/project/studio.svelte';
import { transport } from '../../lib/audio/transport.svelte';
import { patchOf, preset } from '../../lib/audio/presets';
import { patchInstrument } from '../../lib/audio/ut2';
import { engine } from '../../lib/audio/engine';
import { effective, fxOf, macrosOf } from '../../lib/audio/fx';
import { patchKey } from '../../lib/audio/patch';
import type { Patch, Osc } from '../../lib/audio/patch';
import { listSounds, saveSound, deleteSound, type SavedSound } from '../../lib/state/db';
import type { StringKey } from '../../lib/i18n/strings';
import { autoTrim, phraseOf } from '../../lib/audio/level';
import { randomize, mutate, randomFx, randomMacros } from '../../lib/audio/chance';
import { rng } from '../../lib/util';
import { isDrums, isAudio } from '../../lib/project/studio.svelte';

/* the sound view's working state: the focused part's patch, auto-level, random and tweak, and saved sounds */
export function current(): Patch | null {
  void studio.rev;
  const m = studio.doc?.parts[studio.part]?.meta;
  return m ? patchOf(m) : null;
}
let seq = 0;
export function edit(fn: (p: Patch) => void, key?: string, label: StringKey = 'opSound') {
  const k = key ?? 'e' + ++seq;
  studio.setPatch(label, studio.part, fn, k);
  level.schedule(studio.part, k);
}

/* auto-level: once an edit settles, trim the sound back to its preset's loudness, inside the same undo step */
class Level {
  busy = $state(false);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private run = 0;
  schedule(part: number, key: string) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.go(part, key), 320);
  }
  async go(part: number, key: string) {
    const m = studio.doc?.parts[part]?.meta, sp = transport.song?.parts[part];
    if (!m?.patch || m.patch.manual || !sp) return;
    const id = ++this.run, edited = m.patch;
    this.busy = true;
    try {
      const ps = Array.from(sp.pitch).sort((a, b) => a - b), around = ps.length ? ps[Math.floor(ps.length / 2)] : 60;
      const trim = await autoTrim(edited, preset(m.preset).patch, Math.max(36, Math.min(84, around)), effective(fxOf(m.fx), macrosOf(m.macro)), phraseOf(sp));
      const now = studio.doc?.parts[part]?.meta;
      if (id !== this.run || !now?.patch || now.patch.id !== edited.id) return;
      if (Math.abs((now.patch.trim ?? 0) - trim) >= .5) studio.setPatch('opSound', part, p => { p.trim = trim; }, key);
    } catch (e) { console.warn(e); }
    finally { if (id === this.run) this.busy = false; }
  }
}
export const level = new Level();
/** the first oscillator, created when a patch has none */
export function mainOsc(p: Patch): Osc {
  if (!p.osc?.length) { p.osc = [{ wave: 'sawtooth', ratio: 1, level: .5 }]; ensureAmp(p); }
  return p.osc[0];
}
/** a patch that plays live oscillators needs an amp envelope */
export function ensureAmp(p: Patch) {
  if (!p.amp) p.amp = { a: .005, sus: .8, tau: .4, rel: .15, lo: .35, hi: .65, pow: 1 };
}
export function ensureVf(p: Patch) {
  if (!p.vf) p.vf = { type: 'lp', cut: 20000, res: .15, key: 0, drive: 0 };
  return p.vf;
}

/** 随机: a new sound, with new sources, macros, space and effects, as one step (drums keep their kit).
    the new sound is made ready before anyone hears it: its string notes rendered and its level matched with its
    effects on. the part goes on playing the old sound until then and swaps in one go, with no gap while notes
    render and no loud moment before the trim lands */
let rolling = 0;
export async function randomSound() {
  const i = studio.part, m = studio.doc?.parts[i]?.meta;
  if (!m) return;
  const seed = Date.now() >>> 0, r = rng(seed ^ 0x5bd1e995), k = 'rand' + seed, roll = ++rolling;
  const fx = randomFx(r), macro = randomMacros(r), rev = r() * .6;
  let p: Patch | null = null;
  if (!isDrums(m) && !isAudio(m)) {
    p = JSON.parse(JSON.stringify(patchOf(m))) as Patch;
    randomize(p, seed, { pluck: preset('acoustic').patch.a!, hammer: preset('piano').patch.a! });
    p.id = patchKey(m.preset, p);
    const sp = transport.song?.parts[i], ps = sp ? Array.from(sp.pitch).sort((a, b) => a - b) : [];
    const around = Math.max(36, Math.min(84, ps.length ? ps[Math.floor(ps.length / 2)] : 60));
    let levelled = false;
    try {
      const [trim] = await Promise.all([autoTrim(p, preset(m.preset).patch, around, effective(fx, macro), sp ? phraseOf(sp) : null), ps.length ? patchInstrument(p).prepare(engine.get(), new Set(ps)) : null]);
      p.trim = trim; levelled = true;
    } catch (e) { console.warn(e); }
    // a later click, or another part, took over while this one was getting ready
    if (roll !== rolling || studio.part !== i || !studio.doc?.parts[i]) return;
    const next = p;
    studio.setPatch('opRandom', i, q => { for (const key of Object.keys(q)) delete (q as unknown as Record<string, unknown>)[key]; Object.assign(q, JSON.parse(JSON.stringify(next))); }, k);
    if (!levelled) level.schedule(i, k);
  }
  studio.setPart('opRandom', i, { fx, macro }, k);
  studio.setMix('opRandom', i, { rev: +rev.toFixed(3), dly: +Math.max(0, (rev / .75 - .6) * .5).toFixed(3) }, k);
}
/** 微调: small changes to the sound you have */
export function tweakSound() { edit(p => mutate(p), undefined, 'opMutate'); }

/* sounds you saved */
class Saved {
  list = $state.raw<SavedSound[]>([]);
  loaded = false;
  async load() { if (this.loaded) return; this.loaded = true; this.list = await listSounds(); }
  async add(name: string) {
    const m = studio.doc?.parts[studio.part]?.meta;
    if (m) await this.addPatch(name, m.preset, patchOf(m));
  }
  async addPatch(name: string, presetId: string, patch: Patch) {
    const x: SavedSound = { id: 'snd-' + Date.now().toString(36), name, preset: presetId, icon: preset(presetId).icon, patch: JSON.parse(JSON.stringify(patch)), created: Date.now() };
    this.list = [x, ...this.list];
    await saveSound(x);
    return x;
  }
  async remove(id: string) { this.list = this.list.filter(x => x.id !== id); await deleteSound(id); }
  /** give the focused part a saved sound (its preset, its patch and its name), as one step */
  apply(x: SavedSound) {
    const i = studio.part, m = studio.doc?.parts[i]?.meta;
    if (!m) return;
    const icon = m.role === 'melody' && x.icon === 'piano' ? 'mic' : x.icon;
    studio.setPart('opLoadSound', i, { preset: x.preset, inst: { zh: x.name, en: x.name }, icon, patch: JSON.parse(JSON.stringify(x.patch)) });
  }
}
export const saved = new Saved();
