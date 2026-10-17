<script lang="ts">
  import { fade } from 'svelte/transition';
  import { theme } from '../lib/state/theme.svelte';
  import { i18n } from '../lib/i18n/index.svelte';
  import { CHANGELOG } from '../lib/changelog';

  /* the changelog, from the ⋯ menu: a card over the dimmed page. a click or tap anywhere outside it, or Escape, closes it */
  let { open = $bindable(false) }: { open?: boolean } = $props();
  let card = $state<HTMLDivElement>();
  $effect(() => { if (open) card?.focus(); });

  // a change can carry links: [text](https://…), or a bare https:// address (shown without its https://)
  const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s()（）]*[^\s()（）.,，。!！])/g;
  const pieces = (s: string) => {
    const out: { text: string; href?: string }[] = [];
    let i = 0;
    for (const m of s.matchAll(LINK)) {
      if (m.index > i) out.push({ text: s.slice(i, m.index) });
      out.push(m[3] ? { text: m[3].replace(/^https?:\/\//, ''), href: m[3] } : { text: m[1], href: m[2] });
      i = m.index + m[0].length;
    }
    if (i < s.length) out.push({ text: s.slice(i) });
    return out;
  };
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') { e.preventDefault(); open = false; } }} />
{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Escape closes it) -->
  <div class="scrim" class:night={theme.night} transition:fade={{ duration: 140 }} onpointerdown={(e) => { if (e.target === e.currentTarget) open = false; }}>
    <div class="card" bind:this={card} role="dialog" aria-modal="true" aria-label={i18n.t('changelog')} tabindex="-1">
      <h2>{i18n.t('changelog')}</h2>
      {#each CHANGELOG as v (v.date)}
        <section>
          <time datetime={v.date}>{v.date}</time>
          <ul>{#each v[i18n.lang] as line}<li>{#each pieces(line) as p}{#if p.href}<a href={p.href} target="_blank" rel="noopener noreferrer">{p.text}</a>{:else}{p.text}{/if}{/each}</li>{/each}</ul>
        </section>
      {/each}
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgba(246, 248, 251, .72); backdrop-filter: blur(3px); }
  .card {
    width: min(420px, 100%); max-height: calc(100% - 8px); overflow: auto; padding: 22px 26px 18px; background: #FFFFFF; border: 2px solid var(--ink); border-radius: 16px;
    box-shadow: 0 0 0 7px #FFFFFF, 6px 12px 0 7px rgba(28, 32, 48, .14); outline: none;
  }
  h2 { margin: 0 0 6px; font: 900 22px/1.2 var(--f-serif); letter-spacing: .06em; color: var(--ink); }
  section { padding: 10px 0 2px; }
  section + section { border-top: 1.5px dashed var(--line, rgba(28, 32, 48, .16)); }
  time { font: 800 12px/1.4 var(--f-sans); letter-spacing: .08em; color: var(--accent); font-variant-numeric: tabular-nums; }
  ul { margin: 4px 0 6px; padding-left: 18px; font: 500 13px/1.6 var(--f-sans); color: var(--ink2); }
  a { color: var(--accent); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; overflow-wrap: anywhere; }
  a:hover { text-decoration-thickness: 2px; }

  .night { background: rgba(11, 10, 14, .7); }
  .night .card {
    border: 1px solid rgba(216, 180, 106, .6); border-radius: 0; background: #16141B;
    box-shadow: inset 0 0 0 5px #16141B, inset 0 0 0 6px rgba(216, 180, 106, .16), 0 24px 50px -12px rgba(0, 0, 0, .8);
  }
  .night h2 { font: 800 22px/1.2 var(--f-title); }
  .night section + section { border-top: 1px solid rgba(216, 180, 106, .2); }
  .night time { font: italic 600 15px/1.4 var(--f-gar); letter-spacing: .02em; color: var(--orn); }
  .night ul { font: 500 14px/1.6 var(--f-gar); color: var(--ink2); }
  .night a { color: var(--orn); }
</style>
