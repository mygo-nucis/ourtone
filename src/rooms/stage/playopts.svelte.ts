/* play mode's choices, kept on this device and the same for every song: the song playing exactly as written whatever
   the player presses (rather than following the presses), and quick runs and rolled chords made one press (off until
   the player turns it on) */
const read = (k: string, dflt: boolean) => { try { const v = localStorage.getItem(k); return v === null ? dflt : v === '1'; } catch { return dflt; } };
const save = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* no storage */ } };

class PlayOpts {
  exact = $state(read('ut-play-exact', false));
  simplify = $state(read('ut-play-simplify', false));
  setExact(v: boolean) { this.exact = v; save('ut-play-exact', v); }
  setSimplify(v: boolean) { this.simplify = v; save('ut-play-simplify', v); }
}
export const playopts = new PlayOpts();
