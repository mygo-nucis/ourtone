<script lang="ts">
  import { onDestroy } from 'svelte';
  import SoundLib from './SoundLib.svelte';
  import SrcA from './SrcA.svelte';
  import SrcB from './SrcB.svelte';
  import FilterPane from './FilterPane.svelte';
  import EnvPane from './EnvPane.svelte';
  import LfoPane from './LfoPane.svelte';
  import MacroPane from './MacroPane.svelte';
  import FxPane from './FxPane.svelte';
  import OutPane from './OutPane.svelte';
  import KeysPane from './KeysPane.svelte';
  import { studio, isDrums, isAudio } from '../../../lib/project/studio.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';
  import { current } from '../sound.svelte';

  /* 音色: the focused part's sound. left, the library; middle, the sources and how they are shaped; right, the effects
     and what comes out; underneath, a keyboard to try it. drums keep their kit and get the effects and macros only */
  let { W, h, s, compact = false }: { W: number; h: number; s: number; compact?: boolean } = $props();
  const LIB = 256, RIGHT = 260;
  const CW = $derived(compact ? W : W - LIB - RIGHT);
  const inner = $derived(CW - 32);
  const colA = $derived(Math.round((inner - 12) * .498)), colB = $derived(inner - 12 - colA);
  const colL = $derived(Math.round((inner - 12) * .363)), colM = $derived(inner - 12 - colL);
  const p = $derived(current());
  const drums = $derived.by(() => { void studio.rev; const m = studio.doc?.parts[studio.part]?.meta; return !!m && isDrums(m); });
  const audio = $derived.by(() => { void studio.rev; const m = studio.doc?.parts[studio.part]?.meta; return !!m && isAudio(m); });
</script>

<div class="sv" style="height:{h}px">
  {#if !compact}<SoundLib {h} />{/if}
  <div class="mid" class:compact style="width:{CW}px">
    <div class="scroll" style={compact ? `height:${h - 95}px` : ''}>
    {#if p}
      {#if drums || audio}
        <div class="drums">
          <div class="c" style="width:{colL}px"><div class="note ut-box"><p>{audio ? i18n.t('soundAudioNote') : i18n.t('soundDrumsNote')}</p></div></div>
          <div class="c" style="width:{colM}px;height:180px"><MacroPane /></div>
        </div>
      {:else}
        <div class="row r1"><div class="c" style="width:{colA}px"><SrcA {p} w={colA} /></div><div class="c" style="width:{colB}px"><SrcB {p} w={colB} /></div></div>
        <div class="row r2"><div class="c" style="width:{colA}px"><FilterPane {p} w={colA} /></div><div class="c" style="width:{colB}px"><EnvPane {p} w={colB} /></div></div>
        <div class="row r3"><div class="c" style="width:{colL}px"><LfoPane {p} w={colL} /></div><div class="c" style="width:{colM}px"><MacroPane /></div></div>
      {/if}
      {#if compact}
        <div class="row r4"><div class="c" style="width:{colA}px"><FxPane h={360} /></div><div class="c" style="width:{colB}px;height:180px"><OutPane {s} /></div></div>
      {/if}
    {/if}
    </div>
    {#if p && !audio}<div class="kb"><KeysPane w={inner} {compact} /></div>{/if}
  </div>
  {#if !compact}
    <div class="right">
      <div class="fx"><FxPane h={Math.max(300, h - 212)} /></div>
      <div class="out"><OutPane {s} /></div>
    </div>
  {/if}
</div>

<style>
  .sv { position: relative; display: flex; background: var(--page); }
  .mid { position: relative; flex: none; padding: 12px 16px 0; display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; gap: 12px; }
  .r1, .r2 { height: 232px; }
  .r3 { height: 180px; }
  .c { display: flex; }
  .c > :global(.panel) { flex: 1; }
  .kb { margin-top: 2px; }
  .scroll { display: flex; flex-direction: column; gap: 10px; }
  .compact .scroll { overflow-y: auto; scrollbar-width: thin; padding-bottom: 10px; }
  .compact { padding-top: 8px; }
  .r4 { height: 360px; align-items: flex-start; }
  .drums { display: flex; gap: 12px; height: 180px; }
  .note { flex: 1; display: grid; place-items: center; padding: 20px; background: var(--surface); }
  .note p { margin: 0; font: 500 13px/1.7 var(--f-sans); color: var(--muted); }
  .right { position: relative; width: 260px; flex: none; display: flex; flex-direction: column; gap: 12px; padding: 12px 16px 0 0; }
  .fx { flex: 1; min-height: 0; display: flex; }
  .fx > :global(.panel) { flex: 1; }
  .out { height: 180px; display: flex; }
  .out > :global(.panel) { flex: 1; }
</style>
