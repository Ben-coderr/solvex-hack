import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { fail, json, parseJson, readRaw } from '@/server/http';
import { setHospitalStatus } from '@/server/services/hospitals';

const Body = z.object({ status: z.enum(['OK', 'BUSY', 'SATURATED']) }).strict();

/** OK / BUSY / SATURATED, decays to UNKNOWN after 6 h. A hospital user may only set its own facility. */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/hospitals/[id]/status'>) {
  const auth = await requireRole(req, ['dispatcher', 'admin', 'hospital']);
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  if (auth.actor.role === 'hospital' && auth.actor.hospitalId !== id) return fail(403, 'not your facility');
  const raw = await readRaw(req);
  if (!raw.ok) return raw.res;
  const body = parseJson(raw.raw, Body);
  if (!body.ok) return body.res;
  return (await setHospitalStatus(id, body.data.status, auth.actor.label))
    ? json({ hospital_id: id, status: body.data.status }, 201)
    : fail(404, 'unknown hospital');
}
