'use client';
import { formatHHMM, type Band, type Confidence } from '@sellekni/shared';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { ConfidencePill, ReasonList, type ReasonItem } from './reason-list';
import { TriageMarker } from './triage-marker';

export interface PreAlertCardProps {
  incidentId: string;
  band: Band;
  nsi: number;
  conf: Confidence;
  sentAt: Date | string;
  etaMin: number;
  ackedAt?: Date | string | null;
  /** reason codes (same vocabulary as ReasonList) + persons involved; localised here, never free text */
  mechanism: readonly { code: string; value?: number }[];
  persons?: number;
  reasons: readonly ReasonItem[];
  values?: Partial<Record<string, number>>;
  now?: Date | number;
  onAck?: () => void;
}

const OVERDUE_MS = 2 * 60_000;

/** Hospital ED view of one incoming patient: arrives-in countdown, mechanism, reasons, one ACK button. */
export function PreAlertCard(p: PreAlertCardProps) {
  const t = useTranslations('prealert');
  const tAll = useTranslations();
  const tr = useTranslations('hospital');
  const now = useNow(1000, p.now);
  const sent = +new Date(p.sentAt);
  const arrivesIn = Math.max(0, Math.ceil((sent + p.etaMin * 60_000 - now) / 60_000));
  const state = p.ackedAt ? 'acked' : now - sent > OVERDUE_MS ? 'overdue' : 'incoming';
  const hhmm = p.ackedAt ? formatHHMM(new Date(p.ackedAt)) : ''; // Algeria local time (UTC+1)
  const ackTime = hhmm ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : '';
  return (
    <article className={cn('flex min-w-0 flex-col gap-4 rounded-md border bg-surface p-4 wrap-anywhere',
      state === 'overdue' ? 'border-status-warn' : state === 'acked' ? 'border-line' : 'border-brand-fill')}>
      <header className="flex flex-wrap items-center gap-3">
        <TriageMarker band={p.band} size="hero" />
        <div className="min-w-0 flex-1 basis-32">
          <div className="packet-ltr flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-3xl font-semibold tabular-nums">{p.band} {p.nsi}</span>
            <span className="font-mono text-lg">{p.incidentId}</span>
          </div>
          <ConfidencePill conf={p.conf} className="mt-1" />
        </div>
        <div className="ms-auto text-end">
          <div className="text-xs text-muted-foreground">{t('eta')}</div>
          <div className="packet-ltr font-display text-5xl font-semibold leading-none tabular-nums">{arrivesIn}<span className="ms-1 text-base font-normal text-muted-foreground">{tr('min')}</span></div>
        </div>
      </header>
      <p className={cn('flex items-center gap-2 text-sm',
        state === 'overdue' ? 'text-status-warn' : state === 'acked' ? 'text-status-ok' : 'text-brand-text')}>
        <Clock aria-hidden className="size-4" />
        {state === 'acked' ? t('acked', { time: ackTime }) : state === 'overdue' ? t('overdue', { minutes: Math.floor((now - sent) / 60_000) }) : t('incoming')}
      </p>
      <div>
        <h4 className="mb-1 text-sm font-medium text-muted-foreground">{t('mechanism')}</h4>
        <p className="text-base">
          {[
            ...p.mechanism.map((m) => (tAll.has(`reasons.${m.code}`) ? tAll(`reasons.${m.code}` as 'reasons.dv', { value: m.value ?? '' }) : m.code)),
            ...(p.persons !== undefined ? [t('persons', { count: p.persons })] : []),
          ].join(' · ')}
        </p>
      </div>
      <ReasonList reasons={p.reasons} conf={p.conf} values={p.values} showConfidence={false} />
      {state !== 'acked' && <Button size="lg" onClick={p.onAck}>{t('ack')}</Button>}
    </article>
  );
}
