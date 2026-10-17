import { studio } from '../../lib/project/studio.svelte';
import { transport } from '../../lib/audio/transport.svelte';
import { engine } from '../../lib/audio/engine';

/* transport actions shared by the studio's top bar and its keyboard shortcuts */
export async function playPause() {
  await engine.unlock();
  if (transport.playing && studio.recording) studio.stopRecording();
  transport.toggle();
}
/** back to the start of the selection, or of the song */
export function toStart() {
  const r = studio.range, s = transport.song;
  transport.seek(r && s && transport.now() > s.tl.sec(r.a) + .05 ? s.tl.sec(r.a) : 0);
}
/** to the end of the song */
export function toEnd() { const s = transport.song; if (s) transport.seek(s.duration); }
export async function toggleRecord() {
  await engine.unlock();
  if (studio.recording) studio.stopRecording(); else studio.startRecording();
}
/** loop the selection; with nothing selected, the four bars under the playhead */
export function toggleLoop() {
  const s = transport.song, r = studio.range, g = studio.grid;
  if (!s || !g) return;
  if (transport.loopOn) { transport.setLoop(transport.loop, false); return; }
  if (r) transport.setLoop({ a: s.tl.sec(r.a), b: s.tl.sec(r.b) }, true);
  else if (transport.loop) transport.setLoop(transport.loop, true);
  else { const b = Math.floor(g.barAt(s.tl.tick(transport.now())) / 4) * 4; transport.setLoop({ a: s.tl.sec(g.tickOf(b)), b: s.tl.sec(g.tickOf(b + 4)) }, true); }
}
