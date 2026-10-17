<script lang="ts">
  import Panel from './Panel.svelte';
  import Knob from '../../../components/ui/Knob.svelte';
  import Toggle from '../../../components/ui/Toggle.svelte';
  import { theme } from '../../../lib/state/theme.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';
  import type { Patch, Osc } from '../../../lib/audio/patch';
  import { edit, mainOsc, ensureAmp } from '../sound.svelte';
  import { gesture } from '../../../components/ui/gesture';

  /* source B, live oscillators: a basic shape, FM, or a cycle drawn in 32 steps. the knobs work on the first oscillator;
     a patch may stack more (an organ's drawbars, a synth bass's sub) and keeps them */
  let { p, w }: { p: Patch; w: number } = $props();
  const o = $derived(p.osc?.[0] ?? null);
  const kind = $derived(!o ? '' : o.fm ? 'fm' : o.wave === 'table' || o.wave === 'harm' ? 'draw' : o.wave === 'pulse' ? 'square' : o.wave);
  const g = gesture();

  /* the cycle shown in the editor: the drawn table, or the shape sampled */
  function cycle(l: Osc): number[] {
    if (l.wave === 'table' && l.table) return l.table;
    return Array.from({ length: 32 }, (_, i) => {
      const t = i / 32;
      switch (l.wave) {
        case 'sine': return Math.sin(2 * Math.PI * t);
        case 'triangle': return 1 - 4 * Math.abs(((t + .25) % 1) - .5);
        case 'sawtooth': return 1 - 2 * ((t + .5) % 1);
        case 'square': return t < .5 ? 1 : -1;
        case 'pulse': return t < (l.duty ?? .5) ? 1 : -1;
        case 'harm': { let v = 0; (l.harm ?? [1]).forEach((h, k) => { v += h * Math.sin(2 * Math.PI * (k + 1) * t); }); return v; }
        default: return Math.sin(2 * Math.PI * t);
      }
    });
  }
  const steps = $derived.by(() => { if (!o) return new Array(32).fill(0); const c = cycle(o), m = Math.max(1e-6, ...c.map(Math.abs)); return c.map(x => x / m); });
  const ZX0 = 20, ZX1 = $derived(w - 20), ZY = 44, ZA = 30, cw = $derived((ZX1 - ZX0) / 32);

  function setWave(k: string) {
    edit(q => {
      const l = mainOsc(q);
      delete l.fm; delete l.harm;
      if (k === 'fm') { l.wave = 'sine'; l.fm = { ratio: 2, index: 1.4, index1: .25, tau: .35 }; }
      else if (k === 'draw') { const t = cycle(l); l.wave = 'table'; l.table = t.map(x => +x.toFixed(3)); }
      else { l.wave = k as Osc['wave']; delete l.table; }
    });
  }
  let drawing = $state<number[] | null>(null);
  function draw(e: PointerEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    svg.setPointerCapture?.(e.pointerId);
    const cur = [...steps], key = g.key();
    let last = -1;
    const at = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect(), k = w / r.width, x = (ev.clientX - r.left) * k, y = (ev.clientY - r.top) * k;
      const i = Math.max(0, Math.min(31, Math.floor((x - ZX0) / cw))), v = Math.max(-1, Math.min(1, (ZY - y) / ZA));
      if (last >= 0 && Math.abs(i - last) > 1) { const a = Math.min(i, last), b = Math.max(i, last); for (let j = a; j <= b; j++) cur[j] = v; } else cur[i] = v;
      last = i;
      drawing = [...cur];
    };
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
      const t = drawing; drawing = null;
      if (t) edit(q => { const l = mainOsc(q); delete l.fm; delete l.harm; l.wave = 'table'; l.table = t.map(x => +x.toFixed(3)); }, key);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  }
  const shown = $derived(drawing ?? steps);

  function toggle(on: boolean) {
    if (on) edit(q => { const l = mainOsc(q); if (q.a) l.level = .1; ensureAmp(q); });
    else if (p.a) edit(q => { delete q.osc; delete q.breath; delete q.chiff; delete q.click; delete q.perc; delete q.mix; if (!q.lp && !q.hp && !q.peaks?.length && !q.vf && !q.trem) delete q.amp; });
  }
  const db = (x: number) => x <= .0001 ? '−∞' : (20 * Math.log10(x)).toFixed(1).replace('-', '−') + ' dB';
  const oct = $derived(o ? Math.round(Math.log2(o.ratio)) : 0);
  function setL(fn: (l: Osc) => void, key: string) { edit(q => fn(mainOsc(q)), key); }
  const WAVES = ['sine', 'triangle', 'sawtooth', 'square', 'fm', 'draw'];
  function glyph(k: string, x: number, y: number, ww: number, h: number) {
    if (k === 'sine') { let d = ''; for (let i = 0; i <= 24; i++) { const t = i / 24; d += (i ? 'L' : 'M') + (x + t * ww).toFixed(1) + ' ' + (y + h / 2 - Math.sin(t * Math.PI * 2) * h / 2).toFixed(1); } return d; }
    if (k === 'triangle') return `M${x} ${y + h / 2}L${x + ww / 4} ${y}L${x + 3 * ww / 4} ${y + h}L${x + ww} ${y + h / 2}`;
    if (k === 'sawtooth') return `M${x} ${y + h / 2}L${x + ww / 2} ${y}V${y + h}L${x + ww} ${y + h / 2}`;
    if (k === 'square') return `M${x} ${y + h / 2}V${y}H${x + ww / 2}V${y + h}H${x + ww}V${y + h / 2}`;
    if (k === 'fm') { let d = ''; for (let i = 0; i <= 30; i++) { const t = i / 30; d += (i ? 'L' : 'M') + (x + t * ww).toFixed(1) + ' ' + (y + h / 2 - Math.sin(t * Math.PI * 2 + 1.6 * Math.sin(t * Math.PI * 6)) * h / 2).toFixed(1); } return d; }
    return '';
  }
</script>

<Panel zh="声源 B · 振荡器" en="Source B · oscillator" day="Source B" night="Fons secundus">
  {#snippet right()}<Toggle on={!!o} label="Source B" onchange={toggle} />{/snippet}
  {#if o}
    <div class="waves">
      {#each WAVES as k}
        <button class="wv" class:on={kind === k} onclick={() => setWave(k)} aria-label={k} title={k}>
          <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
            {#if k === 'draw'}<path d="M3 11l1-3.6 7.2-7.2a1.4 1.4 0 0 1 2 0l.6.6a1.4 1.4 0 0 1 0 2L6.6 10Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
            {:else}<path d={glyph(k, 1, 1, 16, 10)} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />{/if}
          </svg>
        </button>
      {/each}
      <span class="lab">{kind === 'fm' ? 'FM' : kind === 'draw' ? (i18n.lang === 'zh' ? '自绘 · 32 步' : 'Drawn · 32 steps') : (i18n.lang === 'zh' ? '拖动下面的格子来自绘' : 'Drag below to draw your own')}</span>
    </div>
    <svg class="ed" width={w} height="82" viewBox="0 0 {w} 82" onpointerdown={draw} role="img" aria-label="wave">
      <line x1={ZX0} y1={ZY} x2={ZX1} y2={ZY} stroke="var(--hair)" />
      {#each shown as v, i}
        {@const h = v * ZA}
        {@const x = ZX0 + i * cw + 1.5}
        <rect {x} y={Math.min(ZY, ZY - h)} width={cw - 3} height={Math.max(1, Math.abs(h))} rx={theme.night ? 0 : 2} fill={theme.night ? theme.pal.accent : theme.pal.accent2} opacity={theme.night ? .8 : 1} />
        {#if theme.night}<path d="M{x + (cw - 3) / 2} {ZY - h - 3}L{x + (cw - 3) / 2 + 2.2} {ZY - h}L{x + (cw - 3) / 2} {ZY - h + 3}L{x + (cw - 3) / 2 - 2.2} {ZY - h}Z" fill="#D8B46A" />{/if}
      {/each}
      <path d={shown.map((v, i) => `${i ? 'L' : 'M'}${(ZX0 + (i + .5) * cw).toFixed(1)} ${(ZY - v * ZA).toFixed(1)}`).join('')} fill="none" stroke={theme.night ? theme.pal.ink : theme.pal.accentD} stroke-width="1.6" stroke-linejoin="round" />
    </svg>
    <div class="knobs">
      <Knob r={16} value={Math.min(1, Math.sqrt(o.level))} def={.7} label={i18n.lang === 'zh' ? '音量' : 'Level'} text={db(o.level)} onchange={(v, k) => setL(l => { l.level = +(v * v).toFixed(4); }, k)} />
      <Knob r={16} value={(oct + 2) / 4} def={.5} label={i18n.lang === 'zh' ? '八度' : 'Octave'} text={(oct > 0 ? '+' : '') + oct} onchange={(v, k) => setL(l => { l.ratio = Math.pow(2, Math.round(v * 4) - 2); }, k)} />
      {#if o.fm}
        <Knob r={16} value={(o.fm.ratio - .5) / 13.5} def={.11} label={i18n.lang === 'zh' ? '调制比' : 'FM ratio'} text={o.fm.ratio.toFixed(1)} onchange={(v, k) => setL(l => { l.fm!.ratio = +(.5 + Math.round(v * 27) / 2).toFixed(1); }, k)} />
        <Knob r={16} value={Math.min(1, o.fm.index / 4)} def={.35} label={i18n.lang === 'zh' ? '调制深度' : 'FM depth'} text={o.fm.index.toFixed(2)} onchange={(v, k) => setL(l => { l.fm!.index = +(v * 4).toFixed(2); }, k)} />
      {:else}
        <Knob r={16} value={((o.detune ?? 0) + 50) / 100} def={.5} bipolar label={i18n.lang === 'zh' ? '微调' : 'Fine'} text="{(o.detune ?? 0) > 0 ? '+' : ''}{Math.round(o.detune ?? 0)} {i18n.lang === 'zh' ? '音分' : 'ct'}" onchange={(v, k) => setL(l => { l.detune = Math.round(v * 100 - 50); }, k)} />
        <Knob r={16} value={((o.voices ?? 1) - 1) / 4} def={0} label={i18n.lang === 'zh' ? '齐奏' : 'Unison'} text="{o.voices ?? 1} {i18n.lang === 'zh' ? '声' : 'v'}" onchange={(v, k) => setL(l => { l.voices = 1 + Math.round(v * 4); if (!l.spread) l.spread = 9; }, k)} />
      {/if}
    </div>
  {:else}
    <div class="off"><p>{i18n.lang === 'zh' ? '打开开关，在琴弦下面叠一层振荡器：正弦、三角、锯齿、方波、FM，或者自己画一个波形。' : 'Switch on to layer an oscillator under the string: sine, triangle, saw, square, FM, or a wave you draw.'}</p></div>
  {/if}
</Panel>

<style>
  .waves { display: flex; align-items: center; gap: 6px; padding: 0 20px; }
  .wv { display: grid; place-items: center; width: 34px; height: 24px; border-radius: 6px; color: var(--ink2); box-shadow: inset 0 0 0 1px var(--hair); }
  .wv:hover { color: var(--ink); background: var(--accentSoft); }
  .wv.on { color: var(--on); background: var(--accent); box-shadow: none; }
  :global([data-sky="night"]) .wv { border-radius: 0; }
  .lab { margin-left: auto; font: 700 11px/1 var(--f-sans); color: var(--muted); white-space: nowrap; }
  .ed { display: block; cursor: crosshair; touch-action: none; }
  .knobs { display: flex; justify-content: space-around; padding: 0 18px; }
  .off { display: grid; place-items: center; height: 100%; padding: 0 40px 20px; text-align: center; }
  .off p { font: 500 13px/1.7 var(--f-sans); color: var(--muted); }
</style>
