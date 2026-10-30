import 'server-only';
import { sql as getSql } from '../db';
import { env } from '../env';
import { sendSms } from './sms/gateway';

/**
 * Deliver queued SMS (ACKs, pre-alerts). Called after the writing transaction commits; failures stay visible in
 * sms_outbox.status/error. SKIP LOCKED so two concurrent calls never send the same row twice.
 */
export async function deliverOutbox(limit = 20): Promise<{ sent: number; failed: number }> {
  const sql = getSql();
  const e = env();
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < limit; i++) {
    const done = await sql.begin(async (tx) => {
      const [m] = await tx<{ id: string; to_number: string | null; body: string }[]>`
        select id, to_number, body from public.sms_outbox where status = 'queued'
        order by created_at limit 1 for update skip locked`;
      if (!m) return false;
      if (!m.to_number) {
        await tx`update public.sms_outbox set status = 'no_number' where id = ${m.id}`;
        return true;
      }
      const r = await sendSms(m.to_number, m.body, {
        mode: e.SMSGATE_MODE, baseUrl: e.SMSGATE_BASE_URL || undefined, user: e.SMSGATE_USER, password: e.SMSGATE_PASSWORD,
      });
      if (r.status === 'failed') failed++;
      else sent++;
      await tx`
        update public.sms_outbox
        set status = ${r.status}, error = ${r.status === 'failed' ? r.error : null},
            sent_at = ${r.status === 'failed' ? null : new Date()}
        where id = ${m.id}`;
      return true;
    });
    if (!done) break;
  }
  return { sent, failed };
}
