import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CROCKFORD, FLAG_ORDER, KIND_ORDER, SOURCE_VALUES } from '@sellekni/shared';
import { CrewUpdate, FLAG_LETTER, IncidentId, IncidentJson, KIND_LETTER, SOURCE_LETTER } from '../src/index';

const example = {
  v: 1, incident_id: 'K7Q2M', source: 'auto', created_at: '2026-10-30T14:32:07+01:00',
  location: { lat: 36.47213, lon: 2.82871, acc_m: 8, heading: 175, plus_code: '8F84FRCH+VF' },
  crash: { dv_kmh: 71, peak_g: 38, rollover: true, multi_impact: false, no_response: true },
  scene: { vehicles: 1, persons: 1, kinds: ['car'], flags: ['no_response'], fire: false },
  vitals: { hr: 124, spo2: 89, source: 'ble_watch' },
  medical: { blood: 'O+', anticoagulant: false, allergies: [], consent: true },
  contact: { callback: '+213555000000', lang: 'ar' },
  device: { app: 'sellekni/0.1', battery: 61 },
};

test('docs/05 §2 example parses', () => {
  assert.equal(IncidentJson.parse(example).incident_id, 'K7Q2M');
});

test('letter maps are a bijection onto the shared packet vocabulary', () => {
  assert.deepEqual(new Set(Object.values(KIND_LETTER)), new Set(KIND_ORDER));
  assert.deepEqual(new Set(Object.values(FLAG_LETTER)), new Set(FLAG_ORDER));
  assert.deepEqual(new Set(Object.values(SOURCE_LETTER)), new Set(SOURCE_VALUES));
});

test('incident id accepts exactly the Crockford alphabet', () => {
  for (const c of CROCKFORD) assert.ok(IncidentId.safeParse(`${c}AAAA`).success, c);
  for (const c of 'ILOU') assert.ok(!IncidentId.safeParse(`${c}AAAA`).success, c);
  assert.ok(!IncidentId.safeParse('k7q2m').success);
});

test('rejects medical data without consent, unknown fields and bad ranges', () => {
  assert.ok(!IncidentJson.safeParse({ ...example, medical: { blood: 'O+', consent: false } }).success);
  assert.ok(!IncidentJson.safeParse({ ...example, extra: 1 }).success);
  assert.ok(!IncidentJson.safeParse({ ...example, vitals: { spo2: 101 } }).success);
  assert.ok(!IncidentJson.safeParse({ ...example, created_at: '2026-10-30 14:32' }).success);
  assert.ok(!IncidentJson.safeParse({ ...example, scene: { ...example.scene, kinds: [] } }).success);
});

test('crew update needs at least one value', () => {
  assert.ok(!CrewUpdate.safeParse({}).success);
  assert.ok(CrewUpdate.safeParse({ gcs: 12 }).success);
  assert.ok(!CrewUpdate.safeParse({ gcs: 2 }).success);
});
