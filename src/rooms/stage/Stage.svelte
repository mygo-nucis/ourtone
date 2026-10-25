<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { layoutStage, MAXVIS } from './layout';
  import { Jam } from './jam.svelte';
  import { keys } from './keys.svelte';
  import PlayMode from './PlayMode.svelte';
  import { prewarm } from './warp';
  // play mode's WebGL context is made while the stage is idle, so opening play mode does not wait for it
  prewarm();
  import StageArt from './StageArt.svelte';
  import Windows from './Windows.svelte';
  import DayWheel from './DayWheel.svelte';
  import NightLens from './NightLens.svelte';
  import StageTransport from './StageTransport.svelte';
  import MultiDoor from './MultiDoor.svelte';
  import { recall, keep } from './picks';
  import { playopts } from './playopts.svelte';
  import { fade } from 'svelte/transition';
  import SongList from './SongList.svelte';
  import SpeedControl from './SpeedControl.svelte';
  import { speed, spanAt } from './speed.svelte';
  import { app } from '../../lib/state/app.svelte';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { transport } from '../../lib/audio/transport.svelte';
  import { engine } from '../../lib/audio/engine';
  import { F } from '../../lib/art/type';

  let vw = $state(1440), vh = $state(900);
  /* the safe-area insets at the sides (an iPhone's notch or Dynamic Island, held sideways), read off a probe that is
     padded by them and has no width of its own, so its size changes whenever they do (the phone turns) */
  let probe: HTMLDivElement, ins = $state({ l: 0, r: 0 });
  $effect(() => {
    const read = () => {
      const c = getComputedStyle(probe), l = parseFloat(c.paddingLeft) || 0, r = parseFloat(c.paddingRight) || 0;
      if (l !== ins.l || r !== ins.r) ins = { l, r };
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(probe, { box: 'border-box' });
    // a half turn (an Android phone's cutout on one side, now the other) keeps the size: read again after it settles
    const turn = () => requestAnimationFrame(() => requestAnimationFrame(read));
    screen.orientation?.addEventListener('change', turn);
    return () => { ro.disconnect(); screen.orientation?.removeEventListener('change', turn); };
  });
  const song = $derived(transport.song);
  /** the parts that get a window: every part with notes (audio tracks play along, but have nothing to fall) */
  const playable = $derived((song?.parts ?? []).filter(p => !p.audio).map(p => p.index));
  const visible = $derived(app.allParts || playable.length <= MAXVIS ? playable : playable.slice(0, MAXVIS));
  const L = $derived(layoutStage(vw, vh, visible, theme.night, ins));
  /** the song's tempo sets its default fall speed */
  const span = $derived(spanAt(speed.level, L.compact));
  const extra = $derived(playable.length - MAXVIS);

  // the selector glides between songs
  const pos = new Tween(app.index, { duration: 520, easing: cubicOut });
  $effect(() => { pos.target = app.index; });

  // the windows keep their own play-along view switched off: playing a part happens in play mode
  const jam = new Jam();
  $effect(() => { jam.set(song, null); transport.setGuide(null); return () => transport.setGuide(null); });

  /* play mode: the window tips back into a lane highway over the stage (PlayMode.svelte); several parts at once tip back
     the lead part's window (the melody, the bass, another part, the drums: the first of them picked) */
  let playing = $state<{ parts: number[]; lead: number } | null>(null);
  function pick(part: number) { playing = { parts: [part], lead: part }; }

  /* multi-track: the button dims the stage but its windows; a click on a window picks it (it rises) or lets it go, a
     click anywhere else leaves, and the button again plays the picked parts together. each song keeps its pick */
  let picking = $state(false), picked = $state.raw<ReadonlySet<number>>(new Set());
  const rank = (i: number) => { const p = song!.parts[i]; return p.data.role === 'melody' ? 0 : p.drums ? 3 : p.data.role === 'bass' ? 1 : 2; };
  function onmulti() {
    if (!song) return;
    if (!picking) {
      picked = new Set(recall(song).filter(i => playable.includes(i)));
      // a picked part beyond the first few windows: they all show
      if ([...picked].some(i => !visible.includes(i))) app.allParts = true;
      picking = true;
      return;
    }
    picking = false;
    if (!picked.size) return;
    const parts = [...picked].sort((a, b) => a - b);
    const shown = parts.filter(i => L.wins.some(w => w.part === i));
    const lead = [...(shown.length ? shown : parts)].sort((a, b) => rank(a) - rank(b) || a - b)[0];
    playing = { parts, lead };
  }
  function toggle(part: number) {
    const s = new Set(picked);
    if (s.has(part)) s.delete(part); else s.add(part);
    picked = s;
    if (song) keep(song, s);
  }
  $effect(() => { void song; playing = null; picking = false; });
  $effect(() => { document.documentElement.classList.toggle('ut-picking', picking); return () => document.documentElement.classList.remove('ut-picking'); });

  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  async function playToggle() { await engine.unlock(); transport.toggle(); }

  /* the whole library as a list, opened from the title; a pick turns the selector the short way round to it */
  let listing = $state(false);
  function pickFromList(i: number) {
    const n = app.library.length;
    let d = i - ((app.index % n) + n) % n;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    listing = false;
    if (d) void app.open(app.index + d);
  }

  function onkeydown(e: KeyboardEvent) {
    if (app.room !== 'stage' || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    // a focused button answers Space and Enter itself
    if (el && el.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    if (playing) return;
    if (picking) {
      if (e.key === 'Escape') picking = false;
      else if (e.key === 'Enter') { e.preventDefault(); onmulti(); }
      else if (e.key === ' ') { e.preventDefault(); if (!e.repeat) void playToggle(); }
      return;
    }
    // a play key on the stage goes straight into play mode with the melody
    if (keys.lane(e.code) >= 0 && song) {
      e.preventDefault();
      const m = song.parts.findIndex(p => p.data.role === 'melody' && !p.audio);
      pick(m >= 0 ? m : playable[0] ?? 0);
      return;
    }
    switch (e.key) {
      case ' ': e.preventDefault(); if (!e.repeat) void playToggle(); break;
      case 'ArrowUp': e.preventDefault(); app.step(-1); break;
      case 'ArrowDown': e.preventDefault(); app.step(1); break;
      case 'ArrowLeft': e.preventDefault(); transport.seek(transport.now() - 5); break;
      case 'ArrowRight': e.preventDefault(); transport.seek(transport.now() + 5); break;
      case '[': e.preventDefault(); speed.nudge(-1); break;
      case ']': e.preventDefault(); speed.nudge(1); break;
      case 'Escape': if (listing) listing = false; break;
    }
  }

  // scrolling or swiping over the song selector changes songs
  let acc = 0, lastStep = 0;
  function overSelector(e: WheelEvent) {
    if (listing || playing || picking) return;
    const t = e.target as Element, st = e.currentTarget as HTMLElement, r = st.getBoundingClientRect();
    const x = (e.clientX - r.left) / L.s, y = (e.clientY - r.top) / L.s;
    const inZone = x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h;
    if (inZone || t.closest?.('.wheel .cur, .wheel .pick, .lens .row, .over .open')) onwheel(e);
  }
  function onwheel(e: WheelEvent) {
    e.preventDefault();
    acc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : 0;
    const now = performance.now();
    if (Math.abs(acc) > 40 && now - lastStep > 170) { app.step(acc > 0 ? 1 : -1); acc = 0; lastStep = now; }
    if (now - lastStep > 400) acc *= .5;
  }
  let sy = 0, swiping = false;
  function ondown(e: PointerEvent) { if (e.pointerType === 'mouse') return; sy = e.clientY; swiping = true; }
  function onmove(e: PointerEvent) {
    if (!swiping) return;
    const d = (e.clientY - sy) / L.s;
    if (Math.abs(d) > 46) { app.step(d < 0 ? 1 : -1); sy = e.clientY; }
  }
  const zone = $derived(L.compact ? { x: 0, y: 70, w: L.col.x + L.col.w, h: L.H - 200 } : theme.night ? { x: 0, y: L.lens.FY, w: 360, h: L.lens.H - 40 } : { x: 0, y: L.wheel.CY - 310, w: 480, h: 360 });
</script>

<svelte:window {onkeydown} />

<div class="host" bind:clientWidth={vw} bind:clientHeight={vh}>
  <div class="probe" bind:this={probe}></div>
  <!-- the song titles themselves take clicks, so the wheel is heard on the whole stage: over the titles or their zone -->
  <div class="stage" style="width:{L.W}px;height:{L.H}px;transform:scale({L.s})" onwheel={overSelector}>
    <StageArt {L} />
    {#if song}
      <Windows {L} {song} {jam} {span} away={playing?.lead ?? null} {picking} {picked} onpick={(p) => (picking ? toggle(p) : pick(p))} />
    {/if}
    <div class="zone" style="left:{zone.x}px;top:{zone.y}px;width:{zone.w}px;height:{zone.h}px" onpointerdown={ondown} onpointermove={onmove} onpointerup={() => (swiping = false)} onpointercancel={() => (swiping = false)} role="presentation"></div>
    {#if theme.night}
      <NightLens {L} quiet={picking} library={app.library} pos={pos.current} index={app.index} onopen={(i) => app.open(i)} ondelete={(id) => app.remove(id)} onlist={() => (listing = true)} />
    {:else}
      <DayWheel {L} quiet={picking} library={app.library} pos={pos.current} index={app.index} onopen={(i) => app.open(i)} ondelete={(id) => app.remove(id)} onlist={() => (listing = true)} />
    {/if}
    {#if L.hint && !picking}
      <svg class="hint" width={L.W} height={L.H} viewBox="0 0 {L.W} {L.H}" aria-hidden="true">
        <text x={L.hint.x} y={L.hint.y} font-family={F.sans} font-size={L.hint.size} font-weight="500" fill={theme.pal.muted} letter-spacing="1">{coarse ? i18n.t('hintTouch') : i18n.t('hintKeys')}</text>
      </svg>
    {/if}
    <StageTransport {L} onplay={playToggle} quiet={!!playing} />
    {#if picking}
      <div class="dim" class:night={theme.night} transition:fade={{ duration: 220 }} onclick={() => (picking = false)} role="presentation"></div>
      {#if L.hint}
        <svg class="hint top" width={L.W} height={L.H} viewBox="0 0 {L.W} {L.H}" aria-hidden="true" transition:fade={{ duration: 220 }}>
          {#each i18n.list(coarse ? 'multiHintTouch' : 'multiHint') as line, i}
            <text x={L.hint.x} y={L.hint.y + i * L.hint.size * 1.8} font-family={F.sans} font-size={L.hint.size} font-weight="700" fill={theme.pal.ink} letter-spacing="1">{line}</text>
          {/each}
        </svg>
      {/if}
    {/if}
    <MultiDoor {L} {picking} count={picked.size} onclick={onmulti} />
    {#if picking}
      <!-- how the picked parts share the lanes: by the Multi-Track button, under it (a phone's has no room below: over it) -->
      {@const at = L.compact ? { x: L.multi.x + 2, y: L.multi.y - 50 } : { x: L.multi.x + 2, y: L.multi.y + L.multi.h + 14 }}
      <button class="split" class:night={theme.night} class:compact={L.compact} role="checkbox" aria-checked={playopts.split} title={i18n.t('multiSplitHint')}
        style="left:{at.x}px;top:{at.y}px" onclick={() => playopts.setSplit(!playopts.split)} transition:fade={{ duration: 220 }}>
        <span class="box" class:on={playopts.split}>
          {#if playopts.split}<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M1.8 6.3 4.8 9.2 10.3 2.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}
        </span>{i18n.t('multiSplit')}
      </button>
    {/if}
    <svg class="hint" width={L.W} height={L.H} viewBox="0 0 {L.W} {L.H}"><SpeedControl {L} /></svg>
    {#if L.tag && extra > 0}
      {#if L.compact}
        <button class="badge" class:night={theme.night} class:over={picking} style="left:{L.tag.x}px;top:{L.tag.y}px" onclick={() => (app.allParts = !app.allParts)} aria-label={app.allParts ? i18n.t('fewerPartsTag') : i18n.t('morePartsTag', { n: extra })}>
          {app.allParts ? '−' : `+${extra}`}
        </button>
      {:else}
        <button class="tag" class:night={theme.night} class:over={picking} style="left:{L.tag.x}px;top:{L.tag.y}px" onclick={() => (app.allParts = !app.allParts)}>
          {app.allParts ? i18n.t('fewerPartsTag') : i18n.t('morePartsTag', { n: extra })}
        </button>
      {/if}
    {/if}
    {#if playing && song}
      <PlayMode {L} {song} parts={playing.parts} lead={playing.lead} onexit={() => (playing = null)} />
    {/if}
    {#if listing}
      <SongList {L} library={app.library} index={app.index} onpick={pickFromList} onclose={() => (listing = false)} />
    {/if}
  </div>
</div>

<style>
  .host { position: absolute; inset: 0; overflow: hidden; }
  /* the stage is played, not read: a long press (holding a note, on a phone) selects nothing and opens no callout */
  .stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  .zone { position: absolute; touch-action: none; }
  .probe { position: absolute; width: 0; height: 1px; visibility: hidden; pointer-events: none; padding: 0 env(safe-area-inset-right, 0px) 0 env(safe-area-inset-left, 0px); }
  .hint { position: absolute; left: 0; top: 0; pointer-events: none; }
  /* picking parts: the stage dims under its windows (as play mode's scrim, lighter), and the button, the hint and the
     more-parts tag stand over it */
  .dim { position: absolute; inset: 0; z-index: 5; background: rgba(246, 249, 253, .72); }
  .dim.night { background: rgba(5, 4, 7, .7); }
  .hint.top { z-index: 6; }
  .tag.over, .badge.over { z-index: 7; }
  .split {
    position: absolute; z-index: 7; display: flex; align-items: center; gap: 9px; padding: 4px 3px; white-space: nowrap;
    font: 700 12px/1 var(--f-sans); letter-spacing: 1px; color: var(--ink); cursor: pointer;
  }
  .split.compact { font-size: 14px; padding: 8px 3px; }
  .box {
    width: 16px; height: 16px; display: grid; place-items: center; flex: none; border-radius: 4px; color: #FFFFFF;
    background: #FFFFFF; box-shadow: inset 0 0 0 1.6px var(--ink);
  }
  .box.on { background: var(--accent); box-shadow: inset 0 0 0 1.6px var(--accent); }
  .split:hover .box:not(.on) { box-shadow: inset 0 0 0 1.6px var(--accent); }
  .split.night { font: 600 15px/1 var(--f-gar); letter-spacing: .3px; }
  .split.night .box { border-radius: 0; background: rgba(11, 10, 14, .7); box-shadow: inset 0 0 0 1px rgba(216, 180, 106, .6); color: #FFF3EE; }
  .split.night .box.on { background: #C4293E; box-shadow: inset 0 0 0 1px #D8B46A; }
  .tag {
    position: absolute; transform: rotate(4deg); padding: 9px 16px;
    font: 700 16px/1 var(--f-sans); color: #1C2030; background: #FFFFFF;
    border: 2px solid #1C2030; border-radius: 6px;
    box-shadow: 0 0 0 5px #FFFFFF, 3px 7px 0 4px rgba(28, 32, 48, .14);
    white-space: nowrap; transition: transform .2s;
  }
  .tag:hover { transform: rotate(2deg) translateY(-2px); }
  .tag.night {
    transform: none; color: #EDE6E1; background: #16141B; border: 1.2px solid rgba(237, 230, 225, .55); border-radius: 0;
    box-shadow: inset 0 0 0 3px #16141B, inset 0 0 0 4px rgba(237, 230, 225, .12);
  }
  .tag.night:hover { transform: translateY(-2px); border-color: #D8B46A; }
  .badge {
    position: absolute; z-index: 3; min-width: 44px; height: 44px; padding: 0 8px; border-radius: 22px;
    font: italic 900 18px/44px var(--f-disp); font-stretch: 112%; color: #FFFFFF; background: #2F86E8;
    box-shadow: 0 0 0 4px #FFFFFF, 2px 5px 0 4px rgba(28, 32, 48, .14);
  }
  .badge.night {
    border-radius: 0; font: 700 21px/44px var(--f-gar); color: #EDE6E1; background: #C4293E; box-shadow: none;
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); min-width: 52px; height: 52px; line-height: 52px;
  }
</style>
