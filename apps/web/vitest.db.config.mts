import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';

// Integration tests against the LOCAL Supabase database (truncates incident tables). Run: pnpm --filter web test:db
// .env.local is parsed directly: Next's loader deliberately skips .env.local when NODE_ENV=test (vitest's default).
// Paths use process.cwd() (= apps/web): the config is bundled to a temp dir, so import.meta.dirname is not this folder.
const env = parseEnv(readFileSync(path.resolve(process.cwd(), '../../.env.local'), 'utf8')) as Record<string, string>;

export default defineConfig({
  resolve: { alias: { 'server-only': path.resolve(process.cwd(), 'src/test/server-only.ts') } },
  test: {
    environment: 'node',
    include: ['src/**/*.db.test.ts'],
    fileParallelism: false,
    env,
  },
});
