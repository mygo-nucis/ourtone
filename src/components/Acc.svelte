<svelte:options namespace="svg" />
<script lang="ts">
  /* text with ♯ / ♭ inside an SVG <text>: the CJK fonts set them full-width, so shrink, raise and pull them in */
  let { text, size }: { text: string; size: number } = $props();
  const parts = $derived(text.split(/([♯♭])/).filter(Boolean));
  const acc = (s: string | undefined) => s === '♯' || s === '♭';
</script>

{#each parts as p, i}{#if acc(p)}<tspan dx={(-size * .14).toFixed(2)} dy={(-size * .3).toFixed(2)} font-size={(size * .8).toFixed(2)}>{p}</tspan>{:else}<tspan dx={acc(parts[i - 1]) ? (-size * .14).toFixed(2) : 0} dy={acc(parts[i - 1]) ? (size * .3).toFixed(2) : 0}>{p}</tspan>{/if}{/each}
