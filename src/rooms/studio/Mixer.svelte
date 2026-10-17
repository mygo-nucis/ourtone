<script lang="ts">
  import Strip from './Strip.svelte';
  import Fader from '../../components/ui/Fader.svelte';
  import PartChip from '../../components/ui/PartChip.svelte';
  import { studio } from '../../lib/project/studio.svelte';
  import { transport } from '../../lib/audio/transport.svelte';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { meter } from './meters';

  /* the console under the timeline: one strip per part, the master pinned at the right */
  let { s, w }: { s: number; w: number } = $props();
  const n = $derived(transport.song?.parts.length ?? 0);
  const master = $derived(transport.song?.data.master ?? 0);
  const fmtDb = (d: number) => d <= -79.9 ? '−∞' : (d > 0.05 ? '+' : d < -0.05 ? '−' : '') + Math.abs(d).toFixed(1);
  let scroller: HTMLDivElement;
  function wheel(e: WheelEvent) {
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && !(e.target as Element).closest('[role="slider"]')) { scroller.scrollLeft += e.deltaY; e.preventDefault(); }
  }
</script>

<section class="mixer" class:night={theme.night} style="width:{w}px" aria-label={i18n.t('mixer')}>
  <header>
    <span class="tab on">{i18n.t('mixer')}</span>
    <span class="hint">{i18n.t('mixerHint')}</span>
  </header>
  <div class="row">
    <div class="parts" bind:this={scroller} onwheel={wheel}>
      {#each Array.from({ length: n }, (_, k) => k) as i (i)}
        <Strip {i} {s} />
      {/each}
    </div>
    <div class="strip master">
      <div class="who">
        <PartChip icon="speaker" color={theme.night ? '#6B7280' : '#DCE3EC'} size={26} />
        <span class="txt"><span class="nm">{i18n.t('master')}</span><span class="sub">{i18n.t('stereo')}</span></span>
      </div>
      <p class="ins">{i18n.t('fxGlue')} · {i18n.t('fxLimiter')}</p>
      <div class="lufs"><span class="big ut-num" use:meter={{ kind: 'lufs', i: -1, s }}>−∞</span><span class="lab">{i18n.t('loudness')}</span></div>
      <div class="fad">
        <Fader db={master} def={0} label={i18n.t('master')} onchange={(d, k) => studio.setMeta('opMaster', { master: d }, k)} />
        <canvas class="mt" use:meter={{ kind: 'strip', i: -1, s }} width="20" height="104" aria-hidden="true"></canvas>
        <span class="db ut-num">{fmtDb(master)}</span>
        <span class="dbu">dB</span>
      </div>
    </div>
  </div>
</section>

<style>
  .mixer { position: relative; display: flex; flex-direction: column; height: 300px; border-top: 1px solid var(--hair); }
  header { flex: none; display: flex; align-items: center; gap: 24px; height: 30px; padding: 0 16px; background: var(--alt); border-bottom: 1px solid var(--hair); }
  .tab { position: relative; font: 900 13px/30px var(--f-sans); letter-spacing: 2px; color: var(--ink); }
  :global(:root:lang(en)) .tab { letter-spacing: .04em; }
  .tab.on::after { content: ''; position: absolute; left: 0; right: 2px; bottom: 0; height: 3px; background: var(--accent); }
  .hint { margin-left: auto; font: 500 11px/1 var(--f-sans); color: var(--muted); }
  .row { flex: 1; display: flex; min-height: 0; }
  .parts { flex: 1; display: flex; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
  .parts > :global(.strip:first-child) { border-left: 0; }
  .strip.master { position: relative; flex: none; width: 147px; background: var(--p2); border-left: 1px solid var(--hair); box-shadow: -8px 0 16px -12px var(--shadow); }
  .who { position: absolute; left: 12px; top: 12px; display: flex; gap: 8px; }
  .txt { display: flex; flex-direction: column; padding-top: 1px; }
  .nm { font: 700 13px/1.25 var(--f-sans); color: var(--ink); }
  .sub { font: 500 11px/1.4 var(--f-sans); color: var(--muted); }
  .ins { position: absolute; left: 12px; right: 8px; top: 50px; margin: 0; font: 700 10.5px/14px var(--f-sans); color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lufs { position: absolute; left: 14px; top: 76px; display: flex; flex-direction: column; gap: 6px; }
  .lufs .big { font-size: 22px; color: var(--ink); }
  .night .lufs .big { font-size: 25px; }
  .lufs .lab { font: 700 10px/1 var(--f-sans); color: var(--muted); }
  .fad { position: absolute; left: 0; right: 0; top: 124px; height: 118px; }
  .fad :global(.fader) { position: absolute; left: 27px; top: 0; }
  .mt { position: absolute; left: 72px; top: 7px; width: 20px; height: 104px; }
  .db { position: absolute; right: 10px; top: 9px; font-size: 14px; color: var(--ink); }
  .night .db { font-size: 16px; }
  .dbu { position: absolute; right: 10px; top: 27px; font: 700 10px/1 var(--f-sans); color: var(--muted); }
</style>
