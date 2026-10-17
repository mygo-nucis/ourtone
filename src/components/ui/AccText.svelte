<script lang="ts">
  /* text with ♯ / ♭ in HTML: most fonts here draw them full-width (or lack them), so set them small and raised */
  let { text }: { text: string } = $props();
  const parts = $derived(text.split(/([♯♭])/).filter(Boolean));
</script>

{#each parts as p}{#if p === '♯' || p === '♭'}<span class="acc">{p}</span>{:else}{p}{/if}{/each}

<style>
  .acc { display: inline-block; font-size: .62em; line-height: 0; vertical-align: .55em; margin: 0 -.06em 0 -.02em; font-style: normal; }
</style>
