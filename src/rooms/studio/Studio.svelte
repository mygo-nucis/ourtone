<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import Seg from '../../components/ui/Seg.svelte';
  import Arrange from './Arrange.svelte';
  import ArrangeTools from './ArrangeTools.svelte';
  import TrackView from './TrackView.svelte';
  import TrackTools from './TrackTools.svelte';
  import SoundView from './sound/SoundView.svelte';
  import SoundTools from './sound/SoundTools.svelte';
  import { studio, type View } from '../../lib/project/studio.svelte';
  import { transport } from '../../lib/audio/transport.svelte';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import type { StringKey } from '../../lib/i18n/strings';
  import { studioFrame, TOP, ROW2, STATUS, MOD } from './frame';
  import { playkeys, keyRange, PIANO } from './playkeys.svelte';
  import { pedal } from './pedal.svelte';
  import PedalMenu from './PedalMenu.svelte';
  import { playPause, toStart, toEnd, toggleRecord } from './actions';

  /* 录音室: three views of the current song. the top bar lives in the global chrome (dense in here);
     below it the view switch and the view's tools, the view itself, and a status line with hints and the save state */
  let vw = $state(1440), vh = $state(900);
  const F = $derived(studioFrame(vw, vh));
  /* on a phone the top bar is the compact chrome (50 px), the tool row is shorter and the status line goes */
  const top = $derived(F.compact ? Math.ceil(50 / F.s) : TOP);
  const row2 = $derived(F.compact ? 36 : ROW2);
  const status = $derived(F.compact ? 0 : STATUS);
  const bodyH = $derived(F.H - top - row2 - status);
  $effect(() => { void transport.gen; void transport.song; studio.attach(); });
  /* the focused part's sound is rendered over the keyboards' range ahead of time, half a second after it settles (a sound
     being edited is not rendered at every step), so a key's first press sounds at once. ~0.1-0.3 s of a background
     worker's time and 9-17 MB a sound; a phone, which has no computer keys, does it only in the Sound view, where its
     on-screen keys are */
  const fine = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;
  $effect(() => {
    const i = studio.part, d = transport.song?.parts[i]?.data, oct = playkeys.octave;
    if (!d || (!fine && studio.view !== 'sound')) return;
    void d.preset; void d.patch;
    const { lo, hi } = keyRange(oct), id = setTimeout(() => { void transport.prepareNotes(i, Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)); }, 500);
    return () => clearTimeout(id);
  });
  onDestroy(() => { playkeys.releaseAll(); pedal.lift(); if (studio.recording) studio.stopRecording(); void studio.flush(); });

  const VIEWS: View[] = ['arrange', 'track', 'sound'];
  const views = $derived(i18n.list('views').map((label, k) => ({ id: VIEWS[k], label })));
  const HINT: Record<View, StringKey> = { arrange: 'hintArrange', track: 'hintTrackKeys', sound: 'hintSound' };
  /* what the wheel does with a key held, kept in view while the longer hint gives way */
  const WHEEL: Partial<Record<View, StringKey>> = { arrange: 'hintWheelArrange', track: 'hintWheelTrack' };
  const loopBars = $derived.by(() => {
    const sg = transport.song, lp = transport.loop, g = studio.grid;
    void studio.rev;
    if (!sg || !lp || !transport.loopOn || !g) return null;
    return { a: g.barAt(sg.tl.tick(lp.a) + 1) + 1, b: g.barAt(sg.tl.tick(lp.b) - 1) + 1 };
  });
  const SAVE: Record<string, StringKey> = { clean: 'saveClean', dirty: 'saveDirty', saving: 'saveSaving', saved: 'saveSaved', failed: 'saveFailed' };

  function inField(e: KeyboardEvent) { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
  /* single keys play notes (see playkeys); editing lives on Ctrl / ⌘ combinations; a few keys that are not notes move around */
  function onkeydown(e: KeyboardEvent) {
    if (inField(e)) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && (k === 'z' || k === 'y')) { e.preventDefault(); if (k === 'y' || e.shiftKey) studio.redo(); else studio.undo(); return; }
    if (mod && k === 's') { e.preventDefault(); void studio.flush(); return; }
    if (mod || e.altKey) return;
    const onButton = (e.target as HTMLElement)?.tagName === 'BUTTON' || (e.target as HTMLElement)?.getAttribute?.('role') === 'slider';
    // Manual pedal: Space is the pedal, wherever focus is (Shift+Space still records)
    if (e.key === ' ' && !e.shiftKey && pedal.mode === 'manual') { e.preventDefault(); if (!e.repeat) pedal.press(); return; }
    if (e.key === ' ' && !onButton) { e.preventDefault(); if (!e.repeat) { if (e.shiftKey) void toggleRecord(); else void playPause(); } return; }
    if (e.key === 'Tab' && !e.shiftKey && (document.activeElement === document.body || !document.activeElement)) {
      e.preventDefault(); studio.view = VIEWS[(VIEWS.indexOf(studio.view) + 1) % 3]; return;
    }
    if (e.key === 'Home') { e.preventDefault(); toStart(); return; }
    if (e.key === 'End') { e.preventDefault(); toEnd(); return; }
    if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); playkeys.shift(e.key === 'PageUp' ? 1 : -1); return; }
    if (onButton && e.key === 'Enter') return;
    if (PIANO[e.code] !== undefined && !e.shiftKey) { e.preventDefault(); if (!e.repeat) void playkeys.press(e.code); }
  }
  function onkeyup(e: KeyboardEvent) {
    if (e.code === 'Space' && pedal.held) { pedal.lift(); return; }
    if (PIANO[e.code] !== undefined) playkeys.release(e.code);
  }
</script>

<svelte:window {onkeydown} {onkeyup} onblur={() => { playkeys.releaseAll(); pedal.lift(); }} />

<div class="host" bind:clientWidth={vw} bind:clientHeight={vh}>
  <div class="studio" class:night={theme.night} style="width:{F.W}px;height:{F.H}px;transform:scale({F.s})">
    <div class="top" style="height:{top}px"></div>
    <div class="row2" class:compact={F.compact} style="height:{row2}px">
      <Seg items={views} value={studio.view} onchange={(v) => (studio.view = v)} label={i18n.t('viewsLabel')} h={F.compact ? 26 : 28} fs={F.compact ? 13 : 14} pad={F.compact ? 11 : 16} />
      {#if studio.view === 'arrange'}<ArrangeTools compact={F.compact} />{:else if studio.view === 'track'}<TrackTools compact={F.compact} />{:else}<SoundTools compact={F.compact} />{/if}
      {#if playkeys.octave !== 0}<span class="oct ut-num">{i18n.t('octave', { n: (playkeys.octave > 0 ? '+' : '') + playkeys.octave })}</span>{/if}
      <PedalMenu compact={F.compact} />
    </div>
    <main class="body" style="height:{bodyH}px">
      {#key studio.view}
        <div class="pane" in:fade={{ duration: 180 }}>
          {#if studio.view === 'arrange'}
            <Arrange W={F.W} h={bodyH} s={F.s} compact={F.compact} />
          {:else if studio.view === 'track'}
            <TrackView W={F.W} h={bodyH} s={F.s} compact={F.compact} />
          {:else}
            <SoundView W={F.W} h={bodyH} s={F.s} compact={F.compact} />
          {/if}
        </div>
      {/key}
    </main>
    <footer class="status" style="height:{status}px" hidden={F.compact}>
      {#if studio.recording}
        {@const pname = transport.song?.parts[studio.part] ? i18n.pick(transport.song.parts[studio.part].data.name) : ''}
        <span class="hint rec">{studio.liveTake || transport.song?.parts[studio.part]?.audio ? i18n.t('recAudioStatus', { p: pname }) : i18n.t('recStatus', { p: pname })}</span>
      {:else if studio.notice === 'micDenied' || studio.notice === 'micMissing' || studio.notice === 'audioBad'}
        <span class="hint warn">{i18n.t(studio.notice)}</span>
      {:else}
        <span class="hints">
          <span class="hint">{i18n.t(HINT[studio.view], { mod: MOD })}</span>
          {#if WHEEL[studio.view]}<span class="hint wheel">{i18n.t(WHEEL[studio.view]!, { mod: MOD })}</span>{/if}
        </span>
      {/if}
      {#if loopBars}<span class="loopst">{i18n.t('loopStatus', loopBars)}</span>{/if}
      {#if studio.notice === 'forked'}
        <span class="save ok">{i18n.t('forkedNotice', { t: transport.song ? i18n.pick(transport.song.data.title) : '' })}</span>
      {:else}
        <span class="save" class:ok={studio.saving === 'saved'} class:bad={studio.saving === 'failed'} class:quiet={studio.saving === 'clean'}>{i18n.t(SAVE[studio.saving])}</span>
      {/if}
    </footer>
  </div>
</div>

<style>
  .host { position: absolute; inset: 0; overflow: hidden; background: var(--bg); }
  .studio { position: absolute; left: 0; top: 0; transform-origin: 0 0; display: flex; flex-direction: column; background: var(--base); color: var(--ink); }
  .top { flex: none; background: var(--bg); border-bottom: 1px solid var(--hair); }
  .row2.compact { gap: 10px; padding: 0 10px; }
  .row2 { flex: none; display: flex; align-items: center; gap: 22px; padding: 0 16px; background: var(--p2); border-bottom: 1px solid var(--hair); position: relative; z-index: 3; }
  .oct { font-size: 14px; color: var(--accent); }
  .body { position: relative; flex: none; overflow: hidden; }
  .pane { position: absolute; inset: 0; }
  .status { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 0 20px; background: var(--p2); border-top: 1px solid var(--hair); }
  .hint { font: 500 12px/1 var(--f-sans); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hints { display: flex; gap: 18px; min-width: 0; }
  .hint.wheel { flex: none; }
  .hint.rec { font-weight: 700; color: var(--signal); }
  .hint.warn { font-weight: 700; color: var(--signal); white-space: normal; line-height: 1.35; }
  .loopst { flex: none; margin-left: auto; margin-right: -8px; font: 700 12px/1 var(--f-sans); color: #B87A12; white-space: nowrap; }
  .night .loopst { color: #D8B46A; }
  .save { font: 700 12px/1 var(--f-sans); color: var(--muted); white-space: nowrap; }
  .save.ok { color: var(--accent); }
  .save.bad { color: var(--signal); }
  .save.quiet { font-weight: 500; }
</style>
