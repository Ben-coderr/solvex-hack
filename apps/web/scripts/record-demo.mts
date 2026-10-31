// P8 §4 — backup videos of the hero flow (docs/10 §3 steps 1–11), recorded from the real app in the installed Chrome.
//   BASE_URL=http://localhost:3000 pnpm --filter web exec tsx --env-file=../../.env.local scripts/record-demo.mts
// Records four views at once (dispatcher, hospital, /phones, the witness phone), logs when each step starts and ends,
// then cuts docs/pitch/videos/01…11-<step>.mp4 (the views that step is about, side by side) and 00-cut-60s.mp4.
// Phone screens here are the browser stand-ins (/phones, the witness page at phone size), not scrcpy captures of the
// real phones: steps 1–4 and 6 must be re-recorded with scrcpy on the stage phones (see videos/README.md).
// Synthetic data only: resets the demo DB first. Needs ffmpeg.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.DEMO_USER_PASSWORD ?? '';
const OUT = path.resolve(process.cwd(), '../../docs/pitch/videos');
const RAW = path.join(OUT, '.raw');
rmSync(RAW, { recursive: true, force: true });
mkdirSync(RAW, { recursive: true });

type View = 'dispatcher' | 'hospital' | 'phones' | 'witness';
const SIZE: Record<View, { width: number; height: number }> = {
  dispatcher: { width: 1366, height: 768 },
  hospital: { width: 1366, height: 768 },
  phones: { width: 1440, height: 900 },
  witness: { width: 412, height: 860 },
};

const browser = await chromium.launch({ channel: 'chrome' });
const T0 = Date.now();
const CHROME = browser.version();
const started: Partial<Record<View, number>> = {};
const pages: Partial<Record<View, Page>> = {};

async function open(view: View, email?: string): Promise<Page> {
  const ctx: BrowserContext = await browser.newContext({
    viewport: SIZE[view], locale: 'fr-FR', recordVideo: { dir: path.join(RAW, view), size: SIZE[view] },
    ...(view === 'witness' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}),
  });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'fr', url: BASE }]);
  const page = await ctx.newPage();
  started[view] = Date.now(); // the video starts with the page
  if (email) {
    await page.goto(`${BASE}/login`);
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill(PASSWORD);
    await page.locator('button[type=submit]').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  }
  pages[view] = page;
  return page;
}

/** A caption on every recorded view: what the step is, and that phones are browser stand-ins. */
async function caption(text: string) {
  for (const p of Object.values(pages)) {
    await p!.evaluate(`(() => {
      let el = document.getElementById('__cap');
      if (!el) { el = document.createElement('div'); el.id = '__cap'; document.body.appendChild(el);
        el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99999;max-width:calc(100% - 24px);padding:8px 12px;border-radius:8px;background:rgba(0,0,0,.78);color:#fff;font:600 15px/1.3 system-ui;pointer-events:none'; }
      el.textContent = ${JSON.stringify(text)};
    })()`).catch(() => {});
  }
}

const steps: Array<{ n: number; slug: string; views: View[]; from: number; to: number }> = [];
async function step(n: number, slug: string, views: View[], text: string, run: () => Promise<void>, hold = 1500) {
  await caption(`${String(n).padStart(2, '0')} · ${text}  —  DEMO · synthetic data`);
  const from = Date.now();
  await run();
  await new Promise((r) => setTimeout(r, hold)); // let the audience see the result
  steps.push({ n, slug, views, from, to: Date.now() });
  console.log(`✓ ${n} ${slug} ${((Date.now() - from) / 1000).toFixed(1)} s`);
}

// ── setup: clean DB, every view open and settled ──
const d = await open('dispatcher', 'dispatcher@sellekni.test');
if (!(await d.request.post(`${BASE}/api/demo/reset`)).ok()) throw new Error('reset failed (DEMO_MODE?)');
await d.goto(`${BASE}/`);
await d.getByTestId('strip-realtime').waitFor();
const ph = await open('phones', 'dispatcher@sellekni.test');
await ph.goto(`${BASE}/phones`);
await ph.getByTestId('phone-driver').waitFor();
const h = await open('hospital', 'hospital-a@sellekni.test');
await h.waitForLoadState('networkidle');
const w = await open('witness');
await w.goto('about:blank');
await new Promise((r) => setTimeout(r, 1500));

// ── docs/10 §3 ──
let id = '';
await step(1, 'phone-in-car', ['phones'], 'Phone A in a car at 71 km/h (replay rollover_71)', async () => {
  await ph.getByTestId('phone-driver').scrollIntoViewIfNeeded();
  await new Promise((r) => setTimeout(r, 2000));
});
await step(2, 'impact', ['phones'], 'Impact — no response to the countdown (phone stand-in)', async () => {
  await ph.getByTestId('phone-driver-rollover').click();
});
await step(3, 'no-response-dialler', ['phones'], 'No response: alert sent; on the phone the dialler opens on 14', async () => {
  await ph.getByTestId('phone-driver').locator('p[role=status]').filter({ hasText: /./ }).waitFor({ timeout: 10_000 });
});
await step(4, 'sms-160-chars', ['phones'], 'The packet: plain text, readable without our software', async () => {
  await ph.getByTestId('phone-driver').locator('.packet-ltr, [dir=ltr]').first().waitFor({ timeout: 10_000 }).catch(() => {});
}, 3000);
await step(5, 'pin-and-reasons', ['dispatcher'], 'Dispatcher: pin R 75, reasons, AUTO · UNCONFIRMED', async () => {
  const row = d.getByTestId(/^row-/).first();
  await row.waitFor();
  id = (await row.getAttribute('data-testid'))!.replace('row-', '');
  await d.getByTestId(`pin-${id}`).click();
  await d.getByTestId('drawer').waitFor();
}, 3500);
await step(6, 'ack-delivered', ['phones'], 'Phone A: acknowledgement SMS received', async () => {
  await ph.getByText(id, { exact: false }).first().waitFor({ timeout: 10_000 }).catch(() => {});
}, 2500);
await step(7, 'witness-merge', ['witness', 'dispatcher'], 'Witness, 6 taps → same pin, ×2 reports, score 75 → 86', async () => {
  const links = (await (await d.request.get(`${BASE}/api/demo/phones`)).json()) as { witness: { url: string } };
  await w.goto(links.witness.url);
  await caption(`07 · Witness, 6 taps → same pin, ×2 reports, score 75 → 86  —  DEMO · synthetic data`);
  for (const sel of ['input[name=vehicles][value="2"]', 'input[name=kinds][value="moto"]', 'input[name=hurt][value="1"]', 'input[name=danger][value="trapped"]',
    'input[name=danger][value="child"]', 'input[name=here]']) {
    await w.locator(sel).scrollIntoViewIfNeeded();
    await w.locator(sel).check();
    await new Promise((r) => setTimeout(r, 450));
  }
  await w.getByTestId('witness-send').click();
  await w.getByTestId('witness-sent').waitFor();
  await d.getByTestId(`row-${id}`).filter({ hasText: '×2' }).waitFor({ timeout: 5_000 });
}, 3000);
await step(8, 'acknowledged-dispatched', ['dispatcher'], 'ACKNOWLEDGED → DISPATCHED (each click audited)', async () => {
  await d.locator('[data-testid="lifecycle"] [data-step="ACKNOWLEDGED"]').click();
  await new Promise((r) => setTimeout(r, 1200));
  await d.locator('[data-testid="lifecycle"] [data-step="DISPATCHED"]').click();
});
let top = '';
await step(9, 'orientation', ['dispatcher'], 'Orientation: closest ≠ best (nearest ED lacks ICU / trauma surgery)', async () => {
  const t = d.getByTestId('orientation').getByTestId(/^hospital-/).first();
  await t.scrollIntoViewIfNeeded();
  await t.hover();
  top = (await t.getAttribute('data-testid'))!.replace('hospital-', '');
}, 3500);
await step(10, 'prealert-hospital', ['dispatcher', 'hospital'], 'Pre-alert → hospital card + SMS; hospital ACK → ✓', async () => {
  await d.getByTestId('orientation').getByTestId(`hospital-${top}`).getByRole('button', { name: /Pré-alerter|Pre-alert/ }).click();
  const card = h.getByTestId(`incoming-${id}`);
  await card.waitFor({ timeout: 10_000 });
  await new Promise((r) => setTimeout(r, 1500));
  await card.getByRole('button', { name: /Prendre en compte|Acknowledge/ }).click();
  await d.getByTestId(`prealert-${top}`).and(d.locator('[data-state="acked"]')).waitFor({ timeout: 10_000 });
}, 2500);
await step(11, 'audit', ['dispatcher'], 'Humans decided every step: the audit log', async () => {
  await d.goto(`${BASE}/audit?incident=${id}`);
  await d.getByTestId('audit-table').waitFor();
}, 3000);

const total = (Date.now() - steps[0]!.from) / 1000;
for (const p of Object.values(pages)) await p!.context().close(); // flushes the videos
await browser.close();

// ── cut ──
const src: Partial<Record<View, string>> = {};
for (const v of Object.keys(SIZE) as View[]) {
  const f = readdirSync(path.join(RAW, v)).find((x) => x.endsWith('.webm'));
  if (f) src[v] = path.join(RAW, v, f);
}
const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const H = 1080;
const clips: string[] = [];
for (const s of steps) {
  const name = `${String(s.n).padStart(2, '0')}-${s.slug}.mp4`;
  const inputs = s.views.flatMap((v) => ['-ss', ((s.from - started[v]!) / 1000).toFixed(2), '-t', ((s.to - s.from) / 1000).toFixed(2), '-i', src[v]!]);
  const scaled = s.views.map((_, i) => `[${i}:v]scale=-2:${H},setsar=1,fps=30[v${i}]`).join(';');
  const filter = s.views.length > 1 ? `${scaled};${s.views.map((_, i) => `[v${i}]`).join('')}hstack=inputs=${s.views.length}[o]` : scaled.replace('[v0]', '[o]');
  ff([...inputs, '-filter_complex', filter, '-map', '[o]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'veryfast', path.join(OUT, name)]);
  clips.push(name);
}
// 60-second cut: the whole run, every step, sped up evenly to fit 60 s (pad the narrower clips to one size first)
const list = path.join(RAW, 'list.txt');
const padded = clips.map((c, i) => {
  const p = path.join(RAW, `p${i}.mp4`);
  ff(['-i', path.join(OUT, c), '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'veryfast', p]);
  return `file '${p}'`;
});
writeFileSync(list, `${padded.join('\n')}\n`);
const speed = Math.max(1, total / 58);
ff(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `setpts=PTS/${speed.toFixed(3)}`, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23',
  '-preset', 'veryfast', path.join(OUT, '00-cut-60s.mp4')]);
for (const v of Object.keys(src) as View[]) renameSync(src[v]!, path.join(OUT, `.raw-${v}.webm`));
rmSync(RAW, { recursive: true, force: true });
const log = { at: new Date().toISOString(), base: BASE, chrome: CHROME, totalSeconds: Math.round(total), speedup60: Number(speed.toFixed(2)),
  steps: steps.map((s) => ({ n: s.n, slug: s.slug, views: s.views, seconds: Number(((s.to - s.from) / 1000).toFixed(1)) })) };
writeFileSync(path.join(OUT, 'recording.json'), `${JSON.stringify(log, null, 2)}\n`);
console.log(`run ${Math.round(total)} s → ${clips.length} clips + 00-cut-60s.mp4 (×${speed.toFixed(2)}) in ${OUT}; T0+${Date.now() - T0} ms`);
