<script lang="ts">
  import { studio, isDrums } from '../../../lib/project/studio.svelte';
  import { transport } from '../../../lib/audio/transport.svelte';
  import { engine } from '../../../lib/audio/engine';
  import { MODES, noteName, usesFlats } from '../../../lib/music/theory';
  import { theme } from '../../../lib/state/theme.svelte';
  import { playkeys, keyRange, LABEL_CODES, KEY_LABEL } from '../playkeys.svelte';
  import { pedal, landed, type Held } from '../pedal.svelte';
  import Icon from '../../../components/ui/Icon.svelte';
  import { i18n } from '../../../lib/i18n/index.svelte';

  /* an audition keyboard, three octaves: the key's notes are dotted, the tonic marked; the letters show which computer
     key plays each note (the Z and Q rows are white keys, the A and number rows black). press, or slide across; each
     finger plays its own key, so chords can be played on a touch screen. a phone's keys are 1.3 times as tall */
  let { w, compact = false }: { w: number; compact?: boolean } = $props();
  /* the octave control at the right moves the keyboard, and the computer keys with it (PageUp / PageDown do the same) */
  const OCT = 58, PED = 58, H = $derived(compact ? 83 : 64);
  /* in Manual mode the pedal has a key of its own beside the octave control, to hold (a phone has no Space); on a
     computer it also lights while Space holds the pedal */
  const manual = $derived(pedal.mode === 'manual');
  const LO = $derived(keyRange(playkeys.octave).lo), HI = $derived(keyRange(playkeys.octave).hi);
  const kw = $derived(w - OCT - 10 - (manual ? PED + 10 : 0));
  const whites = $derived(Array.from({ length: HI - LO + 1 }, (_, i) => LO + i).filter(m => ![1, 3, 6, 8, 10].includes(m % 12)));
  const blacks = $derived(Array.from({ length: HI - LO + 1 }, (_, i) => LO + i).filter(m => [1, 3, 6, 8, 10].includes(m % 12)));
  const ww = $derived(kw / whites.length);
  const wx = (m: number) => whites.indexOf(m) * ww;
  const key = $derived(transport.song?.data.key ?? { tonic: 0, mode: 'major' as const });
  const inKey = (m: number) => MODES[key.mode].includes(((m - key.tonic) % 12 + 12) % 12);
  const drums = $derived(!!studio.doc?.parts[studio.part] && isDrums(studio.doc.parts[studio.part].meta));
  /* which pitch each of A–K plays now */
  const letters = $derived.by(() => { void studio.rev; void studio.part; void playkeys.octave; const m = new Map<number, string>(); LABEL_CODES.forEach(code => { const p = playkeys.pitchOf(code); if (p !== null && !m.has(p)) m.set(p, KEY_LABEL[code]); }); return m; });
  const held = $derived(playkeys.down);
  /* the key each pointer (finger, or the mouse) is on */
  const touches = new Map<number, Held & { m: number }>();
  let down = $state.raw<ReadonlySet<number>>(new Set());
  const sync = () => { down = new Set([...touches.values()].map(t => t.m)); };
  const stop = (t: Held & { m: number }) => pedal.letGo(t.m, t);
  async function on(id: number, m: number) {
    const was = touches.get(id);
    if (was?.m === m) return;
    if (was) stop(was);
    const t: Held & { m: number } = { m, voice: null, up: false };
    touches.set(id, t); sync();
    pedal.strike(m);
    await Promise.all([engine.unlock(), transport.prepareNotes(studio.part, [m])]);
    // a key let go (or slid off) before its note was ready still sounds, briefly (or on, under the pedal)
    landed(t, transport.noteOn(studio.part, m, 100));
  }
  function off(id: number) { const t = touches.get(id); if (!t) return; touches.delete(id); stop(t); sync(); }
  function pdown(e: PointerEvent, m: number) {
    // no capture: a finger sliding on to the next key plays it
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    const id = e.pointerId;
    void on(id, m);
    const up = (u: PointerEvent) => { if (u.pointerId !== id) return; off(id); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  const flats = $derived(usesFlats(key.tonic, key.mode));
</script>

<div class="wrap" style="width:{w}px;height:{H}px" class:night={theme.night}>
<div class="keys" style="width:{kw}px;height:{H}px" role="group" aria-label="keyboard">
  {#each whites as m}
    {@const lit = down.has(m) || held.has(m)}
    <button class="w" class:lit style="left:{wx(m)}px;width:{ww}px" onpointerdown={(e) => pdown(e, m)} onpointerenter={(e) => touches.has(e.pointerId) && on(e.pointerId, m)} aria-label={noteName(m, flats)}>
      {#if inKey(m) && !drums}<i class="dot" class:tonic={m % 12 === key.tonic}></i>{/if}
      {#if letters.has(m)}<b>{letters.get(m)}</b>{/if}
    </button>
  {/each}
  {#each blacks as m}
    {@const lit = down.has(m) || held.has(m)}
    {@const bw = ww * .6}
    <button class="b" class:lit style="left:{wx(m - 1) + ww - bw / 2}px;width:{bw}px" onpointerdown={(e) => pdown(e, m)} onpointerenter={(e) => touches.has(e.pointerId) && on(e.pointerId, m)} aria-label={noteName(m, flats)}>
      {#if letters.has(m)}<b>{letters.get(m)}</b>{/if}
      {#if inKey(m) && !lit && !drums}<i class="dot"></i>{/if}
      {#if lit}<span class="nn">{noteName(m, flats)}</span>{/if}
    </button>
  {/each}
</div>
{#if manual}
  <button class="ped" class:down={pedal.held} aria-label={i18n.t('pedalKey')} aria-pressed={pedal.held} title={i18n.t('pedalKey')}
    onpointerdown={(e) => { e.preventDefault(); (e.currentTarget as Element).setPointerCapture?.(e.pointerId); pedal.press(); }}
    onpointerup={() => pedal.lift()} onpointercancel={() => pedal.lift()} oncontextmenu={(e) => e.preventDefault()}>
    <Icon name="pedal" size={20} sw={1.8} /><span>{i18n.t('pedalShort')}</span>
  </button>
{/if}
<div class="oct" role="group" aria-label={i18n.t('kbOctave')}>
  <button class="ob" onclick={() => playkeys.shift(1)} disabled={playkeys.octave >= 3} aria-label={i18n.t('octaveUp')} title="{i18n.t('octaveUp')} (PageUp)">
    <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1.5 6.5L6 2l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
  </button>
  <span class="ol ut-num">{noteName(48 + 12 * playkeys.octave, false)}</span>
  <button class="ob" onclick={() => playkeys.shift(-1)} disabled={playkeys.octave <= -3} aria-label={i18n.t('octaveDown')} title="{i18n.t('octaveDown')} (PageDown)">
    <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1.5 1.5L6 6l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
  </button>
</div>
</div>

<style>
  .wrap { position: relative; display: flex; gap: 10px; }
  .ped { position: static; flex: none; width: 58px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; border-radius: 6px; box-shadow: inset 0 0 0 1px var(--hair); background: var(--surface); color: var(--ink2); font: 800 11px/1 var(--f-sans); touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  .ped.down { background: var(--accent); color: var(--on); box-shadow: none; }
  .night .ped { border-radius: 0; box-shadow: inset 0 0 0 1px rgba(216, 180, 106, .35); background: #121015; color: var(--orn); font: 700 13px/1 var(--f-gar); }
  .night .ped.down { background: var(--accent); color: #F4EDE6; }
  .oct { flex: none; width: 58px; height: 100%; display: grid; grid-template-rows: 1fr auto 1fr; align-items: center; justify-items: center; border-radius: 6px; box-shadow: inset 0 0 0 1px var(--hair); background: var(--surface); }
  .ob { position: static; width: 100%; height: 100%; display: grid; place-items: center; place-content: center; color: var(--ink2); border-radius: 6px; }
  .ob:hover:not(:disabled) { color: var(--accent); background: var(--accentSoft); }
  .ob:disabled { opacity: .3; }
  .ol { font: 800 13px/1 var(--f-sans); color: var(--ink); letter-spacing: .02em; }
  .night .oct, .night .ob { border-radius: 0; }
  .night .oct { box-shadow: inset 0 0 0 1px rgba(216, 180, 106, .35); background: #121015; }
  .night .ol { font: 700 16px/1 var(--f-gar); color: var(--orn); }
  .keys { position: relative; user-select: none; touch-action: none; }
  button { position: absolute; top: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
  .w { height: 100%; padding-bottom: 5px; background: var(--ivory, #FFFFFF); border-radius: 4px; box-shadow: inset 0 0 0 .75px var(--hair); z-index: 1; }
  .night .w { background: #D9D2CD; border-radius: 0; box-shadow: inset 0 0 0 .75px rgba(11, 10, 14, .5); }
  .b { height: 60%; padding-bottom: 6px; justify-content: space-between; padding-top: 5px; background: #1C2030; border-radius: 0 0 3px 3px; z-index: 2; }
  .night .b { background: #0B0A0E; border-radius: 0; box-shadow: inset 0 0 0 1px rgba(216, 180, 106, .35); }
  .w.lit, .b.lit { background: var(--accent); }
  .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent2); margin-bottom: 4px; }
  .dot.tonic { width: 8px; height: 8px; background: var(--accent); }
  .night .dot { border-radius: 0; width: 5px; height: 7px; background: #8E7A5A; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
  .night .dot.tonic { width: 7px; height: 10px; background: var(--accent); }
  .w b { font: 900 10px/1 var(--f-sans); color: var(--ink2); }
  .night .w b { color: #3A3440; }
  .b b { font: 900 9.5px/1 var(--f-sans); color: #FFFFFF; }
  .night .b b { color: #C9C0BD; }
  .w.lit b, .b.lit b { color: var(--on); }
  .nn { font: 900 9px/1 var(--f-sans); color: var(--on); }
</style>
