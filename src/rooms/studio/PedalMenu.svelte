<script lang="ts">
  import Icon from '../../components/ui/Icon.svelte';
  import Menu from '../../components/ui/Menu.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import type { StringKey } from '../../lib/i18n/strings';
  import { pedal, type PedalMode } from './pedal.svelte';

  /* the sustain pedal's mode, at the end of Studio's tool row in every view (the keys play in all of them). lit while
     the pedal is down; on a phone, the icon alone */
  let { compact = false }: { compact?: boolean } = $props();
  const coarse = typeof matchMedia !== 'undefined' && !matchMedia('(pointer: fine)').matches;
  const MODES: { id: PedalMode; label: StringKey; sub?: StringKey }[] = [
    { id: 'off', label: 'pedalOff' }, { id: 'on', label: 'pedalOn' }, { id: 'manual', label: 'pedalManual', sub: coarse ? 'pedalTouch' : 'pedalSpace' }
  ];
  let open = $state(false);
  const now = $derived(MODES.find(m => m.id === pedal.mode)!);
</script>

<Menu bind:open width={230} align="right" label={i18n.t('pedal')}>
  {#snippet trigger({ toggle })}
    <button class="ut-btn" class:icon={compact} class:lit={pedal.mode !== 'off' && !pedal.down} class:on={pedal.down} onclick={toggle} aria-haspopup="menu"
      aria-label="{i18n.t('pedal')}: {i18n.t(now.label)}" title={i18n.t('pedalHint')}>
      <Icon name="pedal" size={16} sw={1.8} />{#if !compact}{i18n.t('pedalShort')} · {i18n.t(now.label)}{/if}
    </button>
  {/snippet}
  {#snippet children({ close })}
    {#each MODES as m}
      <button class="mi" class:on={pedal.mode === m.id} role="menuitemradio" aria-checked={pedal.mode === m.id} onclick={() => { pedal.setMode(m.id); close(); }}>
        {i18n.t(m.label)}{#if m.sub}<span class="sub">{i18n.t(m.sub)}</span>{/if}
      </button>
    {/each}
    <p class="note">{i18n.t('pedalHint')}</p>
  {/snippet}
</Menu>

<style>
  .note { margin: 4px 0 2px; padding: 8px 10px 4px; border-top: 1px solid var(--hair); font: 500 11.5px/1.45 var(--f-sans); color: var(--muted); }
</style>
