/**
 * Generates language-neutral golden test vectors into ../test-vectors/*.json
 * Run: pnpm --filter @sellekni/shared vectors      (deterministic: same output every run)
 * Cross-check with an INDEPENDENT implementation: python3 -I scripts/crosscheck.py
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assess, crc8Hex, decodeDzmsd, encodeBody, encodeDzmsd, rankHospitals, type AssessmentInput, type DzmsdPacket,
  type Flag, type HospitalRecord, type Kind,
} from '../src/index';
import { randomPacket, rng } from '../test/helpers';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-vectors');
mkdirSync(out, { recursive: true });
const write = (name: string, data: unknown) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n');

// 1 — CRC-8
const crcInputs = ['', '123456789', 'SLK1', 'A', '#', 'SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF'];
write('crc8.json', {
  description: 'CRC-8 poly 0x07 init 0x00 refin/refout false xorout 0 (CRC-8/SMBUS). check("123456789") = F4',
  cases: crcInputs.map((input) => ({ input, crc: crc8Hex(input) })),
});

// 2 — valid packets
const r = rng(20261030);
const canonical: DzmsdPacket[] = [
  { id: 'K7Q2M', band: 'R', score: 75, conf: 'H', lat: 36.47213, lon: 2.82871, time: '1432', src: 'A', veh: 1, pers: 1, kinds: ['C'], dv: 71, g: 38, roll: true, flags: ['N'], hr: 124, spo2: 89, plus: '8F84FRCH+VF' },
  { id: 'P3N8D', band: 'Y', score: 44, conf: 'M', lat: 35.69112, lon: -0.63305, time: '0915', src: 'W', veh: 1, pers: 2, kinds: ['C', 'P'], flags: ['X', 'C'], plus: '8C7XM9R8+CQ' },
];
const packets = [...canonical, ...Array.from({ length: 300 }, () => randomPacket(r))];
write('dzmsd-valid.json', {
  description: 'Each case: packet (structured) <-> wire (SMS text). Canonical form: kinds/flags in fixed order, 5-decimal coords.',
  cases: packets.map((packet, i) => ({ name: i < 2 ? `spec-example-${i + 1}` : `random-${i - 1}`, packet, wire: encodeDzmsd(packet) })),
});

// 3 — invalid messages (all must be rejected; "code" is the TypeScript error code)
const sign = (body: string) => `${body} #${crc8Hex(body)}`;
const base = 'SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC';
const handmade: Array<[string, string]> = [
  ['', 'empty'], ['HELLO', 'bad_magic'], [base, 'missing_checksum'], [`${base} #ZZ`, 'bad_checksum_format'],
  [`${base} #00`, 'checksum_mismatch'],
  [sign(base.replace('K7Q2M', 'K7Q2I')), 'bad_id'],
  [sign(base.replace('R75H', 'Z75H')), 'bad_assessment'],
  [sign(base.replace('36.47213', '36.4721')), 'bad_coordinates'],
  [sign(base.replace('36.47213', '96.47213')), 'out_of_range'],
  [sign(base.replace('T1432', 'T2561')), 'out_of_range'],
  [sign(base.replace(' T1432', '')), 'missing_field'],
  [sign(`${base} D71 D72`), 'duplicate_token'],
  [sign(`${base} FNN`), 'bad_token'],
  [sign(`${base} SP101`), 'out_of_range'],
];
const wire0 = encodeDzmsd(canonical[0]!);
const mutated: Array<[string, string]> = [];
for (let i = 0; i < 120; i++) {
  const pos = Math.floor(r() * wire0.length);
  const chars = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';
  let ch = chars[Math.floor(r() * chars.length)]!;
  if (ch === wire0[pos]) ch = ch === 'A' ? 'B' : 'A';
  const w = wire0.slice(0, pos) + ch + wire0.slice(pos + 1);
  const d = decodeDzmsd(w);
  mutated.push([w, d.ok ? 'UNEXPECTEDLY_VALID' : d.code]);
}
if (mutated.some(([, c]) => c === 'UNEXPECTEDLY_VALID')) throw new Error('a single-char mutation decoded as valid');
write('dzmsd-invalid.json', {
  description: 'Every wire must be rejected. Codes: see DecodeErrorCode in src/dzmsd.ts. Mutated cases = 1 random substituted char in the canonical packet #1.',
  cases: [...handmade, ...mutated].map(([wire, code]) => {
    const d = decodeDzmsd(wire);
    if (d.ok || d.code !== code) throw new Error(`vector mismatch for ${wire}: expected ${code}`);
    return { wire, code };
  }),
});

// 4 — NSI cases
const KINDS: Kind[] = ['C', 'M', 'T', 'B', 'P', 'X'];
const FLAGS: Flag[] = ['N', 'U', 'B', 'H', 'E', 'D', 'X', 'C', 'F'];
const nsiInputs: AssessmentInput[] = [
  { dvKmh: 71, peakG: 38, rollover: true, noResponse: true, spo2: 89, hr: 124, flags: ['N'], kinds: ['C'] },
  { flags: ['X', 'C'], kinds: ['C', 'P'] },
  { dvKmh: 45, peakG: 12 },
  { dvKmh: 30, confirmedOk: true },
  {},
];
for (let i = 0; i < 400; i++) {
  const x: AssessmentInput = {};
  if (r() < 0.6) x.dvKmh = Math.floor(r() * 110);
  if (r() < 0.5) x.peakG = Math.floor(r() * 60);
  if (r() < 0.25) x.rollover = true;
  if (r() < 0.15) x.multiImpact = true;
  if (r() < 0.3) x.noResponse = true;
  if (r() < 0.5) x.flags = FLAGS.filter(() => r() < 0.25);
  if (r() < 0.5) x.kinds = KINDS.filter(() => r() < 0.3);
  if (r() < 0.35) x.spo2 = 70 + Math.floor(r() * 31);
  if (r() < 0.35) x.hr = 30 + Math.floor(r() * 150);
  if (r() < 0.15) x.gcs = 3 + Math.floor(r() * 13);
  if (r() < 0.15) x.sbp = 60 + Math.floor(r() * 90);
  if (r() < 0.2) x.age = 20 + Math.floor(r() * 70);
  if (r() < 0.05) x.pregnant = true;
  if (r() < 0.1) x.anticoagulant = true;
  if (r() < 0.2) x.confirmedOk = true;
  if (r() < 0.3) x.independentReports = 1 + Math.floor(r() * 4);
  nsiInputs.push(x);
}
write('nsi-cases.json', {
  description: 'NSI engine golden cases (engine nsi-1.0.0). capMechanismOnly=true. Compare band, score, conf, rawPoints, redCriteria.',
  cases: nsiInputs.map((input) => {
    const a = assess(input);
    return { input, expected: { band: a.band, score: a.score, conf: a.conf, rawPoints: a.rawPoints, redCriteria: a.redCriteria } };
  }),
});

// 5 — ranking worked example (illustrative facilities, NOT real hospitals)
const ALL = ['ed24', 'general_surgery', 'trauma_surgery', 'ct', 'icu', 'neurosurgery', 'pediatrics', 'burns'] as const;
const hospitals: HospitalRecord[] = [
  { id: 'CHU-A', name: 'CHU-A (illustrative)', level: 'A', lat: 36.7, lon: 3.0, capabilities: [...ALL] },
  { id: 'EPH-B', name: 'EPH-B (illustrative)', level: 'B', lat: 36.5, lon: 2.9, capabilities: ['ed24', 'general_surgery', 'trauma_surgery', 'ct'] },
  { id: 'CHU-C', name: 'CHU-C (illustrative)', level: 'A', lat: 36.2, lon: 2.4, capabilities: ['ed24', 'general_surgery', 'trauma_surgery', 'ct', 'icu', 'neurosurgery'] },
];
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const statuses = { 'EPH-B': { status: 'OK' as const, setAt: NOW - 1.5 * 3_600_000 }, 'CHU-C': { status: 'SATURATED' as const, setAt: NOW - 3_600_000 } };
const etaMin = { 'CHU-A': 24, 'EPH-B': 9, 'CHU-C': 58 };
const rec = rankHospitals({ band: 'R', flags: ['N'], incident: { lat: 36.47213, lon: 2.82871 }, hospitals, etaMin, statuses, now: NOW });
write('ranking-worked-example.json', {
  description: 'Spec §8 worked example, CORRECTED: EPH-B scores 0.77 (the source doc printed 0.71). CHU-A ranks first only because of the C>=0.75 gate.',
  input: { band: 'R', flags: ['N'], incident: { lat: 36.47213, lon: 2.82871 }, hospitals, etaMin, statuses, now: NOW },
  expected: { required: rec.required, mode: rec.mode, order: rec.all.map((x) => x.hospitalId), scores: Object.fromEntries(rec.all.map((x) => [x.hospitalId, x.score])) },
});

console.log(`wrote vectors to ${out}`);
console.log(`valid packets: ${packets.length}  longest wire: ${Math.max(...packets.map((p) => encodeDzmsd(p).length))} chars  body sample: ${encodeBody(canonical[0]!).length}`);
