import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accelerometerRangeG, isRangeSupported, rangeGFrom, rateStats, type MotionSensor } from '../src/sensorlab/stats';

const sensor = (over: Partial<MotionSensor>): MotionSensor => ({
  kind: 'accelerometer', name: 'acc', vendor: 'v', version: 1, maximumRange: 78.4532, resolution: 0.0024,
  minDelayUs: 2500, maxDelayUs: 200_000, fifoMaxEventCount: 0, isWakeUp: false, isDefault: false, ...over,
});

test('T1: Android maximumRange (m/s²) -> rangeG, taken from the DEFAULT accelerometer; under 8 g is unsupported', () => {
  assert.equal(rangeGFrom(78.4532), 8);
  assert.equal(rangeGFrom(156.9064), 16);
  assert.equal(rangeGFrom(39.2266), 4);
  const list = [sensor({ maximumRange: 39.2266 }), sensor({ maximumRange: 156.9064, isDefault: true }), sensor({ kind: 'gyroscope', maximumRange: 34.9, isDefault: true })];
  assert.equal(accelerometerRangeG(list), 16);
  assert.equal(accelerometerRangeG([sensor({ maximumRange: 78.4532 })]), 8, 'no default flag: the first accelerometer');
  assert.equal(accelerometerRangeG([sensor({ kind: 'gyroscope' })]), null);
  assert.equal(isRangeSupported(8), true);
  assert.equal(isRangeSupported(4), false);
});

test('T3: median / p95 / longest gap from sensor timestamps; under 45 Hz is not ok', () => {
  const t100 = Array.from({ length: 501 }, (_, i) => i * 10 + (i % 5 === 0 ? 0 : 0.5));
  const s = rateStats(t100)!;
  assert.ok(Math.abs(s.medianHz - 100) < 6, String(s.medianHz));
  assert.equal(s.ok, true);
  assert.equal(s.samples, 501);

  const withStall = [...Array.from({ length: 200 }, (_, i) => i * 10), ...Array.from({ length: 200 }, (_, i) => 3_000 + i * 10)];
  assert.equal(rateStats(withStall)!.maxGapMs, 1_010);

  const t25 = Array.from({ length: 200 }, (_, i) => i * 40);
  assert.equal(rateStats(t25)!.medianHz, 25);
  assert.equal(rateStats(t25)!.ok, false);
  assert.equal(rateStats([0, 10, 20]), null, 'too few samples to say anything');
});
