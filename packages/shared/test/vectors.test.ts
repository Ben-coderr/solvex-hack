/**
 * GOLDEN-VECTOR tests: the committed JSON files in test-vectors/ are the contract.
 * If you change the protocol or the scoring on purpose: update docs/05, update scripts/crosscheck.py,
 * run `pnpm vectors`, review the diff of test-vectors/, and commit it. Never "fix" a failing test by regenerating blindly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assess, crc8Hex, decodeDzmsd, encodeDzmsd, rankHospitals, type AssessmentInput, type DzmsdPacket } from '../src/index';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-vectors');
const load = <T,>(name: string): T => JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;

test('crc8.json', () => {
  for (const c of load<{ cases: Array<{ input: string; crc: string }> }>('crc8.json').cases) assert.equal(crc8Hex(c.input), c.crc, c.input);
});

test('dzmsd-valid.json: encode(packet) === wire and decode(wire) === packet', () => {
  const { cases } = load<{ cases: Array<{ name: string; packet: DzmsdPacket; wire: string }> }>('dzmsd-valid.json');
  assert.ok(cases.length >= 300);
  for (const c of cases) {
    assert.equal(encodeDzmsd(c.packet), c.wire, c.name);
    const d = decodeDzmsd(c.wire);
    assert.ok(d.ok, c.name);
    assert.deepEqual(d.packet, c.packet, c.name);
  }
});

test('dzmsd-invalid.json: every message is rejected with the documented code', () => {
  const { cases } = load<{ cases: Array<{ wire: string; code: string }> }>('dzmsd-invalid.json');
  assert.ok(cases.length >= 100);
  for (const c of cases) {
    const d = decodeDzmsd(c.wire);
    assert.equal(d.ok, false, c.wire);
    assert.equal(!d.ok && d.code, c.code, c.wire);
  }
});

test('nsi-cases.json: band, score, confidence, raw points, RED criteria are reproduced exactly', () => {
  const { cases } = load<{ cases: Array<{ input: AssessmentInput; expected: Record<string, unknown> }> }>('nsi-cases.json');
  assert.ok(cases.length >= 400);
  for (const c of cases) {
    const a = assess(c.input);
    assert.deepEqual(
      { band: a.band, score: a.score, conf: a.conf, rawPoints: a.rawPoints, redCriteria: a.redCriteria },
      c.expected, JSON.stringify(c.input),
    );
  }
});

test('ranking-worked-example.json', () => {
  const v = load<{ input: Parameters<typeof rankHospitals>[0]; expected: { required: string[]; mode: string; order: string[]; scores: Record<string, number> } }>('ranking-worked-example.json');
  const r = rankHospitals(v.input);
  assert.deepEqual(r.required, v.expected.required);
  assert.equal(r.mode, v.expected.mode);
  assert.deepEqual(r.all.map((x) => x.hospitalId), v.expected.order);
  assert.deepEqual(Object.fromEntries(r.all.map((x) => [x.hospitalId, x.score])), v.expected.scores);
});
