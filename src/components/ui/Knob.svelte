<script lang="ts">
  import { theme } from '../../lib/state/theme.svelte';
  import { gesture } from './gesture';

  /* a rotary control. drag up or down (shift for fine steps), scroll, or use the arrow keys; double-click resets.
     by day a white dial with a blue arc and an ink needle; by night a dark dial ringed with gold ticks, a crimson arc
     and a bone lozenge for a pointer. `bipolar` knobs (pan) draw their arc from the top. */
  let {
    value, def = 0, r = 16, label = '', text = '', bipolar = false, gap = 7, fs = 11, disabled = false, title = '', onchange
  }: {
    value: number; def?: number; r?: number; label?: string; text?: string; bipolar?: boolean; gap?: number; fs?: number;
    disabled?: boolean; title?: string; onchange: (v: number, key: string) => void;
  } = $props();

  const M = 8;
  const c = $derived(r + M);
  const A0 = Math.PI * .75, SW = Math.PI * 1.5;
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const v = $derived(clamp(value));
  const P = (a: number, rr: number) => [c + rr * Math.cos(a), c + rr * Math.sin(a)];
  function arc(from: number, to: number, rr: number) {
    const a = A0 + Math.min(from, to) * SW, b = A0 + Math.max(from, to) * SW;
    if (b - a < .005) return '';
    const [x0, y0] = P(a, rr), [x1, y1] = P(b, rr);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${rr} ${rr} 0 ${b - a > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  const from = $derived(bipolar ? .5 : 0);
  const a1 = $derived(A0 + v * SW);
  const ticks = $derived(Array.from({ length: 11 }, (_, k) => {
    const t = k / 10, a = A0 + t * SW, [x0, y0] = P(a, r + 3), [x1, y1] = P(a, r + 6.5);
    const lit = bipolar ? (t >= Math.min(.5, v) - .001 && t <= Math.max(.5, v) + .001) : t <= v + .001;
    return { x0, y0, x1, y1, lit };
  }));
  const needle = $derived(P(a1, r - 5));
  const loz = $derived.by(() => { const [x, y] = P(a1, r * .42), s = Math.max(2.6, r * .26); return { x, y, s, rot: (a1 * 180) / Math.PI + 90 }; });

  let dragging = $state(false);
  const g = gesture();
  function set(x: number, key: string) { const n = clamp(x); if (Math.abs(n - v) > 1e-4) onchange(n, key); }
  function down(e: PointerEvent) {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus({ preventScroll: true });
    const y0 = e.clientY, v0 = v, key = g.key();
    dragging = true;
    const move = (ev: PointerEvent) => set(v0 + (y0 - ev.clientY) / (ev.shiftKey ? 900 : 180), key);
    const up = () => { dragging = false; removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  function wheel(e: WheelEvent) {
    if (disabled) return;
    e.preventDefault();
    set(v - Math.sign(e.deltaY || -e.deltaX) * (e.shiftKey ? .005 : .025), g.burst('w'));
  }
  function key(e: KeyboardEvent) {
    if (disabled) return;
    const step = e.shiftKey ? .1 : .01;
    const k = e.key;
    let n: number | null = null;
    if (k === 'ArrowUp' || k === 'ArrowRight') n = v + step;
    else if (k === 'ArrowDown' || k === 'ArrowLeft') n = v - step;
    else if (k === 'Home') n = 0;
    else if (k === 'End') n = 1;
    else if (k === 'Delete' || k === 'Backspace') n = def;
    if (n === null) return;
    e.preventDefault(); e.stopPropagation();
    set(n, g.burst('k'));
  }
</script>

<div class="knob" class:night={theme.night} class:dragging class:disabled style="--fs:{fs}px;--gap:{gap}px" title={title || undefined}>
  <svg width={c * 2} height={c * 2} viewBox="0 0 {c * 2} {c * 2}" role="slider" tabindex={disabled ? -1 : 0}
    aria-label={label || title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-valuetext={text || undefined}
    onpointerdown={down} onwheel={wheel} onkeydown={key} ondblclick={() => !disabled && set(def, g.key())}>
    {#if theme.night}
      {#each ticks as t}<line x1={t.x0} y1={t.y0} x2={t.x1} y2={t.y1} stroke={t.lit ? '#D8B46A' : 'rgba(237,230,225,.18)'} stroke-width="1" />{/each}
      <circle cx={c} cy={c} r={r} fill="#0E0C11" stroke="rgba(216,180,106,.5)" stroke-width="1" />
      <path d={arc(from, v, r - 3.5)} fill="none" stroke="#C4293E" stroke-width="2.4" />
      <path d="M{loz.x} {loz.y - loz.s}L{loz.x + loz.s * .72} {loz.y}L{loz.x} {loz.y + loz.s}L{loz.x - loz.s * .72} {loz.y}Z" fill="#EDE6E1" transform="rotate({loz.rot} {loz.x} {loz.y})" />
    {:else}
      <circle cx={c} cy={c} r={r} fill="#FFFFFF" stroke="#DCE2EA" stroke-width="2" />
      <path d={arc(from, v, r)} fill="none" stroke="#2F86E8" stroke-width={r > 13 ? 3.5 : 3} stroke-linecap="round" />
      <line x1={c} y1={c} x2={needle[0]} y2={needle[1]} stroke="#1C2030" stroke-width="2" stroke-linecap="round" />
    {/if}
  </svg>
  {#if label}<span class="lab">{label}</span>{/if}
  {#if text}<span class="val">{text}</span>{/if}
</div>

<style>
  .knob { display: inline-flex; flex-direction: column; align-items: center; gap: 0; user-select: none; -webkit-user-select: none; }
  svg { display: block; margin: -8px; cursor: ns-resize; touch-action: none; outline: none; border-radius: 50%; }
  svg:focus-visible { box-shadow: 0 0 0 2px var(--accent); }
  .lab { margin-top: var(--gap); font: 700 var(--fs)/1.1 var(--f-sans); color: var(--ink2); white-space: nowrap; }
  .val { margin-top: 4px; font: italic 900 12px/1 var(--f-disp); font-stretch: 112%; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .night .val { font: 700 13.5px/1 var(--f-gar); font-style: normal; }
  .dragging .val { color: var(--accent); }
  .disabled { opacity: .45; }
  .disabled svg { cursor: default; }
</style>
