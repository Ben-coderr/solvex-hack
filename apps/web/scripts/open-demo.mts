// Open the demo already signed in: one Chrome window for the dispatcher, one for hospital CHU-A (separate
// sessions, like two people). Uses the real login form, so it also proves the accounts work.
//   ./najda open                 (or: BASE_URL=http://localhost:3000 pnpm --filter web exec tsx scripts/open-demo.mts)
//   ./najda open --reset         empty the demo database first
//   ./najda open --locale=ar     ar | fr | en
//   ./najda reset                (= --reset-only: no windows)
import path from 'node:path';
import nextEnv from '@next/env';
import { chromium, type Browser } from 'playwright';

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, '../../..'), true, undefined, true);
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.DEMO_USER_PASSWORD;
const args = process.argv.slice(2);
const resetOnly = args.includes('--reset-only');
const reset = resetOnly || args.includes('--reset');
const locale = args.find((a) => a.startsWith('--locale='))?.split('=')[1] ?? 'en';
if (!PASSWORD) throw new Error('DEMO_USER_PASSWORD is empty in .env.local: run ./najda up');

async function signedIn(browser: Browser, email: string, landing: RegExp, size: { width: number; height: number }, position: string) {
  const ctx = await browser.newContext({ viewport: null });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
  const page = await ctx.newPage();
  // place the window (Chrome DevTools Protocol): dispatcher left, hospital right
  const cdp = await ctx.newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  const [left, top] = position.split(',').map(Number);
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left, top, ...size } });
  await page.goto(`${BASE}/login`);
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(PASSWORD!);
  await page.locator('button[type=submit]').click();
  // the login page goes to /, which redirects a hospital account to its own view: wait for the final page
  await page.waitForURL((u) => landing.test(u.pathname), { timeout: 60_000 });
  console.log(`  ✓ ${email} → ${page.url()}`);
  return { ctx, page };
}

const browser = await chromium.launch({ channel: 'chrome', headless: resetOnly, args: ['--no-first-run', '--no-default-browser-check'] });
const dispatcher = await signedIn(browser, 'dispatcher@najda.test', /^\/$/, { width: 1366, height: 860 }, '0,0');

if (reset) {
  const r = await dispatcher.page.request.post(`${BASE}/api/demo/reset`);
  console.log(r.ok() ? '  ✓ demo database reset' : `  ✗ reset failed: HTTP ${r.status()} (is DEMO_MODE=true?)`);
  if (resetOnly) {
    await browser.close();
    process.exit(r.ok() ? 0 : 1);
  }
  await dispatcher.page.reload();
}

const hospital = await signedIn(browser, 'hospital-a@najda.test', /^\/hospital\//, { width: 900, height: 860 }, '1366,0');
console.log(`
  Try the hero flow (≈ 90 s):
   1. Dispatcher: Simulate SMS → "Rollover, no response" → Send → Esc
   2. Click the red ▲ pin → read the reasons → Acknowledged
   3. Orientation: Pre-alert on CHU-A (#1)
   4. Hospital window: Acknowledge
   5. Dispatcher: ✓ Acknowledged appears → Audit log shows every step
  Close both windows (or Ctrl+C) to quit.`);

// stay open until the person closes both windows
await Promise.all([dispatcher.page, hospital.page].map((p) => p.waitForEvent('close', { timeout: 0 }).catch(() => undefined)));
await browser.close().catch(() => undefined);
