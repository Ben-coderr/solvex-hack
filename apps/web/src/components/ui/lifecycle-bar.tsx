'use client';
import { LIFECYCLE_STEPS, type LifecycleStep } from '@najda/ui-core';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export interface LifecycleBarProps {
  current: LifecycleStep;
  /** who/when for steps already done */
  history?: Partial<Record<LifecycleStep, { actor: string; time: string }>>;
  /** steps the dispatcher may click now (from the server's transition table) */
  allowed?: readonly LifecycleStep[];
  onStep?: (step: LifecycleStep) => void;
  className?: string;
}

/** Eight steps, each a human click (never automatic). Follows reading direction: mirrors in RTL. */
export function LifecycleBar({ current, history = {}, allowed = [], onStep, className }: LifecycleBarProps) {
  const t = useTranslations('lifecycle');
  const idx = LIFECYCLE_STEPS.indexOf(current);
  return (
    <ol className={cn('flex gap-1 overflow-x-auto pb-1', className)}>
      {LIFECYCLE_STEPS.map((step, i) => {
        const done = i < idx;
        const isCurrent = i === idx;
        const enabled = allowed.includes(step);
        const h = history[step];
        return (
          <li key={step} className="min-w-28 flex-1">
            <button
              type="button"
              disabled={!enabled}
              title={!enabled && !done && !isCurrent ? t('blocked') : undefined}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => onStep?.(step)}
              className={cn(
                'flex h-full min-h-14 w-full flex-col items-start gap-0.5 border-t-4 px-2 pt-1.5 text-start text-sm',
                done && 'border-text',
                isCurrent && 'border-brand-fill font-semibold',
                !done && !isCurrent && 'border-line text-muted-foreground',
                enabled && 'rounded-b-sm text-text hover:bg-raised',
                'disabled:cursor-not-allowed',
              )}
            >
              <span className="inline-flex items-center gap-1">
                {done && <Check aria-hidden className="size-3.5" />}
                {t(step)}
              </span>
              {h && <span className="packet-ltr text-xs font-normal text-muted-foreground">{t('by', { actor: h.actor, time: h.time })}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
