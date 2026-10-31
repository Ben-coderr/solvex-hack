import { describe, expect, it } from 'vitest';
import type { IncidentJson } from '@sellekni/api-contract';
import { crewUpdate, ingest, type InboundMessage } from '../ingest';
import { MemoryStore } from './memory-store';

// docs/05 §1.2 example 2: a witness report, band Y
const EX2 = 'SLK1 P3N8D Y44M 35.69112,-0.63305 T0915 SW V1 P2 KCP FXC 8C7XM9R8+CQ #30';
const AT = new Date('2026-10-30T08:20:00Z');
const sms = (text: string): InboundMessage => ({ kind: 'text', channel: 'sms', text, receivedAt: AT, senderHash: 'h', replyTo: null });
const crew = (vitals: Parameters<typeof crewUpdate>[0]['vitals'], at = new Date(AT.getTime() + 20 * 60_000)) =>
  ({ incidentId: 'P3N8D', vitals, receivedAt: at, senderHash: 'h-crew' });

describe('crewUpdate (D9, docs/03 flow E)', () => {
  it('GCS 9 + SBP 85 raise Y to R: new assessment version, crew report, audit entry with before/after', async () => {
    const s = new MemoryStore();
    await ingest(sms(EX2), s);
    const ack = await crewUpdate(crew({ gcs: 9, sbp: 85, etaMin: 12 }), s);

    expect(ack).toMatchObject({ incident_id: 'P3N8D', before: { band: 'Y' }, assessment: { band: 'R', version: 2 } });
    expect(s.state.incidents[0]).toMatchObject({ id: 'P3N8D', band: 'R', mergedCount: 1 }); // a crew update is not a 2nd report
    expect(s.state.reports.at(-1)).toMatchObject({ channel: 'crew', source: 'crew', parsed: { crew: { gcs: 9, sbp: 85, etaMin: 12 } } });
    const audit = s.state.audit.at(-1)!;
    expect(audit).toMatchObject({ actor: 'crew', action: 'incident.crew_update', before: { band: 'Y' }, after: { band: 'R', assessment_version: 2 } });
  });

  it('a dispatcher override still wins over the recomputed band', async () => {
    const s = new MemoryStore();
    await ingest(sms(EX2), s);
    s.state.incidents[0]!.bandOverride = 'O';
    s.state.incidents[0]!.band = 'O';
    const ack = await crewUpdate(crew({ gcs: 9 }), s);
    expect(ack!.assessment.band).toBe('R'); // computed, kept in the assessment
    expect(s.state.incidents[0]!.band).toBe('O'); // shown: the human decision
  });

  it('a later report re-merges WITH the crew values: the band does not fall back', async () => {
    const s = new MemoryStore();
    await ingest(sms(EX2), s);
    await crewUpdate(crew({ gcs: 9 }), s);
    const witness: InboundMessage = {
      kind: 'json', channel: 'witness', receivedAt: new Date(AT.getTime() + 25 * 60_000), senderHash: 'h-ip', target: 'P3N8D',
      body: {
        v: 1, incident_id: 'W1TN5', source: 'witness', created_at: '2026-10-30T09:45:00+01:00',
        location: { lat: 35.69112, lon: -0.63305 }, scene: { vehicles: 1, persons: 1, kinds: ['car'], flags: [] },
      } satisfies IncidentJson,
    };
    const m = await ingest(witness, s);
    expect(m).toMatchObject({ outcome: 'merged', merged_count: 2, assessment: { band: 'R' } });
  });

  it('refuses an unknown or closed incident, and writes nothing', async () => {
    const s = new MemoryStore();
    expect(await crewUpdate(crew({ gcs: 9 }), s)).toBeNull();
    await ingest(sms(EX2), s);
    s.state.incidents[0]!.status = 'CLOSED';
    const before = s.state.reports.length;
    expect(await crewUpdate(crew({ gcs: 9 }), s)).toBeNull();
    expect(s.state.reports.length).toBe(before);
  });
});
