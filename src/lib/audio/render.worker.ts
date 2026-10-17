/// <reference lib="webworker" />
/* renders note buffers off the main thread:
   pluck — Karplus-Strong strings (guitars, bass, harp, pizzicato)
   piano — additive strings with inharmonic partials, two-stage decay, hammer comb and a felt thump */
import { pluck, piano, type Job } from './dsp';
export type { PluckParams, PianoParams, Job, JobIn } from './dsp';

self.onmessage = (e: MessageEvent<Job>) => {
  const j = e.data;
  const res = j.kind === 'pluck' ? pluck(j.sr, j.pitch, j.p) : piano(j.sr, j.pitch, j.p);
  (self as unknown as Worker).postMessage({ id: j.id, data: res.data, rate: res.rate }, [res.data.buffer]);
};
