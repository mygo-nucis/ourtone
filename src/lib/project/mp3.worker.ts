import { Mp3Encoder } from '@breezystack/lamejs';

/* MP3 encoding off the page: receives the rendered left and right channels, answers with progress and the file */
const s16 = (v: number) => { const x = Math.max(-1, Math.min(1, v)); return x < 0 ? x * 32768 : x * 32767; };
onmessage = (e: MessageEvent<{ l: Float32Array; r: Float32Array; sr: number; kbps: number }>) => {
  const { l, r, sr, kbps } = e.data;
  const enc = new Mp3Encoder(2, sr, kbps), block = 1152 * 16, out: Uint8Array[] = [];
  const L = new Int16Array(block), R = new Int16Array(block);
  let size = 0, k = 0;
  for (let i = 0; i < l.length; i += block, k++) {
    const n = Math.min(block, l.length - i);
    for (let j = 0; j < n; j++) { L[j] = s16(l[i + j]); R[j] = s16(r[i + j]); }
    const b = enc.encodeBuffer(L.subarray(0, n), R.subarray(0, n));
    if (b.length) { out.push(b.slice()); size += b.length; }
    if (k % 12 === 0) postMessage({ progress: i / l.length });
  }
  const end = enc.flush();
  if (end.length) { out.push(end.slice()); size += end.length; }
  const bytes = new Uint8Array(size);
  let o = 0;
  for (const b of out) { bytes.set(b, o); o += b.length; }
  postMessage({ done: bytes }, [bytes.buffer]);
};
