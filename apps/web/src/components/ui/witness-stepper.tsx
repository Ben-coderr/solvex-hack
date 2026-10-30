'use client';
import { Car, MapPin, Send, TriangleAlert, Users, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const STEPS: ReadonlyArray<[key: 'vehicles' | 'hurt' | 'danger' | 'location' | 'send', icon: LucideIcon]> = [
  ['vehicles', Car], ['hurt', Users], ['danger', TriangleAlert], ['location', MapPin], ['send', Send],
];

/** Witness flow progress: 5 pictogram steps, one-hand use, follows reading direction. */
export function WitnessStepper({ current, className }: { current: number; className?: string }) {
  const t = useTranslations('witness');
  return (
    <nav aria-label={t('progress', { current: current + 1, total: STEPS.length })} className={cn('flex flex-col gap-2', className)}>
      <ol className="grid grid-cols-5 gap-1">
        {STEPS.map(([key, Icon], i) => (
          <li key={key} aria-current={i === current ? 'step' : undefined} className="flex flex-col items-center gap-1 text-center">
            <span
              className={cn(
                'grid size-12 place-items-center rounded-full border-2',
                i < current && 'border-text bg-text text-bg',
                i === current && 'border-brand-fill bg-brand-fill text-on-brand',
                i > current && 'border-line text-muted-foreground',
              )}
            >
              <Icon aria-hidden className="size-5" />
            </span>
            <span className={cn('text-xs leading-tight', i === current ? 'font-semibold' : 'text-muted-foreground')}>{t(`steps.${key}`)}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">{t('progress', { current: current + 1, total: STEPS.length })}</p>
    </nav>
  );
}
