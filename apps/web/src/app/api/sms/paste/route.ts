import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { json, limited, parseJson, readRaw } from '@/server/http';
import { ingest } from '@/server/services/ingest';
import { LIMITS } from '@/server/services/rate-limit';
import { postgresStore } from '@/server/services/store-postgres';

const Body = z.object({ text: z.string().min(1).max(1000) }).strict();

/** D6 "Paste SMS": a dispatcher pastes a received text → the same ingest path (channel `paste`). Never dropped. */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const slow = limited(`dispatch:${auth.actor.userId}`, LIMITS.dispatcher);
  if (slow) return slow;
  const raw = await readRaw(req);
  if (!raw.ok) return raw.res;
  const body = parseJson(raw.raw, Body);
  if (!body.ok) return body.res;
  const ack = await ingest({ kind: 'text', channel: 'paste', text: body.data.text, receivedAt: new Date(), senderHash: null, replyTo: null }, postgresStore());
  return json(ack, ack.outcome === 'duplicate' ? 200 : 201);
}
