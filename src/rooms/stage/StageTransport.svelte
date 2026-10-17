<script lang="ts">
  import type { StageLayout } from './layout';
  import { F, measure } from '../../lib/art/type';
  import { fmtTime, clamp } from '../../lib/util';
  import { transport } from '../../lib/audio/transport.svelte';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { fonts } from '../../lib/state/fonts.svelte';

  let { L, onplay, quiet = false }: { L: StageLayout; onplay: () => void; quiet?: boolean } = $props();
  const P = $derived(L.play);
  const k = $derived(P.r / 52);
  const night = $derived(theme.night);
  const th = $derived(theme.pal);
  const dur = $derived(transport.song?.duration || 0);

  // the progress head moves every frame while playing; under play mode (`quiet`, dimmed behind the highway) four times a
  // second is enough, and leaves the frame's time to the highway (setting this whole drawing again each frame cost a
  // phone about as much as the highway's own notes)
  let now = $state(0);
  $effect(() => {
    let id = 0;
    const f = () => { now = transport.shown(); if (transport.playing && !quiet) id = requestAnimationFrame(f); };
    void transport.playing; void transport.clock;
    f();
    return () => cancelAnimationFrame(id);
  });
  const pr = $derived(dur ? clamp(now / dur, 0, 1) : 0);
  const G = $derived(L.prog);
  const head = $derived({ x: G.x1 + (G.x2 - G.x1) * pr, y: G.y1 + (G.y2 - G.y1) * pr + G.gap * 2 });
  const timeW = $derived.by(() => { void fonts.version; return measure(fmtTime(now), night ? `700 ${Math.round(L.time.size * 1.14)}px ${F.gar}` : `italic 900 ${L.time.size}px ${F.disp}`) * (night ? 1 : 1.12); });
  const lozRing = Array.from({ length: 16 }, (_, i) => i);

  let dragging = false;
  function seekAt(e: PointerEvent) {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    transport.seek(clamp((p.x - G.x1) / (G.x2 - G.x1), 0, 1) * dur);
    now = transport.now();
  }
  const playLabel = $derived(transport.playing ? i18n.t('pause') : transport.ready < 1 ? i18n.t('tuning') : i18n.t('play'));
</script>

<svg class="tp" width={L.W} height={L.H} viewBox="0 0 {L.W} {L.H}">
  <!-- play -->
  <g class="btn play" role="button" tabindex="0" aria-label={playLabel} onclick={onplay} onkeydown={(e) => { if (e.key === 'Enter') onplay(); }}>
    {#if night}
      <circle cx={P.cx} cy={P.cy} r={58 * k} fill="#0B0A0E" stroke={th.frameStroke} stroke-width="1.2" />
      <g class="ring" style="transform-origin:{P.cx}px {P.cy}px">
      {#each lozRing as i}
        {@const a = i / 16 * Math.PI * 2 - Math.PI / 2}
        {@const lx = P.cx + Math.cos(a) * 52 * k}
        {@const ly = P.cy + Math.sin(a) * 52 * k}
        {@const lit = transport.ready >= 1 || i / 16 < transport.ready}
        <path d="M{lx} {ly - 3 * k}L{lx + 2.16 * k} {ly}L{lx} {ly + 3 * k}L{lx - 2.16 * k} {ly}Z" fill={lit ? th.orn : 'rgba(216,180,106,.18)'} opacity=".85" transform="rotate({a * 180 / Math.PI + 90} {lx} {ly})" />
      {/each}
      </g>
      <circle cx={P.cx} cy={P.cy} r={44 * k} fill={th.accent} class="face core" style="transform-origin:{P.cx}px {P.cy}px" />
      <circle cx={P.cx} cy={P.cy} r={39 * k} fill="none" stroke="rgba(255,243,238,.35)" stroke-width="1" class="core" style="transform-origin:{P.cx}px {P.cy}px" />
    {:else}
      <circle cx={P.cx + 3} cy={P.cy + 5} r={52 * k} fill="rgba(28,32,48,.12)" />
      <circle cx={P.cx} cy={P.cy} r={52 * k} fill="#FFFFFF" />
      {#if transport.ready < 1}
        <circle cx={P.cx} cy={P.cy} r={47.5 * k} fill="none" stroke={th.accent2} stroke-width={4 * k} />
        <circle cx={P.cx} cy={P.cy} r={47.5 * k} fill="none" stroke={th.accent} stroke-width={4 * k} stroke-dasharray="{(transport.ready * 298.5 * k).toFixed(1)} 999" transform="rotate(-90 {P.cx} {P.cy})" stroke-linecap="round" />
      {/if}
      <circle cx={P.cx} cy={P.cy} r={43 * k} fill={th.accent} class="face core" style="transform-origin:{P.cx}px {P.cy}px" />
    {/if}
    <g class="core" style="transform-origin:{P.cx}px {P.cy}px">
    {#if transport.playing}
      <g fill={th.on}><rect x={P.cx - 12 * k} y={P.cy - 15 * k} width={7.5 * k} height={30 * k} rx={2 * k} /><rect x={P.cx + 4.5 * k} y={P.cy - 15 * k} width={7.5 * k} height={30 * k} rx={2 * k} /></g>
    {:else}
      <path d="M{P.cx - 9 * k} {P.cy - 18 * k}v{36 * k}l{28 * k} {-18 * k}Z" fill={th.on} stroke={th.on} stroke-width={2 * k} stroke-linejoin="round" />
    {/if}
    </g>
    <text x={P.cx} y={P.cy + (night ? 84 : 80) * k} text-anchor="middle" font-family={F.sans} font-size={13 * Math.max(.85, k)} font-weight="900" fill={th.ink} letter-spacing={i18n.lang === 'zh' ? 4 : 1.5}>{playLabel}</text>
  </g>

  <!-- time and progress, drawn as a short staff with a note riding it -->
  <text x={L.time.x} y={L.time.y} font-family={night ? F.gar : F.disp} font-weight={night ? 700 : 900} font-style={night ? 'normal' : 'italic'} style={night ? '' : 'font-stretch:112%'} font-size={night ? Math.round(L.time.size * 1.14) : L.time.size} fill={th.ink}>{fmtTime(now)}</text>
  <text x={L.time.x + timeW + 12} y={L.time.y} font-family={night ? F.gar : F.disp} font-weight={night ? 700 : 900} font-style={night ? 'normal' : 'italic'} style={night ? '' : 'font-stretch:112%'} font-size={night ? 18 : 16} fill={th.muted}>/ {fmtTime(dur)}</text>
  <g opacity={night ? .55 : .9} stroke={th.ink} stroke-width="1.2">
    {#each [0, 1, 2, 3, 4] as i}<line x1={G.x1} y1={G.y1 + i * G.gap} x2={G.x2} y2={G.y2 + i * G.gap} />{/each}
  </g>
  <line x1={G.x1} y1={G.y1 - 4} x2={G.x1} y2={G.y1 + G.gap * 4 + 4} stroke={th.ink} stroke-width="2" />
  <line x1={G.x2} y1={G.y2 - 4} x2={G.x2} y2={G.y2 + G.gap * 4 + 4} stroke={th.ink} stroke-width="1.2" opacity=".6" />
  {#if night}
    <path d="M{head.x} {head.y - 8}L{head.x + 5.8} {head.y}L{head.x} {head.y + 8}L{head.x - 5.8} {head.y}Z" fill={th.now} transform="rotate(-20 {head.x} {head.y})" />
  {:else}
    <ellipse cx={head.x} cy={head.y} rx="8" ry="6" fill={th.now} transform="rotate(-20 {head.x} {head.y})" />
  {/if}
  <line x1={head.x + (night ? 5 : 7)} y1={head.y - 2} x2={head.x + (night ? 5 : 7)} y2={head.y - 24} stroke={th.now} stroke-width="2" />
  <rect class="seek" x={G.x1 - 10} y={Math.min(G.y1, G.y2) - 26} width={G.x2 - G.x1 + 20} height={Math.abs(G.y2 - G.y1) + G.gap * 4 + 40} fill="transparent"
    role="slider" tabindex="0" aria-label={i18n.t('seek')} aria-valuemin="0" aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(now)}
    onpointerdown={(e) => { dragging = true; (e.currentTarget as Element).setPointerCapture(e.pointerId); seekAt(e); }}
    onpointermove={(e) => { if (dragging) seekAt(e); }}
    onpointerup={() => (dragging = false)}
    onkeydown={(e) => { if (e.key === 'ArrowRight') transport.seek(transport.now() + 5); if (e.key === 'ArrowLeft') transport.seek(transport.now() - 5); }} />

</svg>

<style>
  .tp { position: absolute; left: 0; top: 0; pointer-events: none; }
  .btn, .seek { pointer-events: auto; cursor: pointer; outline: none; }
  .btn .face { transition: filter .2s; }
  .btn:hover .face { filter: brightness(1.08); }
  /* the play button gives under the pointer: it swells on hover, sinks on press; by night its ring of lozenges turns half
     one step */
  .core, .ring { transition: transform .4s cubic-bezier(.3, 1.6, .5, 1); }
  .play:hover .core { transform: scale(1.06); }
  .play:active .core { transform: scale(.94); transition-duration: .08s; }
  .play:hover .ring { transform: rotate(11.25deg); transition: transform .9s cubic-bezier(.2, .8, .2, 1); }
  .btn:focus-visible .face { stroke: var(--orn); stroke-width: 3; }
  .seek { touch-action: none; }
  .seek:focus-visible { stroke: var(--orn); stroke-width: 1.5; stroke-dasharray: 4 4; }
</style>
