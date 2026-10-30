// P3 screenshot matrix: dashboard (detail open), hospital view, audit × 360/768/1440 × light/dark × en/ar.
// Run after the hero flow has left data in the DB:  pnpm --filter web test:e2e && pnpm --filter web screens:p3
// Uses the installed Chrome (no browser download). Output: docs/pitch/design/p3/*.jpg (JPEG to keep the repo small).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';
import { chromium, type Browser } from 'playwright';

const root = path.resolve(import.meta.dirname, '../../..');
nextEnv.loadEnvConfig(root, true, undefined, true);
const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const OUT = path.join(root, 'docs/pitch/design/p3');
const PASSWORD = process.env.DEMO_USER_PASSWORD!;
const incident = process.argv[2]; // incident id to open in the drawer
if (!incident) throw new Error('usage: tsx scripts/p3-screens.mts <INCIDENT_ID>');

const WIDTHS = [360, 768, 1440] as const;
const THEMES = ['dark', 'light'] as const;
const LOCALES = ['en', 'ar'] as const;

async function session(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const roles = { dispatcher: await session(browser, 'dispatcher@sellekni.test'), hospital: await session(browser, 'hospital-a@sellekni.test') };
const pages = [
  { name: 'dashboard', role: 'dispatcher', path: `/?i=${incident}`, ready: '[data-testid="orientation"]' },
  { name: 'audit', role: 'dispatcher', path: `/audit?incident=${incident}`, ready: '[data-testid="audit-table"]' },
  { name: 'hospital', role: 'hospital', path: '/hospital/CHU-A', ready: `[data-testid="incoming-${incident}"]` },
] as const;

const problems: string[] = [];
for (const p of pages) {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      for (const locale of LOCALES) {
        const ctx = await browser.newContext({ storageState: roles[p.role], viewport: { width, height: width === 360 ? 780 : width === 768 ? 1024 : 900 } });
        await ctx.addCookies([
          { name: 'NEXT_LOCALE', value: locale, url: BASE },
          { name: 'sellekni-theme', value: theme, url: BASE },
        ]);
        const page = await ctx.newPage();
        page.on('pageerror', (e) => problems.push(`${p.name} ${width} ${theme} ${locale}: ${e.message}`));
        await page.goto(`${BASE}${p.path}`);
        await page.locator(p.ready).first().waitFor({ timeout: 20_000 });
        await page.waitForTimeout(1500); // map tiles / fonts settle
        // horizontal overflow of the page = a layout break (inner scrollers are allowed)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 1) problems.push(`${p.name} ${width} ${theme} ${locale}: page overflows by ${overflow}px`);
        await page.screenshot({ path: path.join(OUT, `${p.name}-${width}-${theme}-${locale}.jpg`), type: 'jpeg', quality: 70 });
        await ctx.close();
      }
    }
  }
}
await browser.close();
console.log(`screens → ${path.relative(root, OUT)}`);
console.log(problems.length ? problems.join('\n') : 'no page errors, no horizontal overflow');
