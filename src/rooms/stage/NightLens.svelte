<script lang="ts">
  import type { StageLayout } from './layout';
  import type { SongMeta } from '../../lib/music/types';
  import { F, measure } from '../../lib/art/type';
  import { keyName } from '../../lib/music/theory';
  import { clamp, mod } from '../../lib/util';
  import { archD } from '../../lib/art/svg';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { fonts } from '../../lib/state/fonts.svelte';
  import Acc from '../../components/Acc.svelte';

  /* night: a song selector made only of type, turned in real 3D. seven rows ride an invisible cylinder —
     flatter, darker and softer toward the edges; the current song is magnified under a flat gilded window of dark glass. */
  let { L, library, pos, index, onopen, ondelete, onlist, quiet = false }: { L: StageLayout; library: SongMeta[]; pos: number; index: number; onopen: (i: number) => void; ondelete: (id: string) => void; onlist: () => void; quiet?: boolean } = $props();
  // (quiet: while parts are picked for multi-track play, its hint gives way to the picking's)
  const G = $derived(L.lens);
  const n = $derived(library.length);
  /** the rows from `a` to `b`, nearest the centre first, each song once (a library shorter than the drum does not repeat) */
  const nearest = (a: number, b: number) => {
    const seen = new Set<number>(), ks: number[] = [];
    for (let k = a; k <= b; k++) ks.push(k);
    return ks.sort((x, y) => Math.abs(x - pos) - Math.abs(y - pos)).filter(k => !seen.has(mod(k, n)) && !!seen.add(mod(k, n)));
  };
  const deg = Math.PI / 180;
  const CY = $derived(G.FY + G.CYl);
  const wh = $derived(L.compact ? 36 : 46);
  const titleOf = (m: SongMeta) => i18n.pick(m.title);

  const rows = $derived.by(() => {
    const out: { k: number; t: number; op: number; blur: number; title: string }[] = [];
    for (const k of nearest(Math.floor(pos) - 5, Math.ceil(pos) + 5)) {
      const d = k - pos, t = -d * G.step;
      if (Math.abs(t) > 86) continue;
      const c = Math.cos(t * deg);
      // rows hand over to the magnifier as they reach the centre
      const handoff = clamp((Math.abs(d) - .3) / .45, 0, 1);
      const below = L.compact && d > 0 ? clamp(1.7 - d, 0, 1) * .6 : 1;
      const op = Math.pow(c, 2.2) * .8 * handoff * below;
      if (op < .01) continue;
      out.push({ k, t, op, blur: Math.max(0, (Math.abs(d) - 1) * .7), title: titleOf(library[mod(k, n)]) });
    }
    return out.sort((x, y) => x.k - y.k);
  });
  /** a title's width per pixel of type */
  const perOf = (t: string) => measure(t, `800 100px ${F.mincho}`) / 100 + .05 * [...t].length;
  const CJK = /[　-鿿＀-￯]/;
  /** the most even way to set a title on two lines: at a space, after ・ , - and the like, or between two CJK characters
      (never before a prolonged-sound mark, a small kana or closing punctuation) */
  function twoLines(t: string): [string, string] | null {
    const cs = [...t];
    let best: [string, string] | null = null, bestW = Infinity;
    for (let i = 1; i < cs.length; i++) {
      const a = cs[i - 1], b = cs[i];
      const ok = a === ' ' || '・·、，,-–—'.includes(a) || (CJK.test(a) && CJK.test(b) && !'ーッャュョァィゥェォ、。，・）」'.includes(b) && b !== ' ');
      if (!ok) continue;
      const l1 = cs.slice(0, i).join('').trimEnd(), l2 = cs.slice(i).join('').trimStart();
      if (!l1 || !l2) continue;
      const w = Math.max(perOf(l1), perOf(l2));
      if (w < bestW) { bestW = w; best = [l1, l2]; }
    }
    return best;
  }
  /** magnified titles scroll through the window in step with the drum: one line as large as fits, or two when one line
      would come out small */
  const mags = $derived.by(() => {
    void fonts.version;
    const out: { k: number; y: number; size: number; lines: string[] }[] = [];
    const room = G.wx1 - G.wx0 - 58, twoMax = (wh * 2 - 14) / 2.24;
    for (const k of nearest(Math.floor(pos) - 1, Math.ceil(pos) + 1)) {
      const d = k - pos;
      if (Math.abs(d) > 1.2) continue;
      const title = titleOf(library[mod(k, n)]);
      const one = Math.min(G.mag, room / perOf(title));
      const split = one < twoMax * .9 ? twoLines(title) : null;
      const two = split ? Math.min(twoMax, room / Math.max(perOf(split[0]), perOf(split[1]))) : 0;
      out.push(split && two > one * 1.2 ? { k, y: CY + d * wh * 2.1, size: two, lines: split } : { k, y: CY + d * wh * 2.1, size: one, lines: [title] });
    }
    return out.sort((x, y) => x.k - y.k);
  });
  const cur = $derived(library[mod(index, n)]);
  /** the band or source takes the gilded display style: Cormorant italic, or upright Noto Serif for Chinese names */
  const artist = $derived(i18n.pick(cur.artist));
  const artistCjk = $derived(/[\u3000-\u9fff\uff00-\uffef]/.test(artist));
  const metaLine = $derived(`${keyName(cur.key.tonic, cur.key.mode, i18n.lang)} · ${cur.meter[0]}/${cur.meter[1]} · ${cur.bpm} BPM`);
  /* the viewer's own songs can be deleted from here: press once to arm, again to delete */
  let armed = $state(false);
  $effect(() => { void index; armed = false; });
  const delLabel = $derived(armed ? i18n.t('deleteConfirm') : i18n.t('deleteSong'));
  const delW = $derived.by(() => { void fonts.version; return measure(delLabel, `600 13px ${F.sans}`) + delLabel.length; });
  function del() { if (!armed) { armed = true; return; } armed = false; ondelete(cur.id); }
  const metaRoom = $derived(G.metaBelow ? G.wx1 - G.metaX : L.play.cx - L.play.r - 30 - G.metaX);
  const artistSize = $derived.by(() => {
    void fonts.version;
    const base = artistCjk ? (G.metaBelow ? 19 : 26) : (G.metaBelow ? 24 : 34);
    const w1 = artistCjk ? measure(artist, `700 100px ${F.serif}`) / 100 + .12 * [...artist].length : measure(artist, `italic 600 100px ${F.gar}`) / 100;
    return clamp(metaRoom / w1, 13, base);
  });
  const clipId = 'lensclip' + Math.random().toString(36).slice(2, 7);
  const shadowId = 'lensshadow' + Math.random().toString(36).slice(2, 7);
  const glassId = 'lensglass' + Math.random().toString(36).slice(2, 7);
</script>

<svg class="under" width={L.W} height={L.H} viewBox="0 0 {L.W} {L.H}" aria-hidden="true">
  <defs>
    <radialGradient id="{shadowId}"><stop offset="0" stop-color="#050407" stop-opacity=".95" /><stop offset=".5" stop-color="#050407" stop-opacity=".74" /><stop offset="1" stop-color="#050407" stop-opacity="0" /></radialGradient>
  </defs>
  <!-- the shade behind the titles stops at the windows (this layer lies over them), so the first window is not dimmed -->
  <mask id="{shadowId}m" maskUnits="userSpaceOnUse" x="0" y="0" width={L.W} height={L.H}>
    <rect width={L.W} height={L.H} fill="#FFFFFF" />
    {#each L.wins as w (w.part)}<path d={archD(w.x - 9, w.y - 12, w.w + 18, w.h + 12)} fill="#000000" />{/each}
  </mask>
  <ellipse cx={L.compact ? G.X0 + 150 : 200} cy={CY + (L.compact ? 20 : 50)} rx={L.compact ? 420 : 600} ry={L.compact ? 260 : 320} fill="url(#{shadowId})" mask="url(#{shadowId}m)" />
</svg>

<div class="lens" style="left:0;top:{G.FY}px;width:{G.W}px;height:{G.H}px;--fade:{G.fade}px">
  <div class="view" style="perspective:{G.persp}px;perspective-origin:{G.X0 + 120}px {G.CYl}px">
    <div class="drum" style="left:{G.X0}px;top:{G.CYl}px;transform:translateZ(-{G.R}px)">
      {#each rows as r (r.k)}
        <div class="row" role="button" tabindex="-1" aria-label={r.title} onclick={() => onopen(r.k)} onkeydown={() => {}}
          style="font-size:{G.fs}px;opacity:{r.op.toFixed(3)};{r.blur ? `filter:blur(${r.blur.toFixed(2)}px);` : ''}transform:translateY(-50%) rotateX({r.t.toFixed(2)}deg) translateZ({G.R}px)">{r.title}</div>
      {/each}
    </div>
  </div>
</div>

<svg class="over" width={L.W} height={L.H} viewBox="0 0 {L.W} {L.H}">
  <defs>
    <clipPath id={clipId}><rect x={G.wx0} y={CY - wh} width={G.wx1 - G.wx0} height={wh * 2} /></clipPath>
    <filter id="{shadowId}f" x="-20%" y="-60%" width="140%" height="220%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000" flood-opacity=".9" /></filter>
    <linearGradient id={glassId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A080C" stop-opacity=".94" /><stop offset=".5" stop-color="#120E13" stop-opacity=".86" /><stop offset="1" stop-color="#0A080C" stop-opacity=".94" /></linearGradient>
    <linearGradient id="{glassId}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF3EE" stop-opacity=".07" /><stop offset="1" stop-color="#FFF3EE" stop-opacity="0" /></linearGradient>
  </defs>
  <rect x={G.wx0} y={CY - wh} width={G.wx1 - G.wx0} height={wh * 2} fill="url(#{glassId})" />
  <rect x={G.wx0} y={CY - wh} width={G.wx1 - G.wx0} height={wh * .7} fill="url(#{glassId}s)" />
  <g clip-path="url(#{clipId})">
    <g filter="url(#{shadowId}f)">
      {#each mags as m (m.k)}
        <!-- the crimson offset grows with the type: a print offset at full size, a hairline shadow when small -->
        {@const off = clamp(m.size * .06, 1.2, 5)}
        {#each m.lines as line, j}
          {@const y = m.y + m.size * .36 + (m.lines.length > 1 ? (j - .5) * m.size * 1.12 : 0)}
          <text x={G.X0 + off} y={y + off} font-family={F.mincho} font-weight="800" font-size={m.size.toFixed(1)} fill="#C4293E" opacity=".92" letter-spacing={(m.size * .05).toFixed(2)}>{line}</text>
          <text x={G.X0} y={y} font-family={F.mincho} font-weight="800" font-size={m.size.toFixed(1)} fill="#EDE6E1" letter-spacing={(m.size * .05).toFixed(2)}>{line}</text>
        {/each}
      {/each}
    </g>
  </g>
  <g stroke="#D8B46A" stroke-width=".9" opacity=".8">
    <line x1={G.wx0} y1={CY - wh} x2={G.wx1} y2={CY - wh} /><line x1={G.wx0} y1={CY + wh} x2={G.wx1} y2={CY + wh} />
    <line x1={G.wx0} y1={CY - wh} x2={G.wx0} y2={CY + wh} /><line x1={G.wx1} y1={CY - wh} x2={G.wx1} y2={CY + wh} />
  </g>
  <path d="M{G.wx0} {CY - 6}L{G.wx0 + 4.3} {CY}L{G.wx0} {CY + 6}L{G.wx0 - 4.3} {CY}Z" fill="#D8B46A" />
  <path d="M{G.wx1} {CY - 6}L{G.wx1 + 4.3} {CY}L{G.wx1} {CY + 6}L{G.wx1 - 4.3} {CY}Z" fill="#D8B46A" />
  <path d="M{G.wx0 + 9} {CY - 7}L{G.wx0 + 21} {CY}L{G.wx0 + 9} {CY + 7}Z" fill="#C4293E" />
  <!-- the window over the current title opens the whole library -->
  <rect class="open" x={G.wx0} y={CY - wh} width={G.wx1 - G.wx0} height={wh * 2} fill="transparent" role="button" tabindex="0"
    aria-label="{titleOf(cur)} · {i18n.t('openLibrary')}" aria-haspopup="dialog" onclick={onlist}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onlist(); } }} />
  {#key index}
    <g class="meta">
      {#if G.metaBelow}
        <text x={G.metaX} y={G.metaY} font-family={artistCjk ? F.serif : F.gar} font-style={artistCjk ? 'normal' : 'italic'} font-weight={artistCjk ? 700 : 600} font-size={artistSize} fill="#D8B46A" letter-spacing={artistCjk ? artistSize * .12 : .2}>{artist}</text>
        <text x={G.metaX} y={G.metaY + 24} font-family={F.gar} font-weight="600" font-size="14" fill="#8E8792"><Acc text={metaLine} size={14} /></text>
      {:else}
        <text x={G.metaX} y={G.metaY + 8} font-family={artistCjk ? F.serif : F.gar} font-style={artistCjk ? 'normal' : 'italic'} font-weight={artistCjk ? 700 : 600} font-size={artistSize} fill="#D8B46A" letter-spacing={artistCjk ? artistSize * .12 : .2}>{artist}</text>
        <text x={G.metaX} y={G.metaY + 38} font-family={F.gar} font-weight="600" font-size="16" fill="#8E8792"><Acc text={metaLine} size={16} /></text>
      {/if}
      {#if cur.user}
        {@const dy = G.metaBelow ? G.metaY + 52 : G.metaY + 68}
        <g class="del" role="button" tabindex="0" aria-label={delLabel} onclick={del} onkeydown={(e) => { if (e.key === 'Enter') del(); }}>
          <rect x={G.metaX - 8} y={dy - 16} width={delW + 16} height="24" fill={armed ? '#C4293E' : 'rgba(22,20,27,.8)'} stroke={armed ? 'none' : 'rgba(216,180,106,.4)'} />
          <text x={G.metaX} y={dy} font-family={F.sans} font-weight="600" font-size="13" fill={armed ? '#FFF3EE' : '#8E8792'} letter-spacing=".5">{delLabel}</text>
        </g>
      {/if}
    </g>
  {/key}
  {#if L.hint && !quiet}
    <text x={G.metaX} y={CY + 76 + (cur.user && !G.metaBelow ? 16 : 0)} font-family={F.sans} font-size="12" font-weight="500" fill="#8E8792" letter-spacing="1">{i18n.t('hintWheel', { n })}</text>
  {/if}
</svg>

<style>
  .under, .over { position: absolute; left: 0; top: 0; pointer-events: none; }
  .lens {
    position: absolute; overflow: hidden; pointer-events: none;
    -webkit-mask-image: linear-gradient(90deg, #000 0, #000 calc(var(--fade) - 80px), transparent var(--fade));
    mask-image: linear-gradient(90deg, #000 0, #000 calc(var(--fade) - 80px), transparent var(--fade));
  }
  .view { position: absolute; inset: 0; }
  .drum { position: absolute; transform-style: preserve-3d; }
  .row {
    position: absolute; left: 0; top: 0; white-space: nowrap; pointer-events: auto; cursor: pointer;
    font-family: "Shippori Mincho B1", "Noto Serif SC", serif; font-weight: 800; line-height: 1; letter-spacing: .05em;
    color: #D9CDC0; backface-visibility: hidden;
  }
  .row:hover { color: #EDE6E1; }
  /* (filling backwards only: a finished animation left filling keeps the text on a blurred layer of its own) */
  .meta { animation: rise .5s cubic-bezier(.2, .8, .2, 1) backwards; }
  .open { pointer-events: auto; cursor: pointer; outline: none; transition: fill .2s; }
  .open:hover, .open:focus-visible { fill: rgba(216, 180, 106, .06); }
  .del { pointer-events: auto; cursor: pointer; }
  .del:hover text { fill: #EDE6E1; }
  .del:focus-visible { outline: none; }
  .del:focus-visible rect { stroke: #D8B46A; }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
</style>
