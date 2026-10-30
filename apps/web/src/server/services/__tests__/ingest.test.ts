import { describe, expect, it } from 'vitest';
import type { IncidentJson } from '@sellekni/api-contract';
import { encodeDzmsd, encodePlusCode, type DzmsdPacket } from '@sellekni/shared';
import { ingest, type InboundMessage } from '../ingest';
import { MemoryStore } from './memory-store';

// docs/05 §1.2 golden packets
const EX1 = 'SLK1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF #0E';
// change the last CRC digit: a checksum failure whatever the magic (scripts/rename-magic.mjs)
const corruptCrc = (wire: string) => wire.slice(0, -1) + (wire.endsWith('F') ? 'E' : 'F');
const EX2 = 'SLK1 P3N8D Y44M 35.69112,-0.63305 T0915 SW V1 P2 KCP FXC 8C7XM9R8+CQ #30';
const BAD_CRC = corruptCrc(EX1);

// 14:40 local (UTC+1) on the demo day: both packets resolve to the same day.
const AT = new Date('2026-10-30T13:40:00Z');

const sms = (text: string, over: Partial<Extract<InboundMessage, { kind: 'text' }>> = {}): InboundMessage => ({
  kind: 'text', channel: 'sms', text, receivedAt: AT, senderHash: 'h-sender', replyTo: '+213555000001', ...over,
});

const packet = (over: Partial<DzmsdPacket>): DzmsdPacket => {
  const p: DzmsdPacket = {
    id: 'M3RG3', band: 'U', score: 0, conf: 'L', lat: 36.47213, lon: 2.82871, time: '1432', src: 'W',
    veh: 1, pers: 1, kinds: ['C'], ...over,
  };
  return { ...p, plus: encodePlusCode(p.lat, p.lon) };
};

/** ~120 m north of EX1 (0.00108° lat), 4 minutes later, different id, witness. */
const NEAR_EX1 = encodeDzmsd(packet({ lat: 36.47321, time: '1436', flags: ['X'] }));

describe('ingest — canonical packets (G1)', () => {
  it('creates an R incident from example 1 and a Y incident from example 2 (docs/05 §3.4)', async () => {
    const s = new MemoryStore();
    const a1 = await ingest(sms(EX1), s);
    const a2 = await ingest(sms(EX2, { receivedAt: new Date('2026-10-30T08:20:00Z') }), s);

    expect(a1).toMatchObject({ outcome: 'created', incident_id: 'K7Q2M', merged_count: 1 });
    expect(a1.assessment).toMatchObject({ band: 'R', nsi: 75, conf: 'H', version: 1 });
    expect(a1.assessment!.reasons.map((r) => r.code)).toEqual(['dv', 'spo2_low', 'rollover']);
    expect(a2.assessment).toMatchObject({ band: 'Y', nsi: 44, conf: 'M' });
    expect(s.state.incidents).toHaveLength(2);
    expect(s.state.audit.map((e) => e.action)).toEqual(['incident.created', 'incident.created']);
    expect(s.state.audit[0]!.actor).toBe('system');
  });

  it('stores a bad-CRC message as an unparsed report, raw text intact, and still succeeds', async () => {
    const s = new MemoryStore();
    const a = await ingest(sms(BAD_CRC), s);
    expect(a).toMatchObject({ outcome: 'unparsed', error: 'checksum_mismatch', incident_id: null });
    expect(s.state.reports).toHaveLength(1);
    expect(s.state.reports[0]).toMatchObject({ raw: BAD_CRC, parseError: 'checksum_mismatch', parsed: null, incidentId: null });
    expect(s.state.incidents).toHaveLength(0);
    expect(s.state.audit[0]!.action).toBe('report.unparsed');
  });

  it('keeps whatever text arrives, even garbage, and replies to the sender', async () => {
    const s = new MemoryStore();
    const a = await ingest(sms('accident route nationale 1 vite'), s);
    expect(a.outcome).toBe('unparsed');
    expect(s.state.reports[0]!.raw).toBe('accident route nationale 1 vite');
    expect(s.state.outbox[0]).toMatchObject({ to: '+213555000001', purpose: 'ack' });
  });

  it('is idempotent: re-posting the same text creates nothing new', async () => {
    const s = new MemoryStore();
    const first = await ingest(sms(EX1), s);
    const again = await ingest(sms(EX1), s);
    expect(again).toMatchObject({ outcome: 'duplicate', report_id: first.report_id, incident_id: 'K7Q2M' });
    expect(s.state.reports).toHaveLength(1);
    expect(s.state.assessments).toHaveLength(1);
    expect(s.state.outbox).toHaveLength(1); // no second ACK

    const bad1 = await ingest(sms(BAD_CRC), s);
    const bad2 = await ingest(sms(BAD_CRC), s);
    expect(bad2.report_id).toBe(bad1.report_id);
    expect(s.state.reports).toHaveLength(2);
  });

  it('merges a different-id report ~120 m and 4 min away: merged_count 2, version 2', async () => {
    const s = new MemoryStore();
    await ingest(sms(EX1), s);
    const m = await ingest(sms(NEAR_EX1, { senderHash: 'h-witness', replyTo: null }), s);

    expect(m).toMatchObject({ outcome: 'merged', incident_id: 'K7Q2M', merged_count: 2 });
    expect(m.assessment).toMatchObject({ band: 'R', conf: 'H', version: 2 });
    expect(s.state.incidents).toHaveLength(1);
    expect(s.state.incidents[0]!.mergedCount).toBe(2);
    // position stays anchored on the sensor packet
    expect(s.state.incidents[0]).toMatchObject({ lat: 36.47213, lon: 2.82871 });
    const last = s.state.audit.at(-1)!;
    expect(last.action).toBe('incident.report_merged');
    expect(last.before).toMatchObject({ merged_count: 1 });
    expect(last.after).toMatchObject({ merged_count: 2 });
  });

  it('an independent witness report lifts confidence one level (M → H)', async () => {
    const s = new MemoryStore();
    // sensor-only alert: 3 sensor inputs, one evidence group → M
    const auto = encodeDzmsd(packet({ id: 'A1B2C', src: 'A', dv: 71, g: 38, roll: true }));
    const first = await ingest(sms(auto), s);
    expect(first.assessment!.conf).toBe('M');
    // witness adds nothing new except being a second, independent report
    const witness = encodeDzmsd(packet({ id: 'W1TN5', lat: 36.47321, time: '1436' }));
    const second = await ingest(sms(witness, { senderHash: 'h-w' }), s);
    expect(second).toMatchObject({ outcome: 'merged', merged_count: 2 });
    expect(second.assessment!.conf).toBe('H');
  });
});

describe('ingest — merge boundaries', () => {
  it('does not merge beyond 300 m', async () => {
    const s = new MemoryStore();
    await ingest(sms(EX1), s);
    const far = encodeDzmsd(packet({ lat: 36.47213 + 0.0032 })); // ~356 m
    expect((await ingest(sms(far), s)).outcome).toBe('created');
  });

  it('does not merge beyond 10 minutes', async () => {
    const s = new MemoryStore();
    await ingest(sms(EX1), s);
    const late = encodeDzmsd(packet({ time: '1443' })); // 11 min after 14:32
    expect((await ingest(sms(late), s)).outcome).toBe('created');
  });

  it('a dispatcher band override survives a later merged report; the computed band is still recorded', async () => {
    const s = new MemoryStore();
    await ingest(sms(EX1), s);
    Object.assign(s.state.incidents[0]!, { band: 'O', bandOverride: 'O' });
    const m = await ingest(sms(NEAR_EX1), s);
    expect(m.assessment!.band).toBe('R');
    expect(s.state.incidents[0]).toMatchObject({ band: 'O', bandOverride: 'O', mergedCount: 2 });
  });

  it('does not merge into a closed or cancelled incident', async () => {
    const s = new MemoryStore();
    await ingest(sms(EX1), s);
    s.state.incidents[0]!.status = 'CANCELLED';
    expect((await ingest(sms(NEAR_EX1), s)).outcome).toBe('created');
  });
});

describe('ingest — same id on two channels, server authority, atomicity', () => {
  const json: IncidentJson = {
    v: 1, incident_id: 'K7Q2M', source: 'auto', created_at: '2026-10-30T14:32:07+01:00',
    location: { lat: 36.47213, lon: 2.82871 },
    crash: { dv_kmh: 71, peak_g: 38, rollover: true, no_response: true },
    scene: { vehicles: 1, persons: 1, kinds: ['car'], flags: [] },
    vitals: { hr: 124, spo2: 89 },
    medical: { blood: 'O+', consent: true },
  };
  const viaJson = (body: IncidentJson): InboundMessage => ({ kind: 'json', channel: 'https', body, receivedAt: AT, senderHash: 'h-app' });

  it('JSON then SMS with the same id = one report on two channels (updated, merged_count stays 1)', async () => {
    const s = new MemoryStore();
    const a = await ingest(viaJson(json), s);
    expect(a.assessment).toMatchObject({ band: 'R', nsi: 75 });
    const b = await ingest(sms(EX1), s);
    expect(b).toMatchObject({ outcome: 'updated', incident_id: 'K7Q2M', merged_count: 1 });
    expect(s.state.incidents).toHaveLength(1);
    expect(s.state.reports).toHaveLength(2);
  });

  it('never stores the medical block with the report', async () => {
    const s = new MemoryStore();
    await ingest(viaJson(json), s);
    expect(s.state.reports[0]!.raw).not.toContain('O+');
    expect(s.state.reports[0]!.raw).not.toContain('medical');
  });

  it('recomputes the band server-side: a packet claiming G10L with R content becomes R', async () => {
    const s = new MemoryStore();
    const forged = encodeDzmsd(packet({ id: 'F0RGE', band: 'G', score: 10, conf: 'L', src: 'A', dv: 71, g: 38, roll: true, flags: ['N'], spo2: 89 }));
    const a = await ingest(sms(forged), s);
    expect(a.assessment).toMatchObject({ band: 'R' });
    expect(s.state.reports[0]!.parsed!.hint).toEqual({ band: 'G', score: 10, conf: 'L' }); // kept for audit
  });

  it('rolls everything back if a write fails mid-transaction', async () => {
    const s = new MemoryStore();
    s.failOnInsertReport = true;
    await expect(ingest(sms(EX1), s)).rejects.toThrow('simulated failure');
    expect(s.state.incidents).toHaveLength(0);
    expect(s.state.audit).toHaveLength(0);
  });

  it('queues an ACK SMS only for the sms channel', async () => {
    const s = new MemoryStore();
    await ingest(sms(EX1, { channel: 'paste', replyTo: null }), s);
    await ingest(viaJson({ ...json, incident_id: 'B2C3D' }), s);
    expect(s.state.outbox).toHaveLength(0);
    await ingest(sms(EX2, { receivedAt: new Date('2026-10-30T08:20:00Z') }), s);
    expect(s.state.outbox[0]!.body).toMatch(/^SELLEKNI RECU P3N8D \d{4}\./);
  });
});

describe('ingest — witness link (D10): pinned to the linked incident', () => {
  const witness = (over: Partial<IncidentJson> = {}): InboundMessage => ({
    kind: 'json', channel: 'witness', receivedAt: AT, senderHash: 'h-ip', target: 'K7Q2M',
    body: {
      v: 1, incident_id: 'W1TN5', source: 'witness', created_at: '2026-10-30T15:30:00+01:00', // 58 min later
      location: { lat: 36.6, lon: 2.9 }, // ~14 km away
      scene: { vehicles: 2, persons: 1, kinds: ['car'], flags: ['trapped'] }, ...over,
    },
  });

  it('merges into the linked incident even outside 300 m / 10 min, as an independent report', async () => {
    const s = new MemoryStore();
    await ingest(sms(EX1), s);
    const r = await ingest(witness(), s);
    expect(r).toMatchObject({ outcome: 'merged', incident_id: 'K7Q2M', merged_count: 2 });
    expect(s.state.reports[1]).toMatchObject({ channel: 'witness', source: 'witness', incidentId: 'K7Q2M' });
  });

  it('a closed linked incident falls back to the normal rule (never dropped: here a new incident)', async () => {
    const s = new MemoryStore();
    await ingest(sms(EX1), s);
    s.state.incidents[0]!.status = 'CLOSED';
    const r = await ingest(witness(), s);
    expect(r).toMatchObject({ outcome: 'created', incident_id: 'W1TN5' });
  });
});

