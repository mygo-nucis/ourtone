<script lang="ts">
  import { theme } from '../../lib/state/theme.svelte';
  import { gesture } from './gesture';

  /* a channel fader in dB with a console taper: most of the travel covers -30..+6 dB.
     drag the cap (shift for fine), click the slot to jump, scroll, arrow keys; double-click returns to the default. */
  let { db, def = 0, h = 104, sel = false, label = '', onchange }: { db: number; def?: number; h?: number; sel?: boolean; label?: string; onchange: (db: number, key: string) => void } = $props();

  const T: [number, number][] = [[6, 1], [0, .78], [-6, .62], [-12, .47], [-20, .33], [-30, .2], [-45, .09], [-60, .03], [-80, 0]];
  function posOf(d: number) {
    if (d >= 6) return 1;
    for (let i = 1; i < T.length; i++) if (d >= T[i][0]) { const [d0, p0] = T[i - 1], [d1, p1] = T[i]; return p1 + (p0 - p1) * (d - d1) / (d0 - d1); }
    return 0;
  }
  function dbOf(p: number) {
    if (p >= 1) return 6;
    if (p <= 0) return -80;
    for (let i = 1; i < T.length; i++) if (p >= T[i][1]) { const [d0, p0] = T[i - 1], [d1, p1] = T[i]; return d1 + (d0 - d1) * (p - p1) / (p0 - p1); }
    return -80;
  }
  const Y0 = 7;
  const pos = $derived(posOf(db));
  const cy = $derived(Y0 + (1 - pos) * h);
  const ticks = [1, .78, .47, .2, 0];
  const g = gesture();
  let dragging = $state(false);
  let svg: SVGSVGElement;

  const round = (d: number) => d <= -79.9 ? -80 : Math.round(d * 10) / 10;
  function set(d: number, key: string) { const n = round(Math.max(-80, Math.min(6, d))); if (n !== round(db)) onchange(n, key); }
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    svg.focus({ preventScroll: true });
    const r = svg.getBoundingClientRect(), k = (h + Y0 * 2) / r.height;
    const yIn = (e.clientY - r.top) * k, key = g.key();
    const onCap = Math.abs(yIn - cy) <= 9;
    let p0 = onCap ? pos : 1 - (yIn - Y0) / h, y0 = e.clientY;
    if (!onCap) set(dbOf(Math.max(0, Math.min(1, p0))), key);
    dragging = true;
    const move = (ev: PointerEvent) => {
      const dy = (ev.clientY - y0) * k * (ev.shiftKey ? .2 : 1);
      y0 = ev.clientY; p0 = Math.max(0, Math.min(1, p0 - dy / h));
      set(dbOf(p0), key);
    };
    const up = () => { dragging = false; removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  function wheel(e: WheelEvent) { e.preventDefault(); set(db - Math.sign(e.deltaY || -e.deltaX) * (e.shiftKey ? .1 : .5), g.burst('w')); }
  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 3 : .5, k = e.key;
    let n: number | null = null;
    if (k === 'ArrowUp' || k === 'ArrowRight') n = db + step;
    else if (k === 'ArrowDown' || k === 'ArrowLeft') n = db - step;
    else if (k === 'PageUp') n = db + 6;
    else if (k === 'PageDown') n = db - 6;
    else if (k === 'Home') n = def;
    if (n === null) return;
    e.preventDefault(); e.stopPropagation();
    set(n, g.burst('k'));
  }
  const cham = (x: number, y: number, w: number, hh: number, c: number) => `M${x + c} ${y}H${x + w - c}L${x + w} ${y + c}V${y + hh - c}L${x + w - c} ${y + hh}H${x + c}L${x} ${y + hh - c}V${y + c}Z`;
</script>

<svg bind:this={svg} class="fader" class:dragging width="32" height={h + Y0 * 2} viewBox="0 0 32 {h + Y0 * 2}" role="slider" tabindex="0"
  aria-label={label} aria-valuemin={-80} aria-valuemax={6} aria-valuenow={round(db)} aria-valuetext="{db <= -79.9 ? '−∞' : round(db)} dB"
  onpointerdown={down} onwheel={wheel} onkeydown={key} ondblclick={() => set(def, g.key())}>
  {#each ticks as t}<line x1="1" y1={Y0 + (1 - t) * h} x2="7" y2={Y0 + (1 - t) * h} stroke="var(--muted)" stroke-width={t === .78 ? 1.4 : 1} opacity={t === .78 ? .9 : .6} />{/each}
  <rect x="13" y={Y0} width="5" height={h} rx={theme.night ? 0 : 2.5} fill="var(--track)" />
  <rect x="13" y={cy} width="5" height={Math.max(0, Y0 + h - cy)} rx={theme.night ? 0 : 2.5} fill={sel ? 'var(--accent)' : theme.night ? 'rgba(237,230,225,.4)' : '#A9B8CC'} />
  {#if theme.night}
    <path d={cham(0, cy - 7, 31, 14, 4)} fill="#1E1A22" stroke="#D8B46A" stroke-width="1.1" />
    <line x1="5" y1={cy} x2="26" y2={cy} stroke="#D8B46A" stroke-width="1" />
  {:else}
    <rect x=".75" y={cy - 7} width="30" height="14" rx="4" fill="#FFFFFF" stroke="#1C2030" stroke-width="1.5" />
    <line x1="5" y1={cy} x2="26" y2={cy} stroke="#1C2030" stroke-width="1" />
  {/if}
</svg>

<style>
  .fader { display: block; overflow: visible; cursor: ns-resize; touch-action: none; outline: none; }
  .fader:focus-visible { filter: drop-shadow(0 0 2px var(--accent)); }
</style>
