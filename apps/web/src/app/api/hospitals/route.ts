import type { NextRequest } from 'next/server';
import { requireRole } from '@/server/auth';
import { json } from '@/server/http';
import { env } from '@/server/env';
import { loadHospitals } from '@/server/services/recommendations';

/** The active hospital set (HOSPITAL_SET) as map points. No phone numbers: the map does not need them. */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['dispatcher', 'admin']);
  if (!auth.ok) return auth.res;
  const hospitals = (await loadHospitals()).map(({ id, name, level, lat, lon }) => ({ id, name, level, lat, lon }));
  return json({ set: env().HOSPITAL_SET, hospitals });
}
