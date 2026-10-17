<script lang="ts">
  import { wordmark } from '../lib/art/wordmark';
  import { fonts } from '../lib/state/fonts.svelte';

  let { size = 22, night = false }: { size?: number; night?: boolean } = $props();
  let svg: SVGSVGElement;
  let width = $state(120);
  $effect(() => {
    void fonts.version;
    const g = svg.querySelector('g.mark') as SVGGElement;
    g.replaceChildren();
    width = Math.ceil(wordmark(g, 0, size * 1.02, size, night)) + 4;
  });
</script>

<svg bind:this={svg} class="wm" width={width} height={Math.ceil(size * 1.32)} viewBox="0 0 {width} {Math.ceil(size * 1.32)}" role="img" aria-label="Ourtone"><g class="mark"></g></svg>

<style>
  .wm { display: block; overflow: visible; }
</style>
