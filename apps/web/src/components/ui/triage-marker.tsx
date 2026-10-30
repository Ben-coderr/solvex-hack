'use client';
import type { Band } from '@sellekni/shared';
import { TRIAGE_SIZE, triageGeometry, type TriageSize } from '@sellekni/ui-core';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const FILL: Record<Exclude<Band, 'U'>, string> = {
  R: 'var(--color-triage-r)', O: 'var(--color-triage-o)', Y: 'var(--color-triage-y)', G: 'var(--color-triage-g)',
};
const INK: Record<Exclude<Band, 'U'>, string> = {
  R: 'var(--color-on-triage-r)', O: 'var(--color-on-triage-o)', Y: 'var(--color-on-triage-y)', G: 'var(--color-on-triage-g)',
};

export interface TriageMarkerProps {
  band: Band;
  size?: TriageSize;
  selected?: boolean;
  /** one-shot arrival pulse (3 cycles, removed under reduced motion) */
  pulsing?: boolean;
  className?: string;
}

/**
 * The ONLY way to show a triage band: shape + letter + colour (docs/06 §2).
 * R ▲ · O ◆ · Y ● · G ■ · U ◌ (dashed, hollow). On light surfaces the 2 px ink outline comes from the token
 * `triageOutline` (transparent in dark, where every fill passes 3:1 on its own).
 */
export function TriageMarker({ band, size = 'row', selected, pulsing, className }: TriageMarkerProps) {
  const t = useTranslations('band');
  const px = TRIAGE_SIZE[size];
  const g = triageGeometry(band);
  const unknown = band === 'U';

  return (
    <span
      role="img"
      aria-label={t('label', { band, name: t(band) })}
      className={cn(
        'relative inline-grid shrink-0 place-items-center',
        selected && 'rounded-full outline-3 outline-offset-2 outline-brand-fill',
        className,
      )}
      style={{ width: px, height: px }}
    >
      {pulsing && (
        <span aria-hidden className="sellekni-pulse absolute inset-0 rounded-full" style={{ background: unknown ? 'var(--sellekni-muted)' : FILL[band] }} />
      )}
      <svg viewBox="0 0 100 100" width={px} height={px} aria-hidden className="relative overflow-visible">
        <path
          d={g.path}
          fill={unknown ? 'none' : FILL[band]}
          stroke={unknown ? 'var(--sellekni-muted)' : 'var(--sellekni-triage-outline)'}
          strokeWidth={unknown ? 2.5 : 2}
          strokeDasharray={unknown ? '4 3' : undefined}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        <text
          x="50"
          y={g.letterY}
          textAnchor="middle"
          dominantBaseline="central"
          direction="ltr"
          fill={unknown ? 'var(--sellekni-text)' : INK[band]}
          fontSize={g.shape === 'triangle' ? 46 : 50}
          fontWeight={700}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {band}
        </text>
      </svg>
    </span>
  );
}
