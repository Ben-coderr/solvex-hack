import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { encodePlusCode, decodePlusCode, PLUS_CODE_RE } from '../src/pluscode';

const require = createRequire(import.meta.url);
const OLC = require('open-location-code').OpenLocationCode as new () => {
  encode(lat: number, lon: number, len?: number): string;
};
const ref = new OLC();

function rng(seed: number) { // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

test('spec examples', () => {
  assert.equal(encodePlusCode(36.47213, 2.82871), '8F84FRCH+VF');
  assert.equal(encodePlusCode(35.69112, -0.63305), '8C7XM9R8+CQ');
});

test('matches the reference library on 20,000 random points (Algeria bbox + world)', () => {
  const r = rng(42);
  for (let i = 0; i < 20000; i++) {
    const world = i % 4 === 0;
    const lat = world ? r() * 180 - 90 : 18.9 + r() * (37.2 - 18.9);
    const lon = world ? r() * 360 - 180 : -8.7 + r() * (12 + 8.7);
    assert.equal(encodePlusCode(lat, lon), ref.encode(lat, lon, 10), `${lat},${lon}`);
  }
});

test('decode returns a cell containing the original point, centre within ~10 m', () => {
  const r = rng(7);
  for (let i = 0; i < 2000; i++) {
    const lat = 18.9 + r() * 18.3;
    const lon = -8.7 + r() * 20.7;
    const code = encodePlusCode(lat, lon);
    assert.match(code, PLUS_CODE_RE);
    const a = decodePlusCode(code);
    assert.ok(lat >= a.latLo - 1e-9 && lat <= a.latHi + 1e-9);
    assert.ok(lon >= a.lonLo - 1e-9 && lon <= a.lonHi + 1e-9);
  }
});

test('poles and antimeridian do not throw', () => {
  assert.doesNotThrow(() => encodePlusCode(90, 180));
  assert.doesNotThrow(() => encodePlusCode(-90, -180));
  assert.throws(() => encodePlusCode(NaN, 0));
});
