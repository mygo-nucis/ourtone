import { transport } from '../../lib/audio/transport.svelte';
import { engine } from '../../lib/audio/engine';
import { studio, isDrums } from '../../lib/project/studio.svelte';
import { pedal, landed, type Held } from './pedal.svelte';

/* the computer keyboard as a piano, fixed whatever the song's key: white keys on the Z and Q rows, black keys on the
   A and number rows, each where it sits on a real keyboard (S between Z and X is C♯). Z is C3 and Q is C4, so the
   rows overlap for a few notes; on a drum part Z is C2, the kick. PageDown / PageUp shift the octave */
export const PIANO: Record<string, number> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23,
  KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28, BracketLeft: 29, Equal: 30, BracketRight: 31
};
export const KEY_LABEL: Record<string, string> = {
  KeyZ: 'Z', KeyS: 'S', KeyX: 'X', KeyD: 'D', KeyC: 'C', KeyV: 'V', KeyG: 'G', KeyB: 'B', KeyH: 'H', KeyN: 'N', KeyJ: 'J', KeyM: 'M',
  Comma: ',', KeyL: 'L', Period: '.', Semicolon: ';', Slash: '/',
  KeyQ: 'Q', Digit2: '2', KeyW: 'W', Digit3: '3', KeyE: 'E', KeyR: 'R', Digit5: '5', KeyT: 'T', Digit6: '6', KeyY: 'Y', Digit7: '7', KeyU: 'U',
  KeyI: 'I', Digit9: '9', KeyO: 'O', Digit0: '0', KeyP: 'P', BracketLeft: '[', Equal: '=', BracketRight: ']'
};
/** the keys to show on an on-screen keyboard: the lower row's first octave, then the upper row */
export const LABEL_CODES = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM',
  'KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU', 'KeyI', 'Digit9', 'KeyO', 'Digit0', 'KeyP', 'BracketLeft', 'Equal', 'BracketRight'];

class PlayKeys {
  octave = $state(0);
  /** pitches held on the computer keyboard, for on-screen keyboards */
  down = $state.raw<ReadonlySet<number>>(new Set());
  private held = new Map<string, Held & { pitch: number }>();

  base() {
    const m = studio.doc?.parts[studio.part]?.meta;
    return (m && isDrums(m) ? 36 : 48) + 12 * this.octave;
  }
  pitchOf(code: string) {
    const k = PIANO[code];
    return k === undefined ? null : Math.max(0, Math.min(127, this.base() + k));
  }
  async press(code: string, vel = 100) {
    if (this.held.has(code)) return;
    const pitch = this.pitchOf(code);
    if (pitch === null) return;
    const h: Held & { pitch: number } = { voice: null, pitch, up: false };
    this.held.set(code, h);
    this.down = new Set([...this.down, pitch]);
    // record first (the note shows at once), then sound once audio is allowed and the note is rendered; a key tapped
    // and let go before then still sounds, briefly. the pedal's note of this pitch ends first
    pedal.strike(pitch);
    studio.recOn(pitch, vel);
    await Promise.all([engine.unlock(), transport.prepareNotes(studio.part, [pitch])]);
    landed(h, transport.noteOn(studio.part, pitch, vel));
  }
  release(code: string) {
    const h = this.held.get(code);
    if (!h) return;
    this.held.delete(code);
    const d = new Set(this.down); d.delete(h.pitch); this.down = d;
    pedal.letGo(h.pitch, h, () => studio.recOff(h.pitch));
  }
  releaseAll() { [...this.held.keys()].forEach(k => this.release(k)); }
  shift(d: number) { this.releaseAll(); this.octave = Math.max(-3, Math.min(3, this.octave + d)); }
}
export const playkeys = new PlayKeys();

/** how far below the part's median pitch its home tonic sits (used by the stage and the piano roll's numbers) */
export function homeOf(p: { n: number; pitch: ArrayLike<number> }, tonic: number) {
  if (!p.n) return 60 - (((60 - tonic) % 12) + 12) % 12;
  const ps = Array.from(p.pitch).sort((a, b) => a - b), med = ps[Math.floor(ps.length / 2)];
  return med - (((med - tonic) % 12) + 12) % 12;
}

/** the pitches Studio's keyboards reach at an octave: the Sound view's on-screen keys (which hold the computer keys') */
export const keyRange = (octave: number) => ({ lo: 47 + 12 * octave, hi: 83 + 12 * octave });
