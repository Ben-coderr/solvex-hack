import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { encodeDzmsd, encodePlusCode, type DzmsdPacket } from '@najda/shared';
import { sql } from '../../db';
import { ingest, type InboundMessage } from '../ingest';
import { postgresStore } from '../store-postgres';

// Same scenarios as ingest.test.ts, but through real SQL (PostGIS merge query, FOR UPDATE, advisory lock, jsonb).
const EX1 = 'NAJDA1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF #04';
const EX2 = 'NAJDA1 P3N8D Y44M 35.69112,-0.63305 T0915 SW V1 P2 KCP FXC 8C7XM9R8+CQ #55';
const AT = new Date('2026-10-30T13:40:00Z');
const sms = (text: string, over: Partial<Extract<InboundMessage, { kind: 'text' }>> = {}): InboundMessage => ({
  kind: 'text', channel: 'sim', text, receivedAt: AT, senderHash: 'db-test', replyTo: null, ...over,
});
const pkt = (over: Partial<DzmsdPacket>): string => {
  const p: DzmsdPacket = { id: 'M3RG3', band: 'U', score: 0, conf: 'L', lat: 36.47321, lon: 2.82871, time: '1436', src: 'W', veh: 1, pers: 1, kinds: ['C'], ...over };
  return encodeDzmsd({ ...p, plus: encodePlusCode(p.lat, p.lon) });
};

const db = sql();
const count = async (t: string) => Number((await db`select count(*)::int as n from ${db(t)}`)[0]!.n);

beforeEach(async () => {
  await db`truncate public.prealerts, public.assessments, public.reports, public.audit_events, public.sms_outbox,
                    public.eta_cache, public.incidents restart identity cascade`;
});
afterAll(async () => {
  await db.end();
});

describe('postgres store (local Supabase)', () => {
  it('G1 sequence: create R and Y, unparsed bad CRC, duplicate, merge at ~120 m / 4 min', async () => {
    const store = postgresStore(db);
    expect((await ingest(sms(EX1), store)).assessment).toMatchObject({ band: 'R', nsi: 75, conf: 'H' });
    expect((await ingest(sms(EX2, { receivedAt: new Date('2026-10-30T08:20:00Z') }), store)).assessment).toMatchObject({ band: 'Y', nsi: 44 });
    expect(await ingest(sms(EX1.replace('#04', '#05')), store)).toMatchObject({ outcome: 'unparsed', error: 'checksum_mismatch' });
    expect(await ingest(sms(EX1), store)).toMatchObject({ outcome: 'duplicate', incident_id: 'K7Q2M' });
    const m = await ingest(sms(pkt({ flags: ['X'] })), store);
    expect(m).toMatchObject({ outcome: 'merged', incident_id: 'K7Q2M', merged_count: 2 });
    expect(m.assessment!.version).toBe(2);

    expect(await count('incidents')).toBe(2);
    expect(await count('reports')).toBe(4);
    const [inc] = await db`select merged_count, band, extensions.st_y(location::extensions.geometry) as lat from public.incidents where id = 'K7Q2M'`;
    expect(inc).toMatchObject({ merged_count: 2, band: 'R', lat: 36.47213 });
    const actions = (await db`select action from public.audit_events order by id`).map((r) => r.action);
    expect(actions).toEqual(['incident.created', 'incident.created', 'report.unparsed', 'incident.report_merged']);
  });

  it('does not merge beyond 300 m (PostGIS) or 10 minutes', async () => {
    const store = postgresStore(db);
    await ingest(sms(EX1), store);
    expect((await ingest(sms(pkt({ id: 'FAR00', lat: 36.47213 + 0.0032 })), store)).outcome).toBe('created');
    expect((await ingest(sms(pkt({ id: 'XATE0', lat: 36.47213, time: '1443' })), store)).outcome).toBe('created');
  });

  it('two different-id reports at the same spot, ingested concurrently, give ONE incident', async () => {
    const store = postgresStore(db);
    const [a, b] = await Promise.all([
      ingest(sms(pkt({ id: 'CNC01', src: 'A', dv: 50 })), store),
      ingest(sms(pkt({ id: 'CNC02' })), store),
    ]);
    expect([a.outcome, b.outcome].sort()).toEqual(['created', 'merged']);
    expect(await count('incidents')).toBe(1);
  });

  it('rolls back the whole ingest when a statement fails', async () => {
    const store = postgresStore(db);
    // Violates reports_client_id check inside the transaction (lower-case id), after the incident insert.
    const bad: InboundMessage = { kind: 'json', channel: 'https', receivedAt: AT, senderHash: null,
      body: { v: 1, incident_id: 'K7Q2M', source: 'auto', created_at: '2026-10-30T14:32:07+01:00',
        location: { lat: 36.47213, lon: 2.82871 }, scene: { vehicles: 1, persons: 1, kinds: ['car'], flags: [] } } };
    const orig = store.transaction;
    const broken = { transaction: <T,>(fn: Parameters<typeof orig<T>>[0]) => orig<T>(async (tx) =>
      fn({ ...tx, insertReport: async (r) => tx.insertReport({ ...r, clientId: 'bad!!' }) })) };
    await expect(ingest(bad, broken)).rejects.toThrow();
    expect(await count('incidents')).toBe(0);
    expect(await count('audit_events')).toBe(0);
  });
});
