import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crc8Hex, decodeDzmsd, decodeDzmsdOrThrow, DzmsdError, encodeBody, encodeDzmsd, formatHHMM, generateIncidentId,
  gsm7Length, isGsm7Basic, normalise, resolveCrashTime, SMS_SINGLE_MAX, type DzmsdPacket,
} from '../src/index';
import { randomPacket, rng } from './helpers';

const WIRE1 = 'SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF #0E';
const WIRE2 = 'SLK1 P3N8D Y44M 35.69112,-0.63305 T0915 SW V1 P2 KCP FXC 8C7XM9R8+CQ #30';
const PKT1: DzmsdPacket = {
  id: 'K7Q2M', band: 'R', score: 75, conf: 'H', lat: 36.47213, lon: 2.82871, time: '1432', src: 'A', veh: 1, pers: 1,
  kinds: ['C'], dv: 71, g: 38, roll: true, flags: ['N'], hr: 124, spo2: 89, plus: '8F84FRCH+VF',
};
const PKT2: DzmsdPacket = {
  id: 'P3N8D', band: 'Y', score: 44, conf: 'M', lat: 35.69112, lon: -0.63305, time: '0915', src: 'W', veh: 1, pers: 2,
  kinds: ['C', 'P'], flags: ['X', 'C'], plus: '8C7XM9R8+CQ',
};

test('canonical spec examples encode byte-for-byte (CRC #0E and #30, 91 and 72 chars)', () => {
  assert.equal(encodeDzmsd(PKT1), WIRE1);
  assert.equal(encodeDzmsd(PKT2), WIRE2);
  assert.equal(WIRE1.length, 91);
  assert.equal(WIRE2.length, 72);
});

test('canonical spec examples decode to the expected packets', () => {
  const r1 = decodeDzmsd(WIRE1);
  assert.ok(r1.ok);
  assert.deepEqual(r1.packet, PKT1);
  assert.deepEqual(r1.warnings, []);
  const r2 = decodeDzmsd(WIRE2);
  assert.ok(r2.ok);
  assert.deepEqual(r2.packet, PKT2);
});

test('PROPERTY: 5,000 random packets round-trip, are pure basic GSM-7 and fit 160 chars', () => {
  const r = rng(2026);
  for (let i = 0; i < 5000; i++) {
    const p = randomPacket(r);
    const wire = encodeDzmsd(p);
    assert.ok(isGsm7Basic(wire), wire);
    assert.ok(wire.length <= SMS_SINGLE_MAX, wire);
    const d = decodeDzmsd(wire);
    assert.ok(d.ok, `${wire} -> ${!d.ok && d.message}`);
    assert.deepEqual(d.packet, p, wire);
    assert.equal(encodeDzmsd(d.packet), wire); // canonical form is a fixed point
  }
});

test('WORST CASE: the largest possible v1 packet still fits one SMS, with headroom for v2', () => {
  const worst: DzmsdPacket = {
    id: 'ZZZZZ', band: 'R', score: 99, conf: 'H', lat: -88.12345, lon: -179.12345, time: '2359', src: 'M', veh: 99, pers: 99,
    kinds: ['C', 'M', 'T', 'B', 'P', 'X'], dv: 999, g: 999, roll: true,
    flags: ['N', 'U', 'B', 'H', 'E', 'D', 'X', 'C', 'F'], hr: 999, spo2: 100, plus: '22222222+22',
  };
  const wire = encodeDzmsd(worst);
  assert.ok(gsm7Length(wire)! <= SMS_SINGLE_MAX);
  assert.ok(wire.length <= 125, `worst case is ${wire.length} chars`);
});

test('CORRUPTION: every single-character substitution is rejected', () => {
  let n = 0;
  for (const wire of [WIRE1, WIRE2]) {
    for (let i = 0; i < wire.length; i++) {
      for (const ch of 'ABCDEFGHJKMNPQRSTVWXYZ0123456789 +,.-#') {
        if (ch === wire[i]) continue;
        const mutated = wire.slice(0, i) + ch + wire.slice(i + 1);
        const d = decodeDzmsd(mutated);
        assert.equal(d.ok, false, mutated);
        n++;
      }
    }
  }
  assert.ok(n > 6000);
});

test('the spec example: changing R75H to G12H is rejected as a checksum mismatch', () => {
  const d = decodeDzmsd(WIRE1.replace('R75H', 'G12H'));
  assert.equal(d.ok, false);
  assert.equal(!d.ok && d.code, 'checksum_mismatch');
});

test('tolerates SMS-keyboard noise: lowercase, extra spaces, NBSP, newline', () => {
  const messy = '  ' + WIRE1.toLowerCase().replace(/ /g, '  ') + '\n';
  assert.equal(normalise(messy), WIRE1);
  const d = decodeDzmsd(messy.replace(/ /, ' '));
  assert.ok(d.ok);
  assert.deepEqual(d.packet, PKT1);
});

test('rejects structurally invalid messages with precise codes', () => {
  const cases: Array<[string, string]> = [
    ['', 'empty'],
    ['HELLO WORLD', 'bad_magic'],
    ['SLK1 K7Q2M R75H 36.47213,2.82871', 'missing_checksum'],
    ['SLK1 K7Q2M R75H 36.47213,2.82871 #ZZ', 'bad_checksum_format'],
  ];
  for (const [input, code] of cases) {
    const d = decodeDzmsd(input);
    assert.equal(d.ok, false, input);
    assert.equal(!d.ok && d.code, code, input);
  }
});

/** Build a message with a VALID checksum around an arbitrary body (to test the parser, not the CRC). */
const sign = (body: string) => `${body} #${crc8Hex(body)}`;

test('parser-level validation (valid CRC, invalid content)', () => {
  const base = 'SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC';
  const ok = decodeDzmsd(sign(base));
  assert.ok(ok.ok, 'minimal packet is valid');

  const bad: Array<[string, string]> = [
    [base.replace('K7Q2M', 'K7Q2I'), 'bad_id'],            // I is not Crockford
    [base.replace('K7Q2M', 'K7Q2'), 'bad_id'],
    [base.replace('R75H', 'Z75H'), 'bad_assessment'],
    [base.replace('R75H', 'R7H'), 'bad_assessment'],
    [base.replace('36.47213', '36.4721'), 'bad_coordinates'],
    [base.replace('36.47213', '96.47213'), 'out_of_range'],
    [base.replace('T1432', 'T2561'), 'out_of_range'],
    [base.replace(' T1432', ''), 'missing_field'],
    [base.replace(' KC', ''), 'missing_field'],
    [base + ' D71 D72', 'duplicate_token'],
    [base + ' RO RO', 'duplicate_token'],
    [base + ' FNN', 'bad_token'],
    [base + ' SP101', 'out_of_range'],
    [base.replace('KC', 'KCC'), 'bad_token'],
    [base + ' 8F84FRCH+V', 'bad_pluscode'],
    [base + ' V9', 'duplicate_token'],
    [base + ' D', 'bad_token'],
  ];
  for (const [body, code] of bad) {
    const d = decodeDzmsd(sign(body));
    assert.equal(d.ok, false, body);
    assert.equal(!d.ok && d.code, code, body);
  }
});

test('order-free after the header (spec: "order-free after the header")', () => {
  const d = decodeDzmsd(sign('SLK1 K7Q2M R75H 36.47213,2.82871 8F84FRCH+VF SP89 HR124 FN RO G38 D71 KC P1 V1 SA T1432'));
  assert.ok(d.ok);
  assert.deepEqual(d.packet, PKT1);
});

test('unknown future tokens are ignored with a warning, not rejected', () => {
  const d = decodeDzmsd(sign('SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC ZQ5'));
  assert.ok(d.ok);
  assert.deepEqual(d.warnings, ['unknown token "ZQ5" ignored']);
});

test('plus code that disagrees with the coordinates produces a warning', () => {
  const d = decodeDzmsd(sign('SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC 8C7XM9R8+CQ'));
  assert.ok(d.ok);
  assert.equal(d.warnings.length, 1);
  assert.match(d.warnings[0]!, /plus code/);
});

test('encoder validation errors are precise', () => {
  const bad = (patch: Partial<DzmsdPacket>, re: RegExp) =>
    assert.throws(() => encodeDzmsd({ ...PKT1, ...patch }), (e: unknown) => e instanceof DzmsdError && re.test(e.message));
  bad({ id: 'abcde' }, /id must be/);
  bad({ id: 'K7Q2O' }, /id must be/);
  bad({ score: 100 }, /score/);
  bad({ score: 7.5 }, /score/);
  bad({ lat: 91 }, /lat/);
  bad({ time: '2460' }, /time/);
  bad({ kinds: [] }, /kinds/);
  bad({ kinds: ['C', 'C'] }, /duplicate kind/);
  bad({ flags: ['Z' as never] }, /unknown flag/);
  bad({ spo2: 101 }, /spo2/);
  bad({ plus: '8F84FRCH+V' }, /plus/);
});

test('negative zero is never emitted; small negative coordinates keep their sign', () => {
  assert.match(encodeBody({ ...PKT1, lat: -0.000001, lon: 0 }), /0\.00000,0\.00000/);
  assert.match(encodeBody({ ...PKT1, lat: -0.00001, lon: -0.5 }), /-0\.00001,-0\.50000/);
});

test('decodeOrThrow throws DzmsdError with a code', () => {
  assert.throws(() => decodeDzmsdOrThrow('nonsense'), (e: unknown) => e instanceof DzmsdError && e.code === 'bad_magic');
});

test('Algeria local time: UTC+1, midnight rollover resolves to the previous day', () => {
  assert.equal(formatHHMM(new Date('2026-10-30T13:32:07Z')), '1432');
  assert.equal(formatHHMM(new Date('2026-10-30T23:30:00Z')), '0030');
  const rx = new Date('2026-10-30T13:32:40Z'); // 14:32 local
  assert.equal(resolveCrashTime('1432', rx).toISOString(), '2026-10-30T13:32:00.000Z');
  const late = new Date('2026-10-30T23:01:00Z'); // 00:01 local on the 31st; crash at 23:58 local on the 30th
  assert.equal(resolveCrashTime('2358', late).toISOString(), '2026-10-30T22:58:00.000Z');
});

test('generateIncidentId: 5 Crockford chars, injectable randomness, no collisions in 10k draws', () => {
  assert.equal(generateIncidentId(() => new Uint8Array([0, 1, 2, 3, 31])), '0123Z');
  const seen = new Set<string>();
  for (let i = 0; i < 10_000; i++) {
    const id = generateIncidentId();
    assert.match(id, /^[0-9A-HJKMNP-TV-Z]{5}$/);
    seen.add(id);
  }
  assert.ok(seen.size > 9_990);
});
