<script lang="ts">
  import Icon from '../../../components/ui/Icon.svelte';
  import Menu from '../../../components/ui/Menu.svelte';
  import PartPicker from '../PartPicker.svelte';
  import { studio } from '../../../lib/project/studio.svelte';
  import { transport } from '../../../lib/audio/transport.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';
  import { randomSound, tweakSound, saved } from '../sound.svelte';

  /* the sound view's tools: which part, random and tweak, back to the preset, keep it */
  let { compact = false }: { compact?: boolean } = $props();
  const zh = $derived(i18n.lang === 'zh');
  const has = $derived.by(() => { void studio.rev; return !!studio.doc?.parts[studio.part]?.meta.patch; });
  let name = $state('');
  let saveOpen = $state(false);
  $effect(() => { if (saveOpen) name = transport.song ? `${i18n.pick(transport.song.parts[studio.part]?.data.inst ?? { zh: '', en: '' })} · ${zh ? '我的' : 'mine'}` : ''; });
</script>

<div class="tools" role="toolbar">
  <PartPicker {compact} />
  <span class="gap"></span>
  <button class="ut-btn" onclick={randomSound} title={zh ? '随机：换一套音源、宏旋钮、空间和效果' : 'Random: new sources, macros, space and effects'}><Icon name="dice" size={15} sw={1.7} />{#if !compact}{zh ? '随机' : 'Random'}{/if}</button>
  <button class="ut-btn" onclick={tweakSound} title={zh ? '微调：在现在的声音上小改一点' : 'Tweak: small changes to the sound you have'}><Icon name="wand" size={15} sw={1.7} />{#if !compact}{zh ? '微调' : 'Tweak'}{/if}</button>
  <button class="ut-btn" disabled={!has} onclick={() => studio.resetSound(studio.part)} title={zh ? '回到这个预设原本的声音' : 'Back to the preset as it was'}><Icon name="undo" size={15} sw={1.7} />{#if !compact}{zh ? '还原' : 'Restore'}{/if}</button>
  <Menu bind:open={saveOpen} width={260} align="right" label={zh ? '保存为新音色' : 'Save as new'}>
    {#snippet trigger({ toggle })}<button class="ut-btn primary" onclick={toggle}>{zh ? '保存为新音色' : 'Save as new'}</button>{/snippet}
    {#snippet children({ close })}
      <form class="sv" onsubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n) { void saved.add(n.slice(0, 30)); close(); } }}>
        <label class="mh" for="snd-name">{zh ? '名字' : 'Name'}</label>
        <input id="snd-name" bind:value={name} maxlength="30" onkeydown={(e) => e.stopPropagation()} />
        <button class="ut-btn primary" type="submit">{zh ? '保存' : 'Save'}</button>
      </form>
    {/snippet}
  </Menu>
</div>

<style>
  .tools { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
  .gap { flex: 1; }
  .sv { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 4px 6px 6px; }
  .sv .mh { grid-column: 1 / 3; padding: 6px 4px 0; }
  .sv input { height: 30px; padding: 0 10px; border: 1.2px solid var(--hair); border-radius: 8px; font: 500 13px/1 var(--f-sans); color: var(--ink); background: var(--surface); outline: none; }
  .sv input:focus { border-color: var(--accent); }
  :global([data-sky="night"]) .sv input { border-radius: 0; background: var(--well); }
  .sv .ut-btn { height: 30px; }
</style>
