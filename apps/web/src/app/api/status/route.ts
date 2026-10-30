import type { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { json } from '@/server/http';
import { systemStatus } from '@/server/services/status';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['dispatcher', 'admin', 'hospital']);
  if (!auth.ok) return auth.res;
  return json(await systemStatus(), 200, { 'Cache-Control': 'no-store' });
}
