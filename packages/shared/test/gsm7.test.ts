import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gsm7Length, isGsm7, isGsm7Basic, __internal } from '../src/gsm7';

test('basic table has 128 entries', () => assert.equal([...__internal.BASIC].length, 128));

test('plain ASCII packet chars are basic GSM-7', () => {
  const s = 'SLK1 K7Q2M R75H 36.47213,-2.82871 T1432 SA V1 P1 KC #92 8F84FRCH+VF';
  assert.equal(gsm7Length(s), s.length);
  assert.ok(isGsm7Basic(s));
});

test('extension chars cost 2 septets', () => {
  assert.equal(gsm7Length('{}'), 4);
  assert.equal(gsm7Length('€'), 2);
  assert.equal(isGsm7Basic('{'), false);
  assert.equal(isGsm7('{'), true);
});

test('Arabic and most accents force UCS-2 (not GSM-7)', () => {
  assert.equal(gsm7Length('نجدة'), null);
  assert.equal(isGsm7('ç'), false); // lowercase c-cedilla is NOT in GSM-7 (only uppercase Ç)
  assert.equal(isGsm7('é'), true);
});
