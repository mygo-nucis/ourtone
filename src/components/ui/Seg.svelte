<script lang="ts" generics="T extends string">
  import { theme } from '../../lib/state/theme.svelte';
  import { fonts } from '../../lib/state/fonts.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';

  /* a segmented switch: a pill track with a sliding pill by day; a chamfered well with a sliding crimson plaque by night */
  let { items, value, onchange, h = 28, fs = 14, pad = 16, label = '' }: { items: { id: T; label: string; title?: string }[]; value: T; onchange: (id: T) => void; h?: number; fs?: number; pad?: number; label?: string } = $props();
  let btns: HTMLButtonElement[] = $state([]);
  let ind = $state({ x: 0, w: 0, ready: false });
  $effect(() => {
    void fonts.version; void i18n.lang; void items.length;
    const i = items.findIndex(it => it.id === value), b = btns[i];
    if (!b) return;
    ind = { x: b.offsetLeft, w: b.offsetWidth, ready: true };
  });
</script>

<div class="seg" class:night={theme.night} role="tablist" aria-label={label} style="--h:{h}px;--fs:{fs}px;--pad:{pad}px">
  <span class="ind" class:ready={ind.ready} style="transform:translateX({ind.x}px);width:{ind.w}px" aria-hidden="true"></span>
  {#each items as it, i (it.id)}
    <button bind:this={btns[i]} role="tab" aria-selected={it.id === value} class:on={it.id === value} title={it.title} onclick={() => onchange(it.id)}>{it.label}</button>
  {/each}
</div>

<style>
  .seg {
    position: relative; display: inline-flex; flex: none; height: var(--h); padding: 3px; border-radius: calc(var(--h) / 2);
    background: var(--surface); box-shadow: inset 0 0 0 1.2px var(--hair);
  }
  .ind { position: absolute; left: 0; top: 3px; bottom: 3px; border-radius: calc(var(--h) / 2 - 3px); background: var(--accent); opacity: 0; }
  .ind.ready { opacity: 1; transition: transform .28s cubic-bezier(.3, 1.3, .5, 1), width .28s cubic-bezier(.3, 1.3, .5, 1); }
  button {
    position: relative; z-index: 1; padding: 0 var(--pad); height: 100%; border-radius: calc(var(--h) / 2);
    font: 500 var(--fs)/1 var(--f-sans); letter-spacing: 2px; color: var(--ink2); white-space: nowrap; transition: color .2s;
  }
  button:hover { color: var(--ink); }
  :global(:root:lang(en)) button { letter-spacing: .02em; }
  button.on { font-weight: 900; color: var(--on); }
  .night { border-radius: 0; background: var(--well); box-shadow: none; clip-path: polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px); }
  .night::before {
    content: ''; position: absolute; inset: 0; pointer-events: none; background: var(--hair);
    clip-path: polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px, 1px 4.4px, 1px calc(100% - 4.4px), 4.4px calc(100% - 1px), calc(100% - 4.4px) calc(100% - 1px), calc(100% - 1px) calc(100% - 4.4px), calc(100% - 1px) 4.4px, calc(100% - 4.4px) 1px, 4.4px 1px, 1px 4.4px, 0 4px);
  }
  .night .ind { border-radius: 0; clip-path: polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px); }
  .night button { border-radius: 0; }
  button:focus-visible { box-shadow: 0 0 0 2px var(--accent); }
</style>
