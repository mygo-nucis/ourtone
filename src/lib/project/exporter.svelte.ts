import Mp3Worker from './mp3.worker?worker&inline';
import { renderSongSplit } from '../audio/offline';
import { bank } from '../audio/bank';
import type { Song } from '../music/song';
import type { Lang } from '../music/types';
import { midiOf, wavOf, deliver, type ExportKind } from './export';

/* the export button's work: render, encode, hand the file over, and report progress to the top bar */
function mp3Of(b: AudioBuffer, onProgress: (k: number) => void): Promise<Uint8Array> {
  return new Promise((res, rej) => {
    let w: Worker;
    try { w = new Mp3Worker(); } catch (e) { rej(e); return; }
    const l = b.getChannelData(0).slice(), r = (b.numberOfChannels > 1 ? b.getChannelData(1) : b.getChannelData(0)).slice();
    w.onmessage = (e: MessageEvent<{ progress?: number; done?: Uint8Array }>) => {
      if (e.data.done) { res(e.data.done); w.terminate(); } else if (e.data.progress !== undefined) onProgress(e.data.progress);
    };
    w.onerror = (e) => { rej(e); w.terminate(); };
    w.postMessage({ l, r, sr: b.sampleRate, kbps: 192 }, [l.buffer, r.buffer]);
  });
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim() || 'Ourtone';

class Exporter {
  busy = $state<ExportKind | null>(null);
  progress = $state(0);
  result = $state<'' | 'saved' | 'declined' | 'unavailable' | 'failed'>('');
  async run(kind: ExportKind, song: Song, o: { lang: Lang; night: boolean; from?: number; to?: number }) {
    if (this.busy) return;
    this.busy = kind; this.progress = 0; this.result = '';
    const name = safe(song.data.title[o.lang]);
    try {
      let bytes: Uint8Array, file: string, mime: string;
      if (kind === 'midi') { bytes = midiOf(song, o.lang); file = name + '.mid'; mime = 'audio/midi'; }
      else {
        await bank.loadAll(song.parts.flatMap(p => p.clips.map(c => c.src)));
        const buf = await renderSongSplit(song, { from: o.from, to: o.to, night: o.night, tail: 3, onProgress: k => { this.progress = kind === 'mp3' ? k * .7 : k; } });
        if (kind === 'wav') { bytes = wavOf(buf); file = name + '.wav'; mime = 'audio/wav'; }
        else { bytes = await mp3Of(buf, k => { this.progress = .7 + k * .3; }); file = name + '.mp3'; mime = 'audio/mpeg'; }
      }
      this.progress = 1;
      this.result = await deliver(file, bytes, mime);
    } catch (e) {
      console.warn(e);
      this.result = 'failed';
    }
    this.busy = null;
    setTimeout(() => { if (!this.busy) this.result = ''; }, 4000);
  }
}
export const exporter = new Exporter();
