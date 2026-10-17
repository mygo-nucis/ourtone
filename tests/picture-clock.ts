import assert from 'node:assert/strict';
import { pictureClock, pacedPictureClock } from '../src/rooms/stage/pictureClock';
import { summarizeFrames, type PerfSample } from '../src/rooms/stage/playPerf';

const clock = pictureClock();
let previous = clock.sample(0, 0, true), lastRaw = 0, rawMax = 0, shownMax = 0, offsetMax = 0;
for (let i = 1; i < 600; i++) {
  const wall = i * 1000 / 60, raw = Math.floor(wall / 40) * .04;
  const shown = clock.sample(raw, wall, true);
  rawMax = Math.max(rawMax, Math.abs((raw - lastRaw) * 1000 - 1000 / 60));
  shownMax = Math.max(shownMax, Math.abs((shown - previous) * 1000 - 1000 / 60));
  offsetMax = Math.max(offsetMax, Math.abs(shown - raw) * 1000);
  assert(shown > previous, 'picture went backwards on a quantized audio clock');
  previous = shown; lastRaw = raw;
}
assert(rawMax > 20 && shownMax < 1.01, 'quantized steps were not smoothed');
assert(offsetMax < 40, 'picture drifted away from the audio clock');
assert.equal(clock.sample(3, 10000, false), 3, 'pause did not show exact transport position');
assert.equal(clock.sample(3, 10016, true), 3, 'resume did not anchor');
assert.equal(clock.sample(30, 10032, true), 30, 'forward seek was eased');
assert.equal(clock.sample(2, 10048, true), 2, 'backward seek was eased');
assert.equal(clock.sample(4, 12000, true), 4, 'suspension was not reanchored');
clock.reset();
assert.equal(clock.sample(4.025, 12016, true), 4.025, 'explicit reset did not anchor small seek');
const exact = pictureClock();
for (let i = 0; i < 600; i++) {
  const wall = i * 1000 / 60;
  assert(Math.abs(exact.sample(wall / 1000, wall, true) - wall / 1000) < 1e-10, 'stable source gained a timing offset');
}
console.log(JSON.stringify({ rawStepErrorMaxMs: rawMax, pictureStepErrorMaxMs: shownMax, offsetMaxMs: offsetMax }));

// alternating callback intervals do not establish that a displayed frame was missed
const jitter: PerfSample[] = Array.from({ length: 600 }, (_, i) => [i % 2 ? 21 : 13, 0, 2, 0, 0, 0]);
const jitterSummary = summarizeFrames(jitter);
assert.equal(jitterSummary.longIntervals, 0);
assert(!('estimatedMissed' in jitterSummary), 'summary still claims actual dropped frames');
const gap: PerfSample[] = Array.from({ length: 600 }, (_, i) => [i === 300 ? 34 : 1000 / 60, 0, 2, 0, 0, 0]);
assert.equal(summarizeFrames(gap).longIntervals, 1, 'long interval not counted');

// synthetic scheduling jitter: the display refreshes regularly, while callbacks arrive 0..9 ms later.
// this is a mechanism test, not a replay of the iPhone report (the old report omitted its raw samples).
function cadenceRun(hz: number, seconds = 20, quantized = true) {
  const paced = pacedPictureClock(), old = pictureClock(), period = 1000 / hz;
  let seed = 3, previous = 0, oldPrevious = 0, maxStep = 0, oldMaxStep = 0, maxOffset = 0;
  for (let i = 0; i < hz * seconds; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const delay = (seed / 2 ** 32) * Math.min(9, period * .5);
    const wall = i * period + delay;
    const raw = quantized ? Math.floor(wall / (128 / 48)) * (128 / 48000) : wall / 1000;
    const value = paced.sample(raw, wall, true), before = old.sample(raw, wall, true);
    if (i > hz * 3) {
      maxStep = Math.max(maxStep, Math.abs((value - previous) * 1000 - period));
      oldMaxStep = Math.max(oldMaxStep, Math.abs((before - oldPrevious) * 1000 - period));
      maxOffset = Math.max(maxOffset, Math.abs((value - raw) * 1000));
      assert(value > previous, 'paced motion reversed');
    }
    previous = value; oldPrevious = before;
  }
  assert(paced.stats().locked, 'cadence did not lock at ' + hz);
  assert(maxStep < .5, 'cadence step jitter at ' + hz + ': ' + maxStep);
  assert(maxOffset < 10, 'audio phase drift at ' + hz + ': ' + maxOffset);
  return { hz, oldMaxStepMs: oldMaxStep, pacedMaxStepMs: maxStep, audioOffsetMaxMs: maxOffset };
}
const cadenceResults = [30, 60, 75, 90, 120, 144].map(hz => cadenceRun(hz));
cadenceResults.push(cadenceRun(59.94, 180), cadenceRun(60, 180, false));
const dropped = pacedPictureClock();
for (let i = 0; i < 180; i++) dropped.sample(i / 60, i * 1000 / 60, true);
const beforeGap = dropped.sample(3, 3000, true);
const afterGap = dropped.sample(3 + 4 / 60, 3000 + 4 * 1000 / 60, true);
assert(Math.abs(afterGap - beforeGap - 4 / 60) < 1e-9, 'missing callbacks slowed the song');
assert.equal(dropped.sample(7, 3100, false), 7, 'paced pause differs from transport');
assert.equal(dropped.sample(7, 3120, true), 7, 'paced resume did not anchor');
assert.equal(dropped.sample(30, 3140, true), 30, 'paced seek did not anchor');
assert.equal(dropped.sample(2, 3160, true), 2, 'paced backwards seek did not anchor');
assert.equal(dropped.sample(4, 6000, true), 4, 'paced suspension did not anchor');
dropped.reset();
assert.equal(dropped.sample(4.01, 6016, true), 4.01, 'paced small seek did not anchor');
const overloaded = pacedPictureClock();
for (let i = 0; i < 400; i++) assert.equal(overloaded.sample(i / 55, i * 1000 / 55, true), i / 55);
assert(!overloaded.stats().locked, '55 fps was forced into a 60 Hz cadence');
const switching = pacedPictureClock();
let wall = 0, value = 0;
for (const hz of [60, 30, 120, 60]) {
  for (let i = 0; i < hz * 5; i++) {
    wall += 1000 / hz;
    const next = switching.sample(wall / 1000, wall, true);
    assert(next >= value, 'refresh change reversed motion');
    assert(Math.abs(next * 1000 - wall) < 35, 'refresh change caused accumulating drift');
    value = next;
  }
  assert(Math.abs(switching.stats().periodMs! - 1000 / hz) < .01, 'refresh change was not learned');
}
console.log(JSON.stringify({ cadenceResults, gapsAndRateChanges: 'passed' }));

// sustained overload after a good lock must release it too, not only fail initial acquisition
const losing = pacedPictureClock();
let slowWall = 0;
for (const hz of [60, 55, 60]) {
  for (let i = 0; i < hz * 4; i++) {
    slowWall += 1000 / hz;
    const shown = losing.sample(slowWall / 1000, slowWall, true);
    if (i > hz * 2) assert(Math.abs(shown * 1000 - slowWall) < 1, 'overload transition retained an incorrect phase');
  }
  assert.equal(losing.stats().locked, hz === 60, 'stale cadence survived sustained overload');
}
console.log('sustained-overload recovery passed');
