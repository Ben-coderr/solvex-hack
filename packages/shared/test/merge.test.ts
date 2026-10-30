import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, decodeDzmsdOrThrow, mergePackets, shouldMerge, type DzmsdPacket } from '../src/index';

const WIRE1 = 'NAJDA1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF #04';
const WIRE2 = 'NAJDA1 P3N8D Y44M 35.69112,-0.63305 T0915 SW V1 P2 KCP FXC 8C7XM9R8+CQ #55';
const at = (iso: string) => new Date(iso);

test('shouldMerge: same id always; otherwise <= 300 m AND <= 10 min (inclusive edges)', () => {
  const base = { id: 'AAAAA', lat: 36.0, lon: 3.0, at: at('2026-10-30T13:30:00Z') };
  // 0.0027 deg latitude ~ 300.2 m ; use 0.0026 ~ 289 m and 0.0028 ~ 311 m
  assert.equal(shouldMerge(base, { ...base, id: 'BBBBB', lat: 36.0026 }), true);
  assert.equal(shouldMerge(base, { ...base, id: 'BBBBB', lat: 36.0028 }), false);
  assert.equal(shouldMerge(base, { ...base, id: 'BBBBB', at: at('2026-10-30T13:40:00Z') }), true);
  assert.equal(shouldMerge(base, { ...base, id: 'BBBBB', at: at('2026-10-30T13:40:01Z') }), false);
  assert.equal(shouldMerge(base, { ...base, id: 'BBBBB', at: at('2026-10-30T13:20:00Z') }), true); // symmetric in time
  assert.equal(shouldMerge(base, { id: 'AAAAA', lat: 10, lon: 10, at: at('2026-01-01T00:00:00Z') }), true); // same id
});

test('witness + auto report on the same crash: confidence rises M -> H (demo step 7)', () => {
  const witness: DzmsdPacket = { id: 'W0001', band: 'Y', score: 44, conf: 'M', lat: 36.47213, lon: 2.82871, time: '1433', src: 'W', veh: 2, pers: 2, kinds: ['C', 'M'], flags: ['X', 'C'] };
  const alone = assess(merged([witness]));
  assert.equal(alone.conf, 'M');
  const both = mergePackets([decodeDzmsdOrThrow(WIRE1), witness]);
  const a = assess(both.input);
  assert.equal(a.conf, 'H');
  assert.deepEqual(both.ids, ['K7Q2M', 'W0001']);
  assert.equal(both.input.persons, 2);
  assert.equal(both.input.vehicles, 2);
  assert.deepEqual(both.input.kinds, ['C', 'M']);
  assert.deepEqual(both.input.flags, ['N', 'X', 'C']);
  assert.equal(both.input.dvKmh, 71);
  assert.equal(both.lat, 36.47213); // anchored on the sensor (A) packet
  assert.equal(both.time, '1432');
  assert.equal(a.band, 'R');
  assert.deepEqual(a.resourceHints, ['extrication']);
});

test('a repeated id is an UPDATE, not a second independent report (last wins)', () => {
  const first = decodeDzmsdOrThrow(WIRE1);
  const update: DzmsdPacket = { ...first, spo2: 95, hr: 110 };
  const m = mergePackets([first, update]);
  assert.deepEqual(m.ids, ['K7Q2M']);
  assert.equal(m.input.independentReports, 1);
  assert.equal(m.input.spo2, 95);
  assert.equal(assess(m.input).redCriteria.includes('spo2_low'), false);
});

test('merge never loses a danger signal: flags and rollover are unions', () => {
  const a: DzmsdPacket = { id: 'AAAAA', band: 'U', score: 0, conf: 'L', lat: 1, lon: 1, time: '1000', src: 'W', veh: 1, pers: 1, kinds: ['C'], flags: ['H'] };
  const b: DzmsdPacket = { ...a, id: 'BBBBB', time: '1001', flags: ['F'], roll: true, dv: 50 };
  const m = mergePackets([a, b]);
  assert.deepEqual(m.input.flags, ['H', 'F']);
  assert.equal(m.input.rollover, true);
  assert.equal(assess(m.input).band, 'R'); // heavy bleeding is RED
});

test('empty input is a programming error', () => {
  assert.throws(() => mergePackets([]), RangeError);
});

test('the two spec examples are far apart (Blida-area vs Oran-area): never merged', () => {
  const p1 = decodeDzmsdOrThrow(WIRE1), p2 = decodeDzmsdOrThrow(WIRE2);
  assert.equal(shouldMerge({ id: p1.id, lat: p1.lat, lon: p1.lon, at: at('2026-10-30T13:32:00Z') }, { id: p2.id, lat: p2.lat, lon: p2.lon, at: at('2026-10-30T13:32:00Z') }), false);
});

function merged(ps: DzmsdPacket[]) { return mergePackets(ps).input; }
