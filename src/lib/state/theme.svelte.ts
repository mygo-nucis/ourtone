import { flushSync } from 'svelte';
import { engine } from '../audio/engine';
import { DAY, NIGHT } from '../art/palette';

export type Sky = 'day' | 'night';

/* the tab icon: the ledger line and its note, in each sky's materials */
const ICON_DAY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#2F86E8"/><rect x="13" y="22" width="38" height="3" rx="1.5" fill="#fff"/><ellipse cx="33" cy="36" rx="12" ry="8.4" fill="#fff" transform="rotate(-20 33 36)"/></svg>`;
const ICON_NIGHT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B0A0E"/><circle cx="32" cy="36" r="26" fill="#6E1422" opacity=".45"/><rect x="4.5" y="4.5" width="55" height="55" rx="10" fill="none" stroke="#D8B46A" stroke-width="1.4" opacity=".85"/><rect x="13" y="22.5" width="38" height="2.2" fill="#D8B46A"/><path d="M32 28.4L39.8 39.4 32 50.4 24.2 39.4Z" fill="#C4293E" stroke="#D8B46A" stroke-width="1.6"/></svg>`;
function initial(): Sky {
  try { const s = localStorage.getItem('ut-sky'); if (s === 'day' || s === 'night') return s; } catch { /* storage blocked */ }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
}

class Theme {
  sky = $state<Sky>(initial());
  get night() { return this.sky === 'night'; }
  get pal() { return this.sky === 'night' ? NIGHT : DAY; }
  set(s: Sky) {
    this.sky = s;
    try { localStorage.setItem('ut-sky', s); } catch { /* storage blocked */ }
    this.apply();
  }
  /* the change of sky is the site's signature moment: night falls from the top like dusk, day rises from below like
     dawn (a View Transition: the new sky is revealed under a soft slanted edge, live, over a still of the old one).
     without View Transitions it changes at once; with reduced motion it crossfades. */
  toggle() {
    const to: Sky = this.night ? 'day' : 'night';
    const doc = document as Document & { startViewTransition?: (cb: () => Promise<void>) => { finished: Promise<void> } };
    if (!doc.startViewTransition || this.sweeping) { this.set(to); return; }
    const root = document.documentElement;
    root.dataset.sweep = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'fade' : to === 'night' ? 'dusk' : 'dawn';
    this.sweeping = true;
    const t = doc.startViewTransition(async () => {
      this.set(to);
      flushSync();
      // the other sky's faces may still be loading (frames are held meanwhile, so canvases repaint once it runs live)
      await Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise(r => setTimeout(r, 250))]);
    });
    t.finished.finally(() => { delete root.dataset.sweep; this.sweeping = false; });
  }
  private sweeping = false;
  apply() {
    const root = document.documentElement;
    root.dataset.sky = this.night ? 'night' : 'day';
    root.style.colorScheme = this.night ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', this.night ? '#0B0A0E' : '#F6F8FB');
    let icon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.append(icon); }
    icon.href = 'data:image/svg+xml,' + encodeURIComponent(this.night ? ICON_NIGHT : ICON_DAY);
    engine.setNight(this.night);
  }
}
export const theme = new Theme();
