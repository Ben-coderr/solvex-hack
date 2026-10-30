import 'server-only';
import { sql as getSql } from '../db';
import { INCIDENT_COLUMNS, toIncident } from './store-postgres';
import type { IncidentRow } from './ingest-store';

const OPEN = ['RECEIVED', 'ACKNOWLEDGED', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'AT_HOSPITAL'] as const;
const BAND_ORDER = "array['R','O','Y','U','G']::public.band[]";

export interface IncidentListItem {
  id: string;
  status: string;
  band: string;
  nsi: number;
  conf: string;
  lat: number;
  lon: number;
  plus_code: string | null;
  crashed_at: Date;
  first_channel: string;
  merged_count: number;
  hospital_id: string | null;
  created_at: Date;
  updated_at: Date;
  /** auto alert not yet confirmed by a human or by a witness merge (docs/05 §7) */
  unconfirmed_auto: boolean;
}

/** Queue: band first (R, O, Y, U, G), then oldest first. */
export async function listIncidents(filter: 'open' | 'all'): Promise<IncidentListItem[]> {
  const sql = getSql();
  return sql<IncidentListItem[]>`
    select i.id, i.status, i.band, i.nsi, i.conf,
      extensions.st_y(i.location::extensions.geometry) as lat,
      extensions.st_x(i.location::extensions.geometry) as lon,
      i.plus_code, i.crashed_at, i.first_channel, i.merged_count, i.hospital_id, i.created_at, i.updated_at,
      (i.status = 'RECEIVED' and i.merged_count = 1 and exists (
        select 1 from public.reports r where r.incident_id = i.id and r.source = 'auto')) as unconfirmed_auto
    from public.incidents i
    where ${filter === 'open' ? sql`i.status = any(${OPEN as unknown as string[]}::public.incident_status[])` : sql`true`}
    order by array_position(${sql.unsafe(BAND_ORDER)}, i.band), i.created_at
    limit 500`;
}

export interface UnparsedReport { id: string; channel: string; raw: string; parse_error: string; received_at: Date }

export async function listUnparsed(limit = 50): Promise<UnparsedReport[]> {
  const sql = getSql();
  return sql<UnparsedReport[]>`
    select id, channel, raw, parse_error, received_at from public.reports
    where parse_error is not null order by received_at desc limit ${limit}`;
}

export async function getIncidentRow(id: string): Promise<IncidentRow | null> {
  const sql = getSql();
  const rows = await sql<Parameters<typeof toIncident>[0][]>`
    select ${INCIDENT_COLUMNS(sql)} from public.incidents where id = ${id}`;
  return rows[0] ? toIncident(rows[0]) : null;
}

export async function getIncidentDetail(id: string) {
  const sql = getSql();
  const [incident] = await sql`
    select i.*, extensions.st_y(i.location::extensions.geometry) as lat, extensions.st_x(i.location::extensions.geometry) as lon
    from public.incidents i where i.id = ${id}`;
  if (!incident) return null;
  delete incident.location;
  const [reports, assessments, prealerts, audit, callback] = await Promise.all([
    sql`select id, client_id, channel, source, raw, parsed, parse_error, received_at
        from public.reports where incident_id = ${id} order by received_at`,
    sql`select version, band, nsi, conf, reasons, inputs, engine_version, created_at
        from public.assessments where incident_id = ${id} order by version desc`,
    sql`select id, hospital_id, channel, body, sent_at, acked_at, acked_by
        from public.prealerts where incident_id = ${id} order by sent_at`,
    sql`select id, actor, action, before, after, reason, at
        from public.audit_events where incident_id = ${id} order by at, id`,
    // Reports keep only a hash of the sender; the number the ACK SMS went to is the call-back number.
    sql<{ to_number: string }[]>`select to_number from public.sms_outbox
        where incident_id = ${id} and purpose = 'ack' and to_number is not null order by created_at desc limit 1`,
  ]);
  return {
    incident, assessment: assessments[0] ?? null, assessments, reports, prealerts, audit,
    callback: callback[0]?.to_number ?? null,
  };
}
