import { studio } from '../../lib/project/studio.svelte';
import { transport } from '../../lib/audio/transport.svelte';
import { mixOf } from '../../lib/audio/strip';
import { macrosOf, type Macros } from '../../lib/audio/fx';
import { PRESETS } from '../../lib/audio/presets';
import type { StringKey } from '../../lib/i18n/strings';

/* the five macro knobs, shared by the inspector and the sound view. space is the reverb and delay sends;
   the others are offsets laid over the effects chain (see fx.ts) */
export type MacroKey = keyof Macros | 'space';
export const MACROS: { k: MacroKey; label: StringKey; hint: StringKey }[] = [
  { k: 'bright', label: 'macroBright', hint: 'macroBrightHint' }, { k: 'body', label: 'macroBody', hint: 'macroBodyHint' }, { k: 'attack', label: 'macroAttack', hint: 'macroAttackHint' },
  { k: 'space', label: 'macroSpace', hint: 'macroSpaceHint' }, { k: 'grain', label: 'macroGrain', hint: 'macroGrainHint' }
];
export function macroValue(k: MacroKey) {
  void studio.rev;
  const p = transport.song?.parts[studio.part];
  if (!p) return 0;
  if (k === 'space') return Math.min(1, mixOf(p).rev / .75);
  return macrosOf(p.data.macro)[k];
}
export function macroDef(k: MacroKey) {
  const p = transport.song?.parts[studio.part];
  if (k === 'space') return Math.min(1, (PRESETS[p?.data.preset ?? 'piano']?.send ?? .2) / .75);
  return k === 'bright' || k === 'attack' ? .5 : 0;
}
export function setMacro(k: MacroKey, v: number, key: string) {
  const i = studio.part, p = transport.song?.parts[i];
  if (!p) return;
  if (k === 'space') { studio.setMix('opMacro', i, { rev: +(v * .75).toFixed(3), dly: +Math.max(0, (v - .6) * .5).toFixed(3) }, key); return; }
  studio.setPart('opMacro', i, { macro: { ...macrosOf(p.data.macro), [k]: +v.toFixed(3) } }, key);
}
