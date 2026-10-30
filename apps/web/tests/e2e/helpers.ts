import { test, type Browser, type Page } from '@playwright/test';

/** Shared by the e2e specs: demo logins, and a console/HTTP error sink that fails the test. */
export const PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
export const DISPATCHER = 'dispatcher@sellekni.test';
export const HOSPITAL_A = 'hospital-a@sellekni.test';

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

export async function login(browser: Browser, email: string, errors: string[]) {
  const context = await browser.newContext({ locale: 'en-GB' });
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
