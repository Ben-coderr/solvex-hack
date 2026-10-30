import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { fail, json, limited } from '@/server/http';
import { LIMITS } from '@/server/services/rate-limit';
import { ackPrealert } from '@/server/services/prealert';

/** Hospital ACK (a hospital user may only acknowledge its own facility's pre-alerts). */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/prealerts/[id]/ack'>) {
  const auth = await requireRole(req, ['hospital', 'admin']);
  if (!auth.ok) return auth.res;
  const slow = limited(`staff:${auth.actor.userId}`, LIMITS.dispatcher);
  if (slow) return slow;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail(400, 'bad pre-alert id');
  const r = await ackPrealert(id, auth.actor.label, auth.actor.role === 'hospital' ? auth.actor.hospitalId : null);
  return r.ok ? json(r) : fail(r.status, r.error);
}
