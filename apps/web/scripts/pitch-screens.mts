// P8 §5 — real product screenshots for the slides (dark theme, English UI, synthetic data).
//   BASE_URL=http://localhost:3000 pnpm --filter web exec tsx --env-file=../../.env.local scripts/pitch-screens.mts
// Resets the demo DB, plays the hero flow through the demo API (rollover + witness), pre-alerts the top hospital, then
// writes docs/pitch/screens/*.png.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.resolve(process.cwd(), '../../docs/pitch/screens');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });

async function page(email: string | null, viewport: { width: number; height: number }, mobile = false): Promise<Page> {
  const ctx = await browser.newContext({ viewport, locale: 'en-GB', deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: BASE }]);
  const p = await ctx.newPage();
  if (email) {
    await p.goto(`${BASE}/login`);
    await p.locator('input[type=email]').fill(email);
    await p.locator('input[type=password]').fill(process.env.DEMO_USER_PASSWORD ?? '');
    await p.locator('button[type=submit]').click();
    await p.waitForURL((u) => !u.pathname.startsWith('/login'));
  }
  return p;
}
const settle = (p: Page) => p.evaluate('document.fonts.ready').then(() => p.waitForTimeout(800));

const d = await page('dispatcher@sellekni.test', { width: 1920, height: 1080 });
if (!(await d.request.post(`${BASE}/api/demo/reset`)).ok()) throw new Error('reset failed');
const { ack } = (await (await d.request.post(`${BASE}/api/demo/replay`, { data: { scenario: 'rollover' } })).json()) as { ack: { incident_id: string } };
const id = ack.incident_id;

// witness phone, before sending (the 5-tap form)
const links = (await (await d.request.get(`${BASE}/api/demo/phones`)).json()) as { witness: { url: string } };
const w = await page(null, { width: 390, height: 844 }, true);
await w.goto(links.witness.url);
for (const sel of ['input[name=vehicles][value="2"]', 'input[name=kinds][value="moto"]', 'input[name=hurt][value="1"]', 'input[name=danger][value="trapped"]']) await w.locator(sel).check();
await w.evaluate('window.scrollTo(0, 0)');
await settle(w);
await w.screenshot({ path: path.join(OUT, 'witness-phone.png') });
await w.locator('input[name=danger][value="child"]').check();
await w.locator('input[name=here]').check();
await w.getByTestId('witness-send').click();
await w.getByTestId('witness-sent').waitFor();

// dispatcher: queue + map + drawer with reasons
await d.goto(`${BASE}/`);
await d.getByTestId(`row-${id}`).filter({ hasText: '×2' }).waitFor();
await d.getByTestId(`pin-${id}`).click();
await d.getByTestId('drawer').waitFor();
await settle(d);
await d.screenshot({ path: path.join(OUT, 'dashboard-reasons.png') });
await d.getByTestId('drawer').screenshot({ path: path.join(OUT, 'drawer-reasons.png') });

// orientation: closest ≠ best, route on the map
const top = d.getByTestId('orientation').getByTestId(/^hospital-/).first();
await top.scrollIntoViewIfNeeded();
await top.hover();
await settle(d);
await d.screenshot({ path: path.join(OUT, 'dashboard-orientation.png') });
await d.getByTestId('orientation').screenshot({ path: path.join(OUT, 'orientation.png') });

// pre-alert → hospital ED view
const hid = (await top.getAttribute('data-testid'))!.replace('hospital-', '');
await d.locator('[data-testid="lifecycle"] [data-step="ACKNOWLEDGED"]').click();
await d.locator('[data-testid="lifecycle"] [data-step="DISPATCHED"]').click();
await top.getByRole('button', { name: 'Pre-alert' }).click();
await d.getByTestId(`prealert-${hid}`).and(d.locator('[data-state="sent"]')).waitFor();
const h = await page('hospital-a@sellekni.test', { width: 1600, height: 900 });
await h.getByTestId(`incoming-${id}`).waitFor();
await settle(h);
await h.screenshot({ path: path.join(OUT, 'hospital-ed.png') });

// the packet as it travels (driver phone stand-in on /phones)
const ph = await page('dispatcher@sellekni.test', { width: 1600, height: 1000 });
await ph.goto(`${BASE}/phones`);
await ph.getByTestId('phone-driver').waitFor();
await settle(ph);
await ph.getByTestId('phone-driver').screenshot({ path: path.join(OUT, 'driver-phone-packet.png') });

// audit
await d.goto(`${BASE}/audit?incident=${id}`);
await d.getByTestId('audit-table').waitFor();
await settle(d);
await d.screenshot({ path: path.join(OUT, 'audit.png') });

await browser.close();
console.log(`screens → ${OUT} (incident ${id})`);
