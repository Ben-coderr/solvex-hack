import { existsSync } from 'node:fs';
import path from 'node:path';
import { json } from '@/server/http';

// Connectivity probe for the phones and the status strip: no DB hit, never cached.
export const dynamic = 'force-dynamic';

const body = () => ({
  ok: true as const,
  time: new Date().toISOString(),
  version: process.env.npm_package_version ?? '0.1.0',
  demo: process.env.DEMO_MODE === 'true',
  /** the offline basemap (public/tiles/sellekni.pmtiles) is installed: the map needs no internet */
  offlineTiles: existsSync(path.join(process.cwd(), 'public/tiles/sellekni.pmtiles')),
});

export function GET() {
  return json(body(), 200, { 'Cache-Control': 'no-store' });
}

export function HEAD() {
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
