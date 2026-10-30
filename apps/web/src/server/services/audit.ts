import 'server-only';
import { sql as getSql } from '../db';

export interface AuditRow { id: string; incident_id: string | null; actor: string; action: string; before: unknown; after: unknown; reason: string | null; at: Date }

/** Newest first. `incident` filters to one incident (null-incident events, e.g. hospital status, appear only unfiltered). */
export async function listAudit(incident: string | null, limit = 200): Promise<AuditRow[]> {
  const sql = getSql();
  return sql<AuditRow[]>`
    select id, incident_id, actor, action, before, after, reason, at from public.audit_events
    where ${incident ? sql`incident_id = ${incident}` : sql`true`}
    order by id desc limit ${limit}`;
}
