'use client';
import { NextIntlClientProvider } from 'next-intl';
import { useState, type ReactNode } from 'react';
import type { Band } from '@najda/shared';
import { BAND_ORDER, type LifecycleStep } from '@najda/ui-core';
import type { Locale } from '@/i18n/config';
import { MESSAGES } from '@/i18n/messages';
import { ChannelBadge, type Channel, type ChannelStatus } from '@/components/ui/channel-badge';
import { HospitalCard } from '@/components/ui/hospital-card';
import { IncidentRow } from '@/components/ui/incident-row';
import { LifecycleBar } from '@/components/ui/lifecycle-bar';
import { LocaleSwitch } from '@/components/ui/locale-switch';
import { PacketLine } from '@/components/ui/packet';
import { PreAlertCard } from '@/components/ui/prealert-card';
import { ReasonList } from '@/components/ui/reason-list';
import { CountdownRing, GoldenRing } from '@/components/ui/rings';
import { SosButton } from '@/components/ui/sos-button';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { StatusBanner, type ConnectivityMode } from '@/components/ui/status-banner';
import { TriageMarker } from '@/components/ui/triage-marker';
import { WitnessStepper } from '@/components/ui/witness-stepper';

// ── fixtures: canonical packets (docs/05 §1.2) and the ranking worked example (docs/05 §5.1). Synthetic. ──
const NOW = new Date('2026-10-30T13:40:00Z'); // frozen clock: deterministic screenshots
const EX1 = 'NAJDA1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF #04';
const EX2 = 'NAJDA1 P3N8D Y44M 35.69112,-0.63305 T0915 SW V1 P2 KCP FXC 8C7XM9R8+CQ #55';
const BAD = EX1.replace('#04', '#05');
const R_REASONS = [{ code: 'dv', points: 30 }, { code: 'spo2_low', points: 20 }, { code: 'rollover', points: 15 }];
const REQ_R_N = ['ed24', 'trauma_surgery', 'ct', 'icu', 'neurosurgery'] as const;
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

type Theme = 'light' | 'dark';
const PANELS: ReadonlyArray<{ locale: Locale; theme: Theme }> = [
  { locale: 'en', theme: 'light' }, { locale: 'en', theme: 'dark' },
  { locale: 'ar', theme: 'light' }, { locale: 'ar', theme: 'dark' },
];

function Panel({ locale, theme, children }: { locale: Locale; theme: Theme; children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Africa/Algiers">
      <div data-theme={theme} lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}
        className="flex min-w-0 flex-col gap-4 rounded-md border border-line bg-bg p-4 text-text" data-panel={`${locale}-${theme}`}>
        <span className="packet-ltr self-start font-mono text-xs text-muted-foreground">{locale} · {theme} · {locale === 'ar' ? 'rtl' : 'ltr'}</span>
        {children}
      </div>
    </NextIntlClientProvider>
  );
}

function Section({ id, title, note, children, wide }: { id: string; title: string; note?: string; children: () => ReactNode; wide?: boolean }) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-3" aria-labelledby={`${id}-h`}>
      <div>
        <h2 id={`${id}-h`} className="font-mono text-xl font-semibold">{title}</h2>
        {note && <p className="max-w-3xl text-sm text-muted-foreground">{note}</p>}
      </div>
      <div className={wide ? 'grid grid-cols-1 gap-3 xl:grid-cols-2' : 'grid grid-cols-1 gap-3 md:grid-cols-2'}>
        {PANELS.map((p) => <Panel key={`${p.locale}-${p.theme}`} {...p}>{children()}</Panel>)}
      </div>
    </section>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <span className="packet-ltr font-mono text-xs text-muted-foreground">{children}</span>
);

const SECTIONS = [
  'TriageMarker', 'PacketLine', 'GoldenRing', 'CountdownRing', 'SosButton', 'ChannelBadge', 'ReasonList', 'IncidentRow',
  'HospitalCard', 'LifecycleBar', 'PreAlertCard', 'WitnessStepper', 'StatusBanner', 'LocaleSwitch', 'States',
] as const;

export function Styleguide() {
  const [sel, setSel] = useState('K7Q2M');
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-10 px-4 py-8 wrap-anywhere">
      <header className="flex flex-col gap-3">
        <StatusBanner mode="demo" className="rounded-md border" />
        <h1 className="font-display text-4xl font-semibold wrap-anywhere">NAJDA — styleguide</h1>
        <p className="max-w-3xl text-base text-muted-foreground">
          Every design-system component in every state, in light and dark, English (LTR) and Arabic (RTL). Synthetic data; facility names are illustrative. Clock frozen at 14:40 local for stable screenshots.
        </p>
        <nav aria-label="Components" className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => <a key={s} href={`#${s}`} className="inline-flex min-h-12 items-center rounded-pill border border-line px-4 font-mono text-sm hover:border-brand-fill">{s}</a>)}
        </nav>
      </header>

      <Section id="TriageMarker" title="TriageMarker" note="Shape + letter + colour. 2 px ink outline on light (token triageOutline). Sizes row 20 / pin 32 / hero 64; selected; arrival pulse (off under reduced motion).">
        {() => (
          <div className="flex flex-col gap-4">
            {(['row', 'pin', 'hero'] as const).map((size) => (
              <div key={size} className="flex flex-wrap items-center gap-4">
                <Label>{size}</Label>
                {BAND_ORDER.map((b: Band) => <TriageMarker key={b} band={b} size={size} />)}
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-4">
              <Label>selected · pulsing</Label>
              <TriageMarker band="R" size="pin" selected />
              <TriageMarker band="O" size="pin" pulsing />
            </div>
          </div>
        )}
      </Section>

      <Section id="PacketLine" wide title="PacketLine / PacketChip" note="The real text that travels (packet-as-UI). Counter, GSM-7 badge, copy. Always LTR, even inside Arabic. States: ok · bad CRC (suspect + invalid chip) · unreadable.">
        {() => (
          <div className="flex flex-col gap-5">
            <PacketLine wire={EX1} />
            <PacketLine wire={EX2} />
            <PacketLine wire={BAD} />
            <PacketLine wire="accident RN1 sortie 12 vite" />
          </div>
        )}
      </Section>

      <Section id="GoldenRing" title="GoldenRing" note="Minutes since impact over the first hour; ticks at 10 / 30 / 60. Brand colour, never a triage hue.">
        {() => (
          <div className="flex flex-wrap items-center gap-5">
            {[3, 18, 42, 75].map((m) => <GoldenRing key={m} elapsedMin={m} />)}
            <GoldenRing elapsedMin={22} paused />
            <GoldenRing elapsedMin={9} size={96} />
          </div>
        )}
      </Section>

      <Section id="CountdownRing" title="CountdownRing" note="30 s drain; last 5 s: thicker, full-contrast ring and 'sending'.">
        {() => (
          <div className="flex flex-wrap items-center gap-5">
            <CountdownRing remaining={27} size={180} />
            <CountdownRing remaining={4} size={180} />
          </div>
        )}
      </Section>

      <Section id="SosButton" title="SosButton" note="Hold 1.5 s to confirm (try it). States: idle · holding (60%) · sending · sent. 128 px, brand fill (never red).">
        {() => (
          <div className="flex flex-wrap items-center gap-4">
            <SosButton />
            <SosButton previewProgress={0.6} />
            <SosButton state="sending" />
            <SosButton state="sent" />
          </div>
        )}
      </Section>

      <Section id="ChannelBadge" title="ChannelBadge" note="Channel × delivery status. Icon + word; status colours are not triage colours.">
        {() => (
          <div className="flex flex-col gap-2">
            {(['https', 'sms', 'paste', 'witness', 'sim'] as Channel[]).map((c) => (
              <div key={c} className="flex flex-wrap gap-2">
                <ChannelBadge channel={c} />
                {(['sent', 'retrying', 'acked', 'failed'] as ChannelStatus[]).map((s) => <ChannelBadge key={s} channel={c} status={s} />)}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section id="ReasonList" title="ReasonList + ConfidencePill" note="Top-3 reasons with points, confidence H/M/L, mechanism cap note, and the fixed disclaimer. Empty: no reasons yet.">
        {() => (
          <div className="flex flex-col gap-6">
            <ReasonList reasons={R_REASONS} conf="H" values={{ dv: 71 }} />
            <ReasonList reasons={[{ code: 'trapped', points: 15 }, { code: 'child', points: 10 }, { code: 'vulnerable_user', points: 10 }]} conf="M"
              capNote={undefined} />
            <ReasonList reasons={[]} conf="L" />
          </div>
        )}
      </Section>

      <Section id="IncidentRow" title="IncidentRow" note="Queue line: band, id, age, channel, unconfirmed auto, merged ×N, status. Selected · new (pulse).">
        {() => (
          <div className="overflow-hidden rounded-md border border-line">
            <IncidentRow id="K7Q2M" band="R" nsi={80} conf="H" crashedAt={ago(8)} channel="sms" status="ACKNOWLEDGED" mergedCount={2} selected={sel === 'K7Q2M'} now={NOW} onSelect={setSel} />
            <IncidentRow id="A1B2C" band="O" nsi={52} conf="M" crashedAt={ago(0.7)} channel="https" status="RECEIVED" unconfirmed isNew now={NOW} onSelect={setSel} selected={sel === 'A1B2C'} />
            <IncidentRow id="P3N8D" band="Y" nsi={44} conf="M" crashedAt={ago(26)} channel="witness" status="DISPATCHED" now={NOW} onSelect={setSel} selected={sel === 'P3N8D'} />
            <IncidentRow id="Z9X8W" band="U" nsi={15} conf="L" crashedAt={ago(131)} channel="paste" status="RECEIVED" now={NOW} onSelect={setSel} selected={sel === 'Z9X8W'} />
          </div>
        )}
      </Section>

      <Section id="HospitalCard" wide title="HospitalCard" note="docs/05 §5.1: band R + N. CHU-A ranks first through the capability gate; EPH-B is closer but misses ICU/neurosurgery and is tagged nearest ED. ETAs are haversine estimates here.">
        {() => (
          <div className="flex flex-col gap-3">
            <HospitalCard rank={1} gate name="CHU A" level="A" etaMin={24} etaEstimated score={0.76} required={REQ_R_N} missing={[]} status="UNKNOWN" statusAgeH={null} illustrative />
            <HospitalCard rank={2} name="CHU C" level="A" etaMin={58} etaEstimated score={0.43} required={REQ_R_N} missing={[]} status="SATURATED" statusAgeH={1.5} illustrative />
            <HospitalCard rank={3} name="EPH B" level="B" etaMin={9} etaEstimated={false} score={0.77} required={REQ_R_N} missing={['icu', 'neurosurgery']} status="OK" statusAgeH={0.3} nearestEd illustrative />
          </div>
        )}
      </Section>

      <Section id="LifecycleBar" wide title="LifecycleBar" note="Eight steps, each a human click with actor + time. Done · current · next allowed · blocked (tooltip). Mirrors in RTL.">
        {() => (
          <LifecycleBar current="DISPATCHED"
            history={{ RECEIVED: { actor: 'system', time: '14:33' }, ACKNOWLEDGED: { actor: 'disp. A', time: '14:34' }, DISPATCHED: { actor: 'disp. A', time: '14:36' } }}
            allowed={['EN_ROUTE'] as LifecycleStep[]} />
        )}
      </Section>

      <Section id="PreAlertCard" wide title="PreAlertCard" note="Hospital ED view: incoming · overdue (no ACK after 2 min) · acknowledged.">
        {() => (
          <div className="grid gap-3">
            <PreAlertCard incidentId="K7Q2M" band="R" nsi={80} conf="H" sentAt={ago(1)} etaMin={24} mechanism={[{ code: 'rollover' }, { code: 'dv', value: 71 }]} persons={1} reasons={R_REASONS} values={{ dv: 71 }} now={NOW} />
            <PreAlertCard incidentId="P3N8D" band="Y" nsi={44} conf="M" sentAt={ago(4)} etaMin={12} mechanism={[{ code: 'vulnerable_user' }, { code: 'trapped' }]} persons={2} reasons={[{ code: 'trapped', points: 15 }]} now={NOW} />
            <PreAlertCard incidentId="A1B2C" band="O" nsi={52} conf="M" sentAt={ago(6)} ackedAt={ago(5)} etaMin={18} mechanism={[{ code: 'dv', value: 45 }]} persons={1} reasons={[{ code: 'dv', points: 20 }]} values={{ dv: 45 }} now={NOW} />
          </div>
        )}
      </Section>

      <Section id="WitnessStepper" title="WitnessStepper" note="Five pictogram steps for one-hand use. Shown at steps 1, 3 and 5.">
        {() => (
          <div className="flex flex-col gap-5">
            {[0, 2, 4].map((c) => <WitnessStepper key={c} current={c} />)}
          </div>
        )}
      </Section>

      <Section id="StatusBanner" title="StatusBanner" note="Persistent, never hidden. SMS-only is a designed state, not an error. REPLAY / DEMO are impossible to miss.">
        {() => (
          <div className="flex flex-col gap-2">
            {(['online', 'sms_only', 'offline', 'replay', 'demo'] as ConnectivityMode[]).map((m) => <StatusBanner key={m} mode={m} className="rounded-md border" />)}
          </div>
        )}
      </Section>

      <Section id="LocaleSwitch" title="LocaleSwitch" note="Each language labelled in itself. In the styleguide it does not change the page.">
        {() => <LocaleSwitch value="ar" onChange={() => {}} />}
      </Section>

      <Section id="States" title="EmptyState · ErrorState · Skeleton" note="No blank screens.">
        {() => (
          <div className="flex flex-col gap-3">
            <SkeletonRows rows={2} />
            <EmptyState />
            <ErrorState onRetry={() => {}} />
          </div>
        )}
      </Section>
    </div>
  );
}
