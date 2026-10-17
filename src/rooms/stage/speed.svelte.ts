import { clamp } from '../../lib/util';
import { app } from '../../lib/state/app.svelte';
import { BUILTIN } from '../../lib/music/library';

/* how fast notes fall: six levels, each a length of music visible above the hit line. each level shows about 1.31 times
   less than the one below it, so the steps feel even. every level was later made 1.2 times faster (v45). */
export const SPANS = [4.9, 3.72, 2.87, 2.19, 1.66, 1.27].map(s => s / 1.2);
export const TOP = SPANS.length - 1;

/* a phone held sideways shows the highway only a few centimetres tall. notes cross the same share of its screen in the
   same time as on a monitor, but through about half the angle of view at arm's length, and look slow: there each level
   runs 1.5 times faster. (the eye partly judges speed against the screen itself, so not the whole difference.) */
const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
export const PHONE_FASTER = 1.5;
/** a level's span on this screen (compact: the stage's phone layout) */
export const spanAt = (level: number, compact: boolean) => SPANS[level] / (compact && coarse() ? PHONE_FASTER : 1);

/* one speed for every song once the player picks one, and then theirs everywhere. until then each song starts at its
   own default: the fifth level, or the one its listing gives (`SongMeta.speed`; a copy goes by its original). (it used
   to be a default per song, from its tempo or set by hand, with the player's change kept as an offset from it; a saved
   offset now counts from the fifth level, and a choice of the sixth stays the sixth) */
export const DEFAULT_LEVEL = 4;
const KEY = 'ut-speed-level';

/** the player's own level, or null while they have never picked one */
function load(): number | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null && Number.isFinite(Number(v))) return clamp(Math.round(Number(v)), 0, TOP);
    if (localStorage.getItem('ut-speed-top') === '1') return TOP;
    const off = localStorage.getItem('ut-speed');
    if (off === null || !Number.isFinite(Number(off))) return null;
    return clamp(DEFAULT_LEVEL + Math.round(Number(off)), 0, TOP - 1);
  } catch { return null; }
}
/** the open song's own default level */
function songLevel() {
  const m = app.meta, own = m?.from ? BUILTIN.find(b => b.id === m.from) : m;
  return own?.speed ? clamp(own.speed - 1, 0, TOP) : DEFAULT_LEVEL;
}

class Speed {
  private chosen = $state<number | null>(load());
  /** the level the open song plays at (0 slowest .. TOP fastest) */
  get level() { return this.chosen ?? songLevel(); }
  set(level: number) {
    this.chosen = clamp(Math.round(level), 0, TOP);
    try { localStorage.setItem(KEY, String(this.chosen)); localStorage.removeItem('ut-speed'); localStorage.removeItem('ut-speed-top'); } catch { /* storage blocked */ }
  }
  nudge(d: number) { this.set(this.level + d); }
}
export const speed = new Speed();
