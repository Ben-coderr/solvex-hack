import 'server-only';
import QRCode from 'qrcode';
import { sql as getSql } from '../db';
import {
  CREW_LINK_TTL_MS, crewUpdateSms, expiringLinkToken, latestCrew, verifyExpiringLinkToken, type CrewVitals,
} from '../domain';
import { env } from '../env';
import { crewUpdate, type CrewAck } from './ingest';
import { deliverOutbox } from './outbox';
import { senderHash } from './sender';
import { postgresStore } from './store-postgres';

const CLOSED = ['CLOSED', 'CANCELLED', 'MERGED'];

/**
 * What the crew page shows. The crew is the care team holding a signed, expiring link: it sees the band, the
 * reasons and its own last values (to correct them), never the caller's number or the raw reports.
 */
type Reason = { code: string; points: number; text: string };

export type CrewView =
  | {
      state: 'open';
      id: string;
      band: string;
      nsi: number;
      conf: string;
      reasons: Reason[];
      /** the merged impact speed, for the localised "speed drop" reason */
      dvKmh: number | null;
      last: CrewVitals;
      expiresAt: Date;
    }
  | { state: 'closed' }
  | { state: 'expired' }
  | { state: 'invalid' };

/** Expiry rounded up to the hour: the link stays the same for an hour (the /phones iframe does not reload on each poll). */
const crewExpiry = (now: number) => Math.ceil((now + CREW_LINK_TTL_MS) / 3_600_000) * 3_600_000;

export const crewToken = (id: string, now = Date.now()) => expiringLinkToken('crew', id, crewExpiry(now), env().LINK_SIGNING_SECRET);

export async function crewView(id: string, k: string | null | undefined): Promise<CrewView> {
  if (!/^[0-9A-HJKMNP-TV-Z]{5}$/.test(id)) return { state: 'invalid' };
  const check = verifyExpiringLinkToken('crew', id, k, env().LINK_SIGNING_SECRET);
  if (!check.ok) return { state: check.why };
  const sql = getSql();
  const [row] = await sql<{ status: string; band: string; nsi: number; conf: string; reasons: Reason[] | null; dv: number | null }[]>`
    select i.status, i.band, i.nsi, i.conf, a.reasons, (a.inputs->>'dvKmh')::int as dv
    from public.incidents i
    left join lateral (select reasons, inputs from public.assessments where incident_id = i.id order by version desc limit 1) a on true
    where i.id = ${id}`;
  if (!row || CLOSED.includes(row.status)) return { state: 'closed' };
  const crew = await sql<{ crew: CrewVitals }[]>`
    select parsed->'crew' as crew from public.reports where incident_id = ${id} and source = 'crew' order by received_at, id`;
  return {
    state: 'open', id, band: row.band, nsi: row.nsi, conf: row.conf, reasons: row.reasons ?? [], dvKmh: row.dv,
    last: latestCrew(crew.map((c) => c.crew)), expiresAt: check.expiresAt,
  };
}

/**
 * Store the update, re-assess, then tell the hospitals already pre-alerted (one SMS each, when they have a number;
 * their web view re-reads the latest assessment on its own). The dispatcher sees it live: incident row + audit.
 */
export async function submitCrew(id: string, vitals: CrewVitals, ip: string, now = new Date()): Promise<CrewAck | null> {
  const ack = await crewUpdate({ incidentId: id, vitals, receivedAt: now, senderHash: senderHash(`ip:${ip}`) }, postgresStore());
  if (!ack) return null;
  const sql = getSql();
  const [inc] = await sql<{ band: 'R' | 'O' | 'Y' | 'G' | 'U'; nsi: number }[]>`select band, nsi from public.incidents where id = ${id}`;
  const hospitals = await sql<{ hospital_id: string; phone_sms: string | null }[]>`
    select distinct p.hospital_id, h.phone_sms from public.prealerts p join public.hospitals h on h.id = p.hospital_id
    where p.incident_id = ${id}`;
  const body = crewUpdateSms({ id, band: inc!.band, nsi: inc!.nsi, vitals });
  const texted = hospitals.filter((h) => h.phone_sms);
  for (const h of texted) {
    await sql`insert into public.sms_outbox (to_number, body, purpose, incident_id) values (${h.phone_sms}, ${body}, 'crew_update', ${id})`;
  }
  if (texted.length) void deliverOutbox().catch(() => undefined); // status stays visible in sms_outbox
  return ack;
}

/** Link + QR for the drawer and /phones. `origin` must be reachable from the crew's phone (LAN IP, tunnel). */
export async function crewLink(id: string, origin: string): Promise<{ url: string; svg: string; expiresAt: string }> {
  const now = Date.now();
  const url = `${origin.replace(/\/$/, '')}/crew/${id}?k=${crewToken(id, now)}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { url, svg, expiresAt: new Date(crewExpiry(now)).toISOString() };
}
