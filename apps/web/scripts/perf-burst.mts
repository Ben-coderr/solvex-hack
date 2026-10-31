// P7 perf: how many API requests an open dashboard makes while 20 incidents arrive through Realtime, and how many get 429.
//   BASE_URL=http://localhost:3000 pnpm --filter web exec tsx --env-file=../../.env.local scripts/perf-burst.mts [salt]
// Needs open incidents on the board (run perf-dashboard.mts first). salt: changes the packet ids so a re-run is not a duplicate.
import { encodeDzmsd, encodePlusCode, type DzmsdPacket } from '@sellekni/shared';
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`);
await page.locator('input[type=email]').fill('dispatcher@sellekni.test');
await page.locator('input[type=password]').fill(process.env.DEMO_USER_PASSWORD!);
await page.locator('button[type=submit]').click();
await page.waitForURL((u) => !u.pathname.startsWith('/login'));
await page.getByTestId(/^row-/).first().waitFor();
await page.waitForTimeout(2000);
const api = ctx.request;
const reqs: string[] = []; let r429 = 0;
page.on('request', (r) => { if (r.url().includes('/api/')) reqs.push(new URL(r.url()).pathname); });
page.on('response', (r) => { if (r.status() === 429) r429++; });
const C = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const t = new Date().toISOString().slice(11, 16).replace(':', '');
for (let n = 0; n < 20; n++) {
  const lat = 35.1 + n * 0.05, lon = 5.5 + (n % 4) * 0.3;
  const p: DzmsdPacket = { id: `Z${C[n]}${C[(n * 3) % 32]}${C[(n * 7 + Number(process.argv[2] ?? 0)) % 32]}Q`, band: 'O', score: 50, conf: 'L', lat, lon, time: t, src: 'W', veh: 1, pers: 1, kinds: ['C'] };
  await api.post(`${BASE}/api/sms/paste`, { data: { text: encodeDzmsd({ ...p, plus: encodePlusCode(lat, lon) }) } });
}
await page.waitForTimeout(3000);
const by: Record<string, number> = {}; for (const r of reqs) by[r.replace(/[0-9A-Z]{5}/, ':id')] = (by[r.replace(/[0-9A-Z]{5}/, ':id')] ?? 0) + 1;
console.log(JSON.stringify({ arrivals: 20, dashboardApiRequests: reqs.length, by, responses429: r429 }));
await b.close();
