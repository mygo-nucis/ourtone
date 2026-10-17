<script lang="ts">
  import StageWindow from './StageWindow.svelte';
  import type { StageLayout, Win } from './layout';
  import type { Song } from '../../lib/music/song';
  import type { Jam } from './jam.svelte';

  /* the band's windows. each keeps the song and layout it was made with, so a window leaving
     during a song change plays out its exit as itself, while the new song's windows arrive. */
  let { L, song, jam, span, away = null, picking = false, picked = new Set(), onpick }: { L: StageLayout; song: Song; jam: Jam; span: number; away?: number | null; picking?: boolean; picked?: ReadonlySet<number>; onpick: (part: number) => void } = $props();
  const items = $derived(L.wins.map((w: Win, i: number) => ({ key: `${song.data.id}:${w.part}:${L.wins.length}`, w, i, song, L })));
</script>

{#each items as it (it.key)}
  <StageWindow L={it.L} w={it.w} song={it.song} {jam} {span} order={it.i} away={it.w.part === away} behind={away !== null} {picking} picked={picking && picked.has(it.w.part)} {onpick} />
{/each}
