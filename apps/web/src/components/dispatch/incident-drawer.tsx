'use client';
import type { Band } from '@najda/shared';
import { BAND_ORDER } from '@najda/ui-core';
import { Check, Copy, ExternalLink, Flame, Phone, QrCode, PhoneOff, ScrollText, Users, Wrench, X, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Tabs } from 'radix-ui';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChannelBadge } from '@/components/ui/channel-badge';
import { PacketLine } from '@/components/ui/packet';
import { ConfidencePill, ReasonList } from '@/components/ui/reason-list';
import { GoldenRing } from '@/components/ui/rings';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { TriageMarker } from '@/components/ui/triage-marker';
import { hhmm } from '@/lib/api';
import { actorName, useIncident, usePatchIncident, type AssessmentInputs, type IncidentDetail } from '@/lib/dispatch';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import type { RouteHint } from './incident-map';
import { LifecyclePanel } from './lifecycle';
import { Orientation } from './orientation';
import { WitnessQr } from './witness-qr';
import { ReasonDialog } from './reason-dialog';

function CopyButton({ text, label, testId }: { text: string; label: string; testId?: string }) {
  const t = useTranslations('detail');
  const [done, setDone] = useState(false);
  return (
    <Button variant="outline" size="sm" data-testid={testId} aria-label={`${label}: ${text}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setDone(false);
        }
      }}>
      {done ? <Check aria-hidden className="text-status-ok" /> : <Copy aria-hidden />}
      {done ? t('copied') : t('copy')}
    </Button>
  );
}

/** Resource hints from the merged flags (decision support: the dispatcher decides what to send). */
function hints(i: AssessmentInputs | undefined): Array<{ key: 'extrication' | 'fire' | 'mci'; icon: LucideIcon }> {
  const f = i?.flags ?? [];
  const out: Array<{ key: 'extrication' | 'fire' | 'mci'; icon: LucideIcon }> = [];
  if (f.includes('X')) out.push({ key: 'extrication', icon: Wrench });
  if (f.includes('F')) out.push({ key: 'fire', icon: Flame });
  if ((i?.persons ?? 0) >= 3 || (i?.vehicles ?? 0) >= 3) out.push({ key: 'mci', icon: Users });
  return out;
}

function BandOverride({ detail }: { detail: IncidentDetail }) {
  const t = useTranslations();
  const { incident, assessment } = detail;
  const patch = usePatchIncident(incident.id);
  const [open, setOpen] = useState(false);
  const [band, setBand] = useState<Band | null>(null);
  const computed = assessment?.band ?? incident.band;
  const lastOverride = [...detail.audit].reverse().find((e) => e.action === 'incident.band_override');
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => { setBand(null); setOpen(true); }} data-testid="override-band">
          {t('detail.overrideBand')}
        </Button>
        {incident.band_override && (
          <>
            <span className="text-sm text-status-warn" data-testid="band-overridden">
              {t('detail.overridden', { actor: actorName(lastOverride?.actor ?? '') })} · {t('detail.computed', { band: computed, nsi: assessment?.nsi ?? incident.nsi })}
            </span>
            <Button variant="ghost" size="sm" onClick={() => { setBand(computed); setOpen(true); }}>{t('detail.clearOverride')}</Button>
          </>
        )}
      </div>
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={t('override.titleBand')}
        ready={band !== null && band !== incident.band}
        busy={patch.isPending}
        error={patch.error?.message}
        onConfirm={(reason) =>
          patch.mutate(
            // picking the computed band again clears the override
            { action: 'override_band', band: band === computed ? null : band, reason },
            { onSuccess: () => setOpen(false) },
          )}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-base font-medium">{t('override.band')}</legend>
          <div className="flex flex-wrap gap-2">
            {BAND_ORDER.map((b) => (
              <label key={b} className={cn('flex min-h-12 cursor-pointer items-center gap-2 rounded-md border px-3',
                band === b ? 'border-brand-fill bg-raised' : 'border-line', b === incident.band && 'opacity-60')}>
                <input type="radio" name="band" value={b} checked={band === b} disabled={b === incident.band}
                  onChange={() => setBand(b)} className="sr-only" />
                <TriageMarker band={b} size="row" />
                <span className="text-base">{t(`band.${b}`)}</span>
                {b === computed && <span className="text-xs text-muted-foreground">({t('override.computedTag')})</span>}
              </label>
            ))}
          </div>
        </fieldset>
      </ReasonDialog>
    </>
  );
}

function Overview({ detail }: { detail: IncidentDetail }) {
  const t = useTranslations();
  const { incident, assessment, reports } = detail;
  const inputs = assessment?.inputs;
  const coords = `${incident.lat.toFixed(5)},${incident.lon.toFixed(5)}`;
  const latest = [...reports].reverse().find((r) => !r.parse_error) ?? reports.at(-1);
  const hs = hints(inputs);
  return (
    <div className="flex flex-col gap-5">
      <ReasonList
        reasons={assessment?.reasons ?? []}
        conf={incident.conf}
        values={{ dv: inputs?.dvKmh, spo2_low: inputs?.spo2, hr_abnormal: inputs?.hr }}
        showConfidence={false}
      />

      {hs.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-medium text-muted-foreground">{t('detail.hints')}</h3>
          <ul className="flex flex-wrap gap-2" data-testid="hints">
            {hs.map((h) => (
              <li key={h.key} className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1 text-base">
                <h.icon aria-hidden className="size-4 text-brand-text" />
                {t(`detail.hint.${h.key}`)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {detail.callback ? (
            <Button asChild size="default">
              <a href={`tel:${detail.callback}`} data-testid="callback">
                <Phone aria-hidden />
                {t('detail.callBack')} <span className="packet-ltr font-mono">{detail.callback}</span>
              </a>
            </Button>
          ) : (
            <span className="inline-flex items-center gap-2 text-base text-muted-foreground" data-testid="no-callback">
              <PhoneOff aria-hidden className="size-4" />
              {t('detail.noCallBack')}
            </span>
          )}
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 text-base">
          {incident.plus_code && (
            <>
              <dt className="pt-2.5 text-sm text-muted-foreground">{t('detail.plusCode')}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="packet-ltr font-mono text-lg">{incident.plus_code}</span>
                <CopyButton text={incident.plus_code} label={t('detail.plusCode')} />
              </dd>
            </>
          )}
          <dt className="pt-2.5 text-sm text-muted-foreground">{t('detail.coords')}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="packet-ltr font-mono text-lg">{coords}</span>
            <CopyButton text={coords} label={t('detail.coords')} testId="copy-coords" />
            <a className="inline-flex min-h-10 items-center gap-1 text-sm text-brand-text underline-offset-4 hover:underline" target="_blank" rel="noreferrer"
              href={`https://www.openstreetmap.org/?mlat=${incident.lat}&mlon=${incident.lon}#map=16/${incident.lat}/${incident.lon}`}>
              {t('detail.openOsm')} <ExternalLink aria-hidden className="size-3.5 rtl:-scale-x-100" />
            </a>
          </dd>
        </dl>
      </section>

      <WitnessLinkPanel incidentId={incident.id} />

      {latest && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t('detail.packet')}</h3>
          {latest.parse_error ? null : <PacketLine wire={latest.raw} />}
          <details className="rounded-md border border-line px-3 py-2">
            <summary className="cursor-pointer text-sm text-muted-foreground">{t('detail.raw')}</summary>
            <div className="mt-2 flex flex-col gap-2">
              <code className="packet-ltr block break-all font-mono text-base" data-testid="raw-sms">{latest.raw}</code>
              <CopyButton text={latest.raw} label={t('detail.raw')} />
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

/** D10: QR + link to the witness page, folded by default (the token is not shown until asked). */
function WitnessLinkPanel({ incidentId }: { incidentId: string }) {
  const t = useTranslations('detail.witness');
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-2">
      <Button variant="outline" size="sm" className="self-start" aria-expanded={open} data-testid="witness-toggle" onClick={() => setOpen((o) => !o)}>
        <QrCode aria-hidden />
        {open ? t('hide') : t('show')}
      </Button>
      {open && (
        <div className="flex flex-col gap-2 rounded-md border border-line p-3">
          <p className="text-sm text-muted-foreground">{t('body')}</p>
          <WitnessQr incidentId={incidentId} />
        </div>
      )}
    </section>
  );
}

function Timeline({ detail }: { detail: IncidentDetail }) {
  const t = useTranslations();
  return (
    <ol className="flex flex-col" data-testid="timeline">
      {detail.reports.map((r) => (
        <li key={r.id} className="flex flex-col gap-1.5 border-s-2 border-line ps-3 pb-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="packet-ltr font-display text-lg tabular-nums">{hhmm(r.received_at)}</span>
            <ChannelBadge channel={r.channel} />
            <span className="text-muted-foreground">{t.has(`source.${r.source}`) ? t(`source.${r.source}` as 'source.auto') : r.source}</span>
          </div>
          {r.parse_error ? (
            <code className="packet-ltr break-all font-mono text-base text-status-warn">{r.raw}</code>
          ) : (
            <PacketLine wire={r.raw} chipsCopyable={false} />
          )}
        </li>
      ))}
    </ol>
  );
}

function AuditMini({ detail }: { detail: IncidentDetail }) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2" data-testid="audit-mini">
        {[...detail.audit].reverse().map((e) => (
          <li key={e.id} className="flex flex-col border-b border-line pb-2 text-base">
            <span className="flex flex-wrap items-baseline gap-2">
              <span className="packet-ltr font-display tabular-nums">{hhmm(e.at)}</span>
              <span className="font-medium">{t.has(`action.${e.action}`) ? t(`action.${e.action}` as 'action.prealert.sent') : e.action}</span>
              <span className="text-sm text-muted-foreground">{actorName(e.actor)}</span>
            </span>
            {e.reason && <span className="text-sm">“{e.reason}”</span>}
          </li>
        ))}
      </ol>
      <Link href={`/audit?incident=${detail.incident.id}`} className="inline-flex min-h-12 items-center gap-2 text-base text-brand-text hover:underline">
        <ScrollText aria-hidden className="size-4" />
        {t('detail.fullAudit')}
      </Link>
    </div>
  );
}

export interface IncidentDrawerProps {
  id: string;
  onClose: () => void;
  onRoute: (r: RouteHint | null) => void;
  /** narrow screens: the lifecycle bar lives inside the drawer instead of under the map */
  lifecycleInside: boolean;
  className?: string;
}

/** D2: right drawer (480 px, never a modal) — header, reasons, call-back, packet, tabs Orientation | Reports | Audit. */
export function IncidentDrawer({ id, onClose, onRoute, lifecycleInside, className }: IncidentDrawerProps) {
  const t = useTranslations();
  const q = useIncident(id);
  const now = useNow(1000);
  const [tab, setTab] = useState('orientation');
  const d = q.data;

  return (
    <aside aria-label={t('detail.title', { id })} data-testid="drawer"
      className={cn('flex min-h-0 flex-col border-s border-line bg-surface', className)}>
      <header className="flex items-start gap-3 border-b border-line p-4">
        {d ? (
          <>
            <TriageMarker band={d.incident.band} size="hero" />
            <div className="min-w-0 flex-1">
              <div className="packet-ltr flex flex-wrap items-baseline gap-x-3">
                <span className="font-display text-4xl font-semibold tabular-nums" data-testid="drawer-score">{d.incident.band} {d.incident.nsi}</span>
                <span className="font-mono text-xl">{d.incident.id}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <ConfidencePill conf={d.incident.conf} />
                <span className="text-sm text-muted-foreground">{t(`band.${d.incident.band}`)} · {t('detail.crashed', { time: hhmm(d.incident.crashed_at) })}</span>
              </div>
            </div>
            <GoldenRing elapsedMin={(now - +new Date(d.incident.crashed_at)) / 60_000} paused={['CLOSED', 'CANCELLED', 'MERGED', 'AT_HOSPITAL'].includes(d.incident.status)} size={64} />
          </>
        ) : (
          <div className="flex flex-1 items-center gap-3">
            <Skeleton className="size-16 rounded-full" />
            <div className="flex flex-1 flex-col gap-2"><Skeleton className="h-8 w-40" /><Skeleton className="h-4 w-28" /></div>
          </div>
        )}
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('app.close')} className="-me-2 -mt-1">
          <X aria-hidden />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {q.isError && !d ? (
          <ErrorState className="m-4" title={t('detail.loadError')} onRetry={() => q.refetch()} />
        ) : !d ? (
          <div role="status" aria-label={t('state.loading')} className="flex flex-col gap-3 p-4">
            <Skeleton className="h-28 w-full" /><Skeleton className="h-12 w-2/3" /><Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-5 p-4">
            <BandOverride detail={d} />
            {lifecycleInside && <LifecyclePanel detail={d} compact />}
            <Overview detail={d} />
            <Tabs.Root value={tab} onValueChange={(v) => { setTab(v); if (v !== 'orientation') onRoute(null); }}>
              <Tabs.List aria-label={t('detail.tabsLabel')} className="sticky top-0 z-10 -mx-4 flex border-b border-line bg-surface px-4">
                {(['orientation', 'reports', 'audit'] as const).map((k) => (
                  <Tabs.Trigger key={k} value={k}
                    className="min-h-12 border-b-2 border-transparent px-3 text-base text-muted-foreground data-[state=active]:border-brand-fill data-[state=active]:font-semibold data-[state=active]:text-text">
                    {t(`detail.tabs.${k}`)}
                    {k === 'reports' && <span className="packet-ltr ms-1.5 font-display text-sm">{d.reports.length}</span>}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              <Tabs.Content value="orientation" className="pt-4"><Orientation detail={d} onRoute={onRoute} /></Tabs.Content>
              <Tabs.Content value="reports" className="pt-4"><Timeline detail={d} /></Tabs.Content>
              <Tabs.Content value="audit" className="pt-4"><AuditMini detail={d} /></Tabs.Content>
            </Tabs.Root>
          </div>
        )}
      </div>
    </aside>
  );
}
