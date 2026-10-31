import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { IngestAck } from '@sellekni/api-contract';
import { CrewForm, encodeDzmsd, encodePlusCode, formatHHMM, generateIncidentId, WitnessForm, type DzmsdPacket } from '../domain';
import { sql as getSql } from '../db';
import { crewLink, submitCrew } from './crew';
import { ingest } from './ingest';
import { postgresStore } from './store-postgres';
import { submitWitness, witnessLink } from './witness';

/** Scenarios for "Simulate SMS" / replay. Re-encoded with the current time so merge windows behave live. */
export const SCENARIOS = ['rollover', 'frontal', 'witness_oran', 'bad_crc', 'witness_near_rollover'] as const;
export type Scenario = (typeof SCENARIOS)[number];
/** /demo and /phones only: they act on the latest open incident instead of creating a packet from nothing. */
export const ACTIONS = ['witness', 'duplicate', 'crew'] as const;
export type DemoAction = (typeof ACTIONS)[number];

/** docs/10 §3 step 7: "2 vehicles, motorbike, trapped, child". */
const DEMO_WITNESS = WitnessForm.parse({ vehicles: '2', kinds: ['car', 'moto'], hurt: '1', danger: ['trapped', 'child'], here: 'yes' });

/** docs/03 flow E: "enters GCS 9, SBP 85" → physiology raises the band to R. */
const DEMO_CREW = CrewForm.parse({ gcs: '9', sbp: '85', etaMin: '12' });

const ORIGIN = { lat: 36.47213, lon: 2.82871 }; // docs/05 §1.2 example 1

function scenarioText(s: Scenario, now: Date, anchorId?: string): string {
  const time = formatHHMM(now);
  const base = (p: Omit<DzmsdPacket, 'plus' | 'time'>): string =>
    encodeDzmsd({ ...p, time, plus: encodePlusCode(p.lat, p.lon) });
  switch (s) {
    case 'rollover':
      return base({ id: anchorId ?? generateIncidentId(), band: 'R', score: 75, conf: 'H', ...ORIGIN, src: 'A', veh: 1, pers: 1,
        kinds: ['C'], dv: 71, g: 38, roll: true, flags: ['N'], hr: 124, spo2: 89 });
    case 'frontal': // frontal_45_r16: phone G is a lower bound (16 g = the sensor's ceiling), no response to the countdown
      return base({ id: anchorId ?? generateIncidentId(), band: 'Y', score: 44, conf: 'L', ...ORIGIN, src: 'A', veh: 1, pers: 1,
        kinds: ['C'], dv: 45, g: 16, flags: ['N'] });
    case 'witness_oran':
      return base({ id: generateIncidentId(), band: 'Y', score: 44, conf: 'M', lat: 35.69112, lon: -0.63305, src: 'W', veh: 1, pers: 2,
        kinds: ['C', 'P'], flags: ['X', 'C'] });
    case 'witness_near_rollover': // ~120 m north of the rollover
      return base({ id: generateIncidentId(), band: 'O', score: 50, conf: 'L', lat: ORIGIN.lat + 0.00108, lon: ORIGIN.lon, src: 'W',
        veh: 1, pers: 1, kinds: ['C'], flags: ['X'] });
    case 'bad_crc': {
      const ok = scenarioText('rollover', now);
      const crc = ok.slice(-2);
      return ok.slice(0, -2) + (crc === '00' ? '01' : '00');
    }
  }
}

export async function replay(s: Scenario, now = new Date()): Promise<{ text: string; ack: IngestAck }> {
  const text = scenarioText(s, now);
  const ack = await ingest({ kind: 'text', channel: 'sim', text, receivedAt: now, senderHash: 'demo', replyTo: null }, postgresStore());
  return { text, ack };
}

export class DemoConflict extends Error {}

/** The open incident a demo witness / duplicate acts on: the newest one. */
async function latestOpen(): Promise<string | null> {
  const [row] = await getSql()<{ id: string }[]>`
    select id from public.incidents where status not in ('CLOSED','CANCELLED','MERGED') order by created_at desc limit 1`;
  return row?.id ?? null;
}

/**
 * witness: the same path as the /w page (channel `witness`) into the newest open incident.
 * duplicate: the newest parsed SMS/simulated text re-delivered byte for byte (idempotence on stage: nothing changes).
 * crew: the /crew path (GCS 9, SBP 85, ETA 12 min) on the newest open incident; answers like an ingest (`updated`).
 */
export async function demoAction(a: DemoAction, ip: string, now = new Date()): Promise<{ text: string; ack: IngestAck }> {
  if (a === 'crew') {
    const id = await latestOpen();
    const crew = id ? await submitCrew(id, DEMO_CREW, ip, now) : null;
    if (!crew) throw new DemoConflict('no open incident: run a scenario first');
    const [inc] = await getSql()<{ merged_count: number }[]>`select merged_count from public.incidents where id = ${id}`;
    return {
      text: `crew → ${id}`,
      ack: {
        outcome: 'updated', report_id: crew.report_id, incident_id: crew.incident_id, merged_count: inc?.merged_count ?? null,
        assessment: crew.assessment, error: null, received_at: now.toISOString(),
      },
    };
  }
  if (a === 'witness') {
    const id = await latestOpen();
    const ack = id ? await submitWitness(id, DEMO_WITNESS, ip, now) : null;
    if (!ack) throw new DemoConflict('no open incident: run a scenario first');
    return { text: `witness → ${id}`, ack };
  }
  const [last] = await getSql()<{ raw: string; channel: 'sim' | 'sms' | 'paste' }[]>`
    select raw, channel from public.reports
    where parsed is not null and channel in ('sim','sms','paste') order by received_at desc limit 1`;
  if (!last) throw new DemoConflict('nothing to duplicate: run a scenario first');
  const ack = await ingest({ kind: 'text', channel: last.channel, text: last.raw, receivedAt: now, senderHash: 'demo', replyTo: null }, postgresStore());
  return { text: last.raw, ack };
}

export interface DemoPhones {
  latest: { id: string; band: string; nsi: number; conf: string; merged_count: number; status: string; created_at: Date } | null;
  /** the newest packet that reached the server, as the driver's phone sent it */
  lastPacket: { raw: string; channel: string; received_at: Date } | null;
  witness: { url: string; svg: string } | null;
  crew: { url: string; svg: string; expiresAt: string } | null;
  /** outbound SMS (ACKs to drivers, pre-alerts to hospitals), newest first: what the virtual phones receive */
  sms: Array<{ id: string; to_number: string | null; body: string; purpose: string; status: string; created_at: Date }>;
}

export async function demoPhones(origin: string): Promise<DemoPhones> {
  const sql = getSql();
  const [latest] = await sql<NonNullable<DemoPhones['latest']>[]>`
    select id, band, nsi, conf, merged_count, status, created_at from public.incidents
    where status not in ('CLOSED','CANCELLED','MERGED') order by created_at desc limit 1`;
  const [lastPacket] = await sql<NonNullable<DemoPhones['lastPacket']>[]>`
    select raw, channel, received_at from public.reports
    where parsed is not null and source in ('auto','sos') order by received_at desc limit 1`;
  const sms = await sql<DemoPhones['sms']>`
    select id, to_number, body, purpose, status, created_at from public.sms_outbox order by created_at desc limit 12`;
  return {
    latest: latest ?? null,
    lastPacket: lastPacket ?? null,
    witness: latest ? await witnessLink(latest.id, origin) : null,
    crew: latest ? await crewLink(latest.id, origin) : null,
    sms,
  };
}

const DEMO_TABLES = ['incidents', 'reports', 'assessments', 'prealerts', 'sms_outbox', 'eta_cache', 'audit_events'] as const;

/** Wipe incidents and everything hanging off them; restore seeded hospital statuses. Audited as the first new row. */
export async function resetDemo(actor: string): Promise<{ ms: number; clean: boolean; counts: Record<string, number> }> {
  const t0 = Date.now();
  const seed = JSON.parse(readFileSync(path.resolve(process.cwd(), '../../data/hospitals.seed.json'), 'utf8')) as {
    statuses?: Array<{ hospital_id: string; status: string; set_by?: string }>;
  };
  await getSql().begin(async (sql) => {
    await sql`truncate public.prealerts, public.assessments, public.reports, public.audit_events, public.sms_outbox,
                       public.eta_cache, public.incidents restart identity cascade`;
    await sql`delete from public.hospital_status`;
    for (const st of seed.statuses ?? []) {
      await sql`insert into public.hospital_status (hospital_id, status, set_by) values (${st.hospital_id}, ${st.status}, ${st.set_by ?? 'seed'})`;
    }
    await sql`insert into public.audit_events (incident_id, actor, action, before, after, reason)
              values (null, ${actor}, 'demo.reset', null, null, 'demo reset')`;
  });
  // Verify, don't assume: every demo table empty except the one reset audit row.
  const [row] = await getSql()<Record<string, number>[]>`
    select ${getSql().unsafe(DEMO_TABLES.map((t) => `(select count(*)::int from public.${t}) as ${t}`).join(', '))}`;
  const counts = { ...row } as Record<string, number>;
  const clean = DEMO_TABLES.every((t) => counts[t] === (t === 'audit_events' ? 1 : 0));
  return { ms: Date.now() - t0, clean, counts };
}
