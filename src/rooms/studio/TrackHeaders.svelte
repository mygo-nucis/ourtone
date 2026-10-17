<script lang="ts">
  import { tick } from 'svelte';
  import PartChip from '../../components/ui/PartChip.svelte';
  import Icon from '../../components/ui/Icon.svelte';
  import Menu from '../../components/ui/Menu.svelte';
  import AddPart from './AddPart.svelte';
  import { studio } from '../../lib/project/studio.svelte';
  import { transport } from '../../lib/audio/transport.svelte';
  import { mixOf } from '../../lib/audio/strip';
  import { partColor } from '../../lib/art/palette';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { meter } from './meters';
  import { pickFile, AUDIO_ACCEPT } from '../../lib/util';
  import type { ArrangeView } from './arrange.svelte';
  import { MOD } from './frame';

  /* the track list beside the timeline: instrument, name, a small meter, mute and solo; double-click a name to rename.
     drag a track up or down to reorder; the wheel scrolls the list with the lanes */
  let { view, h, s }: { view: ArrangeView; h: number; s: number } = $props();
  const parts = $derived(transport.song?.parts ?? []);
  /** some track is soloed: the others are silent without being muted */
  const soloing = $derived(parts.some(p => mixOf(p).solo));
  let editing = $state(-1);
  let draft = $state('');
  let input = $state<HTMLInputElement | null>(null);
  async function rename(i: number) {
    editing = i; draft = i18n.pick(parts[i].data.name);
    await tick(); input?.select();
  }
  function commit() { if (editing >= 0) studio.rename(editing, draft); editing = -1; }

  /* reordering: the grabbed track follows the pointer, the others make room, and it lands where it is let go */
  let drag = $state<{ from: number; dy: number; to: number } | null>(null);
  function grab(e: PointerEvent, i: number) {
    const t = e.target as HTMLElement;
    // its buttons (mute, solo, the menu) only focus the track; anywhere else selects the whole track
    if (t.closest('button, input')) { studio.part = i; return; }
    studio.selectTrack(i);
    if (e.button !== 0 || t.closest('.nm')) return;
    const el = e.currentTarget as HTMLElement, k = el.getBoundingClientRect().height / view.rh || 1, y0 = e.clientY, n = parts.length;
    const move = (ev: PointerEvent) => {
      const dy = (ev.clientY - y0) / k;
      if (!drag && Math.abs(dy) < 5) return;
      drag = { from: i, dy, to: Math.max(0, Math.min(n - 1, Math.round(i + dy / view.rh))) };
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      const d = drag; drag = null;
      if (d && d.to !== d.from) studio.movePart(d.from, d.to);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  /** how far a track shifts while another is dragged past it */
  function shift(j: number) {
    const d = drag;
    if (!d) return 0;
    if (j === d.from) return d.dy;
    if (d.from < d.to && j > d.from && j <= d.to) return -view.rh;
    if (d.from > d.to && j >= d.to && j < d.from) return view.rh;
    return 0;
  }
  function wheel(e: WheelEvent) {
    const contentH = parts.length * view.rh + view.rh;
    if (contentH <= h) return;
    e.preventDefault();
    view.scrollY = Math.max(0, Math.min(contentH - h, view.scrollY + e.deltaY));
  }
</script>

<div class="heads" class:compact={view.compact} class:dragging={!!drag} style="height:{h}px;width:{view.head}px" onwheel={wheel}>
  <div class="inner" style="transform:translateY({-view.scrollY}px)">
    {#each parts as p, i (p.data.id + ':' + i)}
      {@const m = mixOf(p)}
      <div class="hd" class:sel={studio.part === i} class:whole={studio.trackSel && studio.part === i} class:alt={i % 2 === 1} class:night={theme.night} class:lifted={drag?.from === i} style="height:{view.rh}px;transform:translateY({shift(i)}px)" role="button" tabindex="-1" onpointerdown={(e) => grab(e, i)}>
        {#if studio.part === i}<span class="bar" aria-hidden="true"></span>{/if}
        <span class="chip"><PartChip icon={p.data.icon} color={partColor(theme.pal, p.data.color)} size={28} /></span>
        {#if editing === i}
          <input class="rn" bind:this={input} bind:value={draft} onblur={commit} onkeydown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') editing = -1; e.stopPropagation(); }} />
        {:else}
          <span class="nm" role="presentation" ondblclick={() => rename(i)} title={i18n.t('renamePart')}>{i18n.pick(p.data.name)}</span>
        {/if}
        <span class="sub">{i18n.pick(p.data.inst)}</span>
        <canvas class="mini" use:meter={{ kind: 'mini', i, s }} width="52" height="6" aria-hidden="true"></canvas>
        <span class="ms">
          <button class:on={m.mute} class:implied={soloing && !m.solo && !m.mute} class="m" aria-pressed={m.mute} title={soloing && !m.solo ? i18n.t('mutedBySolo') : i18n.t('mute')} onclick={() => studio.mute(i)}>M</button>
          <button class:on={m.solo} class="s" aria-pressed={m.solo} title={i18n.t('soloHint', { mod: MOD })} onclick={(e) => studio.solo(i, e.ctrlKey || e.metaKey || e.shiftKey)}>S</button>
        </span>
        <span class="more">
          <Menu align="left" width={200} label={i18n.pick(p.data.name)}>
            {#snippet trigger({ toggle })}
              <button class="dots" aria-label={i18n.t('trackMenu')} title={i18n.t('trackMenu')} onclick={toggle}><Icon name="more" size={16} sw={2.4} /></button>
            {/snippet}
            {#snippet children({ close })}
              <button class="mi" role="menuitem" onclick={() => { close(); rename(i); }}><Icon name="pen" size={16} />{i18n.t('renamePart')}</button>
              {#if p.data.kind === 'audio'}
                <button class="mi" role="menuitem" onclick={async () => { close(); const f = await pickFile(AUDIO_ACCEPT); if (f) void studio.importAudio(i, f); }}><Icon name="upload" size={16} />{i18n.t('importAudioHere')}</button>
              {/if}
              <button class="mi" role="menuitem" onclick={() => { close(); studio.part = i; studio.view = 'sound'; }}><Icon name="sliders" size={16} />{i18n.t('openSound')}</button>
              <button class="mi" role="menuitem" onclick={() => { close(); studio.duplicatePart(i); }}><Icon name="copy" size={16} />{i18n.t('duplicatePart')}</button>
              <button class="mi" role="menuitem" disabled={i === 0} onclick={() => { close(); studio.movePart(i, i - 1); }}><Icon name="chevup" size={16} />{i18n.t('moveUp')}</button>
              <button class="mi" role="menuitem" disabled={i === parts.length - 1} onclick={() => { close(); studio.movePart(i, i + 1); }}><Icon name="down" size={16} />{i18n.t('moveDown')}</button>
              <div class="sep"></div>
              <button class="mi" role="menuitem" disabled={parts.length <= 1} onclick={() => { close(); studio.deletePart(i); }}><Icon name="trash" size={16} />{i18n.t('deletePart')}</button>
            {/snippet}
          </Menu>
        </span>
      </div>
    {/each}
    <div class="addrow" style="height:{view.rh}px">
      <AddPart onpick={(id) => studio.addPart(id)} onsound={(x) => studio.addPart(x.preset, x)} onaudio={(f) => void studio.addAudioPart(f ?? undefined)}>
        {#snippet trigger({ toggle })}
          <button class="add" onclick={toggle}><Icon name="plus" size={14} sw={2.2} />{i18n.t('addPart')}</button>
        {/snippet}
      </AddPart>
    </div>
  </div>
</div>

<style>
  .heads { position: relative; overflow: hidden; border-right: 1px solid var(--hair); }
  .compact .chip { left: 8px; top: 8px; transform: scale(.86); transform-origin: 0 0; }
  .compact .nm { left: 38px; top: 9px; max-width: 64px; font-size: 13px; }
  .compact .sub, .compact .mini, .compact .more { display: none; }
  .compact .ms { left: 104px; top: 11px; gap: 4px; }
  .compact .ms button { width: 18px; height: 18px; line-height: 18px; font-size: 10px; }
  .compact .addrow { padding-left: 8px; }
  .compact .add { padding: 0 8px; font-size: 11px; letter-spacing: 0; }
  .inner { position: absolute; left: 0; right: 0; top: 0; }
  .hd { position: relative; display: block; background: var(--base); border-bottom: 1px solid var(--hair); cursor: grab; outline: none; }
  .dragging .hd { transition: transform .16s cubic-bezier(.2, .8, .2, 1); }
  .dragging .hd.lifted { transition: none; z-index: 2; cursor: grabbing; box-shadow: 0 10px 24px -10px var(--shadow), 0 0 0 1.5px var(--accent); }
  .hd.alt { background: var(--alt); }
  .hd.sel { background: var(--accentSoft); }
  .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--accent); }
  .hd.whole { box-shadow: inset 0 0 0 2px var(--accent); }
  .chip { position: absolute; left: 14px; top: 11px; }
  .nm { position: absolute; left: 54px; top: 8px; max-width: 102px; font: 700 14px/20px var(--f-sans); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: text; }
  .rn { position: absolute; left: 50px; top: 6px; width: 110px; height: 24px; padding: 0 4px; font: 700 14px/1 var(--f-sans); color: var(--ink); background: var(--surface); border: 1px solid var(--accent); border-radius: 4px; outline: none; }
  .sub { position: absolute; left: 54px; top: 29px; max-width: 108px; font: 500 11px/14px var(--f-sans); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mini { position: absolute; left: 169px; top: 40px; width: 52px; height: 6px; }
  .ms { position: absolute; left: 170px; top: 11px; display: flex; gap: 6px; }
  .ms button { width: 20px; height: 20px; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--hair); font: 900 11px/20px var(--f-sans); color: var(--ink2); text-align: center; background: transparent; }
  .ms button:hover { box-shadow: inset 0 0 0 1px var(--muted); }
  .ms .m.on { background: var(--accentSoft); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .ms .m.implied { color: var(--accent); opacity: .6; }
  .ms .s.on { background: var(--wash); color: #1C2030; box-shadow: none; }
  .night .ms button { border-radius: 0; }
  .night .ms .s.on { color: #0B0A0E; }
  .more { position: absolute; right: 2px; top: 2px; opacity: 0; transition: opacity .15s; }
  .hd:hover .more, .hd.sel .more, .more:focus-within { opacity: 1; }
  .dots { width: 22px; height: 18px; display: grid; place-items: center; color: var(--muted); border-radius: 4px; }
  .dots:hover { color: var(--ink); }
  .addrow { display: flex; align-items: center; padding-left: 14px; }
  .add { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px 0 10px; border-radius: 8px; border: 1px dashed var(--hair); font: 700 12px/1 var(--f-sans); letter-spacing: 1px; color: var(--accent); }
  .add:hover { border-color: var(--accent); background: var(--accentSoft); }
  :global([data-sky="night"]) .add { border-radius: 0; }
  .mi :global(.ic) { color: var(--muted); }
</style>
