<script lang="ts">
  import { untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Timeline from './Timeline.svelte';
  import TrackHeaders from './TrackHeaders.svelte';
  import Mixer from './Mixer.svelte';
  import Inspector from './Inspector.svelte';
  import AddPart from './AddPart.svelte';
  import Icon from '../../components/ui/Icon.svelte';
  import { studio } from '../../lib/project/studio.svelte';
  import { transport } from '../../lib/audio/transport.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { arrangeView as view, INSPECT } from './arrange.svelte';
  import { rollView } from './track.svelte';

  /* 编曲: the track list and timeline, the mixer under them, the inspector on the right.
     on a phone the timeline takes the whole body, and the mixer and inspector slide over it on demand. */
  let { W, h, s, compact = false }: { W: number; h: number; s: number; compact?: boolean } = $props();
  const MIXER = 300, GAP = 8;
  // a handle for debugging, beside the others on window.__ut
  const ut = (window as unknown as { __ut?: Record<string, unknown> }).__ut;
  if (ut) ut.view = view;
  $effect(() => { view.compact = compact; view.rh = compact ? 40 : 50; view.head = compact ? 148 : 236; view.ruler = compact ? 28 : 32; });
  const LW = $derived(compact ? W : W - INSPECT);
  const TW = $derived(LW - view.head);
  const TH = $derived(compact ? h - view.ruler : Math.max(150, h - view.ruler - MIXER - GAP));
  $effect(() => { view.width = TW; });
  // a new song: show its first bars at about 39 units a bar (coming back to the same song finds the view as it was left)
  $effect(() => {
    void studio.rev;
    const g = studio.grid, gen = transport.gen;
    if (!g) return;
    untrack(() => { if (gen !== view.gen || !view.fitted) { view.gen = gen; view.width = TW; view.fit(g, Math.max(8, Math.round(TW / (compact ? 44 : 39)))); } });
  });

  /* double-click: that part in the track view, the cursor at the start of the bar, the view around it (a selection there
     is kept, and framed whole when it is short) */
  function edit(part: number, t: number) {
    const g = studio.grid, r = studio.range;
    if (!g) return;
    studio.part = part;
    const sel = r && r.parts.includes(part) && t >= r.a && t < r.b ? r : null;
    if (!sel) studio.select(null);
    rollView.want = rollView.around(g, t, sel, rollView.spanGen === transport.gen);
    studio.pick([]);
    studio.seekTick(g.tickOf(g.barAt(t)));
    studio.view = 'track';
  }

  function inField(e: KeyboardEvent) { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
  function onkeydown(e: KeyboardEvent) {
    if (studio.view !== 'arrange' || inField(e)) return;
    const mod = e.metaKey || e.ctrlKey, r = studio.range, g = studio.grid, d = studio.doc;
    if (!g || !d) return;
    const k = e.key.toLowerCase();
    if (mod && k === 'c') { if (studio.copy()) e.preventDefault(); return; }
    if (mod && k === 'x') { if (studio.copy()) { studio.clear(); e.preventDefault(); } return; }
    if (mod && k === 'v') {
      e.preventDefault();
      // at the selection, or at the cursor (on the snap grid, a bar at most)
      const at = r ? r.a : g.snap(studio.cursorTick(), studio.snap === 'phrase' ? 'bar' : studio.snap, 'floor');
      studio.paste(at, r ? r.parts : [studio.part]);
      return;
    }
    if (mod && k === 'd') { e.preventDefault(); if (!r && studio.trackSel) studio.duplicatePart(studio.part); else studio.duplicate(); return; }
    if (mod && k === 'e') { e.preventDefault(); studio.split(studio.cursorTick()); return; }
    if (mod && k === 'j') { e.preventDefault(); studio.join(); return; }
    if (mod && k === 'a') { e.preventDefault(); studio.select({ parts: d.parts.map((_, i) => i), a: 0, b: g.snap(Math.max(d.meta.end, 1), 'bar', 'ceil') }); return; }
    if (mod) return;
    switch (e.key) {
      case 'Delete': case 'Backspace':
        if (r) { e.preventDefault(); studio.clear(); }
        else if (studio.trackSel) { e.preventDefault(); studio.deletePart(studio.part); }
        break;
      case 'ArrowUp': case 'ArrowDown': if (r) { e.preventDefault(); studio.transpose((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1)); } break;
      case 'ArrowLeft': case 'ArrowRight': {
        if (!r) break;
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1, na = g.step(r.a, studio.snap, dir);
        if (na < 0) break;
        if (e.altKey) studio.move(na - r.a);
        else studio.select({ ...r, a: na, b: r.b + (na - r.a) });
        break;
      }
      case 'Escape': if (studio.sheet) studio.sheet = ''; else if (studio.arrTool !== 'select') studio.arrTool = 'select'; else { studio.select(null); studio.trackSel = false; } break;
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="arr" class:compact style="height:{h}px">
  <div class="left" style="width:{LW}px">
    <div class="top">
      <div class="lab" style="width:{view.head}px;height:{view.ruler}px">
        <span class="ut-kicker">{i18n.t('tracks')}</span>
        <AddPart onpick={(id) => studio.addPart(id)} onsound={(x) => studio.addPart(x.preset, x)} onaudio={(f) => void studio.addAudioPart(f ?? undefined)}>
          {#snippet trigger({ toggle })}
            <button class="plus" onclick={toggle} aria-label={i18n.t('addPart')} title={i18n.t('addPart')}><Icon name="plus" size={16} sw={2.2} /></button>
          {/snippet}
        </AddPart>
      </div>
    </div>
    <div class="mid" style="height:{view.ruler + TH}px">
      <div class="hcol" style="width:{view.head}px;padding-top:{view.ruler}px"><TrackHeaders {view} h={TH} {s} /></div>
      <div class="tcol" style="left:{view.head}px"><Timeline {view} {s} h={TH} onedit={edit} /></div>
    </div>
    {#if !compact}
      <div class="gap" style="height:{GAP}px"></div>
      <Mixer {s} w={LW} />
    {/if}
  </div>
  {#if !compact}
    <Inspector {h} />
  {:else}
    {#if studio.sheet === 'mixer'}
      {@const k = Math.min(1, h / 300)}
      <div class="sheet mix" style="width:{W / k}px;transform:scale({k})" transition:fly={{ y: 310, duration: 260, easing: cubicOut }}><Mixer s={s * k} w={W / k} /></div>
    {/if}
    {#if studio.sheet === 'inspector'}
      <div class="sheet insp" transition:fly={{ x: 280, duration: 260, easing: cubicOut }}><Inspector {h} /></div>
    {/if}
    {#if studio.sheet}<button class="scrim" aria-label="close" onclick={() => (studio.sheet = '')}></button>{/if}
  {/if}
</div>

<style>
  .arr { position: relative; display: flex; }
  .left { position: relative; flex: none; display: flex; flex-direction: column; }
  .top { position: absolute; left: 0; top: 0; z-index: 2; }
  .lab { display: flex; align-items: center; justify-content: space-between; padding: 0 12px 0 20px; background: var(--alt); border-right: 1px solid var(--hair); border-bottom: 1px solid var(--hair); }
  .compact .lab { padding: 0 6px 0 12px; }
  .plus { display: grid; place-items: center; width: 24px; height: 24px; color: var(--accent); border-radius: 6px; }
  .plus:hover { background: var(--accentSoft); }
  .mid { position: relative; flex: none; }
  .hcol { position: absolute; left: 0; top: 0; bottom: 0; }
  .tcol { position: absolute; top: 0; right: 0; }
  .gap { flex: none; background: var(--p2); }
  .scrim { position: absolute; inset: 0; z-index: 4; background: rgba(28, 32, 48, .18); }
  :global([data-sky="night"]) .scrim { background: rgba(0, 0, 0, .45); }
  .sheet { position: absolute; z-index: 5; background: var(--base); box-shadow: 0 -12px 30px -12px var(--shadow); }
  .sheet.mix { left: 0; bottom: 0; transform-origin: 0 100%; }
  .sheet.insp { right: 0; top: 0; bottom: 0; box-shadow: -12px 0 30px -12px var(--shadow); }
</style>
