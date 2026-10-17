<script lang="ts">
  import { theme } from '../../lib/state/theme.svelte';
  /* an on/off switch: a pill by day; a chamfered slot with a lozenge by night */
  let { on, label = '', onchange }: { on: boolean; label?: string; onchange: (on: boolean) => void } = $props();
</script>

<button class="tg" class:on class:night={theme.night} role="switch" aria-checked={on} aria-label={label} onclick={() => onchange(!on)}>
  <svg width="34" height="18" viewBox="0 0 34 18" aria-hidden="true">
    {#if theme.night}
      <path d="M4 .5H30L33.5 4V14L30 17.5H4L.5 14V4Z" fill={on ? '#C4293E' : 'none'} stroke={on ? 'none' : 'rgba(237,230,225,.2)'} />
      <path class="k" d="M{on ? 25 : 9} 3L{on ? 29.3 : 13.3} 9L{on ? 25 : 9} 15L{on ? 20.7 : 4.7} 9Z" fill={on ? '#FFF3EE' : '#8E8792'} />
    {:else}
      <rect width="34" height="18" rx="9" fill={on ? '#2F86E8' : '#D5DCE6'} />
      <circle class="k" cx={on ? 25 : 9} cy="9" r="6.5" fill="#FFFFFF" />
    {/if}
  </svg>
</button>

<style>
  .tg { display: block; flex: none; border-radius: 9px; }
  .tg svg { display: block; }
  .k { transition: cx .18s, d .18s; }
  .tg:focus-visible { box-shadow: 0 0 0 2px var(--accent); }
</style>
