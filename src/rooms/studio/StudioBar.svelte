<script lang="ts">
  import Icon from '../../components/ui/Icon.svelte';
  import Menu from '../../components/ui/Menu.svelte';
  import Toggle from '../../components/ui/Toggle.svelte';
  import AccText from '../../components/ui/AccText.svelte';
  import { studio } from '../../lib/project/studio.svelte';
  import { exporter } from '../../lib/project/exporter.svelte';
  import type { ExportKind } from '../../lib/project/export';
  import { transport } from '../../lib/audio/transport.svelte';
  import { app } from '../../lib/state/app.svelte';
  import { gen } from '../../lib/gen/panel.svelte';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import { pitchName, usesFlats, keyName, MODES } from '../../lib/music/theory';
  import type { Mode, SongMeta } from '../../lib/music/types';
  import { gesture } from '../../components/ui/gesture';
  import { mod, MIDI_ACCEPT } from '../../lib/util';
  import { playPause as play, toStart, toggleRecord as record, toggleLoop as loop } from './actions';

  /* the studio's half of the top bar: which song, the transport, where you are, tempo, metre, key, and export.
     on a phone only the song, play, record, the clock and export remain */
  let { compact = false }: { compact?: boolean } = $props();
  const song = $derived(transport.song);
  const bpm = $derived(song ? Math.round(song.data.tempos[0][1] * 10) / 10 : 0);
  const meter = $derived(song ? `${song.data.meters[0][1]}/${song.data.meters[0][2]}` : '');
  const key = $derived(song?.data.key);

  /* the clock and bar number run from the audio clock, outside Svelte's updates */
  function clock(el: HTMLElement) {
    let raf = 0;
    const time = el.querySelector('.time') as HTMLElement, bar = el.querySelector('.bar') as HTMLElement;
    let lastT = '', lastB = '';
    const f = () => {
      const s = transport.song, t = transport.now();
      const m = Math.floor(t / 60), sec = t - m * 60;
      const txt = `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
      if (txt !== lastT) { time.textContent = txt; lastT = txt; }
      const g = studio.grid;
      const b = s && g ? i18n.t('barOf', { n: g.barAt(s.tl.tick(t)) + 1 }) : '';
      if (b !== lastB) { bar.textContent = b; lastB = b; }
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return { destroy() { cancelAnimationFrame(raf); } };
  }

  /* songs */
  let songOpen = $state(false);
  /** the song whose ··· was pressed (its row shows rename and delete), the one whose delete was pressed once (a
      second press deletes it), and the one being renamed */
  let acting = $state(''), doomed = $state(''), naming = $state(''), nameDraft = $state('');
  function startRename(m: SongMeta) { nameDraft = i18n.pick(m.title); naming = m.id; acting = ''; doomed = ''; }
  /** Enter, Done, leaving the field or closing the menu keep the name; Escape drops it (and leaves the menu open) */
  function commitName() {
    const id = naming, m = app.library.find(x => x.id === id);
    naming = '';
    if (m && nameDraft.trim() && nameDraft.trim() !== i18n.pick(m.title)) studio.renameSong(id, nameDraft);
  }
  $effect(() => { if (!songOpen && naming) commitName(); });
  // the old name selected, so typing replaces it (after the bound value lands)
  function takeFocus(el: HTMLInputElement) { el.focus(); requestAnimationFrame(() => el.select()); }
  /* the songs dragged into another order. a mouse drags a row once it moves; a finger holds the row a moment first (a
     quick swipe scrolls the list). a built-in song takes the viewer's copies under it along */
  let list = $state<HTMLElement | null>(null);
  let drag = $state<{ from: number; n: number; to: number; dy: number; bh: number } | null>(null);
  let dropped = false;
  /** a song's copy hangs under it while it follows the original or another copy of it */
  const hung = (i: number) => { const m = app.library[i], p = app.library[i - 1]; return !!m.from && !!p && (p.id === m.from || p.from === m.from); };
  function grab(e: PointerEvent, i: number) {
    if (e.button !== 0 || naming || (e.target as Element).closest('.act, input')) return;
    const rows = [...list!.querySelectorAll<HTMLElement>(':scope > .row')], menu = list!.closest('.menu') as HTMLElement;
    const lib = app.library, m = lib[i];
    let n = 1;
    if (!m.from) while (i + n < lib.length && lib[i + n].from === m.id && hung(i + n)) n++;
    const k = menu.getBoundingClientRect().height / menu.offsetHeight || 1;
    const at = (y: number) => (y - menu.getBoundingClientRect().top) / k + menu.scrollTop;
    const y0 = at(e.clientY), top = rows.map(r => r.offsetTop), h = rows.map(r => r.offsetHeight);
    const blockTop = top[i], blockH = top[i + n - 1] + h[i + n - 1] - blockTop;
    const span = [top[0], top[rows.length - 1] + h[rows.length - 1]];
    const touch = e.pointerType !== 'mouse';
    let live = false, y = e.clientY, raf = 0, timer = 0;
    const place = () => {
      const dy = Math.max(span[0] - blockTop, Math.min(span[1] - blockTop - blockH, at(y) - y0));
      const c = blockTop + dy + blockH / 2;
      let to = 0;
      for (let j = 0; j < rows.length; j++) if ((j < i || j >= i + n) && top[j] + h[j] / 2 < c) to++;
      drag = { from: i, n, to, dy, bh: blockH };
    };
    const start = () => { live = true; acting = ''; doomed = ''; place(); raf = requestAnimationFrame(edge); };
    // near the top or bottom of the list, it scrolls
    const edge = () => {
      const r = menu.getBoundingClientRect(), z = 40 * k;
      const v = y < r.top + z ? -(r.top + z - y) / z : y > r.bottom - z ? (y - r.bottom + z) / z : 0;
      if (v) { menu.scrollTop += Math.max(-1, Math.min(1, v)) * 12; place(); }
      raf = requestAnimationFrame(edge);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      y = ev.clientY;
      if (live) { place(); return; }
      const d = Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY);
      if (!touch && d > 4) start();
      else if (touch && d > 8) end();
    };
    // while a finger drags, the list must not scroll under it
    const hold = (ev: TouchEvent) => { if (live) ev.preventDefault(); };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (live && drag && ev.type === 'pointerup') {
        const ids = lib.slice(i, i + n).map(x => x.id);
        if (drag.to !== i) app.reorder(ids, drag.to);
      }
      end();
    };
    const end = () => {
      clearTimeout(timer); cancelAnimationFrame(raf);
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      removeEventListener('touchmove', hold);
      // the press that ends a drag is not a choice of song
      if (live) { dropped = true; setTimeout(() => (dropped = false)); }
      live = false; drag = null;
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    addEventListener('touchmove', hold, { passive: false });
    if (touch) timer = setTimeout(start, 380);
  }
  /** how far a row stands off its place while songs are dragged */
  function shift(j: number) {
    const d = drag;
    if (!d) return 0;
    if (j >= d.from && j < d.from + d.n) return d.dy;
    return j < d.from ? (j >= d.to ? d.bh : 0) : (j - d.n < d.to ? -d.bh : 0);
  }
  let file: HTMLInputElement;
  async function pickFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (f) await app.importFile(f);
  }

  /* tempo */
  let tempoOpen = $state(false);
  let draft = $state('');
  $effect(() => { if (tempoOpen) draft = String(bpm); });
  const g = gesture();
  function nudge(d: number) { studio.setTempo(bpm + d, g.burst('t', 1200)); }
  function commitTempo() { const v = parseFloat(draft); if (isFinite(v)) studio.setTempo(v); }

  /* key */
  let keyOpen = $state(false), meterOpen = $state(false);
  let moveNotes = $state(false);
  const MODE_LIST: Mode[] = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'];
  const modeName = (m: Mode) => keyName(0, m, i18n.lang).replace(/^\S+\s/, '');

  /* export */
  let expOpen = $state(false);
  let onlySel = $state(false);
  function doExport(kind: ExportKind) {
    const s = transport.song, r = studio.range;
    if (!s) return;
    void studio.flush();
    const span = onlySel && r && kind !== 'midi' ? { from: s.tl.sec(r.a), to: s.tl.sec(r.b) } : {};
    void exporter.run(kind, s, { lang: i18n.lang, night: theme.night, ...span });
  }
  const expLabel = $derived(exporter.busy ? i18n.t('rendering', { p: Math.round(exporter.progress * 100) })
    : exporter.result === 'saved' ? i18n.t('exported') : exporter.result === 'unavailable' ? i18n.t('exportUnavailable') : exporter.result === 'failed' ? i18n.t('exportFailed') : i18n.t('export'));
  const framed = typeof window !== 'undefined' && !!(window as unknown as { claude?: unknown }).claude;
</script>

<div class="sbar" class:night={theme.night} class:compact>
  <Menu bind:open={songOpen} width={340} label={i18n.t('songs')} shrink>
    {#snippet trigger({ toggle, open })}
      <button class="song" class:open onclick={() => { acting = ''; doomed = ''; naming = ''; toggle(); }} aria-haspopup="menu" aria-expanded={open}>
        <span class="tt">{app.importing ? i18n.t('importing') : song ? i18n.pick(song.data.title) : '…'}</span>
        <Icon name="down" size={14} sw={2.2} />
      </button>
    {/snippet}
    {#snippet children({ close })}
      <div class="mh">{i18n.t('songs')}</div>
      <div class="songs" class:dragging={!!drag} bind:this={list}>
      {#each app.library as m, i (m.id)}
        {@const off = shift(i)}
        <div class="row" role="presentation" class:copy={hung(i)} class:lifted={!!drag && i >= drag.from && i < drag.from + drag.n} style:transform={off ? `translateY(${off}px)` : null}
          onpointerdown={(e) => grab(e, i)} onclickcapture={(e) => { if (dropped) { e.stopPropagation(); e.preventDefault(); } }}>
          {#if naming === m.id}
            <input class="name" use:takeFocus bind:value={nameDraft} maxlength="80" aria-label={i18n.t('songName')} spellcheck="false" data-own-escape
              onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitName(); if (e.key === 'Escape') naming = ''; }} onblur={commitName} />
            <button class="act ok" onclick={commitName}><Icon name="check" size={15} sw={2.2} /><span>{i18n.t('renameDone')}</span></button>
          {:else}
            <button class="mi" class:on={i === mod(app.index, app.library.length)} role="menuitem" onclick={() => { close(); void app.open(i); }}>
              <span class="st"><span class="t1">{i18n.pick(m.title)}</span><span class="t2">{i18n.pick(m.artist)}</span></span>
              {#if m.user && acting !== m.id}<span class="sub">{m.from ? i18n.t('myCopy') : i18n.t('mine')}</span>{/if}
            </button>
            {#if m.user && acting === m.id}
              {#if doomed !== m.id}<button class="act" onclick={() => startRename(m)} aria-label="{i18n.t('renameSong')} {i18n.pick(m.title)}"><Icon name="pen" size={15} sw={1.8} /><span>{i18n.t('renameSong')}</span></button>{/if}
              <button class="act del" class:armed={doomed === m.id} title={doomed === m.id ? i18n.t('deleteConfirm') : i18n.t('deleteSong')} aria-label="{i18n.t('deleteSong')} {i18n.pick(m.title)}"
                onclick={() => { if (doomed !== m.id) { doomed = m.id; return; } doomed = ''; acting = ''; void app.remove(m.id); }}>
                <Icon name="trash" size={15} sw={1.8} />{#if doomed === m.id}<span>{i18n.t('deleteConfirm')}</span>{/if}
              </button>
            {:else if m.user}
              <button class="act dots" title={i18n.t('songMore')} aria-label="{i18n.t('songMore')} {i18n.pick(m.title)}" aria-expanded="false"
                onclick={() => { acting = m.id; doomed = ''; }}><Icon name="more" size={17} sw={1.8} /></button>
            {/if}
          {/if}
        </div>
      {/each}
      </div>
      <div class="sep"></div>
      <button class="mi" role="menuitem" onclick={() => { close(); gen.show(); }}><Icon name="spark" size={16} sw={1.8} />{i18n.t('genMenu')}</button>
      <button class="mi" role="menuitem" onclick={() => { close(); void app.newSong(); }}><Icon name="plus" size={16} sw={2} />{i18n.t('newSong')}</button>
      <button class="mi" role="menuitem" onclick={() => { close(); file.click(); }}><Icon name="upload" size={16} sw={1.9} />{i18n.t('importMidi')}</button>
      <p class="note">{i18n.t('libraryNote')} {i18n.t('reorderNote')}{#if app.reordered} <button class="reset" onclick={() => app.defaultOrder()}>{i18n.t('defaultOrder')}</button>{/if}</p>
    {/snippet}
  </Menu>
  <input bind:this={file} type="file" accept={MIDI_ACCEPT} hidden onchange={pickFile} />

  <div class="tp">
    <button class="ib" class:hide={compact} onclick={toStart} title={i18n.t('toStart')} aria-label={i18n.t('toStart')}><Icon name="back" size={22} sw={1.8} /></button>
    <button class="play" onclick={play} aria-label={transport.playing ? i18n.t('pause') : i18n.t('play')} title="{transport.playing ? i18n.t('pause') : i18n.t('play')} (Space)">
      {#if transport.playing}
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13M16 5.5v13" stroke="currentColor" stroke-width="3.2" stroke-linecap={theme.night ? 'butt' : 'round'} /></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l10-6.5Z" fill="currentColor" /></svg>
      {/if}
    </button>
    <button class="rec" class:on={studio.recording} onclick={record} title={i18n.t('record')} aria-label={i18n.t('record')} aria-pressed={studio.recording}>
      {#if theme.night}
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="#C4293E" stroke-width="1.6" /><path d="M10 5.5L13.2 10L10 14.5L6.8 10Z" fill="#C4293E" /></svg>
      {:else}
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="#E2483F" /></svg>
      {/if}
    </button>
    <button class="ib loop" class:hide={compact} class:on={transport.loopOn} onclick={loop} title={i18n.t('loop')} aria-label={i18n.t('loop')} aria-pressed={transport.loopOn}><Icon name="loop" size={22} sw={1.8} /></button>
  </div>

  <div class="where" use:clock>
    <span class="time ut-num">00:00.00</span>
    <span class="bar"></span>
  </div>

  {#if !compact}
  <Menu bind:open={tempoOpen} width={230} label={i18n.t('tempo')}>
    {#snippet trigger({ toggle, open })}
      <button class="val" class:open onclick={toggle} title={i18n.t('tempo')} aria-haspopup="dialog"><span class="n ut-num">{bpm}</span><span class="u">BPM</span></button>
    {/snippet}
    {#snippet children()}
      <div class="mh">{i18n.t('tempo')}</div>
      <div class="tempo">
        <button class="ut-btn icon" onclick={() => nudge(-1)} aria-label="−1"><Icon name="minus" size={14} sw={2.2} /></button>
        <input class="bpm ut-num" type="number" min="20" max="320" step="1" bind:value={draft} onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitTempo(); }} onblur={commitTempo} aria-label="BPM" />
        <button class="ut-btn icon" onclick={() => nudge(1)} aria-label="+1"><Icon name="plus" size={14} sw={2.2} /></button>
      </div>
      {#if song && song.data.tempos.length > 1}<p class="note">{i18n.t('tempoScaled')}</p>{/if}
    {/snippet}
  </Menu>

  <Menu bind:open={meterOpen} width={236} label={i18n.t('meter')}>
    {#snippet trigger({ toggle, open })}
      <button class="val mt" class:open onclick={toggle} title={i18n.t('meter')} aria-haspopup="dialog"><span class="meter ut-num">{meter}</span></button>
    {/snippet}
    {#snippet children()}
      {#if song}
        {@const m0 = song.data.meters[0]}
        <div class="mh">{i18n.t('meterBeats')}</div>
        <div class="nums">
          {#each [2, 3, 4, 5, 6, 7, 9, 12] as k}<button class="tn ut-num" class:on={m0[1] === k} onclick={() => studio.setMeter(k, m0[2])}>{k}</button>{/each}
        </div>
        <div class="mh">{i18n.t('meterUnit')}</div>
        <div class="nums">
          {#each [2, 4, 8] as k}<button class="tn ut-num" class:on={m0[2] === k} onclick={() => studio.setMeter(m0[1], k)}>{k}</button>{/each}
        </div>
        <p class="note">{song.data.meters.length > 1 ? i18n.t('meterLater') : i18n.t('meterNote')}</p>
      {/if}
    {/snippet}
  </Menu>

  <Menu bind:open={keyOpen} width={316} label={i18n.t('key')}>
    {#snippet trigger({ toggle, open })}
      <button class="key" class:open onclick={toggle} title={i18n.t('key')} aria-haspopup="dialog"><AccText text={key ? keyName(key.tonic, key.mode, i18n.lang) : ''} /></button>
    {/snippet}
    {#snippet children()}
      {#if key}
        <div class="mh">{i18n.t('key')}</div>
        <div class="tonics">
          {#each Array.from({ length: 12 }, (_, k) => k) as t}
            <button class="tn" class:on={t === key.tonic} onclick={() => studio.setKey(t, key.mode, moveNotes)}><AccText text={pitchName(t, usesFlats(t, key.mode))} /></button>
          {/each}
        </div>
        <div class="modes">
          {#each MODE_LIST as m}
            <button class="md" class:on={m === key.mode} onclick={() => studio.setKey(key.tonic, m, false)}>{modeName(m)}</button>
          {/each}
        </div>
        <label class="mv"><Toggle on={moveNotes} label={i18n.t('keyMove')} onchange={(v) => (moveNotes = v)} /><span>{moveNotes ? i18n.t('keyMove') : i18n.t('keyOnly')}</span></label>
        <p class="note scale"><AccText text={MODES[key.mode].map(x => pitchName((key.tonic + x) % 12, usesFlats(key.tonic, key.mode))).join(' · ')} /></p>
      {/if}
    {/snippet}
  </Menu>

  {/if}
  <span class="gap"></span>

  <Menu bind:open={expOpen} width={280} align="right" label={i18n.t('export')}>
    {#snippet trigger({ toggle })}
      {#if compact}
        <button class="ut-btn primary icon cexp" onclick={toggle} disabled={!song} aria-haspopup="menu" aria-label={i18n.t('export')} title={expLabel}><Icon name="export" size={17} sw={2} /></button>
      {:else}
        <button class="ut-btn primary lg exp" class:busy={!!exporter.busy} onclick={toggle} disabled={!song} aria-haspopup="menu">
          {#if exporter.busy}<span class="prog" style="transform:scaleX({exporter.progress})" aria-hidden="true"></span>{/if}
          <span class="lbl">{expLabel}</span>
        </button>
      {/if}
    {/snippet}
    {#snippet children({ close })}
      <div class="mh">{i18n.t('export')}</div>
      <button class="mi" role="menuitem" disabled={!!exporter.busy} onclick={() => { close(); doExport('midi'); }}><Icon name="note" size={17} sw={1.8} /><span class="st"><span class="t1">{i18n.t('exportMidi')}</span><span class="t2">{i18n.t('exportMidiSub')}</span></span></button>
      <button class="mi" role="menuitem" disabled={!!exporter.busy} onclick={() => { close(); doExport('wav'); }}><Icon name="wave" size={17} sw={1.8} /><span class="st"><span class="t1">{i18n.t('exportWav')}</span><span class="t2">{i18n.t('exportWavSub')}</span></span></button>
      <button class="mi" role="menuitem" disabled={!!exporter.busy} onclick={() => { close(); doExport('mp3'); }}><Icon name="export" size={17} sw={1.8} /><span class="st"><span class="t1">{i18n.t('exportMp3')}</span><span class="t2">{i18n.t('exportMp3Sub')}</span></span></button>
      {#if studio.range}
        <div class="sep"></div>
        <label class="mv"><Toggle on={onlySel} label={i18n.t('exportSelection')} onchange={(v) => (onlySel = v)} /><span>{i18n.t('exportSelection')}</span></label>
      {/if}
      {#if song?.parts.some(p => p.audio)}<p class="note">{i18n.t('exportMidiAudio')}</p>{/if}
      {#if framed}<p class="note">{i18n.t('exportZip')}</p>{/if}
    {/snippet}
  </Menu>
</div>

<style>
  .sbar { flex: 1; display: flex; align-items: center; gap: calc(16px * var(--cs)); min-width: 0; height: calc(64px * var(--cs)); }
  @media (max-width: 1360px) { .where .bar { display: none; } }
  .sbar .hide { display: none; }
  .compact { gap: 10px; height: 30px; }
  .compact .song { max-width: 118px; height: 30px; padding: 0 6px; }
  .compact .song .tt { font-size: 13px; }
  .compact .where .bar { display: none; }
  .compact .time { font-size: 18px; min-width: 88px; }
  .compact.night .time { font-size: 20px; min-width: 78px; }
  .compact .play { width: 30px; height: 30px; }
  .compact.night .play { width: 34px; height: 34px; }
  .cexp { width: 32px; height: 30px; letter-spacing: 0; }
  .song { display: inline-flex; align-items: center; gap: 6px; max-width: calc(210px * var(--cs)); height: calc(34px * var(--cs)); padding: 0 calc(10px * var(--cs)); border-radius: 8px; color: var(--ink); }
  .song:hover, .song.open { background: var(--accentSoft); }
  .song .tt { font: 900 calc(15px * var(--cs))/1.2 var(--f-serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .night .song .tt { font: 800 calc(15.5px * var(--cs))/1.2 var(--f-title); }
  .row { position: relative; display: flex; align-items: center; -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; }
  .dragging .row { transition: transform .16s cubic-bezier(.3, .7, .4, 1); }
  .dragging .row.lifted { z-index: 1; transition: none; background: var(--surface); box-shadow: 0 0 0 1px var(--hair), 0 10px 22px -10px rgba(28, 32, 48, .35); border-radius: 8px; }
  .dragging, .dragging :global(*) { cursor: grabbing !important; }
  .dragging .row :global(.mi:hover) { background: none; }
  .dragging .row.lifted :global(.mi) { background: var(--accentSoft); }
  :global([data-sky="night"]) .dragging .row.lifted { border-radius: 0; background: #16141B; box-shadow: 0 0 0 1px rgba(216, 180, 106, .35), 0 10px 22px -10px rgba(0, 0, 0, .8); }
  .note .reset { display: inline; padding: 0; font: inherit; color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
  .row.copy :global(.mi) { padding-left: 24px; }
  .row.copy::before { content: ''; position: absolute; left: 12px; top: 8px; width: 7px; height: 12px; border-left: 1.5px solid var(--hair); border-bottom: 1.5px solid var(--hair); border-bottom-left-radius: 4px; }
  .row :global(.mi) { flex: 1; min-width: 0; }
  /* a song of the viewer's: ··· opens rename and delete in its row */
  .act { flex: none; display: inline-flex; align-items: center; gap: 5px; height: 28px; min-width: 28px; padding: 0 7px; margin-left: 2px; border-radius: 7px; color: var(--muted); font: 700 12px/1 var(--f-sans); white-space: nowrap; }
  .act:hover { color: var(--accent); background: var(--accentSoft); }
  .act.dots { justify-content: center; padding: 0; width: 30px; }
  .del:hover { color: var(--signal); }
  .del.armed { color: var(--on); background: var(--signal); }
  .act.ok { color: var(--accent); }
  .name { flex: 1; min-width: 0; height: 34px; margin: 0 2px 0 4px; padding: 0 9px; font: 700 13px/1 var(--f-sans); color: var(--ink); background: var(--surface); border: 1.5px solid var(--accent); border-radius: 8px; outline: none; }
  .row.copy .name { margin-left: 20px; }
  :global([data-sky="night"]) .act, :global([data-sky="night"]) .name { border-radius: 0; }
  :global([data-sky="night"]) .name { background: var(--well); }
  .song :global(.ic) { color: var(--muted); }
  .night .song { border-radius: 0; }

  .tp { display: flex; align-items: center; gap: calc(10px * var(--cs)); }
  .ib { display: grid; place-items: center; width: calc(32px * var(--cs)); height: calc(32px * var(--cs)); border-radius: 8px; color: var(--ink); }
  .ib:hover { background: var(--accentSoft); }
  .ib :global(.ic) { width: calc(22px * var(--cs)); height: calc(22px * var(--cs)); }
  .loop { color: var(--muted); }
  .loop.on { color: var(--accent); }
  .play { display: grid; place-items: center; width: calc(34px * var(--cs)); height: calc(34px * var(--cs)); border-radius: 50%; background: var(--accent); color: var(--on); transition: transform .15s; }
  .play:hover { transform: scale(1.06); }
  .play svg { width: calc(18px * var(--cs)); height: calc(18px * var(--cs)); }
  .night .play { border-radius: 0; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); width: calc(40px * var(--cs)); height: calc(40px * var(--cs)); }
  .rec { display: grid; place-items: center; width: calc(30px * var(--cs)); height: calc(30px * var(--cs)); border-radius: 50%; }
  .rec svg { width: calc(18px * var(--cs)); height: calc(18px * var(--cs)); }
  .rec:hover { background: var(--accentSoft); }
  .rec.on { animation: rec 1s ease-in-out infinite; background: var(--accentSoft); }
  @keyframes rec { 50% { opacity: .45; } }

  .where { display: flex; align-items: baseline; gap: calc(12px * var(--cs)); }
  .time { font-size: calc(26px * var(--cs)); color: var(--ink); min-width: calc(128px * var(--cs)); }
  .night .time { font-size: calc(29px * var(--cs)); min-width: calc(112px * var(--cs)); }
  .where .bar { flex: none; font: 500 calc(12px * var(--cs))/1 var(--f-sans); color: var(--muted); white-space: nowrap; min-width: calc(62px * var(--cs)); }

  .val { display: inline-flex; align-items: baseline; gap: 5px; padding: 4px 6px; border-radius: 6px; }
  .val:hover, .val.open, .key:hover, .key.open { background: var(--accentSoft); }
  .val .n { font-size: calc(20px * var(--cs)); color: var(--ink); }
  .night .val .n { font-size: calc(23px * var(--cs)); }
  .val .u { font: 700 calc(11px * var(--cs))/1 var(--f-sans); color: var(--muted); }
  .meter { font-size: calc(18px * var(--cs)); color: var(--ink); }
  .night .meter { font-size: calc(20.5px * var(--cs)); }
  .key { padding: 5px 7px; border-radius: 6px; font: 700 calc(13px * var(--cs))/1 var(--f-sans); color: var(--ink); white-space: nowrap; }
  .night .val, .night .key { border-radius: 0; }
  .gap { flex: 1; }

  .exp { position: relative; overflow: hidden; min-width: calc(100px * var(--cs)); height: calc(32px * var(--cs)); font-size: calc(14px * var(--cs)); letter-spacing: 4px; }
  :global(:root:lang(en)) .exp { letter-spacing: .04em; }
  .exp.busy { letter-spacing: 1px; }
  .exp .prog { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: 0 0; background: rgba(255, 255, 255, .22); transition: transform .2s; }
  .exp .lbl { position: relative; }

  :global(.menu) .st { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  :global(.menu) .t1 { font: 700 13px/1.3 var(--f-sans); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  :global(.menu) .t2 { font: 500 11px/1.3 var(--f-sans); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  :global(.menu .mi.on) .t1 { color: var(--accent); font-weight: 900; }
  :global(.menu .mi.warn) .t1 { color: var(--signal); }
  :global(.menu .mi) :global(.ic) { color: var(--muted); }
  :global(.menu) .note { margin: 8px 10px 4px; font: 500 11px/1.5 var(--f-sans); color: var(--muted); }
  .tempo { display: flex; align-items: center; gap: 8px; padding: 6px 10px 8px; }
  .bpm { width: 90px; height: 34px; text-align: center; font-size: 22px; color: var(--ink); background: var(--surface); border: 1.2px solid var(--hair); border-radius: 8px; outline: none; }
  .bpm:focus { border-color: var(--accent); }
  :global([data-sky="night"]) .bpm { border-radius: 0; background: var(--well); font-size: 24px; }
  .tonics { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; padding: 4px 8px; }
  .nums { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 4px 8px 6px; }
  .nums .tn { font-size: 15px; }
  .mt { padding: 4px 7px; }
  .tn, .md { height: 30px; border-radius: 6px; font: 700 13px/1 var(--f-sans); color: var(--ink2); box-shadow: inset 0 0 0 1px var(--hair); }
  .tn:hover, .md:hover { color: var(--ink); background: var(--accentSoft); }
  .tn.on, .md.on { color: var(--on); background: var(--accent); box-shadow: none; }
  .modes { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 8px 4px; }
  .md { padding: 0 10px; font-size: 12px; }
  :global([data-sky="night"]) .tn, :global([data-sky="night"]) .md { border-radius: 0; }
  .mv { display: flex; align-items: center; gap: 10px; padding: 10px 10px 6px; font: 500 12px/1.3 var(--f-sans); color: var(--ink2); cursor: pointer; }
</style>
