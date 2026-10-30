import type { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { env } from '@/server/env';
import { fail, json, limited } from '@/server/http';
import { demoPhones } from '@/server/services/demo';
import { LIMITS } from '@/server/services/rate-limit';

/** /phones and /demo feed (polled every 2 s): newest open incident, its witness link, the SMS the phones would show. */
export async function GET(req: NextRequest) {
  if (!env().DEMO_MODE) return fail(404, 'not found');
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const slow = limited(`dispatch:${auth.actor.userId}`, LIMITS.dispatcher);
  if (slow) return slow;
  return json(await demoPhones(env().PUBLIC_BASE_URL || req.nextUrl.origin));
}
