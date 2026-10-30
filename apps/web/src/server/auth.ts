import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';
import { sql as getSql } from './db';
import { env } from './env';
import { fail } from './http';

export type Role = 'dispatcher' | 'hospital' | 'admin';
export interface Actor { userId: string; role: Role; hospitalId: string | null; label: string }

/**
 * Signed-in staff member from a Supabase session: `Authorization: Bearer <access token>` (scripts, curl)
 * or the session cookies set by the login page (browser). The token is verified by Supabase Auth, then the
 * role comes from public.profiles. No profile = no access.
 */
export async function getActor(req: NextRequest): Promise<Actor | null> {
  const e = env();
  const supabase = createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => req.cookies.getAll() },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const { data, error } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (error || !data.user) return null;
  const [p] = await getSql()<{ role: Role; hospital_id: string | null; display_name: string | null }[]>`
    select role, hospital_id, display_name from public.profiles where user_id = ${data.user.id}`;
  if (!p) return null;
  return { userId: data.user.id, role: p.role, hospitalId: p.hospital_id, label: `${p.role}:${p.display_name ?? data.user.email ?? data.user.id}` };
}

export async function requireRole(req: NextRequest, roles: readonly Role[]) {
  const actor = await getActor(req);
  if (!actor) return { ok: false as const, res: fail(401, 'sign in required') };
  if (!roles.includes(actor.role)) return { ok: false as const, res: fail(403, 'not allowed for this role') };
  return { ok: true as const, actor };
}
