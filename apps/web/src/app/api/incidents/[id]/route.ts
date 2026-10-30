import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { IncidentId } from '@najda/api-contract';
import { requireRole } from '@/server/auth';
import { STATUSES } from '@/server/domain/lifecycle';
import { fail, json, limited, parseJson, readRaw } from '@/server/http';
import { getIncidentDetail } from '@/server/services/incidents';
import { applyPatch } from '@/server/services/lifecycle';
import { LIMITS } from '@/server/services/rate-limit';

const Band = z.enum(['R', 'O', 'Y', 'G', 'U']);
const Reason = z.string().trim().max(500);
const Patch = z.discriminatedUnion('action', [
  z.object({ action: z.literal('transition'), to: z.enum(STATUSES as [string, ...string[]]).refine((s) => s !== 'MERGED', 'MERGED is set by a merge, not by PATCH'), reason: Reason.optional() }),
  z.object({ action: z.literal('override_band'), band: Band.nullable(), reason: Reason }),
  z.object({ action: z.literal('set_hospital'), hospital_id: z.string().min(1).max(32), reason: Reason.optional() }),
  z.object({ action: z.literal('assign_unit'), unit: z.string().trim().min(1).max(40), reason: Reason.optional() }),
]);

export async function GET(req: NextRequest, ctx: RouteContext<'/api/incidents/[id]'>) {
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const { id } = await ctx.params;
  if (!IncidentId.safeParse(id).success) return fail(400, 'bad incident id');
  const detail = await getIncidentDetail(id);
  return detail ? json(detail) : fail(404, 'incident not found');
}

/** Transition / override / assignment — always a human action, audited with actor and reason. */
export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/incidents/[id]'>) {
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const slow = limited(`dispatch:${auth.actor.userId}`, LIMITS.dispatcher);
  if (slow) return slow;
  const { id } = await ctx.params;
  if (!IncidentId.safeParse(id).success) return fail(400, 'bad incident id');
  const raw = await readRaw(req);
  if (!raw.ok) return raw.res;
  const body = parseJson(raw.raw, Patch);
  if (!body.ok) return body.res;
  const r = await applyPatch(id, body.data as Parameters<typeof applyPatch>[1], auth.actor.label);
  return r.ok ? json(r.incident) : fail(r.status, r.error);
}
