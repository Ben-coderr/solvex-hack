// Design QA for /styleguide (docs/06 §10). Uses the installed Google Chrome (no browser download).
//   BASE_URL=http://localhost:3000 pnpm --filter web design:qa
// Writes screenshots + qa-report.json to docs/pitch/design/. Exit code 1 if any automated check fails.
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = path.resolve(process.cwd(), '../../docs/pitch/design');
const WIDTHS = [360, 768, 1366, 1440] as const;
mkdirSync(OUT, { recursive: true });

type Defect = { check: string; where: string; detail: string };
const defects: Defect[] = [];
const notes: string[] = [];

const browser = await chromium.launch({ channel: 'chrome' });

async function open(width: number, opts: { theme: 'light' | 'dark'; locale: 'en' | 'ar'; reducedMotion?: boolean }) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    colorScheme: opts.theme,
    reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference',
  });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: opts.locale, url: BASE }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/styleguide`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => { await document.fonts.ready; });
  return { ctx, page, errors };
}

/** 1) console · 2) page + panel overflow · 3) targets < 40 px (desktop) / < 48 px (phone widths) */
async function structural(page: Page, label: string, width: number) {
  const r = await page.evaluate((w) => {
    const pageOverflow = document.documentElement.scrollWidth - window.innerWidth;
    const panels = [...document.querySelectorAll<HTMLElement>('[data-panel]')]
      .filter((p) => p.scrollWidth - p.clientWidth > 1)
      .map((p) => `${p.closest('section')?.id}/${p.dataset.panel} +${p.scrollWidth - p.clientWidth}px`);
    const min = w < 768 ? 48 : 40;
    const small = [...document.querySelectorAll<HTMLElement>('button, a[href], [role="radio"]')]
      .filter((el) => !el.closest('[data-kind]') && !el.dataset.kind) // packet chips: secondary copy targets, audited separately
      .map((el) => ({ el, b: el.getBoundingClientRect() }))
      .filter(({ b }) => b.width > 0 && (b.height < min || b.width < min - 8))
      .map(({ el, b }) => `${el.closest('section')?.id ?? 'header'}: "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(b.width)}×${Math.round(b.height)}`);
    const chips = [...document.querySelectorAll<HTMLElement>('button[data-kind]')].map((el) => el.getBoundingClientRect().height);
    return { pageOverflow, panels, small: [...new Set(small)].slice(0, 25), chipMinH: chips.length ? Math.min(...chips) : null };
  }, width);
  if (r.pageOverflow > 1) defects.push({ check: 'overflow', where: label, detail: `page scrolls horizontally by ${r.pageOverflow}px` });
  for (const p of r.panels) defects.push({ check: 'overflow', where: label, detail: `panel ${p}` });
  for (const s of r.small) defects.push({ check: 'target-size', where: label, detail: s });
  if (r.chipMinH !== null && width === 360) notes.push(`packet chips min height at 360 px: ${r.chipMinH}px`);
}

for (const width of WIDTHS) {
  for (const [theme, locale] of [['light', 'en'], ['dark', 'ar']] as const) {
    const label = `${width}px ${theme} ${locale}`;
    const { ctx, page, errors } = await open(width, { theme, locale });
    for (const e of errors) defects.push({ check: 'console', where: label, detail: e.slice(0, 200) });
    await structural(page, label, width);
    await page.screenshot({ path: path.join(OUT, `styleguide-${width}-${theme}-${locale}.jpg`), fullPage: true, type: 'jpeg', quality: 72 });
    await ctx.close();
  }
}

// axe (WCAG 2.x A/AA incl. colour contrast) on every panel at 1440
{
  const { ctx, page } = await open(1440, { theme: 'light', locale: 'en' });
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  for (const v of res.violations) {
    const where = v.nodes.slice(0, 4).map((n) => n.target.join(' ')).join(' | ');
    defects.push({ check: `axe:${v.id}`, where: `${v.nodes.length} node(s)`, detail: `${v.help} — ${where}` });
  }
  notes.push(`axe: ${res.passes.length} rules passed, ${res.violations.length} violated, ${res.incomplete.length} need review`);

  // per-section element screenshots (critique input) + greyscale test of the markers
  for (const id of ['TriageMarker', 'PacketLine', 'IncidentRow', 'HospitalCard', 'PreAlertCard', 'StatusBanner', 'SosButton', 'ReasonList']) {
    await page.locator(`#${id}`).screenshot({ path: path.join(OUT, `section-${id}.png`) });
  }
  await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });
  await page.locator('#TriageMarker').screenshot({ path: path.join(OUT, 'greyscale-TriageMarker.png') });
  await page.addStyleTag({ content: 'html { filter: grayscale(1) blur(4px) !important; }' });
  await page.locator('#IncidentRow').screenshot({ path: path.join(OUT, 'squint-IncidentRow.png') });
  await ctx.close();
}

// reduced motion: the arrival pulse must not animate
{
  const { ctx, page } = await open(1440, { theme: 'dark', locale: 'en', reducedMotion: true });
  const anim = await page.evaluate(() => [...document.querySelectorAll('.sellekni-pulse')].map((e) => getComputedStyle(e).animationName));
  if (anim.some((a) => a !== 'none')) defects.push({ check: 'reduced-motion', where: '1440 dark', detail: `pulse still animates: ${anim.join(',')}` });
  notes.push(`reduced motion: ${anim.length} pulse element(s), animation ${[...new Set(anim)].join(',')}`);
  await ctx.close();
}

// 200% text (browser zoom of text only): no page overflow, no clipped panels
for (const width of [360, 1440] as const) {
  const { ctx, page } = await open(width, { theme: 'light', locale: 'ar' });
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.waitForTimeout(300);
  await structural(page, `${width}px 200%-text ar`, width);
  if (width === 360) await page.screenshot({ path: path.join(OUT, 'text200-360-ar.jpg'), fullPage: false, type: 'jpeg', quality: 72 });
  await ctx.close();
}

await browser.close();
const report = { base: BASE, at: new Date().toISOString(), defects, notes };
writeFileSync(path.join(OUT, 'qa-report.json'), JSON.stringify(report, null, 2));
const by = defects.reduce<Record<string, number>>((m, d) => ((m[d.check] = (m[d.check] ?? 0) + 1), m), {});
console.log(`design-qa: ${defects.length} defect(s)`, by);
for (const n of notes) console.log(`  note: ${n}`);
process.exit(defects.length ? 1 : 0);
