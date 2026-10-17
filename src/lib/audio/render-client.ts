import { pluck, piano, type Job, type JobIn } from './dsp';
import type { Renderer } from './voices';
import RenderWorker from './render.worker?worker&inline';

/* a small pool of workers renders note buffers without blocking the page.
   if workers are unavailable (a strict sandbox) or go quiet, rendering falls back to the page itself. */
export function workerRenderer(): Renderer {
  const inline = (job: JobIn) => job.kind === 'pluck' ? pluck(job.sr, job.pitch, job.p) : piano(job.sr, job.pitch, job.p);
  const pool: Worker[] = [];
  const waiting = new Map<number, { job: JobIn; res: (r: { data: Float32Array; rate: number }) => void }>();
  let next = 1, rr = 0, healthy = true, answered = false;
  const fail = () => {
    if (!healthy) return;
    healthy = false;
    pool.forEach(w => w.terminate());
    // finish whatever was in flight on the page, a few at a time so it stays responsive
    const left = [...waiting.values()];
    waiting.clear();
    const step = () => { const batch = left.splice(0, 4); batch.forEach(w => w.res(inline(w.job))); if (left.length) setTimeout(step, 0); };
    step();
  };
  try {
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new RenderWorker();
      w.onmessage = (e: MessageEvent<{ id: number; data: Float32Array; rate: number }>) => { answered = true; const f = waiting.get(e.data.id); waiting.delete(e.data.id); f?.res(e.data); };
      w.onerror = fail;
      pool.push(w);
    }
  } catch { healthy = false; }
  return job => new Promise(res => {
    if (!healthy) { setTimeout(() => res(inline(job)), 0); return; }
    const id = next++;
    waiting.set(id, { job, res });
    pool[(rr++) % pool.length].postMessage({ ...job, id } as Job);
    if (!answered) setTimeout(() => { if (!answered) fail(); }, 3000);
  });
}
