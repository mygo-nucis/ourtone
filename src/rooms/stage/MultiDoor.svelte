<script lang="ts">
  import type { StageLayout } from './layout';
  import { F, measure } from '../../lib/art/type';
  import { clamp } from '../../lib/util';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { fonts } from '../../lib/state/fonts.svelte';

  /* the Multi-Track button, where the transport ends. a first press dims the stage to pick windows; with some picked it
     says how many and lights up, and a second press plays them together (an empty pick just leaves). it stands above
     the dimming, on its own layer */
  let { L, picking, count, onclick }: { L: StageLayout; picking: boolean; count: number; onclick: () => void } = $props();
  const C = $derived(L.multi);
  const night = $derived(theme.night);
  const th = $derived(theme.pal);
  const zh = $derived(i18n.lang === 'zh');
  const go = $derived(picking && count > 0);
  const title = $derived(i18n.t('multi'));
  const sub = $derived(!picking ? i18n.t('multiSub') : !count ? i18n.t('multiPick') : count === 1 ? i18n.t('multiGoOne') : i18n.t('multiGo', { n: count }));
  // both lines fit between the left edge and the arrow
  const room = $derived(C.w - (night ? 20 : 18) - 36);
  const titleSize = $derived.by(() => { void fonts.version; const w = measure(title, `900 100px ${night ? F.serif : F.sans}`) / 100 + .02 * title.length; return clamp(room / w, 11, C.size); });
  const subFont = $derived(night ? (zh ? F.serif : F.goth) : F.sans);
  const subMax = $derived(night ? Math.round((zh ? 12 : 13 * 1.2) * C.h / 72) : 12 * C.h / 72);
  const subSize = $derived.by(() => { void fonts.version; const w = measure(sub, `${night && !zh ? 400 : 700} 100px ${subFont}`) / 100 + (night ? (zh ? .02 : .005) : .01) * sub.length; return clamp(room / w, 8, subMax); });
</script>

<svg class="md" width={L.W} height={L.H} viewBox="0 0 {L.W} {L.H}">
  <g class="btn door" class:go class:picking role="button" tabindex="0" aria-label="{title} · {sub}" aria-pressed={picking} {onclick} onkeydown={(e) => { if (e.key === 'Enter') onclick(); }}>
    {#if night}
      <path d="M{C.x + 10} {C.y}H{C.x + C.w - 10}L{C.x + C.w} {C.y + 10}V{C.y + C.h - 10}L{C.x + C.w - 10} {C.y + C.h}H{C.x + 10}L{C.x} {C.y + C.h - 10}V{C.y + 10}Z" fill={go ? '#3A0F1A' : '#0B0A0E'} stroke={th.orn} stroke-width={picking ? 2 : 1.3} class="face" />
      <path d="M{C.x + 12} {C.y + 5}H{C.x + C.w - 12}L{C.x + C.w - 5} {C.y + 12}V{C.y + C.h - 12}L{C.x + C.w - 12} {C.y + C.h - 5}H{C.x + 12}L{C.x + 5} {C.y + C.h - 12}V{C.y + 12}Z" fill="none" stroke={go ? 'rgba(216,180,106,.6)' : 'rgba(216,180,106,.3)'} />
      <text x={C.x + 20} y={C.y + C.h * .47} font-family={F.serif} font-weight="900" font-size={titleSize} fill={th.ink} letter-spacing={zh ? 2 : .3}>{title}</text>
      <text x={C.x + 20} y={C.y + C.h * .79} font-family={subFont} font-weight={zh ? 700 : 400} font-size={subSize} fill={th.orn} letter-spacing={zh ? 2 : .5}>{sub}</text>
      <path class="arrow" d="M{C.x + C.w - 30} {C.y + C.h / 2 - 7}l7 7-7 7" fill="none" stroke={go ? th.orn : th.accent} stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    {:else}
      <g class="tilt" style="transform-origin:{C.x + C.w / 2}px {C.y + C.h / 2}px">
        <rect x={C.x + 4} y={C.y + 6} width={C.w} height={C.h} rx="10" fill="rgba(28,32,48,.14)" />
        <rect x={C.x - 6} y={C.y - 6} width={C.w + 12} height={C.h + 12} rx="14" fill="#FFFFFF" />
        <rect x={C.x} y={C.y} width={C.w} height={C.h} rx="9" fill={go ? th.accent : '#FFFFFF'} stroke={th.ink} stroke-width="2" class="face" />
        <text x={C.x + 18} y={C.y + C.h * .46} font-family={F.sans} font-weight="900" font-size={titleSize} fill={go ? '#FFFFFF' : th.ink} letter-spacing={zh ? 2 : .3}>{title}</text>
        <text x={C.x + 18} y={C.y + C.h * .76} font-family={F.sans} font-weight="700" font-size={subSize} fill={go ? '#FFFFFF' : th.accent} letter-spacing="1">{sub}</text>
        <path class="arrow" d="M{C.x + C.w - 30} {C.y + C.h / 2 - 7}l7 7-7 7" fill="none" stroke={go ? '#FFFFFF' : th.accent} stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      </g>
      <path d="M{C.x + C.w + 4} {C.y - 22}Q{C.x + C.w + 6.5} {C.y - 10.5} {C.x + C.w + 18} {C.y - 8}Q{C.x + C.w + 6.5} {C.y - 5.5} {C.x + C.w + 4} {C.y + 6}Q{C.x + C.w + 1.5} {C.y - 5.5} {C.x + C.w - 10} {C.y - 8}Q{C.x + C.w + 1.5} {C.y - 10.5} {C.x + C.w + 4} {C.y - 22}Z" fill={th.accent} />
    {/if}
  </g>
</svg>

<style>
  .md { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 6; }
  .btn { pointer-events: auto; cursor: pointer; outline: none; }
  .btn .face { transition: filter .2s; }
  .btn:hover .face { filter: brightness(1.08); }
  .btn:focus-visible .face { stroke: var(--orn); stroke-width: 3; }
  /* the arrow leans toward where it leads; with parts picked it beckons */
  .arrow, .tilt { transition: transform .4s cubic-bezier(.3, 1.6, .5, 1); }
  .tilt { transform: rotate(-3deg); }
  .door:hover .arrow { transform: translateX(4px); }
  .door:hover .tilt, .door.picking .tilt { transform: rotate(-1.5deg) translateY(-3px); }
  .door.go .arrow { animation: beckon 1.1s ease-in-out infinite; }
  @keyframes beckon { 50% { transform: translateX(4px); } }
  @media (prefers-reduced-motion: reduce) { .door.go .arrow { animation: none; } }
</style>
