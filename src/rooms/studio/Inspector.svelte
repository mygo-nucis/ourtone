<script lang="ts">
  import Knob from '../../components/ui/Knob.svelte';
  import Icon from '../../components/ui/Icon.svelte';
  import PartChip from '../../components/ui/PartChip.svelte';
  import AddPart from './AddPart.svelte';
  import { studio, isDrums } from '../../lib/project/studio.svelte';
  import { inRange, passagesOf } from '../../lib/project/ops';
  import { transport } from '../../lib/audio/transport.svelte';
  import { mixOf } from '../../lib/audio/strip';
  import { MACROS, macroValue, macroDef, setMacro } from './macros';
  import { saved } from './sound.svelte';
  import { MOD } from './frame';
  import { pickFile, AUDIO_ACCEPT } from '../../lib/util';
  import { PRESETS } from '../../lib/audio/presets';
  import { partColor } from '../../lib/art/palette';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';

  /* the right-hand panel: the focused part's instrument and five macro knobs, then whatever is selected on the timeline */
  let { h }: { h: number } = $props();
  const part = $derived(transport.song?.parts[studio.part]);
  const mix = $derived(part ? mixOf(part) : null);
  /* the selection on the timeline, described */
  const sel = $derived.by(() => {
    void studio.rev;
    const r = studio.range, d = studio.doc, g = studio.grid;
    if (!r || !d || !g) return null;
    const a = g.barAt(r.a) + 1, b = g.barAt(r.b - 1) + 1;
    let notes = 0;
    for (const i of r.parts) for (const n of d.parts[i].notes) if (inRange(n, r.a, r.b)) notes++;
    const kind: 'section' | 'one' | 'selection' = studio.section ? 'section' : r.parts.length === 1 ? 'one' : 'selection';
    const passage = kind === 'one' && passagesOf(d.parts[r.parts[0]], g).some(x => x.a === r.a && x.b === r.b);
    const cuts = r.parts.some(i => d.parts[i].cuts.some(c => c > r.a && c < r.b));
    const pitched = r.parts.some(i => !isDrums(d.parts[i].meta) && d.parts[i].meta.kind !== 'audio');
    const audioOnly = r.parts.every(i => d.parts[i].meta.kind === 'audio');
    // whole bars read as bars; anything else as beats
    const bar = g.tickOf(g.barAt(r.a) + 1) - g.tickOf(g.barAt(r.a)), whole = Math.abs(g.snap(r.a, 'bar') - r.a) < 1 && Math.abs(g.snap(r.b, 'bar') - r.b) < 1;
    const beats = Math.round((r.b - r.a) / g.beat(r.a) * 10) / 10;
    return { a, b, bars: whole ? Math.round((r.b - r.a) / bar) : 0, beats, notes, kind, passage, cuts, parts: r.parts.length, total: d.parts.length, pitched, audioOnly };
  });
  const selPart = $derived(sel && sel.kind === 'one' ? transport.song?.parts[studio.range!.parts[0]] : null);
  /** a selected clip on an audio track */
  const selClip = $derived.by(() => { void studio.rev; const r = studio.range, d = studio.doc; if (!r || r.parts.length !== 1 || !d) return null; return d.parts[r.parts[0]].clips.find(c => c.t === r.a) ?? null; });
  /** the cursor inside the selection (checked a few times a second; the playhead moves outside Svelte) */
  let cursorIn = $state(false);
  $effect(() => {
    const r = studio.range;
    if (!r) { cursorIn = false; return; }
    const f = () => { const t = studio.cursorTick(); cursorIn = t > r.a && t < r.b; };
    f();
    const id = setInterval(f, 250);
    return () => clearInterval(id);
  });
</script>

<aside class="insp" class:night={theme.night} style="height:{h}px" aria-label={i18n.t('instrument')}>
  {#if part && mix}
    <section class="inst">
      <div class="row1"><span class="ut-kicker">{i18n.t('instrument')}</span></div>
      <span class="chip"><PartChip icon={part.data.icon} color={partColor(theme.pal, part.data.color)} size={34} /></span>
      <h2 class="nm">{i18n.pick(part.data.name)}</h2>
      {#if part.data.kind === 'audio'}
        <button class="preset ut-box" onclick={async () => { const f = await pickFile(AUDIO_ACCEPT); if (f) void studio.importAudio(studio.part, f); }}>
          <span>{i18n.t('importAudioShort')}</span><Icon name="upload" size={16} sw={1.8} />
        </button>
      {:else}
        <AddPart current={part.data.preset} align="right" onpick={(id) => studio.setPreset(studio.part, id)} onsound={(x) => saved.apply(x)}>
          {#snippet trigger({ toggle, open })}
            <button class="preset ut-box" class:open onclick={toggle} aria-haspopup="menu" aria-expanded={open}>
              <span>{i18n.pick(PRESETS[part.data.preset]?.name ?? part.data.inst)}</span><Icon name="down" size={16} sw={2} />
            </button>
          {/snippet}
        </AddPart>
      {/if}
      <div class="macros">
        {#each MACROS as m}
          <Knob r={16} value={macroValue(m.k)} def={macroDef(m.k)} label={i18n.t(m.label)} title="{i18n.t(m.label)} · {i18n.t(m.hint)} · {Math.round(macroValue(m.k) * 100)}%" bipolar={m.k === 'bright' || m.k === 'attack'} onchange={(v, key) => setMacro(m.k, v, key)} />
        {/each}
      </div>
      <button class="sound ut-box" onclick={() => (studio.view = 'sound')}>
        <span class="t">{i18n.t('openSound')}</span>
        <span class="s">{i18n.t('openSoundSub')}</span>
        <span class="go"><Icon name="chev" size={18} sw={2} /></span>
      </button>
    </section>
  {/if}

  <section class="clip">
    <div class="row1"><span class="ut-kicker">{sel && sel.kind === 'section' ? i18n.t('section') : sel?.passage ? i18n.t('passage') : !sel && studio.trackSel ? i18n.t('trackKicker') : i18n.t('selection')}</span></div>
    {#if sel}
      <dl>
        {#if sel.kind === 'one' && selPart}
          <div><dt>{i18n.t('fieldName')}</dt><dd>{i18n.pick(selPart.data.name)}</dd></div>
          {#if selClip}<div><dt>{i18n.t('fieldSource')}</dt><dd class="src">{selClip.name ?? ''} · {selClip.dur.toFixed(1)} s</dd></div>{/if}
        {:else}
          <div><dt>{i18n.t('fieldParts')}</dt><dd>{sel.parts === sel.total ? i18n.t('allParts', { n: sel.total }) : sel.parts}</dd></div>
        {/if}
        <div><dt>{i18n.t('fieldPos')}</dt><dd>{sel.a === sel.b ? i18n.t('barA', { a: sel.a }) : i18n.t('barsAB', { a: sel.a, b: sel.b })}</dd></div>
        <div><dt>{i18n.t('fieldLen')}</dt><dd>{sel.bars === 1 ? i18n.t('oneBar') : sel.bars ? i18n.t('nBars', { n: sel.bars }) : i18n.t('nBeats', { n: sel.beats })}</dd></div>
        {#if !sel.audioOnly}<div><dt>{i18n.t('fieldNotes')}</dt><dd>{sel.notes}</dd></div>{/if}
        {#if sel.pitched}
          <div class="tr"><dt>{i18n.t('fieldTranspose')}</dt><dd>
            <button class="ut-btn icon step wide2" title="−12" onclick={() => studio.transpose(-12)}>−12</button>
            <button class="ut-btn icon step" title="−1" onclick={() => studio.transpose(-1)}><Icon name="minus" size={14} sw={2} /></button>
            <button class="ut-btn icon step" title="+1" onclick={() => studio.transpose(1)}><Icon name="plus" size={14} sw={2} /></button>
            <button class="ut-btn icon step wide2" title="+12" onclick={() => studio.transpose(12)}>+12</button>
          </dd></div>
        {/if}
      </dl>
      <div class="acts">
        <button class="ut-btn fill" onclick={() => studio.duplicate()}><Icon name="copy" size={15} />{i18n.t('duplicate')}</button>
        {#if sel.kind === 'section'}
          <button class="ut-btn fill" onclick={() => studio.insertSection()}><Icon name="plus" size={15} />{i18n.t('insertBars')}</button>
          <button class="ut-btn fill" onclick={() => studio.cutSection()}><Icon name="trash" size={15} />{i18n.t('cutBars')}</button>
        {:else}
          <button class="ut-btn fill" onclick={() => studio.clear()}><Icon name="eraser" size={15} />{i18n.t('clear')}</button>
        {/if}
        {#if cursorIn}<button class="ut-btn fill" onclick={() => studio.split(studio.cursorTick())}><Icon name="scissors" size={15} />{i18n.t('splitAtCursor')}</button>{/if}
        {#if sel.cuts}<button class="ut-btn fill" onclick={() => studio.join()}><Icon name="join" size={15} />{i18n.t('joinPassages')}</button>{/if}
      </div>
      {#if sel.kind === 'section'}<p class="note">{i18n.t('sectionNote')}</p>{/if}
      {#if sel.kind === 'one' && !sel.audioOnly}
        <button class="ut-btn accent wide" onclick={() => { const r = studio.range!; studio.part = r.parts[0]; studio.pick([]); studio.seekTick(r.a); studio.view = 'track'; }}>{i18n.t('editInTrack')}</button>
      {/if}
    {:else if studio.trackSel && part}
      <p class="empty">{i18n.t('trackSelHint', { mod: MOD })}</p>
      <div class="acts">
        <button class="ut-btn fill" onclick={() => studio.duplicatePart(studio.part)}><Icon name="copy" size={15} />{i18n.t('duplicatePart')}</button>
        <button class="ut-btn fill" disabled={(transport.song?.parts.length ?? 0) <= 1} onclick={() => studio.deletePart(studio.part)}><Icon name="trash" size={15} />{i18n.t('deletePart')}</button>
      </div>
    {:else}
      <p class="empty">{i18n.t('noSelection')}</p>
    {/if}
  </section>

  {#if part}
    <section class="color">
      <div class="row1"><span class="ut-kicker">{i18n.t('partColor')}</span></div>
      <div class="sw">
        {#each [0, 1, 2, 3, 4, 5, 6] as c}
          {@const on = part.data.color === c}
          <button class="swatch" aria-label="{i18n.t('partColor')} {c + 1}" aria-pressed={on} onclick={() => studio.setPart('opColor', studio.part, { color: c })}>
            <svg width="24" height="30" viewBox="0 -3 24 30" aria-hidden="true">
              {#if theme.night}
                <path d="M0 27V15.6A14.9 14.9 0 0 1 12 0A14.9 14.9 0 0 1 24 15.6V27Z" fill={partColor(theme.pal, c)} stroke={on ? '#D8B46A' : 'rgba(237,230,225,.35)'} stroke-width={on ? 1.6 : 1} />
                {#if on}<path d="M12 -1.5L14.2 1.5L12 4.5L9.8 1.5Z" fill="#D8B46A" transform="translate(0 25)" />{/if}
              {:else}
                {#if on}<rect x="-3.5" y="-.5" width="31" height="31" rx="9" fill="none" stroke="#2F86E8" stroke-width="1.5" />{/if}
                <rect x="0" y="3" width="24" height="24" rx="6" fill={partColor(theme.pal, c)} />
              {/if}
            </svg>
          </button>
        {/each}
      </div>
    </section>
  {/if}
</aside>

<style>
  .insp { position: relative; width: 264px; flex: none; padding: 0 22px; background: var(--p2); border-left: 1px solid var(--hair); overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; }
  section { position: relative; padding: 22px 0 20px; }
  section + section { border-top: 1px solid var(--hair); }
  .row1 { height: 16px; display: flex; align-items: center; }
  .inst .chip { position: absolute; right: 0; top: 16px; }
  .nm { margin: 16px 0 14px; font: 900 24px/1.2 var(--f-serif); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; }
  .night .nm { font: 800 24px/1.2 var(--f-title); }
  .preset { display: flex; align-items: center; justify-content: space-between; width: 220px; height: 34px; padding: 0 10px 0 12px; font: 700 13px/1 var(--f-sans); color: var(--ink); background: var(--surface); }
  .night .preset { background: var(--well); }
  .preset :global(.ic) { color: var(--muted); }
  .preset:hover, .preset.open { --bc: var(--accent); }
  .macros { display: flex; gap: 12px; margin: 26px 0 0 4px; }
  .sound { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 7px; width: 220px; height: 60px; margin-top: 22px; padding: 12px 14px; text-align: left; --bc: var(--accent); background: var(--surface); }
  .night .sound { background: var(--well); }
  .sound .t { font: 900 14px/1 var(--f-sans); letter-spacing: 1px; color: var(--accent); }
  .sound .s { font: 500 11px/1 var(--f-sans); color: var(--muted); }
  .sound .go { position: absolute; right: 12px; top: 20px; color: var(--accent); }
  .sound:hover { background: var(--accentSoft); }
  dl { margin: 12px 0 0; }
  dl > div { display: flex; align-items: center; justify-content: space-between; height: 34px; border-bottom: 1px solid var(--hair); }
  dt { font: 500 12px/1 var(--f-sans); color: var(--muted); }
  dd { margin: 0; display: flex; gap: 4px; align-items: center; font: 700 13px/1 var(--f-sans); color: var(--ink); }
  dd.src { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; font-weight: 600; font-size: 12px; }
  .tr dd { gap: 4px; }
  .step.wide2 { width: 34px; }
  .step { width: 26px; height: 22px; border-radius: 6px; font: 800 11px/1 var(--f-sans); letter-spacing: 0; }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .acts .ut-btn { height: 30px; padding: 0 10px; }
  .wide { width: 220px; height: 34px; margin-top: 12px; font-size: 13px; }
  .note, .empty { margin: 12px 0 0; font: 500 11.5px/1.6 var(--f-sans); color: var(--muted); }
  .empty { margin-top: 14px; }
  .sw { display: flex; gap: 10px; margin-top: 12px; }
  .swatch { display: block; width: 24px; height: 30px; }
  .swatch svg { display: block; overflow: visible; }
  .swatch:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
