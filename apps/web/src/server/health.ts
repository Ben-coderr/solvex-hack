import 'server-only';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** What /api/health answers. Also rendered into the staff pages, so the first paint already knows demo + tiles. */
export const healthBody = () => ({
  ok: true as const,
  time: new Date().toISOString(),
  version: process.env.npm_package_version ?? '0.1.0',
  demo: process.env.DEMO_MODE === 'true',
  /** the offline basemap (public/tiles/sellekni.pmtiles) is installed: the map needs no internet */
  offlineTiles: existsSync(path.join(process.cwd(), 'public/tiles/sellekni.pmtiles')),
});
export type Health = ReturnType<typeof healthBody>;
