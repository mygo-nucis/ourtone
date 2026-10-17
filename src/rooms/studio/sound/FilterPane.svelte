<script lang="ts">
  import Panel from './Panel.svelte';
  import Knob from '../../../components/ui/Knob.svelte';
  import Seg from '../../../components/ui/Seg.svelte';
  import { theme } from '../../../lib/state/theme.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';
  import type { Patch } from '../../../lib/audio/patch';
  import { edit, ensureVf } from '../sound.svelte';
  import { gesture } from '../../../components/ui/gesture';

  /* the voice filter: its response drawn from the same biquad maths the browser uses (at middle C); drag the handle
     across for the cutoff and up for resonance */
  let { p, w }: { p: Patch; w: number } = $props();
  const vf = $derived(p.vf ?? { type: 'lp' as const, cut: 20000, res: .15, key: 0, drive: 0, env: undefined });
  const PX0 = 20, PX1 = $derived(w - 140), PY0 = 10, PY1 = 150;
  const fx = (f: number) => PX0 + Math.log10(f / 20) / 3 * (PX1 - PX0);
  const fOf = (x: number) => 20 * Math.pow(10, (x - PX0) / (PX1 - PX0) * 3);
  const dby = (db: number) => PY0 + (12 - db) / 48 * (PY1 - PY0);
  function mag(f: number) {
    const sr = 48000, f0 = Math.min(20000, vf.cut), w0 = 2 * Math.PI * f0 / sr, cw = Math.cos(w0), sw = Math.sin(w0);
    const q = vf.type === 'bp' ? .5 + vf.res * 11.5 : Math.pow(10, (-3 + vf.res * 21) / 20), al = sw / (2 * q);
    let b0, b1, b2;
    if (vf.type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    else if (vf.type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al, ww = 2 * Math.PI * f / sr;
    const c1 = Math.cos(ww), s1 = Math.sin(ww), c2 = Math.cos(2 * ww), s2 = Math.sin(2 * ww);
    const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2), dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
    const h2 = (nr * nr + ni * ni) / (dr * dr + di * di);
    return Math.max(-36, 10 * Math.log10(Math.max(1e-12, h2)));
  }
  const curve = $derived.by(() => { void vf.cut; void vf.res; void vf.type; let d = ''; for (let i = 0; i <= 90; i++) { const f = 20 * Math.pow(1000, i / 90); d += (i ? 'L' : 'M') + fx(f).toFixed(1) + ' ' + dby(mag(f)).toFixed(1); } return d; });
  const hf = $derived(Math.min(18000, vf.cut * (vf.type === 'hp' ? 1.07 : .93)));
  const g = gesture();
  function set(fn: (f: NonNullable<Patch['vf']>) => void, key: string) { edit(q => fn(ensureVf(q)), key); }
  function drag(e: PointerEvent) {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const key = g.key(), y0 = e.clientY, r0 = vf.res;
    const move = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect(), k = w / r.width, x = (ev.clientX - r.left) * k;
      const cut = Math.round(Math.max(40, Math.min(20000, fOf(x))));
      const res = Math.max(0, Math.min(1, r0 + (y0 - ev.clientY) * k / 140));
      set(f => { f.cut = cut; f.res = +res.toFixed(3); }, key);
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }
  const hz = (f: number) => f >= 19990 ? (i18n.lang === 'zh' ? '全开' : 'Open') : f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${Math.round(f)} Hz`;
  const cutV = $derived(Math.log(vf.cut / 40) / Math.log(500));
</script>

<Panel zh="滤波" en="Filter" day="Filter" night="Filtrum">
  {#snippet right()}
    <Seg items={[{ id: 'lp', label: i18n.lang === 'zh' ? '低通' : 'Low' }, { id: 'bp', label: i18n.lang === 'zh' ? '带通' : 'Band' }, { id: 'hp', label: i18n.lang === 'zh' ? '高通' : 'High' }]} value={vf.type} h={24} fs={12} pad={9}
      onchange={(t) => set(f => { f.type = t; if (t === 'hp' && f.cut > 5000) f.cut = 200; if (t !== 'hp' && f.cut < 300) f.cut = 2400; }, g.key())} label="type" />
  {/snippet}
  <div class="wrap">
    <svg class="plot" width={w - 120} height="178" viewBox="0 0 {w - 120} 178" aria-hidden="true">
      <defs>
        <linearGradient id="vf-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={theme.pal.accent} stop-opacity=".5" /><stop offset="1" stop-color={theme.pal.accent} stop-opacity="0" /></linearGradient>
        <pattern id="vf-dots" width="7" height="12.1" patternUnits="userSpaceOnUse"><circle cx="1.8" cy="1.8" r="1.6" fill={theme.pal.accent2} /><circle cx="5.3" cy="7.9" r="1.6" fill={theme.pal.accent2} /></pattern>
      </defs>
      {#each [[100, '100'], [1000, '1k'], [10000, '10k']] as [f, l]}
        <line x1={fx(f as number)} y1={PY0} x2={fx(f as number)} y2={PY1} stroke="var(--hair)" />
        <text x={fx(f as number)} y={PY1 + 16} text-anchor="middle" class="ax">{l}</text>
      {/each}
      <line x1={PX0} y1={dby(0)} x2={PX1} y2={dby(0)} stroke="var(--hair)" />
      <line x1={PX0} y1={dby(-24)} x2={PX1} y2={dby(-24)} stroke="var(--hair)" stroke-dasharray="3 4" />
      <path d="{curve}L{PX1} {PY1}L{PX0} {PY1}Z" fill={theme.night ? 'url(#vf-fill)' : 'url(#vf-dots)'} opacity={p.vf ? 1 : .45} />
      <path d={curve} fill="none" stroke={theme.pal.accent} stroke-width="2.4" stroke-linejoin="round" opacity={p.vf ? 1 : .45} />
      <g class="h" onpointerdown={drag} role="slider" tabindex="-1" aria-label="cutoff" aria-valuenow={Math.round(vf.cut)}>
        <circle cx={fx(hf)} cy={dby(mag(hf))} r="14" fill="transparent" />
        {#if theme.night}<path d="M{fx(hf)} {dby(mag(hf)) - 7}L{fx(hf) + 5} {dby(mag(hf))}L{fx(hf)} {dby(mag(hf)) + 7}L{fx(hf) - 5} {dby(mag(hf))}Z" fill="#D8B46A" stroke="#0B0A0E" stroke-width="1.2" />
        {:else}<circle cx={fx(hf)} cy={dby(mag(hf))} r="6" fill="#FFFFFF" stroke={theme.pal.accent} stroke-width="2.4" />{/if}
      </g>
      <text x={Math.min(fx(hf) + 12, PX1 - 50)} y={dby(mag(hf)) - 10} class="val">{hz(vf.cut)}</text>
    </svg>
    <div class="knobs">
      <Knob r={14} value={cutV} def={1} label={i18n.lang === 'zh' ? '截止' : 'Cutoff'} gap={5} fs={11} title={hz(vf.cut)} onchange={(v, k) => set(f => { f.cut = Math.round(40 * Math.pow(500, v)); }, k)} />
      <Knob r={14} value={vf.res} def={.15} label={i18n.lang === 'zh' ? '共振' : 'Resonance'} gap={5} fs={11} onchange={(v, k) => set(f => { f.res = +v.toFixed(3); }, k)} />
      <Knob r={14} value={vf.drive} def={0} label={i18n.lang === 'zh' ? '驱动' : 'Drive'} gap={5} fs={11} onchange={(v, k) => set(f => { f.drive = +v.toFixed(3); }, k)} />
      <Knob r={14} value={((vf.env?.amt ?? 0) + 4) / 8} def={.5} bipolar label={i18n.lang === 'zh' ? '包络量' : 'Env amt'} gap={5} fs={11} title="{(vf.env?.amt ?? 0).toFixed(1)} oct"
        onchange={(v, k) => set(f => { const amt = Math.abs(v - .5) < .02 ? 0 : +((v - .5) * 8).toFixed(2); f.env = { a: .005, d: .3, s: .2, r: .3, ...f.env, amt }; if (f.cut >= 19990 && amt > 0) f.cut = 1200; }, k)} />
    </div>
  </div>
</Panel>

<style>
  .wrap { display: flex; height: 100%; }
  .plot { display: block; flex: none; overflow: visible; }
  .ax { font: 10px var(--f-disp); font-style: italic; font-weight: 900; fill: var(--muted); }
  :global([data-sky="night"]) .ax { font: 700 11px var(--f-gar); font-style: normal; }
  .val { font: italic 900 13px var(--f-disp); fill: var(--ink); }
  :global([data-sky="night"]) .val { font: 700 15px var(--f-gar); font-style: normal; }
  .h { cursor: move; }
  .knobs { flex: 1; display: grid; grid-template-columns: 1fr 1fr; align-content: start; justify-items: center; gap: 18px 4px; padding: 6px 10px 0 0; }
</style>
