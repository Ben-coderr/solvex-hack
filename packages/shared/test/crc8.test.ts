import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc8, crc8Hex } from '../src/crc8';

test('CRC-8/SMBUS standard check value', () => {
  assert.equal(crc8('123456789'), 0xf4);
  assert.equal(crc8(''), 0);
});

test('hex is 2 uppercase digits', () => {
  assert.equal(crc8Hex('\u0001'), '07');
  assert.match(crc8Hex('NAJDA1'), /^[0-9A-F]{2}$/);
});

test('rejects non-ASCII', () => {
  assert.throws(() => crc8('é'), RangeError);
});

test('a single-character change is always detected (exhaustive over substitutions)', () => {
  const body = 'NAJDA1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF';
  const ref = crc8(body);
  const alphabet = ' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+,.-#';
  let tested = 0;
  for (let i = 0; i < body.length; i++) {
    for (const ch of alphabet) {
      if (ch === body[i]) continue;
      assert.notEqual(crc8(body.slice(0, i) + ch + body.slice(i + 1)), ref, `pos ${i} -> ${ch}`);
      tested++;
    }
  }
  assert.ok(tested > 3000);
});
