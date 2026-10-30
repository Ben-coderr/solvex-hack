'use client';
import { LIFECYCLE_STEPS, type LifecycleStep } from '@sellekni/ui-core';
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
  /** localised reason a step cannot be clicked now (tooltip + screen-reader text) */
  why?: Partial<Record<LifecycleStep, string>>;
  /** a request is in flight: every step waits */
  busy?: boolean;
  className?: string;
}

/** Eight steps, each a human click (never automatic). Follows reading direction: mirrors in RTL. */
export function LifecycleBar({ current, history = {}, allowed = [], onStep, why = {}, busy, className }: LifecycleBarProps) {
  const t = useTranslations('lifecycle');
  const idx = LIFECYCLE_STEPS.indexOf(current);
  return (
    <ol className={cn('flex gap-1 overflow-x-auto pb-1', className)}>
      {LIFECYCLE_STEPS.map((step, i) => {
        const done = i < idx;
        const isCurrent = i === idx;
        const enabled = allowed.includes(step) && !busy;
        const h = history[step];
        // aria-disabled, not disabled: a disabled button never shows its tooltip, and the "why" must be readable.
        const blockedWhy = enabled ? undefined : (why[step] ?? (!done && !isCurrent ? t('blocked') : undefined));
        return (
          <li key={step} className="min-w-28 flex-1">
            <button
              type="button"
              aria-disabled={!enabled}
              title={blockedWhy}
              data-step={step}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => enabled && onStep?.(step)}
              className={cn(
                'flex h-full min-h-14 w-full flex-col items-start gap-0.5 border-t-4 px-2 pt-1.5 text-start text-sm',
                done && 'border-text',
                isCurrent && 'border-brand-fill font-semibold',
                !done && !isCurrent && 'border-line text-muted-foreground',
                enabled && 'rounded-b-sm text-text hover:bg-raised',
                'aria-disabled:cursor-not-allowed',
              )}
            >
              <span className="inline-flex items-center gap-1">
                {done && <Check aria-hidden className="size-3.5" />}
                {t(step)}
              </span>
              {h && <span className="packet-ltr text-xs font-normal text-muted-foreground">{t('by', { actor: h.actor, time: h.time })}</span>}
              {blockedWhy && <span className="sr-only">{blockedWhy}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
