import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSpeedEstimator, haversineM, type RawFix } from '../src/detector/speed';

const T0 = 1_000_000;
/** a fix `m` metres north of the start, at second `s` */
const north = (s: number, m: number, extra: Partial<RawFix> = {}): RawFix =>
  ({ lat: 36.7 + m / 111_195, lon: 3.2, accM: 5, at: T0 + s * 1000, speedMps: null, ...extra });

test('haversine: 1/1000 degree of latitude ≈ 111 m', () => {
  assert.ok(Math.abs(haversineM({ lat: 36.7, lon: 3.2 }, { lat: 36.701, lon: 3.2 }) - 111.2) < 0.5);
});

test('speed: Android Doppler speed wins when present', () => {
  const e = createSpeedEstimator();
  assert.deepEqual(e.update(north(0, 0, { speedMps: 20 })), { kmh: 72, source: 'gps' });
});

test('speed: no Doppler → computed from fixes ≥ 3 s apart (72 km/h)', () => {
  const e = createSpeedEstimator();
  let last = null;
  for (let s = 0; s <= 6; s++) last = e.update(north(s, s * 20));
  assert.equal(last?.source, 'computed');
  assert.ok(Math.abs(last!.kmh - 72) < 1, `got ${last?.kmh}`);
});

test('speed: 25 km/h is seen (not lost in jitter)', () => {
  const e = createSpeedEstimator();
  let last = null;
  for (let s = 0; s <= 6; s++) last = e.update(north(s, s * (25 / 3.6), { accM: 10 }));
  assert.ok(last!.kmh > 24 && last!.kmh < 26, `got ${last?.kmh}`);
});

test('speed: a parked phone with GPS jitter reads 0, not a fake speed', () => {
  const e = createSpeedEstimator();
  const jitter = [0, 4, -3, 5, -2, 3, -4, 2];
  let last = null;
  for (let s = 0; s < jitter.length; s++) last = e.update(north(s, jitter[s]!, { accM: 6 }));
  assert.equal(last?.kmh, 0);
});

test('speed: inaccurate fixes are not used', () => {
  const e = createSpeedEstimator();
  let last = null;
  for (let s = 0; s <= 6; s++) last = e.update(north(s, s * 20, { accM: 60 }));
  assert.equal(last, null);
});

test('speed: a hard stop shows within ~4 s (short baseline, not a 10 s average)', () => {
  const e = createSpeedEstimator();
  let m = 0;
  for (let s = 0; s <= 10; s++) { e.update(north(s, m)); m += 20; } // 72 km/h
  let last = null;
  for (let s = 11; s <= 15; s++) last = e.update(north(s, m)); // stopped dead
  assert.equal(last?.kmh, 0);
});
