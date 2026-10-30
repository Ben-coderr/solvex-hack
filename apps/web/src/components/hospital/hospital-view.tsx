'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Hospital } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AppHeader } from '@/components/dispatch/app-header';
import { useConnectivity } from '@/components/dispatch/status-strip';
import { PreAlertCard } from '@/components/ui/prealert-card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { StatusBanner } from '@/components/ui/status-banner';
import { api, hhmm } from '@/lib/api';
import { useHealth, useIncoming, type IncomingPrealert } from '@/lib/dispatch';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

const STATUSES = ['OK', 'BUSY', 'SATURATED'] as const;
const STATUS_TTL_MS = 6 * 3_600_000;
const TONE = { OK: 'text-status-ok', BUSY: 'text-status-warn', SATURATED: 'text-status-danger' } as const;

function mechanism(p: IncomingPrealert) {
  const i = p.inputs ?? {};
  return [
    ...(i.dvKmh ? [{ code: 'dv', value: i.dvKmh }] : []),
    ...(i.rollover ? [{ code: 'rollover' }] : []),
  ];
}

function StatusToggle({ hospitalId, current }: { hospitalId: string; current: { status: string; setAt: number } | null }) {
  const t = useTranslations('hospitalView');
  const th = useTranslations('hospital.status');
  const qc = useQueryClient();
  const now = useNow(30_000);
  const set = useMutation({
    mutationFn: (status: (typeof STATUSES)[number]) => api(`/api/hospitals/${hospitalId}/status`, { method: 'POST', json: { status } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['hospital', hospitalId] }),
  });
  const fresh = current && now - current.setAt < STATUS_TTL_MS;
  const leftH = fresh ? Math.max(0, (current.setAt + STATUS_TTL_MS - now) / 3_600_000) : 0;
  return (
    <section aria-labelledby="st-h" className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <h2 id="st-h" className="text-base font-medium text-muted-foreground">{t('status')}</h2>
      <div role="radiogroup" aria-labelledby="st-h" className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const on = fresh && current.status === s;
          return (
            <button key={s} type="button" role="radio" aria-checked={!!on} disabled={set.isPending} data-testid={`status-${s}`}
              onClick={() => set.mutate(s)}
              className={cn('min-h-12 min-w-28 rounded-md border px-4 text-lg', on ? 'border-brand-fill bg-raised font-semibold' : 'border-line hover:bg-raised')}>
              <span className={TONE[s]} aria-hidden>● </span>{th(s)}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground" data-testid="status-expiry">
        {fresh
          ? t('setAt', { status: th(current.status as 'OK'), time: hhmm(new Date(current.setAt)), hours: leftH.toFixed(1) })
          : t('unknown')}
        {' · '}{t('expires')}
      </p>
      {set.error && <p role="alert" className="text-sm text-status-danger">{set.error.message}</p>}
    </section>
  );
}

/** D8 (minimal for G2): incoming pre-alerts with arrival countdown + ACK, and the facility's load status. */
export function HospitalView({ hospitalId, canNavigate }: { hospitalId: string; canNavigate: boolean }) {
  const t = useTranslations('hospitalView');
  const conn = useConnectivity();
  const demo = useHealth().data?.demo ?? false;
  const q = useIncoming(hospitalId);
  const qc = useQueryClient();
  const ack = useMutation({
    mutationFn: (id: string) => api(`/api/prealerts/${id}/ack`, { method: 'POST' }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['hospital', hospitalId] }),
  });
  const items = q.data?.incoming ?? [];
  const waiting = items.filter((p) => !p.acked_at).length;

  return (
    <div className="flex min-h-dvh flex-col">
      {demo && <StatusBanner mode="demo" />}
      {conn !== 'online' && <StatusBanner mode={conn} />}
      <AppHeader nav={canNavigate} />
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="in-h" className="flex min-w-0 flex-col gap-4">
          <h1 className="flex flex-wrap items-center gap-3">
            <Hospital aria-hidden className="size-7 text-brand-text" />
            <span className="font-display text-3xl font-semibold">{t('title')}</span>
            <span className="packet-ltr font-mono text-xl text-muted-foreground">{hospitalId}</span>
          </h1>
          <h2 id="in-h" className="text-lg font-semibold">
            {t('incoming')} {waiting > 0 && <span className="packet-ltr ms-2 rounded-pill bg-brand-fill px-2.5 py-0.5 font-display text-base text-on-brand">{waiting}</span>}
          </h2>
          {q.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : q.isError && !q.data ? (
            <ErrorState onRetry={() => q.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title={t('none')} body={t('noneBody')} />
          ) : (
            <ul className="flex flex-col gap-4">
              {items.map((p) => (
                <li key={p.id} data-testid={`incoming-${p.incident_id}`} data-acked={!!p.acked_at}>
                  <PreAlertCard
                    incidentId={p.incident_id} band={p.band} nsi={p.nsi} conf={p.conf} sentAt={p.sent_at} etaMin={p.eta_min ?? 0}
                    ackedAt={p.acked_at} mechanism={mechanism(p)} persons={p.inputs?.persons}
                    reasons={p.reasons ?? []} values={{ dv: p.inputs?.dvKmh, spo2_low: p.inputs?.spo2, hr_abnormal: p.inputs?.hr }}
                    onAck={ack.isPending ? undefined : () => ack.mutate(p.id)}
                  />
                </li>
              ))}
            </ul>
          )}
          {ack.error && <p role="alert" className="text-sm text-status-danger">{ack.error.message}</p>}
        </section>
        <aside className="flex flex-col gap-4">
          {q.data || !q.isLoading ? <StatusToggle hospitalId={hospitalId} current={q.data?.status ?? null} /> : <Skeleton className="h-40" />}
        </aside>
      </main>
    </div>
  );
}
