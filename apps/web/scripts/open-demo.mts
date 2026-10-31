// Open the demo already signed in: one Chrome window for the dispatcher, one for hospital A (separate
// sessions, like two people), and a stage window (dispatcher session) with /demo and /phones in two tabs.
// Uses the real login form, so it also proves the accounts work.
//   ./sellekni open                 (or: BASE_URL=http://localhost:3000 pnpm --filter web exec tsx scripts/open-demo.mts)
//   ./sellekni open --reset         empty the demo database first
//   ./sellekni open --locale=ar     ar | fr | en
//   ./sellekni open --no-stage      only the dispatcher and hospital windows
//   ./sellekni reset                (= --reset-only: no windows)
import path from 'node:path';
import nextEnv from '@next/env';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname, '../../..'), true, undefined, true);
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.DEMO_USER_PASSWORD;
const args = process.argv.slice(2);
const resetOnly = args.includes('--reset-only');
const reset = resetOnly || args.includes('--reset');
const stage = !args.includes('--no-stage');
const locale = args.find((a) => a.startsWith('--locale='))?.split('=')[1] ?? 'en';
if (!PASSWORD) throw new Error('DEMO_USER_PASSWORD is empty in .env.local: run ./sellekni up');

type Size = { width: number; height: number };

/** Place a page's window (Chrome DevTools Protocol): dispatcher left, hospital right, stage window on top. */
async function place(ctx: BrowserContext, page: Page, size: Size, position: string) {
  const cdp = await ctx.newCDPSession(page);
  const { windowId } = await cdp.send('Browser.getWindowForTarget');
  const [left, top] = position.split(',').map(Number);
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left, top, ...size } });
}

async function signedIn(browser: Browser, email: string, landing: RegExp, size: Size, position: string) {
  const ctx = await browser.newContext({ viewport: null });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
  const page = await ctx.newPage();
  await place(ctx, page, size, position);
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
const dispatcher = await signedIn(browser, 'dispatcher@sellekni.test', /^\/$/, { width: 1366, height: 860 }, '0,0');

if (reset) {
  const r = await dispatcher.page.request.post(`${BASE}/api/demo/reset`);
  console.log(r.ok() ? '  ✓ demo database reset' : `  ✗ reset failed: HTTP ${r.status()} (is DEMO_MODE=true?)`);
  if (resetOnly) {
    await browser.close();
    process.exit(r.ok() ? 0 : 1);
  }
  await dispatcher.page.reload();
}

const hospital = await signedIn(browser, 'hospital-a@sellekni.test', /^\/hospital\//, { width: 900, height: 860 }, '1366,0');
// D11 stage window: the dispatcher's session (no second login), /demo and /phones as two tabs of one window.
const stagePages: Page[] = [];
if (stage) {
  const health = (await (await dispatcher.page.request.get(`${BASE}/api/health`)).json()) as { demo?: boolean };
  if (health.demo) {
    const demo = await dispatcher.ctx.newPage();
    await place(dispatcher.ctx, demo, { width: 1280, height: 860 }, '160,60');
    await demo.goto(`${BASE}/demo`);
    const phones = await dispatcher.ctx.newPage(); // opens in its own window: Chrome gives each automation page one
    await place(dispatcher.ctx, phones, { width: 1280, height: 860 }, '220,100');
    await phones.goto(`${BASE}/phones`);
    await demo.bringToFront();
    stagePages.push(demo, phones);
    console.log(`  ✓ stage: ${BASE}/demo and ${BASE}/phones (the witness QR appears on /demo once an incident is open)`);
  } else {
    console.log('  · stage windows skipped: DEMO_MODE is not true on this server');
  }
}

console.log(`
  Try the hero flow (≈ 90 s):
   1. Dispatcher: Simulate SMS → "Rollover, no response" → Send → Esc
   2. Click the red ▲ pin → read the reasons → Acknowledged
   3. Orientation: Pre-alert on the #1 hospital (hospital A's)
   4. Hospital window: Acknowledge
   5. Dispatcher: ✓ Acknowledged appears → Audit log shows every step
   6. Stage window (/demo): "Witness report (5 taps)" → ×2 reports, confidence up;
      "Crew update (GCS 9, BP 85)" → re-scored, the hospital card follows; "Reset the demo" when done
   7. Real phone on USB (app server URL http://127.0.0.1:3000): Home → "I saw an accident" (5 taps),
      or hold SOS 1.5 s → the pin appears here. The witness/crew QR codes open on a USB phone (localhost is forwarded);
      a phone on Wi-Fi needs PUBLIC_BASE_URL=http://<laptop LAN IP>:3000 in .env.local
  Between two runs: ./sellekni open --reset (or scripts/reset-demo.sh for the full checklist).
  Close all windows (or Ctrl+C) to quit.`);

// stay open until the person closes every window
await Promise.all([dispatcher.page, hospital.page, ...stagePages].map((p) => p.waitForEvent('close', { timeout: 0 }).catch(() => undefined)));
await browser.close().catch(() => undefined);
