'use client';
import { FileWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ChannelBadge } from '@/components/ui/channel-badge';
import { IncidentRow } from '@/components/ui/incident-row';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { hhmm } from '@/lib/api';
import type { QueueItem, UnparsedItem } from '@/lib/dispatch';

export interface QueueProps {
  incidents: readonly QueueItem[] | undefined;
  unparsed: readonly UnparsedItem[] | undefined;
  loading: boolean;
  error: boolean;
  /** data shown is the last good copy (server unreachable) */
  stale: boolean;
  selectedId: string | null;
  newIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onRetry: () => void;
}

/** Left column: open incidents (server order = band, then age) and, below, messages kept raw because they did not parse. */
export function Queue(p: QueueProps) {
  const t = useTranslations();
  if (p.loading) return <SkeletonRows rows={5} />;
  if (p.error && !p.incidents) return <ErrorState className="m-3" onRetry={p.onRetry} />;
  const incidents = p.incidents ?? [];
  const unparsed = p.unparsed ?? [];
  return (
    <div className="flex flex-col">
      {p.stale && (
        <p role="status" className="border-b border-line px-3 py-2 text-sm text-status-warn">{t('app.stale')}</p>
      )}
      {incidents.length === 0 ? (
        <EmptyState className="m-3" />
      ) : (
        <ul aria-label={t('app.queue')} data-testid="queue">
          {incidents.map((i) => (
            <li key={i.id} data-testid={`row-${i.id}`} data-band={i.band}>
              <IncidentRow
                id={i.id} band={i.band} nsi={i.nsi} conf={i.conf} crashedAt={i.crashed_at} channel={i.first_channel}
                status={i.status} mergedCount={i.merged_count} unconfirmed={i.unconfirmed_auto}
                selected={i.id === p.selectedId} isNew={p.newIds.has(i.id)} onSelect={p.onSelect}
              />
            </li>
          ))}
        </ul>
      )}
      {unparsed.length > 0 && (
        <section aria-labelledby="unparsed-h" className="mt-4 border-t border-line" data-testid="unparsed">
          <h2 id="unparsed-h" className="flex items-center gap-2 px-3 pt-3 text-base font-semibold">
            <FileWarning aria-hidden className="size-5 text-status-warn" />
            {t('app.unparsed')} <span className="packet-ltr font-display text-muted-foreground">{unparsed.length}</span>
          </h2>
          <p className="px-3 pb-2 text-sm text-muted-foreground">{t('app.unparsedHint')}</p>
          <ul>
            {unparsed.slice(0, 10).map((u) => (
              <li key={u.id} className="flex flex-col gap-1.5 border-b border-dashed border-line px-3 py-2.5" data-testid="unparsed-row">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <ChannelBadge channel={u.channel} />
                  <span className="packet-ltr font-display tabular-nums">{hhmm(u.received_at)}</span>
                  <span className="text-status-warn">{t('app.unparsedError', { error: u.parse_error })}</span>
                </div>
                <code className="packet-ltr block break-all font-mono text-base">{u.raw}</code>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
