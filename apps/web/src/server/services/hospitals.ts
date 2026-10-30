import 'server-only';
import type postgres from 'postgres';
import { sql as getSql } from '../db';
import { samePhone } from '../domain';

export type HospitalStatus = 'OK' | 'BUSY' | 'SATURATED';

/** Append a status row (latest wins; older than 6 h decays to UNKNOWN in ranking) and audit it. */
export async function setHospitalStatus(id: string, status: HospitalStatus, actor: string): Promise<boolean> {
  return getSql().begin(async (sql) => {
    const [h] = await sql`select id from public.hospitals where id = ${id}`;
    if (!h) return false;
    const [prev] = await sql<{ status: string; set_at: Date }[]>`
      select status, set_at from public.hospital_status where hospital_id = ${id} order by set_at desc limit 1`;
    await sql`insert into public.hospital_status (hospital_id, status, set_by) values (${id}, ${status}, ${actor})`;
    await sql`
      insert into public.audit_events (incident_id, actor, action, before, after, reason)
      values (null, ${actor}, 'hospital.status',
        ${prev ? sql.json(prev as unknown as postgres.JSONValue) : null},
        ${sql.json({ hospital_id: id, status } as postgres.JSONValue)}, null)`;
    return true;
  });
}

/**
 * D14: `SLK STATUS CHU-A SAT` from the hospital's own registered number sets its status and gets a reply.
 * Returns false when the number does not match: the caller then stores the text like any other SMS (never dropped).
 */
export async function statusFromSms(hospitalId: string, status: HospitalStatus, from: string, reply: string): Promise<boolean> {
  const [h] = await getSql()<{ phone_sms: string | null }[]>`select phone_sms from public.hospitals where id = ${hospitalId}`;
  if (!h?.phone_sms || !samePhone(h.phone_sms, from)) return false;
  await setHospitalStatus(hospitalId, status, `sms:${hospitalId}`);
  await getSql()`insert into public.sms_outbox (to_number, body, purpose, incident_id)
                 values (${from}, ${reply}, 'status_reply', null)`;
  return true;
}
