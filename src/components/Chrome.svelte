<script lang="ts">
  import Wordmark from './Wordmark.svelte';
  import { app, type Room } from '../lib/state/app.svelte';
  import { theme } from '../lib/state/theme.svelte';
  import { i18n } from '../lib/i18n/index.svelte';
  import { studioBar } from '../rooms/studio/lazy';
  import { fullscreen } from '../lib/state/fullscreen.svelte';
  import { gen } from '../lib/gen/panel.svelte';
  import Menu from './ui/Menu.svelte';
  import Changelog from './Changelog.svelte';
  import Icon from './ui/Icon.svelte';
  import { makeBackup, readBackup, restoreBackup, resetAll } from '../lib/state/backup';
  import { deliver } from '../lib/project/export';
  import { pickFile, MIDI_ACCEPT } from '../lib/util';

  /* the top bar. the two rooms are a sliding switch: the thumb slides under the room you are in (a blue tab on the
     white sticker by day, a crimson pane in the gold plaque by night) */
  let { compact = false, scale = 1, dense = false }: { compact?: boolean; scale?: number; dense?: boolean } = $props();
  const ROOMS: Room[] = ['stage', 'studio'];
  let file: HTMLInputElement;
  let failed = $state(false);

  /* the viewer's data: a backup, a restore, a fresh start */
  let moreOpen = $state(false), doomed = $state(false), logOpen = $state(false);
  async function backUp() {
    const bytes = await makeBackup(), d = new Date(), pad = (n: number) => String(n).padStart(2, '0');
    await deliver(`ourtone-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`, bytes, 'application/json');
  }
  async function restore() {
    const f = await pickFile('.json,.zip,application/json,application/zip');
    if (!f) return;
    const b = await readBackup(f);
    if (!b) { failed = true; setTimeout(() => (failed = false), 3200); return; }
    await restoreBackup(b);
    location.reload();
  }
  async function pick(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!f) return;
    failed = false;
    const ok = await app.importFile(f);
    if (!ok) { failed = true; setTimeout(() => (failed = false), 3200); }
    else app.go('stage');
  }
</script>

<header class="chrome" class:compact class:dense class:night={theme.night} style="--cs:{compact ? 1 : scale}">
  <a class="brand" href="#stage" onclick={(e) => { e.preventDefault(); app.go('stage'); }} aria-label="Ourtone">
    <Wordmark size={compact ? 17 : 22 * scale} night={theme.night} />
  </a>
  <nav class="nav" aria-label="Ourtone" style="--at:{Math.max(0, ROOMS.indexOf(app.room))}">
    <span class="thumb" aria-hidden="true"></span>
    {#each ROOMS as r, i}
      <button class="item" class:on={app.room === r} aria-current={app.room === r ? 'page' : undefined} onclick={() => app.go(r)}>
        <span class="lbl" class:en={i18n.lang === 'en'}>{i18n.list('rooms')[i]}</span>
      </button>
    {/each}
  </nav>
  {#if dense}{#await studioBar() then m}<m.default {compact} />{/await}{/if}
  <div class="tools">
    <button class="btn imp" onclick={() => file.click()} disabled={app.importing} title={i18n.t('importHint')}>
      <svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13.2V3.4M6.2 7.1 10 3.3l3.8 3.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /><path d="M3.6 12.4v2.8a1.6 1.6 0 0 0 1.6 1.6h9.6a1.6 1.6 0 0 0 1.6-1.6v-2.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      <span class="lbl">{app.importing ? i18n.t('importing') : failed ? i18n.t('importFailed') : i18n.t('importMidi')}</span>
    </button>
    <input bind:this={file} type="file" accept={MIDI_ACCEPT} hidden onchange={pick} />
    {#if !dense}
      <button class="btn mk" onclick={() => gen.show()} title={i18n.t('genButtonHint')}>
        <svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.4l1.6 5.6 5.6 1.6-5.6 1.6L10 16.8l-1.6-5.6-5.6-1.6 5.6-1.6Z" fill="currentColor" /><path d="M16.2 2.2v2.8M14.8 3.6h2.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
        <span class="lbl">{i18n.t('genButton')}</span>
      </button>
    {/if}
    <Menu bind:open={moreOpen} width={330} align="right" label={i18n.t('moreMenu')}>
      {#snippet trigger({ toggle })}
        <button class="btn more" onclick={() => { doomed = false; toggle(); }} title={i18n.t('moreMenuHint')} aria-label={i18n.t('moreMenuHint')} aria-haspopup="menu">
          <svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="4.5" cy="10" r="1.7" fill="currentColor" /><circle cx="10" cy="10" r="1.7" fill="currentColor" /><circle cx="15.5" cy="10" r="1.7" fill="currentColor" /></svg>
        </button>
      {/snippet}
      {#snippet children({ close })}
        <!-- the other language, named in itself, so a visitor who cannot read this one still finds it -->
        <button class="mi" role="menuitem" lang={i18n.lang === 'zh' ? 'en' : 'zh'} onclick={() => { close(); i18n.set(i18n.lang === 'zh' ? 'en' : 'zh'); }}><Icon name="globe" size={17} sw={1.8} /><span class="st"><span class="t1">{i18n.t('toOtherLang')}</span><span class="t2">{i18n.t('toOtherLangHint')}</span></span></button>
        {#if fullscreen.can && !fullscreen.on}
          <button class="mi" role="menuitem" onclick={() => { close(); void fullscreen.enter(); }}><Icon name="expand" size={17} sw={1.8} /><span class="st"><span class="t1">{i18n.t('fullscreen')}</span><span class="t2">{i18n.t('fullscreenSub')}</span></span></button>
        {/if}
        <div class="sep"></div>
        <div class="mh">{i18n.t('myData')}</div>
        <button class="mi" role="menuitem" onclick={async () => { close(); await backUp(); }}><Icon name="export" size={17} sw={1.8} /><span class="st"><span class="t1">{i18n.t('backupData')}</span><span class="t2">{i18n.t('backupSub')}</span></span></button>
        <button class="mi" role="menuitem" onclick={async () => { close(); await restore(); }}><Icon name="upload" size={17} sw={1.8} /><span class="st"><span class="t1">{i18n.t('restoreData')}</span><span class="t2">{i18n.t('restoreSub')}</span></span></button>
        <div class="sep"></div>
        <button class="mi warn" class:armed={doomed} role="menuitem" onclick={async () => { if (!doomed) { doomed = true; return; } close(); await resetAll(); location.reload(); }}>
          <Icon name="undo" size={17} sw={1.8} /><span class="st"><span class="t1">{doomed ? i18n.t('resetConfirm') : i18n.t('resetAll')}</span><span class="t2">{i18n.t('resetSub')}</span></span>
        </button>
        <div class="sep"></div>
        <div class="mh">{i18n.t('about')}</div>
        <button class="mi" role="menuitem" onclick={() => { close(); logOpen = true; }}><Icon name="note" size={17} sw={1.8} /><span class="st"><span class="t1">{i18n.t('changelog')}</span><span class="t2">{i18n.t('changelogSub')}</span></span></button>
        <p class="about">
          <span>{i18n.t('creditMidi')} <a class="lk" href="https://www.midishow.com" target="_blank" rel="noopener noreferrer">midishow.com</a></span>
          <a class="lk" href="https://space.bilibili.com/3546706954160228" target="_blank" rel="noopener noreferrer">{i18n.t('homepage')} · Bilibili ↗</a>
          <a class="lk" href="https://github.com/mygo-nucis/ourtone" target="_blank" rel="noopener noreferrer">{i18n.t('sourceCode')} · GitHub ↗</a>
        </p>
      {/snippet}
    </Menu>
    <button class="btn sky" onclick={() => theme.toggle()} title={theme.night ? i18n.t('toDayHint') : i18n.t('toNightHint')}>
      {#if theme.night}
        <svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="currentColor" /><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 1.8v2.2M10 16v2.2M1.8 10H4M16 10h2.2M4.2 4.2l1.6 1.6M14.2 14.2l1.6 1.6M4.2 15.8l1.6-1.6M14.2 5.8l1.6-1.6" /></g></svg>
      {:else}
        <svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M13.6 2.8a7.6 7.6 0 1 0 3.6 11.6 6.2 6.2 0 0 1-3.6-11.6Z" fill="currentColor" /><path d="M16.2 3.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5Z" fill="currentColor" /></svg>
      {/if}
      <span class="lbl">{theme.night ? i18n.t('toDay') : i18n.t('toNight')}</span>
    </button>
  </div>
</header>
<Changelog bind:open={logOpen} />

<style>
  /* picking parts for multi-track play dims the whole page but the windows: the bar too, and a click on it only ends
     the picking (it falls through to the stage's dimming) */
  :global(html.ut-picking) .chrome { opacity: .28; pointer-events: none; }
  .chrome {
    transition: opacity .3s;
    position: absolute; z-index: 20; left: 0; right: 0; top: 0;
    display: flex; align-items: flex-start; gap: calc(44px * var(--cs));
    padding: calc(40px * var(--cs) + env(safe-area-inset-top, 0px)) calc(36px * var(--cs)) 0 calc(56px * var(--cs));
    pointer-events: none;
  }
  /* the studio bar is another component: :global, so it gets pointer events too */
  .chrome > :global(*) { pointer-events: auto; }
  .brand { display: block; padding: 6px 4px; margin: -6px -4px; border-radius: 6px; }
  .brand:focus-visible { outline: none; box-shadow: var(--focus); }

  /* the rooms: a switch of two equal halves; the thumb slides to the one you are in */
  .nav {
    position: relative; display: grid; grid-template-columns: 1fr 1fr; align-items: stretch; flex: none;
    height: calc(36px * var(--cs)); padding: calc(3px * var(--cs)); margin-top: calc(-3px * var(--cs));
    background: #FFFFFF; border: 2px solid #1C2030; border-radius: calc(12px * var(--cs));
    box-shadow: 2px 3px 0 rgba(28, 32, 48, .16);
  }
  .thumb {
    position: absolute; top: calc(3px * var(--cs)); bottom: calc(3px * var(--cs)); left: calc(3px * var(--cs)); width: calc(50% - 3px * var(--cs));
    border-radius: calc(8px * var(--cs)); background: #2F86E8; box-shadow: inset 0 -2px 0 rgba(28, 32, 48, .18), inset 0 1px 0 rgba(255, 255, 255, .35);
    transform: translateX(calc(var(--at) * 100%)); transition: transform .45s cubic-bezier(.45, 1.35, .5, 1);
  }
  .item {
    position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; padding: 0 calc(18px * var(--cs));
    border-radius: calc(8px * var(--cs)); color: var(--muted); transition: color .3s;
  }
  .item .lbl { font: 700 calc(14px * var(--cs))/1 var(--f-sans); letter-spacing: .14em; margin-right: -.14em; white-space: nowrap; }
  .item .lbl.en { font: italic 800 calc(14.5px * var(--cs))/1 var(--f-disp); font-stretch: 108%; letter-spacing: .02em; margin-right: 0; }
  .item:hover { color: var(--ink); }
  .item.on { color: #FFFFFF; }
  .item.on .lbl { font-weight: 900; }
  .item:focus-visible { outline: none; box-shadow: 0 0 0 3px #95CEF3; }
  /* night: a chamfered plaque, gold-edged like the buttons; the thumb a crimson pane with its own gold edge */
  .night .nav { border: 0; border-radius: 0; box-shadow: none; background: rgba(216, 180, 106, .5); isolation: isolate; clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px); }
  .night .nav::before { content: ''; position: absolute; inset: 1px; z-index: -1; background: #0E0C11; clip-path: polygon(7.6px 0, calc(100% - 7.6px) 0, 100% 7.6px, 100% calc(100% - 7.6px), calc(100% - 7.6px) 100%, 7.6px 100%, 0 calc(100% - 7.6px), 0 7.6px); }
  .night .thumb {
    border-radius: 0; box-shadow: none; background: #D8B46A;
    clip-path: polygon(6px 0, calc(100% - 6px) 0, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0 calc(100% - 6px), 0 6px);
    transition: transform .55s cubic-bezier(.65, 0, .35, 1);
  }
  .night .thumb::before { content: ''; position: absolute; inset: 1px; background: linear-gradient(#6E1422, #3A0F18); clip-path: polygon(5.6px 0, calc(100% - 5.6px) 0, 100% 5.6px, 100% calc(100% - 5.6px), calc(100% - 5.6px) 100%, 5.6px 100%, 0 calc(100% - 5.6px), 0 5.6px); }
  .night .item { border-radius: 0; color: var(--muted); }
  .night .item:hover { color: var(--ink); }
  .night .item.on { color: #FFF3EE; }
  .night .item .lbl { font: 700 calc(14.5px * var(--cs))/1 var(--f-serif); letter-spacing: .16em; margin-right: -.16em; }
  .night .item .lbl.en { font: 600 calc(17.5px * var(--cs))/1 var(--f-gar); letter-spacing: .03em; margin-right: 0; }
  .night .item.on .lbl { font-weight: 900; }
  .night .item.on .lbl.en { font-weight: 700; }
  .night .item:focus-visible { box-shadow: inset 0 0 0 1px #D8B46A; }
  /* in the studio by night the switch steps back from the work: a fainter edge, a deeper pane, softer type */
  .dense.night .nav { background: rgba(216, 180, 106, .26); }
  .dense.night .thumb { background: rgba(216, 180, 106, .5); }
  .dense.night .thumb::before { background: linear-gradient(#4A111B, #2A0C13); }
  .dense.night .item.on { color: #E4D3CC; }
  @media (prefers-reduced-motion: reduce) { .thumb, .night .thumb { transition: none; } }

  /* buttons */
  .tools { margin-left: auto; display: flex; align-items: center; gap: calc(12px * var(--cs)); margin-top: calc(-2px * var(--cs)); }
  .btn {
    position: relative; display: inline-flex; align-items: center; gap: 7px; height: calc(34px * var(--cs)); padding: 0 calc(14px * var(--cs));
    font: 800 calc(13px * var(--cs))/1 var(--f-sans); letter-spacing: .08em; color: #1C2030;
    background: #FFFFFF; border: 2px solid #1C2030; border-radius: 10px;
    box-shadow: 2px 3px 0 rgba(28, 32, 48, .16);
    transition: transform .16s cubic-bezier(.3, 1.6, .5, 1), box-shadow .16s;
  }
  .btn .ic { width: calc(17px * var(--cs)); height: calc(17px * var(--cs)); color: #2F86E8; flex: none; }
  .btn:hover { transform: translateY(-2px) rotate(-1.2deg); box-shadow: 3px 5px 0 rgba(28, 32, 48, .18); }
  .btn:active { transform: translateY(1px); box-shadow: 1px 1px 0 rgba(28, 32, 48, .16); }
  .btn:disabled { opacity: .7; }
  .btn.mk { background: #2F86E8; color: #FFFFFF; }
  .btn.mk .ic { color: #FBE38A; }
  .btn.sky { background: #1C2030; color: #FFFFFF; }
  .btn.more { padding: 0 calc(9px * var(--cs)); }
  /* the data menu lives in the top layer, outside the bar: its items carry this component's scope, the menu does not */
  :global(.menu) .st { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  :global(.menu) .t1 { font: 700 13px/1.3 var(--f-sans); color: var(--ink); }
  :global(.menu) .t2 { font: 500 11px/1.4 var(--f-sans); color: var(--muted); }
  :global(.menu) .mi.warn .t1 { color: var(--signal); }
  :global(.menu) .mi.warn.armed { background: var(--signal); }
  :global(.menu) .mi.warn.armed .t1, :global(.menu) .mi.warn.armed .t2 { color: #FFFFFF; }
  /* the credits close the menu: quiet text, the links in the theme's accent (blue by day, gold by night) */
  :global(.menu) .about { display: flex; flex-direction: column; gap: 4px; margin: 0 10px 6px; font: 500 12px/1.6 var(--f-sans); color: var(--ink2); }
  :global(.menu) .lk { width: fit-content; color: var(--orn); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; border-radius: 2px; }
  :global(.menu) .lk:hover { text-decoration-thickness: 2px; }
  :global(.menu) .lk:focus-visible { outline: 2px solid var(--orn); outline-offset: 2px; }
  .btn.sky .ic { color: #FBE38A; }
  .btn:focus-visible { outline: none; box-shadow: 2px 3px 0 rgba(28, 32, 48, .16), 0 0 0 3px #95CEF3; }

  /* night: chamfered plaques with a gold edge (a gold layer, the dark fill clipped 1px inside it) */
  .night .btn {
    isolation: isolate; border: 0; border-radius: 0; box-shadow: none; color: #EDE6E1; background: rgba(216, 180, 106, .5);
    font: 700 calc(13.5px * var(--cs))/1 var(--f-serif); letter-spacing: .12em;
    clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px);
    transition: background .25s, color .25s;
  }
  .night .btn::before {
    content: ''; position: absolute; inset: 1px; z-index: -1; background: #0E0C11;
    clip-path: polygon(7.6px 0, calc(100% - 7.6px) 0, 100% 7.6px, 100% calc(100% - 7.6px), calc(100% - 7.6px) 100%, 7.6px 100%, 0 calc(100% - 7.6px), 0 7.6px);
    transition: background .25s;
  }
  .night .btn .ic { color: #D8B46A; }
  .night .btn:hover { transform: none; background: #D8B46A; color: #FFF3EE; }
  .night .btn:hover::before { background: #1A1016; }
  .night .btn.sky::before { background: #2A0F16; }
  .night .btn.mk::before { background: #3A0F18; }
  .night .btn:focus-visible { background: #D8B46A; }

  .compact { gap: 20px; padding: calc(10px + env(safe-area-inset-top, 0px)) calc(14px + env(safe-area-inset-right, 0px)) 0 calc(22px + env(safe-area-inset-left, 0px)); }
  .compact .nav { height: 30px; margin-top: 0; }
  .compact .item { padding: 0 12px; }
  .compact .item .lbl { font-size: 12.5px; letter-spacing: .08em; margin-right: -.08em; }
  .compact .item .lbl.en { font-size: 12.5px; margin-right: 0; }
  .compact.night .item .lbl.en { font-size: 15px; }
  .compact .btn { height: 30px; padding: 0 9px; gap: 5px; }
  .compact .btn .lbl { display: none; }
  .compact .btn .ic { width: 15px; height: 15px; }
  @media (max-width: 1100px) { .chrome:not(.compact) .btn.imp .lbl { display: none; } }

  /* in the studio the bar is a working toolbar: one 64-unit row, the transport in the middle */
  .dense { align-items: center; gap: calc(30px * var(--cs)); height: calc(64px * var(--cs) + env(safe-area-inset-top, 0px)); padding: env(safe-area-inset-top, 0px) calc(16px * var(--cs)) 0 calc(40px * var(--cs)); }
  .dense .nav { height: calc(34px * var(--cs)); margin-top: 0; }
  .dense .tools { margin-left: 0; margin-top: 0; gap: calc(8px * var(--cs)); }
  .dense .btn.imp { display: none; }
  .dense .btn { height: calc(32px * var(--cs)); padding: 0 calc(9px * var(--cs)); }
  .dense .btn.sky .lbl { display: none; }
  .compact.dense { align-items: center; height: calc(50px + env(safe-area-inset-top, 0px)); padding-top: env(safe-area-inset-top, 0px); gap: 14px; }
  .compact.dense .nav { height: 30px; }
  .compact.dense .tools { gap: 8px; }
</style>
