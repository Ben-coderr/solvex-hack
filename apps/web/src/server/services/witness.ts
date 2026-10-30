import 'server-only';
import QRCode from 'qrcode';
import type { IngestAck } from '@najda/api-contract';
import { sql as getSql } from '../db';
import { coarse, linkToken, verifyLinkToken, witnessJson, type WitnessForm } from '../domain';
import { env } from '../env';
import { ingest } from './ingest';
import { senderHash } from './sender';
import { postgresStore } from './store-postgres';

const CLOSED = ['CLOSED', 'CANCELLED', 'MERGED'];

/** What the public witness page may know: open or not, and a ~100 m position. No band, no victim data, no reports. */
export type WitnessView =
  | { state: 'open'; lat: number; lon: number }
  | { state: 'closed' }
  | { state: 'invalid' };

export const witnessToken = (id: string) => linkToken('witness', id, env().LINK_SIGNING_SECRET);

export async function witnessView(id: string, k: string | null | undefined): Promise<WitnessView> {
  if (!/^[0-9A-HJKMNP-TV-Z]{5}$/.test(id) || !verifyLinkToken('witness', id, k, env().LINK_SIGNING_SECRET)) {
    return { state: 'invalid' };
  }
  const [row] = await getSql()<{ status: string; lat: number; lon: number }[]>`
    select status, extensions.st_y(location::extensions.geometry) as lat, extensions.st_x(location::extensions.geometry) as lon
    from public.incidents where id = ${id}`;
  // A valid token for a vanished incident (demo reset): same answer as closed, nothing to leak.
  if (!row || CLOSED.includes(row.status)) return { state: 'closed' };
  return { state: 'open', lat: coarse(row.lat), lon: coarse(row.lon) };
}

/**
 * The witness report: same JSON contract and ingest path as the app (channel `witness`, source W),
 * pinned to the linked incident. The exact position is read here, server-side, never sent to the page.
 */
export async function submitWitness(id: string, form: WitnessForm, ip: string, now = new Date()): Promise<IngestAck | null> {
  const [row] = await getSql()<{ lat: number; lon: number }[]>`
    select extensions.st_y(location::extensions.geometry) as lat, extensions.st_x(location::extensions.geometry) as lon
    from public.incidents where id = ${id}`;
  if (!row) return null;
  return ingest(
    { kind: 'json', channel: 'witness', body: witnessJson(form, row, now), receivedAt: now, senderHash: senderHash(`ip:${ip}`), target: id },
    postgresStore(),
  );
}

/** Link + QR for the incident drawer and /demo. `origin` must be reachable from the witness's phone (LAN IP, tunnel). */
export async function witnessLink(id: string, origin: string): Promise<{ url: string; svg: string }> {
  const url = `${origin.replace(/\/$/, '')}/w/${id}?k=${witnessToken(id)}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return { url, svg };
}
