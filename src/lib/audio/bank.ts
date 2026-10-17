import { engine } from './engine';
import { getAudio, saveAudio, deleteAudio, audioIds } from '../state/db';

/* the audio of audio tracks: recordings and imported files. each is stored once, by id, as encoded bytes (a WAV for a
   recording, the file itself for an import) and decoded when a song needs it. clips on the timeline only point at them.
   peaks (a low-resolution min/max outline) are made on demand for drawing waveforms. */
export const PEAK_RATE = 200;
const newAudioId = () => 'aud-' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36).padStart(3, '0');

/** a mono 16-bit WAV of a take */
export function wavMono(data: Float32Array, sr: number): ArrayBuffer {
  const out = new ArrayBuffer(44 + data.length * 2), v = new DataView(out);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, data.length * 2, true);
  for (let i = 0, o = 44; i < data.length; i++, o += 2) { const x = Math.max(-1, Math.min(1, data[i])); v.setInt16(o, x < 0 ? x * 32768 : x * 32767, true); }
  return out;
}

class Bank {
  /** told when a buffer arrives, so waveforms redraw */
  private listeners = new Set<() => void>();
  onChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private peakCache = new Map<string, Float32Array>();

  get(id: string) { return this.buffers.get(id) ?? null; }
  /** a decoded buffer from memory, or from the browser's storage */
  load(id: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(id);
    if (have) return Promise.resolve(have);
    let p = this.loading.get(id);
    if (!p) {
      p = (async () => {
        const x = await getAudio(id);
        if (!x) return null;
        try {
          const buf = await engine.get().decodeAudioData(x.bytes.slice(0));
          this.put(id, buf);
          return buf;
        } catch (e) { console.warn('audio', id, e); return null; }
      })();
      this.loading.set(id, p);
      void p.finally(() => this.loading.delete(id));
    }
    return p;
  }
  loadAll(ids: Iterable<string>) { return Promise.all([...new Set(ids)].map(id => this.load(id))); }
  /** keep a decoded buffer under an id (also how tests hand buffers in) */
  put(id: string, buf: AudioBuffer) { this.buffers.set(id, buf); this.peakCache.delete(id); this.listeners.forEach(f => f()); }
  /** an audio file: decoded first (so a file the browser cannot read is refused), then kept */
  async addFile(file: File): Promise<{ id: string; buffer: AudioBuffer } | null> {
    const bytes = await file.arrayBuffer();
    let buffer: AudioBuffer;
    try { buffer = await engine.get().decodeAudioData(bytes.slice(0)); } catch { return null; }
    const id = newAudioId();
    this.put(id, buffer);
    await saveAudio({ id, bytes, type: file.type || 'audio/mpeg', name: file.name, created: Date.now() });
    return { id, buffer };
  }
  /** a take from the microphone */
  async addTake(data: Float32Array, sr: number, name: string): Promise<{ id: string; buffer: AudioBuffer }> {
    const id = newAudioId(), ctx = engine.get();
    const buffer = ctx.createBuffer(1, Math.max(1, data.length), sr);
    buffer.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    this.put(id, buffer);
    await saveAudio({ id, bytes: wavMono(data, sr), type: 'audio/wav', name, created: Date.now() });
    return { id, buffer };
  }
  /** min and max pairs, PEAK_RATE a second, over all channels */
  peaks(id: string): Float32Array | null {
    const got = this.peakCache.get(id);
    if (got) return got;
    const b = this.buffers.get(id);
    if (!b) return null;
    const per = Math.max(1, Math.round(b.sampleRate / PEAK_RATE)), n = Math.ceil(b.length / per), out = new Float32Array(n * 2);
    const chs = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c));
    for (let k = 0; k < n; k++) {
      let lo = 0, hi = 0;
      const a = k * per, e = Math.min(b.length, a + per);
      for (const d of chs) for (let i = a; i < e; i++) { const x = d[i]; if (x < lo) lo = x; else if (x > hi) hi = x; }
      out[k * 2] = lo; out[k * 2 + 1] = hi;
    }
    this.peakCache.set(id, out);
    return out;
  }
  /** forget audio no song uses any more (at start, when no undo can bring it back) */
  async prune(keep: Set<string>) {
    const all = await audioIds();
    for (const id of all) if (!keep.has(id)) { this.buffers.delete(id); this.peakCache.delete(id); await deleteAudio(id); }
  }
}
export const bank = new Bank();
