<script lang="ts">
  import Icon from '../../components/ui/Icon.svelte';
  import Menu from '../../components/ui/Menu.svelte';
  import Seg from '../../components/ui/Seg.svelte';
  import PartChip from '../../components/ui/PartChip.svelte';
  import { studio, GRID_DIV, type Tool, type NoteGrid } from '../../lib/project/studio.svelte';
  import { transport } from '../../lib/audio/transport.svelte';
  import { partColor } from '../../lib/art/palette';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import type { StringKey } from '../../lib/i18n/strings';
  import { refOf } from './reference';

  /* the track view's tools: which part, pen / select / eraser, follow, a reference part, snap and the grid, note names */
  let { compact = false }: { compact?: boolean } = $props();
  const parts = $derived(transport.song?.parts ?? []);
  const part = $derived(parts[studio.part]);
  /** an audio track has no notes to write: only the part picker stays */
  const audio = $derived(!!part?.audio);
  const ref = $derived.by(() => { void studio.rev; return refOf(); });
  const TOOLS: { id: Tool; icon: string; label: StringKey }[] = [
    { id: 'pen', icon: 'pen', label: 'toolPenNotes' }, { id: 'select', icon: 'select', label: 'toolSelectNotes' }, { id: 'erase', icon: 'eraser', label: 'toolEraseNotes' }
  ];
  const GRIDS: NoteGrid[] = ['1/4', '1/8', '1/16', '1/8T', '1/16T'];
  let partOpen = $state(false), refOpen = $state(false), gridOpen = $state(false);
  void GRID_DIV;
</script>

<div class="tools" role="toolbar">
  <Menu bind:open={partOpen} width={260} label={i18n.t('fieldParts')}>
    {#snippet trigger({ toggle, open })}
      <button class="pchip ut-box" class:open onclick={toggle} aria-haspopup="menu">
        {#if part}<PartChip icon={part.data.icon} color={partColor(theme.pal, part.data.color)} size={20} /><span class="nm">{i18n.pick(part.data.name)}</span>{#if !compact}<span class="sub">· {i18n.pick(part.data.inst)}</span>{/if}{/if}
        <Icon name="down" size={15} sw={2} />
      </button>
    {/snippet}
    {#snippet children({ close })}
      {#each parts as p, i}
        <button class="mi" class:on={i === studio.part} role="menuitem" onclick={() => { studio.part = i; studio.pick([]); close(); }}>
          <PartChip icon={p.data.icon} color={partColor(theme.pal, p.data.color)} size={20} />
          <span class="st"><span class="t1">{i18n.pick(p.data.name)}</span><span class="t2">{i18n.pick(p.data.inst)}</span></span>
        </button>
      {/each}
    {/snippet}
  </Menu>
  {#if !audio}
  <div class="grp">
    {#each TOOLS as t}
      <button class="ut-btn icon" class:on={studio.tool === t.id} aria-pressed={studio.tool === t.id} title={i18n.t(t.label)} aria-label={i18n.t(t.label)} onclick={() => (studio.tool = t.id)}><Icon name={t.icon} size={18} sw={1.7} /></button>
    {/each}
  </div>
  <button class="ut-btn" class:icon={compact} class:lit={studio.follow} aria-pressed={studio.follow} title={i18n.t('follow')} aria-label={i18n.t('follow')} onclick={() => (studio.follow = !studio.follow)}><Icon name="follow" size={15} sw={1.8} />{#if !compact}{i18n.t('follow')}{/if}</button>
  {#if !compact && !(part && (part.data.role === 'drums' || part.data.preset === 'kit' || part.data.preset === 'ekit'))}
    <Menu bind:open={refOpen} width={220} label={i18n.t('reference')}>
      {#snippet trigger({ toggle })}
        <button class="ref ut-box" onclick={toggle} aria-haspopup="menu">
          {#if ref >= 0}<span class="sw" style="background:{partColor(theme.pal, parts[ref]?.data.color ?? 0, true)}"></span><span>{i18n.t('reference')} · {parts[ref] ? i18n.pick(parts[ref].data.name) : ''}</span>{:else}<span>{i18n.t('noReference')}</span>{/if}
          <Icon name="down" size={15} sw={2} />
        </button>
      {/snippet}
      {#snippet children({ close })}
        <button class="mi" class:on={ref < 0} role="menuitem" onclick={() => { studio.refPart = -2; close(); }}>{i18n.t('noReference')}</button>
        {#each parts as p, i}
          {#if i !== studio.part}
            <button class="mi" class:on={i === ref} role="menuitem" onclick={() => { studio.refPart = i; close(); }}><span class="sw" style="background:{partColor(theme.pal, p.data.color, true)}"></span>{i18n.pick(p.data.name)}</button>
          {/if}
        {/each}
      {/snippet}
    </Menu>
  {/if}
  <span class="gap"></span>
  <div class="q">
    <button class="ut-btn icon qs" class:lit={studio.snapOn} aria-pressed={studio.snapOn} title={i18n.t('snapNotesHint')} aria-label={i18n.t('snapNotes')} onclick={() => (studio.snapOn = !studio.snapOn)}><Icon name="magnet" size={16} sw={1.7} /></button>
    <Menu bind:open={gridOpen} width={132} align="right" label={i18n.t('gridLabel')}>
      {#snippet trigger({ toggle })}<button class="ut-btn qg" class:off={!studio.snapOn} onclick={toggle} aria-haspopup="menu" title={i18n.t('gridHint')}>{#if !compact}<span class="gl">{i18n.t('gridLabel')}</span>{/if}{studio.noteGrid}<Icon name="down" size={13} sw={2} /></button>{/snippet}
      {#snippet children({ close })}
        {#each GRIDS as gd}<button class="mi" class:on={studio.noteGrid === gd} role="menuitemradio" aria-checked={studio.noteGrid === gd} onclick={() => { studio.noteGrid = gd; close(); }}>{gd}</button>{/each}
      {/snippet}
    </Menu>
  </div>
  {#if !compact}<span class="ut-kicker lab">{i18n.t('notation')}</span>{/if}
  <Seg items={[{ id: 'letter', label: i18n.t('letters') }, { id: 'jianpu', label: i18n.t('jianpuLabel') }]} value={studio.notation} onchange={(v) => (studio.notation = v)} fs={13} pad={compact ? 9 : 14} h={compact ? 26 : 28} label={i18n.t('notation')} />
  {/if}
</div>

<style>
  .tools { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
  .grp { display: flex; gap: 6px; }
  .gap { flex: 1; }
  .pchip { display: inline-flex; align-items: center; gap: 7px; height: 28px; max-width: 230px; padding: 0 8px 0 7px; background: var(--surface); }
  :global([data-sky="night"]) .pchip { background: var(--well); }
  .pchip .nm { font: 900 13px/1 var(--f-sans); color: var(--ink); white-space: nowrap; }
  .pchip .sub { font: 500 12px/1 var(--f-sans); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pchip :global(.ic) { color: var(--muted); flex: none; }
  .pchip.open, .pchip:hover { --bc: var(--accent); }
  .ref { display: inline-flex; align-items: center; gap: 8px; height: 28px; padding: 0 8px 0 10px; font: 700 12px/1 var(--f-sans); color: var(--ink2); background: var(--surface); white-space: nowrap; }
  :global([data-sky="night"]) .ref { background: var(--well); }
  .ref :global(.ic) { color: var(--muted); }
  .sw { width: 14px; height: 8px; border-radius: 4px; opacity: .8; flex: none; display: inline-block; }
  :global([data-sky="night"]) .sw { border-radius: 0; }
  .q { display: flex; }
  .qs { border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .q :global(.qg) { border-top-left-radius: 0; border-bottom-left-radius: 0; margin-left: -1px; gap: 5px; padding: 0 8px 0 10px; font-variant-numeric: tabular-nums; }
  .q :global(.qg.off) { color: var(--muted); }
  .gl { font-weight: 500; color: var(--muted); }
  .lab { margin-left: 8px; letter-spacing: 2px; }
</style>
