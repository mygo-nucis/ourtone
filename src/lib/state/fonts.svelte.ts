/* web fonts arrive after first paint; anything that measures text redraws when they do */
class Fonts {
  ready = $state(false);
  version = $state(0);
  constructor() {
    if (typeof document === 'undefined' || !document.fonts) { this.ready = true; return; }
    document.fonts.ready.then(() => { this.ready = true; this.version++; });
    document.fonts.addEventListener?.('loadingdone', () => { this.version++; });
  }
}
export const fonts = new Fonts();
