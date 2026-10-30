import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { IngestAck } from '@najda/api-contract';
import { encodeDzmsd, encodePlusCode, formatHHMM, generateIncidentId, type DzmsdPacket } from '../domain';
import { sql as getSql } from '../db';
import { ingest } from './ingest';
import { postgresStore } from './store-postgres';

/** Scenarios for "Simulate SMS" / replay. Re-encoded with the current time so merge windows behave live. */
export const SCENARIOS = ['rollover', 'witness_oran', 'bad_crc', 'witness_near_rollover'] as const;
export type Scenario = (typeof SCENARIOS)[number];

const ORIGIN = { lat: 36.47213, lon: 2.82871 }; // docs/05 §1.2 example 1

function scenarioText(s: Scenario, now: Date, anchorId?: string): string {
  const time = formatHHMM(now);
  const base = (p: Omit<DzmsdPacket, 'plus' | 'time'>): string =>
    encodeDzmsd({ ...p, time, plus: encodePlusCode(p.lat, p.lon) });
  switch (s) {
    case 'rollover':
      return base({ id: anchorId ?? generateIncidentId(), band: 'R', score: 75, conf: 'H', ...ORIGIN, src: 'A', veh: 1, pers: 1,
        kinds: ['C'], dv: 71, g: 38, roll: true, flags: ['N'], hr: 124, spo2: 89 });
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

/** Wipe incidents and everything hanging off them; restore seeded hospital statuses. Audited as the first new row. */
export async function resetDemo(actor: string): Promise<{ ms: number }> {
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
  return { ms: Date.now() - t0 };
}
