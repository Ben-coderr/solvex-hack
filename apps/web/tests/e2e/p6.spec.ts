import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import { DISPATCHER, login, PASSWORD, watchConsole } from './helpers';

/**
 * P6: witness page (D10) merge on an old-browser profile, /demo reset (D11), witness page states.
 * Hospital ACK (D8) is covered by hero-flow.spec.ts. Needs DEMO_MODE=true and a running app.
 * `P6_SCREENS=1` also writes the screenshot matrix to docs/pitch/design/p6.
 */

/** Android 4.4 stock browser. Chrome cannot emulate the old engine: we emulate what matters, no JS + small screen + UA. */
const OLD_ANDROID = 'Mozilla/5.0 (Linux; U; Android 4.4.2; fr-fr; GT-I9505 Build/KOT49H) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30';

test.beforeAll(() => {
  expect(PASSWORD, 'DEMO_USER_PASSWORD must be set in .env.local').not.toBe('');
});

async function oldPhone(browser: Browser) {
  const ctx = await browser.newContext({ javaScriptEnabled: false, userAgent: OLD_ANDROID, viewport: { width: 320, height: 640 }, locale: 'fr-FR' });
  return ctx.newPage();
}

test('D10: a witness on an old phone (no JS) merges into the incident — ×2 reports, confidence rises', async ({ browser }) => {
  const errors: string[] = [];
  const d = await login(browser, DISPATCHER, errors);
  expect((await d.request.post('/api/demo/reset')).ok()).toBe(true);
  await d.reload();

  // sensor-only frontal alert, phone-realistic G (16 g = the sensor ceiling): confidence L on its own
  const res = await d.request.post('/api/demo/replay', { data: { scenario: 'frontal' } });
  const { ack } = (await res.json()) as { ack: { incident_id: string; assessment: { conf: string } } };
  const id = ack.incident_id;
  expect(ack.assessment.conf).toBe('L');

  await d.getByTestId(`pin-${id}`).click();
  await d.getByTestId('witness-toggle').click();
  await expect(d.getByTestId('witness-qr').locator('svg')).toBeVisible();
  const url = (await d.getByTestId('witness-url').textContent())!;
  expect(url).toMatch(new RegExp(`/w/${id}\\?k=[A-Za-z0-9_-]{22}$`));

  // ── the witness: plain HTML form, JavaScript off ──
  const w = await oldPhone(browser);
  await w.goto(url);
  await expect(w.getByTestId('witness-coarse')).toHaveText(/^\d+\.\d{3}, \d+\.\d{3}$/); // ~100 m, never the 5-decimal fix
  const body = await w.locator('body').innerText();
  for (const leak of ['36.47213', 'Y 44', 'conf', id]) expect(body).not.toContain(leak); // no victim data, no band, no id
  await w.locator('input[name=vehicles][value="2"]').check();
  await w.locator('input[name=kinds][value="moto"]').check();
  await w.locator('input[name=hurt][value="1"]').check();
  await w.locator('input[name=danger][value="trapped"]').check();
  await w.locator('input[name=danger][value="child"]').check();
  await w.locator('input[name=here]').check();
  const t0 = Date.now();
  await w.getByTestId('witness-send').click();
  await expect(w.getByTestId('witness-sent')).toBeVisible();
  await expect(w.getByText('Ne déplacez pas un blessé', { exact: false })).toBeVisible();

  // ── dispatcher: same pin, ×2, confidence up (Realtime, no reload) ──
  await expect(d.getByTestId(`row-${id}`)).toContainText('×2 reports', { timeout: 3_000 });
  test.info().annotations.push({ type: 'witness-to-row-ms', description: String(Date.now() - t0) });
  await expect(d.getByTestId('drawer')).toContainText('High confidence');
  await expect(d.getByTestId(`row-${id}`)).toHaveCount(1); // merged, not a new incident
  const audit = (await (await d.request.get(`/api/audit?incident=${id}`)).json()) as { events: Array<{ action: string; after: { channel?: string } }> };
  expect(audit.events.some((e) => e.action === 'incident.report_merged' && e.after.channel === 'witness')).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('D10: wrong token, closed incident, missing confirmation, offline', async ({ browser }) => {
  const errors: string[] = [];
  const d = await login(browser, DISPATCHER, errors);
  expect((await d.request.post('/api/demo/reset')).ok()).toBe(true);
  await d.request.post('/api/demo/replay', { data: { scenario: 'rollover' } });
  const phones = (await (await d.request.get('/api/demo/phones')).json()) as { witness: { url: string } };
  const url = phones.witness.url;

  const w = await oldPhone(browser);
  await w.goto(url.replace(/k=.*/, 'k=AAAAAAAAAAAAAAAAAAAAAA'));
  await expect(w.getByText('Ce lien n’est pas valide')).toBeVisible();
  expect((await w.request.post(url.replace(/\/w\//, '/api/witness/').replace(/k=.*/, 'k=nope'), { data: {} })).status()).toBe(404);

  // the browser skips `required` with JS off? the server still refuses a report without the place confirmation
  const noPlace = await w.request.post(url.replace('/w/', '/api/witness/'), { form: { vehicles: '1', hurt: '0' }, maxRedirects: 0 });
  expect(noPlace.status()).toBe(303);
  expect(noPlace.headers().location).toContain('error=confirm_place');
  await w.goto(`${url}&error=confirm_place`);
  await expect(w.getByTestId('witness-error')).toContainText('Cochez la case');

  // offline (JS on): the form says so instead of failing silently
  const ctx = await browser.newContext({ locale: 'en-GB', viewport: { width: 360, height: 740 } });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url }]);
  const on = await ctx.newPage();
  await on.goto(url);
  await ctx.setOffline(true);
  await expect(on.getByTestId('witness-offline')).toBeVisible();
  await ctx.setOffline(false);

  // after a reset the incident is gone: the old link says "already handled", shows nothing else
  expect((await d.request.post('/api/demo/reset')).ok()).toBe(true);
  await w.goto(url);
  await expect(w.getByText('Cet accident est déjà pris en charge')).toBeVisible();
  await expect(w.locator('form')).toHaveCount(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('D11: /demo — scenario starts the stopwatch, witness merges, Reset returns a verified clean DB in < 5 s', async ({ browser }) => {
  const errors: string[] = [];
  const d = await login(browser, DISPATCHER, errors);
  await d.goto('/demo');
  await expect(d.getByText('DEMO — synthetic data')).toBeVisible();

  await d.getByTestId('demo-frontal').click();
  await expect(d.getByTestId('stopwatch')).toHaveAttribute('data-running', 'true');
  await expect(d.getByTestId('demo-outcome')).toContainText('New incident');
  await expect(d.getByTestId('demo-witness-qr').locator('svg')).toBeVisible();
  await d.getByTestId('demo-witness').click();
  await expect(d.getByTestId('demo-outcome')).toContainText('×2');
  await expect(d.getByTestId('demo-latest')).toHaveAttribute('data-count', '2');
  await d.getByTestId('demo-duplicate').click();
  await expect(d.getByTestId('demo-outcome')).toContainText('Duplicate');

  await d.getByTestId('demo-reset').click();
  const t0 = Date.now();
  await d.getByTestId('demo-reset-confirm').click();
  await expect(d.getByTestId('demo-reset-result')).toHaveAttribute('data-clean', 'true', { timeout: 5_000 });
  const ms = Date.now() - t0;
  test.info().annotations.push({ type: 'reset-ms', description: String(ms) });
  expect(ms).toBeLessThan(5_000);
  await expect(d.getByText('No open incident. Run a scenario.')).toBeVisible();

  // /phones renders the three phones from the same feed
  await d.goto('/phones');
  await expect(d.getByTestId('phone-driver')).toBeVisible();
  await d.getByTestId('phone-driver-rollover').click();
  await expect(d.getByTestId('phone-witness').locator('iframe')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('screens: witness ar/en light/dark, /demo, /phones', async ({ browser }) => {
  test.skip(!process.env.P6_SCREENS, 'set P6_SCREENS=1 to write docs/pitch/design/p6');
  const out = path.resolve(__dirname, '../../../../docs/pitch/design/p6');
  mkdirSync(out, { recursive: true });
  const errors: string[] = [];
  const d = await login(browser, DISPATCHER, errors);
  expect((await d.request.post('/api/demo/reset')).ok()).toBe(true);
  await d.request.post('/api/demo/replay', { data: { scenario: 'rollover' } });
  const { witness } = (await (await d.request.get('/api/demo/phones')).json()) as { witness: { url: string } };

  for (const theme of ['dark', 'light'] as const) {
    for (const locale of ['ar', 'en', 'fr'] as const) {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
      const o = new URL(witness.url).origin;
      await ctx.addCookies([{ name: 'najda-theme', value: theme, url: o }, { name: 'NEXT_LOCALE', value: locale, url: o }]);
      const p = await ctx.newPage();
      watchConsole(p, errors);
      await p.goto(witness.url);
      await p.screenshot({ path: `${out}/witness-360-${theme}-${locale}.jpg`, fullPage: true, quality: 70 });
      if (locale !== 'fr') {
        await p.goto(`${witness.url}&sent=1`);
        await p.screenshot({ path: `${out}/witness-sent-360-${theme}-${locale}.jpg`, fullPage: true, quality: 70 });
      }
      await ctx.close();
    }
  }
  const origin = new URL(witness.url).origin; // a cookie set from the /w/… URL would be scoped to that path
  for (const [theme, locale] of [['dark', 'ar'], ['light', 'en']] as const) {
    await d.context().addCookies([{ name: 'najda-theme', value: theme, url: origin }, { name: 'NEXT_LOCALE', value: locale, url: origin }]);
    for (const width of [1440, 768, 360]) {
      await d.setViewportSize({ width, height: 900 });
      for (const page of ['demo', 'phones']) {
        await d.goto(`/${page}`);
        await d.waitForTimeout(800);
        await d.screenshot({ path: `${out}/${page}-${width}-${theme}-${locale}.jpg`, fullPage: true, quality: 70 });
        // no sideways scroll at any width (docs/guidelines/design-constitution.md)
        expect(await d.evaluate(() => document.documentElement.scrollWidth), `${page} ${width}`).toBeLessThanOrEqual(width);
      }
    }
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
