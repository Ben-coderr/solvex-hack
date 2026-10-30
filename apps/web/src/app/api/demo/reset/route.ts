import type { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { env } from '@/server/env';
import { fail, json } from '@/server/http';
import { resetDemo } from '@/server/services/demo';

export async function POST(req: NextRequest) {
  if (!env().DEMO_MODE) return fail(404, 'not found');
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  return json({ reset: true, ...(await resetDemo(auth.actor.label)) });
}
