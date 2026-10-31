import type { NextRequest } from 'next/server';
import { IncidentId } from '@sellekni/api-contract';
import { requireRole } from '@/server/auth';
import { env } from '@/server/env';
import { fail, json, limited } from '@/server/http';
import { crewLink } from '@/server/services/crew';
import { LIMITS } from '@/server/services/rate-limit';

/** Crew link + QR for the drawer (D9): a fresh 12 h token on each call. PUBLIC_BASE_URL when phones cannot reach this host. */
export async function GET(req: NextRequest, ctx: RouteContext<'/api/incidents/[id]/crew-link'>) {
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const slow = limited(`dispatch:${auth.actor.userId}`, LIMITS.dispatcher);
  if (slow) return slow;
  const { id } = await ctx.params;
  if (!IncidentId.safeParse(id).success) return fail(400, 'bad incident id');
  return json(await crewLink(id, env().PUBLIC_BASE_URL || req.nextUrl.origin));
}
