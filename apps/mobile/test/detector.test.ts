import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DETECTOR_CONFIG } from '../src/detector/config';
import { createDetector, runTrace, type DetectorEvent, type Sample } from '../src/detector/detector';
import { makeTrace, TRACE_EXPECTS, TRACE_NAMES, type TraceName } from '../src/detector/synth';
import { parseCsv, toCsv, TraceError } from '../src/detector/trace';

const confirms = (ev: DetectorEvent[]) => ev.filter((e) => e.type === 'confirm');
const crashOf = (name: TraceName) => {
  const c = confirms(runTrace(makeTrace(name)));
  assert.equal(c.length, 1, `${name}: exactly one CONFIRM`);
  return (c[0] as Extract<DetectorEvent, { type: 'confirm' }>).crash;
};

for (const name of TRACE_NAMES) {
  test(`${name}: ${TRACE_EXPECTS[name] === 'alert' ? 'alerts' : 'must NOT alert'}`, () => {
    const n = confirms(runTrace(makeTrace(name))).length;
    assert.equal(n, TRACE_EXPECTS[name] === 'alert' ? 1 : 0);
  });
}

test('rollover_71: rule c, rollover flag, dv ≈ 71 km/h', () => {
  const c = crashOf('rollover_71');
  assert.equal(c.rule, 'c');
  assert.equal(c.rollover, true);
  assert.ok(Math.abs(c.dvKmh - 71) <= 3, `dv ${c.dvKmh}`);
  assert.ok(c.peakG >= 4, `peak ${c.peakG}`);
});

test('frontal_45: high-g rule, no rollover, dv ≈ 45 km/h', () => {
  const c = crashOf('frontal_45');
  assert.ok(c.rule === 'a' || c.rule === 'b');
  assert.equal(c.rollover, false);
  assert.ok(Math.abs(c.dvKmh - 45) <= 3, `dv ${c.dvKmh}`);
  assert.ok(c.peakG >= DETECTOR_CONFIG.bPeakG, `peak ${c.peakG}`);
});

test('phone_drop at 60 km/h: the tumble makes a CANDIDATE, CONFIRM rejects it because the car keeps moving', () => {
  const ev = runTrace(makeTrace('phone_drop'));
  assert.deepEqual(ev.map((e) => e.type), ['armed', 'candidate', 'rejected']);
});

test('walking (with a drop on the pavement): the speed gate never arms', () => {
  assert.deepEqual(runTrace(makeTrace('walking')), []);
});

test('hard_brake and speed_bump arm but never become a candidate', () => {
  for (const n of ['hard_brake', 'speed_bump'] as const) assert.deepEqual(runTrace(makeTrace(n)).map((e) => e.type), ['armed']);
});

test('DETERMINISTIC: same trace → same decisions, run after run and live vs CSV replay', () => {
  for (const name of TRACE_NAMES) {
    const s = makeTrace(name);
    const a = runTrace(s);
    assert.deepEqual(runTrace(s), a, `${name}: second run`);
    const replayed = runTrace(parseCsv(toCsv(s)));
    assert.deepEqual(replayed.map((e) => [e.type, e.t]), a.map((e) => [e.type, e.t]), `${name}: CSV replay`);
  }
});

test('PROPERTY: 40 jittered copies of each negative trace never alert', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
  for (const name of TRACE_NAMES.filter((n) => TRACE_EXPECTS[n] === 'no_alert')) {
    const base = makeTrace(name);
    for (let k = 0; k < 40; k++) {
      const jittered: Sample[] = base.map((s) => ({ ...s, ax: s.ax + rand() * 0.05, ay: s.ay + rand() * 0.05, az: s.az + rand() * 0.05 }));
      assert.equal(confirms(runTrace(jittered)).length, 0, `${name} copy ${k}`);
    }
  }
});

test('countdown: "I\'m OK" goes back to ARMED, an alert goes to IDLE, resolve outside COUNTDOWN is ignored', () => {
  for (const [outcome, next] of [['ok', 'ARMED'], ['alerted', 'IDLE']] as const) {
    const d = createDetector();
    assert.deepEqual(d.resolve(outcome, 0), []);
    for (const s of makeTrace('frontal_45')) d.push(s);
    assert.equal(d.snapshot().state, 'COUNTDOWN');
    assert.deepEqual(d.resolve(outcome, 99_000), [{ type: 'resolved', t: 99_000, outcome }]);
    assert.equal(d.snapshot().state, next);
  }
});

test('no GPS fix at all: a 12 g impact cannot arm the detector (SOS stays available)', () => {
  const s = makeTrace('frontal_45').map((x) => ({ ...x, speed: null }));
  assert.deepEqual(runTrace(s), []);
});

test('DISARM after more than 3 min below 10 km/h', () => {
  const s: Sample[] = [];
  for (let t = 0; t <= 200_000; t += 100) s.push({ t, ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0, speed: t < 15_000 ? 40 : 3 });
  const ev = runTrace(s);
  assert.deepEqual(ev.map((e) => e.type), ['armed', 'disarmed']);
  assert.ok(ev[1]!.t > 15_000 + DETECTOR_CONFIG.disarmHoldMs);
});

test('the speed gate needs 10 s above 25 km/h (a 9 s burst does not arm)', () => {
  const s: Sample[] = [];
  for (let t = 0; t <= 30_000; t += 100) s.push({ t, ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0, speed: t < 9_000 ? 40 : 10 });
  assert.deepEqual(runTrace(s), []);
});

test('data/traces/*.csv are exactly what the generator produces (run `pnpm --filter mobile traces`)', () => {
  for (const name of TRACE_NAMES) {
    const onDisk = readFileSync(new URL(`../../../data/traces/${name}.csv`, import.meta.url), 'utf8');
    assert.equal(onDisk, toCsv(makeTrace(name)), name);
  }
});

test('parseCsv refuses malformed traces with the line number', () => {
  assert.throws(() => parseCsv('t,x\n1,2'), TraceError);
  assert.throws(() => parseCsv('t,ax,ay,az,gx,gy,gz,speed\n0,0,0,1,0,0,0'), /line 2: expected 8 columns/);
  assert.throws(() => parseCsv('t,ax,ay,az,gx,gy,gz,speed\n0,0,0,1,0,0,0,x'), /line 2: not a number/);
  assert.throws(() => parseCsv('t,ax,ay,az,gx,gy,gz,speed\n20,0,0,1,0,0,0,\n10,0,0,1,0,0,0,'), /line 3: time goes backwards/);
  assert.equal(parseCsv('t,ax,ay,az,gx,gy,gz,speed\r\n0,0,0,1,0,0,0,\r\n')[0]!.speed, null);
});
