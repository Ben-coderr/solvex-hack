import type { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { fail, json } from '@/server/http';
import { listIncoming } from '@/server/services/prealert';
import { loadStatuses } from '@/server/services/recommendations';

/** Incoming patients + current load status for one facility (hospital: own facility only). */
export async function GET(req: NextRequest, ctx: RouteContext<'/api/hospitals/[id]/prealerts'>) {
  const auth = await requireRole(req, ['hospital', 'dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  if (auth.actor.role === 'hospital' && auth.actor.hospitalId !== id) return fail(403, 'not your facility');
  const [incoming, statuses] = await Promise.all([listIncoming(id), loadStatuses()]);
  return json({ incoming, status: statuses[id] ?? null });
}
