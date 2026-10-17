/* the studio's code downloads apart from the stage's: a first visit waits only for what the stage needs, and the
   studio follows once the first song is in (or at once, if the studio is opened first) */
let room: Promise<typeof import('./Studio.svelte')> | undefined;
let bar: Promise<typeof import('./StudioBar.svelte')> | undefined;
export const studioRoom = () => room ??= import('./Studio.svelte');
export const studioBar = () => bar ??= import('./StudioBar.svelte');
export function preloadStudio() { void studioRoom(); void studioBar(); }
