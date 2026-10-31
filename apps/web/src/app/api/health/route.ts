import { healthBody } from '@/server/health';
import { json } from '@/server/http';

// Connectivity probe for the phones and the status strip: no DB hit, never cached.
export const dynamic = 'force-dynamic';

export function GET() {
  return json(healthBody(), 200, { 'Cache-Control': 'no-store' });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
