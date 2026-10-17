import { app, newSongId } from '../state/app.svelte';
import { engine } from '../audio/engine';
import type { L10n } from '../music/types';
import { generate, newSeed } from './generate';
import type { StyleId } from './styles';

/* the generator panel's state: the choices, the seed, and the last song it made (a re-roll replaces that song while
   nobody has edited it, so trying seeds does not fill the library) */
class GenPanel {
  open = $state(false);
  style = $state<StyleId>('citypop');
  length = $state<'short' | 'full'>('full');
  tonic = $state<number | null>(null);
  bpm = $state<number | null>(null);
  seed = $state(newSeed());
  last = $state<{ id: string; title: L10n } | null>(null);
  busy = $state(false);

  show() { this.open = true; }
  close() { this.open = false; this.last = null; }
  async make(replace = false) {
    if (this.busy) return;
    this.busy = true;
    try {
      await engine.unlock();
      const prev = this.last;
      const data = generate({ style: this.style, seed: this.seed, length: this.length, tonic: this.tonic ?? undefined, bpm: this.bpm ?? undefined }, newSongId());
      await app.addSong(data, true);
      if (replace && prev && app.untouched(prev.id)) await app.remove(prev.id, false);
      this.last = { id: data.id, title: data.title };
    } finally { this.busy = false; }
  }
  /** a new seed, and a new song in place of the last one */
  reroll() { this.seed = newSeed(); return this.make(true); }
}
export const gen = new GenPanel();
