import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IncidentJson, type IngestAck } from '@sellekni/api-contract';
import { decodeDzmsd, isGsm7Basic, SMS_SINGLE_MAX } from '@sellekni/shared';
import { parseCsv, replay, toPacketHints } from '@sellekni/detector';
import { BUNDLED_TRACES } from '../src/replay/bundled-traces';
import { postIncident, probeHealth, type Fetch } from '../src/alert/https';
import { attemptHttps, backoffMs, GIVE_UP_MS, memoryStore, newItem } from '../src/alert/outbox';
import { buildAlert, isoAlgiers } from '../src/alert/packet';
import { EMPTY_ANSWERS, fixAgeMin, witnessScene } from '../src/alert/witness';

const NOW = new Date('2026-10-30T13:32:07Z'); // 14:32 in Algiers
const FIX = { lat: 36.472131, lon: 2.828714, accM: 8, at: NOW.getTime() - 4_000 };
/** the detector's alert on a bundled trace -> packet hints, exactly as the app does it */
const hintsOf = (name: keyof typeof BUNDLED_TRACES) => {
  const tr = BUNDLED_TRACES[name];
  const d = replay({ ...parseCsv(tr.csv), rangeG: tr.rangeG }).decisions.find((x) => x.kind === 'alert')!;
  return toPacketHints(d, tr.rangeG);
};

test('auto alert from rollover_71_r16 with no response: valid GSM-7 packet ≤ 160, N + roll, JSON passes the contract', () => {
  const a = buildAlert({ id: 'K7Q2M', source: 'A', now: NOW, fix: FIX, hints: hintsOf('rollover_71_r16'), noResponse: true, battery: 64, lang: 'ar' });
  assert.ok(a.wire.length <= SMS_SINGLE_MAX && isGsm7Basic(a.wire), a.wire);
  const back = decodeDzmsd(a.wire);
  assert.ok(back.ok);
  assert.equal(back.packet.time, '1432');
  assert.equal(back.packet.roll, true);
  assert.deepEqual(back.packet.flags, ['N']);
  assert.equal(back.packet.dv, hintsOf('rollover_71_r16').D, 'Δv from GPS, as decided');
  assert.ok(back.packet.g! <= 16, 'G is capped at the sensor range: a lower bound, never "38 g"');
  assert.equal(back.packet.lat, 36.47213);
  assert.ok(IncidentJson.safeParse(a.json).success, JSON.stringify(IncidentJson.safeParse(a.json).error));
  assert.equal(a.json.crash?.no_response, true);
  assert.equal(a.json.created_at, '2026-10-30T14:32:07+01:00');
  assert.deepEqual(a.json.hint, { band: a.packet.band, score: a.packet.score, conf: a.packet.conf });
  assert.equal(a.locationAgeMin, 0);
  assert.equal(buildAlert({ id: 'K7Q2M', source: 'A', now: NOW, fix: FIX, replay: true, appVersion: '1.0.0' }).json.device?.app, 'sellekni-mobile/1.0.0+replay');
});

test('frontal_45: the phone (±16 g) reports G at its sensor limit; the simulated BOX (±200 g) the full peak; both fit one SMS', () => {
  const phone = hintsOf('frontal_45_r16');
  assert.equal(phone.sensorLimited, true);
  assert.ok(phone.G <= 16);
  const box = hintsOf('frontal_45_r200');
  assert.ok(box.G > phone.G, `BOX ${box.G} g vs phone ${phone.G} g`);
  for (const hints of [phone, box]) {
    const a = buildAlert({ id: 'K7Q2M', source: 'A', now: NOW, fix: FIX, hints });
    assert.ok(a.wire.length <= SMS_SINGLE_MAX && decodeDzmsd(a.wire).ok, a.wire);
    assert.equal(a.packet.dv, 45);
  }
});

test('manual SOS (SM): no crash physics, no flags, still a valid packet', () => {
  const a = buildAlert({ id: 'ABCDE', source: 'M', now: NOW, fix: FIX });
  const back = decodeDzmsd(a.wire);
  assert.ok(back.ok);
  assert.equal(back.packet.src, 'M');
  assert.equal(back.packet.dv, undefined);
  assert.equal(a.json.source, 'sos');
  assert.equal(a.json.crash, undefined);
  assert.ok(IncidentJson.safeParse(a.json).success);
});

test('no GPS fix ever: the alert still goes out (0,0, no plus code) and says so', () => {
  const a = buildAlert({ id: 'ABCDE', source: 'M', now: NOW, fix: null });
  assert.ok(decodeDzmsd(a.wire).ok);
  assert.equal(a.locationAgeMin, null);
  assert.equal(a.json.location.plus_code, undefined);
});

test('stale fix: location age in minutes', () => {
  const a = buildAlert({ id: 'ABCDE', source: 'M', now: NOW, fix: { ...FIX, at: NOW.getTime() - 7.5 * 60_000 } });
  assert.equal(a.locationAgeMin, 7);
});

test('isoAlgiers is UTC+1 all year', () => {
  assert.equal(isoAlgiers(new Date('2026-01-01T23:30:00Z')), '2026-01-02T00:30:00+01:00');
});

test('backoff: 10 s · 2ⁿ capped at 5 min', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(backoffMs), [10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
});

const ACK: IngestAck = {
  outcome: 'created', report_id: 'r1', incident_id: 'K7Q2M', merged_count: 1, assessment: null, error: null, received_at: NOW.toISOString(),
};

test('outbox: offline → retrying with backoff; online → acked; the item is never dropped', async () => {
  const store = memoryStore();
  const a = buildAlert({ id: 'K7Q2M', source: 'M', now: NOW, fix: FIX });
  let t = NOW.getTime();
  let item = newItem('K7Q2M', a.wire, a.json, t, 0);
  await store.put(item);
  let online = false;
  const deps = { now: () => t, probe: async () => online, post: async () => ({ ok: true as const, ack: ACK }) };

  item = await attemptHttps(item, deps);
  assert.equal(item.https.state, 'retrying');
  assert.equal(item.https.nextAt, t + 10_000);
  t += 10_000;
  item = await attemptHttps(item, deps);
  assert.equal(item.https.nextAt, t + 20_000);
  online = true;
  item = await attemptHttps(item, deps);
  await store.put(item);
  assert.equal(item.https.state, 'acked');
  assert.equal((await store.get('K7Q2M'))?.ack?.incident_id, 'K7Q2M');
  assert.equal(await attemptHttps(item, deps), item, 'acked items are left alone');
});

test('outbox: 5xx and timeouts retry; 401 is kept as rejected (no retry storm, still in the outbox)', async () => {
  const a = buildAlert({ id: 'K7Q2M', source: 'M', now: NOW, fix: FIX });
  const base = newItem('K7Q2M', a.wire, a.json, NOW.getTime(), 0);
  const deps = (r: Awaited<ReturnType<Parameters<typeof attemptHttps>[1]['post']>>) => ({ now: () => NOW.getTime(), probe: async () => true, post: async () => r });
  assert.equal((await attemptHttps(base, deps({ ok: false, kind: 'network', status: 503 }))).https.lastError, 'network_503');
  assert.equal((await attemptHttps(base, deps({ ok: false, kind: 'timeout' }))).https.state, 'retrying');
  const rej = await attemptHttps(base, deps({ ok: false, kind: 'rejected', status: 401 }));
  assert.equal(rej.https.state, 'rejected');
  assert.equal(rej.https.nextAt, null);
});

test('outbox: gives up after 30 min and says so', async () => {
  const a = buildAlert({ id: 'K7Q2M', source: 'M', now: NOW, fix: FIX });
  const item = newItem('K7Q2M', a.wire, a.json, NOW.getTime(), 0);
  const out = await attemptHttps(item, { now: () => NOW.getTime() + GIVE_UP_MS + 1, probe: async () => true, post: async () => ({ ok: true as const, ack: ACK }) });
  assert.equal(out.https.state, 'gave_up');
});

test('https client: HEAD probe, POST with x-sellekni-key, ACK parsed, errors classified', async () => {
  const calls: { url: string; method: string; headers?: Record<string, string> }[] = [];
  const reply = (status: number, body: unknown): Fetch => async (url, init) => {
    calls.push({ url, method: init.method, ...(init.headers && { headers: init.headers }) });
    return { status, ok: status < 300, json: async () => body };
  };
  assert.equal(await probeHealth(reply(200, null), 'http://10.0.0.2:3000/'), true);
  assert.deepEqual(calls[0], { url: 'http://10.0.0.2:3000/api/health', method: 'HEAD' });
  assert.equal(await probeHealth(reply(200, null), ''), false);
  assert.equal(await probeHealth(async () => { throw new TypeError('Network request failed'); }, 'http://x'), false);

  const json = buildAlert({ id: 'K7Q2M', source: 'M', now: NOW, fix: FIX }).json;
  const ok = await postIncident(reply(201, ACK), 'http://x', 'k3y', json);
  assert.deepEqual(ok, { ok: true, ack: ACK });
  assert.equal(calls.at(-1)?.headers?.['x-sellekni-key'], 'k3y');
  assert.deepEqual(await postIncident(reply(401, {}), 'http://x', 'bad', json), { ok: false, kind: 'rejected', status: 401 });
  assert.deepEqual(await postIncident(reply(503, {}), 'http://x', 'k', json), { ok: false, kind: 'network', status: 503 });
  assert.deepEqual(await postIncident(reply(201, { nope: 1 }), 'http://x', 'k', json), { ok: false, kind: 'bad_response', status: 201 });
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  assert.deepEqual(await postIncident(async () => { throw abort; }, 'http://x', 'k', json), { ok: false, kind: 'timeout' });
});

test('M6 witness: the 5 answers become an SW packet (same flags as the web witness page), GSM-7, valid JSON', () => {
  const scene = witnessScene({ vehicles: 2, kinds: ['car', 'moto'], hurt: 1, state: ['unresponsive'], danger: ['trapped', 'fire'] });
  assert.deepEqual(scene, { veh: 2, pers: 1, kinds: ['C', 'M'], flags: ['U', 'X', 'F'] });
  const a = buildAlert({ id: 'W1TN5', source: 'W', now: NOW, fix: FIX, scene });
  assert.ok(a.wire.includes(' SW ') && a.wire.length <= SMS_SINGLE_MAX && isGsm7Basic(a.wire), a.wire);
  const back = decodeDzmsd(a.wire);
  assert.ok(back.ok);
  assert.equal(back.packet.src, 'W');
  assert.equal(back.packet.veh, 2);
  assert.equal(back.packet.pers, 1);
  assert.deepEqual(back.packet.kinds, ['C', 'M']);
  assert.deepEqual([...back.packet.flags!].sort(), ['F', 'U', 'X']);
  assert.equal(back.packet.dv, undefined, 'a witness reports no sensor values');
  assert.equal(a.packet.band, 'R', 'unresponsive is a RED criterion: the hint says so');
  assert.ok(IncidentJson.safeParse(a.json).success, JSON.stringify(IncidentJson.safeParse(a.json).error));
  assert.equal(a.json.source, 'witness');
  assert.equal(a.json.scene.fire, true);
  assert.equal(a.json.crash, undefined);
});

test('M6 witness: nobody hurt and no kind ticked still makes a valid packet (0 persons, kind "other")', () => {
  const scene = witnessScene({ vehicles: 1, kinds: [], hurt: 0, state: [], danger: [] });
  assert.deepEqual(scene, { veh: 1, pers: 0, kinds: ['X'], flags: [] });
  const back = decodeDzmsd(buildAlert({ id: 'W1TN5', source: 'W', now: NOW, fix: FIX, scene }).wire);
  assert.ok(back.ok);
  assert.equal(back.packet.pers, 0);
});

test('M6 witness edge cases: last known fix keeps its age; no fix at all still sends (0,0, age null)', () => {
  const scene = witnessScene(EMPTY_ANSWERS);
  const old = { ...FIX, at: NOW.getTime() - 7 * 60_000 - 5_000 };
  assert.equal(buildAlert({ id: 'W1TN5', source: 'W', now: NOW, fix: old, scene }).locationAgeMin, 7);
  assert.equal(fixAgeMin(old, NOW.getTime()), 7);
  const none = buildAlert({ id: 'W1TN5', source: 'W', now: NOW, fix: null, scene });
  assert.equal(none.locationAgeMin, null);
  assert.equal(fixAgeMin(null, NOW.getTime()), null);
  assert.ok(decodeDzmsd(none.wire).ok, none.wire);
});
