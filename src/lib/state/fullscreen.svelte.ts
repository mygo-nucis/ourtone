/* phones: held sideways, the browser's own bars take a third of the screen, so the turn-your-phone screen and the ⋯
   menu offer full screen (a page may only ask from inside a tap), which also turns the screen to landscape. it is never
   asked for on its own: a first tap that did it also landed on the stage, which still had the smaller size (a window
   opened into play mode laid out for it). iPhones give pages no full screen. Add to Home Screen still
   opens the site without the browser's bars (the web app manifest, public/manifest.webmanifest), but it is no longer
   suggested: play mode drops frames in the home-screen app and runs smoothly in Safari */
class Fullscreen {
  on = $state(false);
  /** a touch screen whose browser lets a page fill it */
  readonly can = typeof document !== 'undefined' && !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen && matchMedia('(pointer: coarse)').matches;
  constructor() {
    if (!this.can) return;
    document.addEventListener('fullscreenchange', () => { this.on = !!document.fullscreenElement; });
  }
  async enter() {
    if (document.fullscreenElement) return true;
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { return false; }
    try { await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'); } catch { /* not every browser turns the screen */ }
    return true;
  }
}
export const fullscreen = new Fullscreen();
