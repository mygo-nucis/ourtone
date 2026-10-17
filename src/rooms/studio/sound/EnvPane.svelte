<script lang="ts">
  import Panel from './Panel.svelte';
  import Seg from '../../../components/ui/Seg.svelte';
  import { theme } from '../../../lib/state/theme.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';
  import type { Patch } from '../../../lib/audio/patch';
  import { edit, ensureVf } from '../sound.svelte';
  import { gesture } from '../../../components/ui/gesture';

  /* the envelopes: loudness (attack, decay, sustain, release) or the filter's. drag the handles; times are drawn on a
     log scale so short attacks and long releases both stay reachable */
  let { p, w }: { p: Patch; w: number } = $props();
  let tab = $state<'amp' | 'filt'>('amp');
  type ADSR = { a: number; d: number; s: number; r: number };
  const cur = $derived.by((): ADSR => {
    if (tab === 'filt') { const e = p.vf?.env; return e ? { a: e.a, d: e.d, s: e.s, r: e.r } : { a: .005, d: .3, s: .2, r: .3 }; }
    const m = p.amp;
    if (m) return { a: m.a, d: m.tau, s: m.sus, r: m.rel };
    // a rendered string alone: its own natural decay
    const a = p.a;
    return { a: .002, d: a?.kind === 'pluck' ? a.p.decay / 3 : 1, s: 0, r: a?.rel ?? .1 };
  });
  const EX0 = 24, EY0 = 16, EY1 = 136;
  const lg = (x: number, lo: number, hi: number) => Math.log10(Math.max(lo, x) / lo) / Math.log10(hi / lo);
  const wA = $derived(8 + 64 * lg(cur.a, .001, 4)), wD = $derived(20 + 110 * lg(cur.d, .01, 10)), wR = $derived(20 + 120 * lg(cur.r, .01, 10));
  const hold = $derived(Math.max(40, w - 48 - wA - wD - wR - 10));
  const pA = $derived([EX0 + wA, EY0]), pD = $derived([EX0 + wA + wD, EY1 - cur.s * (EY1 - EY0)]), pS = $derived([pD[0] + hold, pD[1]]), pR = $derived([pS[0] + wR, EY1]);
  const path = $derived(`M${EX0} ${EY1}L${pA[0]} ${pA[1]}Q${pA[0] + 18} ${pD[1]} ${pD[0]} ${pD[1]}L${pS[0]} ${pS[1]}Q${pS[0] + 22} ${EY1} ${pR[0]} ${pR[1]}`);
  const g = gesture();
  function put(v: ADSR, key: string) {
    edit(q => {
      if (tab === 'filt') { const f = ensureVf(q); f.env = { amt: f.env?.amt ?? 2, a: v.a, d: v.d, s: v.s, r: v.r }; if (f.cut >= 19990) f.cut = 1200; return; }
      if (!q.amp) q.amp = { a: v.a, sus: v.s, tau: v.d, rel: v.r, lo: 1, hi: 0, pow: 1 };
      else { q.amp.a = v.a; q.amp.tau = v.d; q.amp.sus = v.s; q.amp.rel = v.r; }
    }, key);
  }
  const inv = (t: number, lo: number, hi: number) => lo * Math.pow(hi / lo, Math.max(0, Math.min(1, t)));
  function drag(which: 'a' | 'd' | 's' | 'r', e: PointerEvent) {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const key = g.key(), base = { ...cur };
    const move = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect(), k = w / r.width, x = (ev.clientX - r.left) * k, y = (ev.clientY - r.top) * k;
      const v = { ...base }, sus = Math.max(0, Math.min(1, (EY1 - y) / (EY1 - EY0)));
      if (which === 'a') v.a = +inv((x - EX0 - 8) / 64, .001, 4).toFixed(4);
      if (which === 'd') { v.d = +inv((x - EX0 - wA - 20) / 110, .01, 10).toFixed(3); v.s = +sus.toFixed(3); }
      if (which === 's') v.s = +sus.toFixed(3);
      if (which === 'r') v.r = +inv((x - pS[0] - 20) / 120, .01, 10).toFixed(3);
      put(v, key);
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }
  const ms = (x: number) => x < 1 ? `${Math.round(x * 1000)} ms` : `${x.toFixed(2)} s`;
</script>

<Panel zh="包络" en="Envelope" day="Envelope" night="Involucrum">
  {#snippet right()}
    <Seg items={[{ id: 'amp', label: i18n.lang === 'zh' ? '音量' : 'Level' }, { id: 'filt', label: i18n.lang === 'zh' ? '滤波' : 'Filter' }]} value={tab} h={24} fs={12} pad={9} onchange={(t) => (tab = t)} label="envelope" />
  {/snippet}
  <svg class="env" width={w} height="148" viewBox="0 0 {w} 148" aria-hidden="true">
    <defs>
      <linearGradient id="env-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color={theme.pal.accent} stop-opacity=".5" /><stop offset="1" stop-color={theme.pal.accent} stop-opacity="0" /></linearGradient>
      <pattern id="env-dots" width="7" height="12.1" patternUnits="userSpaceOnUse"><circle cx="1.8" cy="1.8" r="1.6" fill={theme.pal.accent2} /><circle cx="5.3" cy="7.9" r="1.6" fill={theme.pal.accent2} /></pattern>
    </defs>
    <line x1={EX0} y1={EY1} x2={w - 20} y2={EY1} stroke="var(--hair)" />
    <path d="{path}Z" fill={theme.night ? 'url(#env-fill)' : 'url(#env-dots)'} />
    <path d={path} fill="none" stroke={theme.pal.accent} stroke-width="2.4" stroke-linejoin="round" />
    {#each [['a', pA], ['d', pD], ['s', pS], ['r', pR]] as [k, pt]}
      {@const x = (pt as number[])[0]}
      {@const y = (pt as number[])[1]}
      <g class="h {k}" onpointerdown={(e) => drag(k as 'a', e)} role="slider" tabindex="-1" aria-label={k as string} aria-valuenow={Math.round(k === 'a' ? cur.a * 1000 : k === 'd' ? cur.d * 1000 : k === 's' ? cur.s * 100 : cur.r * 1000)}>
        <circle cx={x} cy={y} r="13" fill="transparent" />
        {#if theme.night}<path d="M{x} {y - 7}L{x + 5} {y}L{x} {y + 7}L{x - 5} {y}Z" fill="#D8B46A" stroke="#0B0A0E" stroke-width="1.2" />
        {:else}<circle cx={x} cy={y} r="6" fill="#FFFFFF" stroke={theme.pal.accent} stroke-width="2.4" />{/if}
      </g>
    {/each}
  </svg>
  <div class="vals">
    {#each [[i18n.lang === 'zh' ? '起音' : 'Attack', ms(cur.a)], [i18n.lang === 'zh' ? '衰减' : 'Decay', ms(cur.d)], [i18n.lang === 'zh' ? '延音' : 'Sustain', `${Math.round(cur.s * 100)}%`], [i18n.lang === 'zh' ? '释音' : 'Release', ms(cur.r)]] as [l, v]}
      <div><span class="l">{l}</span><span class="v ut-num">{v}</span></div>
    {/each}
  </div>
</Panel>

<style>
  .env { display: block; overflow: visible; }
  /* each handle moves only along what it sets: the attack's peak is full level, so only its time; the sustain's end is
     where the key comes up, so only its level; the release ends in silence, so only its time */
  .h.a, .h.r { cursor: ew-resize; }
  .h.d { cursor: move; }
  .h.s { cursor: ns-resize; }
  .vals { display: grid; grid-template-columns: repeat(4, 1fr); padding: 2px 24px 0; }
  .vals div { display: flex; flex-direction: column; gap: 6px; }
  .l { font: 700 11px/1 var(--f-sans); color: var(--muted); }
  .v { font-size: 15px; color: var(--ink); }
  :global([data-sky="night"]) .v { font-size: 17px; }
</style>
