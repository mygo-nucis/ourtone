<script lang="ts">
  import Icon from '../../components/ui/Icon.svelte';
  import Menu from '../../components/ui/Menu.svelte';
  import { studio } from '../../lib/project/studio.svelte';
  import type { SnapMode } from '../../lib/project/ops';
  import { i18n } from '../../lib/i18n/index.svelte';
  import type { StringKey } from '../../lib/i18n/strings';
  import { MOD } from './frame';

  /* the arrange view's tools, in the row under the top bar: snap, split, follow, undo and redo.
     on a phone they shrink to icons, and two switches bring up the mixer and the inspector */
  let { compact = false }: { compact?: boolean } = $props();
  const SNAPS: { id: SnapMode; label: StringKey }[] = [{ id: 'phrase', label: 'snapPhrase' }, { id: 'bar', label: 'snapBar' }, { id: 'beat', label: 'snapBeat' }, { id: 'free', label: 'snapFree' }];
  let snapOpen = $state(false);
</script>

<div class="tools" role="toolbar" aria-label={i18n.t('views')}>
  <Menu bind:open={snapOpen} width={150} label={i18n.t('snap')}>
    {#snippet trigger({ toggle })}
      <button class="ut-btn" class:lit={studio.snap !== 'free'} onclick={toggle} aria-haspopup="menu" title={i18n.t('snapHint')}><Icon name="magnet" size={15} sw={1.8} />{#if !compact}{i18n.t('snap')} · {/if}{i18n.t(SNAPS.find(s => s.id === studio.snap)!.label)}</button>
    {/snippet}
    {#snippet children({ close })}
      {#each SNAPS as s}
        <button class="mi" class:on={studio.snap === s.id} role="menuitemradio" aria-checked={studio.snap === s.id} onclick={() => { studio.snap = s.id; close(); }}>{i18n.t(s.label)}</button>
      {/each}
    {/snippet}
  </Menu>
  <button class="ut-btn icon" class:on={studio.arrTool === 'split'} aria-pressed={studio.arrTool === 'split'} title={i18n.t('toolSplit', { mod: MOD })} aria-label={i18n.t('toolSplit', { mod: MOD })} onclick={() => (studio.arrTool = studio.arrTool === 'split' ? 'select' : 'split')}><Icon name="scissors" size={17} sw={1.7} /></button>
  <button class="ut-btn" class:icon={compact} class:lit={studio.follow} aria-pressed={studio.follow} title={i18n.t('follow')} aria-label={i18n.t('follow')} onclick={() => (studio.follow = !studio.follow)}><Icon name="follow" size={15} sw={1.8} />{#if !compact}{i18n.t('follow')}{/if}</button>
  <div class="grp">
    <button class="ut-btn icon" disabled={!studio.undoLabel} title="{i18n.t('undo')} {studio.undoLabel ? i18n.t(studio.undoLabel) : ''} ({MOD}Z)" aria-label={i18n.t('undo')} onclick={() => studio.undo()}><Icon name="undo" size={17} sw={1.8} /></button>
    <button class="ut-btn icon" disabled={!studio.redoLabel} title="{i18n.t('redo')} {studio.redoLabel ? i18n.t(studio.redoLabel) : ''} ({MOD}⇧Z)" aria-label={i18n.t('redo')} onclick={() => studio.redo()}><Icon name="redo" size={17} sw={1.8} /></button>
  </div>
  <span class="gap"></span>
  {#if compact}
    <button class="ut-btn" class:lit={studio.sheet === 'mixer'} aria-pressed={studio.sheet === 'mixer'} onclick={() => (studio.sheet = studio.sheet === 'mixer' ? '' : 'mixer')}><Icon name="sliders" size={15} sw={1.8} />{i18n.t('mixer')}</button>
    <button class="ut-btn" class:lit={studio.sheet === 'inspector'} aria-pressed={studio.sheet === 'inspector'} onclick={() => (studio.sheet = studio.sheet === 'inspector' ? '' : 'inspector')}>{i18n.t('instrument')}</button>
  {/if}
</div>

<style>
  .tools { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
  .grp { display: flex; gap: 6px; }
  .grp + :global(*) { margin-left: 6px; }
  .gap { flex: 1; }
</style>
