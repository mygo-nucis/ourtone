<script lang="ts">
  import PartChip from '../../components/ui/PartChip.svelte';
  import AccText from '../../components/ui/AccText.svelte';
  import { studio, isDrums } from '../../lib/project/studio.svelte';
  import type { Note } from '../../lib/project/doc';
  import { roleOf, jianpu, type Role } from '../../lib/music/harmony';
  import { MODES, noteName, keyName, pitchName, usesFlats } from '../../lib/music/theory';
  import { transport } from '../../lib/audio/transport.svelte';
  import { PRESETS } from '../../lib/audio/presets';
  import { partColor } from '../../lib/art/palette';
  import { theme } from '../../lib/state/theme.svelte';
  import { i18n } from '../../lib/i18n/index.svelte';
  import type { StringKey } from '../../lib/i18n/strings';
  import { harmony } from './harmony.svelte';
  import { homeOf } from './playkeys.svelte';

  /* the side of the track view: the part, the selected notes (what they are against the bar's chord, their length,
     velocity and place), and the scale */
  let { h }: { h: number } = $props();
  const d = $derived.by(() => { void studio.rev; return studio.doc; });
  const part = $derived(d?.parts[studio.part] ?? null);
  const drums = $derived(part ? isDrums(part.meta) : false);
  const key = $derived(d?.meta.key);
  const flats = $derived(key ? usesFlats(key.tonic, key.mode) : false);
  const home = $derived.by(() => { void studio.rev; const p = transport.song?.parts[studio.part]; return p && key ? homeOf(p, key.tonic) : 60; });
  const picked = $derived([...studio.picked].sort((a, b) => a.t - b.t || a.p - b.p));
  const g = $derived(studio.grid);
  const info = $derived.by(() => {
    void studio.rev;
    const n = picked[0];
    if (!n || !part || !key || !g) return null;
    const ns = part.notes, i = ns.indexOf(n);
    let prev: Note | null = null, next: Note | null = null;
    for (let k = i - 1; k >= 0; k--) if (ns[k].t < n.t) { prev = ns[k]; break; }
    for (let k = i + 1; k < ns.length; k++) if (ns[k].t > n.t) { next = ns[k]; break; }
    const c = harmony().chords[g.barAt(n.t)] ?? null;
    return { n, c, role: roleOf(n.p, c, prev?.p ?? null, next?.p ?? null, key.tonic, key.mode) as Role };
  });
  const ROLE: Record<Role, StringKey> = { chord: 'roleChord', passing: 'rolePassing', neighbor: 'roleNeighbor', other: 'roleOther', outside: 'roleOutside' };
  const whole = $derived((d?.meta.ppq ?? 480) * 4);
  function frac(ticks: number) {
    const x = ticks / whole;
    for (const den of [1, 2, 4, 8, 16, 32, 3, 6, 12, 24]) { const num = Math.round(x * den); if (num > 0 && Math.abs(num / den - x) < 1e-3) { const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a), k = gcd(num, den); return `${num / k}/${den / k}`; } }
    return `${(x * 4).toFixed(2)} ${i18n.lang === 'zh' ? '拍' : 'beats'}`;
  }
  const lens = $derived(picked.length ? (picked.length <= 3 ? picked.map(n => frac(n.d)).join(' · ') : [...new Set(picked.map(n => frac(n.d)))].length === 1 ? frac(picked[0].d) : i18n.t('mixed')) : '');
  const vels = $derived.by(() => {
    if (!picked.length) return '';
    const lo = Math.min(...picked.map(n => n.v)), hi = Math.max(...picked.map(n => n.v));
    return lo === hi ? String(lo) : picked.length <= 3 ? picked.map(n => n.v).join(' · ') : `${lo}–${hi}`;
  });
  const bars = $derived.by(() => { if (!picked.length || !g) return ''; const a = g.barAt(picked[0].t) + 1, b = g.barAt(picked[picked.length - 1].t) + 1; return a === b ? i18n.t('barA', { a }) : i18n.t('barsAB', { a, b }); });
  const summary = $derived.by(() => { void studio.rev; if (!part || !part.notes.length) return ''; let lo = 127, hi = 0; part.notes.forEach(n => { lo = Math.min(lo, n.p); hi = Math.max(hi, n.p); }); return i18n.t('partSummary', { n: part.notes.length, lo: noteName(lo, flats), hi: noteName(hi, flats) }); });
  const bigJ = $derived(info && key ? jianpu(info.n.p, key.tonic, key.mode, home) : null);
  const scale = $derived(key ? MODES[key.mode].map(x => pitchName((key.tonic + x) % 12, usesFlats(key.tonic, key.mode))).join('  ') : '');
</script>

<aside class="side" class:night={theme.night} style="height:{h}px">
  {#if part}
    <header>
      <PartChip icon={part.meta.icon} color={partColor(theme.pal, part.meta.color)} size={40} />
      <div class="who"><h2>{i18n.pick(part.meta.name)}</h2><p>{i18n.pick(part.meta.inst)} · {i18n.pick(PRESETS[part.meta.preset]?.name ?? part.meta.inst)}</p></div>
    </header>
    <section class="notes">
      <div class="row1"><span class="ut-kicker">{i18n.t('noteKicker')}</span>{#if picked.length}<span class="cnt">{i18n.t('nPicked', { n: picked.length })}</span>{/if}</div>
      {#if info && key}
        <div class="big">
          {#if studio.notation === 'jianpu' && bigJ && !drums}
            <span class="p ut-num">{bigJ.num}{#if bigJ.oct}<span class="dots" class:low={bigJ.oct < 0}>{'•'.repeat(Math.min(3, Math.abs(bigJ.oct)))}</span>{/if}</span>
          {:else}
            <span class="p ut-num"><AccText text={noteName(info.n.p, flats)} /></span>
          {/if}
          {#if !drums}<span class="badge" class:good={info.role === 'chord'} class:warn={info.role === 'outside'}>{i18n.t(ROLE[info.role])}</span>{/if}
        </div>
        {#if !drums}
          <p class="why"><AccText text={info.role === 'outside' ? i18n.t('outsideKey', { k: keyName(key.tonic, key.mode, i18n.lang) }) : !info.c ? i18n.t('noChord') : info.role === 'chord' ? i18n.t('inChord', { c: info.c.name }) : i18n.t('notInChord', { c: info.c.name })} /></p>
        {/if}
        <dl>
          <div><dt>{i18n.t('fieldDur')}</dt><dd>{lens}</dd></div>
          <div><dt>{i18n.t('fieldVel')}</dt><dd>{vels}</dd></div>
          <div><dt>{i18n.t('fieldPos')}</dt><dd>{bars}</dd></div>
        </dl>
      {:else}
        <p class="sum">{summary}</p>
        <p class="why">{i18n.t('nothingPicked')}</p>
      {/if}
    </section>
    {#if key}
      <section class="sc"><span class="ut-kicker">{i18n.t('scale')}</span><span class="k"><AccText text={keyName(key.tonic, key.mode, i18n.lang)} /></span><span class="nt"><AccText text={scale} /></span></section>
    {/if}
  {/if}
</aside>

<style>
  .side { width: 256px; flex: none; display: flex; flex-direction: column; background: var(--p2); border-right: 1px solid var(--hair); overflow-y: auto; scrollbar-width: thin; }
  header { display: flex; gap: 14px; align-items: flex-start; padding: 20px 20px 18px; border-bottom: 1px solid var(--hair); }
  .who { min-width: 0; }
  h2 { margin: 2px 0 4px; font: 900 24px/1.2 var(--f-serif); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .night h2 { font: 800 24px/1.2 var(--f-title); }
  .who p { margin: 0; font: 500 11px/1.4 var(--f-sans); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  section { padding: 18px 20px 16px; }
  section + section { border-top: 1px solid var(--hair); }
  .row1 { display: flex; justify-content: space-between; align-items: center; height: 14px; }
  .cnt { font: 700 11px/1 var(--f-sans); color: var(--accent); }
  .big { display: flex; align-items: center; gap: 12px; margin-top: 12px; min-height: 48px; }
  .big .p { font-size: 44px; line-height: 1; color: var(--ink); }
  .night .big .p { font-size: 50px; }
  .dots { display: inline-block; font-size: 14px; vertical-align: super; letter-spacing: -2px; margin-left: 2px; }
  .dots.low { vertical-align: sub; }
  .badge { padding: 5px 10px; border-radius: 12px; font: 700 12px/1 var(--f-sans); color: var(--accent); background: var(--accentSoft); white-space: nowrap; }
  .badge.good { color: var(--muted); background: var(--alt); box-shadow: inset 0 0 0 1px var(--hair); }
  .badge.warn { color: var(--signal); }
  .night .badge { border-radius: 0; }
  .why, .sum { margin: 10px 0 0; font: 500 11.5px/1.6 var(--f-sans); color: var(--muted); }
  .sum { margin-top: 14px; font-weight: 700; color: var(--ink2); }
  dl { margin: 12px 0 0; }
  dl > div { display: flex; justify-content: space-between; align-items: center; height: 30px; border-bottom: 1px solid var(--hair); }
  dt { font: 500 12px/1 var(--f-sans); color: var(--muted); }
  dd { margin: 0; font: 700 13px/1 var(--f-sans); color: var(--ink); white-space: nowrap; }
  .sc { display: grid; grid-template-columns: auto 1fr; gap: 8px 10px; align-items: baseline; margin-top: auto; }
  .sc .ut-kicker { grid-column: 1 / 3; font-size: 11px; }
  .sc .k { font: 900 13px/1.3 var(--f-sans); color: var(--ink); white-space: nowrap; }
  .sc .nt { font: 500 12px/1.3 var(--f-sans); color: var(--ink2); white-space: pre; overflow: hidden; text-overflow: ellipsis; }
</style>
