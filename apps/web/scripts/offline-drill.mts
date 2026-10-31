// P7 offline drill (docs/06 §10 item 5, P7 §5), automated in the installed Chrome.
//   BASE_URL=http://localhost:3000 pnpm --filter web exec tsx --env-file=../../.env.local scripts/offline-drill.mts
// A — "internet unplugged": the browser reaches ONLY the laptop (every other host is aborted, navigator.onLine=false).
//     Every screen must render, Simulate SMS must still create an incident, the dashboard must say so, and the map must
//     draw from the local PMTiles file (range requests to /tiles/sellekni.pmtiles, strip says OFFLINE TILES).
// B — "server unreachable": the dashboard loses even the laptop (context offline) and must say Offline, keeping the queue.
// Writes docs/field-notes/offline-drill-p7.json and a map screenshot next to it. Exit 1 on any failed check.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const LOCAL = new Set([new URL(BASE).hostname, 'localhost', '127.0.0.1']);
const OUT = path.resolve(process.cwd(), '../../docs/field-notes');
const checks: Array<{ check: string; ok: boolean; detail?: string }> = [];
const check = (name: string, ok: boolean, detail?: string) => { checks.push({ check: name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };

const browser = await chromium.launch({ channel: 'chrome' });
const blocked: string[] = [];
const ownErrors: string[] = [];
let tileRanges = 0;

async function unplugged(viewport = { width: 1440, height: 900 }): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport, locale: 'en-GB' });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: BASE }]);
  // a string: tsx would wrap a function in a __name() helper that the page does not have
  await ctx.addInitScript(`Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false });`);
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.protocol.startsWith('http') && !LOCAL.has(u.hostname)) {
      blocked.push(u.hostname);
      return route.abort('internetdisconnected');
    }
    return route.continue();
  });
  ctx.on('response', (r) => {
    if (r.url().includes('/tiles/sellekni.pmtiles') && r.status() === 206) tileRanges++;
    if (r.status() >= 500 && LOCAL.has(new URL(r.url()).hostname)) ownErrors.push(`${r.status()} ${r.url()}`);
  });
  ctx.on('weberror', (e) => ownErrors.push(`pageerror: ${e.error().message}`));
  return ctx;
}

async function signIn(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(process.env.DEMO_USER_PASSWORD ?? '');
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function renders(page: Page, name: string, url: string, anchor: string) {
  try {
    await page.goto(`${BASE}${url}`);
    await page.getByTestId(anchor).first().waitFor({ timeout: 15_000 });
    check(`A renders ${name}`, true);
  } catch (e) {
    check(`A renders ${name}`, false, String(e).split('\n')[0]);
  }
}

// ── A: internet unplugged ──
const ctx = await unplugged();
const d = await ctx.newPage();
await d.goto(`${BASE}/login`);
check('A renders /login', await d.locator('input[type=email]').isVisible());
await signIn(d, 'dispatcher@sellekni.test');
check('A reset (local API)', (await d.request.post(`${BASE}/api/demo/reset`)).ok());

await d.goto(`${BASE}/`);
await d.getByTestId('strip-online').waitFor();
check('A dashboard says no internet', (await d.getByTestId('strip-online').getAttribute('data-tone')) === 'warn' && (await d.getByText('SMS only — alerts still go out').isVisible()));
await d.getByTestId('open-sim').click();
await d.getByLabel('Rollover, no response (auto)').check();
await d.getByTestId('sim-send').click();
const outcome = await d.getByTestId('ingest-result').getAttribute('data-outcome', { timeout: 10_000 }).catch(() => null);
check('A Simulate SMS still creates an incident', outcome === 'created', `outcome=${outcome}`);
await d.keyboard.press('Escape');
const row = d.getByTestId(/^row-/).first();
await row.waitFor();
const id = (await row.getAttribute('data-testid'))!.replace('row-', '');
await d.getByTestId(`pin-${id}`).click();
await d.getByTestId('drawer').waitFor();
check('A drawer + orientation render', await d.getByTestId('orientation').getByTestId(/^hospital-/).first().waitFor({ timeout: 15_000 }).then(() => true, () => false));
check('A strip says OFFLINE TILES', (await d.getByTestId('strip-tiles').getAttribute('data-tone')) === 'ok', (await d.getByTestId('strip-tiles').innerText()).trim());
// tiles drawn: MapLibre has fetched ranges of the local file and reports its tiles loaded
await d.waitForFunction(() => document.querySelector('.maplibregl-canvas') !== null);
await d.waitForTimeout(2500); // render window for the tile fetches, then read the counters
check('A map reads the local PMTiles (HTTP 206 ranges)', tileRanges > 0, `${tileRanges} range responses`);
const map = d.getByTestId('map');
await map.screenshot({ path: path.join(OUT, 'offline-drill-map.jpg'), quality: 70, type: 'jpeg' });

await renders(d, '/audit', `/audit?incident=${id}`, 'audit-table');
await renders(d, '/demo', '/demo', 'stopwatch');
await renders(d, '/phones', '/phones', 'phone-driver');
await d.goto(`${BASE}/styleguide`);
check('A renders /styleguide', await d.locator('h1').first().waitFor({ timeout: 15_000 }).then(() => true, () => false));

const links = (await (await d.request.get(`${BASE}/api/demo/phones`)).json()) as { witness: { url: string }; crew: { url: string } };
const pathOf = (u: string) => { const x = new URL(u); return x.pathname + x.search; };
const w = await ctx.newPage();
await renders(w, 'witness page /w', pathOf(links.witness.url), 'witness-send');
await renders(w, 'crew page /crew', pathOf(links.crew.url), 'crew-send');
check('A pre-alert (local API)', (await d.request.post(`${BASE}/api/incidents/${id}/prealert`, { data: { hospital_id: 'N-CHU-BLIDA-FRANTZ-FANON' } })).ok());
const hctx = await unplugged();
const h = await hctx.newPage();
await signIn(h, 'hospital-a@sellekni.test');
check('A renders hospital ED view with the pre-alert', await h.getByTestId(`incoming-${id}`).waitFor({ timeout: 15_000 }).then(() => true, () => false));

// ── B: the laptop itself unreachable ──
await d.goto(`${BASE}/`);
await d.getByTestId(`row-${id}`).waitFor();
await ctx.setOffline(true);
const saysOffline = await d.getByText('Offline — saved, will retry').waitFor({ timeout: 25_000 }).then(() => true, () => false);
check('B dashboard says Offline when the server is unreachable', saysOffline);
check('B queue keeps the last data', await d.getByTestId(`row-${id}`).isVisible());
await ctx.setOffline(false);
const back = await d.getByText('Offline — saved, will retry').waitFor({ state: 'hidden', timeout: 25_000 }).then(() => true, () => false);
check('B recovers by itself when the server is back', back);

const hosts = [...new Set(blocked)];
check('no 5xx / page errors from our own origin', ownErrors.length === 0, ownErrors.slice(0, 3).join(' | '));
const result = { at: new Date().toISOString(), base: BASE, chrome: browser.version(), blockedExternalHosts: hosts, tileRangeResponses: tileRanges, checks };
writeFileSync(path.join(OUT, 'offline-drill-p7.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(`blocked external hosts: ${hosts.join(', ') || 'none'}`);
await browser.close();
process.exit(checks.every((c) => c.ok) ? 0 : 1);
