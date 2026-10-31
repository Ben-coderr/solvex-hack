import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { defineConfig } from '@playwright/test';

// Demo logins and DEMO_MODE live in the repo-root .env.local (same file the app reads).
loadEnvConfig(path.resolve(__dirname, '../..'), true, undefined, true);

/** E2E against a running app (local Supabase + `pnpm dev:web`). BASE_URL defaults to the dev port used on this laptop. */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1, // one shared database: the hero flow resets it
  retries: 0, // a flaky test is a bug to fix (wait on UI state), not to retry
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3001',
    channel: 'chrome', // the installed Chrome: no browser download
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
