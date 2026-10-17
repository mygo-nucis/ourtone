/* experimental picture-only clock: judgement and audio always keep their original transport clock */
export function pictureClock() {
  let lastWall = NaN, lastRaw = 0, shown = 0, running = false;
  return {
    reset() { lastWall = NaN; },
    sample(raw: number, wall: number, active: boolean) {
      const dt = (wall - lastWall) / 1000, predicted = shown + dt;
      // seeks, suspension and play/pause start a new anchor, never a long catch-up
      if (!active || !running || !Number.isFinite(dt) || dt <= 0 || dt > .1 ||
          Math.abs(raw - lastRaw - dt) > .08 || Math.abs(raw - predicted) > .08) shown = raw;
      else {
        // correct small audio-clock steps gradually; one millisecond per 60 Hz frame at most
        const correction = Math.max(-dt * .06, Math.min(dt * .06, raw - predicted));
        shown = predicted + correction;
      }
      lastWall = wall; lastRaw = raw; running = active;
      return shown;
    }
  };
}

/* opt-in display cadence reconstruction. Safari's rAF time may include callback scheduling jitter; smoothing
   audio against that same time leaves the jitter in the picture. this clock estimates a regular callback cadence,
   then advances one interval at a time, with slow audio phase correction. it does not measure presentation. */
export function pacedPictureClock() {
  const rates = [24, 25, 30, 40, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240];
  const times: number[] = [];
  let period = 0, phase = 0, shown = 0, lastWall = NaN, lastRaw = 0, running = false;
  let stepMs = 0, phaseErrorMs = 0, count = 0, badWindows = 0;
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const reset = () => { times.length = 0; period = 0; lastWall = NaN; running = false; count = badWindows = 0; stepMs = phaseErrorMs = 0; };
  return {
    reset,
    stats: () => ({ periodMs: period || null, stepMs, phaseErrorMs, locked: period > 0 }),
    sample(raw: number, wall: number, active: boolean) {
      const elapsed = wall - lastWall;
      if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed > 100 ||
          Math.abs((raw - lastRaw) * 1000 - elapsed) > 80 && active && running) {
        reset();
      }
      times.push(wall);
      if (times.length > 48) times.shift();
      let acquired = false;
      if (times.length === 48 && ++count % 12 === 0) {
        const average = (times[47] - times[0]) / 47;
        const candidate = rates.map(hz => 1000 / hz).reduce((a, b) => Math.abs(a - average) < Math.abs(b - average) ? a : b);
        const offsets = times.map((t, i) => t - i * candidate), center = median([...offsets]);
        const residuals = offsets.map(t => Math.abs(t - center)).sort((a, b) => a - b);
        // refuse a forced 60 Hz assumption on a genuinely irregular or overloaded stream
        const valid = Math.abs(average - candidate) < candidate * .025 && residuals[43] < candidate * .35;
        if (valid) {
          badWindows = 0;
          if (!period || Math.abs(candidate - period) > .1) {
            period = candidate; phase = center + 47 * period; acquired = true;
          }
        } else if (++badWindows >= 4) period = 0;
      }
      // a sustained faster callback stream invalidates the old cadence (for example 30 -> 120 Hz).
      // reacquire instead of repeatedly jumping ahead and snapping backwards to the audio clock.
      if (period && !acquired && wall < phase + period * .25) {
        period = 0; times.splice(0, times.length - 1); count = badWindows = 0;
      }
      stepMs = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
      if (!active || !running || !Number.isFinite(lastWall)) shown = raw;
      else if (!period) shown = Math.max(shown, raw);
      else {
        // count a gap from accumulated phase, not from one long callback interval followed by a short one
        const predicted = phase + period, error = wall - predicted;
        const steps = acquired ? 1 : Math.max(1, 1 + Math.floor(error / period + .25));
        const correction = acquired ? 0 : Math.max(-period * .005, Math.min(period * .005, (wall - phase - steps * period) * .01));
        if (!acquired) phase += steps * period + correction;
        stepMs = steps * period + correction;
        const next = shown + stepMs / 1000, delta = raw - next;
        // no accumulated audio drift; a seek or a large clock discontinuity gets an immediate new anchor
        shown = Math.abs(delta) > .05 ? raw : next + Math.max(-.00025, Math.min(.00025, delta * .02));
      }
      // while paused the transport is exact, but the callback cadence can still warm up
      if (period && (!active || !running)) phase = wall;
      phaseErrorMs = period ? wall - phase : 0;
      lastWall = wall; lastRaw = raw; running = active;
      return shown;
    }
  };
}
