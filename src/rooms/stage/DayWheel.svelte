<script lang="ts">
  import type { StageLayout } from './layout';
  import type { SongMeta } from '../../lib/music/types';
  import { S, clipPathD } from '../../lib/art/svg';
  import { setPalette } from '../../lib/art/ctx';
  import { halftone, sparkle } from '../../lib/art/marks';
  import { F, measure } from '../../lib/art/type';
  import { keyName } from '../../lib/music/theory';
  import { clamp, lerp, mod } from '../../lib/util';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { fonts } from '../../lib/state/fonts.svelte';
  import Acc from '../../components/Acc.svelte';

  let { L, library, pos, index, onopen, ondelete, onlist, quiet = false }: { L: StageLayout; library: SongMeta[]; pos: number; index: number; onopen: (i: number) => void; ondelete: (id: string) => void; onlist: () => void; quiet?: boolean } = $props();
  // (quiet: while parts are picked for multi-track play, its hint gives way to the picking's)
  let rim: SVGGElement, rimSvg: SVGSVGElement;
  const deg = Math.PI / 180;
  const W = $derived(L.wheel);
  const CX = $derived(W.X0 - W.R);
  const n = $derived(library.length);
  /** the rows from `a` to `b`, nearest the centre first, each song once (a library shorter than the wheel does not repeat) */
  const nearest = (a: number, b: number) => {
    const seen = new Set<number>(), ks: number[] = [];
    for (let k = a; k <= b; k++) ks.push(k);
    return ks.sort((x, y) => Math.abs(x - pos) - Math.abs(y - pos)).filter(k => !seen.has(mod(k, n)) && !!seen.add(mod(k, n)));
  };
  const titleOf = (m: SongMeta) => i18n.pick(m.title);

  /** each title's size when it is the current song: as large as fits; a title too long even small is shortened to the
      space it has (the full title shows on hover) */
  const fit = $derived.by(() => {
    void fonts.version;
    const perOf = (t: string) => measure(t, `900 100px ${F.serif}`) / 100 + .045 * [...t].length;
    return library.map(m => {
      const full = titleOf(m), per = perOf(full), size = clamp(W.maxW / per, 34, W.big);
      if (per * size <= W.maxW + 1) return { size, width: per * size, title: full, fullW: per * size };
      const cs = [...full];
      let keep = cs.length - 1, t = full;
      while (keep > 3) { t = cs.slice(0, keep).join('').trimEnd() + '…'; if (perOf(t) * size <= W.maxW) break; keep--; }
      return { size, width: Math.min(W.maxW, perOf(t) * size), title: t, fullW: per * size };
    });
  });
  function interp(d: number, k: number) {
    const keys = W.keys;
    if (d <= keys[0][0]) return { dy: keys[0][1], size: keys[0][2], op: 0 };
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (d >= a[0] && d <= b[0]) {
        const f = (d - a[0]) / (b[0] - a[0]);
        const sa = a[0] === 0 ? fit[k].size : a[2], sb = b[0] === 0 ? fit[k].size : b[2];
        // titles above the current one sit closer when the current title is set smaller
        const near = .45 + .55 * fit[mod(index, n)].size / W.big, dy = (key: [number, number, number, number]) => key[0] < 0 ? key[1] * near : key[1];
        return { dy: lerp(dy(a), dy(b), f), size: lerp(sa, sb, f), op: lerp(a[3], b[3], f) };
      }
    }
    const z = keys[keys.length - 1];
    return { dy: z[1], size: z[2], op: 0 };
  }
  const items = $derived.by(() => {
    const out: { k: number; i: number; d: number; x: number; y: number; a: number; size: number; op: number; title: string; artist: string; tw: number; aw: number }[] = [];
    for (const k of nearest(Math.floor(pos) - 3, Math.ceil(pos) + 2)) {
      const d = k - pos;
      if (d < -3 || d > 2) continue;
      const i = mod(k, n), m = library[i], q = interp(d, i);
      if (q.op <= .01 && Math.abs(d) > .5) continue;
      const y = W.CY + q.dy, a = Math.asin(clamp((y - W.CY) / W.R, -1, 1)) / deg, x = CX + W.R * Math.cos(a * deg);
      // long neighbours are cut short, so they never run across the hints or the windows
      const near = Math.abs(d) < .5;
      let title = near ? fit[i].title : titleOf(m), tw = (near ? fit[i].width : fit[i].fullW) * q.size / fit[i].size;
      const room = near ? Infinity : W.maxW * .78;
      if (tw > room) { const cs = [...title], keep = Math.max(3, Math.floor(cs.length * room / tw) - 1); title = cs.slice(0, keep).join('').trimEnd() + '…'; tw = tw * (keep + .6) / cs.length; }
      const artist = i18n.pick(m.artist);
      out.push({ k, i, d, x, y, a, size: q.size, op: q.op, title, artist, tw, aw: measure(artist, `700 ${L.compact ? 10 : 12}px ${F.sans}`) + artist.length });
    }
    return out.sort((x, y) => x.k - y.k);
  });
  /** where the windows begin, and how far down they reach: a neighbour's band name level with them must end before them */
  const winL = $derived(L.wins.length ? Math.min(...L.wins.map(w => w.x)) - 12 : Infinity);
  const winB = $derived(L.wins.length ? Math.max(...L.wins.map(w => w.y + w.h)) : -Infinity);
  /** a tilted neighbour's far end climbs (above the current title) or drops (below it): its band name shows only while
      that end stays clear of the wheel hint above and of the transport below */
  const hintY = $derived(L.hint ? W.CY - 290 + 10 : -Infinity);
  const transportY = $derived(L.compact ? Math.min(L.play.cy - L.play.r, L.time.y - L.time.size, L.multi.y) - 6 : Infinity);
  const artistFits = (it: { x: number; y: number; size: number; a: number; tw: number; aw: number }) => {
    const len = it.tw + 12 + it.aw, endY = it.y + len * Math.sin(it.a * deg);
    return it.tw + it.aw + 16 < W.maxW * .95 && (it.y - it.size > winB || it.x + len * Math.cos(it.a * deg) < winL)
      && endY - it.size * .8 > hintY && endY + 4 < transportY;
  };
  const cur = $derived(library[mod(index, n)]);
  const curFit = $derived(fit[mod(index, n)]);
  const metaX = $derived(W.metaBelow ? W.metaX : W.X0 + curFit.width + 52);
  const metaLine = $derived(`${keyName(cur.key.tonic, cur.key.mode, i18n.lang)} · ${cur.meter[0]}/${cur.meter[1]} · ${cur.bpm} BPM`);
  /* the viewer's own songs can be deleted from here: press once to arm, again to delete */
  let armed = $state(false);
  $effect(() => { void index; armed = false; });
  const delLabel = $derived(armed ? i18n.t('deleteConfirm') : i18n.t('deleteSong'));
  const delW = $derived.by(() => { void fonts.version; return measure(delLabel, `700 12px ${F.sans}`) + delLabel.length; });
  function del() { if (!armed) { armed = true; return; } armed = false; ondelete(cur.id); }
  /** the band or source takes the display style: heavy wide italic capitals, or upright heavy sans for Chinese names */
  const artist = $derived(i18n.pick(cur.artist));
  const artistCjk = $derived(/[\u3000-\u9fff\uff00-\uffef]/.test(artist));
  const artistFont = (px: number) => artistCjk ? `900 ${px}px ${F.sans}` : `italic 900 ${px}px ${F.disp}`;
  const metaRoom = $derived(W.metaBelow ? W.maxW + 20 : L.play.cx - L.play.r - 30 - metaX);
  const artistSize = $derived.by(() => {
    void fonts.version;
    const base = W.metaBelow ? 17 : 22, text = artistCjk ? artist : artist.toUpperCase();
    const w1 = measure(text, artistFont(100)) / 100 * (artistCjk ? 1 : 1.12) + (artistCjk ? .1 : .09) * [...text].length;
    return clamp(metaRoom / w1, 11, base);
  });
  const artistW = $derived.by(() => { void fonts.version; const text = artistCjk ? artist : artist.toUpperCase(); return measure(text, artistFont(artistSize)) * (artistCjk ? 1 : 1.12) + (artistCjk ? .1 : .09) * artistSize * [...text].length; });

  // the sliver of the wheel at the left edge: sky face, screentone, dotted rim, and a marker for the current song
  $effect(() => {
    const th = theme.pal, R = W.R, RR = R - 26;
    setPalette(th);
    rim.replaceChildren();
    const P = (rr: number, a: number) => [CX + rr * Math.cos(a * deg), W.CY + rr * Math.sin(a * deg)];
    const a0 = Math.asin(clamp((W.keys[0][1] - 60) / R, -1, 1)) / deg, a1 = Math.asin(clamp((W.keys[W.keys.length - 1][1] + 10) / R, -1, 1)) / deg;
    const pts: number[][] = [];
    for (let a = a0; a <= a1 + .01; a += .5) pts.push(P(RR, a));
    const face = `M0 ${pts[0][1].toFixed(1)}` + pts.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join('') + `L0 ${pts[pts.length - 1][1].toFixed(1)}Z`;
    rim.append(S('path', { d: face, fill: th.sky }));
    const fc = S('g', { 'clip-path': clipPathD(rimSvg, face) });
    rim.append(fc);
    halftone(fc, 0, pts[0][1], 60, pts[pts.length - 1][1] - pts[0][1], 9, th.accent2, x => clamp(1 - x / 40, 0, 1) * .9);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    rim.append(S('path', { d, fill: 'none', stroke: '#FFFFFF', 'stroke-width': 7, 'stroke-linecap': 'round' }));
    rim.append(S('path', { d, fill: 'none', stroke: th.accent, 'stroke-width': 2.6, 'stroke-dasharray': '1 8', 'stroke-linecap': 'round' }));
    const am = Math.asin(-W.big * .36 / R) / deg, [mx, my] = P(RR + 22, am);
    rim.append(S('path', { d: `M${mx - 4} ${my - 8}L${mx + 8} ${my}L${mx - 4} ${my + 8}Z`, fill: th.accent, transform: `rotate(${am} ${mx} ${my})` }));
  });
  let spark: SVGGElement;
  $effect(() => { const th = theme.pal; setPalette(th); spark.replaceChildren(); if (!L.compact) sparkle(spark, metaX + artistW + 16, W.metaY - 4, 11, th.accent, 8); });

  const tick = (it: { y: number; size: number; d: number }) => {
    const R = W.R, RR = R - 26, a = Math.asin(clamp((it.y - it.size * .36 - W.CY) / R, -1, 1));
    const near = Math.abs(it.d) < .5;
    return { x1: CX + (RR - 6) * Math.cos(a), y1: W.CY + (RR - 6) * Math.sin(a), x2: CX + (RR + (near ? 16 : 10)) * Math.cos(a), y2: W.CY + (RR + (near ? 16 : 10)) * Math.sin(a), near };
  };
</script>

<svg bind:this={rimSvg} class="wheel" width={L.W} height={L.H} viewBox="0 0 {L.W} {L.H}">
  <g bind:this={rim}></g>
  {#each items as it (it.k)}
    {@const tk = tick(it)}
    <line x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} stroke={tk.near ? theme.pal.accent : theme.pal.muted} stroke-width={tk.near ? 3 : 1.6} stroke-linecap="round" opacity={Math.max(.25, it.op)} />
  {/each}
  {#if L.hint && !quiet}
    <text x={W.X0} y={W.CY - 290} font-family={F.sans} font-size="12" font-weight="500" fill={theme.pal.muted} letter-spacing="1">{i18n.t('hintWheel', { n })}</text>
  {/if}
  {#each items as it (it.k)}
    {@const center = clamp(1 - Math.abs(it.d), 0, 1)}
    {@const now = Math.abs(it.d) <= .5}
    <!-- a neighbour opens itself; the current title opens the whole library -->
    <g transform="rotate({it.a.toFixed(2)} {it.x.toFixed(1)} {it.y.toFixed(1)})" opacity={it.op.toFixed(3)} class:pick={!now} class:cur={now}
      role="button" tabindex={now ? 0 : -1} aria-label={now ? `${it.title} · ${i18n.t('openLibrary')}` : it.title} aria-haspopup={now ? 'dialog' : undefined}
      onclick={() => (now ? onlist() : onopen(it.k))} onkeydown={(e) => { if (now && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); onlist(); } }}>
      <text x={it.x} y={it.y} font-family={F.serif} font-weight="900" font-size={it.size.toFixed(1)} fill={theme.pal.ink} letter-spacing={(it.size * .045).toFixed(2)}
        stroke={theme.pal.bg} stroke-width={(14 * center * it.size / W.big).toFixed(1)} paint-order="stroke" stroke-linejoin="round"><title>{titleOf(library[it.i])}</title>{it.title}</text>
      {#if center < .6 && artistFits(it)}
        <text x={it.x + it.tw + 12} y={it.y} font-family={F.sans} font-weight="700" font-size={L.compact ? 10 : 12} fill={theme.pal.ink2} letter-spacing="1" opacity={1 - center}>{it.artist}</text>
      {/if}
    </g>
  {/each}
  {#key index}
    <g class="meta">
      {#if W.metaBelow}
        <text x={metaX} y={W.metaY} font-family={artistCjk ? F.sans : F.disp} font-style={artistCjk ? 'normal' : 'italic'} font-weight="900" style={artistCjk ? '' : 'font-stretch:112%'} font-size={artistSize} fill={theme.pal.accent} letter-spacing={artistCjk ? artistSize * .1 : artistSize * .09}>{artistCjk ? artist : artist.toUpperCase()}</text>
        <text x={metaX} y={W.metaY + 22} font-family={F.sans} font-weight="500" font-size="11" fill={theme.pal.muted} letter-spacing="1"><Acc text={metaLine} size={11} /></text>
      {:else}
        <text x={metaX} y={W.metaY + 14} font-family={artistCjk ? F.sans : F.disp} font-style={artistCjk ? 'normal' : 'italic'} font-weight="900" style={artistCjk ? '' : 'font-stretch:112%'} font-size={artistSize} fill={theme.pal.accent} letter-spacing={artistCjk ? artistSize * .1 : artistSize * .09} stroke={theme.pal.bg} stroke-width="7" paint-order="stroke" stroke-linejoin="round">{artistCjk ? artist : artist.toUpperCase()}</text>
        <text x={metaX} y={W.metaY + 44} font-family={F.sans} font-weight="500" font-size="12" fill={theme.pal.muted} letter-spacing="1" stroke={theme.pal.bg} stroke-width="5" paint-order="stroke" stroke-linejoin="round"><Acc text={metaLine} size={12} /></text>
      {/if}
      {#if cur.user}
        {@const dy = W.metaBelow ? W.metaY + 46 : W.metaY + 74}
        <g class="del" role="button" tabindex="0" aria-label={delLabel} onclick={del} onkeydown={(e) => { if (e.key === 'Enter') del(); }}>
          <rect x={metaX - 8} y={dy - 16} width={delW + 16} height="24" rx="12" fill={armed ? theme.pal.signal : theme.pal.bg} stroke={armed ? 'none' : theme.pal.hair} />
          <text x={metaX} y={dy} font-family={F.sans} font-weight="700" font-size="12" fill={armed ? '#FFFFFF' : theme.pal.muted} letter-spacing="1">{delLabel}</text>
        </g>
      {/if}
    </g>
  {/key}
  <g bind:this={spark}></g>
</svg>

<style>
  .wheel { position: absolute; left: 0; top: 0; pointer-events: none; }
  .pick { pointer-events: auto; cursor: pointer; }
  .del { pointer-events: auto; cursor: pointer; }
  .del:hover text { fill: var(--signal); }
  .del:focus-visible { outline: none; }
  .del:focus-visible rect { stroke: var(--accent); stroke-width: 2; }
  .pick:hover { opacity: .8; }
  .cur { pointer-events: auto; cursor: pointer; outline: none; }
  .cur text { transition: fill .2s; }
  .cur:hover text:first-child, .cur:focus-visible text:first-child { fill: var(--accentD); }
  /* (filling backwards only: a finished animation left filling keeps the text on a blurred layer of its own) */
  .meta { animation: rise .45s cubic-bezier(.2, .8, .2, 1) backwards; }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
</style>
