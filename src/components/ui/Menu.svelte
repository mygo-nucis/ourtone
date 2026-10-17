<script lang="ts">
  import type { Snippet } from 'svelte';
  import { theme } from '../../lib/state/theme.svelte';

  /* a popover anchored to its trigger. closes on an outside press, on Escape, and after a choice (items call close).
     the open menu lives in a layer on top of the page, so no panel can clip it or cover it; it takes the trigger's
     scale (the studio is drawn scaled), opens below the trigger or above it when there is no room, and follows it. */
  /* shrink: in a crowded row the trigger gives up width first (its label should ellipsize) */
  let { open = $bindable(false), align = 'left', width = 240, trigger, children, label = '', shrink = false }:
    { open?: boolean; align?: 'left' | 'right'; width?: number; trigger: Snippet<[{ toggle: () => void; open: boolean }]>; children: Snippet<[{ close: () => void }]>; label?: string; shrink?: boolean } = $props();
  let root: HTMLElement;
  let pop = $state<HTMLElement | null>(null);
  const close = () => { open = false; };
  const toggle = () => { open = !open; };
  $effect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => !!t && ((root && root.contains(t as Node)) || (!!pop && pop.contains(t as Node)));
    const down = (e: PointerEvent) => { if (!inside(e.target)) open = false; };
    // a field inside that handles Escape itself (a song being renamed) keeps the menu open
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target instanceof Element && e.target.closest('[data-own-escape]'))) { e.stopPropagation(); open = false; } };
    addEventListener('pointerdown', down, true); addEventListener('keydown', key, true);
    return () => { removeEventListener('pointerdown', down, true); removeEventListener('keydown', key, true); };
  });

  /** move the menu into the top layer */
  function layer(node: HTMLElement) {
    let host = document.getElementById('ut-layer');
    if (!host) { host = document.createElement('div'); host.id = 'ut-layer'; document.body.appendChild(host); }
    host.appendChild(node);
    pop = node;
    let raf = 0, last = '';
    const place = () => {
      const r = root.getBoundingClientRect(), k = root.offsetWidth ? r.width / root.offsetWidth : 1;
      const vw = innerWidth, vh = innerHeight, gap = 6 * k, h = node.offsetHeight * k, w = width * k;
      const below = vh - r.bottom - gap - 8, above = r.top - gap - 8;
      const up = h > below && above > below;
      const room = Math.max(120, up ? above : below);
      let x = align === 'right' ? r.right - w : r.left;
      x = Math.max(8, Math.min(vw - 8 - w, x));
      const y = up ? r.top - gap - Math.min(h, room) : r.bottom + gap;
      const key = `${x.toFixed(1)},${y.toFixed(1)},${k.toFixed(3)},${room.toFixed(0)}`;
      if (key !== last) {
        last = key;
        node.style.left = `${x}px`; node.style.top = `${y}px`;
        node.style.transform = `scale(${k})`;
        node.style.maxHeight = `${Math.min(560, room / k)}px`;
      }
      raf = requestAnimationFrame(place);
    };
    place();
    // the node lives outside this component: take it away ourselves, or it stays behind when the component goes
    // (a track's menu, when that track is deleted from it)
    return { destroy() { cancelAnimationFrame(raf); if (pop === node) pop = null; node.remove(); } };
  }
</script>

<div class="menu-root" class:shrink bind:this={root}>
  {@render trigger({ toggle, open })}
  {#if open}
    <div class="menu" class:night={theme.night} use:layer style="width:{width}px" role="menu" aria-label={label}>{@render children({ close })}</div>
  {/if}
</div>

<style>
  .menu-root { position: relative; display: inline-flex; flex: none; }
  .menu-root.shrink { flex: 0 1 auto; min-width: 0; }
  .menu-root.shrink > :global(*) { min-width: 0; }
  :global(#ut-layer) { position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 1000; }
  .menu {
    position: fixed; left: 0; top: 0; transform-origin: 0 0; padding: 6px; overflow-y: auto; overscroll-behavior: contain;
    background: var(--surface); border-radius: 12px; box-shadow: 0 0 0 1px var(--hair), 0 18px 40px -12px rgba(28, 32, 48, .28);
    animation: pop .16s cubic-bezier(.3, 1.4, .5, 1);
  }
  .menu.night { border-radius: 0; background: #16141B; box-shadow: 0 0 0 1px rgba(216, 180, 106, .35), inset 0 0 0 4px #16141B, inset 0 0 0 5px rgba(216, 180, 106, .12), 0 18px 40px -12px rgba(0, 0, 0, .7); padding: 9px; animation-name: fadein; }
  @keyframes pop { from { opacity: 0; } }
  @keyframes fadein { from { opacity: 0; } }
  .menu :global(.mi) {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 34px; padding: 6px 10px; border-radius: 8px; text-align: left;
    font: 500 13px/1.3 var(--f-sans); color: var(--ink);
  }
  .menu :global(.mi:hover), .menu :global(.mi:focus-visible) { background: var(--accentSoft); box-shadow: none; }
  .menu :global(.mi.on) { font-weight: 900; color: var(--accent); }
  .menu :global(.mi:disabled) { opacity: .45; }
  .menu :global(.mi .sub) { margin-left: auto; font-size: 11px; color: var(--muted); white-space: nowrap; }
  .menu :global(.mh) { padding: 10px 10px 6px; font: 700 11px/1 var(--f-sans); letter-spacing: 2px; color: var(--muted); }
  .menu :global(.sep) { height: 1px; margin: 6px 4px; background: var(--hair); }
  .menu.night :global(.mi) { border-radius: 0; }
</style>
