<script lang="ts">
  import Panel from './Panel.svelte';
  import Knob from '../../../components/ui/Knob.svelte';
  import Toggle from '../../../components/ui/Toggle.svelte';
  import { theme } from '../../../lib/state/theme.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';
  import type { Patch } from '../../../lib/audio/patch';
  import type { PluckParams, PianoParams } from '../../../lib/audio/dsp';
  import { preset } from '../../../lib/audio/presets';
  import { edit } from '../sound.svelte';
  import { gesture } from '../../../components/ui/gesture';

  /* source A, a rendered string. plucked: the string between nut and bridge, its first modes shaped by where it is
     plucked (drag the pick); hammered: a felt hammer striking a piano string. new settings render new note buffers,
     so turns are applied a moment after they stop */
  let { p, w }: { p: Patch; w: number } = $props();
  const a = $derived(p.a);
  const pl = $derived(a?.kind === 'pluck' ? a.p as PluckParams : null);
  const pn = $derived(a?.kind === 'hammer' ? a.p as PianoParams : null);
  const hasB = $derived(!!p.osc?.length);

  /* live values while a knob turns; written to the sound when it rests */
  let pending = $state<Record<string, number>>({});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const g = gesture();
  function set(k: string, v: number) {
    pending = { ...pending, [k]: v };
    clearTimeout(timer);
    timer = setTimeout(flush, 160);
  }
  function flush() {
    const vals = pending;
    if (!Object.keys(vals).length) return;
    edit(q => {
      if (!q.a) return;
      const t = q.a.p as unknown as Record<string, number>;
      for (const [k, v] of Object.entries(vals)) t[k] = v;
    }, g.burst('a', 1500));
    pending = {};
  }
  const val = (k: string, base: number) => pending[k] ?? base;

  function toggle(on: boolean) {
    if (on) edit(q => { const src = preset('acoustic').patch.a!; q.a = JSON.parse(JSON.stringify(src)); if (q.osc?.length) q.a!.gain *= .7; });
    else if (hasB) edit(q => { delete q.a; });
  }
  function kind(k: 'pluck' | 'hammer') {
    edit(q => { q.a = JSON.parse(JSON.stringify(preset(k === 'pluck' ? 'acoustic' : 'piano').patch.a!)); });
  }

  /* the string picture */
  const s0 = 32, s1 = $derived(w - 32), sy = 58, A1 = 30;
  const pick = $derived(pl ? val('pick', pl.pick) : .2);
  const pk = $derived(s1 - pick * 2 * (s1 - s0) * .5);
  const lens = $derived.by(() => {
    let d = `M${s0} ${sy}`;
    for (let i = 1; i <= 40; i++) { const t = i / 40; d += `L${(s0 + t * (s1 - s0)).toFixed(1)} ${(sy - A1 * Math.sin(Math.PI * t)).toFixed(1)}`; }
    for (let i = 39; i >= 0; i--) { const t = i / 40; d += `L${(s0 + t * (s1 - s0)).toFixed(1)} ${(sy + A1 * Math.sin(Math.PI * t)).toFixed(1)}`; }
    return d + 'Z';
  });
  // each mode's share depends on the pluck point: sin(nπx)/n²
  const modes = $derived([2, 3, 4].map(n => {
    const amp = A1 * 2.2 * Math.abs(Math.sin(n * Math.PI * pick)) / (n * n);
    let d = '';
    for (let i = 0; i <= 60; i++) { const t = i / 60; d += (i ? 'L' : 'M') + (s0 + t * (s1 - s0)).toFixed(1) + ' ' + (sy - amp * Math.sin(n * Math.PI * t)).toFixed(1); }
    return { d, n };
  }));
  let drag = $state(false);
  function dragPick(e: PointerEvent) {
    if (!pl) return;
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag = true;
    const move = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * (w / r.width);
      set('pick', Math.max(.04, Math.min(.5, (s1 - x) / (s1 - s0))));
    };
    const up = () => { drag = false; removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
    move(e);
  }
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const secs = (x: number) => x < 1 ? `${Math.round(x * 1000)} ms` : `${x.toFixed(1)} s`;
</script>

<Panel zh={a?.kind === 'hammer' ? '声源 A · 击弦' : '声源 A · 拨弦'} en={a?.kind === 'hammer' ? 'Source A · hammered' : 'Source A · plucked'} day="Source A" night="Fons primus" crowded>
  {#snippet right()}
    {#if a}
      <div class="kinds">
        <button class:on={a.kind === 'pluck'} onclick={() => a.kind !== 'pluck' && kind('pluck')}>{i18n.lang === 'zh' ? '拨弦' : 'Pluck'}</button>
        <button class:on={a.kind === 'hammer'} onclick={() => a.kind !== 'hammer' && kind('hammer')}>{i18n.lang === 'zh' ? '击弦' : 'Hammer'}</button>
      </div>
    {/if}
    <Toggle on={!!a} label="Source A" onchange={toggle} />
  {/snippet}
  {#if a && pl}
    <svg class="pic" width={w} height="106" viewBox="0 0 {w} 106" aria-hidden="true">
      <defs>
        <linearGradient id="srca-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={theme.pal.accent} stop-opacity=".5" /><stop offset="1" stop-color={theme.pal.accent} stop-opacity="0" /></linearGradient>
        <pattern id="srca-dots" width="7" height="12.1" patternUnits="userSpaceOnUse"><circle cx="1.8" cy="1.8" r="1.7" fill={theme.pal.accent2} /><circle cx="5.3" cy="7.9" r="1.7" fill={theme.pal.accent2} /></pattern>
        <clipPath id="srca-lens"><path d={lens} /></clipPath>
      </defs>
      <path d={lens} fill={theme.night ? 'url(#srca-fill)' : 'url(#srca-dots)'} opacity={theme.night ? 1 : .9} />
      {#each modes as m}<path d={m.d} fill="none" stroke={theme.night ? '#D8B46A' : theme.pal.accent} stroke-width="1.2" opacity={.7 - m.n * .1} />{/each}
      <path d="M{s0} {sy}L{pk} {sy - 40}L{s1} {sy}" fill="none" stroke={theme.pal.ink} stroke-width="1.2" stroke-dasharray="4 4" opacity=".7" />
      <line x1={s0} y1={sy} x2={s1} y2={sy} stroke={theme.pal.ink} stroke-width="1.8" />
      {#each [[s0, i18n.lang === 'zh' ? '琴枕' : 'Nut'], [s1, i18n.lang === 'zh' ? '琴桥' : 'Bridge']] as [x, s]}
        <rect x={(x as number) - 3} y={sy - 14} width="6" height="28" rx={theme.night ? 0 : 2} fill={theme.pal.ink} />
        <text x={x} y={sy + 34} text-anchor="middle" font-size="10" font-weight="700" fill={theme.pal.muted} font-family="var(--f-sans)">{s}</text>
      {/each}
      <g class="pick" class:drag onpointerdown={dragPick} role="slider" tabindex="-1" aria-label="pick" aria-valuenow={Math.round(pick * 100)}>
        <rect x={pk - 14} y={sy - 72} width="28" height="36" fill="transparent" />
        {#if theme.night}<path d="M{pk} {sy - 63}L{pk + 6.5} {sy - 54}L{pk} {sy - 45}L{pk - 6.5} {sy - 54}Z" fill={theme.pal.accent} stroke="#D8B46A" stroke-width="1" />
        {:else}<path d="M{pk - 9} {sy - 62}Q{pk} {sy - 68} {pk + 9} {sy - 62}Q{pk + 6} {sy - 50} {pk} {sy - 44}Q{pk - 6} {sy - 50} {pk - 9} {sy - 62}Z" fill={theme.pal.accent} />{/if}
      </g>
      <text x={pk - 16} y={sy - 58} text-anchor="end" font-size="11" font-weight="700" fill={theme.pal.accent} font-family="var(--f-sans)">{i18n.lang === 'zh' ? '拨弦点' : 'Pluck'} {pct(pick)}</text>
    </svg>
    <div class="knobs">
      <Knob r={16} value={pick / .5} def={.34} label={i18n.lang === 'zh' ? '拨弦位置' : 'Position'} text={pct(pick)} onchange={(v) => set('pick', Math.max(.03, v * .5))} />
      <Knob r={16} value={val('damp', pl.damp) / .6} def={.05} label={i18n.lang === 'zh' ? '阻尼' : 'Damping'} text={pct(val('damp', pl.damp) / .6)} onchange={(v) => set('damp', v * .6)} />
      <Knob r={16} value={Math.log(val('decay', pl.decay) / .3) / Math.log(8 / .3)} def={Math.log(3 / .3) / Math.log(8 / .3)} label={i18n.lang === 'zh' ? '琴体' : 'Body'} text={secs(val('decay', pl.decay))} onchange={(v) => set('decay', .3 * Math.pow(8 / .3, v))} />
      <Knob r={16} value={1 - val('excite', pl.excite) / .95} def={.55} label={i18n.lang === 'zh' ? '拨片噪声' : 'Pick'} text={pct(1 - val('excite', pl.excite) / .95)} onchange={(v) => set('excite', (1 - v) * .95)} />
    </div>
  {:else if a && pn}
    <svg class="pic" width={w} height="106" viewBox="0 0 {w} 106" aria-hidden="true">
      <line x1="32" y1="58" x2={w - 32} y2="58" stroke={theme.pal.ink} stroke-width="1.8" />
      <rect x="29" y="44" width="6" height="28" rx={theme.night ? 0 : 2} fill={theme.pal.ink} />
      <rect x={w - 35} y="44" width="6" height="28" rx={theme.night ? 0 : 2} fill={theme.pal.ink} />
      {#each Array.from({ length: 9 }, (_, k) => k) as k}<path d="M{(w * .5 + (k - 4) * 16).toFixed(1)} {(58 - 22 * Math.cos((k - 4) / 4 * Math.PI / 2) * Math.min(1.4, val('bright', pn.bright)) / 1.4).toFixed(1)}V{(58 + 22 * Math.cos((k - 4) / 4 * Math.PI / 2) * Math.min(1.4, val('bright', pn.bright)) / 1.4).toFixed(1)}" stroke={theme.night ? '#D8B46A' : theme.pal.accent} stroke-width="1.2" opacity=".55" />{/each}
      <rect x={w * .3 - 14} y="66" width="28" height="18" rx={theme.night ? 0 : 5} fill={theme.pal.accent} />
      <rect x={w * .3 - 3} y="84" width="6" height="18" fill={theme.pal.ink} opacity=".7" />
      <text x={w * .3 + 22} y="80" font-size="11" font-weight="700" fill={theme.pal.accent} font-family="var(--f-sans)">{i18n.lang === 'zh' ? '击槌' : 'Hammer'}</text>
    </svg>
    <div class="knobs">
      <Knob r={16} value={(val('bright', pn.bright) - .6) / 1} def={.4} label={i18n.lang === 'zh' ? '亮度' : 'Bright'} text={pct((val('bright', pn.bright) - .6))} onchange={(v) => set('bright', .6 + v)} />
      <Knob r={16} value={(val('decay', pn.decay) - .4) / 1.2} def={.5} label={i18n.lang === 'zh' ? '延音' : 'Sustain'} text={pct((val('decay', pn.decay) - .4) / 1.2)} onchange={(v) => set('decay', .4 + v * 1.2)} />
      <Knob r={16} value={val('thump', pn.thump) / 1.5} def={.67} label={i18n.lang === 'zh' ? '击槌声' : 'Thump'} text={pct(val('thump', pn.thump) / 1.5)} onchange={(v) => set('thump', v * 1.5)} />
    </div>
  {:else}
    <div class="off">
      <p>{i18n.lang === 'zh' ? '这件乐器只用声源 B 发声。打开开关，可以叠上一根拨动或敲击的琴弦。' : 'This instrument sounds from source B alone. Switch on to layer a plucked or hammered string.'}</p>
    </div>
  {/if}
</Panel>

<style>
  .pic { display: block; overflow: visible; }
  .pick { cursor: ew-resize; }
  .knobs { display: flex; justify-content: space-around; padding: 0 18px; }
  .kinds { display: flex; gap: 2px; margin-right: 8px; }
  .kinds button { height: 22px; padding: 0 9px; border-radius: 11px; font: 700 11px/1 var(--f-sans); color: var(--muted); }
  .kinds button.on { color: var(--on); background: var(--accent); }
  :global([data-sky="night"]) .kinds button { border-radius: 0; }
  .off { display: grid; place-items: center; height: 100%; padding: 0 40px 20px; text-align: center; }
  .off p { font: 500 13px/1.7 var(--f-sans); color: var(--muted); }
</style>
