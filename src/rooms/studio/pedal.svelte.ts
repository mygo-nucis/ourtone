import { transport } from '../../lib/audio/transport.svelte';
import { engine } from '../../lib/audio/engine';
import { patchOf } from '../../lib/audio/presets';
import type { Voice } from '../../lib/audio/voices';
import { studio } from '../../lib/project/studio.svelte';

/* the sustain pedal, for what is played on Studio's keyboards (the song's own parts never hear it). on (always down: the
   default, so a phone or a player new to the piano gets notes that ring out naturally); off; or manual, where Space is the pedal (Shift+Space still records) and a phone has a pedal key to hold.
   a key let go while it is down keeps sounding until it comes up, as on a piano: only on sounds that die away by
   themselves (strings plucked or struck, mallets, an electric piano, a synth pluck). an organ, a bowed or blown note or
   a pad would hold at full level for ever, so those, and the drums, ignore it. a key struck again cuts its own ringing
   note, no more than MAX ring at once, and a note that has died away is let go (an electric piano's oscillators would
   otherwise run on, silent, while the pedal stays down: always, when it is always on). a take records what was heard:
   a held note ends when the pedal lets it go */

export type PedalMode = 'off' | 'on' | 'manual';
/** a key's note: started (voice) once ready; let go (up); kept sounding by the pedal (ringing) */
export interface Held { voice: Voice | null; up: boolean; ringing?: boolean }
interface Ring { pitch: number; h: Held; after?: () => void; timer: number }
const STORE = 'ut-pedal', MAX = 48;
const MODES: PedalMode[] = ['off', 'on', 'manual'];

function stored(): PedalMode {
  try { const v = localStorage.getItem(STORE); return MODES.includes(v as PedalMode) ? v as PedalMode : 'on'; } catch { return 'on'; }
}

class Pedal {
  mode = $state<PedalMode>(stored());
  /** manual: Space, or the on-screen pedal, is down */
  held = $state(false);
  get down() { return this.mode === 'on' || (this.mode === 'manual' && this.held); }
  private ringing: Ring[] = [];

  setMode(m: PedalMode) {
    this.mode = m; this.held = false;
    try { localStorage.setItem(STORE, m); } catch { /* no storage */ }
    if (!this.down) this.lift();
  }
  press() { if (this.mode === 'manual') this.held = true; }
  /** the pedal comes up: everything it was holding stops */
  lift() {
    if (this.mode === 'manual') this.held = false;
    if (this.down) return;
    const all = this.ringing; this.ringing = [];
    all.forEach(r => this.stop(r));
  }
  /** how long the focused part's sound can ring on (s), or 0 when it does not take the pedal: an envelope falling to
      nothing is down 60 dB after ~7 time constants; a rendered string's buffer ends by itself */
  ringFor() {
    const sp = transport.song?.parts[studio.part];
    if (!sp || sp.audio) return 0;
    const p = patchOf(sp.data);
    if (p.kit !== undefined) return 0;
    if (p.amp) return p.amp.sus <= .05 ? Math.min(20, 7 * p.amp.tau + .5) : 0;
    return p.a ? (p.a.kind === 'pluck' ? p.a.p.maxLen : 7) : 0;
  }
  /** a key is struck: a note of the same pitch the pedal was holding stops first */
  strike(pitch: number) {
    const same = this.ringing.filter(r => r.pitch === pitch);
    if (!same.length) return;
    this.ringing = this.ringing.filter(r => r.pitch !== pitch);
    same.forEach(r => this.stop(r));
  }
  /** a key is let go: it stops now, or rings on while the pedal is down (`after` runs when it does stop) */
  letGo(pitch: number, h: Held, after?: () => void) {
    h.up = true;
    const ring = this.down ? this.ringFor() : 0;
    if (ring) {
      h.ringing = true;
      const r: Ring = { pitch, h, after, timer: 0 };
      r.timer = window.setTimeout(() => { this.ringing = this.ringing.filter(x => x !== r); this.stop(r); }, ring * 1000);
      this.ringing.push(r);
      while (this.ringing.length > MAX) this.stop(this.ringing.shift()!);
      return;
    }
    h.voice?.release((engine.ctx?.currentTime ?? 0) + .01);
    after?.();
  }
  private stop(r: Ring) {
    clearTimeout(r.timer);
    r.h.ringing = false;
    r.h.voice?.release((engine.ctx?.currentTime ?? 0) + .01);
    r.after?.();
  }
}
export const pedal = new Pedal();

/** a note that became ready after its key was let go: it sounds briefly, or rings on if the pedal took it */
export function landed(h: Held, v: Voice | null) {
  if (h.up && !h.ringing) v?.release((engine.ctx?.currentTime ?? 0) + .08);
  else h.voice = v;
}
