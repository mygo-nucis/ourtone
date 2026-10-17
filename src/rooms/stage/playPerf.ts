/* opt-in device measurements; no observer, element or extra animation loop without ?perf */
export type Probe = 'normal' | 'stage' | 'effects' | 'reverb' | 'clock' | 'paced' | 'resolution' | 'hit-sound' | 'light' | 'light-effects' | 'light-hit-sound';
const choices: [Probe, string][] = [
  ['normal', 'Normal'], ['stage', 'Stage off'], ['effects', 'Effects off'],
  ['reverb', 'Reverb off'], ['clock', 'Steady picture clock'], ['paced', 'Frame-paced motion'], ['resolution', '65% resolution'], ['hit-sound', 'Hit sound off'],
  ['light', 'Light baseline'], ['light-effects', 'Light + effects off'], ['light-hit-sound', 'Light + hit sound off']
];
export function probeChoice(): Probe {
  const q = new URLSearchParams(location.search), choice = q.get('playProbe');
  return q.has('perf') && choices.some(([key]) => key === choice) ? choice as Probe : 'normal';
}
type State = {
  cadence?: { periodMs: number | null; stepMs: number; phaseErrorMs: number; locked: boolean };
  songId?: string; songTime?: number; night?: boolean; pictureOffsetMs?: number;
  audioClock?: { outputTimestampSupported: boolean; sampleRate: number; baseLatency?: number; outputLatency?: number };
  gpu: boolean; projected?: boolean; css?: boolean; probe?: Probe; software?: boolean;
  cacheBuilds?: number; overlayAllocations?: number; notesDraws?: number; effectsDraws?: number;
  uploads?: number; uploadPixels?: number; draws?: number; bitmapPixels?: number; texturePixels?: number; canvasPixels?: number;
  glP95?: number; glSamples?: number; notes?: number[]; overlay?: number[];
};
// callback interval/delay, JS work, audio/raw/shown steps relative to rAF, shown step relative to inferred cadence
export type PerfSample = [number, number, number, number | null, number | null, number | null, (number | null)?];
const percentile = (a: number[], q: number) => {
  const sorted = [...a].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
};
export function summarizeFrames(rows: PerfSample[]) {
  const frames = rows.map(r => r[0]), duration = frames.reduce((a, b) => a + b, 0);
  const motion = (i: 3 | 4 | 5 | 6) => {
    const values = rows.flatMap(r => r[i] == null ? [] : [Math.abs(r[i]!)]);
    return { samples: values.length, p95Ms: percentile(values, .95), maxMs: Math.max(0, ...values) };
  };
  const median = percentile(frames, .5);
  return {
    frames: rows.length, seconds: duration / 1000, fps: duration ? rows.length / duration * 1000 : 0,
    intervalMs: { p50: percentile(frames, .5), p95: percentile(frames, .95), p99: percentile(frames, .99), max: Math.max(0, ...frames) },
    gapsOver25Ms: frames.filter(v => v > 25).length, gapsOver33Ms: frames.filter(v => v > 33).length,
    // uneven short/long intervals can still contain every display tick; do not claim missed presentations
    longIntervals: median ? frames.filter(dt => dt > median * 1.5).length : 0,
    callbackDelayP95Ms: percentile(rows.map(r => r[1]), .95), jsP95Ms: percentile(rows.map(r => r[2]), .95),
    audioStepError: motion(3), rawPictureStepError: motion(4), pictureStepError: motion(5), pacedStepError: motion(6)
  };
}
export function playPerf(read: () => State, change?: (choice: Probe) => void) {
  if (!new URLSearchParams(location.search).has('perf')) return null;
  const root = document.createElement('aside'), panel = document.createElement('pre'), controls = document.createElement('div');
  root.dataset.playPerf = '';
  root.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99999;max-width:calc(100vw - 16px);color:#fff;background:#101018df;font:11px/1.5 monospace;pointer-events:none';
  panel.setAttribute('aria-live', 'off');
  panel.style.cssText = 'margin:0;padding:8px;white-space:pre;font:inherit';
  controls.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;padding:0 8px 8px;pointer-events:auto;max-width:350px';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Performance isolation test');
  for (const [key, label] of choices) { const o = document.createElement('option'); o.value = key; o.textContent = label; select.append(o); }
  select.value = read().probe ?? 'normal'; controls.append(select);
  const button = (label: string, action: () => void) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.style.cssText = 'padding:3px 6px;border:1px solid #888;color:#fff;background:#262630;border-radius:3px;font:inherit';
    b.addEventListener('click', action); controls.append(b); return b;
  };
  select.style.cssText = 'max-width:180px;padding:3px;color:#fff;background:#262630;font:inherit';
  const style = document.createElement('style');
  // the full backdrop stays intact outside this explicitly selected diagnostic
  style.textContent = ':root.ut-perf-stage-off [data-play-background],:root.ut-perf-stage-off .stage > .glow,:root.ut-perf-stage-off .stage > .scrim{visibility:hidden!important}';
  root.append(panel, controls, style); document.body.append(root);
  let previous = NaN, start = performance.now(), lastAudio = 0, lastRaw = 0, lastPicture = 0, wasPlaying = false;
  let pixels = read().uploadPixels ?? 0, disposed = false, recording = false, warmUntil = 0, recordUntil = 0;
  let lastReport: ReturnType<typeof report> | null = null;
  const intervals: PerfSample[] = [], history: PerfSample[] = [], capture: PerfSample[] = [];
  const report = (rows: PerfSample[]) => ({
    format: 'ourtone-play-perf-v4', userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight, devicePixelRatio],
    recordedAt: new Date().toISOString(), state: read(), ...summarizeFrames(rows),
    note: 'rAF and picture-clock samples, not a measurement of actual screen presentation; clock steps can include seeks; WebGL query excludes Canvas2D and compositor',
    sampleColumns: ['callbackIntervalMs', 'callbackDelayMs', 'jsMs', 'audioMinusCallbackMs', 'rawPictureMinusCallbackMs', 'pictureMinusCallbackMs', 'pictureMinusCadenceMs'],
    samples: rows.map(row => row.map(v => v == null ? null : Math.round(v * 1000) / 1000))
  });
  const reset = () => {
    previous = NaN; intervals.length = history.length = 0; start = performance.now();
    wasPlaying = false; pixels = read().uploadPixels ?? 0; lastReport = null;
  };
  select.addEventListener('change', () => {
    if (recording) return;
    change?.(select.value as Probe);
    const url = new URL(location.href); url.searchParams.set('playProbe', select.value);
    window.history.replaceState(null, '', url); reset();
  });
  const record = button('Record 10s', () => {
    if (recording) return;
    reset(); capture.length = 0; recording = true;
    warmUntil = performance.now() + 1500; recordUntil = warmUntil + 10000;
    // sample without a live DOM counter repainting over the game
    root.style.visibility = 'hidden'; select.disabled = true;
  });
  const copy = button('Copy report', () => {
    lastReport ??= report(history);
    // retain the sequence: percentiles alone cannot distinguish a late/early pair from a missed update
    const value = JSON.stringify(lastReport);
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(value).then(() => { copy.textContent = 'Copied'; }, () => showText(value));
    else showText(value);
  });
  function showText(value: string) {
    const area = document.createElement('textarea'); area.value = value;
    area.style.cssText = 'position:fixed;inset:10%;z-index:100000;pointer-events:auto';
    area.style.setProperty('user-select', 'text', 'important'); area.style.setProperty('-webkit-user-select', 'text', 'important');
    root.append(area); area.focus(); area.select();
    area.addEventListener('blur', () => area.remove(), { once: true });
  }
  let details = innerHeight > 500;
  const detail = button(details ? 'Less' : 'Details', () => {
    details = !details; detail.textContent = details ? 'Less' : 'Details';
  });
  const collapse = button('Hide stats', () => {
    panel.hidden = !panel.hidden; collapse.textContent = panel.hidden ? 'Show stats' : 'Hide stats';
  });
  const api = {
    report: () => lastReport ?? report(history),
    frame(raf: number, begin: number, cost: number, audio: number, raw: number, picture: number, playing: boolean, cadenceStep?: number) {
      if (disposed) return;
      const dt = raf - previous;
      if (Number.isFinite(dt) && dt > 0) {
        const moving = playing && wasPlaying;
        const error = (t: number, last: number) => moving ? (t - last) * 1000 - dt : null;
        const row: PerfSample = [dt, Math.max(0, begin - raf), cost, error(audio, lastAudio), error(raw, lastRaw), error(picture, lastPicture), moving && cadenceStep !== undefined ? (picture - lastPicture) * 1000 - cadenceStep : null];
        intervals.push(row); history.push(row);
        if (history.length > 3600) history.shift();
        if (recording && begin >= warmUntil && begin < recordUntil) capture.push(row);
      }
      previous = raf; lastAudio = audio; lastRaw = raw; lastPicture = picture; wasPlaying = playing;
      if (recording) {
        if (begin < recordUntil) return;
        lastReport = report(capture); recording = false; select.disabled = false; root.style.visibility = '';
        record.textContent = 'Recorded 10s'; copy.textContent = 'Copy report';
      }
      if (begin - start < 1000) return;
      const elapsed = (begin - start) / 1000, state = read(), s = summarizeFrames(intervals), total = summarizeFrames(history);
      if (!panel.hidden) {
        const lines = [
        'Play mode: ' + (state.css ? 'CSS3D' : state.gpu ? (state.projected ? 'GPU retained' : 'GPU') : 'Canvas') + (state.software ? ' (software WebGL)' : ''),
        `FPS ${s.fps.toFixed(1)} | frame p95 ${s.intervalMs.p95.toFixed(1)} ms`,
        `Frame p99 ${s.intervalMs.p99.toFixed(1)} | max ${s.intervalMs.max.toFixed(1)} ms`,
        `Gaps >25ms ${total.gapsOver25Ms} | >33ms ${total.gapsOver33Ms} (${total.seconds.toFixed(0)}s)`,
        `JS p95 ${s.jsP95Ms.toFixed(1)} ms | long intervals ${s.longIntervals}`,
        `Audio step error p95 ${s.audioStepError.p95Ms.toFixed(1)} ms | picture vs rAF ${s.pictureStepError.p95Ms.toFixed(1)}`,
        `WebGL pass p95 ${state.glP95?.toFixed(2) ?? '-'} ms | samples ${state.glSamples ?? 0}`,
        `Bitmap uploads ${(Math.max(0, (state.uploadPixels ?? 0) - pixels) / elapsed / 1e6).toFixed(2)} MP/s`,
        `GL textures ~${((state.texturePixels ?? 0) * 4 / 1e6).toFixed(1)} MB | cache ~${((state.bitmapPixels ?? 0) * 4 / 1e6).toFixed(1)} MB`,
        `2D buffers ~${((state.canvasPixels ?? 0) * 4 / 1e6).toFixed(1)} MB | sizes, not VRAM`,
        `Notes ${state.notes?.join('x') ?? '-'} | effects ${state.overlay?.join('x') ?? '-'}`,
        `Pointer ${matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine'} | DPR ${devicePixelRatio}`,
        `Test: ${select.selectedOptions[0]?.textContent} (temporary isolation)`,
        '?perf&playRenderer=canvas, gpu or css',
        `Draws notes ${state.notesDraws ?? '-'} | effects ${state.effectsDraws ?? '-'} | effect allocations ${state.overlayAllocations ?? '-'}`
        ];
        if (state.cadence) lines.push(state.cadence.locked ? `Cadence ${(1000 / state.cadence.periodMs!).toFixed(1)} Hz | step error ${s.pacedStepError.p95Ms.toFixed(2)} ms` : 'Cadence: measuring');
        panel.textContent = (details ? lines : lines.filter((_, i) => [0, 1, 2, 3, 4, 5, 12, 16].includes(i))).join('\n');
      }
      pixels = state.uploadPixels ?? 0; start = begin; intervals.length = 0;
    },
    dispose() {
      disposed = true; root.remove();
      if ((window as unknown as { __playPerf?: unknown }).__playPerf === api) delete (window as unknown as { __playPerf?: unknown }).__playPerf;
    }
  };
  (window as unknown as { __playPerf?: unknown }).__playPerf = api;
  return api;
}