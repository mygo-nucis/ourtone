<script lang="ts">
  import { ICON } from '../../lib/art/icons-base';
  /* a line icon for controls; `sw` is the stroke width in screen pixels */
  let { name, size = 18, sw = 1.8 }: { name: string; size?: number; sw?: number } = $props();
</script>

<svg class="ic" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width={(sw * 24) / size} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html ICON[name] || ''}</svg>

<style>
  .ic { display: block; flex: none; overflow: visible; }
</style>
