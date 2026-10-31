// P7 performance pass (docs/09 / P7 §4): dispatcher dashboard with 50 seeded incidents, measured in the installed Chrome.
//   BASE_URL=http://localhost:3000 pnpm --filter web exec tsx --env-file=../../.env.local scripts/perf-dashboard.mts [label]
// Seeds through the real ingest path (/api/sms/paste), then records: load (LCP, CLS, long tasks, JS bytes), layout shift
// while 5 incidents arrive live (Realtime), and frame rate while panning the map at 1× and 4× CPU throttling.
// Prints JSON; appends it to ../../docs/field-notes/perf-dashboard.jsonl. Resets the demo DB first (synthetic data only).
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { encodeDzmsd, encodePlusCode, type Band, type DzmsdPacket } from '@sellekni/shared';
import { chromium, type Page } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
const label = process.argv[2] ?? 'run';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BANDS: Band[] = ['R', 'O', 'Y', 'G', 'U'];

const id = (n: number, salt: number) => Array.from({ length: 5 }, (_, i) => CROCKFORD[(n * 7 + salt * 13 + i * 31 + Math.floor(n / 32 ** i)) % 32]).join('');
function packet(n: number, salt: number): string {
  // a 10 × 5 grid over northern Algeria: every point is km apart, so nothing merges (300 m rule)
  const lat = 34.6 + (n % 10) * 0.25 + salt * 0.01;
  const lon = -0.8 + Math.floor(n / 10) * 1.6 + salt * 0.01;
  const hhmm = new Date().toISOString().slice(11, 16).replace(':', '');
  const p: DzmsdPacket = { id: id(n, salt), band: BANDS[n % 5]!, score: 20 + (n % 70), conf: 'L', lat, lon, time: hhmm, src: 'W', veh: 1 + (n % 3), pers: 1 + (n % 2), kinds: ['C'] };
  return encodeDzmsd({ ...p, plus: encodePlusCode(lat, lon) });
}

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-GB' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: BASE }]);
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.locator('input[type=email]').fill('dispatcher@sellekni.test');
await page.locator('input[type=password]').fill(PASSWORD);
await page.locator('button[type=submit]').click();
await page.waitForURL((u) => !u.pathname.startsWith('/login'));

await page.goto('about:blank'); // seed with no dashboard open: its Realtime refetches would share the rate-limit budget
const post = (url: string, data?: unknown) => page.request.post(`${BASE}${url}`, data === undefined ? undefined : { data });
if (!(await post('/api/demo/reset')).ok()) throw new Error('reset failed (DEMO_MODE?)');
for (let n = 0; n < 50; n++) {
  const r = await post('/api/sms/paste', { text: packet(n, 0) });
  if (!r.ok()) throw new Error(`seed ${n}: ${r.status()} ${await r.text()}`);
}

// observers installed before any page script: buffered entries from the very first paint
await ctx.addInitScript(() => {
  const w = window as unknown as { __perf: { cls: number; shifts: Array<{ v: number; at: number; nodes: string[] }>; long: number[]; lcp: number } };
  w.__perf = { cls: 0, shifts: [], long: [], lcp: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node }> }>) {
      if (e.hadRecentInput) continue;
      w.__perf.cls += e.value;
      w.__perf.shifts.push({ v: e.value, at: Math.round(e.startTime), nodes: (e.sources ?? []).map((s) => { const el = s.node as HTMLElement | undefined; return el ? `${el.tagName?.toLowerCase()}.${String(el.className ?? '').slice(0, 50)}${el.dataset?.testid ? `[${el.dataset.testid}]` : ''}` : '?'; }) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__perf.long.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => { const e = l.getEntries().at(-1); if (e) w.__perf.lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
});

const perf = (p: Page) => p.evaluate(() => (window as unknown as { __perf: { cls: number; shifts: Array<{ v: number; at: number; nodes: string[] }>; long: number[]; lcp: number } }).__perf);
const t0 = Date.now();
await page.goto(`${BASE}/`);
await page.getByTestId(/^row-/).nth(49).waitFor();
await page.getByTestId('map').locator('[data-testid^="pin-"]').nth(49).waitFor();
const rowsReadyMs = Date.now() - t0;
await page.waitForTimeout(1500); // let late shifts land before reading them: a measurement window, not a sync point
const load = await perf(page);
const nav = await page.evaluate(() => {
  const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  const js = performance.getEntriesByType('resource').filter((r) => (r as PerformanceResourceTiming).initiatorType === 'script') as PerformanceResourceTiming[];
  return { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), jsKB: Math.round(js.reduce((s, r) => s + r.encodedBodySize, 0) / 1024), jsFiles: js.length };
});

// live arrivals: 5 new incidents through the API (Realtime pushes them; the page must not jump)
await page.evaluate(() => { const w = window as unknown as { __perf: { cls: number; shifts: unknown[] } }; w.__perf.cls = 0; w.__perf.shifts = []; });
for (let n = 0; n < 5; n++) await post('/api/sms/paste', { text: packet(n, 1) });
await page.getByTestId(/^row-/).nth(54).waitFor();
await page.waitForTimeout(1500);
const arrivals = await perf(page);

async function panFps(throttle: number) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.evaluate(() => { const w = window as unknown as { __perf: { long: number[] } }; w.__perf.long = []; });
  const box = (await page.getByTestId('map').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // a string, not a function: tsx would wrap a named inner function in a __name() helper the page does not have
  await page.evaluate(`(() => {
    window.__frames = []; window.__rafOn = true;
    const tick = (t) => { window.__frames.push(t); if (window.__rafOn) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  })()`);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 0; i < 60; i++) await page.mouse.move(cx + Math.sin(i / 6) * 250, cy + Math.cos(i / 6) * 120, { steps: 2 });
  await page.mouse.up();
  const frames = await page.evaluate(() => { const w = window as unknown as { __frames: number[]; __rafOn: boolean }; w.__rafOn = false; return w.__frames; });
  const gaps = frames.slice(1).map((t, i) => t - frames[i]!).sort((a, b) => a - b);
  const p = (q: number) => Math.round(gaps[Math.min(gaps.length - 1, Math.floor(q * gaps.length))]! * 10) / 10;
  const long = (await perf(page)).long;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const seconds = (frames.at(-1)! - frames[0]!) / 1000;
  return { cpuThrottle: throttle, fps: Math.round(frames.length / seconds), frameMsP50: p(0.5), frameMsP95: p(0.95), framesOver50ms: gaps.filter((g) => g > 50).length, longTasks: long.length, longestTaskMs: Math.max(0, ...long) };
}
const pan1 = await panFps(1);
const pan4 = await panFps(4);

const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));

const result = {
  label, at: new Date().toISOString(), base: BASE, incidents: 55, viewport: '1440×900', chrome: browser.version(),
  load: { rowsReadyMs, lcpMs: load.lcp, cls: Number(load.cls.toFixed(4)), longTasks: load.long.length, longTasksTotalMs: load.long.reduce((a, b) => a + b, 0), ...nav },
  loadShifts: load.shifts.slice(0, 8),
  arrivals: { cls: Number(arrivals.cls.toFixed(4)), shifts: arrivals.shifts.slice(0, 8) },
  pan: [pan1, pan4],
  heapMB: Math.round((m.JSHeapUsedSize ?? 0) / 1048576), domNodes: m.Nodes,
};
console.log(JSON.stringify(result, null, 2));
appendFileSync(path.resolve(process.cwd(), '../../docs/field-notes/perf-dashboard.jsonl'), `${JSON.stringify(result)}\n`);
await browser.close();
