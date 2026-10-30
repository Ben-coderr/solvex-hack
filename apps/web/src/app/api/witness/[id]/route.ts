import { NextResponse, type NextRequest } from 'next/server';
import { IncidentId } from '@najda/api-contract';
import { formToObject, WitnessForm } from '@/server/domain';
import { clientIp, fail, json, limited, readRaw } from '@/server/http';
import { LIMITS } from '@/server/services/rate-limit';
import { senderHash } from '@/server/services/sender';
import { submitWitness, witnessView } from '@/server/services/witness';

/** Back to the page with a relative Location (old browsers follow it; no host guessing behind a LAN IP or tunnel). */
const back = (id: string, k: string, q: string) =>
  new NextResponse(null, { status: 303, headers: { Location: `/w/${id}?k=${encodeURIComponent(k)}&${q}` } });

/**
 * D10 witness report. Token `k` required; rate-limited per IP hash and per incident. Accepts the plain HTML form
 * (urlencoded, no JS: answers 303 back to the page) or JSON (answers JSON).
 */
export async function POST(req: NextRequest, ctx: RouteContext<'/api/witness/[id]'>) {
  const { id } = await ctx.params;
  const k = req.nextUrl.searchParams.get('k') ?? '';
  const isForm = (req.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded');
  const reply = (status: number, code: string) => (isForm ? back(id, k, `error=${code}`) : fail(status, code));

  const ip = clientIp(req);
  if (limited(`witness-ip:${senderHash(`ip:${ip}`)}`, LIMITS.witnessPerIp)) return reply(429, 'rate_limited');
  if (!IncidentId.safeParse(id).success) return fail(404, 'not found');
  const view = await witnessView(id, k);
  if (view.state === 'invalid') return fail(404, 'not found'); // same answer as a missing incident
  if (view.state === 'closed') return reply(409, 'closed');
  if (limited(`witness-incident:${id}`, LIMITS.witnessPerIncident)) return reply(429, 'rate_limited');

  const raw = await readRaw(req);
  if (!raw.ok) return raw.res;
  let body: unknown;
  try {
    body = isForm ? formToObject(new URLSearchParams(raw.raw)) : JSON.parse(raw.raw);
  } catch {
    return reply(400, 'invalid');
  }
  const form = WitnessForm.safeParse(body);
  if (!form.success) return reply(422, form.error.issues.some((i) => i.path[0] === 'here') ? 'confirm_place' : 'invalid');

  const ack = await submitWitness(id, form.data, ip);
  if (!ack) return reply(409, 'closed');
  return isForm ? back(id, k, 'sent=1') : json({ outcome: ack.outcome, merged_count: ack.merged_count }, 201);
}
