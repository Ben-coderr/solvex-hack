'use client';
import type { CapabilityCode } from '@najda/ui-core';
import { Info, MapPin } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from './button';

export type LoadStatus = 'OK' | 'BUSY' | 'SATURATED' | 'UNKNOWN';

export interface HospitalCardProps {
  /** 1-based; 0 = shown outside the ranking (the nearest ED appended below the top 3) */
  rank: number;
  name: string;
  level: 'A' | 'B' | 'C';
  etaMin: number;
  /** routed (osrm/ors) or the haversine estimate: the latter is tagged "estimated" */
  etaEstimated: boolean;
  score: number;
  required: readonly CapabilityCode[];
  missing: readonly CapabilityCode[];
  status: LoadStatus;
  statusAgeH: number | null;
  nearestEd?: boolean;
  /** ranked first by the capability rule (band R, level A within 60 min), not by raw score */
  gate?: boolean;
  /** shown instead of the default when the server explains differently (e.g. stabilise then transfer) */
  note?: string;
  illustrative?: boolean;
  onPrealert?: () => void;
  onChoose?: () => void;
  className?: string;
}

const STATUS_CLS: Record<LoadStatus, string> = {
  OK: 'text-status-ok', BUSY: 'text-status-warn', SATURATED: 'text-status-danger', UNKNOWN: 'text-muted-foreground',
};

/** The ranking explainer: ETA in big numerals, match bar, capability dots (filled = has, hollow = missing), load status. */
export function HospitalCard(p: HospitalCardProps) {
  const t = useTranslations();
  const list = new Intl.ListFormat(useLocale(), { type: 'conjunction' }); // "،" and "و" in Arabic
  const status = t(`hospital.status.${p.status}`);
  return (
    <article className={cn('flex min-w-0 flex-col gap-3 rounded-md border border-line bg-surface p-4 wrap-anywhere', p.rank === 1 && 'border-brand-fill', p.className)}>
      <header className="flex flex-wrap items-start gap-3">
        {p.rank > 0 && <span className="packet-ltr font-display text-sm text-muted-foreground">{t('hospital.rank', { rank: p.rank })}</span>}
        <div className="min-w-0 flex-1 basis-40">
          <h3 className="text-lg font-semibold leading-snug">
            {p.name}
            <span className="ms-2 rounded-sm border border-line px-1 font-mono text-xs text-muted-foreground align-middle">{p.level}</span>
          </h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <span className={STATUS_CLS[p.status]}>
              {p.statusAgeH === null || p.status === 'UNKNOWN' ? t('hospital.statusUnknown') : t('hospital.statusAge', { status, hours: p.statusAgeH })}
            </span>
            {p.nearestEd && (
              <span className="inline-flex items-center gap-1 text-brand-text"><MapPin aria-hidden className="size-4" />{t('hospital.nearestEd')}</span>
            )}
            {p.illustrative && <span className="text-muted-foreground">({t('hospital.illustrative')})</span>}
          </div>
        </div>
        <div className="ms-auto text-end">
          <div className="text-xs text-muted-foreground">{t('hospital.eta')}</div>
          <div className="packet-ltr font-display text-4xl font-semibold leading-none tabular-nums">
            {p.etaMin}<span className="ms-1 text-base font-normal text-muted-foreground">{t('hospital.min')}</span>
          </div>
          {p.etaEstimated && <div className="mt-1 text-xs text-status-warn">{t('hospital.estimated')}</div>}
        </div>
      </header>

      {(p.note || p.gate || p.missing.length > 0) && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {p.note ?? [
              p.gate ? t('hospital.gateNote') : null,
              p.missing.length ? t('hospital.missingNote', { caps: list.format(p.missing.map((c) => t(`capability.${c}`))) }) : null,
            ].filter(Boolean).join(' ')}
          </span>
        </p>
      )}

      <div>
        <div className="mb-1 flex justify-between text-sm text-muted-foreground">
          <span>{t('hospital.score', { score: p.score.toFixed(2) })}</span>
        </div>
        <div className="h-2 rounded-pill bg-raised" role="presentation">
          <div className="h-2 rounded-pill bg-brand-fill" style={{ width: `${Math.round(Math.min(1, p.score) * 100)}%` }} />
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
        {p.required.map((c) => {
          const has = !p.missing.includes(c);
          const name = t(`capability.${c}`);
          return (
            <li key={c} className={cn('inline-flex items-center gap-1.5', !has && 'text-muted-foreground line-through decoration-1')}
              aria-label={has ? t('hospital.has', { cap: name }) : t('hospital.missing', { cap: name })}>
              <span aria-hidden className={cn('size-2.5 rounded-full border-2 border-text', has ? 'bg-text' : 'bg-transparent')} />
              {name}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button onClick={p.onPrealert} disabled={!p.onPrealert}>{t('hospital.prealert')}</Button>
        <Button variant="outline" onClick={p.onChoose} disabled={!p.onChoose}>{t('hospital.choose')}</Button>
      </div>
    </article>
  );
}
