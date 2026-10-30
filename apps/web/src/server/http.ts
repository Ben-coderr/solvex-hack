import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';
import { RateLimiter, type Limit } from './services/rate-limit';

export const MAX_BODY_BYTES = 16 * 1024;

export const json = <T,>(body: T, status = 200, headers?: HeadersInit) => NextResponse.json(body, { status, headers });
export const fail = (status: number, error: string, details?: unknown) =>
  NextResponse.json(details === undefined ? { error } : { error, details }, { status });

/** Best-effort client address (behind the laptop's LAN or a tunnel). Used only for hashing/rate limiting. */
export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}

/** Raw body with a hard size cap (the webhook signature is computed over these exact bytes). */
export async function readRaw(req: NextRequest): Promise<{ ok: true; raw: string } | { ok: false; res: NextResponse }> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BODY_BYTES) return { ok: false, res: fail(413, 'body too large') };
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return { ok: false, res: fail(413, 'body too large') };
  return { ok: true, raw };
}

export function parseJson<S extends z.ZodType>(raw: string, schema: S):
  { ok: true; data: z.infer<S> } | { ok: false; res: NextResponse } {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, res: fail(400, 'invalid JSON') };
  }
  const r = schema.safeParse(body);
  if (!r.success) {
    return { ok: false, res: fail(422, 'validation failed', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))) };
  }
  return { ok: true, data: r.data };
}

const limiter = new RateLimiter();

export function limited(key: string, limit: Limit): NextResponse | null {
  const r = limiter.check(key, limit);
  return r.ok ? null : fail(429, 'rate limited', { retry_after_s: r.retryAfterS });
}

/** Constant-time string comparison for shared secrets. */
export function sameSecret(a: string | null, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
