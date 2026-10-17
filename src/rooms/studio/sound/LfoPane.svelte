<script lang="ts">
  import { untrack } from 'svelte';
  import Panel from './Panel.svelte';
  import Knob from '../../../components/ui/Knob.svelte';
  import Menu from '../../../components/ui/Menu.svelte';
  import Icon from '../../../components/ui/Icon.svelte';
  import { theme } from '../../../lib/state/theme.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';
  import type { Patch } from '../../../lib/audio/patch';
  import { edit, ensureVf } from '../sound.svelte';

  /* one low-frequency oscillator, aimed at pitch (vibrato), the filter (wah) or loudness (tremolo) */
  let { p, w }: { p: Patch; w: number } = $props();
  type Target = 'pitch' | 'filter' | 'amp';
  let target = $state<Target>(untrack(() => p.vib ? 'pitch' : p.vf?.lfo ? 'filter' : p.trem ? 'amp' : 'pitch'));
  const NAMES: Record<Target, [string, string]> = { pitch: ['音高', 'Pitch'], filter: ['滤波', 'Filter'], amp: ['音量', 'Level'] };
  const cur = $derived.by(() => {
    if (target === 'pitch') return { rate: p.vib?.rate ?? 5.5, depth: p.vib?.depth ?? 0, delay: p.vib?.delay ?? .3, max: 60 };
    if (target === 'filter') return { rate: p.vf?.lfo?.rate ?? 2, depth: p.vf?.lfo?.depth ?? 0, delay: p.vf?.lfo?.delay ?? 0, max: 3 };
    return { rate: p.trem?.rate ?? 5, depth: p.trem?.depth ?? 0, delay: 0, max: 1 };
  });
  function put(rate: number, depth: number, delay: number, key: string) {
    edit(q => {
      if (target === 'pitch') { if (depth <= .01) delete q.vib; else q.vib = { rate, depth, delay, ramp: .35 }; }
      else if (target === 'filter') { const f = ensureVf(q); if (depth <= .01) delete f.lfo; else { f.lfo = { rate, depth, delay }; if (f.cut >= 19990) f.cut = 1600; } }
      else { if (depth <= .01) delete q.trem; else q.trem = { rate, depth }; }
    }, key);
  }
  const LX0 = 20, LX1 = $derived(w - 20), LY = 44;
  const wave = $derived.by(() => {
    let d = '';
    const cycles = Math.max(2, Math.min(9, cur.rate)), dl = Math.min(.6, cur.delay / 2), amp = cur.depth > 0 ? 20 : 4;
    for (let i = 0; i <= 140; i++) { const t = i / 140, a = Math.max(0, Math.min(1, (t - dl) / .25)) * amp; d += (i ? 'L' : 'M') + (LX0 + t * (LX1 - LX0)).toFixed(1) + ' ' + (LY - a * Math.sin(t * Math.PI * 2 * cycles)).toFixed(1); }
    return d;
  });
  const dx = $derived(LX0 + Math.min(.6, cur.delay / 2) * (LX1 - LX0));
  let open = $state(false);
</script>

<Panel zh="低频振荡" en="LFO" day="LFO" night="Motus">
  {#snippet right()}
    <Menu bind:open width={140} align="right" label="LFO">
      {#snippet trigger({ toggle })}<button class="tgt ut-box" onclick={toggle}>{i18n.lang === 'zh' ? '目标' : 'To'} · {NAMES[target][i18n.lang === 'zh' ? 0 : 1]}<Icon name="down" size={13} sw={2} /></button>{/snippet}
      {#snippet children({ close })}
        {#each ['pitch', 'filter', 'amp'] as t}<button class="mi" class:on={target === t} role="menuitemradio" aria-checked={target === t} onclick={() => { target = t as Target; close(); }}>{NAMES[t as Target][i18n.lang === 'zh' ? 0 : 1]}</button>{/each}
      {/snippet}
    </Menu>
  {/snippet}
  <svg class="lfo" width={w} height="72" viewBox="0 0 {w} 72" aria-hidden="true">
    <line x1={LX0} y1={LY} x2={LX1} y2={LY} stroke="var(--hair)" />
    <path d={wave} fill="none" stroke={theme.pal.accent} stroke-width="2" opacity={cur.depth > 0 ? 1 : .35} />
    {#if target !== 'amp'}<line x1={dx} y1={LY - 26} x2={dx} y2={LY + 26} stroke={theme.pal.muted} stroke-dasharray="2 3" />{/if}
  </svg>
  <div class="knobs">
    <Knob r={13} value={Math.log(cur.rate / .2) / Math.log(60)} def={.7} label="{i18n.lang === 'zh' ? '速度' : 'Rate'} {cur.rate.toFixed(1)} Hz" fs={10.5} gap={5} onchange={(v, k) => put(+(.2 * Math.pow(60, v)).toFixed(2), cur.depth, cur.delay, k)} />
    <Knob r={13} value={cur.depth / cur.max} def={0} label="{i18n.lang === 'zh' ? '深度' : 'Depth'} {target === 'pitch' ? `${Math.round(cur.depth)} ${i18n.lang === 'zh' ? '音分' : 'ct'}` : target === 'filter' ? `${cur.depth.toFixed(1)} oct` : `${Math.round(cur.depth * 100)}%`}" fs={10.5} gap={5} onchange={(v, k) => put(cur.rate, +(v * cur.max).toFixed(3), cur.delay, k)} />
    <Knob r={13} value={cur.delay / 2} def={.15} disabled={target === 'amp'} label="{i18n.lang === 'zh' ? '延迟' : 'Delay'} {cur.delay.toFixed(1)} {i18n.lang === 'zh' ? '秒' : 's'}" fs={10.5} gap={5} onchange={(v, k) => put(cur.rate, cur.depth, +(v * 2).toFixed(2), k)} />
  </div>
</Panel>

<style>
  .lfo { display: block; }
  .knobs { display: flex; justify-content: space-around; padding: 0 12px; }
  .tgt { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px 0 12px; font: 700 11px/1 var(--f-sans); color: var(--ink2); background: var(--surface); }
  :global([data-sky="night"]) .tgt { background: var(--well); }
</style>
