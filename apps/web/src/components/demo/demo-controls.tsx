'use client';
import { CopyX, MessageSquareText, RotateCcw, ShieldAlert, UserRoundPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDemoReset, useDemoRun, useOutcomeText, type DemoRun } from './use-demo';

const SCENARIOS = ['rollover', 'frontal', 'witness_near_rollover', 'witness_oran', 'bad_crc'] as const;
const ACTIONS = [['witness', UserRoundPlus], ['duplicate', CopyX]] as const;

/** Scenario + action buttons and the two-step Reset. `onStart` (the stopwatch) fires on the first scenario tap. */
export function DemoControls({ onStart, onReset, compact }: { onStart?: () => void; onReset?: () => void; compact?: boolean }) {
  const t = useTranslations('demo');
  const run = useDemoRun();
  const reset = useDemoReset();
  const outcome = useOutcomeText();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000); // a stray click cannot wipe the stage
    return () => clearTimeout(id);
  }, [armed]);

  const fire = (r: DemoRun) => {
    if ('scenario' in r) onStart?.();
    run.mutate(r);
  };

  return (
    <section aria-labelledby="ctl-h" className="flex flex-col gap-4 rounded-md border border-line bg-surface p-4">
      <h2 id="ctl-h" className="text-lg font-semibold">{t('scenarios')}</h2>
      <div className={cn('grid gap-2', compact ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-2')}>
        {SCENARIOS.map((s) => (
          <Button key={s} variant="outline" size="lg" className="h-auto min-h-14 justify-start whitespace-normal text-start text-base"
            disabled={run.isPending} data-testid={`demo-${s}`} onClick={() => fire({ scenario: s })}>
            {s === 'bad_crc' ? <ShieldAlert aria-hidden /> : <MessageSquareText aria-hidden />}
            {t(`scenario.${s}`)}
          </Button>
        ))}
      </div>
      <h3 className="text-base font-medium text-muted-foreground">{t('actions')}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {ACTIONS.map(([a, Icon]) => (
          <Button key={a} variant="outline" size="lg" className="h-auto min-h-14 justify-start whitespace-normal text-start text-base"
            disabled={run.isPending} data-testid={`demo-${a}`} onClick={() => fire({ action: a })}>
            <Icon aria-hidden />
            {t(`action.${a}`)}
          </Button>
        ))}
      </div>
      <p role="status" aria-live="polite" data-testid="demo-outcome" className="min-h-7 text-lg">
        {run.data && !run.isPending && outcome(run.data.ack)}
        {run.error && <span className="text-status-danger">{t('error', { message: run.error.message })}</span>}
      </p>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <Button variant={armed ? 'destructive' : 'outline'} size="lg" className="h-auto min-h-14 self-start whitespace-normal"
          disabled={reset.isPending} data-testid={armed ? 'demo-reset-confirm' : 'demo-reset'}
          onClick={() => {
            if (!armed) return setArmed(true);
            setArmed(false);
            reset.mutate(undefined, { onSuccess: () => onReset?.() });
          }}>
          <RotateCcw aria-hidden />
          {reset.isPending ? t('resetting') : armed ? t('resetConfirm') : t('reset')}
        </Button>
        <p role="status" aria-live="polite" data-testid="demo-reset-result" data-clean={reset.data?.clean}
          className={cn('text-base', reset.data && (reset.data.clean ? 'text-status-ok' : 'text-status-danger'))}>
          {reset.data &&
            (reset.data.clean
              ? `✓ ${t('resetOk', { ms: reset.data.ms })}${reset.data.ms > 5000 ? ` · ${t('resetSlow')}` : ''}`
              : t('resetDirty', { rows: Object.entries(reset.data.counts).map(([k, v]) => `${k} ${v}`).join(', ') }))}
          {reset.error && t('error', { message: reset.error.message })}
        </p>
      </div>
    </section>
  );
}
