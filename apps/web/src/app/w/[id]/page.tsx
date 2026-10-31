import {
  Baby, Bike, Bus, Car, CircleAlert, CircleCheck, Droplet, Flame, Link2Off, Lock, MapPin, Phone, PersonStanding, Send,
  ShieldCheck, Truck, TriangleAlert, UserX, Users, Wind, type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { Notice } from '@/components/ui/notice';
import { StatusBanner } from '@/components/ui/status-banner';
import { BrandLockup } from '@/components/ui/brand-mark';
import { WitnessEnhance } from '@/components/witness/witness-enhance';
import { LOCALES } from '@/i18n/config';
import { cn } from '@/lib/utils';
import { WITNESS_DANGERS, WITNESS_KINDS, WITNESS_STATES } from '@/server/domain/witness';
import { env } from '@/server/env';
import { limited } from '@/server/http';
import { LIMITS } from '@/server/services/rate-limit';
import { senderHash } from '@/server/services/sender';
import { witnessView } from '@/server/services/witness';

export const dynamic = 'force-dynamic';
// The token is in the URL: never send it to another site (map link), never index the page.
export const metadata: Metadata = { referrer: 'no-referrer', robots: { index: false, follow: false } };

const KIND_ICON: Record<(typeof WITNESS_KINDS)[number], LucideIcon> = {
  car: Car, moto: Bike, truck: Truck, bus: Bus, pedestrian: PersonStanding,
};
const STATE_ICON: Record<(typeof WITNESS_STATES)[number], LucideIcon> = { unresponsive: UserX, breathing: Wind, bleeding: Droplet };
const DANGER_ICON: Record<(typeof WITNESS_DANGERS)[number], LucideIcon> = { trapped: Lock, fire: Flame, child: Baby };
const ERRORS = ['confirm_place', 'invalid', 'rate_limited', 'closed'] as const;

/*
 * D10 witness page. Plain server-rendered HTML form (works with JS off and on old Android browsers);
 * <WitnessEnhance> only adds the offline notice and the double-submit guard when JS runs.
 * NO loading.tsx here: it makes Next stream the page behind a Suspense boundary that only JS reveals, so a
 * browser without JS stays on the skeleton forever (caught by the e2e old-phone test). The browser's own spinner is the loading state.
 * Shows a ~100 m position and nothing about the victims (docs/11 #4).
 */
export default async function WitnessPage({ params, searchParams }: PageProps<'/w/[id]'>) {
  const { id } = await params;
  const sp = await searchParams;
  const k = typeof sp.k === 'string' ? sp.k : '';
  const t = await getTranslations('witnessPage');
  const locale = await getLocale();
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';

  const tooMany = limited(`witness-page:${senderHash(`ip:${ip}`)}`, LIMITS.witnessPagePerIp) !== null;
  const view = tooMany ? null : await witnessView(id, k);
  const error = ERRORS.find((e) => e === sp.error);
  const sent = sp.sent === '1';
  const self = (q: string) => `/w/${id}?k=${encodeURIComponent(k)}${q}`;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {env().DEMO_MODE && <StatusBanner mode="demo" />}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <BrandLockup />
        {/* plain links: switching language works without JS (the proxy stores ?lang= in the cookie) */}
        <nav aria-label="Language" className="flex gap-1">
          {LOCALES.map((l) => (
            <a key={l} href={`${self(sent ? '&sent=1' : '')}&lang=${l}`} lang={l} aria-current={l === locale ? 'true' : undefined}
              className={cn('inline-flex min-h-12 min-w-12 items-center justify-center rounded-pill px-3 text-sm',
                l === locale ? 'bg-brand-fill text-on-brand' : 'border border-line')}>
              {{ ar: 'عربي', fr: 'FR', en: 'EN' }[l]}
            </a>
          ))}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5">
        {tooMany ? (
          <Notice icon={CircleAlert} tone="warn" title={t('slow')} />
        ) : view?.state === 'invalid' ? (
          <Notice icon={Link2Off} tone="warn" title={t('invalid.title')} body={t('invalid.body')} />
        ) : view?.state === 'closed' ? (
          <Notice icon={ShieldCheck} tone="info" title={t('closed.title')} body={t('closed.body')} />
        ) : sent ? (
          <>
            <Notice icon={CircleCheck} tone="ok" title={t('sent.title')} body={t('sent.body')} testId="witness-sent" />
            <section aria-labelledby="safety-h" className="flex flex-col gap-3 rounded-md border-2 border-status-warn bg-surface p-4">
              <h2 id="safety-h" className="flex items-center gap-2 text-lg font-semibold">
                <TriangleAlert aria-hidden className="size-6 text-status-warn" />
                {t('sent.safety')}
              </h2>
              <ol className="flex list-decimal flex-col gap-2 ps-6 text-lg">
                <li>{t('sent.s1')}</li>
                <li className="font-semibold">{t('sent.s2')}</li>
                <li>{t('sent.s3')}</li>
                <li>{t('sent.s4')}</li>
              </ol>
            </section>
            <a href={self('')} className="text-base text-brand-text underline underline-offset-4">{t('sent.another')}</a>
          </>
        ) : view?.state === 'open' ? (
          <>
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-3xl font-semibold">{t('title')}</h1>
              <p className="text-lg text-muted-foreground">{t('lead')}</p>
            </div>
            {error && <Notice icon={CircleAlert} tone="danger" title={t(`error.${error}`)} role="alert" testId="witness-error" />}
            <WitnessEnhance offline={t('offline')} sending={t('sending')} />

            <form method="post" action={`/api/witness/${id}?k=${encodeURIComponent(k)}`} id="witness-form" className="flex flex-col gap-5">
              <Step n={1} icon={Car} title={t('vehicles')}>
                <Question label={t('howMany')}>
                  {[1, 2, 3].map((n) => (
                    <Choice key={n} type="radio" name="vehicles" value={String(n)} defaultChecked={n === 1} required>
                      <span className="packet-ltr font-display text-2xl">{n === 3 ? t('plus', { n }) : n}</span>
                    </Choice>
                  ))}
                </Question>
                <Question label={t('whichKinds')}>
                  {WITNESS_KINDS.map((kd) => (
                    <Choice key={kd} type="checkbox" name="kinds" value={kd} icon={KIND_ICON[kd]} defaultChecked={kd === 'car'}>{t(`kind.${kd}`)}</Choice>
                  ))}
                </Question>
              </Step>

              <Step n={2} icon={Users} title={t('hurt')}>
                <Question label={t('howManyHurt')}>
                  {[0, 1, 2, 3].map((n) => (
                    <Choice key={n} type="radio" name="hurt" value={String(n)} required>
                      {n === 0 ? t('none') : <span className="packet-ltr font-display text-2xl">{n === 3 ? t('plus', { n }) : n}</span>}
                    </Choice>
                  ))}
                </Question>
                <Question label={t('theyAre')}>
                  {WITNESS_STATES.map((s) => (
                    <Choice key={s} type="checkbox" name="state" value={s} icon={STATE_ICON[s]}>{t(`state.${s}`)}</Choice>
                  ))}
                </Question>
              </Step>

              <Step n={3} icon={TriangleAlert} title={t('danger')}>
                <Question label={t('danger')} hideLabel>
                  {WITNESS_DANGERS.map((d) => (
                    <Choice key={d} type="checkbox" name="danger" value={d} icon={DANGER_ICON[d]}>{t(`dangers.${d}`)}</Choice>
                  ))}
                </Question>
              </Step>

              <Step n={4} icon={MapPin} title={t('location')}>
                <p className="text-base text-muted-foreground">{t('near')}</p>
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="packet-ltr font-mono text-xl" data-testid="witness-coarse">{view.lat.toFixed(3)}, {view.lon.toFixed(3)}</span>
                  <span className="text-sm text-muted-foreground">({t('approx')})</span>
                </p>
                <a target="_blank" rel="noreferrer noopener" className="text-base text-brand-text underline underline-offset-4"
                  href={`https://www.openstreetmap.org/?mlat=${view.lat}&mlon=${view.lon}#map=16/${view.lat}/${view.lon}`}>
                  {t('map')}
                </a>
                <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-md border-2 border-line p-3 text-lg has-checked:border-brand-fill">
                  <input type="checkbox" name="here" value="yes" required className="size-6 shrink-0 accent-[var(--color-brand-fill)]" />
                  {t('here')}
                </label>
              </Step>

              <button type="submit" data-testid="witness-send"
                className="inline-flex min-h-16 items-center justify-center gap-3 rounded-lg bg-brand-fill px-5 text-xl font-semibold text-on-brand disabled:opacity-60">
                <Send aria-hidden className="size-6 rtl:-scale-x-100" />
                {t('send')}
              </button>
              <p className="text-sm text-muted-foreground">{t('privacy')}</p>
            </form>
          </>
        ) : null}

        <a href="tel:14" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 border-line px-4 text-lg font-medium">
          <Phone aria-hidden className="size-5" />
          {t('callButton')}
        </a>
        <p className="text-sm text-muted-foreground">{t('call')}</p>
      </main>
    </div>
  );
}

function Step({ n, icon: Icon, title, children }: { n: number; icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <legend className="flex items-center gap-2 px-1 text-xl font-semibold">
        <span className="packet-ltr grid size-9 place-items-center rounded-full bg-text font-display text-lg text-bg">{n}</span>
        <Icon aria-hidden className="size-6 text-brand-text" />
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Question({ label, hideLabel, children }: { label: string; hideLabel?: boolean; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      {!hideLabel && <p className="text-base text-muted-foreground">{label}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/** A big tap target with the native control visible (old browsers render it even when the CSS does not load). */
function Choice({ type, name, value, icon: Icon, defaultChecked, required, children }: {
  type: 'radio' | 'checkbox'; name: string; value: string; icon?: LucideIcon; defaultChecked?: boolean; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-14 min-w-16 cursor-pointer items-center gap-2 rounded-md border-2 border-line px-3 py-2 text-lg has-checked:border-brand-fill has-checked:bg-raised has-checked:font-semibold">
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} required={required}
        className="size-5 shrink-0 accent-[var(--color-brand-fill)]" />
      {Icon && <Icon aria-hidden className="size-6 shrink-0" />}
      <span>{children}</span>
    </label>
  );
}
