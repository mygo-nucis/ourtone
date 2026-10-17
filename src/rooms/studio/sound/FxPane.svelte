<script lang="ts">
  import Panel from './Panel.svelte';
  import Knob from '../../../components/ui/Knob.svelte';
  import Toggle from '../../../components/ui/Toggle.svelte';
  import { studio } from '../../../lib/project/studio.svelte';
  import { transport } from '../../../lib/audio/transport.svelte';
  import { fxOf, type Fx } from '../../../lib/audio/fx';
  import { mixOf } from '../../../lib/audio/strip';
  import { theme } from '../../../lib/state/theme.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';

  /* the part's effects chain in the order the signal meets it; each card switches on and off, and opens for its knobs.
     delay and reverb are sends to the shared echo and room */
  let { h }: { h: number } = $props();
  const part = $derived(transport.song?.parts[studio.part]);
  const fx = $derived(fxOf(part?.data.fx));
  const mix = $derived(part ? mixOf(part) : null);
  let open = $state<string>('');
  const zh = $derived(i18n.lang === 'zh');
  function setFx(fn: (f: Fx) => void, key?: string) {
    const f = fxOf(part?.data.fx); fn(f);
    studio.setPart('opFx', studio.part, { fx: f }, key);
  }
  const sgn = (x: number) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(Math.round(x));
  const eqCurve = $derived.by(() => { let d = ''; for (let j = 0; j <= 40; j++) { const t = j / 40; d += (j ? 'L' : 'M') + (t * 184).toFixed(1) + ' ' + (13 - (fx.eq.low / 12 * 9) * Math.exp(-((t - .12) ** 2) / .01) - (fx.eq.mid / 12 * 9) * Math.exp(-((t - .5) ** 2) / .012) - (fx.eq.high / 12 * 9) * Math.exp(-((t - .9) ** 2) / .02)).toFixed(1); } return d; });
  const room = $derived(theme.night ? (zh ? '大厅' : 'Hall') : (zh ? '房间' : 'Room'));
</script>

<Panel zh="效果链" en="Effects" day="FX chain" night="Effectus" cls="fxp">
  <div class="list" style="max-height:{h - 44}px">
    {#if mix}
      {#each ['eq', 'comp', 'chorus', 'drive', 'delay', 'verb'] as k, i (k)}
        {@const on = k === 'eq' ? fx.eq.on && (fx.eq.low || fx.eq.mid || fx.eq.high) !== 0 : k === 'comp' ? fx.comp.on : k === 'chorus' ? fx.chorus.on : k === 'drive' ? fx.drive.on : k === 'delay' ? mix.dly > .005 : mix.rev > .005}
        {#if i}<div class="join" aria-hidden="true">{#if theme.night}<i></i>{:else}<svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 1.5l4 5 4-5" fill="none" stroke="var(--muted)" stroke-width="1.4" /></svg>{/if}</div>{/if}
        <div class="card ut-box" class:off={!on} class:open={open === k}>
          <button class="hd" onclick={() => (open = open === k ? '' : k)} aria-expanded={open === k}>
            <span class="nm">{k === 'eq' ? (zh ? '三段 EQ' : '3-band EQ') : k === 'comp' ? (zh ? '压缩' : 'Compressor') : k === 'chorus' ? (zh ? '合唱' : 'Chorus') : k === 'drive' ? (zh ? '过载' : 'Drive') : k === 'delay' ? (zh ? '延迟' : 'Delay') : (zh ? '混响' : 'Reverb')}</span>
            <span class="sm">{k === 'eq' ? (zh ? `低 ${sgn(fx.eq.low)} · 中 ${sgn(fx.eq.mid)} · 高 ${sgn(fx.eq.high)}` : `Low ${sgn(fx.eq.low)} · mid ${sgn(fx.eq.mid)} · high ${sgn(fx.eq.high)}`)
              : k === 'comp' ? `${zh ? '阈值' : 'Threshold'} ${fx.comp.thr.toFixed(1).replace('-', '−')} dB · ${fx.comp.ratio.toFixed(1)}:1`
              : k === 'chorus' ? `${zh ? '混合' : 'Mix'} ${Math.round(fx.chorus.mix * 100)}% · ${fx.chorus.rate.toFixed(1)} Hz`
              : k === 'drive' ? `${zh ? '强度' : 'Amount'} ${Math.round(fx.drive.amt * 100)}%`
              : k === 'delay' ? `${zh ? '附点八分' : 'Dotted eighth'} · ${Math.round(mix.dly * 100)}%`
              : `${room} · ${Math.round(mix.rev * 100)}%`}</span>
          </button>
          <span class="tg"><Toggle {on} label="on" onchange={(v) => {
            if (k === 'eq') setFx(f => { f.eq.on = v; if (v && !f.eq.low && !f.eq.mid && !f.eq.high) f.eq.high = 3; });
            else if (k === 'comp') setFx(f => { f.comp.on = v; });
            else if (k === 'chorus') setFx(f => { f.chorus.on = v; });
            else if (k === 'drive') setFx(f => { f.drive.on = v; });
            else if (k === 'delay') studio.setMix('opMix', studio.part, { dly: v ? .22 : 0 });
            else studio.setMix('opMix', studio.part, { rev: v ? .28 : 0 });
          }} /></span>
          <svg class="viz" width="184" height="26" viewBox="0 0 184 26" aria-hidden="true">
            {#if k === 'eq'}<path d={eqCurve} fill="none" stroke="var(--accent)" stroke-width="2" />
            {:else if k === 'comp'}{#each [4, 7, 12, 16, 18, 14, 9, 6, 11, 17, 20, 15, 10, 6, 8, 13, 18, 16, 11, 7] as bh, j}<rect x={j * 9.2} y={2} width="6" height={Math.min(bh, 26 + fx.comp.thr / 2) * .9} rx={theme.night ? 0 : 1.5} fill="var(--accent)" opacity=".8" />{/each}
            {:else if k === 'chorus'}<path d={Array.from({ length: 25 }, (_, j) => `${j ? 'L' : 'M'}${(j / 24 * 184).toFixed(1)} ${(13 - Math.sin(j / 24 * Math.PI * 2 * (1 + fx.chorus.rate)) * 9).toFixed(1)}`).join('')} fill="none" stroke="var(--accent)" stroke-width="1.5" />
            {:else if k === 'drive'}<path d={Array.from({ length: 25 }, (_, j) => { const x = j / 24 * 2 - 1, kk = 1 + fx.drive.amt * 9; return `${j ? 'L' : 'M'}${(j / 24 * 184).toFixed(1)} ${(13 - Math.tanh(kk * x) / Math.tanh(kk) * 11).toFixed(1)}`; }).join('')} fill="none" stroke="var(--accent)" stroke-width="1.8" />
            {:else if k === 'delay'}{#each Array.from({ length: 7 }, (_, j) => j) as j}<rect x={j * 27} y={26 - 24 * Math.pow(.62, j)} width="5" height={24 * Math.pow(.62, j)} rx={theme.night ? 0 : 2} fill="var(--accent)" />{/each}
            {:else}<path d={`M0 26${Array.from({ length: 41 }, (_, j) => `L${(j / 40 * 184).toFixed(1)} ${(26 - 24 * Math.exp(-j / 40 * 3.2) * (.75 + .25 * Math.sin(j * 2.3))).toFixed(1)}`).join('')}L184 26Z`} fill="var(--accent)" opacity=".5" />{/if}
          </svg>
          {#if open === k}
            <div class="knobs">
              {#if k === 'eq'}
                {#each [['low', zh ? '低' : 'Low'], ['mid', zh ? '中' : 'Mid'], ['high', zh ? '高' : 'High']] as [b, l]}
                  <Knob r={12} bipolar value={(fx.eq[b as 'low'] + 12) / 24} def={.5} label="{l} {sgn(fx.eq[b as 'low'])}" fs={10} gap={4} onchange={(v, key) => setFx(f => { f.eq.on = true; f.eq[b as 'low'] = Math.round((v - .5) * 24 * 2) / 2; }, key)} />
                {/each}
              {:else if k === 'comp'}
                <Knob r={12} value={(fx.comp.thr + 40) / 40} def={.55} label={zh ? '阈值' : 'Threshold'} fs={10} gap={4} onchange={(v, key) => setFx(f => { f.comp.on = true; f.comp.thr = Math.round(v * 40 - 40); }, key)} />
                <Knob r={12} value={(fx.comp.ratio - 1) / 9} def={.22} label={zh ? '比例' : 'Ratio'} fs={10} gap={4} onchange={(v, key) => setFx(f => { f.comp.on = true; f.comp.ratio = +(1 + v * 9).toFixed(1); }, key)} />
                <Knob r={12} value={fx.comp.attack / .05} def={.12} label={zh ? '起音' : 'Attack'} fs={10} gap={4} onchange={(v, key) => setFx(f => { f.comp.on = true; f.comp.attack = +(Math.max(.001, v * .05)).toFixed(3); }, key)} />
              {:else if k === 'chorus'}
                <Knob r={12} value={fx.chorus.mix} def={.35} label={zh ? '混合' : 'Mix'} fs={10} gap={4} onchange={(v, key) => setFx(f => { f.chorus.on = true; f.chorus.mix = +v.toFixed(2); }, key)} />
                <Knob r={12} value={fx.chorus.rate / 4} def={.2} label={zh ? '速度' : 'Rate'} fs={10} gap={4} onchange={(v, key) => setFx(f => { f.chorus.on = true; f.chorus.rate = +(Math.max(.05, v * 4)).toFixed(2); }, key)} />
                <Knob r={12} value={fx.chorus.depth} def={.4} label={zh ? '深度' : 'Depth'} fs={10} gap={4} onchange={(v, key) => setFx(f => { f.chorus.on = true; f.chorus.depth = +v.toFixed(2); }, key)} />
              {:else if k === 'drive'}
                <Knob r={12} value={fx.drive.amt} def={.3} label={zh ? '强度' : 'Amount'} fs={10} gap={4} onchange={(v, key) => setFx(f => { f.drive.on = true; f.drive.amt = +v.toFixed(2); }, key)} />
              {:else if k === 'delay'}
                <Knob r={12} value={mix.dly} def={0} label={zh ? '送量' : 'Send'} fs={10} gap={4} onchange={(v, key) => studio.setMix('opMix', studio.part, { dly: +v.toFixed(3) }, key)} />
              {:else}
                <Knob r={12} value={mix.rev} def={.25} label={zh ? '送量' : 'Send'} fs={10} gap={4} onchange={(v, key) => studio.setMix('opMix', studio.part, { rev: +v.toFixed(3) }, key)} />
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</Panel>

<style>
  .list { overflow-y: auto; padding: 0 16px 14px; scrollbar-width: thin; }
  .card { position: relative; padding: 12px 14px 10px; background: var(--surface); }
  :global([data-sky="night"]) .card { background: var(--well); }
  .card.off { opacity: .62; }
  .card.open { --bc: var(--accent); opacity: 1; }
  .hd { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; width: calc(100% - 44px); text-align: left; }
  .nm { font: 900 13px/1 var(--f-sans); color: var(--ink); }
  .off .nm { color: var(--muted); }
  .sm { font: 500 11px/1.2 var(--f-sans); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .tg { position: absolute; right: 12px; top: 11px; }
  .viz { display: block; margin-top: 8px; overflow: visible; }
  .off .viz { filter: grayscale(1); }
  .knobs { display: flex; justify-content: space-around; padding: 12px 0 2px; }
  .join { display: grid; place-items: center; height: 12px; }
  .join i { width: 6px; height: 8px; background: var(--orn); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
</style>
