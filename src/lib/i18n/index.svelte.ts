import { STRINGS, type StringKey } from './strings';
import type { Lang, L10n } from '../music/types';

/** a language picked in the menu wins; otherwise Chinese for a browser that reads any Chinese, English for the rest.
    index.html makes the same choice before the first paint, for the page's lang. until version 31 every visit saved its
    language, so anyone who came before keeps the one they had */
const KEY = 'ut-lang';
function initial(): Lang {
  try { const s = localStorage.getItem(KEY); if (s === 'zh' || s === 'en') return s; } catch { /* storage blocked */ }
  const langs = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  return langs.some(l => /^zh\b/i.test(l ?? '')) ? 'zh' : 'en';
}

class I18n {
  lang = $state<Lang>(initial());
  /** a choice from the menu, remembered */
  set(l: Lang) {
    this.lang = l;
    try { localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
    this.apply();
  }
  /** the page's lang follows, without remembering a language the browser chose */
  apply() { document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en'; }
  t(key: StringKey, vars?: Record<string, string | number>): string {
    const v = STRINGS[key][this.lang];
    let s = Array.isArray(v) ? v.join(' ') : (v as string);
    if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, String(vars[k]));
    return s;
  }
  list(key: StringKey): readonly string[] { const v = STRINGS[key][this.lang]; return Array.isArray(v) ? v : [v as string]; }
  pick(x: L10n) { return x[this.lang]; }
}
export const i18n = new I18n();
