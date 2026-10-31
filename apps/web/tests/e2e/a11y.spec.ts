import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { closeOpened, DISPATCHER, HOSPITAL_A, HOSPITAL_A_ID, PASSWORD, track } from './helpers';

/**
 * P7 accessibility pass on the real screens (docs/06 §7): axe WCAG 2.1 A/AA (contrast, names, labels), touch targets,
 * RTL direction + no positive tabindex (screen-reader order = DOM order), reduced motion, 200 % text.
 * Every check runs in en/light and ar/dark. Needs DEMO_MODE=true and a running app.
 */

type Variant = { locale: 'en' | 'ar'; theme: 'light' | 'dark' };
const VARIANTS: Variant[] = [{ locale: 'en', theme: 'light' }, { locale: 'ar', theme: 'dark' }];

test.beforeAll(() => {
  expect(PASSWORD, 'DEMO_USER_PASSWORD must be set in .env.local').not.toBe('');
});
test.afterEach(closeOpened); // also on failure, when the test's own ctx.close() is never reached

async function context(browser: Browser, v: Variant, width: number, reducedMotion: 'reduce' | 'no-preference' = 'reduce') {
  const ctx = track(await browser.newContext({ viewport: { width, height: 900 }, colorScheme: v.theme, reducedMotion }));
  const base = test.info().project.use.baseURL!;
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: v.locale, url: base }, { name: 'sellekni-theme', value: v.theme, url: base }]);
  return ctx;
}

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Everything one screen must pass. `minTarget`: 48 px on phone-sized pages (docs/06 §7), 24 px (WCAG 2.5.8 AA) on the mouse-driven desktop screens. */
async function audit(page: Page, where: string, v: Variant, minTarget: number) {
  await page.evaluate(() => document.fonts.ready);
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('.maplibregl-canvas') // the map canvas: pins are mirrored by the labelled queue rows
    .analyze();
  const violations = axe.violations.map((x) => `${x.id} (${x.impact}): ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(violations, `${where} axe`).toEqual([]);

  const r = await page.evaluate((min) => {
    const small = [...document.querySelectorAll<HTMLElement>('button, a[href], input:not([type=hidden]), select, [role=button], [role=radio], [role=checkbox]')]
      .filter((el) => !el.closest('.maplibregl-ctrl-attrib, [data-a11y-inline]')) // attribution and inline text links (WCAG 2.5.8 exception)
      .map((el) => {
        // a radio/checkbox counts with its label (the label is the target)
        const box = (el.closest('label') ?? el).getBoundingClientRect();
        return { el, box };
      })
      .filter(({ el, box }) => box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden' && (box.height < min || box.width < min))
      .map(({ el, box }) => `"${(el.getAttribute('aria-label') ?? el.textContent ?? el.getAttribute('name') ?? '').trim().slice(0, 30)}" ${Math.round(box.width)}×${Math.round(box.height)}`);
    const positiveTabindex = [...document.querySelectorAll<HTMLElement>('[tabindex]')].filter((el) => el.tabIndex > 0).length;
    const running = document.getAnimations().filter((a) => a.playState === 'running' && Number(a.effect?.getTiming().duration ?? 0) > 1).length;
    return { small: [...new Set(small)], positiveTabindex, dir: document.documentElement.dir, lang: document.documentElement.lang, running };
  }, minTarget);
  expect(r.small, `${where} targets < ${minTarget}px`).toEqual([]);
  expect(r.positiveTabindex, `${where} tabindex > 0 breaks the reading order`).toBe(0);
  expect(r.dir, `${where} dir`).toBe(v.locale === 'ar' ? 'rtl' : 'ltr');
  expect(r.lang, `${where} lang`).toBe(v.locale);
  expect(r.running, `${where} animations still running with prefers-reduced-motion`).toBe(0);
}

/** 200 % text (WCAG 1.4.4): root font size doubled, no sideways scroll on a phone-width page. */
async function text200(page: Page, where: string) {
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${where} at 200 % text scrolls sideways`).toBeLessThanOrEqual(1);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
}

for (const v of VARIANTS) {
  test(`a11y ${v.locale}/${v.theme}: dispatcher dashboard + drawer, audit, /demo, /phones`, async ({ browser }) => {
    const ctx = await context(browser, v, 1440);
    const d = await ctx.newPage();
    await signIn(d, DISPATCHER);
    expect((await d.request.post('/api/demo/reset')).ok()).toBe(true);
    const { ack } = (await (await d.request.post('/api/demo/replay', { data: { scenario: 'rollover' } })).json()) as { ack: { incident_id: string } };
    await d.goto('/');
    await expect(d.getByTestId(`row-${ack.incident_id}`)).toBeVisible();
    await audit(d, 'dashboard', v, 24);
    await d.getByTestId(`row-${ack.incident_id}`).click();
    await expect(d.getByTestId('drawer')).toBeVisible();
    await expect(d.getByTestId('orientation').getByTestId(/^hospital-/).first()).toBeVisible();
    await audit(d, 'drawer', v, 24);
    await d.goto(`/audit?incident=${ack.incident_id}`);
    await expect(d.getByTestId('audit-table')).toBeVisible();
    await audit(d, 'audit', v, 24);
    await d.goto('/demo');
    await expect(d.getByTestId('stopwatch')).toBeVisible();
    await audit(d, '/demo', v, 24);
    await d.goto('/phones');
    await expect(d.getByTestId('phone-driver')).toBeVisible();
    await audit(d, '/phones', v, 24);
    await ctx.close();
  });

  test(`a11y ${v.locale}/${v.theme}: hospital ED view with a pre-alert`, async ({ browser }) => {
    const dctx = await context(browser, v, 1440);
    const d = await dctx.newPage();
    await signIn(d, DISPATCHER);
    expect((await d.request.post('/api/demo/reset')).ok()).toBe(true);
    const { ack } = (await (await d.request.post('/api/demo/replay', { data: { scenario: 'rollover' } })).json()) as { ack: { incident_id: string } };
    expect((await d.request.post(`/api/incidents/${ack.incident_id}/prealert`, { data: { hospital_id: HOSPITAL_A_ID } })).ok()).toBe(true);
    for (const width of [1440, 360]) {
      const ctx = await context(browser, v, width);
      const h = await ctx.newPage();
      await signIn(h, HOSPITAL_A);
      await expect(h.getByTestId(`incoming-${ack.incident_id}`)).toBeVisible();
      await audit(h, `hospital ${width}`, v, width < 768 ? 48 : 24);
      if (width === 360) await text200(h, 'hospital 360');
      await ctx.close();
    }
    await dctx.close();
  });

  test(`a11y ${v.locale}/${v.theme}: public phone pages — login, witness, crew (360 px, 48 px targets, 200 % text)`, async ({ browser }) => {
    const dctx = await context(browser, v, 1440);
    const d = await dctx.newPage();
    await signIn(d, DISPATCHER);
    expect((await d.request.post('/api/demo/reset')).ok()).toBe(true);
    await d.request.post('/api/demo/replay', { data: { scenario: 'rollover' } });
    const { witness, crew } = (await (await d.request.get('/api/demo/phones')).json()) as { witness: { url: string }; crew: { url: string } };

    const ctx = await context(browser, v, 360);
    const p = await ctx.newPage();
    await p.goto('/login');
    await audit(p, 'login 360', v, 48);
    await text200(p, 'login 360');
    await p.goto(witness.url);
    await expect(p.getByTestId('witness-send')).toBeVisible();
    await audit(p, 'witness', v, 48);
    await text200(p, 'witness');
    await p.goto(crew.url);
    await expect(p.getByTestId('crew-send')).toBeVisible();
    await audit(p, 'crew', v, 48);
    await text200(p, 'crew');
    await ctx.close();
    await dctx.close();
  });
}
