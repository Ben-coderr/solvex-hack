import type { NextRequest } from 'next/server';
import { IncidentId } from '@sellekni/api-contract';
import { requireRole } from '@/server/auth';
import { env } from '@/server/env';
import { fail, json, limited } from '@/server/http';
import { LIMITS } from '@/server/services/rate-limit';
import { witnessLink } from '@/server/services/witness';

/** Witness link + QR (SVG) for the drawer. PUBLIC_BASE_URL (LAN IP / tunnel) when the phones cannot reach this host. */
export async function GET(req: NextRequest, ctx: RouteContext<'/api/incidents/[id]/witness-link'>) {
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const slow = limited(`dispatch:${auth.actor.userId}`, LIMITS.dispatcher);
  if (slow) return slow;
  const { id } = await ctx.params;
  if (!IncidentId.safeParse(id).success) return fail(400, 'bad incident id');
  return json(await witnessLink(id, env().PUBLIC_BASE_URL || req.nextUrl.origin));
}
