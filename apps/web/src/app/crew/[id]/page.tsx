import type { Band } from '@sellekni/shared';
import { Activity, CircleAlert, CircleCheck, Clock, Gauge, HeartPulse, Link2Off, Phone, Send, ShieldCheck, Timer, Wind, type LucideIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { BrandLockup } from '@/components/ui/brand-mark';
import { Notice } from '@/components/ui/notice';
import { StatusBanner } from '@/components/ui/status-banner';
import { TriageMarker } from '@/components/ui/triage-marker';
import { WitnessEnhance } from '@/components/witness/witness-enhance';
import { LOCALES } from '@/i18n/config';
import { cn } from '@/lib/utils';
import { formatHHMM } from '@/server/domain';
import { CREW_RANGES, type CrewVitals } from '@/server/domain/crew';
import { env } from '@/server/env';
import { limited } from '@/server/http';
import { crewView } from '@/server/services/crew';
import { LIMITS } from '@/server/services/rate-limit';
import { senderHash } from '@/server/services/sender';

export const dynamic = 'force-dynamic';
// The token is in the URL: never send it to another site, never index the page.
export const metadata: Metadata = { referrer: 'no-referrer', robots: { index: false, follow: false } };

const FIELDS: ReadonlyArray<{ name: keyof CrewVitals; icon: LucideIcon }> = [
  { name: 'gcs', icon: Activity },
  { name: 'sbp', icon: Gauge },
  { name: 'spo2', icon: Wind },
  { name: 'hr', icon: HeartPulse },
  { name: 'etaMin', icon: Timer },
];
const ERRORS = ['empty', 'invalid', 'rate_limited', 'closed', 'expired'] as const;
const BANDS = ['R', 'O', 'Y', 'G', 'U'] as const;

/*
 * D9 crew page. Plain server-rendered form (works with JS off, with gloves: big number fields, one column);
 * <WitnessEnhance> only adds the offline notice and the double-submit guard when JS runs. No loading.tsx, for the
 * same reason as /w: a streamed Suspense boundary never reveals without JS.
 */
export default async function CrewPage({ params, searchParams }: PageProps<'/crew/[id]'>) {
  const { id } = await params;
  const sp = await searchParams;
  const k = typeof sp.k === 'string' ? sp.k : '';
  const t = await getTranslations('crewPage');
  const tb = await getTranslations('band');
  const tr = await getTranslations('reasons');
  const locale = await getLocale();
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';

  const tooMany = limited(`crew-page:${senderHash(`ip:${ip}`)}`, LIMITS.crewPagePerIp) !== null;
  const view = tooMany ? null : await crewView(id, k);
  const error = ERRORS.find((e) => e === sp.error);
  const sent = sp.sent === '1';
  const from = BANDS.find((b) => b === sp.from);
  const self = (q: string) => `/crew/${id}?k=${encodeURIComponent(k)}${q}`;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {env().DEMO_MODE && <StatusBanner mode="demo" />}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <BrandLockup />
        <nav aria-label="Language" className="flex gap-1">
          {LOCALES.map((l) => (
            <a key={l} href={`${self(sent ? `&sent=1${from ? `&from=${from}` : ''}` : '')}&lang=${l}`} lang={l} aria-current={l === locale ? 'true' : undefined}
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
          <Notice icon={Link2Off} tone="warn" title={t('invalid.title')} body={t('invalid.body')} testId="crew-invalid" />
        ) : view?.state === 'expired' ? (
          <Notice icon={Clock} tone="warn" title={t('expired.title')} body={t('expired.body')} testId="crew-expired" />
        ) : view?.state === 'closed' ? (
          <Notice icon={ShieldCheck} tone="info" title={t('closed.title')} body={t('closed.body')} testId="crew-closed" />
        ) : view?.state === 'open' ? (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-3xl font-semibold">{t('title')}</h1>
              <p className="flex flex-wrap items-center gap-3 text-lg">
                <span className="packet-ltr font-mono text-xl">{view.id}</span>
                <span className="inline-flex items-center gap-2" data-testid="crew-band" data-band={view.band}>
                  <TriageMarker band={view.band as Band} />
                  <span className="font-semibold">{tb(view.band as 'R')}</span>
                  <span className="packet-ltr font-display tabular-nums">{view.band}{String(view.nsi).padStart(2, '0')}</span>
                </span>
              </p>
              {view.reasons.length > 0 && (
                <p className="text-base text-muted-foreground">{view.reasons.slice(0, 3).map((r) => (tr.has(r.code) ? tr(r.code as 'dv', { value: view.dvKmh ?? '' }) : r.text)).join(' · ')}</p>
              )}
              <p className="text-sm text-muted-foreground">{t('disclaimer')}</p>
            </div>

            {sent && (
              <Notice icon={CircleCheck} tone="ok" testId="crew-sent"
                title={from && from !== view.band ? t('sent.changed', { from: tb(from), to: tb(view.band as 'R') }) : t('sent.title')}
                body={t('sent.body')} />
            )}
            {error && <Notice icon={CircleAlert} tone="danger" title={t(`error.${error}`)} role="alert" testId="crew-error" />}
            <WitnessEnhance offline={t('offline')} sending={t('sending')} formId="crew-form" testId="crew-offline" />

            <form method="post" action={`/api/crew/${id}?k=${encodeURIComponent(k)}`} id="crew-form"
              className="flex flex-col gap-4 rounded-md border border-line bg-surface p-4">
              <p className="text-base text-muted-foreground">{t('lead')}</p>
              {FIELDS.map(({ name, icon: Icon }) => {
                const [min, max] = CREW_RANGES[name];
                const last = view.last[name];
                return (
                  <label key={name} className="flex flex-col gap-1.5">
                    <span className="flex items-center gap-2 text-lg font-semibold">
                      <Icon aria-hidden className="size-6 text-brand-text" />
                      {t(`field.${name}`)}
                      <span className="text-sm font-normal text-muted-foreground">{t(`unit.${name}`)}</span>
                    </span>
                    <input type="number" name={name} inputMode="numeric" min={min} max={max} step={1} data-testid={`crew-${name}`}
                      className="packet-ltr min-h-16 w-full rounded-md border-2 border-line bg-bg px-4 font-display text-3xl tabular-nums focus-visible:border-brand-fill focus-visible:outline-none" />
                    <span className="text-sm text-muted-foreground">
                      {t('range', { min, max })}
                      {last !== undefined && <> · {t('last', { value: last })}</>}
                    </span>
                  </label>
                );
              })}
              <button type="submit" data-testid="crew-send"
                className="inline-flex min-h-16 items-center justify-center gap-3 rounded-lg bg-brand-fill px-5 text-xl font-semibold text-on-brand disabled:opacity-60">
                <Send aria-hidden className="size-6 rtl:-scale-x-100" />
                {t('send')}
              </button>
              <p className="text-sm text-muted-foreground">{t('expires', { time: formatHHMM(view.expiresAt).replace(/^(..)/, '$1:') })}</p>
            </form>
          </>
        ) : null}

        <a href="tel:14" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 border-line px-4 text-lg font-medium">
          <Phone aria-hidden className="size-5" />
          {t('callButton')}
        </a>
      </main>
    </div>
  );
}
