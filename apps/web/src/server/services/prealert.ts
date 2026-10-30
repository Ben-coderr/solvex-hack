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

export type AckResult = { ok: true; ackedAt: string; already: boolean } | { ok: false; status: 403 | 404; error: string };

/** Hospital acknowledges a pre-alert (all channels of that incident → hospital). Idempotent; audited. */
export async function ackPrealert(prealertId: string, actor: string, hospitalId: string | null): Promise<AckResult> {
  return getSql().begin(async (tx): Promise<AckResult> => {
    const [p] = await tx<{ incident_id: string; hospital_id: string; acked_at: Date | null }[]>`
      select incident_id, hospital_id, acked_at from public.prealerts where id = ${prealertId} for update`;
    if (!p) return { ok: false, status: 404, error: 'pre-alert not found' };
    if (hospitalId !== null && p.hospital_id !== hospitalId) return { ok: false, status: 403, error: 'not your facility' };
    if (p.acked_at) return { ok: true, ackedAt: p.acked_at.toISOString(), already: true };
    const [row] = await tx<{ acked_at: Date }[]>`
      update public.prealerts set acked_at = now(), acked_by = ${actor}
      where incident_id = ${p.incident_id} and hospital_id = ${p.hospital_id} and acked_at is null
      returning acked_at`;
    await tx`
      insert into public.audit_events (incident_id, actor, action, before, after, reason)
      values (${p.incident_id}, ${actor}, 'prealert.acked', null,
        ${tx.json({ hospital_id: p.hospital_id, prealert_id: prealertId } as postgres.JSONValue)}, null)`;
    return { ok: true, ackedAt: row!.acked_at.toISOString(), already: false };
  });
}

export interface IncomingPrealert {
  id: string; incident_id: string; channel: string; sent_at: Date; acked_at: Date | null; acked_by: string | null;
  band: string; nsi: number; conf: string; status: string; crashed_at: Date;
  reasons: Array<{ code: string; points: number; text: string }> | null; inputs: Record<string, unknown> | null;
  eta_min: number | null;
}

/** The hospital's incoming patients: one row per incident (the web card), newest first, last 12 h. */
export async function listIncoming(hospitalId: string): Promise<IncomingPrealert[]> {
  const sql = getSql();
  return sql<IncomingPrealert[]>`
    select p.id, p.incident_id, p.channel, p.sent_at, p.acked_at, p.acked_by,
           i.band, i.nsi, i.conf, i.status, i.crashed_at, a.reasons, a.inputs,
           (select (a2.after->>'eta_min')::int from public.audit_events a2
              where a2.incident_id = p.incident_id and a2.action = 'prealert.sent'
                and a2.after->>'hospital_id' = p.hospital_id order by a2.id desc limit 1) as eta_min
    from public.prealerts p
    join public.incidents i on i.id = p.incident_id
    left join lateral (select reasons, inputs from public.assessments where incident_id = p.incident_id order by version desc limit 1) a on true
    where p.hospital_id = ${hospitalId} and p.channel = 'web' and p.sent_at > now() - interval '12 hours'
    order by p.sent_at desc`;
}
