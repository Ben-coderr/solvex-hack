'use client';
import { ExternalLink, LayoutDashboard, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AppHeader } from '@/components/dispatch/app-header';
import { StatusBanner } from '@/components/ui/status-banner';
import { DemoControls } from './demo-controls';
import { LatestIncident } from './latest-incident';
import { Stopwatch, useStopwatch } from './stopwatch';
import { useDemoPhones } from './use-demo';

/** D11 /demo: stage controls, Reset (verified clean), stopwatch, and the witness QR for the second phone. */
export function DemoConsole() {
  const t = useTranslations('demo');
  const sw = useStopwatch();
  const q = useDemoPhones();
  const w = q.data?.witness;
  return (
    <div className="flex min-h-dvh flex-col">
      <StatusBanner mode="demo" className="sticky top-0 z-20" />
      <AppHeader />
      <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-3xl font-semibold">{t('title')}</h1>
            <p className="text-base text-muted-foreground">{t('lead')}</p>
          </div>
          <Stopwatch sw={sw} />
          <DemoControls onStart={sw.start} />
        </div>
        <aside className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t('latest')}</h2>
          <LatestIncident q={q} />
          {w && (
            <section aria-labelledby="qr-h" className="flex flex-col gap-2 rounded-md border border-line bg-surface p-4">
              <h2 id="qr-h" className="text-base font-medium">{t('witnessQr')}</h2>
              <div role="img" aria-label={t('witnessQr')} data-testid="demo-witness-qr"
                className="aspect-square w-full max-w-72 rounded-md bg-white p-3 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: w.svg }} />
              <a href={w.url} target="_blank" rel="noreferrer" data-testid="demo-witness-url"
                className="packet-ltr inline-flex items-center gap-1 break-all font-mono text-xs text-brand-text underline-offset-4 hover:underline">
                {w.url} <ExternalLink aria-hidden className="size-3.5 shrink-0" />
              </a>
            </section>
          )}
          <nav className="flex flex-wrap gap-2">
            <Link href="/" className="inline-flex min-h-12 items-center gap-2 rounded-md border border-line px-4 text-base hover:bg-raised"><LayoutDashboard aria-hidden className="size-4" />{t('open.dashboard')}</Link>
            <Link href="/phones" className="inline-flex min-h-12 items-center gap-2 rounded-md border border-line px-4 text-base hover:bg-raised"><Smartphone aria-hidden className="size-4" />{t('open.phones')}</Link>
          </nav>
        </aside>
      </main>
    </div>
  );
}
