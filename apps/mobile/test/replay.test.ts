import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseCsv, replay, type Decision } from '@sellekni/detector';
import { createDetectorHost, createSensorClock, RAD_TO_DEG, toGpsFix, toSample } from '../src/detector/adapter';
import { BUNDLED_TRACES, TRACE_NAMES } from '../src/replay/bundled-traces';
import { startReplay, type Clock } from '../src/replay/engine';

const PKG = new URL('../../../packages/detector/traces/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', PKG), 'utf8')) as { file: string; rangeG: number; expect: string; label: string }[];

/** Manual clock: timers fire in order as `advance()` moves time. */
function fakeClock() {
  let now = 1_000_000;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let seq = 0;
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = ++seq;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimeout: (h) => { timers = timers.filter((t) => t.id !== h); },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      now = next.at;
      next.fn();
    }
    now = end;
  };
  return { clock, advance };
}

function pacedReplay(name: keyof typeof BUNDLED_TRACES, rate: 1 | 4 = 4) {
  const tr = BUNDLED_TRACES[name];
  const host = createDetectorHost(tr.rangeG);
  const { clock, advance } = fakeClock();
  const got: Decision[] = [];
  let ended = false;
  startReplay({ trace: parseCsv(tr.csv), host, rate, clock, onDecision: (d) => got.push(d), onEnd: () => { ended = true; } });
  advance(40_000);
  return { got, ended, host };
}

test('the bundled traces are verbatim copies of packages/detector/traces (no hand edits)', () => {
  assert.ok(TRACE_NAMES.length >= 4);
  for (const name of TRACE_NAMES) {
    const tr = BUNDLED_TRACES[name];
    assert.equal(tr.csv, readFileSync(new URL(`${name}.csv`, PKG), 'utf8'), `${name}: run pnpm --filter mobile traces`);
    const m = manifest.find((e) => e.file === `${name}.csv`)!;
    assert.equal(tr.rangeG, m.rangeG);
    assert.equal(tr.expect, m.expect);
    assert.equal(tr.box, m.label.includes('BOX'));
  }
  for (const need of ['frontal_45_r16', 'rollover_71_r16', 'pothole_then_stop_r16', 'phone_drop_r16'] as const) assert.ok(need in BUNDLED_TRACES, need);
});

test('a paced replay through the app adapter gives exactly the package replay() decisions, and the manifest outcome', () => {
  for (const name of TRACE_NAMES) {
    const tr = BUNDLED_TRACES[name];
    const { got, ended } = pacedReplay(name);
    assert.ok(ended, `${name} finished`);
    assert.deepEqual(got, replay({ ...parseCsv(tr.csv), rangeG: tr.rangeG }).decisions, name);
    assert.equal(got.some((d) => d.kind === 'alert'), tr.expect === 'alert', `${name} expected ${tr.expect}`);
  }
});

test('frontal_45_r16 alerts with explainable reasons; pothole_then_stop_r16 and phone_drop_r16 never alert', () => {
  const alert = pacedReplay('frontal_45_r16').got.find((d) => d.kind === 'alert');
  assert.ok(alert);
  assert.ok(alert.reasons.includes('speed_collapse') && alert.reasons.includes('came_to_stop'));
  assert.ok(alert.metrics.peakG <= 16, 'peak g is capped at the sensor range');
  for (const neg of ['pothole_then_stop_r16', 'phone_drop_r16'] as const) {
    const { got } = pacedReplay(neg);
    assert.ok(got.every((d) => d.kind === 'rejected'), neg);
  }
});

test('nothing is decided early: the alert waits for the evaluation delay; 4x finishes a 30 s trace in ~7.5 s', () => {
  const tr = BUNDLED_TRACES.frontal_45_r16;
  const { clock, advance } = fakeClock();
  const got: Decision[] = [];
  let ended = false;
  startReplay({ trace: parseCsv(tr.csv), host: createDetectorHost(tr.rangeG), clock, onDecision: (d) => got.push(d), onEnd: () => { ended = true; } });
  const expected = replay({ ...parseCsv(tr.csv), rangeG: tr.rangeG }).decisions[0]!;
  advance(expected.tEventMs + 7_900);
  assert.equal(got.length, 0, 'judged 8 s after the trigger, not before');
  advance(400);
  assert.equal(got.length, 1);

  const fast = fakeClock();
  let fastEnded = false;
  startReplay({ trace: parseCsv(tr.csv), host: createDetectorHost(tr.rangeG), clock: fast.clock, rate: 4, onEnd: () => { fastEnded = true; } });
  fast.advance(7_400);
  assert.equal(fastEnded, false);
  fast.advance(200);
  assert.equal(fastEnded, true);
  assert.equal(ended, false);
});

test('stopping from the decision handler (the countdown takes over) stops the replay at once', () => {
  const tr = BUNDLED_TRACES.frontal_45_r16;
  const { clock, advance } = fakeClock();
  let n = 0;
  const h = startReplay({ trace: parseCsv(tr.csv), host: createDetectorHost(tr.rangeG), clock, rate: 4, onDecision: () => { n++; h.stop(); } });
  advance(40_000);
  assert.equal(n, 1);
  assert.equal(h.isRunning(), false);
  assert.ok(h.progress() < 1);
});

test('live path: expo-style readings (seconds, rad/s, jittery delivery) through the clock + unit adapter reach the same verdicts', () => {
  for (const name of ['frontal_45_r16', 'rollover_71_r16', 'pothole_then_stop_r16', 'phone_drop_r16'] as const) {
    const tr = BUNDLED_TRACES[name];
    const { samples, gps } = parseCsv(tr.csv);
    const host = createDetectorHost(tr.rangeG);
    const clock = createSensorClock();
    const BOOT = 123_456.789; // sensor clock origin (s), unrelated to the wall clock
    const WALL = 1_761_830_000_000;
    const got: Decision[] = [];
    let g = 0;
    samples.forEach((s, k) => {
      while (g < gps.length && gps[g]!.t <= s.t) {
        const f = toGpsFix(gps[g]!.speedKmh / 3.6, WALL + gps[g]!.t + 800)!; // GPS arrives ~0.8 s late (inside the budget)
        got.push(...host.pushGps(f));
        g++;
      }
      const arrival = WALL + s.t + 5 + (k % 7) * 3; // bridge batching: 5–23 ms late, irregular
      const t = clock.toMs(BOOT + s.t / 1000, arrival);
      const rad = { x: s.gx / RAD_TO_DEG, y: s.gy / RAD_TO_DEG, z: s.gz / RAD_TO_DEG };
      got.push(...host.pushSample(toSample(t, { x: s.ax, y: s.ay, z: s.az }, rad)));
    });
    const want = replay({ ...parseCsv(tr.csv), rangeG: tr.rangeG }).decisions;
    assert.deepEqual(got.map((d) => [d.kind, d.rule]), want.map((d) => [d.kind, d.rule]), name);
    const snap = host.snapshot();
    assert.equal(snap.rateOk, true, `${name}: 100 Hz measured from sensor timestamps, not from jittery arrival`);
    assert.equal(snap.rateHz, 100);
  }
});

test('adapter units and states: rad/s -> deg/s, unknown GPS speed skipped, UNSUPPORTED under 8 g, arm progress', () => {
  const s = toSample(10, { x: 0, y: 0, z: 1 }, { x: Math.PI, y: 0, z: -Math.PI / 2 });
  assert.equal(s.gx, 180);
  assert.equal(s.gz, -90);
  assert.equal(toGpsFix(null, 1), null);
  assert.equal(toGpsFix(-1, 1), null);
  assert.deepEqual(toGpsFix(10, 5), { t: 5, speedKmh: 36 });

  const low = createDetectorHost(4);
  assert.equal(low.detector.supported, false);
  assert.equal(low.snapshot().state, 'UNSUPPORTED');
  assert.deepEqual(low.pushGps({ t: 0, speedKmh: 90 }), []);

  const h = createDetectorHost(16);
  h.pushGps({ t: 0, speedKmh: 40 });
  h.pushGps({ t: 5_000, speedKmh: 40 });
  assert.equal(h.snapshot().armProgress, 0.5);
  h.pushGps({ t: 10_000, speedKmh: 40 });
  assert.equal(h.snapshot().state, 'ARMED');
  assert.equal(h.snapshot().armProgress, 1);
  assert.equal(h.snapshot().speedKmh, 40);
});

test('sensor clock: smallest delivery delay wins; a restart of the sensor clock re-anchors', () => {
  const c = createSensorClock();
  assert.equal(c.toMs(1, 1_000_050), 1_000_050);
  assert.equal(c.toMs(1.01, 1_000_055), 1_000_055); // delay shrank by 5 ms: new anchor
  assert.equal(c.toMs(1.02, 1_000_090), 1_000_065); // delivered late: spacing kept at 10 ms
  assert.equal(c.toMs(0.5, 1_000_100), 1_000_100); // sensor clock went back: re-anchored
});
