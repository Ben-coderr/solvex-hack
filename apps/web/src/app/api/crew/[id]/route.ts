import { NextResponse, type NextRequest } from 'next/server';
import { IncidentId } from '@sellekni/api-contract';
import { CrewForm, formToObject } from '@/server/domain';
import { clientIp, fail, json, limited, readRaw } from '@/server/http';
import { crewView, submitCrew } from '@/server/services/crew';
import { LIMITS } from '@/server/services/rate-limit';
import { senderHash } from '@/server/services/sender';

/** Back to the page with a relative Location (old browsers follow it; no host guessing behind a LAN IP or tunnel). */
const back = (id: string, k: string, q: string) =>
  new NextResponse(null, { status: 303, headers: { Location: `/crew/${id}?k=${encodeURIComponent(k)}&${q}` } });

/**
 * D9 crew update. Signed, expiring token `k`; rate-limited per IP hash and per incident. Accepts the plain HTML form
 * (urlencoded, no JS: 303 back to the page) or JSON (answers JSON with the new assessment).
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/crew/[id]'>) {
  const { id } = await ctx.params;
  const k = req.nextUrl.searchParams.get('k') ?? '';
  const isForm = (req.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded');
  const reply = (status: number, code: string) => (isForm ? back(id, k, `error=${code}`) : fail(status, code));

  const ip = clientIp(req);
  if (limited(`crew-ip:${senderHash(`ip:${ip}`)}`, LIMITS.crewPerIp)) return reply(429, 'rate_limited');
  if (!IncidentId.safeParse(id).success) return fail(404, 'not found');
  const view = await crewView(id, k);
  if (view.state === 'invalid') return fail(404, 'not found'); // same answer as a missing incident
  if (view.state === 'expired') return reply(410, 'expired');
  if (view.state === 'closed') return reply(409, 'closed');
  if (limited(`crew-incident:${id}`, LIMITS.crewPerIncident)) return reply(429, 'rate_limited');

  const raw = await readRaw(req);
  if (!raw.ok) return raw.res;
  let body: unknown;
  try {
    body = isForm ? formToObject(new URLSearchParams(raw.raw)) : JSON.parse(raw.raw);
  } catch {
    return reply(400, 'invalid');
  }
  const form = CrewForm.safeParse(body);
  if (!form.success) return reply(422, form.error.issues.some((i) => i.path[0] === 'empty') ? 'empty' : 'invalid');

  const ack = await submitCrew(id, form.data, ip);
  if (!ack) return reply(409, 'closed');
  return isForm ? back(id, k, `sent=1&from=${ack.before.band}`) : json(ack, 201);
}
