<script lang="ts">
  import type { Snippet } from 'svelte';
  import { theme } from '../../../lib/state/theme.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';

  /* a sound-view panel: a white card with a blue latin label by day; by night a dark plate with a gold inner rule,
     lozenges at the corners and a blackletter latin name (mixed case, never capitals). `crowded`: a panel whose header
     carries more controls drops the latin name when narrow, so the controls stay inside */
  let { zh, en, day, night, right, children, cls = '', crowded = false }: { zh: string; en: string; day: string; night: string; right?: Snippet; children: Snippet; cls?: string; crowded?: boolean } = $props();
</script>

<section class="panel {cls}" class:night={theme.night} class:crowded>
  {#if theme.night}
    <svg class="corners" aria-hidden="true"><path d="M0 -4L2.9 0L0 4L-2.9 0Z" class="c tl" /><path d="M0 -4L2.9 0L0 4L-2.9 0Z" class="c tr" /><path d="M0 -4L2.9 0L0 4L-2.9 0Z" class="c bl" /><path d="M0 -4L2.9 0L0 4L-2.9 0Z" class="c br" /></svg>
  {/if}
  <header>
    {#if theme.night}<span class="loz" aria-hidden="true"></span>{/if}
    <h3>{i18n.lang === 'zh' ? zh : en}</h3>
    {#if i18n.lang === 'zh' || theme.night}<span class="lat">{theme.night ? night : day}</span>{/if}
    <span class="gap"></span>
    {#if right}{@render right()}{/if}
  </header>
  <div class="body">{@render children()}</div>
</section>

<style>
  .panel { position: relative; display: flex; flex-direction: column; min-width: 0; background: var(--surface); border-radius: 12px; box-shadow: 0 0 0 1px var(--hair), 2px 5px 0 rgba(28, 32, 48, .05); }
  header { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 16px 0 18px; flex: none; }
  h3 { margin: 0; font: 900 14px/1 var(--f-sans); letter-spacing: 2px; color: var(--ink); white-space: nowrap; }
  :global(:root:lang(en)) h3 { letter-spacing: .02em; }
  .lat { font: italic 900 11px/1 var(--f-disp); font-stretch: 112%; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); white-space: nowrap; }
  .gap { flex: 1; }
  .crowded { container-type: inline-size; }
  @container (max-width: 500px) { :global(:root:lang(en)) .crowded .lat { display: none; } }
  .body { position: relative; flex: 1; min-height: 0; }
  .night { background: var(--surface); border-radius: 0; box-shadow: 0 0 0 1px var(--hair), inset 0 0 0 4px var(--surface), inset 0 0 0 5px rgba(216, 180, 106, .14); }
  .night h3 { font: 700 15px/1 var(--f-serif); letter-spacing: 1px; }
  .night .lat { font: 400 17px/1 var(--f-goth); letter-spacing: .5px; text-transform: none; color: var(--orn); }
  .loz { width: 7px; height: 10px; background: var(--accent); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); flex: none; }
  .corners { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .c { fill: #D8B46A; opacity: .75; }
  .tl { transform: translate(0, 0); }
  .tr { transform: translate(100%, 0); }
  .bl { transform: translate(0, 100%); }
  .br { transform: translate(100%, 100%); }
</style>
