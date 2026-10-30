import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { env } from '@/server/env';
import { clientIp, fail, json, limited, parseJson, readRaw } from '@/server/http';
import { ACTIONS, demoAction, DemoConflict, replay, SCENARIOS } from '@/server/services/demo';
import { LIMITS } from '@/server/services/rate-limit';

const Body = z.union([z.object({ scenario: z.enum(SCENARIOS) }).strict(), z.object({ action: z.enum(ACTIONS) }).strict()]);

/**
 * "Simulate SMS": a scenario packet through the real ingest path, channel `sim` (labelled DEMO in the UI).
 * `action`: a witness report (the /w path) or an exact re-delivery, both on the newest open incident.
 */
export async function POST(req: NextRequest) {
  if (!env().DEMO_MODE) return fail(404, 'not found');
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const slow = limited(`dispatch:${auth.actor.userId}`, LIMITS.dispatcher);
  if (slow) return slow;
  const raw = await readRaw(req);
  if (!raw.ok) return raw.res;
  const body = parseJson(raw.raw, Body);
  if (!body.ok) return body.res;
  if ('scenario' in body.data) return json(await replay(body.data.scenario), 201);
  try {
    return json(await demoAction(body.data.action, clientIp(req)), 201);
  } catch (e) {
    if (e instanceof DemoConflict) return fail(409, e.message);
    throw e;
  }
}
