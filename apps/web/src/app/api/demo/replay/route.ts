import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/server/auth';
import { env } from '@/server/env';
import { fail, json, parseJson, readRaw } from '@/server/http';
import { replay, SCENARIOS } from '@/server/services/demo';

const Body = z.object({ scenario: z.enum(SCENARIOS) }).strict();

/** "Simulate SMS": a scenario packet through the real ingest path, channel `sim` (labelled DEMO in the UI). */
export async function POST(req: NextRequest) {
  if (!env().DEMO_MODE) return fail(404, 'not found');
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const raw = await readRaw(req);
  if (!raw.ok) return raw.res;
  const body = parseJson(raw.raw, Body);
  if (!body.ok) return body.res;
  return json(await replay(body.data.scenario), 201);
}
