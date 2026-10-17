<script lang="ts">
  import type { Snippet } from 'svelte';
  import Menu from '../../components/ui/Menu.svelte';
  import { FAMILIES, PRESETS } from '../../lib/audio/presets';
  import { iconMarkup } from '../../lib/art/icons';
  import { partColor } from '../../lib/art/palette';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import type { SavedSound } from '../../lib/state/db';
  import { saved } from './sound.svelte';
  import Icon from '../../components/ui/Icon.svelte';
  import { pickFile, AUDIO_ACCEPT } from '../../lib/util';

  /* the instrument list: the sounds you saved in the sound view first, then every preset by family.
     used to add a part and to change a part's instrument */
  let { onpick, onsound, onaudio, trigger, current = '', align = 'left' }: {
    onpick: (id: string) => void; onsound: (x: SavedSound) => void; trigger: Snippet<[{ toggle: () => void; open: boolean }]>; current?: string; align?: 'left' | 'right';
    /** adding a part (not changing an instrument): an audio track, empty or with a file */
    onaudio?: (file: File | null) => void;
  } = $props();
  let open = $state(false);
  $effect(() => { if (open) void saved.load(); });
</script>

<Menu bind:open {trigger} width={420} {align} label={i18n.t('instrument')}>
  {#snippet children({ close })}
    {#if onaudio}
      <div class="audio">
        <button class="mi big" role="menuitem" onclick={() => { onaudio(null); close(); }}>
          <span class="ic">{@html iconMarkup('audio', theme.night, partColor(theme.pal, 3), 24)}</span>
          <span class="st"><span class="t1">{i18n.t('newAudioTrack')}</span><span class="t2">{i18n.t('newAudioTrackSub')}</span></span>
        </button>
        <button class="mi big" role="menuitem" onclick={async () => { close(); const f = await pickFile(AUDIO_ACCEPT); if (f) onaudio(f); }}>
          <span class="ic up"><Icon name="upload" size={20} sw={1.8} /></span>
          <span class="st"><span class="t1">{i18n.t('importAudioFile')}</span><span class="t2">{i18n.t('importAudioFileSub')}</span></span>
        </button>
      </div>
      <div class="sep"></div>
    {/if}
    {#if saved.list.length}
      <div class="mh">{i18n.t('mySounds')}</div>
      <div class="mine">
        {#each saved.list as x (x.id)}
          <button class="mi" role="menuitem" onclick={() => { onsound(x); close(); }}>
            <span class="ic">{@html iconMarkup(x.icon, theme.night, partColor(theme.pal, 0), 22)}</span><span class="nm">{x.name}</span><span class="sub">{i18n.pick(PRESETS[x.preset]?.name ?? { zh: '', en: '' })}</span>
          </button>
        {/each}
      </div>
      <div class="sep"></div>
    {/if}
    <div class="fams">
      {#each FAMILIES as f, k}
        <div class="fam">
          <div class="mh">{i18n.pick(f.name)}</div>
          {#each f.presets as id}
            {@const pr = PRESETS[id]}
            <button class="mi" class:on={id === current} role="menuitem" onclick={() => { onpick(id); close(); }}>
              <span class="ic">{@html iconMarkup(pr.icon, theme.night, partColor(theme.pal, k + 1), 22)}</span>{i18n.pick(pr.name)}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/snippet}
</Menu>

<style>
  .audio { display: grid; grid-template-columns: 1fr 1fr; gap: 0 6px; }
  .big { align-items: flex-start; padding-top: 8px; padding-bottom: 8px; }
  .st { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .t1 { font: 800 13px/1.3 var(--f-sans); color: var(--ink); }
  .t2 { font: 500 11px/1.35 var(--f-sans); color: var(--muted); }
  .ic.up { color: var(--accent); }
  .fams { display: grid; grid-template-columns: 1fr 1fr; gap: 0 6px; }
  .mine { display: grid; grid-template-columns: 1fr 1fr; gap: 0 6px; }
  .mine .nm { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mine .sub { flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; }
  .fam { display: flex; flex-direction: column; }
  .ic { display: grid; place-items: center; width: 24px; height: 24px; flex: none; }
  .ic :global(svg) { overflow: visible; }
</style>
