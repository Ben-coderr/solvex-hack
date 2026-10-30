import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { IncidentId } from '@najda/api-contract';
import { requireRole } from '@/server/auth';
import { fail, json, limited, parseJson, readRaw } from '@/server/http';
import { createPrealert } from '@/server/services/prealert';
import { LIMITS } from '@/server/services/rate-limit';

const Body = z.object({ hospital_id: z.string().min(1).max(32) }).strict();

export async function POST(req: NextRequest, ctx: RouteContext<'/api/incidents/[id]/prealert'>) {
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const slow = limited(`dispatch:${auth.actor.userId}`, LIMITS.dispatcher);
  if (slow) return slow;
  const { id } = await ctx.params;
  if (!IncidentId.safeParse(id).success) return fail(400, 'bad incident id');
  const raw = await readRaw(req);
  if (!raw.ok) return raw.res;
  const body = parseJson(raw.raw, Body);
  if (!body.ok) return body.res;
  const r = await createPrealert(id, body.data.hospital_id, auth.actor.label);
  return r.ok ? json(r, 201) : fail(r.status, r.error);
}
