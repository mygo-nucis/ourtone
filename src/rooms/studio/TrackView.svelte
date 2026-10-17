<script lang="ts">
  import { untrack } from 'svelte';
  import PianoRoll from './PianoRoll.svelte';
  import TrackSide from './TrackSide.svelte';
  import { studio, isDrums } from '../../lib/project/studio.svelte';
  import type { Note } from '../../lib/project/doc';
  import { transport } from '../../lib/audio/transport.svelte';
  import { engine } from '../../lib/audio/engine';
  import { PIANO } from './playkeys.svelte';
  import { rollView, LP } from './track.svelte';
  import Icon from '../../components/ui/Icon.svelte';
  import { iconMarkup } from '../../lib/art/icons';
  import { partColor } from '../../lib/art/palette';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { pickFile, AUDIO_ACCEPT } from '../../lib/util';

  /* 单轨: one part's notes up close. the computer keyboard plays (and records while recording); Ctrl/⌘ combinations
     edit; arrows move and transpose */
  let { W, h, s, compact = false }: { W: number; h: number; s: number; compact?: boolean } = $props();
  const view = rollView;
  const audio = $derived.by(() => { void studio.rev; const m = studio.doc?.parts[studio.part]?.meta; return !!m && m.kind === 'audio'; });
  const ut = (window as unknown as { __ut?: Record<string, unknown> }).__ut;
  if (ut) ut.roll = view;
  const CW = $derived(compact ? W : W - LP);
  $effect(() => { view.H = h; view.compact = compact; });

  $effect(() => { view.width = CW - 70; });

  /* frame the part. time: what the arrange view asked for (a double-click), else, the first time for a song, the bars
     around the cursor (a short selection there, whole); after that the view stays where it was left. pitch: around the
     part's notes in view, whenever the part changes */
  $effect(() => {
    void studio.rev; void transport.gen;
    const d = studio.doc, g = studio.grid, i = studio.part;
    if (!d || !g || !d.parts[i]) return;
    untrack(() => {
      view.width = CW - 70;
      const want = view.want, fresh = view.spanGen !== transport.gen;
      view.want = null;
      if (want || fresh) {
        view.spanGen = transport.gen;
        const r = studio.range, at = studio.cursorTick();
        let { a, b } = want ?? view.around(g, at, r && r.parts.includes(i) ? r : null, false);
        // from the very start, with nothing there yet: go to where the part comes in, and take the cursor along
        const ns = d.parts[i].notes;
        if (!want && at === 0 && !transport.playing && ns.length && !ns.some(n => n.t < b)) {
          const f = g.barAt(ns[0].t);
          a = g.tickOf(Math.max(0, f - 1)); b = g.tickOf(Math.max(0, f - 1) + 4);
          studio.seekTick(g.tickOf(f));
        }
        view.span(a, b);
      }
      const key = `${transport.gen}:${i}`;
      if (!want && !fresh && view.fitKey === key) return;
      view.fitKey = key;
      const a = view.x0, b = view.tOf(view.width);
      const ns = d.parts[i].notes.filter(n => n.t >= a - (b - a) && n.t < b + (b - a));
      const src = ns.length ? ns : d.parts[i].notes;
      if (src.length) {
        let lo = 127, hi = 0; src.forEach(n => { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); });
        // a drum part keeps the kick in view; pitched parts are centred
        if (isDrums(d.parts[i].meta)) view.top = Math.min(127, lo + Math.floor(view.rows) - 1); else view.centre(lo, hi);
      } else view.centre(55, 76);
    });
  });

  function ensureVisible(t: number) { const span = view.width / view.ppt; if (t > view.x0 + span * .92 || t < view.x0) view.x0 = Math.max(0, t - span * .25); }
  let clip: Note[] = [];
  function inField(e: KeyboardEvent) { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  function onkeydown(e: KeyboardEvent) {
    if (studio.view !== 'track' || inField(e)) return;
    const d = studio.doc, g = studio.grid;
    if (!d || !g) return;
    const i = studio.part, ep = d.parts[i], mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase(), picked = [...studio.picked];
    if (mod && k === 'a') { e.preventDefault(); studio.pick(ep.notes); return; }
    if (mod && (k === 'c' || k === 'x')) {
      if (!picked.length) return;
      e.preventDefault();
      const t0 = Math.min(...picked.map(n => n.t));
      clip = picked.map(n => ({ ...n, t: n.t - t0 }));
      if (k === 'x') studio.deleteNotes(i, studio.picked);
      return;
    }
    if (mod && k === 'v') {
      if (!clip.length) return;
      e.preventDefault();
      const at = studio.cursorTick(), made = studio.addNotes(i, clip.map(n => ({ ...n, t: n.t + at })), 'opPaste');
      studio.pick(made);
      const end = at + Math.max(...clip.map(n => n.t + n.d));
      studio.seekTick(end); ensureVisible(end);
      return;
    }
    if (mod && k === 'd') {
      if (!picked.length) return;
      e.preventDefault();
      const t0 = Math.min(...picked.map(n => n.t)), t1 = Math.max(...picked.map(n => n.t + n.d)), beat = g.beat(t0), span = Math.ceil((t1 - t0) / beat) * beat;
      studio.pick(studio.addNotes(i, picked.map(n => ({ ...n, t: n.t + span })), 'opDuplicateNotes'));
      return;
    }
    if (mod || PIANO[e.code] !== undefined) return;
    switch (e.key) {
      case 'Delete': case 'Backspace': if (picked.length) { e.preventDefault(); studio.deleteNotes(i, studio.picked); } break;
      case 'Escape': studio.pick([]); break;
      case 'ArrowUp': case 'ArrowDown': {
        if (!picked.length) break;
        e.preventDefault();
        const dir = e.key === 'ArrowUp' ? 1 : -1;
        studio.editPicked(dir > 0 ? 'opUp' : 'opDown', ns => { ns.forEach(n => { n.p = Math.max(0, Math.min(127, n.p + dir * (e.shiftKey ? 12 : 1))); }); });
        const n = studio.picked.values().next().value;
        if (n) void engine.unlock().then(() => { const v = transport.noteOn(i, n.p, 90); setTimeout(() => v?.release((engine.ctx?.currentTime ?? 0) + .01), 160); });
        break;
      }
      case 'ArrowLeft': case 'ArrowRight': {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        if (!picked.length) { const t = Math.max(0, studio.cursorTick() + dir * studio.gridTicks()); studio.seekTick(t); ensureVisible(t); break; }
        const step = e.shiftKey ? g.tickOf(g.barAt(picked[0].t) + 1) - g.tickOf(g.barAt(picked[0].t)) : studio.gridTicks();
        if (dir < 0 && Math.min(...picked.map(n => n.t)) - step < 0) break;
        studio.editPicked('opMoveNotes', ns => { ns.forEach(n => { n.t += dir * step; }); });
        break;
      }
    }
  }
</script>

<svelte:window {onkeydown} />

{#if audio}
  <!-- an audio track has no notes: say what it is and where its clips are edited -->
  <div class="tv audio" style="height:{h}px">
    <div class="card ut-box">
      <span class="ic">{@html iconMarkup('audio', theme.night, partColor(theme.pal, studio.doc?.parts[studio.part]?.meta.color ?? 0), 64)}</span>
      <h2>{i18n.t('audioTrackTitle')}</h2>
      <p>{i18n.t('audioTrackBody')}</p>
      <div class="acts">
        <button class="ut-btn lg" onclick={async () => { const f = await pickFile(AUDIO_ACCEPT); if (f) void studio.importAudio(studio.part, f); }}><Icon name="upload" size={15} sw={1.8} />{i18n.t('importAudioHere')}</button>
        <button class="ut-btn primary lg" onclick={() => (studio.view = 'arrange')}>{i18n.t('toArrange')}</button>
      </div>
    </div>
  </div>
{:else}
  <div class="tv" style="height:{h}px">
    {#if !compact}<TrackSide {h} />{/if}
    <div class="mid" style="width:{CW}px"><PianoRoll {view} W={CW} {s} /></div>
  </div>
{/if}

<style>
  .tv { position: relative; display: flex; }
  .tv.audio { align-items: center; justify-content: center; background: var(--page); }
  .card { display: flex; flex-direction: column; align-items: center; gap: 12px; max-width: 520px; padding: 36px 40px 30px; text-align: center; background: var(--surface); }
  .card .ic { display: block; width: 64px; height: 64px; }
  .card h2 { margin: 4px 0 0; font: 900 24px/1.3 var(--f-serif); color: var(--ink); }
  :global([data-sky="night"]) .card h2 { font: 800 26px/1.3 var(--f-title); }
  .card p { margin: 0; font: 500 13px/1.75 var(--f-sans); color: var(--ink2); }
  .card .acts { display: flex; gap: 10px; margin-top: 8px; }
  .mid { position: relative; flex: none; }
</style>
