import type { NextRequest } from 'next/server';
import { IncidentId } from '@sellekni/api-contract';
import { requireRole } from '@/server/auth';
import { fail, json } from '@/server/http';
import { recommend } from '@/server/services/recommendations';

/** Top-3 + nearestEd, every ETA with its provider (osrm | ors | haversine = "estimated"). The dispatcher picks. */
export async function GET(req: NextRequest, ctx: RouteContext<'/api/incidents/[id]/recommendations'>) {
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  if (!IncidentId.safeParse(id).success) return fail(400, 'bad incident id');
  const rec = await recommend(id);
  if (!rec) return fail(404, 'incident not found');
  const { all: _all, ...view } = rec;
  return json(view);
}
