import type { NextRequest } from 'next/server';
import { IncidentId } from '@najda/api-contract';
import { requireRole } from '@/server/auth';
import { fail, json } from '@/server/http';
import { listAudit } from '@/server/services/audit';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const incident = req.nextUrl.searchParams.get('incident');
  if (incident && !IncidentId.safeParse(incident).success) return fail(400, 'bad incident id');
  return json({ events: await listAudit(incident) });
}
