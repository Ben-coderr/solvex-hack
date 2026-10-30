import type { NextRequest } from 'next/server';
import { IncidentJson } from '@sellekni/api-contract';
import { requireRole } from '@/server/auth';
import { env } from '@/server/env';
import { clientIp, fail, json, limited, parseJson, readRaw, sameSecret } from '@/server/http';
import { listIncidents, listUnparsed } from '@/server/services/incidents';
import { ingest } from '@/server/services/ingest';
import { LIMITS } from '@/server/services/rate-limit';
import { senderHash } from '@/server/services/sender';
import { postgresStore } from '@/server/services/store-postgres';

/** JSON channel from the app (docs/05 §2). Idempotent on the packet id + body. */
export async function POST(req: NextRequest) {
  // TRANSITION (24h-H5): APKs built before the rename send `x-najda-key`. Drop it once the new APK is verified on the phone.
  const key = req.headers.get('x-sellekni-key') ?? req.headers.get('x-najda-key');
  if (!sameSecret(key, env().INGEST_API_KEY)) return fail(401, 'missing or bad x-sellekni-key');
  const ip = clientIp(req);
  const slow = limited(`incidents:${ip}`, LIMITS.incidentsJson);
  if (slow) return slow;

  const raw = await readRaw(req);
  if (!raw.ok) return raw.res;
  const body = parseJson(raw.raw, IncidentJson);
  if (!body.ok) return body.res;

  const ack = await ingest(
    { kind: 'json', channel: 'https', body: body.data, receivedAt: new Date(), senderHash: senderHash(`ip:${ip}`) },
    postgresStore(),
  );
  return json(ack, ack.outcome === 'duplicate' ? 200 : 201);
}

/** Dispatcher queue: open incidents (band, then age) + the latest unparsed messages, shown raw. */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const slow = limited(`dispatch:${auth.actor.userId}`, LIMITS.dispatcher);
  if (slow) return slow;
  const status = req.nextUrl.searchParams.get('status') === 'all' ? 'all' : 'open';
  const [incidents, unparsed] = await Promise.all([listIncidents(status), listUnparsed()]);
  return json({ incidents, unparsed });
}
