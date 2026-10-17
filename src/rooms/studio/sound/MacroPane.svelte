<script lang="ts">
  import Panel from './Panel.svelte';
  import Knob from '../../../components/ui/Knob.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';
  import { MACROS, macroValue, macroDef, setMacro } from '../macros';

  /* the five macro knobs, with what each one moves */
</script>

<Panel zh="宏旋钮" en="Macros" day="Macros" night="Claves">
  {#snippet right()}<span class="note">{i18n.lang === 'zh' ? '录音室检查器里只显示这五个' : 'The studio inspector shows just these five'}</span>{/snippet}
  <div class="row">
    {#each MACROS as m}
      <div class="m">
        <Knob r={21} value={macroValue(m.k)} def={macroDef(m.k)} bipolar={m.k === 'bright' || m.k === 'attack'} title="{i18n.t(m.label)} {Math.round(macroValue(m.k) * 100)}%" onchange={(v, k) => setMacro(m.k, v, k)} />
        <span class="l">{i18n.t(m.label)}</span>
        <span class="h">{i18n.t(m.hint)}</span>
      </div>
    {/each}
  </div>
</Panel>

<style>
  .note { font: 500 11px/1 var(--f-sans); color: var(--muted); white-space: nowrap; }
  .row { display: flex; justify-content: space-around; padding: 10px 16px 0; }
  .m { display: flex; flex-direction: column; align-items: center; gap: 0; }
  .l { margin-top: 12px; font: 900 13px/1 var(--f-sans); letter-spacing: 1px; color: var(--ink); }
  .h { margin-top: 7px; font: 500 10.5px/1 var(--f-sans); color: var(--muted); white-space: nowrap; }
</style>
