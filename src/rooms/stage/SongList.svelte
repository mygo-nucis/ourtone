<script lang="ts">
  import { tick } from 'svelte';
  import type { StageLayout } from './layout';
  import type { SongMeta } from '../../lib/music/types';
  import { fmtTime, mod } from '../../lib/util';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';

  /* the whole library as a list, opened from the song's title: every song with its band or source and its length,
     the current one marked. by day a sticker card (it lands straight: a tilted list of text is resampled, and blurs,
     whenever the browser gives it a layer of its own; and its entrance fills backwards only, since an animation left
     filling forwards keeps that layer for good, drawn below the screen's resolution in Chromium 134), by night a gilded panel of dark glass. it opens above the title
     (over the left column on a phone), and closes on a choice, on Escape, or on a press outside it. */
  let { L, library, index, onpick, onclose }: { L: StageLayout; library: SongMeta[]; index: number; onpick: (i: number) => void; onclose: () => void } = $props();
  const n = $derived(library.length);
  const cur = $derived(mod(index, n));
  const night = $derived(theme.night);
  const box = $derived.by(() => {
    if (L.compact) return { x: L.col.x + 14, y: 80, w: L.col.w - 4, h: L.H - 80 - 14 };
    const top = 128, bottom = night ? L.lens.FY + L.lens.CYl - 46 - 18 : L.wheel.CY - L.wheel.big * .8 - 14;
    return { x: night ? 30 : 40, y: top, w: 540, h: Math.max(320, bottom - top) };
  });
  /** a label in runs of CJK and of everything else, so its Latin letters keep the Latin face whatever they sit beside */
  const runs = (s: string) => s.split(/([　-鿿＀-￯]+)/).filter(Boolean).map(t => ({ t, cjk: /[　-鿿＀-￯]/.test(t) }));

  let rows: HTMLElement;
  /** the edges fade only where more rows lie beyond them */
  let edge = $state({ top: false, end: false });
  function edges() { if (rows) edge = { top: rows.scrollTop > 2, end: rows.scrollTop + rows.clientHeight < rows.scrollHeight - 2 }; }
  $effect(() => { void n; void tick().then(edges); });
  // the current song in view: at once when the list opens, smoothly when the song changes under it
  let first = true;
  $effect(() => {
    void cur;
    void tick().then(() => {
      const el = rows?.querySelector<HTMLElement>('.row.on');
      if (el) el.scrollIntoView({ block: 'nearest', behavior: first ? 'auto' : 'smooth' });
      first = false;
    });
  });
</script>

<div class="scrim" role="presentation" onpointerdown={onclose}></div>
<div class="list" class:night class:compact={L.compact} style="left:{box.x}px;top:{box.y}px;width:{box.w}px;height:{box.h}px" role="dialog" aria-label={i18n.t('libraryTitle')}>
  <div class="card">
    <header>
      <h2>{i18n.t('libraryTitle')}</h2>
      <span class="count ut-num">{i18n.t('libraryCount', { n })}</span>
      <button class="x" onclick={onclose} aria-label={i18n.t('close')} title={i18n.t('close')}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 2L12 12M12 2L2 12" stroke="currentColor" stroke-width="2" stroke-linecap={night ? 'butt' : 'round'} /></svg>
      </button>
    </header>
    <div class="rows" class:fadeTop={edge.top} class:fadeEnd={edge.end} bind:this={rows} onscroll={edges}>
      {#each library as m, i (m.id)}
        {@const artist = i18n.pick(m.artist)}
        <button class="row" class:on={i === cur} aria-current={i === cur ? 'true' : undefined} onclick={() => onpick(i)}>
          <span class="mark" aria-hidden="true"></span>
          <span class="t">{i18n.pick(m.title)}</span>
          <span class="a">{#each runs(artist) as r, j (j)}<span class:cjk={r.cjk}>{r.t}</span>{/each}</span>
          <span class="d ut-num">{fmtTime(m.duration)}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .scrim { position: absolute; inset: 0; z-index: 8; }
  .list { position: absolute; z-index: 9; }
  .card {
    position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden;
    background: #FFFFFF; border: 2px solid var(--ink); border-radius: 14px;
    box-shadow: 0 0 0 6px #FFFFFF, 5px 10px 0 6px rgba(28, 32, 48, .14);
    transform-origin: 30% 100%;
    animation: stick .26s cubic-bezier(.2, 1.4, .4, 1) backwards;
  }
  @keyframes stick { from { opacity: 0; transform: rotate(-2.2deg) translateY(14px) scale(.97); } }
  header { flex: none; display: flex; align-items: baseline; gap: 12px; padding: 18px 16px 12px 22px; border-bottom: 2px solid var(--ink); }
  h2 { margin: 0; font: 900 26px/1 var(--f-serif); letter-spacing: .06em; color: var(--ink); }
  .count { font: italic 900 15px/1 var(--f-disp); font-stretch: 112%; color: var(--accent); letter-spacing: .04em; }
  .x { margin-left: auto; align-self: center; width: 30px; height: 30px; display: grid; place-items: center; color: var(--muted); border-radius: 8px; }
  .x:hover { color: var(--ink); background: var(--accentSoft); }
  .rows { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 8px 8px 10px; scrollbar-width: thin; --ft: 0px; --fe: 0px;
    -webkit-mask-image: linear-gradient(transparent, #000 var(--ft), #000 calc(100% - var(--fe)), transparent);
    mask-image: linear-gradient(transparent, #000 var(--ft), #000 calc(100% - var(--fe)), transparent); }
  .rows.fadeTop { --ft: 28px; }
  .rows.fadeEnd { --fe: 44px; }
  .row {
    display: grid; grid-template-columns: 18px minmax(0, 1fr) auto 44px; align-items: center; gap: 10px;
    width: 100%; min-height: 44px; padding: 6px 12px 6px 8px; border-radius: 9px; text-align: left;
  }
  .row:hover { background: #F2F6FB; }
  .row:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent); }
  .row.on { background: var(--accentSoft); }
  .mark { justify-self: center; width: 11px; height: 8px; border-radius: 50%; transform: rotate(-20deg); }
  .row.on .mark { background: var(--accent); }
  .t { font: 900 19px/1.25 var(--f-serif); letter-spacing: .04em; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .a { max-width: 190px; font: italic 900 11px/1.2 var(--f-disp); font-stretch: 112%; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .a .cjk { font: 900 12px/1.2 var(--f-sans); font-style: normal; font-stretch: normal; letter-spacing: .08em; }
  .d { justify-self: end; font: 600 12px/1 var(--f-sans); font-variant-numeric: tabular-nums; color: var(--muted); }

  .compact header { padding: 12px 10px 8px 16px; }
  .compact h2 { font-size: 21px; }
  .compact .row { min-height: 40px; grid-template-columns: 14px minmax(0, 1fr) auto; }
  .compact .t { font-size: 16px; }
  .compact .d { display: none; }
  .compact .a { max-width: 120px; }

  /* night: dark glass in a gilded frame with cut corners; the current song gets the crimson lozenge */
  .night { filter: drop-shadow(0 18px 28px rgba(0, 0, 0, .75)); }
  .night .card {
    border: 0; border-radius: 0; transform: none; box-shadow: none; animation: rise .3s cubic-bezier(.2, .8, .2, 1) backwards;
    background: linear-gradient(180deg, rgba(20, 16, 22, .97), rgba(11, 10, 14, .97));
    clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px);
  }
  .night .card::before, .night .card::after { content: ''; position: absolute; pointer-events: none; }
  .night .card::before {
    inset: 0; background: rgba(216, 180, 106, .6);
    clip-path: polygon(12px 0, calc(100% - 12px) 0, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0 calc(100% - 12px), 0 12px, 0 12px, 1px 12.4px, 1px calc(100% - 12.4px), 12.4px calc(100% - 1px), calc(100% - 12.4px) calc(100% - 1px), calc(100% - 1px) calc(100% - 12.4px), calc(100% - 1px) 12.4px, calc(100% - 12.4px) 1px, 12.4px 1px, 1px 12.4px, 0 12px);
  }
  .night .card::after { inset: 5px; border: 1px solid rgba(216, 180, 106, .16); }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
  .night header { border-bottom: 0; padding: 20px 18px 12px 24px; background: linear-gradient(90deg, rgba(216, 180, 106, .45), rgba(216, 180, 106, 0)) left bottom / 100% 1px no-repeat; margin: 0 14px; padding-left: 10px; }
  .night h2 { font: 800 25px/1 var(--f-title); letter-spacing: .08em; color: var(--ink); }
  .night .count { font: italic 600 17px/1 var(--f-gar); font-stretch: normal; color: var(--orn); letter-spacing: .02em; }
  .night .x { border-radius: 0; color: var(--muted); }
  .night .x:hover { color: var(--ink); background: rgba(216, 180, 106, .1); }
  .night .rows { padding: 8px 14px 14px; scrollbar-color: rgba(216, 180, 106, .35) transparent; }
  .night .row { border-radius: 0; }
  .night .row:hover { background: rgba(216, 180, 106, .07); }
  .night .row:focus-visible { box-shadow: inset 0 0 0 1px var(--orn); }
  .night .row.on { background: linear-gradient(90deg, rgba(196, 41, 62, .22), rgba(196, 41, 62, .04)); }
  .night .mark { width: 8px; height: 12px; border-radius: 0; transform: none; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
  .night .row.on .mark { background: var(--accent); }
  .night .t { font: 800 19px/1.3 var(--f-title); letter-spacing: .05em; color: #D9CDC0; }
  .night .row.on .t, .night .row:hover .t { color: var(--ink); }
  .night .a { font: italic 600 15px/1.2 var(--f-gar); font-stretch: normal; letter-spacing: .01em; text-transform: none; color: var(--orn); }
  .night .a .cjk { font: 700 12px/1.2 var(--f-serif); letter-spacing: .1em; }
  .night .d { font: 600 14px/1 var(--f-gar); color: var(--muted); }
  .night.compact .t { font-size: 16px; }
</style>
