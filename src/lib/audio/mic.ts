import { PEAK_RATE } from './bank';

/* the microphone, for audio tracks. a worklet taps the input and hands its samples over with the audio clock's frame
   numbers, so a take can be placed in the song to the sample (MediaRecorder starts late by an unknown amount).
   nothing is played back while recording: no monitoring, so no feedback through the speakers. */
const TAP = `class Tap extends AudioWorkletProcessor {
  constructor() {
    super(); this.buf = new Float32Array(2048); this.n = 0; this.first = -1; this.on = true;
    this.port.onmessage = e => { if (e.data === 'stop') { this.flush(); this.on = false; this.port.postMessage({ end: true }); } };
  }
  flush() { if (this.n) { this.port.postMessage({ frame: this.first, data: this.buf.slice(0, this.n) }); this.n = 0; this.first = -1; } }
  process(inputs) {
    if (!this.on) return false;
    const inp = inputs[0];
    if (inp && inp.length) {
      const len = inp[0].length, k = inp.length;
      for (let i = 0; i < len; i++) {
        let x = 0; for (let c = 0; c < k; c++) x += inp[c][i];
        if (this.first < 0) this.first = currentFrame + i;
        this.buf[this.n++] = x / k;
        if (this.n === this.buf.length) this.flush();
      }
    }
    return true;
  }
}
registerProcessor('ut-tap', Tap);`;

const ready = new WeakSet<BaseAudioContext>();
/** load the tap: from a blob URL, or (where a page's origin is opaque, like a file opened from disk) a data URL */
async function ensureTap(ctx: AudioContext) {
  if (ready.has(ctx)) return;
  try { await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([TAP], { type: 'text/javascript' }))); }
  catch { await ctx.audioWorklet.addModule('data:text/javascript;charset=utf-8,' + encodeURIComponent(TAP)); }
  ready.add(ctx);
}

/** why the microphone could not be opened: refused (by the viewer or the page's host) or not there at all */
export type MicError = 'denied' | 'missing';
export function micError(e: unknown): MicError {
  const name = (e as { name?: string })?.name ?? '';
  return name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError' ? 'missing' : 'denied';
}

export class MicTake {
  private chunks: { frame: number; data: Float32Array }[] = [];
  private peakAcc: number[] = [];
  private pk = { lo: 0, hi: 0, n: 0 };
  private ended: (() => void) | null = null;
  readonly sr: number;
  private constructor(private ctx: AudioContext, private stream: MediaStream, private src: MediaStreamAudioSourceNode, private node: AudioWorkletNode, private sink: GainNode) {
    this.sr = ctx.sampleRate;
  }
  /** ask for the microphone and start listening (raw: no echo cancelling, noise suppression or gain riding) */
  static async open(ctx: AudioContext): Promise<MicTake> {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no microphone API'), { name: 'NotAllowedError' });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    try { await ensureTap(ctx); } catch (e) { stream.getTracks().forEach(t => t.stop()); throw e; }
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'ut-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const sink = ctx.createGain(); sink.gain.value = 0;
    src.connect(node).connect(sink).connect(ctx.destination);
    const take = new MicTake(ctx, stream, src, node, sink);
    node.port.onmessage = e => take.onMessage(e.data);
    return take;
  }
  private onMessage(m: { frame?: number; data?: Float32Array; end?: boolean }) {
    if (m.end) { this.ended?.(); return; }
    if (!m.data || m.frame === undefined) return;
    this.chunks.push({ frame: m.frame, data: m.data });
    // a running outline for drawing the take as it grows
    const per = Math.max(1, Math.round(this.sr / PEAK_RATE)), p = this.pk;
    for (const x of m.data) { if (x < p.lo) p.lo = x; else if (x > p.hi) p.hi = x; if (++p.n >= per) { this.peakAcc.push(p.lo, p.hi); p.lo = 0; p.hi = 0; p.n = 0; } }
  }
  /** the audio-clock time of the take's first sample, once there is one */
  get startTime() { return this.chunks.length ? this.chunks[0].frame / this.sr : null; }
  get seconds() { return this.peakAcc.length / 2 / PEAK_RATE; }
  get peaks() { return Float32Array.from(this.peakAcc); }
  /** how late the take is against the music that was heard: the input's latency plus the output's */
  latency() {
    const tr = this.stream.getAudioTracks()[0], inLat = (tr?.getSettings() as { latency?: number } | undefined)?.latency ?? .01;
    return inLat + (this.ctx.outputLatency || this.ctx.baseLatency || 0);
  }
  /** stop listening and hand back the take as one mono run (gaps, if the input ever skipped, are silence) */
  async stop(): Promise<{ data: Float32Array; start: number; sr: number } | null> {
    await new Promise<void>(res => { this.ended = res; this.node.port.postMessage('stop'); setTimeout(res, 400); });
    try { this.src.disconnect(); this.node.disconnect(); this.sink.disconnect(); } catch { /* already gone */ }
    this.stream.getTracks().forEach(t => t.stop());
    if (!this.chunks.length) return null;
    const first = this.chunks[0].frame, last = this.chunks[this.chunks.length - 1], len = last.frame + last.data.length - first;
    const data = new Float32Array(len);
    for (const c of this.chunks) data.set(c.data, c.frame - first);
    return { data, start: first / this.sr, sr: this.sr };
  }
  /** give up the take (the song changed, or recording was abandoned) */
  cancel() { void this.stop(); this.chunks = []; }
}
