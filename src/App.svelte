<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import Chrome from './components/Chrome.svelte';
  import Generator from './components/Generator.svelte';
  import ImportPanel from './components/ImportPanel.svelte';
  import Wordmark from './components/Wordmark.svelte';
  import Icon from './components/ui/Icon.svelte';
  import { fullscreen } from './lib/state/fullscreen.svelte';
  import Stage from './rooms/stage/Stage.svelte';
  import { studioRoom, preloadStudio } from './rooms/studio/lazy';
  import { studioFrame } from './rooms/studio/frame';
  import { app } from './lib/state/app.svelte';
  import { theme } from './lib/state/theme.svelte';
  import { i18n } from './lib/i18n/index.svelte';

  let vw = $state(typeof innerWidth === 'number' ? innerWidth : 1440);
  let vh = $state(typeof innerHeight === 'number' ? innerHeight : 900);
  const compact = $derived(vh < 560 || vw / vh > 2.05);
  const portrait = $derived(vw < vh && vw < 760);
  const inStudio = $derived(app.room === 'studio');
  const chromeScale = $derived(inStudio ? studioFrame(vw, vh).s : Math.max(.8, Math.min(1.6, Math.min(vh / 900, vw / 1200))));

  /** mouse and touch clicks should not leave focus on buttons (Space would press them again); keyboard focus stays */
  function releaseFocus(e: MouseEvent) {
    if (e.detail === 0) return;
    const a = document.activeElement as (HTMLElement | SVGElement) | null;
    if (a && a !== document.body && (a.tagName === 'BUTTON' || a.getAttribute('role') === 'button')) a.blur();
  }

  onMount(() => {
    theme.apply();
    i18n.apply();
    void app.init().then(preloadStudio);
  });
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} onclick={releaseFocus} />

<!-- the top bar comes first, so Tab reaches the rooms and the actions before the stage (it sits above it, z-index 20) -->
<Chrome {compact} scale={chromeScale} dense={inStudio} />
<main class="room" class:night={theme.night}>
  {#key app.room}
    <div class="scene" in:fade={{ duration: 320, delay: 60 }} out:fade={{ duration: 180 }}>
      {#if app.room === 'stage'}
        <Stage />
      {:else}
        {#await studioRoom() then m}<m.default />{/await}
      {/if}
    </div>
  {/key}
</main>
<Generator />
<ImportPanel />
{#if portrait}
  <div class="rotate" class:night={theme.night} role="alert">
    <div class="wm"><Wordmark size={22} night={theme.night} /></div>
    <!-- the phone turns on its side, rests, and stands up again: the gesture itself, shown. it turns to the left, the way
         phones and their games are usually held sideways (and the way the fullscreen button first turns the screen) -->
    <svg viewBox="0 0 120 120" width="104" height="104" aria-hidden="true">
      <g class="arr">
        <path d="M98 86a44 44 0 0 0-8-52" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" />
        <path d="M98 30l-8 4 2 9" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      </g>
      <g class="phone">
        <rect x="38" y="16" width="44" height="80" rx="9" fill="none" stroke="currentColor" stroke-width="4" />
        <path d="M54 24h12" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity=".5" />
      </g>
    </svg>
    <p class="t">{i18n.t('rotate')}</p>
    <p class="s">{i18n.t('rotateSub')}</p>
    <!-- the browser's bars take a third of a phone held sideways: a tap here fills the screen and turns it (a page may
         only ask from inside a tap). an iPhone has no such thing, and its home-screen app is not suggested: play mode
         runs smoothly in Safari but drops frames there -->
    {#if fullscreen.can && !fullscreen.on}
      <button class="full" onclick={() => void fullscreen.enter()}><Icon name="expand" size={16} sw={1.8} />{i18n.t('rotateFull')}</button>
    {/if}
  </div>
{/if}

<style>
  .room { position: absolute; inset: 0; background: var(--bg); }
  .scene { position: absolute; inset: 0; }
  .rotate {
    position: fixed; inset: 0; z-index: 50; display: grid; place-content: center; justify-items: center; gap: 8px; padding: 24px;
    background: var(--bg); color: var(--ink); text-align: center;
  }
  .rotate .wm { position: absolute; top: max(28px, env(safe-area-inset-top, 0px)); left: 50%; translate: -50% 0; }
  .rotate .phone { transform-origin: 60px 56px; animation: turn 3.2s cubic-bezier(.6, 0, .25, 1) infinite; }
  .rotate .arr { animation: arr 3.2s ease infinite; }
  @keyframes turn { 0%, 22% { transform: none; } 42%, 74% { transform: rotate(-90deg); } 92%, 100% { transform: none; } }
  @keyframes arr { 0%, 20% { opacity: 1; } 32%, 84% { opacity: 0; } 96%, 100% { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .rotate .phone, .rotate .arr { animation: none; } }
  .rotate .t { margin: 12px 0 0; font: 900 24px/1.3 var(--f-title); }
  .rotate .s { margin: 0; font: 500 14px/1.5 var(--f-sans); color: var(--muted); }
  .rotate .full {
    display: inline-flex; align-items: center; gap: 8px; margin-top: 18px; padding: 11px 20px;
    font: 700 15px/1 var(--f-sans); letter-spacing: .04em; color: #FFFFFF; background: var(--accent); border-radius: 999px;
  }
  .rotate.night .full { border-radius: 0; color: var(--ink); background: none; border: 1px solid var(--orn); box-shadow: inset 0 0 0 3px var(--bg), inset 0 0 0 4px rgba(216, 180, 106, .3); }
</style>
