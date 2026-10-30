import 'server-only';
import type postgres from 'postgres';
import type { Band } from '../domain';
import { checkTransition, hasReason, MIN_REASON_LENGTH } from '../domain/lifecycle';
import { sql as getSql } from '../db';
import type { IncidentStatus } from './ingest-store';
import { recommend } from './recommendations';

export type IncidentPatch =
  | { action: 'transition'; to: IncidentStatus; reason?: string | undefined }
  /** band null = clear the override and go back to the computed band */
  | { action: 'override_band'; band: Band | null; reason: string }
  | { action: 'set_hospital'; hospital_id: string; reason?: string | undefined }
  | { action: 'assign_unit'; unit: string; reason?: string | undefined };

export type PatchResult =
  | { ok: true; incident: Record<string, unknown> }
  | { ok: false; status: 404 | 409 | 422; error: string };

const json = (sql: postgres.TransactionSql, v: unknown) => sql.json(v as postgres.JSONValue);

/** Every change is a human action: one transaction, row lock, validation, update, audit (actor + reason). */
export async function applyPatch(id: string, patch: IncidentPatch, actor: string): Promise<PatchResult> {
  // The recommendation may call a routing provider: compute it before taking the row lock.
  let topHospital: string | null = null;
  if (patch.action === 'set_hospital') {
    const rec = await recommend(id);
    if (!rec) return { ok: false, status: 404, error: 'incident not found' };
    topHospital = rec.items[0]?.hospitalId ?? null;
  }

  return getSql().begin(async (sql): Promise<PatchResult> => {
    const [cur] = await sql<{ status: IncidentStatus; band: Band; band_override: Band | null; hospital_id: string | null; assigned_unit: string | null }[]>`
      select status, band, band_override, hospital_id, assigned_unit from public.incidents where id = ${id} for update`;
    if (!cur) return { ok: false, status: 404, error: 'incident not found' };

    let action: string;
    let after: Record<string, unknown>;
    const reason = 'reason' in patch && patch.reason?.trim() ? patch.reason.trim() : null;

    switch (patch.action) {
      case 'transition': {
        const check = checkTransition(cur.status, patch.to, reason);
        if (!check.ok) return { ok: false, status: 409, error: check.why };
        await sql`update public.incidents set status = ${patch.to} where id = ${id}`;
        action = 'incident.transition';
        after = { status: patch.to };
        break;
      }
      case 'override_band': {
        if (!hasReason(reason)) return { ok: false, status: 422, error: `an override needs a reason (at least ${MIN_REASON_LENGTH} characters)` };
        let band = patch.band;
        if (band === null) {
          const [a] = await sql<{ band: Band }[]>`
            select band from public.assessments where incident_id = ${id} order by version desc limit 1`;
          band = a?.band ?? cur.band;
        }
        await sql`update public.incidents set band = ${band}, band_override = ${patch.band} where id = ${id}`;
        action = patch.band === null ? 'incident.override_cleared' : 'incident.band_override';
        after = { band, band_override: patch.band };
        break;
      }
      case 'set_hospital': {
        const [h] = await sql`select id from public.hospitals where id = ${patch.hospital_id}`;
        if (!h) return { ok: false, status: 422, error: 'unknown hospital' };
        const isOverride = patch.hospital_id !== topHospital;
        if (isOverride && !hasReason(reason)) {
          return { ok: false, status: 422, error: `choosing a facility other than the top recommendation (${topHospital ?? 'none'}) needs a reason` };
        }
        await sql`update public.incidents set hospital_id = ${patch.hospital_id} where id = ${id}`;
        action = isOverride ? 'incident.hospital_override' : 'incident.hospital_set';
        after = { hospital_id: patch.hospital_id, recommended: topHospital };
        break;
      }
      case 'assign_unit': {
        await sql`update public.incidents set assigned_unit = ${patch.unit} where id = ${id}`;
        action = 'incident.unit_assigned';
        after = { assigned_unit: patch.unit };
        break;
      }
    }

    await sql`
      insert into public.audit_events (incident_id, actor, action, before, after, reason)
      values (${id}, ${actor}, ${action}, ${json(sql, cur)}, ${json(sql, after)}, ${reason})`;
    const [incident] = await sql`
      select id, status, band, band_override, nsi, conf, hospital_id, assigned_unit, merged_count, updated_at
      from public.incidents where id = ${id}`;
    return { ok: true, incident: incident! };
  });
}
