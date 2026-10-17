export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const smooth = (k: number) => k * k * (3 - 2 * k);
export const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

/** small deterministic generator, so art looks the same on every render */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

export function fmtTime(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** index of the first element >= x in a sorted array */
export function lowerBound(arr: ArrayLike<number>, x: number) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
  return lo;
}

export const mod = (a: number, n: number) => ((a % n) + n) % n;

/* Chrome on Android asks for the microphone whenever a file picker accepts an audio type (.mid counts: it reads as
   audio/midi), to offer recording a sound in its place. given the generic type instead its picker asks nothing and
   opens on every file; what is picked is checked when it is read either way */
const ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
/** the audio files the site can read */
export const AUDIO_ACCEPT = ANDROID ? 'application/octet-stream' : 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm';
/** MIDI files */
export const MIDI_ACCEPT = ANDROID ? 'application/octet-stream' : '.mid,.midi,audio/midi,audio/x-midi';
export const isAudioFile = (f: File) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm)$/i.test(f.name);
/** ask for a file with the browser's own picker (call it from a click) */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => res(inp.files?.[0] ?? null);
    inp.click();
  });
}
