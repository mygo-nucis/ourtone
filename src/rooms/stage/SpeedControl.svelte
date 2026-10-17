<svelte:options namespace="svg" />
<script lang="ts">
  import type { StageLayout } from './layout';
  import { speed, SPANS } from './speed.svelte';
  import { F, measure } from '../../lib/art/type';
  import { fonts } from '../../lib/state/fonts.svelte';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';

  /* note speed: six marks that grow left to right, lit up to the current level */
  let { L }: { L: StageLayout } = $props();
  const lvl = $derived(speed.level);
  const th = $derived(theme.pal);
  /** laid out from its right edge (on the stage) or its left (in play mode's panel): the label, then the marks; a phone
      packs them closer, beside the progress staff */
  const step = $derived(L.compact ? 13 : 15);
  const gap = $derived(L.compact ? 11 : 14);
  const start = $derived(L.speed.anchor === 'start');
  const labelW = $derived.by(() => {
    void fonts.version;
    const t = i18n.t('speedLabel');
    return measure(t, theme.night ? `600 15px ${F.gar}` : `700 12px ${F.sans}`) + (theme.night ? .3 : 1.5) * t.length;
  });
  const x0 = $derived(start ? L.speed.x + labelW + gap : L.speed.x - (SPANS.length - 1) * step - 4);
  const labelX = $derived(start ? L.speed.x : x0 - gap);
</script>

<g class="speed" role="group" aria-label={i18n.t('speedLabel')}>
  <title>{i18n.t('speedHint')}</title>
  <text x={labelX} y={L.speed.y} text-anchor={start ? 'start' : 'end'} font-family={theme.night ? F.gar : F.sans} font-weight={theme.night ? 600 : 700} font-size={theme.night ? 15 : 12}
    fill={th.muted} letter-spacing={theme.night ? .3 : 1.5}>{i18n.t('speedLabel')}</text>
  {#each SPANS as _, i}
    {@const x = x0 + i * step}
    {@const h = 6 + i * 2.2}
    {@const lit = i <= lvl}
    <g class="mark" role="button" tabindex="-1" aria-label="{i18n.t('speedLabel')} {i + 1}" aria-pressed={i === lvl}
      onclick={() => speed.set(i)} onkeydown={() => {}}>
      <rect x={x - step / 2} y={L.speed.y - 22} width={step} height="28" fill="transparent" />
      {#if theme.night}
        <path d="M{x} {L.speed.y - 2 - h}L{x + h * .36} {L.speed.y - 2 - h / 2}L{x} {L.speed.y - 2}L{x - h * .36} {L.speed.y - 2 - h / 2}Z"
          fill={lit ? th.orn : 'none'} stroke={lit ? th.orn : 'rgba(216,180,106,.45)'} stroke-width="1" class="pip" />
      {:else}
        <rect x={x - 2.6} y={L.speed.y - 1 - h} width="5.2" height={h} rx="2.6" fill={lit ? th.accent : '#FFFFFF'} stroke={lit ? th.accent : th.muted} stroke-width="1.3" class="pip" />
      {/if}
    </g>
  {/each}
</g>

<style>
  .speed { pointer-events: auto; }
  .mark { cursor: pointer; outline: none; }
  .pip { transition: fill .2s, stroke .2s; }
  .mark:hover .pip { stroke-width: 1.8; }
</style>
