import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IncidentJson, type IngestAck } from '@sellekni/api-contract';
import { channelRows, SMS_DELIVERY_WAIT_MS, SMS_RESULT_TIMEOUT_MS, type ChainConfig } from '../src/alert/chain';
import type { PostResult } from '../src/alert/https';
import { GIVE_UP_MS, memoryStore, newItem, type OutboxItem } from '../src/alert/outbox';
import { buildAlert } from '../src/alert/packet';
import { createRunner } from '../src/alert/runner';
import { fakeSms } from '../src/channels/sms-core';

const T0 = new Date('2026-10-30T13:32:07Z').getTime();
const FIX = { lat: 36.472131, lon: 2.828714, accM: 8, at: T0 - 4_000 };

/** A small world: clock, server (idempotent on the incident id, like ingest), radio, settings. */
function world(o: { online?: boolean; cfg?: Partial<ChainConfig>; store?: ReturnType<typeof memoryStore>; sms?: ReturnType<typeof fakeSms> } = {}) {
  const w = {
    t: T0,
    online: o.online ?? false,
    /** what the full POST does when the server is reachable */
    fullPost: 'ok' as 'ok' | 'timeout' | 'reject',
    received: new Map<string, number>(),
    bodies: [] as IncidentJson[],
    cfg: { nativeSms: true, gw1: '+213550000001', gw2: '', contacts: [] as string[], ...o.cfg },
    store: o.store ?? memoryStore(),
    sms: o.sms ?? fakeSms(),
  };
  const ack = (id: string): IngestAck => ({
    outcome: w.received.has(id) ? 'duplicate' : 'created', report_id: 'r', incident_id: id, merged_count: 1,
    assessment: null, error: null, received_at: new Date(w.t).toISOString(),
  });
  const accept = (json: IncidentJson): PostResult => {
    w.bodies.push(json);
    const a = ack(json.incident_id);
    w.received.set(json.incident_id, (w.received.get(json.incident_id) ?? 0) + 1);
    return { ok: true, ack: a };
  };
  const runner = createRunner({
    store: w.store,
    now: () => w.t,
    https: {
      probe: async () => w.online,
      post: async (json) => (!w.online ? { ok: false, kind: 'network' }
        : w.fullPost === 'timeout' ? { ok: false, kind: 'timeout' }
        : w.fullPost === 'reject' ? { ok: false, kind: 'rejected', status: 401 }
        : accept(json)),
      postCompact: async (json) => (w.online ? accept(json) : { ok: false, kind: 'network' }),
    },
    sms: w.sms,
    config: () => ({ ...w.cfg, subscriptionId: 2 }),
    humanText: (i) => `SELLEKNI: alert ${i.id}. Location 36.47213,2.82871. Call 14.`,
  });
  return { w, runner };
}

async function raise(runner: ReturnType<typeof createRunner>, t: number, id = 'K7Q2M'): Promise<OutboxItem> {
  const a = buildAlert({ id, source: 'A', now: new Date(t), fix: FIX });
  const item = newItem(id, a.wire, a.json, t, 0);
  await runner.add(item);
  return item;
}

test('chain: HTTPS fails → SMS to GW1 (packet, chosen SIM) → sent → delivered; HTTPS later ACKs; nothing more is sent', async () => {
  const { w, runner } = world();
  await runner.load();
  const item = await raise(runner, w.t);

  await runner.tick();
  assert.equal(runner.get(item.id)!.https.state, 'retrying');
  assert.equal(w.sms.sent.length, 1, 'GW1 right after the first failed HTTPS attempt');
  const s = w.sms.sent[0]!;
  assert.deepEqual([s.to, s.text, s.opts.id, s.opts.subscriptionId], [w.cfg.gw1, item.wire, 'K7Q2M.gw1.1', 2]);
  assert.equal(runner.get(item.id)!.smsOut.gw1!.state, 'sending');

  w.t += 3_000; w.sms.emit({ id: 'K7Q2M.gw1.1', status: 'sent' });
  w.t += 4_000; w.sms.emit({ id: 'K7Q2M.gw1.1', status: 'delivered' });
  await runner.flush();
  const gw1 = (await w.store.get(item.id))!.smsOut.gw1!;
  assert.equal(gw1.state, 'delivered', 'results are persisted');
  assert.equal(gw1.deliveredAt, T0 + 7_000);

  // 10 s later HTTPS retries, still offline: no second SMS (GW1 delivered, no GW2, no contacts)
  w.t += 10_000; await runner.tick();
  assert.equal(w.sms.sent.length, 1);

  w.online = true; w.t += 30_000; await runner.tick(true);
  const done = runner.get(item.id)!;
  assert.equal(done.https.state, 'acked');
  assert.ok(done.ackAt);
  assert.deepEqual(channelRows(done, w.cfg).map((r) => [r.channel, r.state]), [['https', 'acked'], ['gw1', 'delivered']]);
  w.t += 600_000; await runner.tick(true);
  assert.equal(w.sms.sent.length, 1);
  assert.equal(w.received.get(item.id), 1);
});

test('chain: both fail → SMS retries with backoff, GW2 then contacts take over, give up at 30 min and stop', async () => {
  const { w, runner } = world({ cfg: { gw2: '+213660000002', contacts: ['+213770000003'] } });
  await runner.load();
  const item = await raise(runner, w.t);
  w.sms.failWith = null;

  await runner.tick();
  assert.deepEqual(w.sms.sent.map((s) => s.opts.id), ['K7Q2M.gw1.1'], 'GW2 waits while GW1 has a chance');
  w.t += 2_000; w.sms.emit({ id: 'K7Q2M.gw1.1', status: 'failed', code: 4 }); // RESULT_ERROR_NO_SERVICE
  const failed = runner.get(item.id)!.smsOut.gw1!;
  assert.deepEqual([failed.state, failed.code, failed.nextAt], ['failed', '4', w.t + 10_000]);

  await runner.tick();
  assert.deepEqual(w.sms.sent.map((s) => s.opts.id), ['K7Q2M.gw1.1', 'K7Q2M.gw2.1'], 'GW1 failed: GW2 at once; GW1 backs off');
  const rows = channelRows(runner.get(item.id)!, w.cfg);
  assert.deepEqual(rows.map((r) => [r.channel, r.state]), [['https', 'retrying'], ['gw1', 'retrying'], ['gw2', 'sending'], ['contacts', 'waiting']]);

  // the radio is dead from now on: every send is refused or fails
  w.sms.failWith = 'E_SMS_UNAVAILABLE';
  w.t += 10_000; await runner.tick();
  assert.equal(runner.get(item.id)!.smsOut.gw1!.attempts, 2);
  assert.equal(runner.get(item.id)!.smsOut.gw1!.code, 'E_SMS_UNAVAILABLE');
  assert.equal(runner.get(item.id)!.smsOut.gw1!.nextAt, w.t + 20_000, 'second failure: 20 s');

  w.t = T0 + SMS_DELIVERY_WAIT_MS; await runner.tick();
  assert.ok(runner.get(item.id)!.smsOut['contact:+213770000003'], 'contacts 60 s after the first gateway SMS');
  assert.equal(runner.get(item.id)!.smsOut['contact:+213770000003']!.kind, 'human');

  // keep ticking every 10 s for 30 min: attempts stay bounded by the backoff (5 min cap)
  while (w.t < T0 + GIVE_UP_MS) { w.t += 10_000; await runner.tick(); }
  const gw1Attempts = runner.get(item.id)!.smsOut.gw1!.attempts;
  assert.ok(gw1Attempts >= 6 && gw1Attempts <= 12, `bounded retries, got ${gw1Attempts}`);
  w.t += 10_000; await runner.tick();
  const end = runner.get(item.id)!;
  assert.equal(end.https.state, 'gave_up');
  assert.ok(end.gaveUpAt);
  const sends = end.smsOut.gw1!.attempts;
  w.t += 600_000; await runner.tick(true);
  assert.equal(runner.get(item.id)!.smsOut.gw1!.attempts, sends, 'nothing is sent after giving up');
  assert.deepEqual(channelRows(runner.get(item.id)!, w.cfg).map((r) => r.state), ['gave_up', 'failed', 'failed', 'failed']);
});

test('chain: app killed mid-chain and restarted → resumes from the store, resends what had no result, server sees one incident', async () => {
  const store = memoryStore();
  const sms1 = fakeSms();
  const first = world({ store, sms: sms1 });
  await first.runner.load();
  const item = await raise(first.runner, first.w.t);
  await first.runner.tick();
  await first.runner.flush();
  assert.equal(sms1.sent.length, 1);
  assert.equal((await store.get(item.id))!.smsOut.gw1!.state, 'sending', 'persisted before Android got it');
  first.runner.dispose(); // killed: the sent / delivered events for attempt 1 are lost

  // restart 61 s later, with a new radio listener
  const sms2 = fakeSms();
  const second = world({ store, sms: sms2 });
  second.w.t = T0 + SMS_RESULT_TIMEOUT_MS + 1_000;
  await second.runner.load();
  assert.equal(second.runner.get(item.id)!.https.attempts, 1, 'state survived the kill');
  await second.runner.tick();
  assert.deepEqual(sms2.sent.map((s) => s.opts.id), ['K7Q2M.gw1.2'], 'no result in 60 s: sent again, new message id');
  assert.equal(second.runner.get(item.id)!.smsOut.gw1!.code, 'E_TIMEOUT');

  // a late report for the FIRST attempt still counts (same text, same gateway)
  sms2.emit({ id: 'K7Q2M.gw1.1', status: 'delivered' });
  assert.equal(second.runner.get(item.id)!.smsOut.gw1!.state, 'delivered');
  // …and a late failure of the old attempt does not undo it
  sms2.emit({ id: 'K7Q2M.gw1.1', status: 'failed', code: 1 });
  assert.equal(second.runner.get(item.id)!.smsOut.gw1!.state, 'delivered');

  // HTTPS comes back: the same incident id is posted; ingest is idempotent
  second.w.online = true; second.w.t += 60_000; await second.runner.tick(true);
  second.w.online = true; await second.runner.tick(true);
  assert.equal(second.runner.get(item.id)!.ack?.incident_id, 'K7Q2M');
  assert.deepEqual([...second.w.received.keys()], ['K7Q2M']);
  assert.equal(second.w.received.get('K7Q2M'), 1);
});

test('chain: kill between persist and HTTPS (never attempted) → the restarted runner sends it', async () => {
  const store = memoryStore();
  const first = world({ store });
  await first.runner.load();
  const item = await raise(first.runner, first.w.t);
  await first.runner.flush();
  first.runner.dispose();
  const second = world({ store, online: true });
  await second.runner.load();
  await second.runner.tick();
  assert.equal(second.runner.get(item.id)!.https.state, 'acked');
  assert.equal(second.w.sms.sent.length, 0, 'online: no SMS needed');
});

test('chain: full JSON times out → compact JSON (no medical, no device) is accepted', async () => {
  const { w, runner } = world({ online: true });
  w.fullPost = 'timeout';
  await runner.load();
  const item = await raise(runner, w.t);
  await runner.tick();
  assert.equal(runner.get(item.id)!.https.state, 'acked');
  const body = w.bodies[0]!;
  assert.equal('device' in body, false);
  assert.equal('medical' in body, false);
  assert.ok(IncidentJson.safeParse(body).success, 'still the v1 contract');
  assert.equal(w.sms.sent.length, 0);
});

test('chain: HTTPS rejected (bad key) → SMS still carries the packet', async () => {
  const { w, runner } = world({ online: true });
  w.fullPost = 'reject';
  await runner.load();
  const item = await raise(runner, w.t);
  await runner.tick();
  assert.equal(runner.get(item.id)!.https.state, 'rejected');
  assert.deepEqual(w.sms.sent.map((s) => s.to), [w.cfg.gw1]);
});

test('chain: no native SMS (not in the build / SEND_SMS refused) → nothing silent, the composer row is offered', async () => {
  const { w, runner } = world({ cfg: { nativeSms: false } });
  await runner.load();
  const item = await raise(runner, w.t);
  await runner.tick();
  assert.equal(w.sms.sent.length, 0);
  assert.deepEqual(channelRows(runner.get(item.id)!, w.cfg).map((r) => [r.channel, r.state]), [['https', 'retrying'], ['composer', 'offered']]);
  await runner.mutate(item.id, (i) => ({ ...i, sms: { composerOpenedAt: w.t, to: w.cfg.gw1 } }));
  assert.equal(channelRows(runner.get(item.id)!, w.cfg)[1]!.state, 'opened');
});

test('chain: no gateway configured → contacts get the human text at once', async () => {
  const { w, runner } = world({ cfg: { gw1: '', contacts: ['+213770000003', '+213770000004'] } });
  await runner.load();
  await raise(runner, w.t);
  await runner.tick();
  assert.deepEqual(w.sms.sent.map((s) => s.to), ['+213770000003', '+213770000004']);
  assert.match(w.sms.sent[0]!.text, /^SELLEKNI: alert K7Q2M/);
});

test('chain: GW1 sent but no delivery report for 60 s → GW2 too; GW1 is not resent', async () => {
  const { w, runner } = world({ cfg: { gw2: '+213660000002' } });
  await runner.load();
  await raise(runner, w.t);
  await runner.tick();
  w.t += 1_000; w.sms.emit({ id: 'K7Q2M.gw1.1', status: 'sent' });
  w.t += 30_000; await runner.tick();
  assert.equal(w.sms.sent.length, 1);
  w.t += SMS_DELIVERY_WAIT_MS; await runner.tick();
  assert.deepEqual(w.sms.sent.map((s) => s.opts.id), ['K7Q2M.gw1.1', 'K7Q2M.gw2.1']);
});

test('chain: an SMS result arriving during a slow HTTPS attempt is not overwritten by it', async () => {
  const sms = fakeSms();
  const { w, runner } = world({ sms });
  await runner.load();
  const item = await raise(runner, w.t);
  await runner.tick(); // GW1 sending
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  // next HTTPS attempt hangs until we release it; the delivery report lands meanwhile
  const slow = createRunner({
    store: w.store, now: () => w.t, sms,
    https: { probe: async () => { await gate; return false; }, post: async () => ({ ok: false, kind: 'network' }) },
    config: () => ({ ...w.cfg, subscriptionId: null }), humanText: () => '',
  });
  runner.dispose();
  await slow.load();
  w.t += 10_000;
  const pass = slow.tick();
  sms.emit({ id: 'K7Q2M.gw1.1', status: 'delivered' });
  release();
  await pass;
  assert.equal(slow.get(item.id)!.smsOut.gw1!.state, 'delivered');
  assert.equal(slow.get(item.id)!.https.attempts, 2);
});
