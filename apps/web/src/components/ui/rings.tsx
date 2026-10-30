'use client';
import { GOLDEN_SPAN_MIN, GOLDEN_TICKS, goldenFraction, ringDash } from '@najda/ui-core';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export interface GoldenRingProps {
  elapsedMin: number;
  paused?: boolean;
  size?: number;
  className?: string;
}

/** Time since impact over the first hour, ticks at 10/30/60 min. Informative, not alarming: never a triage colour. */
export function GoldenRing({ elapsedMin, paused, size = 64, className }: GoldenRingProps) {
  const t = useTranslations('golden');
  const r = 42;
  const { circumference, offset } = ringDash(r, goldenFraction(elapsedMin));
  const minutes = Math.floor(Math.max(0, elapsedMin));
  return (
    <span
      role="img"
      aria-label={paused ? `${t('label', { minutes })} · ${t('paused')}` : t('label', { minutes })}
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--najda-line)" strokeWidth="6" />
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke={paused ? 'var(--najda-muted)' : 'var(--najda-brand-fill)'}
          strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="najda-ring-drain"
        />
        {GOLDEN_TICKS.map((m) => {
          const a = (m / GOLDEN_SPAN_MIN) * 2 * Math.PI;
          const [x1, y1, x2, y2] = [50 + 34 * Math.cos(a), 50 + 34 * Math.sin(a), 50 + 50 * Math.cos(a), 50 + 50 * Math.sin(a)];
          return <line key={m} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--najda-text)" strokeWidth="3" />;
        })}
      </svg>
      <span className="packet-ltr absolute flex flex-col items-center leading-none">
        <span className="font-display font-semibold tabular-nums" style={{ fontSize: size * 0.3 }}>{minutes}</span>
        <span className="text-[0.625rem] text-muted-foreground">{t('min')}</span>
      </span>
    </span>
  );
}

export interface CountdownRingProps {
  remaining: number;
  total?: number;
  size?: number;
  className?: string;
}

/** The countdown before an automatic alert. The only continuous animation in the product (drain). */
export function CountdownRing({ remaining, total = 30, size = 240, className }: CountdownRingProps) {
  const t = useTranslations('countdown');
  const r = 44;
  const secs = Math.max(0, Math.ceil(remaining));
  const urgent = secs <= 5;
  const { circumference, offset } = ringDash(r, remaining / total);
  return (
    <div
      role="timer"
      aria-label={t('label', { seconds: secs })}
      className={cn('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--najda-line)" strokeWidth={urgent ? 8 : 5} />
        <circle
          cx="50" cy="50" r={r} fill="none"
          stroke={urgent ? 'var(--najda-text)' : 'var(--najda-brand-fill)'}
          strokeWidth={urgent ? 8 : 5} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="najda-ring-drain"
        />
      </svg>
      <span className="packet-ltr absolute flex items-baseline gap-1">
        <span className="font-display font-semibold tabular-nums leading-none" style={{ fontSize: size * 0.32 }}>{secs}</span>
        <span className="text-xl text-muted-foreground">{t('unit')}</span>
      </span>
      {urgent && <span className="absolute bottom-[14%] text-sm font-medium uppercase tracking-wide">{t('urgent')}</span>}
    </div>
  );
}
