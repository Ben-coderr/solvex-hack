import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess, decodeDzmsdOrThrow, inputFromPacket, scoreFromRaw, DISCLAIMER, ENGINE_VERSION } from '../src/index';

const WIRE1 = 'SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF #0E';
const WIRE2 = 'SLK1 P3N8D Y44M 35.69112,-0.63305 T0915 SW V1 P2 KCP FXC 8C7XM9R8+CQ #30';

test('saturating curve: spec anchor points', () => {
  assert.equal(scoreFromRaw(0), 0);
  assert.equal(scoreFromRaw(36), 45);
  assert.equal(scoreFromRaw(72), 69);
  assert.equal(scoreFromRaw(120), 86);
  assert.equal(scoreFromRaw(85), 75);
  assert.equal(scoreFromRaw(35), 44);
  assert.equal(scoreFromRaw(10_000), 99);
});

test('CORRECTED anchors (the source docs had arithmetic slips): raw 90 -> 77, 110 -> 83, 150 -> 91', () => {
  assert.equal(scoreFromRaw(90), 77);
  assert.equal(scoreFromRaw(110), 83);
  assert.equal(scoreFromRaw(150), 91);
});

test('Ex1 (auto, rollover, SpO2 89): R75 H — reasons match the spec', () => {
  const a = assess({ dvKmh: 71, peakG: 38, rollover: true, noResponse: true, spo2: 89, hr: 124, flags: ['N'], kinds: ['C'] });
  assert.equal(a.rawPoints, 85);
  assert.deepEqual([a.band, a.score, a.conf], ['R', 75, 'H']);
  assert.deepEqual(a.reasons.map((r) => r.text), ['Speed drop ~71 km/h', 'SpO2 89%', 'Rollover detected']);
  assert.deepEqual(a.redCriteria, ['spo2_low']);
  assert.equal(a.disclaimer, DISCLAIMER);
  assert.equal(a.engineVersion, ENGINE_VERSION);
});

test('HR 124 is NOT counted (threshold is >130 or <50) — this is why raw is 85, not 100', () => {
  const base = { dvKmh: 71, peakG: 38, rollover: true, noResponse: true, spo2: 89 };
  assert.equal(assess({ ...base, hr: 124 }).rawPoints, 85);
  assert.equal(assess({ ...base, hr: 131 }).rawPoints, 100);
  assert.equal(assess({ ...base, hr: 49 }).rawPoints, 100);
});

test('Ex2 (witness: pedestrian, trapped, child): Y44 M', () => {
  const a = assess({ flags: ['X', 'C'], kinds: ['C', 'P'] });
  assert.deepEqual([a.band, a.score, a.conf, a.rawPoints], ['Y', 44, 'M', 35]);
  assert.deepEqual(a.resourceHints, ['extrication']);
});

test('moderate and minor spec cases', () => {
  const m = assess({ dvKmh: 45, peakG: 12 });
  assert.deepEqual([m.band, m.score], ['Y', 28]);
  assert.equal(assess({ dvKmh: 30 }).band, 'U'); // unconfirmed minor is UNKNOWN, never silently green
  const g = assess({ dvKmh: 30, confirmedOk: true });
  assert.deepEqual([g.band, g.score], ['G', 15]);
});

test('delta-v tiers: 24 -> 0, 25 -> 10, 40 -> 20, 60 -> 30', () => {
  const raw = (dvKmh: number) => assess({ dvKmh }).rawPoints;
  assert.deepEqual([24, 25, 39, 40, 59, 60, 200].map(raw), [0, 10, 10, 20, 20, 30, 30]);
});

test('physics subtotal is capped at 50 (30+5+15+5 = 55 -> 50)', () => {
  const a = assess({ dvKmh: 80, peakG: 40, rollover: true, multiImpact: true });
  assert.equal(a.physicsPoints, 50);
  assert.equal(a.physicsCapped, true);
  assert.equal(a.rawPoints, 50);
  assert.equal(a.score, scoreFromRaw(50));
});

test('every RED criterion alone forces band R (even with a tiny score)', () => {
  for (const [input, code] of [
    [{ flags: ['U'] }, 'unresponsive'],
    [{ flags: ['B'] }, 'breathing'],
    [{ flags: ['H'] }, 'bleeding'],
    [{ spo2: 89 }, 'spo2_low'],
    [{ gcs: 12 }, 'gcs_low'],
    [{ sbp: 89 }, 'sbp_low'],
  ] as const) {
    const a = assess(input as never);
    assert.equal(a.band, 'R', code);
    assert.deepEqual(a.redCriteria, [code]);
  }
  // boundaries are NOT red
  assert.notEqual(assess({ spo2: 90 }).band, 'R');
  assert.notEqual(assess({ gcs: 13 }).band, 'R');
  assert.notEqual(assess({ sbp: 90 }).band, 'R');
});

test('Vittel-style rule: mechanism-only evidence is capped at O, physiology lifts it to R', () => {
  const mech = { dvKmh: 71, peakG: 38, rollover: true, flags: ['E', 'D', 'X', 'C'] as const, kinds: ['M'] as const };
  const a = assess({ ...mech, flags: [...mech.flags], kinds: [...mech.kinds] });
  assert.ok(a.score >= 70);
  assert.equal(a.band, 'O');
  assert.match(a.capNote!, /Mechanism-only/);
  // add physiology (no response to countdown) => R
  assert.equal(assess({ ...mech, flags: [...mech.flags, 'N'], kinds: [...mech.kinds] }).band, 'R');
  // opt-out switch
  assert.equal(assess({ ...mech, flags: [...mech.flags], kinds: [...mech.kinds] }, { capMechanismOnly: false }).band, 'R');
});

test('band thresholds at the edges', () => {
  // find raw points that straddle 20, 45, 70 using the SAME curve, then build inputs from vulnerable-user + flags
  assert.equal(scoreFromRaw(7), 11);
  const band = (extra: object) => assess(extra as never).band;
  assert.equal(band({ kinds: ['P'] }), 'U');                 // 10 pts -> 15 -> U
  assert.equal(band({ kinds: ['P'], flags: ['C'] }), 'Y');   // 20 pts -> 28 -> Y
  assert.equal(band({ dvKmh: 45, flags: ['X', 'C'] }), 'O'); // 20+15+10=45 -> 52 -> O
});

test('confidence: sources agree -> H; one source with >=3 inputs -> M; else L; merged reports lift it', () => {
  assert.equal(assess({ dvKmh: 71, spo2: 89 }).conf, 'H');
  assert.equal(assess({ flags: ['X', 'C'], kinds: ['P'] }).conf, 'M');
  assert.equal(assess({ dvKmh: 71 }).conf, 'L');
  assert.equal(assess({ dvKmh: 71, independentReports: 2 }).conf, 'M');
  assert.equal(assess({ dvKmh: 71, independentReports: 3 }).conf, 'H');
  assert.equal(assess({ flags: ['X', 'C'], kinds: ['P'], independentReports: 2 }).conf, 'H'); // demo: M -> H on merge
  assert.equal(assess({ dvKmh: 71, independentReports: 99 }).conf, 'H');                       // clamped
});

test('profile modifiers add 5 each', () => {
  assert.equal(assess({ age: 64 }).rawPoints, 0);
  assert.equal(assess({ age: 65, pregnant: true, anticoagulant: true }).rawPoints, 15);
});

test('resource hints: extrication, fire, mass-casualty', () => {
  assert.deepEqual(assess({ flags: ['X', 'F'], persons: 2 }).resourceHints, ['extrication', 'fire']);
  assert.deepEqual(assess({ persons: 5 }).resourceHints, ['mci']);
  assert.deepEqual(assess({ kinds: ['B'], persons: 3 }).resourceHints, ['mci']);
  assert.deepEqual(assess({ kinds: ['B'], persons: 2 }).resourceHints, []);
});

test('SERVER RECOMPUTE from the two decoded SMS packets reproduces the phone-side band/score/conf', () => {
  for (const wire of [WIRE1, WIRE2]) {
    const p = decodeDzmsdOrThrow(wire);
    const a = assess(inputFromPacket(p, p.flags?.includes('N') ? { noResponse: true } : {}));
    assert.deepEqual([a.band, a.score, a.conf], [p.band, p.score, p.conf], wire);
  }
});

test('no input -> score 0, band U, confidence L, no reasons', () => {
  const a = assess({});
  assert.deepEqual([a.band, a.score, a.conf, a.reasons.length], ['U', 0, 'L', 0]);
});

test('POINTS TABLE (spec §5.2) is pinned criterion by criterion', () => {
  const raw = (i: object) => assess(i as never).rawPoints;
  const table: Array<[string, object, number]> = [
    ['dv 25-39', { dvKmh: 30 }, 10], ['dv 40-59', { dvKmh: 50 }, 20], ['dv >= 60', { dvKmh: 60 }, 30],
    ['peak >= 20 g', { peakG: 20 }, 5], ['peak 19 g = 0', { peakG: 19 }, 0],
    ['rollover', { rollover: true }, 15], ['multiple impacts', { multiImpact: true }, 5],
    ['no response (N)', { noResponse: true }, 15], ['no response via flag N', { flags: ['N'] }, 15],
    ['witness U', { flags: ['U'] }, 25], ['witness B', { flags: ['B'] }, 20], ['witness H', { flags: ['H'] }, 20],
    ['witness E', { flags: ['E'] }, 20], ['witness D', { flags: ['D'] }, 20], ['witness X', { flags: ['X'] }, 15],
    ['child C', { flags: ['C'] }, 10], ['fire F = 0 points', { flags: ['F'] }, 0],
    ['kind P', { kinds: ['P'] }, 10], ['kind M', { kinds: ['M'] }, 10], ['kinds P+M count once', { kinds: ['P', 'M'] }, 10],
    ['kind C/T/B/X = 0', { kinds: ['C', 'T', 'B', 'X'] }, 0],
    ['SpO2 < 90', { spo2: 89 }, 20], ['SpO2 90 = 0', { spo2: 90 }, 0],
    ['HR > 130', { hr: 131 }, 15], ['HR < 50', { hr: 49 }, 15], ['HR 130 = 0', { hr: 130 }, 0], ['HR 50 = 0', { hr: 50 }, 0],
    ['GCS < 13 (assumption)', { gcs: 12 }, 25], ['SBP < 90 (assumption)', { sbp: 89 }, 20],
    ['age >= 65', { age: 65 }, 5], ['pregnancy', { pregnant: true }, 5], ['anticoagulants', { anticoagulant: true }, 5],
  ];
  for (const [name, input, pts] of table) assert.equal(raw(input), pts, name);
  // physics sub-cap: every physics input at once is 30+5+15+5 = 55 -> 50
  assert.equal(raw({ dvKmh: 99, peakG: 99, rollover: true, multiImpact: true }), 50);
  // outside the cap: N + U + B + H = 15+25+20+20
  assert.equal(raw({ dvKmh: 99, peakG: 99, rollover: true, multiImpact: true, flags: ['N', 'U', 'B', 'H'] }), 50 + 80);
});
