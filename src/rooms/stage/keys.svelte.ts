import { LANE_KEYS } from './chart';

/* play mode's six keys: S D F J K L unless the player has chosen others. they are kept as physical keys (KeyboardEvent
   code), so a keyboard layout's letters don't move them. only letters, digits and the plain punctuation keys can be
   taken: Space, Esc, the arrows and [ ] keep their own jobs. */
const OK = /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Semicolon|Quote|Comma|Period|Slash|Backslash|Minus|Equal|Backquote)$/;
const SIGN: Record<string, string> = { Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`' };
export const keyLabel = (code: string) =>
  code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : SIGN[code] ?? code;

function load(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem('ut-keys') ?? 'null');
    if (Array.isArray(v) && v.length === LANE_KEYS.length && v.every(c => typeof c === 'string' && OK.test(c)) && new Set(v).size === v.length) return v;
  } catch { /* storage blocked, or nothing saved */ }
  return [...LANE_KEYS];
}

class Keys {
  codes = $state(load());
  /** the lane a key plays, or -1 */
  lane(code: string) { return this.codes.indexOf(code); }
  label(l: number) { return keyLabel(this.codes[l]); }
  get custom() { return this.codes.some((c, i) => c !== LANE_KEYS[i]); }
  can(code: string) { return OK.test(code); }
  /** gives lane l the key; a lane that had it takes l's old one, so the six stay distinct */
  set(l: number, code: string) {
    const c = [...this.codes], o = c.indexOf(code);
    if (o >= 0) c[o] = c[l];
    c[l] = code;
    this.codes = c; this.save();
  }
  reset() { this.codes = [...LANE_KEYS]; this.save(); }
  private save() {
    try { if (this.custom) localStorage.setItem('ut-keys', JSON.stringify(this.codes)); else localStorage.removeItem('ut-keys'); } catch { /* storage blocked */ }
  }
}
export const keys = new Keys();
