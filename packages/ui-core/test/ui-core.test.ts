import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAND_ORDER, TRIAGE_SHAPE, formatAge, goldenFraction, packetView, ringDash, triageGeometry } from '../src/index';

const EX1 = 'SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF #0E';
// change the last CRC digit: a checksum failure whatever the magic (scripts/rename-magic.mjs)
const corruptCrc = (wire: string) => wire.slice(0, -1) + (wire.endsWith('F') ? 'E' : 'F');
const EX2 = 'SLK1 P3N8D Y44M 35.69112,-0.63305 T0915 SW V1 P2 KCP FXC 8C7XM9R8+CQ #30';

test('every band has a distinct shape (greyscale-safe)', () => {
  assert.equal(new Set(BAND_ORDER.map((b) => TRIAGE_SHAPE[b])).size, 5);
  assert.equal(new Set(BAND_ORDER.map((b) => triageGeometry(b).path)).size, 5);
});

test('canonical packet → typed chips, all ok, 91/160 basic GSM-7', () => {
  const v = packetView(EX1);
  assert.deepEqual(v.tokens.map((t) => t.kind), [
    'magic', 'id', 'assessment', 'coords', 'time', 'source', 'count', 'count', 'kinds',
    'physics', 'physics', 'physics', 'flags', 'vital', 'vital', 'plus', 'crc',
  ]);
  assert.ok(v.tokens.every((t) => t.state === 'ok'));
  assert.equal(v.length, 91);
  assert.equal(v.basicGsm7, true);
  assert.equal(packetView(EX2).length, 72);
});

test('a bad CRC marks the CRC chip invalid and the rest suspect; other errors mark everything invalid', () => {
  const bad = packetView(corruptCrc(EX1));
  assert.equal(bad.tokens.at(-1)!.state, 'invalid');
  assert.ok(bad.tokens.slice(0, -1).every((t) => t.state === 'suspect'));
  const junk = packetView('hello world');
  assert.ok(junk.tokens.every((t) => t.state === 'invalid'));
});

test('ring maths and age formatting', () => {
  assert.equal(goldenFraction(30), 0.5);
  assert.equal(goldenFraction(-5), 0);
  assert.equal(goldenFraction(90), 1);
  const d = ringDash(10, 0.25);
  assert.ok(Math.abs(d.offset - d.circumference * 0.75) < 1e-9);
  assert.deepEqual(formatAge(42_000), { value: '0:42', unit: 'clock' });
  assert.deepEqual(formatAge(12 * 60_000 + 5_000), { value: '12', unit: 'min' });
  assert.deepEqual(formatAge(125 * 60_000), { value: '2:05', unit: 'h' });
});
