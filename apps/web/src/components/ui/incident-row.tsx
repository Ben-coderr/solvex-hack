'use client';
import type { Band, Confidence } from '@sellekni/shared';
import { formatAge } from '@sellekni/ui-core';
import { Layers, ShieldQuestion } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { ChannelBadge, type Channel } from './channel-badge';
import { TriageMarker } from './triage-marker';

export interface IncidentRowProps {
  id: string;
  band: Band;
  nsi: number;
  conf: Confidence;
  crashedAt: Date | string;
  channel: Channel;
  status: string;
  mergedCount?: number;
  unconfirmed?: boolean;
  selected?: boolean;
  isNew?: boolean;
  now?: Date | number;
  onSelect?: (id: string) => void;
}

/** One line of the dispatcher queue. Data text >= 18 px (projected at 1366×768). */
export function IncidentRow(p: IncidentRowProps) {
  const t = useTranslations();
  const now = useNow(1000, p.now);
  const age = formatAge(now - +new Date(p.crashedAt));
  return (
    <button
      type="button"
      aria-pressed={p.selected}
      onClick={() => p.onSelect?.(p.id)}
      className={cn(
        'grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 border-b border-line px-3 py-3 text-start',
        'hover:bg-raised focus-visible:bg-raised',
        p.selected && 'bg-raised shadow-[inset_3px_0_0_var(--sellekni-brand-fill)] rtl:shadow-[inset_-3px_0_0_var(--sellekni-brand-fill)]',
      )}
    >
      <TriageMarker band={p.band} size="pin" pulsing={p.isNew} className="row-span-2" />
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="packet-ltr font-mono text-lg font-semibold">{p.id}</span>
        <span className="packet-ltr font-display text-lg tabular-nums">{p.band} {p.nsi}</span>
        <span className="text-sm text-muted-foreground">{t(`confidence.short.${p.conf}`)}</span>
      </span>
      <span className="packet-ltr font-display text-lg tabular-nums" aria-label={t('incident.ago', { value: t(`incident.age.${age.unit}`, { value: age.value }) })}>
        {t(`incident.age.${age.unit}`, { value: age.value })}
      </span>
      <span className="col-start-2 col-end-4 flex flex-wrap items-center gap-1.5">
        <ChannelBadge channel={p.channel} />
        {p.unconfirmed && (
          <span className="inline-flex items-center gap-1 rounded-pill border border-dashed border-status-warn px-2 py-0.5 text-sm text-status-warn">
            <ShieldQuestion aria-hidden className="size-4" />
            {t('incident.unconfirmed')}
          </span>
        )}
        {(p.mergedCount ?? 1) > 1 && (
          <span className="inline-flex items-center gap-1 rounded-pill border border-line px-2 py-0.5 text-sm">
            <Layers aria-hidden className="size-4 text-muted-foreground" />
            {t('incident.merged', { count: p.mergedCount ?? 1 })}
          </span>
        )}
        <span className="ms-auto text-sm text-muted-foreground">{t.has(`lifecycle.${p.status}`) ? t(`lifecycle.${p.status}` as 'lifecycle.RECEIVED') : p.status}</span>
      </span>
    </button>
  );
}
