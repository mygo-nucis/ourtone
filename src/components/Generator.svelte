<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import Icon from './ui/Icon.svelte';
  import Seg from './ui/Seg.svelte';
  import { gen } from '../lib/gen/panel.svelte';
  import { STYLES, STYLE_ORDER, type StyleId } from '../lib/gen/styles';
  import { grooveRow, seedCode, parseSeed, newSeed } from '../lib/gen/generate';
  import { keyName } from '../lib/music/theory';
  import { app } from '../lib/state/app.svelte';
  import { theme } from '../lib/state/theme.svelte';
  import { i18n } from '../lib/i18n/index.svelte';

  /* 生成一首: pick a style (the day show's three, the night show's two), a length, a key and tempo or leave them to
     the style, and a seed. the song goes into the library and plays; "another one" re-rolls it in place. */
  const zh = $derived(i18n.lang === 'zh');
  const groups = $derived([
    { k: 'day', label: i18n.t('genDay'), list: STYLE_ORDER.filter(id => !STYLES[id].night) },
    { k: 'night', label: i18n.t('genNight'), list: STYLE_ORDER.filter(id => STYLES[id].night) }
  ]);
  const st = $derived(STYLES[gen.style]);
  const keys = $derived(Array.from({ length: 12 }, (_, t) => ({ t, name: keyName(t, st.mode, i18n.lang) })));
  let code = $state('');
  $effect(() => { code = seedCode(gen.seed); });
  function setCode(v: string) { const s = parseSeed(v); if (s !== null) gen.seed = s; else code = seedCode(gen.seed); }
  function pickStyle(id: StyleId) { gen.style = id; if (gen.bpm !== null) gen.bpm = Math.max(STYLES[id].bpm[0], Math.min(STYLES[id].bpm[1], gen.bpm)); }
  function onkeydown(e: KeyboardEvent) { if (gen.open && e.key === 'Escape') { e.stopPropagation(); gen.close(); } }
</script>

<svelte:window {onkeydown} />

{#if gen.open}
  <button class="scrim" class:night={theme.night} aria-label={i18n.t('genClose')} onclick={() => gen.close()} transition:fade={{ duration: 160 }}></button>
  <div class="gen" class:night={theme.night} role="dialog" aria-modal="true" aria-labelledby="gen-h" transition:scale={{ start: .97, duration: 220, easing: cubicOut }}>
    <header>
      <div class="hd">
        <h2 id="gen-h">{i18n.t('genTitle')}<span class="tag">{i18n.t('genWipTag')}</span></h2>
        <p class="lead">{i18n.t('genLead')}</p>
        <p class="wip">{i18n.t('genWip')}</p>
      </div>
      <button class="ut-btn icon x" onclick={() => gen.close()} aria-label={i18n.t('genClose')} title={i18n.t('genClose')}><Icon name="close" size={16} sw={2} /></button>
    </header>

    <div class="groups">
      {#each groups as g (g.k)}
        <section class="group" class:nightgroup={g.k === 'night'} style="--n:{g.list.length}">
          <span class="ut-kicker">{g.label}</span>
          <div class="cards">
            {#each g.list as id (id)}
              {@const s = STYLES[id]}
              <button class="card ut-box" class:on={gen.style === id} aria-pressed={gen.style === id} onclick={() => pickStyle(id)}>
                <span class="nm">{i18n.pick(s.name)}</span>
                {#if zh}<span class="en">{s.name.en}</span>{/if}
                <span class="beat" title={i18n.t('genGroove')} aria-hidden="true">
                  {#each grooveRow(id) as b, k}<i class:k={b === 'k'} class:s={b === 's'} class:q={k % 4 === 0}></i>{/each}
                </span>
                <span class="bl">{i18n.pick(s.blurb)}</span>
                <span class="bpm ut-num">{s.bpm[0]}–{s.bpm[1]} BPM</span>
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>

    <div class="opts">
      <div class="row">
        <span class="lab">{i18n.t('genLength')}</span>
        <Seg items={[{ id: 'short', label: i18n.t('genShort') }, { id: 'full', label: i18n.t('genFull') }]} value={gen.length} onchange={(v) => (gen.length = v as 'short' | 'full')} h={30} fs={13} pad={14} label={i18n.t('genLength')} />
      </div>
      <div class="row">
        <span class="lab">{i18n.t('genKey')}</span>
        <select class="sel ut-box" value={gen.tonic ?? -1} onchange={(e) => { const v = +(e.currentTarget as HTMLSelectElement).value; gen.tonic = v < 0 ? null : v; }} aria-label={i18n.t('genKey')}>
          <option value={-1}>{i18n.t('genAuto')}</option>
          {#each keys as k}<option value={k.t}>{k.name}</option>{/each}
        </select>
        <span class="lab tempo">{i18n.t('genTempo')}</span>
        <button class="ut-btn" class:lit={gen.bpm === null} aria-pressed={gen.bpm === null} onclick={() => (gen.bpm = gen.bpm === null ? Math.round((st.bpm[0] + st.bpm[1]) / 2) : null)}>{i18n.t('genAuto')}</button>
        {#if gen.bpm !== null}
          <input class="num ut-box ut-num" type="number" min="60" max="180" step="1" value={gen.bpm} onchange={(e) => { const v = +(e.currentTarget as HTMLInputElement).value; if (v >= 40 && v <= 240) gen.bpm = Math.round(v); }} aria-label="BPM" />
          <span class="unit">BPM</span>
        {/if}
      </div>
      <div class="row">
        <span class="lab">{i18n.t('genSeed')}</span>
        <input class="code ut-box ut-num" bind:value={code} maxlength="8" spellcheck="false" onchange={() => setCode(code)} onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setCode(code); }} aria-label={i18n.t('genSeed')} />
        <button class="ut-btn icon" onclick={() => (gen.seed = newSeed())} title={i18n.t('genNewSeed')} aria-label={i18n.t('genNewSeed')}><Icon name="dice" size={16} sw={1.8} /></button>
        <span class="hint">{i18n.t('genSeedHint')}</span>
      </div>
    </div>

    <footer>
      {#if gen.last}
        <p class="made"><Icon name="check" size={15} sw={2.2} />{i18n.t('genMade', { t: i18n.pick(gen.last.title) })}</p>
      {/if}
      <span class="gap"></span>
      {#if gen.last}
        <button class="ut-btn lg" disabled={gen.busy} onclick={() => gen.reroll()} title={i18n.t('genAgainHint')}><Icon name="dice" size={15} sw={1.8} />{i18n.t('genAgain')}</button>
        {#if app.room !== 'studio'}<button class="ut-btn lg" onclick={() => { gen.close(); app.go('studio'); }}>{i18n.t('genOpenStudio')}</button>{/if}
      {/if}
      <button class="ut-btn primary lg go" disabled={gen.busy} onclick={() => gen.make()}>{i18n.t('genMake')}</button>
    </footer>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; background: rgba(28, 32, 48, .26); backdrop-filter: blur(2px); }
  .scrim.night { background: rgba(0, 0, 0, .58); }
  .gen {
    position: fixed; z-index: 61; left: 50%; top: 50%; translate: -50% -50%;
    width: min(780px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; overscroll-behavior: contain;
    display: flex; flex-direction: column; gap: 22px; padding: 26px 28px 24px;
    background: var(--surface); color: var(--ink); border-radius: 18px;
    box-shadow: 0 0 0 1px var(--hair), 0 30px 70px -24px rgba(28, 32, 48, .45);
  }
  .gen.night { border-radius: 0; background: #16141B; box-shadow: 0 0 0 1px rgba(216, 180, 106, .4), inset 0 0 0 5px #16141B, inset 0 0 0 6px rgba(216, 180, 106, .14), 0 30px 70px -20px rgba(0, 0, 0, .8); }
  header { display: flex; gap: 16px; align-items: flex-start; }
  .hd { flex: 1; min-width: 0; }
  h2 { margin: 0; font: 900 28px/1.2 var(--f-serif); letter-spacing: .04em; }
  .night h2 { font: 800 30px/1.2 var(--f-title); }
  .lead { margin: 8px 0 0; max-width: 44em; font: 500 13px/1.7 var(--f-sans); color: var(--ink2); }
  .x { flex: none; }
  /* the generator is still an experiment: said plainly, under the lead */
  .tag { display: inline-block; vertical-align: 5px; margin-left: 12px; padding: 4px 8px; font: 800 11px/1 var(--f-sans); letter-spacing: .12em; color: var(--accent); background: var(--accentSoft); border-radius: 6px; }
  .night .tag { border-radius: 0; color: #D8B46A; background: rgba(216, 180, 106, .12); }
  .wip { margin: 4px 0 0; max-width: 44em; font: 600 12px/1.6 var(--f-sans); color: var(--muted); }

  .groups { display: grid; grid-template-columns: 3fr 2fr; gap: 18px; }
  .group { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .cards { flex: 1; display: grid; grid-template-columns: repeat(var(--n), 1fr); gap: 10px; }
  .card {
    display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; padding: 14px 12px 12px; text-align: left;
    background: var(--base); transition: background .15s, box-shadow .15s, transform .15s;
  }
  .card:hover { background: var(--accentSoft); }
  .card.on { --bc: var(--accent); box-shadow: inset 0 0 0 2px var(--accent); background: var(--accentSoft); }
  .night .card { background: var(--well); }
  .night .card.on { background: #1E0F14; --bc: rgba(196, 41, 62, .85); }
  .nm { font: 900 18px/1.2 var(--f-serif); color: var(--ink); }
  .night .nm { font: 800 19px/1.2 var(--f-title); }
  /* names stay on one line, so every card's beat row lines up */
  .nm { white-space: nowrap; }
  :global(:root:lang(en)) .nm { font-size: 16.5px; letter-spacing: -.005em; }
  .en { margin-top: -3px; font: italic 800 11px/1 var(--f-disp); font-stretch: 108%; letter-spacing: .04em; color: var(--accent); text-transform: uppercase; }
  .night .en { font: italic 600 13px/1 var(--f-gar); text-transform: none; letter-spacing: .02em; color: #D8B46A; }
  .beat { display: grid; grid-template-columns: repeat(16, 1fr); gap: 2px; width: 100%; margin: 4px 0 2px; }
  .beat i { height: 7px; border-radius: 2px; background: var(--hair); }
  .beat i.q { height: 9px; }
  .beat i.k { background: var(--accent); }
  .beat i.s { background: var(--ink2); }
  .night .beat i { border-radius: 0; }
  .night .beat i.s { background: #D8B46A; }
  .bl { font: 500 11.5px/1.55 var(--f-sans); color: var(--muted); }
  .bpm { margin-top: auto; padding-top: 2px; font-size: 12px; color: var(--ink2); }

  .opts { display: flex; flex-direction: column; gap: 12px; padding-top: 18px; border-top: 1px solid var(--hair); }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .lab { width: 44px; flex: none; font: 700 12px/1 var(--f-sans); letter-spacing: 2px; color: var(--muted); }
  :global(:root:lang(en)) .lab { width: 56px; letter-spacing: .04em; }
  .lab.tempo { width: auto; margin-left: 14px; }
  .sel, .num, .code { height: 30px; padding: 0 10px; font: 700 13px/1 var(--f-sans); color: var(--ink); background: var(--base); border: 0; outline: none; }
  .night .sel, .night .num, .night .code { background: var(--well); }
  .sel { min-width: 128px; cursor: pointer; }
  .num { width: 72px; text-align: center; font-size: 15px; }
  .code { width: 118px; text-align: center; font-size: 16px; letter-spacing: .12em; text-transform: uppercase; }
  .sel:focus-visible, .num:focus-visible, .code:focus-visible { --bc: var(--accent); }
  .unit { font: 700 11px/1 var(--f-sans); color: var(--muted); }
  .hint { font: 500 11.5px/1.4 var(--f-sans); color: var(--muted); }

  /* the actions stay in view when the panel scrolls (a phone held sideways) */
  footer {
    position: sticky; bottom: -24px; z-index: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
    margin: -8px -28px -24px; padding: 12px 28px 20px; background: var(--surface); box-shadow: 0 -10px 16px -14px var(--shadow);
  }
  /* by night the footer runs to the panel's edges, so it carries on the panel's gilded inner frame */
  .night footer {
    background: #16141B;
    box-shadow: inset 5px 0 #16141B, inset 6px 0 rgba(216, 180, 106, .14), inset -5px 0 #16141B, inset -6px 0 rgba(216, 180, 106, .14),
      inset 0 -5px #16141B, inset 0 -6px rgba(216, 180, 106, .14), 0 -10px 16px -14px var(--shadow);
  }
  .gap { flex: 1; }
  .made { display: flex; align-items: center; gap: 8px; margin: 0; font: 700 13px/1.4 var(--f-sans); color: var(--accent); }
  .night .made { color: #D8B46A; }
  .go { min-width: 150px; }

  /* a laptop screen (about 800 tall inside the browser) takes the whole panel without scrolling */
  @media (max-height: 880px) {
    .gen { gap: 16px; padding: 22px 26px 22px; }
    footer { bottom: -22px; margin: -6px -26px -22px; padding: 10px 26px 18px; }
    .opts { gap: 10px; padding-top: 14px; }
    .card { padding: 12px 12px 11px; }
  }
  @media (max-width: 720px) {
    .gen { padding: 18px 16px; gap: 16px; }
    footer { bottom: -18px; margin: -6px -16px -18px; padding: 10px 16px 14px; }
    .groups { grid-template-columns: 1fr; }
    h2 { font-size: 22px; }
  }
  @media (max-height: 560px) {
    .gen { padding: 16px 18px; gap: 14px; }
    footer { bottom: -16px; margin: -6px -18px -16px; padding: 10px 18px 14px; }
    .lead { display: none; }
    .bl { display: none; }
  }
</style>
