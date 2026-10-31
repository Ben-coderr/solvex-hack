'use client';
import { Ambulance, Hospital, MessageSquareText, Smartphone, UserRoundPlus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AppHeader } from '@/components/dispatch/app-header';
import { Button } from '@/components/ui/button';
import { PacketLine } from '@/components/ui/packet';
import { EmptyState } from '@/components/ui/states';
import { StatusBanner } from '@/components/ui/status-banner';
import { hhmm } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DemoControls } from './demo-controls';
import { LatestIncident } from './latest-incident';
import { Stopwatch, useStopwatch } from './stopwatch';
import { useDemoPhones, useDemoRun, useOutcomeText, type DemoPhones } from './use-demo';

function Phone({ title, icon: Icon, children, testId }: { title: string; icon: typeof Smartphone; children: ReactNode; testId: string }) {
  return (
    <section aria-label={title} data-testid={testId}
      className="flex h-[44rem] w-full max-w-[21rem] flex-col overflow-hidden rounded-[2rem] border-4 border-line bg-bg shadow-sm">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-5 py-3 text-base font-semibold">
        <Icon aria-hidden className="size-5 text-brand-text" />
        {title}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function SmsList({ sms, empty, testId }: { sms: DemoPhones['sms']; empty: string; testId: string }) {
  const t = useTranslations('demo.phone');
  if (sms.length === 0) return <EmptyState className="m-4" icon={MessageSquareText} title={empty} />;
  return (
    <ol className="flex flex-col gap-3 overflow-y-auto p-4" data-testid={testId}>
      {sms.map((m, i) => (
        <li key={m.id} className={cn('flex flex-col gap-1 rounded-lg border bg-surface p-3', i === 0 ? 'border-brand-fill' : 'border-line')}>
          <span className="packet-ltr break-words font-mono text-sm">{m.body}</span>
          <span className="text-xs text-muted-foreground">
            <span className="packet-ltr">{hhmm(m.created_at)}</span> · {t.has(`smsStatus.${m.status}`) ? t(`smsStatus.${m.status}` as 'smsStatus.sent') : m.status}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** D11 /phones: the stage's virtual phones side by side (driver, witness, crew, hospital SMS), fed by the real server. */
export function Phones() {
  const t = useTranslations('demo');
  const sw = useStopwatch();
  const q = useDemoPhones();
  const run = useDemoRun();
  const outcome = useOutcomeText();
  const d = q.data;
  const toDriver = (d?.sms ?? []).filter((m) => m.purpose === 'ack');
  const toHospital = (d?.sms ?? []).filter((m) => m.purpose === 'prealert' || m.purpose === 'crew_update');

  return (
    <div className="flex min-h-dvh flex-col">
      <StatusBanner mode="demo" className="sticky top-0 z-20" />
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-3xl font-semibold">{t('phonesTitle')}</h1>
          <Link href="/demo" className="inline-flex min-h-12 items-center rounded-md border border-line px-4 text-base hover:bg-raised">{t('open.demo')}</Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
          <Stopwatch sw={sw} compact />
          <LatestIncident q={q} />
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          <Phone title={t('phone.driver')} icon={Smartphone} testId="phone-driver">
            <StatusBanner mode="replay" />
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <p className="text-sm text-muted-foreground">{t('phone.driverHint')}</p>
              {(['rollover', 'frontal'] as const).map((s) => (
                <Button key={s} size="lg" className="h-auto min-h-14 whitespace-normal" disabled={run.isPending} data-testid={`phone-driver-${s}`}
                  onClick={() => { sw.start(); run.mutate({ scenario: s }); }}>
                  {t(`scenario.${s}`)}
                </Button>
              ))}
              <p role="status" aria-live="polite" className="min-h-6 text-base">{run.data && outcome(run.data.ack)}</p>
              <h2 className="text-sm font-medium text-muted-foreground">{t('phone.lastPacket')}</h2>
              {d?.lastPacket ? <PacketLine wire={d.lastPacket.raw} chipsCopyable={false} /> : <p className="text-base text-muted-foreground">{t('phone.noPacket')}</p>}
              <h2 className="text-sm font-medium text-muted-foreground">{t('phone.ackSms')}</h2>
              {toDriver.length > 0
                ? <p className="packet-ltr rounded-lg border border-line bg-surface p-3 font-mono text-sm">{toDriver[0]!.body}</p>
                : <p className="text-base text-muted-foreground">{t('phone.noSms')}</p>}
            </div>
          </Phone>

          <Phone title={t('phone.witness')} icon={UserRoundPlus} testId="phone-witness">
            {d?.witness ? (
              // same-origin page in an iframe: exactly what the witness's phone shows
              <iframe key={d.witness.url} src={d.witness.url} title={t('phone.witness')} className="min-h-0 w-full flex-1 border-0" />
            ) : (
              <EmptyState className="m-4" icon={UserRoundPlus} title={t('phone.witnessEmpty')} />
            )}
            <div className="border-t border-line p-3">
              <Button variant="outline" className="w-full" disabled={run.isPending || !d?.latest} onClick={() => run.mutate({ action: 'witness' })}>
                {t('phone.simulateWitness')}
              </Button>
            </div>
          </Phone>

          <Phone title={t('phone.crew')} icon={Ambulance} testId="phone-crew">
            {d?.crew ? (
              // the real crew page (signed 12 h link), as the paramedic's phone shows it
              <iframe key={d.crew.url} src={d.crew.url} title={t('phone.crew')} className="min-h-0 w-full flex-1 border-0" />
            ) : (
              <EmptyState className="m-4" icon={Ambulance} title={t('phone.crewEmpty')} />
            )}
            <div className="border-t border-line p-3">
              <Button variant="outline" className="w-full" disabled={run.isPending || !d?.latest} data-testid="phone-crew-simulate"
                onClick={() => run.mutate({ action: 'crew' })}>
                {t('phone.simulateCrew')}
              </Button>
            </div>
          </Phone>

          <Phone title={t('phone.hospital')} icon={Hospital} testId="phone-hospital">
            <SmsList sms={toHospital} empty={t('phone.hospitalEmpty')} testId="hospital-sms" />
          </Phone>
        </div>

        <DemoControls compact onStart={sw.start} />
      </main>
    </div>
  );
}
