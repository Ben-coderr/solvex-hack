import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Detector, SCENARIOS, makeTrace, pulseDuration, replay, toPacketHints, parseCsv, toCsv, type Mount, type ScenarioName } from '../src';
import { assess, encodeDzmsd, decodeDzmsd, type DzmsdPacket } from '@najda/shared';

const RANGES = [8, 16, 32];
const MOUNTS: Mount[] = ['aligned', 'tilted', 'pocket'];
const SEEDS = Array.from({ length: 15 }, (_, i) => i + 1);
const POSITIVE: ScenarioName[] = ['frontal_45', 'rollover_71'];
const NEGATIVE = SCENARIOS.filter((s) => !POSITIVE.includes(s));
const alerts = (name: ScenarioName, rangeG: number, seed: number, mount?: Mount, params = {}) =>
  replay(makeTrace(name, { rangeG, seed, mount }), new Detector(rangeG, params)).decisions.filter((d) => d.kind === 'alert');

test('every crash scenario alerts on every supported sensor range, mount and seed', () => {
  for (const name of POSITIVE) for (const R of RANGES) for (const m of MOUNTS) for (const seed of SEEDS)
    assert.equal(alerts(name, R, seed, m).length, 1, `${name} ±${R} g ${m} seed ${seed}`);
});

test('no non-crash scenario ever alerts (8 non-crash scenarios x ranges x mounts x seeds)', () => {
  for (const name of NEGATIVE) for (const R of RANGES) for (const m of MOUNTS) for (const seed of SEEDS)
    assert.equal(alerts(name, R, seed, m).length, 0, `${name} ±${R} g ${m} seed ${seed}`);
});

test('a sensor below ±8 g is UNSUPPORTED: no decisions at all, the app must say so and offer SOS/witness', () => {
  const d = new Detector(4);
  assert.equal(d.state, 'UNSUPPORTED');
  assert.equal(d.supported, false);
  const r = replay(makeTrace('frontal_45', { rangeG: 4, seed: 1 }), d);
  assert.deepEqual(r.decisions, []);
});

test('reported G never exceeds the sensor range, and a saturated sensor is flagged (never "38 g from a phone")', () => {
  for (const R of [8, 16]) for (const seed of SEEDS) {
    const [a] = alerts('frontal_45', R, seed, 'tilted');
    assert.ok(a);
    assert.ok(a.metrics.peakG <= R + 1e-9, `peakG ${a.metrics.peakG} > range ${R}`);
    assert.equal(a.metrics.sensorLimited, true);
    assert.ok(a.reasons.includes('impact_at_sensor_limit'));
    const h = toPacketHints(a, R);
    assert.ok(h.G <= R && h.sensorLimited);
  }
});

test('time at the ceiling matches the half-sine model and shrinks as the range grows (it replaces amplitude as the severity proxy)', () => {
  const peak = 32, T = pulseDuration(45, peak) * 1000;
  const model = (R: number) => T * (Math.PI - 2 * Math.asin((0.95 * R) / peak)) / Math.PI; // ms
  const mean = (R: number) => {
    const xs = SEEDS.map((s) => alerts('frontal_45', R, s, 'aligned')[0]!.metrics.tSaturatedMs);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  const [m8, m16] = [mean(8), mean(16)];
  assert.ok(m8 > m16, `${m8} vs ${m16}`);
  assert.ok(Math.abs(m8 - model(8)) < 10, `±8 g: measured ${m8.toFixed(1)} ms, model ${model(8).toFixed(1)} ms`);
  assert.ok(Math.abs(m16 - model(16)) < 10, `±16 g: measured ${m16.toFixed(1)} ms, model ${model(16).toFixed(1)} ms`);
});

test('the speed delta comes from GPS, close to the true value, never from integrating a clipped accelerometer', () => {
  for (const seed of SEEDS) {
    const [a] = alerts('frontal_45', 8, seed, 'tilted');
    assert.ok(Math.abs(a!.metrics.dvKmh - 45) <= 3, `dv ${a!.metrics.dvKmh}`);
    assert.equal(a!.metrics.stopped, true);
  }
});

test('rollover is recognised from rotation (>= 90°) and carried into the packet hints', () => {
  const [a] = alerts('rollover_71', 16, 2, 'tilted');
  assert.ok(a!.reasons.includes('rotation'));
  assert.equal(toPacketHints(a!, 16).RO, true);
  const [f] = alerts('frontal_45', 16, 2, 'tilted');
  assert.equal(toPacketHints(f!, 16).RO, false);
});

// ---- ablation: every gate must be NECESSARY, i.e. switching it off lets a specific hard negative through ----------------
test('ablation: the duration gate is what rejects "pothole, then brake to a red light"', () => {
  for (const seed of SEEDS) {
    assert.equal(alerts('pothole_then_stop', 16, seed, 'tilted').length, 0);
    assert.equal(alerts('pothole_then_stop', 16, seed, 'tilted', { minHighMs: 0, minHighStrongMs: 0 }).length, 1, `seed ${seed}`);
  }
});

test('ablation: the came-to-a-stop gate is what rejects "brake, then a hard speed bump"', () => {
  for (const seed of SEEDS) {
    assert.equal(alerts('speed_bump', 16, seed, 'tilted').length, 0);
    assert.equal(alerts('speed_bump', 16, seed, 'tilted', { requireStop: 0 }).length, 1, `seed ${seed}`);
  }
});

test('ablation: the speed-collapse requirement is what rejects a phone dropped in a moving car', () => {
  let leaked = 0;
  for (const seed of SEEDS) {
    assert.equal(alerts('phone_drop', 8, seed, 'tilted').length, 0);
    leaked += alerts('phone_drop', 8, seed, 'tilted', { dropAKmh: 0, dropBKmh: 0, requireStop: 0 }).length;
  }
  assert.ok(leaked > 0, 'without the speed gates the phone drop should be able to alert');
});

test('known limitation: a 12 km/h shunt is deliberately not detected (25 km/h arming gate); lowering the gates would detect it', () => {
  const lowered = { armSpeedKmh: 5, armHoldMs: 2000, disarmSpeedKmh: 1, dropAKmh: 10 };
  for (const seed of SEEDS) {
    assert.equal(alerts('fender_bender_12', 16, seed, 'tilted').length, 0, `default config, seed ${seed}`);
    assert.equal(alerts('fender_bender_12', 16, seed, 'tilted', lowered).length, 1, `lowered gates, seed ${seed}`);
  }
});

// ---- robustness ----------------------------------------------------------------------------------------------------------
test('sampling rate: 50, 100 and 200 Hz all detect the crash; below that is unsupported (documented)', () => {
  for (const rateHz of [50, 100, 200]) for (const seed of SEEDS.slice(0, 5)) {
    const tr = makeTrace('frontal_45', { rangeG: 16, seed, mount: 'tilted', rateHz });
    assert.equal(replay(tr).decisions.filter((d) => d.kind === 'alert').length, 1, `${rateHz} Hz seed ${seed}`);
  }
});

test('the detector measures the real sampling rate and flags a slow sensor (rateOk) instead of silently under-protecting', () => {
  for (const [rateHz, ok] of [[25, false], [50, true], [100, true], [200, true]] as const) {
    const det = new Detector(16);
    replay(makeTrace('hard_brake', { rangeG: 16, seed: 1, rateHz }), det);
    assert.equal(det.rateOk, ok, `${rateHz} Hz`);
    assert.ok(Math.abs(det.measuredRateHz - rateHz) < rateHz * 0.1, `${det.measuredRateHz}`);
  }
  assert.equal(new Detector(16).rateOk, true, 'unknown until measured');
});

test('GPS latency: 0 to 7 s of lag still yields the alert (the 8 s evaluation window budgets for it)', () => {
  for (const gpsLagMs of [0, 800, 2000, 3500, 7000]) for (const seed of SEEDS.slice(0, 5)) {
    const tr = makeTrace('frontal_45', { rangeG: 16, seed, mount: 'tilted', gpsLagMs });
    assert.equal(replay(tr).decisions.filter((d) => d.kind === 'alert').length, 1, `lag ${gpsLagMs} ms seed ${seed}`);
  }
});

test('a huge single spike with no GPS history never arms the detector', () => {
  const tr = makeTrace('frontal_45', { rangeG: 16, seed: 1 });
  const r = replay({ samples: tr.samples, gps: [], rangeG: 16 });
  assert.deepEqual(r.decisions, []);
  assert.equal(r.finalState, 'IDLE');
});

test('NaN, duplicate and out-of-order samples are ignored, not fatal', () => {
  const det = new Detector(16);
  assert.deepEqual(det.pushSample({ t: 0, ax: NaN, ay: 0, az: 1, gx: 0, gy: 0, gz: 0 }), []);
  det.pushSample({ t: 10, ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0 });
  assert.deepEqual(det.pushSample({ t: 10, ax: 9, ay: 9, az: 9, gx: 0, gy: 0, gz: 0 }), []);
  assert.deepEqual(det.pushSample({ t: 5, ax: 9, ay: 9, az: 9, gx: 0, gy: 0, gz: 0 }), []);
  assert.equal(det.state, 'IDLE');
});

test('deterministic: same seed, same trace, same decisions', () => {
  const a = replay(makeTrace('rollover_71', { rangeG: 16, seed: 9 })).decisions;
  const b = replay(makeTrace('rollover_71', { rangeG: 16, seed: 9 })).decisions;
  assert.deepEqual(a, b);
  assert.notDeepEqual(makeTrace('rollover_71', { rangeG: 16, seed: 9 }).samples[500], makeTrace('rollover_71', { rangeG: 16, seed: 10 }).samples[500]);
});

test('CSV round trip (Sensor Lab / replay file format) gives the same decision', () => {
  for (const name of ['frontal_45', 'rollover_71', 'speed_bump', 'phone_drop'] as ScenarioName[]) {
    const tr = makeTrace(name, { rangeG: 16, seed: 4, mount: 'tilted' });
    const back = parseCsv(toCsv(tr));
    assert.equal(back.samples.length, tr.samples.length);
    const a = replay(tr).decisions.map((d) => [d.kind, d.rule]);
    const b = replay({ ...back, rangeG: 16 }).decisions.map((d) => [d.kind, d.rule]);
    assert.deepEqual(b, a, name);
  }
  assert.throws(() => parseCsv('a,b\n1,2'));
});

test('after an alert the detector waits for acknowledge(), then watches again', () => {
  const tr = makeTrace('frontal_45', { rangeG: 16, seed: 1 });
  const det = new Detector(16);
  const r = replay(tr, det);
  assert.equal(r.finalState, 'ALERT');
  det.acknowledge();
  assert.equal(det.state, 'ARMED');
});

test('end to end with the protocol package: phone-clipped G still produces a valid packet and a sensible server-side band', () => {
  const [a] = alerts('frontal_45', 8, 3, 'tilted');
  const h = toPacketHints(a!, 8);
  const pkt: DzmsdPacket = {
    id: 'K7Q2M', band: 'U', score: 0, conf: 'L', lat: 36.47213, lon: 2.82871, time: '1432', src: 'A',
    veh: 1, pers: 1, kinds: ['C'], dv: h.D, g: h.G, roll: h.RO, flags: ['N'],
  };
  const wire = encodeDzmsd(pkt);
  assert.ok(wire.length <= 160, wire);
  const back = decodeDzmsd(wire);
  assert.ok(back.ok);
  const sv = assess({ dvKmh: h.D, peakG: h.G, rollover: h.RO, noResponse: true, kinds: ['C'], vehicles: 1, persons: 1 });
  // a clipped ±8 g reading must not be able to produce more points than a real one would
  const real = assess({ dvKmh: h.D, peakG: 38, rollover: h.RO, noResponse: true, kinds: ['C'], vehicles: 1, persons: 1 });
  assert.ok(sv.score <= real.score);
  assert.ok(['R', 'O', 'Y'].includes(sv.band), `band ${sv.band}`);
});

test('simulated BOX source (roadmap, docs/16): a ±200 g range reports the real pulse unclipped and is never "sensor limited"', () => {
  for (const seed of SEEDS.slice(0, 8)) {
    const [a] = alerts('frontal_45', 200, seed, 'aligned');
    assert.ok(a, `seed ${seed}`);
    assert.equal(a.metrics.sensorLimited, false);
    assert.ok(a.metrics.peakG > 25 && a.metrics.peakG < 40, `peak ${a.metrics.peakG}`); // model peak is 32 g
    assert.ok(!a.reasons.includes('impact_at_sensor_limit'));
    assert.ok(toPacketHints(a, 200).G > 16, 'a box may send a G above any phone range');
  }
});
