/* play mode's choices, kept on this device and the same for every song: the song playing exactly as written whatever
   the player presses (rather than following the presses), quick runs and rolled chords made one press (off until
   the player turns it on), a sound of its own on a hit (off, or one of three: the tap stays for a press with nothing to hit), and multi-track parts
   each kept to a band of lanes (rather than all of them spread over the six) */
const read = (k: string, dflt: boolean) => { try { const v = localStorage.getItem(k); return v === null ? dflt : v === '1'; } catch { return dflt; } };
const readN = (k: string, dflt: number, max: number) => { try { const v = Math.round(Number(localStorage.getItem(k) ?? dflt)); return v >= 0 && v <= max ? v : dflt; } catch { return dflt; } };
const readV = (k: string, dflt: number) => { try { const s = localStorage.getItem(k), v = s === null ? NaN : Number(s); return v >= 0 && v <= 1 ? v : dflt; } catch { return dflt; } };
const save = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* no storage */ } };

class PlayOpts {
  exact = $state(read('ut-play-exact', false));
  simplify = $state(read('ut-play-simplify', false));
  /** 0 off, 1-3 which hit sound */
  hitSound = $state(readN('ut-play-hitsound', 0, 3));
  /** their volume, 0-1 (the middle as hitsounds.ts sets them; it starts above that) */
  hitVol = $state(readV('ut-play-hitvol', .75));
  split = $state(read('ut-multi-split', false));
  setExact(v: boolean) { this.exact = v; save('ut-play-exact', v); }
  setSimplify(v: boolean) { this.simplify = v; save('ut-play-simplify', v); }
  setHitVol(v: number) { this.hitVol = v; try { localStorage.setItem('ut-play-hitvol', v.toFixed(3)); } catch { /* no storage */ } }
  setHitSound(v: number) { this.hitSound = v; try { localStorage.setItem('ut-play-hitsound', String(v)); } catch { /* no storage */ } }
  setSplit(v: boolean) { this.split = v; save('ut-multi-split', v); }
}
export const playopts = new PlayOpts();
