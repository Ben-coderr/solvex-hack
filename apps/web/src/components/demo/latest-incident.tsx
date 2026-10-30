'use client';
import { useTranslations } from 'next-intl';
import { ConfidencePill } from '@/components/ui/reason-list';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { TriageMarker } from '@/components/ui/triage-marker';
import type { DemoPhones } from './use-demo';

/** Newest open incident: band, score, confidence, report count. The stage numbers the jury watches change. */
export function LatestIncident({ q }: { q: { data?: DemoPhones; isError: boolean; isLoading: boolean; refetch: () => unknown } }) {
  const t = useTranslations();
  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  if (q.isError && !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const i = q.data?.latest;
  if (!i) return <EmptyState title={t('demo.noIncident')} />;
  return (
    <div className="flex items-center gap-4 rounded-md border border-line bg-surface p-4" data-testid="demo-latest" data-conf={i.conf} data-count={i.merged_count}>
      <TriageMarker band={i.band} size="hero" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="packet-ltr font-display text-3xl font-semibold tabular-nums">{i.band} {i.nsi} <span className="font-mono text-xl">{i.id}</span></span>
        <span className="flex flex-wrap items-center gap-2">
          <ConfidencePill conf={i.conf} />
          {i.merged_count > 1 && <span className="text-base">{t('incident.merged', { count: i.merged_count })}</span>}
          <span className="text-sm text-muted-foreground">{t(`lifecycle.${i.status}` as 'lifecycle.RECEIVED')}</span>
        </span>
      </div>
    </div>
  );
}
