import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fallbackEtaMin, haversineKm, rankHospitals, requiredCapabilities, type HospitalRecord, type StatusRecord,
} from '../src/index';

const ALL = ['ed24', 'general_surgery', 'trauma_surgery', 'ct', 'icu', 'neurosurgery', 'pediatrics', 'burns'] as const;
const H: HospitalRecord[] = [
  { id: 'CHU-A', name: 'CHU-A', level: 'A', lat: 36.7, lon: 3.0, capabilities: [...ALL] },
  { id: 'EPH-B', name: 'EPH-B', level: 'B', lat: 36.5, lon: 2.9, capabilities: ['ed24', 'general_surgery', 'trauma_surgery', 'ct'] },
  { id: 'CHU-C', name: 'CHU-C', level: 'A', lat: 36.2, lon: 2.4, capabilities: ['ed24', 'general_surgery', 'trauma_surgery', 'ct', 'icu', 'neurosurgery'] },
];
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const h = (x: number) => x * 3_600_000;
const STATUS: Record<string, StatusRecord> = {
  'EPH-B': { status: 'OK', setAt: NOW - h(1.5) },
  'CHU-C': { status: 'SATURATED', setAt: NOW - h(1) },
};
const INC = { lat: 36.47213, lon: 2.82871 };

test('required capabilities by band and flag', () => {
  assert.deepEqual(requiredCapabilities('R', ['N']), ['ed24', 'trauma_surgery', 'ct', 'icu', 'neurosurgery']);
  assert.deepEqual(requiredCapabilities('R', ['U', 'C', 'F']), ['ed24', 'trauma_surgery', 'ct', 'icu', 'neurosurgery', 'pediatrics', 'burns']);
  assert.deepEqual(requiredCapabilities('O'), ['ed24', 'general_surgery', 'ct']);
  assert.deepEqual(requiredCapabilities('Y'), ['ed24']);
  assert.deepEqual(requiredCapabilities('U'), ['ed24']);
});

test('WORKED EXAMPLE (spec §8): scores CHU-A 0.76, CHU-C 0.43, EPH-B 0.77 (spec printed 0.71 — arithmetic slip)', () => {
  const r = rankHospitals({
    band: 'R', flags: ['N'], incident: INC, hospitals: H, now: NOW, statuses: STATUS,
    etaMin: { 'CHU-A': 24, 'EPH-B': 9, 'CHU-C': 58 },
  });
  const by = Object.fromEntries(r.all.map((x) => [x.hospitalId, x]));
  assert.equal(by['CHU-A']!.score, 0.76);
  assert.equal(by['CHU-C']!.score, 0.43);
  assert.equal(by['EPH-B']!.score, 0.77);
  assert.deepEqual(by['EPH-B']!.missing, ['icu', 'neurosurgery']);
  assert.deepEqual(by['CHU-A']!.parts, { T: 0.6, C: 1, L: 0.6, A: 1 });
});

test('the C>=0.75 gate (Level-A within 60 min) is what puts CHU-A first even though EPH-B scores higher raw', () => {
  const r = rankHospitals({
    band: 'R', flags: ['N'], incident: INC, hospitals: H, now: NOW, statuses: STATUS,
    etaMin: { 'CHU-A': 24, 'EPH-B': 9, 'CHU-C': 58 },
  });
  assert.equal(r.mode, 'direct');
  assert.deepEqual(r.all.map((x) => x.hospitalId), ['CHU-A', 'CHU-C', 'EPH-B']);
  // without the gate (band O) EPH-B wins on the weighted score, as the formula says
  const o = rankHospitals({ band: 'O', incident: INC, hospitals: H, now: NOW, statuses: STATUS, etaMin: { 'CHU-A': 24, 'EPH-B': 9, 'CHU-C': 58 } });
  assert.equal(o.all[0]!.hospitalId, 'EPH-B');
});

test('nearest ED is always reported separately (dispatcher never loses sight of it)', () => {
  const r = rankHospitals({ band: 'R', flags: ['N'], incident: INC, hospitals: H, now: NOW, etaMin: { 'CHU-A': 24, 'EPH-B': 9, 'CHU-C': 58 } });
  assert.equal(r.nearestEd?.hospitalId, 'EPH-B');
});

test('no Level-A within 60 min => stabilise-then-transfer: best Level-B first, flagged', () => {
  const r = rankHospitals({ band: 'R', flags: ['N'], incident: INC, hospitals: H, now: NOW, etaMin: { 'CHU-A': 75, 'EPH-B': 9, 'CHU-C': 80 } });
  assert.equal(r.mode, 'stabilise_transfer');
  assert.equal(r.all[0]!.hospitalId, 'EPH-B');
  assert.ok(r.all[0]!.flags.includes('STABILISE_THEN_TRANSFER'));
  assert.match(r.note, /stabilise/);
});

test('facilities beyond 90 min are excluded; empty result says so', () => {
  const r = rankHospitals({ band: 'R', incident: INC, hospitals: H, now: NOW, etaMin: { 'CHU-A': 91, 'EPH-B': 120, 'CHU-C': 200 } });
  assert.equal(r.mode, 'no_candidate');
  assert.equal(r.items.length, 0);
  assert.equal(r.nearestEd, null);
});

test('status older than 6 h decays to UNKNOWN; fresh statuses count', () => {
  const stale = { 'EPH-B': { status: 'SATURATED', setAt: NOW - h(6.5) } as StatusRecord };
  const r = rankHospitals({ band: 'Y', incident: INC, hospitals: H, now: NOW, statuses: stale, etaMin: { 'EPH-B': 10 } });
  const b = r.all.find((x) => x.hospitalId === 'EPH-B')!;
  assert.equal(b.status, 'UNKNOWN');
  assert.equal(b.parts.L, 0.6);
  assert.ok(b.flags.includes('STATUS_UNKNOWN'));
  const fresh = rankHospitals({ band: 'Y', incident: INC, hospitals: H, now: NOW, statuses: { 'EPH-B': { status: 'SATURATED', setAt: NOW - h(5.9) } }, etaMin: { 'EPH-B': 10 } });
  assert.equal(fresh.all.find((x) => x.hospitalId === 'EPH-B')!.status, 'SATURATED');
});

test('missing ETA falls back to haversine x 1.4 detour at 60 km/h and is flagged', () => {
  const km = haversineKm(INC.lat, INC.lon, 36.5, 2.9);
  assert.ok(km > 6 && km < 8);
  assert.ok(Math.abs(fallbackEtaMin(10) - 14) < 1e-9);
  const r = rankHospitals({ band: 'Y', incident: INC, hospitals: [H[1]!], now: NOW });
  assert.equal(r.all[0]!.etaSource, 'fallback');
  assert.ok(r.all[0]!.flags.includes('ETA_ESTIMATED'));
});

test('explanation names the missing capabilities', () => {
  const r = rankHospitals({ band: 'R', flags: ['N'], incident: INC, hospitals: H, now: NOW, etaMin: { 'CHU-A': 24, 'EPH-B': 9, 'CHU-C': 58 } });
  assert.match(r.all.find((x) => x.hospitalId === 'EPH-B')!.explanation, /missing: icu, neurosurgery.*secondary transfer/);
  assert.match(r.all.find((x) => x.hospitalId === 'CHU-A')!.explanation, /all 5 capabilities, 24 min/);
});

test('haversine sanity: Algiers -> Oran about 355 km', () => {
  const d = haversineKm(36.7538, 3.0588, 35.6971, -0.6308);
  assert.ok(d > 350 && d < 360, String(d));
});
