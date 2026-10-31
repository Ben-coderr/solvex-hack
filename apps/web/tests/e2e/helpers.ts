import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/** Shared by the e2e specs: demo logins, and a console/HTTP error sink that fails the test. */
export const PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
export const DISPATCHER = 'dispatcher@sellekni.test';
export const HOSPITAL_A = 'hospital-a@sellekni.test';

/**
 * The hospital hospital-a signs in to, for the server's HOSPITAL_SET (data/demo-hospitals.json). By design it is also
 * the top recommendation for the canonical rollover near Blida: the nearest emergency department is NOT it.
 *   national: CHU Frantz Fanon (Blida) beats the closer EPH Ibn Rochd (ED + surgery only)
 *   demo:     CHU-A beats the closer EPH-B (docs/05 §5.1 worked example)
 */
const demoHospitals = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../data/demo-hospitals.json'), 'utf8'));
export const HOSPITAL_SET: 'demo' | 'national' = process.env.HOSPITAL_SET === 'demo' ? 'demo' : 'national';
export const HOSPITAL_A_ID: string = demoHospitals.logins[HOSPITAL_SET]['hospital-a'];
export const HOSPITAL_B_ID: string = demoHospitals.logins[HOSPITAL_SET]['hospital-b'];

/**
 * Console errors, uncaught exceptions and any 4xx/5xx from our own origin fail the test. Third-party online tiles
 * (OpenFreeMap) are a network dependency, not our bug: their failures are ignored.
 */
export function watchConsole(page: Page, sink: string[]) {
  const origin = new URL(test.info().project.use.baseURL!).origin;
  page.on('pageerror', (e) => sink.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(origin)) sink.push(`http ${r.status()}: ${r.url()}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // the browser's generic line for a failed fetch carries no URL; our own failures are caught by 'response' above
    if (/^Failed to load resource/.test(text)) return;
    sink.push(`console: ${text}`);
  });
}

/**
 * Contexts a test opened with browser.newContext() live until the WORKER ends, not the test. Left open, every earlier
 * test's dashboard kept polling and refetching on each Realtime push under the same dispatcher's rate-limit key, and a
 * later test got 429 (P7: intermittent D9 failure). Specs call `closeOpened` in afterEach.
 */
const opened: BrowserContext[] = [];
export function track<C extends BrowserContext>(ctx: C): C {
  opened.push(ctx);
  return ctx;
}
export async function closeOpened() {
  await Promise.all(opened.splice(0).map((c) => c.close().catch(() => undefined)));
}

export async function login(browser: Browser, email: string, errors: string[]) {
  const context = track(await browser.newContext({ locale: 'en-GB' }));
  await context.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: test.info().project.use.baseURL! }]);
  const page = await context.newPage();
  watchConsole(page, errors);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return page;
}
