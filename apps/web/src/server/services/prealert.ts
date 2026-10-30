import 'server-only';
import type postgres from 'postgres';
import { fallbackEtaMin, haversineKm, type Flag } from '../domain';
import { prealertSms } from '../domain/prealert-sms';
import { sql as getSql } from '../db';
import { getIncidentRow } from './incidents';
import { deliverOutbox } from './outbox';
import { dbEtaCache, loadHospitals } from './recommendations';
import { cellKey } from './routing';

export type PrealertResult =
  | { ok: true; prealerts: Array<{ id: string; channel: 'web' | 'sms' }>; sms: { body: string; to: string | null }; etaMin: number; etaEstimated: boolean }
  | { ok: false; status: 404 | 422; error: string };

interface Inputs { persons?: number; rollover?: boolean; dvKmh?: number; spo2?: number; hr?: number; flags?: Flag[] }

/**
 * Human-triggered pre-alert to ONE hospital: a web card (always) + an SMS (when the facility has a number).
 * One transaction (prealerts + sms_outbox + audit); the SMS is sent after commit.
 */
export async function createPrealert(incidentId: string, hospitalId: string, actor: string): Promise<PrealertResult> {
  const incident = await getIncidentRow(incidentId);
  if (!incident) return { ok: false, status: 404, error: 'incident not found' };
  const hospital = (await loadHospitals()).find((h) => h.id === hospitalId);
  if (!hospital) return { ok: false, status: 422, error: 'unknown hospital' };

  const cached = (await dbEtaCache().get(cellKey(incident), [hospitalId]))[hospitalId];
  const etaMin = cached?.minutes ?? Math.ceil(fallbackEtaMin(haversineKm(incident.lat, incident.lon, hospital.lat, hospital.lon)));

  const sql = getSql();
  const [a] = await sql<{ inputs: Inputs }[]>`
    select inputs from public.assessments where incident_id = ${incidentId} order by version desc limit 1`;
  const i = a?.inputs ?? {};
  const body = prealertSms({
    id: incident.id, band: incident.band, nsi: incident.nsi, etaMin,
    persons: i.persons, rollover: i.rollover, dvKmh: i.dvKmh, spo2: i.spo2, hr: i.hr, flags: i.flags,
  });

  const prealerts = await sql.begin(async (tx) => {
    const made: Array<{ id: string; channel: 'web' | 'sms' }> = [];
    const channels: Array<'web' | 'sms'> = hospital.phoneSms ? ['web', 'sms'] : ['web'];
    for (const channel of channels) {
      const [row] = await tx<{ id: string }[]>`
        insert into public.prealerts (incident_id, hospital_id, channel, body)
        values (${incidentId}, ${hospitalId}, ${channel}, ${body}) returning id`;
      made.push({ id: row!.id, channel });
    }
    await tx`
      insert into public.sms_outbox (to_number, body, purpose, incident_id, status)
      values (${hospital.phoneSms}, ${body}, 'prealert', ${incidentId}, ${hospital.phoneSms ? 'queued' : 'no_number'})`;
    await tx`
      insert into public.audit_events (incident_id, actor, action, before, after, reason)
      values (${incidentId}, ${actor}, 'prealert.sent', null,
        ${tx.json({ hospital_id: hospitalId, channels: made.map((m) => m.channel), eta_min: etaMin, eta_estimated: !cached } as postgres.JSONValue)}, null)`;
    return made;
  });

  void deliverOutbox().catch(() => undefined); // status is visible in sms_outbox
  return { ok: true, prealerts, sms: { body, to: hospital.phoneSms }, etaMin, etaEstimated: !cached };
}
