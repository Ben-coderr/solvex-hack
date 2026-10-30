import 'server-only';
import type postgres from 'postgres';
import { MERGE_RADIUS_M, MERGE_WINDOW_MIN, type DzmsdPacket } from '@najda/shared';
import { sql as getSql, type Sql } from '../db';
import type { IncidentRow, IngestStore, IngestTx } from './ingest-store';

type Tx = postgres.TransactionSql;

/** Columns that rebuild an IncidentRow; PostGIS lives in the `extensions` schema on Supabase. */
export const INCIDENT_COLUMNS = (sql: Sql | Tx) => sql`
  id, status, band, band_override, nsi, conf,
  extensions.st_y(location::extensions.geometry) as lat,
  extensions.st_x(location::extensions.geometry) as lon,
  plus_code, crashed_at, first_channel, merged_count`;

interface IncidentDbRow {
  id: string; status: IncidentRow['status']; band: IncidentRow['band']; band_override: IncidentRow['band'] | null; nsi: number; conf: IncidentRow['conf'];
  lat: number; lon: number; plus_code: string | null; crashed_at: Date; first_channel: IncidentRow['firstChannel'];
  merged_count: number;
}

export const toIncident = (r: IncidentDbRow): IncidentRow => ({
  id: r.id, status: r.status, band: r.band, bandOverride: r.band_override, nsi: r.nsi, conf: r.conf, lat: r.lat, lon: r.lon,
  plusCode: r.plus_code, crashedAt: r.crashed_at, firstChannel: r.first_channel, mergedCount: r.merged_count,
});

const point = (sql: Tx, lat: number, lon: number) =>
  sql`extensions.st_setsrid(extensions.st_makepoint(${lon}, ${lat}), 4326)::extensions.geography`;

const json = (sql: Tx, v: unknown) => sql.json(v as postgres.JSONValue);

function txOps(sql: Tx): IngestTx {
  return {
    async lockIngest() {
      await sql`select pg_advisory_xact_lock(hashtext('najda.ingest'))`;
    },

    async findDuplicate({ clientId, channel, raw, senderHash }) {
      const rows = clientId
        ? await sql<{ id: string; incident_id: string | null }[]>`
            select id, incident_id from public.reports
            where client_id = ${clientId} and channel = ${channel} and md5(raw) = md5(${raw}) limit 1`
        : await sql<{ id: string; incident_id: string | null }[]>`
            select id, incident_id from public.reports
            where client_id is null and channel = ${channel} and md5(raw) = md5(${raw})
              and coalesce(sender_hash, '') = ${senderHash ?? ''} limit 1`;
      const r = rows[0];
      return r ? { id: r.id, incidentId: r.incident_id } : null;
    },

    async findIncidentByClientId(clientId) {
      const rows = await sql<IncidentDbRow[]>`
        select ${INCIDENT_COLUMNS(sql)} from public.incidents
        where id = coalesce(
          (select incident_id from public.reports where client_id = ${clientId} and incident_id is not null limit 1),
          ${clientId})
        for update`;
      return rows[0] ? toIncident(rows[0]) : null;
    },

    async findMergeCandidate(lat, lon, at) {
      // docs/04 §5 merge SQL, inside the ingest transaction.
      const rows = await sql<IncidentDbRow[]>`
        select ${INCIDENT_COLUMNS(sql)} from public.incidents
        where status not in ('CLOSED','CANCELLED','MERGED')
          and extensions.st_dwithin(location, ${point(sql, lat, lon)}, ${MERGE_RADIUS_M})
          and crashed_at between ${at}::timestamptz - make_interval(mins => ${MERGE_WINDOW_MIN})
                             and ${at}::timestamptz + make_interval(mins => ${MERGE_WINDOW_MIN})
        order by crashed_at
        limit 1
        for update`;
      return rows[0] ? toIncident(rows[0]) : null;
    },

    async listPackets(incidentId) {
      const rows = await sql<{ packet: DzmsdPacket }[]>`
        select parsed->'packet' as packet from public.reports
        where incident_id = ${incidentId} and parsed is not null
        order by received_at, id`;
      return rows.map((r) => r.packet);
    },

    async insertIncident(i) {
      await sql`
        insert into public.incidents
          (id, status, band, band_override, nsi, conf, location, plus_code, crashed_at, first_channel, merged_count)
        values (${i.id}, ${i.status}, ${i.band}, ${i.bandOverride}, ${i.nsi}, ${i.conf}, ${point(sql, i.lat, i.lon)},
                ${i.plusCode}, ${i.crashedAt}, ${i.firstChannel}, ${i.mergedCount})`;
    },

    async updateIncident(id, p) {
      const cols: Record<string, string | number | Date | null> = {};
      if (p.status !== undefined) cols.status = p.status;
      if (p.band !== undefined) cols.band = p.band;
      if (p.bandOverride !== undefined) cols.band_override = p.bandOverride;
      if (p.nsi !== undefined) cols.nsi = p.nsi;
      if (p.conf !== undefined) cols.conf = p.conf;
      if (p.plusCode !== undefined) cols.plus_code = p.plusCode;
      if (p.crashedAt !== undefined) cols.crashed_at = p.crashedAt;
      if (p.mergedCount !== undefined) cols.merged_count = p.mergedCount;
      const keys = Object.keys(cols);
      const hasLoc = p.lat !== undefined && p.lon !== undefined;
      if (!keys.length && !hasLoc) return;
      // One statement = one Realtime UPDATE event per change. The column helper must follow `set` directly:
      // postgres.js renders it from the preceding keyword (inside another fragment it becomes an identifier list).
      const loc = hasLoc ? point(sql, p.lat!, p.lon!) : null;
      if (!keys.length) await sql`update public.incidents set location = ${loc!} where id = ${id}`;
      else if (loc) await sql`update public.incidents set ${sql(cols, keys)}, location = ${loc} where id = ${id}`;
      else await sql`update public.incidents set ${sql(cols, keys)} where id = ${id}`;
    },

    async insertReport(r) {
      const [row] = await sql<{ id: string }[]>`
        insert into public.reports
          (incident_id, client_id, channel, source, raw, parsed, parse_error, sender_hash, received_at)
        values (${r.incidentId}, ${r.clientId}, ${r.channel}, ${r.source}, ${r.raw},
                ${r.parsed ? json(sql, r.parsed) : null}, ${r.parseError}, ${r.senderHash}, ${r.receivedAt})
        returning id`;
      return row!.id;
    },

    async insertAssessment(a) {
      const [row] = await sql<{ version: number }[]>`
        insert into public.assessments (incident_id, version, band, nsi, conf, reasons, inputs, engine_version)
        values (${a.incidentId},
                coalesce((select max(version) from public.assessments where incident_id = ${a.incidentId}), 0) + 1,
                ${a.band}, ${a.nsi}, ${a.conf}, ${json(sql, a.reasons)}, ${json(sql, a.inputs)}, ${a.engineVersion})
        returning version`;
      return row!.version;
    },

    async latestAssessmentVersion(incidentId) {
      const [row] = await sql<{ v: number | null }[]>`
        select max(version) as v from public.assessments where incident_id = ${incidentId}`;
      return row?.v ?? null;
    },

    async appendAudit(e) {
      await sql`
        insert into public.audit_events (incident_id, actor, action, before, after, reason)
        values (${e.incidentId}, ${e.actor}, ${e.action},
                ${e.before === null ? null : json(sql, e.before)},
                ${e.after === null ? null : json(sql, e.after)}, ${e.reason})`;
    },

    async enqueueSms(m) {
      await sql`
        insert into public.sms_outbox (to_number, body, purpose, incident_id)
        values (${m.to}, ${m.body}, ${m.purpose}, ${m.incidentId})`;
    },
  };
}

export const postgresStore = (sql: Sql = getSql()): IngestStore => ({
  transaction: (fn) => sql.begin((tx) => fn(txOps(tx))) as Promise<Awaited<ReturnType<typeof fn>>>,
});
