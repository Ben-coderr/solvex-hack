import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * G2 hero flow (docs/03 §4 flow C + D): simulate SMS → pin → detail → orientation → pre-alert → hospital ACK →
 * dispatcher sees ✓ → audit shows every step. Runs on a clean DB (demo reset). Needs DEMO_MODE=true.
 * Reused by P7 for the rehearsal timings.
 */

const PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
const DISPATCHER = 'dispatcher@najda.test';
const HOSPITAL_A = 'hospital-a@najda.test';

/**
 * Console errors, uncaught exceptions and any 4xx/5xx from our own origin fail the test. Third-party online tiles
 * (OpenFreeMap) are a network dependency, not our bug: their failures are ignored.
 */
function watchConsole(page: Page, sink: string[]) {
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

async function login(browser: Browser, email: string, errors: string[]) {
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

test.beforeAll(() => {
  expect(PASSWORD, 'DEMO_USER_PASSWORD must be set in .env.local (pnpm env:local && pnpm db:users)').not.toBe('');
});

test('hero flow: SMS → pin → orientation → pre-alert → hospital ACK → audit', async ({ browser }) => {
  const errors: string[] = [];
  const t0 = Date.now();

  // ── dispatcher, clean database ──
  const d = await login(browser, DISPATCHER, errors);
  await expect(d).toHaveURL(/\/$|\/\?/);
  expect((await d.request.post('/api/demo/reset')).ok()).toBe(true);
  await d.reload();
  await expect(d.getByText('No open incidents')).toBeVisible();
  await expect(d.getByTestId('strip-realtime')).toHaveAttribute('data-tone', 'ok');

  // ── D6: Simulate SMS (canonical rollover packet) ──
  await d.getByTestId('open-sim').click();
  await d.getByLabel('Rollover, no response (auto)').check();
  await d.getByTestId('sim-send').click();
  const result = d.getByTestId('ingest-result');
  await expect(result).toHaveAttribute('data-outcome', 'created');
  await d.keyboard.press('Escape');

  // ── D1: the pin and the queue row ──
  const row = d.getByTestId(/^row-/).first();
  await expect(row).toBeVisible();
  const id = (await row.getAttribute('data-testid'))!.replace('row-', '');
  await expect(row).toContainText('Auto · unconfirmed');
  const pin = d.getByTestId(`pin-${id}`);
  await expect(pin).toBeVisible();

  // ── D2: detail drawer ──
  await pin.click();
  const drawer = d.getByTestId('drawer');
  await expect(drawer).toBeVisible();
  await expect(d.getByTestId('drawer-score')).toHaveText('R 75');
  await expect(drawer.getByText('Estimated risk, not a diagnosis.', { exact: false }).first()).toBeVisible();
  await expect(drawer.getByText('Speed drop 71 km/h')).toBeVisible();

  // ── D4: acknowledge (a human click, audited) ──
  await d.locator('[data-testid="lifecycle"] [data-step="ACKNOWLEDGED"]').click();
  await expect(d.locator('[data-testid="lifecycle"] [data-step="ACKNOWLEDGED"]')).toHaveAttribute('aria-current', 'step');
  // a step two ahead is blocked, and says why
  await expect(d.locator('[data-testid="lifecycle"] [data-step="ON_SCENE"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(d.locator('[data-testid="lifecycle"] [data-step="ON_SCENE"]')).toHaveAttribute('title', /Next step first/);

  // ── override without a reason is impossible (UI and API) ──
  await d.getByTestId('override-band').click();
  const dialog = d.getByRole('dialog');
  await dialog.locator('label', { hasText: 'Serious' }).click();
  const confirm = dialog.getByRole('button', { name: 'Confirm' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/Reason/).fill('abc');
  await expect(confirm).toBeDisabled();
  await d.keyboard.press('Escape');
  const noReason = await d.request.patch(`/api/incidents/${id}`, { data: { action: 'override_band', band: 'O', reason: '' } });
  expect(noReason.status()).toBe(422);

  // ── D3: orientation, top recommendation, then DISPATCHED ──
  const top = d.getByTestId('orientation').getByTestId(/^hospital-/).first();
  await expect(top).toBeVisible();
  const hospitalId = (await top.getAttribute('data-testid'))!.replace('hospital-', '');
  expect(hospitalId).toBe('CHU-A'); // docs/05 §5.1 worked example: closest (EPH-B) is not best
  await expect(d.getByTestId('orientation').getByText('Nearest ED').first()).toBeVisible();
  await top.hover(); // route on the map
  await d.locator('[data-testid="lifecycle"] [data-step="DISPATCHED"]').click();
  await expect(d.locator('[data-testid="lifecycle"] [data-step="DISPATCHED"]')).toHaveAttribute('aria-current', 'step');

  // ── D5: one-click pre-alert ──
  await top.getByRole('button', { name: 'Pre-alert' }).click();
  const state = d.getByTestId(`prealert-${hospitalId}`);
  await expect(state).toHaveAttribute('data-state', 'sent');
  await expect(state).toContainText(/Pre-alert sent \d{2}:\d{2}/);
  await expect(state).toContainText('web card + SMS');

  // ── D8: the hospital acknowledges ──
  const h = await login(browser, HOSPITAL_A, errors);
  await expect(h).toHaveURL(new RegExp(`/hospital/${hospitalId}$`));
  const card = h.getByTestId(`incoming-${id}`);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(card).toHaveAttribute('data-acked', 'true');

  // ── dispatcher sees ✓ without reloading (Realtime) ──
  await expect(state).toHaveAttribute('data-state', 'acked', { timeout: 5_000 });
  await expect(state).toContainText(/Acknowledged \d{2}:\d{2}/);

  // ── D7: audit shows every step with who / what / when ──
  await d.goto(`/audit?incident=${id}`);
  const table = d.getByTestId('audit-table');
  for (const action of ['incident.created', 'incident.transition', 'incident.hospital_set', 'prealert.sent', 'prealert.acked']) {
    await expect(table.locator(`tr[data-action="${action}"]`).first()).toBeVisible();
  }
  await expect(table.locator('tr[data-action="prealert.acked"]')).toContainText('CHU A ED (demo)');
  await expect(table.locator('tr[data-action="incident.transition"]')).toHaveCount(2);

  test.info().annotations.push({ type: 'hero-flow-ms', description: String(Date.now() - t0) });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('D1: an SMS arriving from outside shows up in < 2 s (Realtime, no reload)', async ({ browser }) => {
  const errors: string[] = [];
  const d = await login(browser, DISPATCHER, errors);
  await expect(d.getByTestId('strip-realtime')).toHaveAttribute('data-tone', 'ok');
  await expect(d.getByTestId('map')).toBeVisible();
  // Ingest through the API (not the page's own mutation): only the Realtime push can refresh the list.
  const t0 = Date.now();
  const res = await d.request.post('/api/demo/replay', { data: { scenario: 'witness_oran' } });
  expect(res.ok()).toBe(true);
  const { ack } = (await res.json()) as { ack: { incident_id: string } };
  await expect(d.getByTestId(`row-${ack.incident_id}`)).toBeVisible({ timeout: 2_000 });
  await expect(d.getByTestId(`pin-${ack.incident_id}`)).toBeVisible({ timeout: 2_000 });
  test.info().annotations.push({ type: 'ingest-to-row-ms', description: String(Date.now() - t0) });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('D6: a corrupted SMS is kept and shown as an unparsed report', async ({ browser }) => {
  const errors: string[] = [];
  const d = await login(browser, DISPATCHER, errors);
  await d.getByTestId('open-paste').click();
  await d.getByLabel('SMS text').fill(`NAJDA1 GARBAGE ${Date.now()}`);
  await d.getByRole('button', { name: 'Add to queue' }).click();
  await expect(d.getByTestId('ingest-result')).toHaveAttribute('data-outcome', 'unparsed');
  await d.keyboard.press('Escape');
  await expect(d.getByTestId('unparsed').getByText('NAJDA1 GARBAGE', { exact: false }).first()).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
