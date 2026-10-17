<script lang="ts">
  import Icon from '../../../components/ui/Icon.svelte';
  import { studio } from '../../../lib/project/studio.svelte';
  import { transport } from '../../../lib/audio/transport.svelte';
  import { FAMILIES, PRESETS, preset } from '../../../lib/audio/presets';
  import { iconMarkup } from '../../../lib/art/icons';
  import { partColor } from '../../../lib/art/palette';
  import { deliver } from '../../../lib/project/export';
  import { theme } from '../../../lib/state/theme.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';
  import { saved } from '../sound.svelte';

  /* the sound library: this song's sounds, every preset by family, and the sounds you saved (as files too) */
  let { h }: { h: number } = $props();
  let q = $state('');
  let fam = $state('all');
  $effect(() => { void saved.load(); });
  const zh = $derived(i18n.lang === 'zh');
  const current = $derived(transport.song?.parts[studio.part]?.data.preset ?? '');
  const inSong = $derived.by(() => { const s = transport.song; if (!s) return []; const seen = new Set<string>(); return s.parts.filter(p => { if (seen.has(p.data.preset)) return false; seen.add(p.data.preset); return true; }).map(p => ({ id: p.data.preset, who: i18n.pick(p.data.name) })); });
  const match = (id: string) => { const pr = PRESETS[id], t = q.trim().toLowerCase(); return !t || pr.name.zh.includes(t) || pr.name.en.toLowerCase().includes(t) || id.includes(t); };
  const fams = $derived(FAMILIES.filter(f => fam === 'all' || f.id === fam).map(f => ({ ...f, list: f.presets.filter(match) })).filter(f => f.list.length));
  const color = (i: number) => partColor(theme.pal, i);
  let file: HTMLInputElement;
  async function importFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!f) return;
    try {
      const x = JSON.parse(await f.text());
      if (x && x.undertone === 'sound' && x.patch && PRESETS[x.preset]) saved.apply(await saved.addPatch(String(x.name || f.name.replace(/\.json$/, '')).slice(0, 30), x.preset, x.patch));
    } catch { /* not a sound file */ }
  }
  async function exportCurrent() {
    const p = transport.song?.parts[studio.part];
    if (!p) return;
    const body = JSON.stringify({ undertone: 'sound', v: 1, name: i18n.pick(p.data.inst), preset: p.data.preset, patch: p.data.patch ?? preset(p.data.preset).patch }, null, 1);
    await deliver(`${i18n.pick(p.data.inst)}.json`, new TextEncoder().encode(body), 'application/json');
  }
</script>

<aside class="lib" style="height:{h}px">
  <label class="search ut-box"><Icon name="search" size={17} sw={1.8} /><input bind:value={q} placeholder={zh ? '搜索音色' : 'Search sounds'} onkeydown={(e) => e.stopPropagation()} /></label>
  <div class="chips">
    <button class:on={fam === 'all'} onclick={() => (fam = 'all')}>{zh ? '全部' : 'All'}</button>
    {#each FAMILIES as f}<button class:on={fam === f.id} onclick={() => (fam = f.id)}>{i18n.pick(f.name).split(' ')[0].replace(/[&·]/g, '').slice(0, zh ? 2 : 8)}</button>{/each}
  </div>
  <div class="scroll">
    {#if !q && fam === 'all'}
      <div class="mh">{zh ? '这首歌里的音色' : 'In this song'}</div>
      {#each inSong as s}
        {@const pr = PRESETS[s.id]}
        <button class="it" class:sel={s.id === current} onclick={() => studio.setPreset(studio.part, s.id)}>
          {#if s.id === current}<span class="bar"></span>{/if}
          <span class="ic">{@html iconMarkup(pr.icon, theme.night, color(1), 28)}</span><span class="t"><span class="n">{i18n.pick(pr.name)}</span><span class="w">{s.who}</span></span>
        </button>
      {/each}
    {/if}
    {#each fams as f, k}
      <div class="mh">{i18n.pick(f.name)}</div>
      {#each f.list as id}
        {@const pr = PRESETS[id]}
        <button class="it" class:sel={id === current && (q || fam !== 'all')} onclick={() => studio.setPreset(studio.part, id)}>
          <span class="ic">{@html iconMarkup(pr.icon, theme.night, color(k + 2), 28)}</span><span class="t"><span class="n">{i18n.pick(pr.name)}</span><span class="w">{i18n.pick(f.name)}</span></span>
        </button>
      {/each}
    {/each}
    <div class="mh">{zh ? '我的音色' : 'My sounds'}</div>
    {#each saved.list as x (x.id)}
      <div class="it mine">
        <button class="row" onclick={() => saved.apply(x)}><span class="ic">{@html iconMarkup(x.icon, theme.night, color(4), 28)}</span><span class="t"><span class="n">{x.name}</span><span class="w">{new Date(x.created).toLocaleDateString(zh ? 'zh-CN' : 'en')}</span></span></button>
        <button class="x" aria-label={zh ? '删除' : 'Delete'} onclick={() => saved.remove(x.id)}><Icon name="close" size={13} sw={2} /></button>
      </div>
    {:else}
      <p class="none">{zh ? '调好一个音色后，点上面的“保存为新音色”。' : 'Shape a sound, then use Save as new above.'}</p>
    {/each}
  </div>
  <div class="foot">
    <button class="imp ut-box" onclick={() => file.click()}><Icon name="upload" size={14} sw={1.9} />{zh ? '导入音色文件' : 'Import a sound file'}</button>
    <button class="imp ut-box" onclick={exportCurrent}><Icon name="export" size={14} sw={1.9} />{zh ? '导出当前音色' : 'Export this sound'}</button>
    <input bind:this={file} type="file" accept=".json,application/json" hidden onchange={importFile} />
  </div>
</aside>

<style>
  .lib { width: 256px; flex: none; display: flex; flex-direction: column; background: var(--p2); border-right: 1px solid var(--hair); }
  .search { display: flex; align-items: center; gap: 8px; margin: 14px 16px 0; height: 32px; padding: 0 12px; border-radius: 16px; background: var(--surface); color: var(--muted); }
  :global([data-sky="night"]) .search { background: var(--well); }
  .search input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font: 500 12px/1 var(--f-sans); color: var(--ink); }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 12px 16px 4px; }
  .chips button { height: 24px; padding: 0 9px; border-radius: 12px; font: 500 12px/1 var(--f-sans); color: var(--ink2); box-shadow: inset 0 0 0 1px var(--hair); }
  .chips button.on { background: var(--ink); color: var(--bg); font-weight: 700; box-shadow: none; }
  :global([data-sky="night"]) .chips button { border-radius: 0; }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px; scrollbar-width: thin; }
  .mh { padding: 14px 10px 6px; font: 700 11px/1 var(--f-sans); letter-spacing: 2px; color: var(--muted); }
  .it { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; height: 42px; padding: 0 10px 0 12px; border-radius: 8px; text-align: left; }
  .it:hover, .it.sel { background: var(--accentSoft); }
  .it .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--accent); }
  :global([data-sky="night"]) .it { border-radius: 0; }
  .ic { display: grid; place-items: center; width: 30px; height: 30px; flex: none; }
  .ic :global(svg) { overflow: visible; }
  .t { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .n { font: 700 13px/1.1 var(--f-sans); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .it.sel .n { font-weight: 900; }
  .w { font: 500 11px/1.1 var(--f-sans); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mine { padding: 0; }
  .mine .row { display: flex; align-items: center; gap: 10px; flex: 1; height: 100%; padding: 0 0 0 12px; text-align: left; min-width: 0; }
  .x { display: grid; place-items: center; width: 26px; height: 26px; margin-right: 6px; color: var(--muted); opacity: 0; border-radius: 6px; }
  .mine:hover .x, .x:focus-visible { opacity: 1; }
  .x:hover { color: var(--signal); }
  .none { margin: 2px 12px 8px; font: 500 11px/1.6 var(--f-sans); color: var(--muted); }
  .foot { display: flex; flex-direction: column; gap: 6px; padding: 10px 16px 14px; border-top: 1px solid var(--hair); }
  .imp { display: flex; align-items: center; justify-content: center; gap: 6px; height: 30px; --bc: var(--hair); font: 700 12px/1 var(--f-sans); letter-spacing: 1px; color: var(--ink2); }
  .imp:hover { --bc: var(--accent); color: var(--accent); }
</style>
