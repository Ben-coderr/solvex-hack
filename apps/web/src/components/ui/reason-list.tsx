'use client';
import type { Confidence } from '@najda/shared';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export interface ReasonItem { code: string; points: number; text?: string }

/** H / M / L as three bars plus the word: confidence is never shown as colour alone. */
export function ConfidencePill({ conf, className }: { conf: Confidence; className?: string }) {
  // wraps at large text sizes instead of overflowing
  const t = useTranslations('confidence');
  const level = { L: 1, M: 2, H: 3 }[conf];
  return (
    <span className={cn('inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-pill border border-line px-2 py-0.5 text-sm', className)}>
      <span aria-hidden className="flex items-end gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={cn('w-1 rounded-sm', i <= level ? 'bg-text' : 'bg-line')} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {t(conf)}
    </span>
  );
}

export interface ReasonListProps {
  reasons: readonly ReasonItem[];
  conf: Confidence;
  /** e.g. { dv: 71 } for "Speed drop 71 km/h" */
  values?: Partial<Record<string, number>>;
  capNote?: string;
  /** off when the parent already shows the pill (no duplicate on a glance screen) */
  showConfidence?: boolean;
  className?: string;
}

/** The explainability unit: top-3 reasons with points, confidence, and the fixed disclaimer (always shown). */
export function ReasonList({ reasons, conf, values = {}, capNote, showConfidence = true, className }: ReasonListProps) {
  const t = useTranslations();
  const label = (r: ReasonItem) =>
    t.has(`reasons.${r.code}`) ? t(`reasons.${r.code}` as 'reasons.dv', { value: values[r.code] ?? '' }) : (r.text ?? r.code);
  return (
    <section className={cn('flex min-w-0 flex-col gap-3 wrap-anywhere', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">{t('reasons.title')}</h3>
        {showConfidence && <ConfidencePill conf={conf} />}
      </div>
      {reasons.length === 0 ? (
        <p className="text-base text-muted-foreground">{t('reasons.none')}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {reasons.slice(0, 3).map((r) => (
            <li key={r.code} className="flex items-baseline gap-3 text-base">
              <span className="packet-ltr w-9 shrink-0 text-end font-mono text-sm text-muted-foreground">+{r.points}</span>
              <span className="min-w-0">{label(r)}</span>
            </li>
          ))}
        </ol>
      )}
      {capNote && <p className="text-sm text-muted-foreground">{capNote}</p>}
      <p className="flex items-start gap-2 border-t border-line pt-2 text-sm text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t('disclaimer')}
      </p>
    </section>
  );
}
