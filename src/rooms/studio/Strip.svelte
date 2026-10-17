<script lang="ts">
  import Knob from '../../components/ui/Knob.svelte';
  import Fader from '../../components/ui/Fader.svelte';
  import PartChip from '../../components/ui/PartChip.svelte';
  import { studio } from '../../lib/project/studio.svelte';
  import { transport } from '../../lib/audio/transport.svelte';
  import { defaultMix, mixOf } from '../../lib/audio/strip';
  import { effective, fxOf, macrosOf } from '../../lib/audio/fx';
  import { partColor } from '../../lib/art/palette';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import type { StringKey } from '../../lib/i18n/strings';
  import { meter } from './meters';
  import { MOD } from './frame';

  /* one mixer channel: the instrument (double-click for the sound view) and its active effects, reverb and delay sends,
     pan, fader with a live meter, mute and solo */
  let { i, s }: { i: number; s: number } = $props();
  const part = $derived(transport.song?.parts[i]);
  const mix = $derived(part ? mixOf(part) : null);
  const def = $derived(part ? defaultMix(part.data.role, part.data.preset, part.poly, part.drums, part.density) : null);
  const sel = $derived(studio.part === i);
  const soloing = $derived((transport.song?.parts ?? []).some(p => mixOf(p).solo));
  const inserts = $derived.by(() => {
    if (!part) return [] as StringKey[];
    const e = effective(fxOf(part.data.fx), macrosOf(part.data.macro)), out: StringKey[] = [];
    if (e.eq.on && (e.eq.low || e.eq.mid || e.eq.high)) out.push('fxEq');
    if (e.drive.on && e.drive.amt > 0) out.push('fxDrive');
    if (e.comp.on) out.push('fxComp');
    if (e.chorus.on) out.push('fxChorus');
    return out;
  });
  const fmtDb = (d: number) => d <= -79.9 ? '−∞' : (d > 0.05 ? '+' : d < -0.05 ? '−' : '') + Math.abs(d).toFixed(1);
  const fmtPan = (p: number) => Math.abs(p) < .02 ? (i18n.lang === 'zh' ? '居中' : 'C') : `${p < 0 ? 'L' : 'R'} ${Math.round(Math.abs(p) * 100)}`;
  const set = (patch: Parameters<typeof studio.setMix>[2], key?: string) => studio.setMix('opMix', i, patch, key);
  function openSound() { studio.part = i; studio.view = 'sound'; }
</script>

{#if part && mix && def}
  <div class="strip" class:sel class:night={theme.night} class:alt={i % 2 === 1} role="group" aria-label={i18n.pick(part.data.name)}>
    {#if sel}<span class="bar" aria-hidden="true"></span>{/if}
    <button class="who" onclick={() => (studio.part = i)} ondblclick={openSound} title={i18n.t('openSoundDbl')}>
      <PartChip icon={part.data.icon} color={partColor(theme.pal, part.data.color)} size={26} />
      <span class="txt"><span class="nm">{i18n.pick(part.data.name)}</span><span class="sub">{i18n.pick(part.data.inst)}</span></span>
    </button>
    <p class="ins" class:none={!inserts.length} ondblclick={openSound}>{inserts.length ? inserts.map(k => i18n.t(k)).join(' · ') : i18n.t('noInserts')}</p>
    <div class="knobs">
      <Knob r={11} value={mix.rev} def={def.rev} label={i18n.t('reverb')} fs={10} gap={5} title="{i18n.t('reverb')} {Math.round(mix.rev * 100)}%" onchange={(v, k) => set({ rev: v }, k)} />
      <Knob r={11} value={mix.dly} def={0} label={i18n.t('delay')} fs={10} gap={5} title="{i18n.t('delay')} {Math.round(mix.dly * 100)}%" onchange={(v, k) => set({ dly: v }, k)} />
      <Knob r={11} value={(mix.pan + 1) / 2} def={.5} bipolar label={i18n.t('pan')} fs={10} gap={5} title="{i18n.t('pan')} {fmtPan(mix.pan)}" onchange={(v, k) => set({ pan: Math.abs(v - .5) < .015 ? 0 : v * 2 - 1 }, k)} />
    </div>
    <div class="fad">
      <Fader db={mix.vol} def={def.vol} {sel} label={i18n.pick(part.data.name)} onchange={(d, k) => set({ vol: d }, k)} />
      <canvas class="mt" use:meter={{ kind: 'strip', i, s }} width="20" height="104" aria-hidden="true"></canvas>
      <span class="db ut-num">{fmtDb(mix.vol)}</span>
      <span class="dbu">dB</span>
    </div>
    <div class="ms">
      <button class="m" class:on={mix.mute} class:implied={soloing && !mix.solo && !mix.mute} aria-pressed={mix.mute} title={soloing && !mix.solo ? i18n.t('mutedBySolo') : i18n.t('mute')} onclick={() => studio.mute(i)}>M</button>
      <button class="s" class:on={mix.solo} aria-pressed={mix.solo} title={i18n.t('soloHint', { mod: MOD })} onclick={(e) => studio.solo(i, e.ctrlKey || e.metaKey || e.shiftKey)}>S</button>
    </div>
  </div>
{/if}

<style>
  .strip { position: relative; flex: none; width: 147px; height: 100%; background: var(--base); border-left: 1px solid var(--hair); }
  .strip.alt { background: var(--alt); }
  .strip.sel { background: var(--accentSoft); }
  .bar { position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--accent); }
  .who { position: absolute; left: 12px; top: 12px; right: 6px; display: flex; gap: 8px; align-items: flex-start; text-align: left; }
  .txt { display: flex; flex-direction: column; min-width: 0; padding-top: 1px; }
  .nm { font: 700 13px/1.25 var(--f-sans); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font: 500 11px/1.4 var(--f-sans); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ins { position: absolute; left: 12px; right: 8px; top: 50px; margin: 0; font: 700 10.5px/14px var(--f-sans); color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: default; }
  .ins.none { font-weight: 500; color: var(--muted); opacity: .7; }
  .knobs { position: absolute; left: 8px; top: 74px; display: grid; grid-template-columns: repeat(3, 44px); justify-items: center; }
  .fad { position: absolute; left: 0; right: 0; top: 124px; height: 118px; }
  .fad :global(.fader) { position: absolute; left: 27px; top: 0; }
  .mt { position: absolute; left: 72px; top: 7px; width: 20px; height: 104px; }
  .db { position: absolute; right: 10px; top: 9px; font-size: 14px; color: var(--ink); }
  .night .db { font-size: 16px; }
  .dbu { position: absolute; right: 10px; top: 27px; font: 700 10px/1 var(--f-sans); color: var(--muted); }
  .ms { position: absolute; left: 12px; top: 245px; display: flex; gap: 6px; }
  .ms button { width: 20px; height: 20px; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--hair); font: 900 10px/20px var(--f-sans); color: var(--ink2); text-align: center; }
  .ms button:hover { color: var(--ink); box-shadow: inset 0 0 0 1px var(--muted); }
  .ms .m.on { background: var(--accentSoft); color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .ms .m.implied { color: var(--accent); opacity: .6; }
  .ms .s.on { background: var(--wash); color: #1C2030; box-shadow: none; }
  .night .ms button { border-radius: 0; }
  .night .ms .s.on { color: #0B0A0E; }
</style>
