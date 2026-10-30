'use client';
import type { RankedHospital } from '@sellekni/shared';
import type { CapabilityCode } from '@sellekni/ui-core';
import { AlertTriangle, CheckCheck, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { HospitalCard } from '@/components/ui/hospital-card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { hhmm } from '@/lib/api';
import { usePatchIncident, usePrealert, useRecommendations, type IncidentDetail, type Recommendations } from '@/lib/dispatch';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import type { RouteHint } from './incident-map';
import { ReasonDialog } from './reason-dialog';

export const ACK_WARN_MS = 2 * 60_000;

/** Pre-alert state for one facility: sent hh:mm → ✓ on ACK, or a visible warning after 2 min without one. */
function PrealertState({ detail, hospitalId }: { detail: IncidentDetail; hospitalId: string }) {
  const t = useTranslations('orient');
  const now = useNow(1000);
  const rows = detail.prealerts.filter((p) => p.hospital_id === hospitalId);
  const web = rows.filter((p) => p.channel === 'web').at(-1);
  if (!web) return null;
  const sms = rows.some((p) => p.channel === 'sms');
  const late = !web.acked_at && now - +new Date(web.sent_at) > ACK_WARN_MS;
  return (
    <div data-testid={`prealert-${hospitalId}`} data-state={web.acked_at ? 'acked' : late ? 'late' : 'sent'}
      className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-base',
        web.acked_at ? 'border-line' : late ? 'border-status-warn' : 'border-brand-fill')}>
      <span className="inline-flex items-center gap-1.5">
        <Send aria-hidden className="size-4 text-muted-foreground" />
        {t('sent', { time: hhmm(web.sent_at) })}
        <span className="text-sm text-muted-foreground">· {sms ? t('viaWebSms') : t('viaWeb')}</span>
      </span>
      {web.acked_at ? (
        <span className="inline-flex items-center gap-1.5 font-semibold text-status-ok">
          <CheckCheck aria-hidden className="size-5" />
          {t('acked', { time: hhmm(web.acked_at) })}
        </span>
      ) : late ? (
        <span role="alert" className="inline-flex items-center gap-1.5 font-semibold text-status-warn">
          <AlertTriangle aria-hidden className="size-5" />
          {t('waiting', { minutes: Math.floor((now - +new Date(web.sent_at)) / 60_000) })}
        </span>
      ) : (
        <span className="text-muted-foreground">{t('awaiting')}</span>
      )}
    </div>
  );
}

type Pending = { hospital: RankedHospital; prealert: boolean } | null;

export interface OrientationProps {
  detail: IncidentDetail;
  onRoute: (r: RouteHint | null) => void;
}

/** D3: top-3 facilities + nearest ED, route on hover, choose / override (reason) and the one-click pre-alert. */
export function Orientation({ detail, onRoute }: OrientationProps) {
  const t = useTranslations();
  const { incident } = detail;
  const recs = useRecommendations(incident.id, incident.band);
  const patch = usePatchIncident(incident.id);
  const prealert = usePrealert(incident.id);
  const [pending, setPending] = useState<Pending>(null);

  if (recs.isLoading) {
    return (
      <div role="status" aria-label={t('orient.loading')} className="flex flex-col gap-3">
        <p className="text-base text-muted-foreground">{t('orient.loading')}</p>
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-full rounded-md" />)}
      </div>
    );
  }
  if (recs.isError || !recs.data) return <ErrorState onRetry={() => recs.refetch()} />;
  const rec: Recommendations = recs.data;
  if (rec.mode === 'no_candidate' || rec.items.length === 0) return <EmptyState title={t('orient.none')} body={rec.note} />;

  const top = rec.items[0]!.hospitalId;
  const cards = [...rec.items];
  if (rec.nearestEd && !cards.some((h) => h.hospitalId === rec.nearestEd!.hospitalId)) cards.push(rec.nearestEd);

  const hint = (h: RankedHospital): RouteHint | null => {
    const to = rec.coords[h.hospitalId];
    return to ? { hospitalId: h.hospitalId, name: h.name, to, estimated: rec.etaProvider[h.hospitalId] === 'haversine' } : null;
  };

  const send = (h: RankedHospital) => prealert.mutate(h.hospitalId, { onSuccess: () => onRoute(hint(h)) });

  /** Choosing (and pre-alerting) a facility other than the top recommendation needs a written reason. */
  const act = (h: RankedHospital, withPrealert: boolean) => {
    if (incident.hospital_id === h.hospitalId) return withPrealert ? send(h) : undefined;
    if (h.hospitalId !== top) return setPending({ hospital: h, prealert: withPrealert });
    patch.mutate({ action: 'set_hospital', hospital_id: h.hospitalId }, { onSuccess: () => withPrealert && send(h) });
  };

  const busy = patch.isPending || prealert.isPending;
  const err = patch.error?.message ?? prealert.error?.message;

  return (
    <div className="flex flex-col gap-3" data-testid="orientation">
      {rec.mode === 'stabilise_transfer' && (
        <p className="rounded-md border border-status-warn px-3 py-2 text-base text-status-warn">{t('orient.stabilise')}</p>
      )}
      <p className="text-sm text-muted-foreground">{t('orient.rule')}</p>
      {rec.etaNotes.length > 0 && <p className="text-sm text-muted-foreground">{t('orient.notes', { notes: rec.etaNotes.join(' · ') })}</p>}
      {err && !pending && <p role="alert" className="text-sm text-status-danger">{err}</p>}
      <ol className="flex flex-col gap-3">
        {cards.map((h, i) => {
          const chosen = incident.hospital_id === h.hospitalId;
          const r = hint(h);
          return (
            <li
              key={h.hospitalId}
              data-testid={`hospital-${h.hospitalId}`}
              onMouseEnter={() => onRoute(r)}
              onFocus={() => onRoute(r)}
              className="flex flex-col gap-2"
            >
              {chosen && <span className="text-sm font-semibold text-brand-text">{t('orient.chosen')}</span>}
              <HospitalCard
                rank={i < rec.items.length ? i + 1 : 0}
                name={h.name}
                level={h.level}
                etaMin={h.etaMin}
                etaEstimated={rec.etaProvider[h.hospitalId] === 'haversine'}
                score={h.score}
                required={rec.required as CapabilityCode[]}
                missing={h.missing as CapabilityCode[]}
                status={h.status}
                statusAgeH={h.statusAgeH}
                nearestEd={rec.nearestEd?.hospitalId === h.hospitalId}
                illustrative={/illustrative/i.test(h.name)}
                className={cn(chosen && 'border-brand-fill')}
                onPrealert={busy ? undefined : () => act(h, true)}
                onChoose={busy || chosen ? undefined : () => act(h, false)}
              />
              <PrealertState detail={detail} hospitalId={h.hospitalId} />
            </li>
          );
        })}
      </ol>
      <ReasonDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={t('override.titleHospital')}
        description={pending ? t('override.hospitalHint', { chosen: pending.hospital.name, top: rec.items[0]!.name }) : undefined}
        busy={busy}
        error={pending ? err : null}
        confirmLabel={pending?.prealert ? t('override.confirmPrealert') : undefined}
        onConfirm={(reason) => {
          const p = pending!;
          patch.mutate(
            { action: 'set_hospital', hospital_id: p.hospital.hospitalId, reason },
            { onSuccess: () => { setPending(null); if (p.prealert) send(p.hospital); } },
          );
        }}
      />
    </div>
  );
}
