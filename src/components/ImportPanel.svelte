<script lang="ts">
  import { fade } from 'svelte/transition';
  import { app } from '../lib/state/app.svelte';
  import { theme } from '../lib/state/theme.svelte';
  import { i18n } from '../lib/i18n/index.svelte';

  /* a MIDI file on its way in: the page dims and a card says what is happening, with a bar that fills as each part
     is listened to and levelled. it takes a few seconds, and without it the site looked frozen */
  const job = $derived(app.importJob);
  const share = $derived(!job ? 0 : !job.parts ? .06 : .1 + .9 * job.done / job.parts);
  const step = $derived(!job || !job.parts ? i18n.t('importRead') : i18n.t('importMix', { k: Math.min(job.parts, job.done + 1), n: job.parts }));
</script>

{#if job}
  <div class="scrim" class:night={theme.night} transition:fade={{ duration: 160 }} role="alertdialog" aria-live="polite" aria-label={i18n.t('importTitle')} aria-busy="true">
    <div class="card">
      <div class="head">
        <span class="spin" aria-hidden="true"><i></i><i></i><i></i></span>
        <h2>{i18n.t('importTitle')}</h2>
      </div>
      <p class="file">{job.name}</p>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(share * 100)}><span style="width:{(share * 100).toFixed(1)}%"></span></div>
      <p class="step">{step}</p>
      <p class="wait">{i18n.t('importWait')}</p>
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgba(246, 248, 251, .72); backdrop-filter: blur(3px); }
  .card {
    width: min(440px, 100%); padding: 26px 28px 22px; background: #FFFFFF; border: 2px solid var(--ink); border-radius: 16px;
    box-shadow: 0 0 0 7px #FFFFFF, 6px 12px 0 7px rgba(28, 32, 48, .14); transform: rotate(-.8deg);
  }
  .head { display: flex; align-items: center; gap: 14px; }
  h2 { margin: 0; font: 900 24px/1.2 var(--f-serif); letter-spacing: .06em; color: var(--ink); }
  /* three note heads bobbing in turn */
  .spin { display: inline-flex; align-items: flex-end; gap: 4px; height: 22px; }
  .spin i { width: 10px; height: 8px; border-radius: 50%; background: var(--accent); transform: rotate(-20deg); animation: bob .9s ease-in-out infinite; }
  .spin i:nth-child(2) { animation-delay: .15s; }
  .spin i:nth-child(3) { animation-delay: .3s; }
  @keyframes bob { 0%, 100% { translate: 0 0; } 40% { translate: 0 -10px; } }
  .file { margin: 12px 0 14px; font: 700 13px/1.4 var(--f-sans); color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar { height: 10px; border-radius: 5px; background: var(--accentSoft); box-shadow: inset 0 0 0 1.5px var(--ink); overflow: hidden; }
  .bar span {
    display: block; height: 100%; border-radius: 5px; transition: width .35s ease;
    background: repeating-linear-gradient(-45deg, var(--accent) 0 8px, #5AA3F0 8px 16px); background-size: 22.6px 22.6px; animation: slide .8s linear infinite;
  }
  @keyframes slide { to { background-position: 22.6px 0; } }
  .step { margin: 12px 0 0; font: 700 13px/1.5 var(--f-sans); color: var(--accent); }
  .wait { margin: 4px 0 0; font: 500 12px/1.5 var(--f-sans); color: var(--muted); }

  .night { background: rgba(11, 10, 14, .7); }
  .night .card {
    border: 1px solid rgba(216, 180, 106, .6); border-radius: 0; transform: none; background: #16141B;
    box-shadow: inset 0 0 0 5px #16141B, inset 0 0 0 6px rgba(216, 180, 106, .16), 0 24px 50px -12px rgba(0, 0, 0, .8);
  }
  .night h2 { font: 800 23px/1.2 var(--f-title); color: var(--ink); }
  .night .spin i { border-radius: 0; width: 8px; height: 12px; transform: none; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); background: var(--accent); }
  .night .file { font: italic 600 16px/1.4 var(--f-gar); color: var(--orn); }
  .night .bar { border-radius: 0; background: #0B0A0E; box-shadow: inset 0 0 0 1px rgba(216, 180, 106, .45); }
  .night .bar span { border-radius: 0; background: repeating-linear-gradient(-45deg, #C4293E 0 8px, #8E1728 8px 16px); background-size: 22.6px 22.6px; }
  .night .step { color: var(--orn); }
  @media (prefers-reduced-motion: reduce) { .spin i, .bar span { animation: none; } }
</style>
