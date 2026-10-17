<script lang="ts">
  import { iconSVG } from '../../lib/art/icons';
  import { archD } from '../../lib/art/svg';
  import { theme } from '../../lib/state/theme.svelte';
  /* a part's badge: the bare sticker by day, the icon in a small dark arch by night.
     the box is the icon's nominal square; the night arch rises a little above it */
  let { icon, color, size = 28 }: { icon: string; color: string; size?: number } = $props();
</script>

<svg class="chip" width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
  {#if theme.night}
    <path d={archD(-size * .06, -size * .22, size * 1.12, size * 1.3)} fill="#0B0A0E" stroke="rgba(216,180,106,.6)" stroke-width="1" />
    <g transform="translate({size * .04} {size * .06}) scale({(size * .92) / 24})">{@html iconSVG(icon, true, color)}</g>
  {:else}
    <g transform="translate({-size * .06} {-size * .06}) scale({(size * 1.12) / 24})">{@html iconSVG(icon, false, color)}</g>
  {/if}
</svg>

<style>
  .chip { display: block; flex: none; overflow: visible; }
</style>
