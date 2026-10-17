<script lang="ts">
  import Icon from '../../components/ui/Icon.svelte';
  import Menu from '../../components/ui/Menu.svelte';
  import PartChip from '../../components/ui/PartChip.svelte';
  import { studio } from '../../lib/project/studio.svelte';
  import { transport } from '../../lib/audio/transport.svelte';
  import { partColor } from '../../lib/art/palette';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';

  /* which part the track and sound views work on */
  let { compact = false, onpick }: { compact?: boolean; onpick?: () => void } = $props();
  const parts = $derived(transport.song?.parts ?? []);
  const part = $derived(parts[studio.part]);
  let open = $state(false);
</script>

<Menu bind:open width={260} label={i18n.t('fieldParts')}>
  {#snippet trigger({ toggle, open: o })}
    <button class="pchip ut-box" class:open={o} onclick={toggle} aria-haspopup="menu">
      {#if part}<PartChip icon={part.data.icon} color={partColor(theme.pal, part.data.color)} size={20} /><span class="nm">{i18n.pick(part.data.name)}</span>{#if !compact}<span class="sub">· {i18n.pick(part.data.inst)}</span>{/if}{/if}
      <Icon name="down" size={15} sw={2} />
    </button>
  {/snippet}
  {#snippet children({ close })}
    {#each parts as p, i}
      <button class="mi" class:on={i === studio.part} role="menuitem" onclick={() => { studio.part = i; studio.pick([]); onpick?.(); close(); }}>
        <PartChip icon={p.data.icon} color={partColor(theme.pal, p.data.color)} size={20} />
        <span class="st"><span class="t1">{i18n.pick(p.data.name)}</span><span class="t2">{i18n.pick(p.data.inst)}</span></span>
      </button>
    {/each}
  {/snippet}
</Menu>

<style>
  .pchip { display: inline-flex; align-items: center; gap: 7px; height: 28px; max-width: 230px; padding: 0 8px 0 7px; background: var(--surface); }
  :global([data-sky="night"]) .pchip { background: var(--well); }
  .pchip .nm { font: 900 13px/1 var(--f-sans); color: var(--ink); white-space: nowrap; }
  .pchip .sub { font: 500 12px/1 var(--f-sans); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pchip :global(.ic) { color: var(--muted); flex: none; }
  .pchip.open, .pchip:hover { --bc: var(--accent); }
</style>
