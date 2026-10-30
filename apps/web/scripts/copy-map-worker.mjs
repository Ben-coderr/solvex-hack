// MapLibre v6 resolves its web worker relative to its own bundle URL, which Turbopack does not emit.
// Serve the (self-contained) worker from /public instead; incident-map.tsx calls setWorkerUrl() with this path.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const src = path.join(path.dirname(require.resolve('maplibre-gl/package.json')), 'dist', 'maplibre-gl-worker.mjs');
const dest = path.resolve(import.meta.dirname, '../public/maplibre-gl-worker.mjs');
mkdirSync(path.dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log('maplibre worker →', path.relative(process.cwd(), dest));
