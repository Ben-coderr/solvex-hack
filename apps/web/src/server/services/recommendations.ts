import 'server-only';
import {
  rankHospitals, rankingCandidates, requiredCapabilities,
  type Capability, type Flag, type HospitalLevel, type HospitalRecord, type LoadStatus, type Recommendation, type StatusRecord,
} from '../domain';
import { sql as getSql } from '../db';
import { env } from '../env';
import { getIncidentRow } from './incidents';
import { getEtas, type Eta, type EtaCache, type EtaSource } from './routing';

export interface HospitalWithContact extends HospitalRecord { phoneSms: string | null }

/** Rows of the active set: HOSPITAL_SET=demo → the synthetic seed ('illustrative'), national → 'osm-unverified'. */
export const HOSPITAL_SOURCE = { demo: 'illustrative', national: 'osm-unverified' } as const;

export async function loadHospitals(): Promise<HospitalWithContact[]> {
  const sql = getSql();
  const source = HOSPITAL_SOURCE[env().HOSPITAL_SET];
  const rows = await sql<{
    id: string; name: string; level: HospitalLevel; lat: number; lon: number; capabilities: Capability[]; phone_sms: string | null;
  }[]>`
    select id, name, level, capabilities, phone_sms,
      extensions.st_y(location::extensions.geometry) as lat, extensions.st_x(location::extensions.geometry) as lon
    from public.hospitals where source = ${source} order by id`;
  return rows.map((r) => ({
    id: r.id, name: r.name, level: r.level, lat: r.lat, lon: r.lon, capabilities: r.capabilities, phoneSms: r.phone_sms,
  }));
}

/** Latest status per hospital; rankHospitals() decays anything older than 6 h to UNKNOWN. */
export async function loadStatuses(): Promise<Record<string, StatusRecord>> {
  const sql = getSql();
  const rows = await sql<{ hospital_id: string; status: Exclude<LoadStatus, 'UNKNOWN'>; set_at: Date }[]>`
    select distinct on (hospital_id) hospital_id, status, set_at
    from public.hospital_status order by hospital_id, set_at desc`;
  return Object.fromEntries(rows.map((r) => [r.hospital_id, { status: r.status, setAt: r.set_at.getTime() }]));
}

/** Flags of the merged picture, from the latest assessment inputs (they drive required capabilities). */
async function latestFlags(incidentId: string): Promise<Flag[]> {
  const sql = getSql();
  const [row] = await sql<{ flags: Flag[] | null }[]>`
    select inputs->'flags' as flags from public.assessments where incident_id = ${incidentId}
    order by version desc limit 1`;
  return row?.flags ?? [];
}

export const dbEtaCache = (): EtaCache => ({
  async get(originKey, ids) {
    const sql = getSql();
    const rows = await sql<{ hospital_id: string; minutes: number; km: number | null; source: Exclude<EtaSource, 'haversine'> }[]>`
      select hospital_id, minutes, km, source from public.eta_cache
      where origin_key = ${originKey} and hospital_id = any(${ids as string[]})`;
    return Object.fromEntries(rows.map((r) => [r.hospital_id, { minutes: r.minutes, km: r.km, source: r.source }]));
  },
  async put(originKey, etas) {
    const sql = getSql();
    for (const [hospitalId, e] of Object.entries(etas)) {
      await sql`
        insert into public.eta_cache (origin_key, hospital_id, minutes, km, source)
        values (${originKey}, ${hospitalId}, ${e.minutes}, ${e.km}, ${e.source})
        on conflict (origin_key, hospital_id) do update
          set minutes = excluded.minutes, km = excluded.km, source = excluded.source, computed_at = now()`;
    }
  },
});

export type RecommendationView = Recommendation & {
  /** routing provider per hospital id: osrm | ors | haversine (the fallback shows an "estimated" tag) */
  etaProvider: Record<string, EtaSource>;
  etaNotes: string[];
  /** facility coordinates for the map (straight line when the ETA is the haversine estimate) */
  coords: Record<string, { lat: number; lon: number }>;
  incident: { lat: number; lon: number };
};

export async function recommend(incidentId: string, now = new Date()): Promise<RecommendationView | null> {
  const incident = await getIncidentRow(incidentId);
  if (!incident) return null;
  const [all, statuses, flags] = await Promise.all([loadHospitals(), loadStatuses(), latestFlags(incidentId)]);
  const hospitals = rankingCandidates(all, incident, requiredCapabilities(incident.band, flags));
  const e = env();
  const { etas, notes } = await getEtas(
    incident, hospitals,
    { osrmUrl: e.OSRM_URL || undefined, orsKey: e.ORS_API_KEY || undefined },
    dbEtaCache(),
  );
  const rec = rankHospitals({
    band: incident.band,
    flags,
    incident: { lat: incident.lat, lon: incident.lon },
    hospitals,
    etaMin: Object.fromEntries(Object.entries(etas).map(([id, x]: [string, Eta]) => [id, x.minutes])),
    statuses,
    now: now.getTime(),
  });
  const etaProvider = Object.fromEntries(hospitals.map((h) => [h.id, etas[h.id]?.source ?? 'haversine'])) as Record<string, EtaSource>;
  const coords = Object.fromEntries(hospitals.map((h) => [h.id, { lat: h.lat, lon: h.lon }]));
  return { ...rec, etaProvider, etaNotes: notes, coords, incident: { lat: incident.lat, lon: incident.lon } };
}
