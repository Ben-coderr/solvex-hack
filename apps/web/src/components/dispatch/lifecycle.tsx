'use client';
import { LIFECYCLE_STEPS, type LifecycleStep } from '@sellekni/ui-core';
import { Ban, GitMerge } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LifecycleBar } from '@/components/ui/lifecycle-bar';
import { hhmm } from '@/lib/api';
import { actorName, lifecycleHistory, usePatchIncident, type IncidentDetail, type IncidentStatus } from '@/lib/dispatch';
import { TRANSITIONS } from '@/server/domain/lifecycle';
import { cn } from '@/lib/utils';
import { ReasonDialog } from './reason-dialog';

/** D4: the eight steps as buttons + "False alarm…" (reason required). Nothing advances by itself. */
export function LifecyclePanel({ detail, compact = false }: { detail: IncidentDetail; /** narrow drawer: 2 rows of 4 */ compact?: boolean }) {
  const t = useTranslations('lifecycle');
  const t2 = useTranslations('lifecycle2');
  const { incident } = detail;
  const patch = usePatchIncident(incident.id);
  const [cancelOpen, setCancelOpen] = useState(false);
  const status = incident.status;
  const next = TRANSITIONS[status] as readonly IncidentStatus[];

  if (status === 'CANCELLED' || status === 'MERGED') {
    const e = [...detail.audit].reverse().find((a) => (a.after as { status?: string } | null)?.status === status);
    return (
      <div role="status" data-testid="lifecycle-final" className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line px-3 py-2.5 text-base">
        {status === 'CANCELLED' ? <Ban aria-hidden className="size-5 text-muted-foreground" /> : <GitMerge aria-hidden className="size-5 text-muted-foreground" />}
        <span className="font-semibold">{status === 'CANCELLED' ? t2('cancelled') : t2('merged')}</span>
        {e && <span className="text-sm text-muted-foreground">{t('by', { actor: actorName(e.actor), time: hhmm(e.at) })}{e.reason ? ` · “${e.reason}”` : ''}</span>}
      </div>
    );
  }

  const current = status as LifecycleStep;
  const idx = LIFECYCLE_STEPS.indexOf(current);
  const allowed = LIFECYCLE_STEPS.filter((s) => next.includes(s));
  const nextNames = allowed.map((s) => t(s)).join(' / ');
  const why: Partial<Record<LifecycleStep, string>> = {};
  for (const [i, s] of LIFECYCLE_STEPS.entries()) {
    if (allowed.includes(s)) continue;
    why[s] = i <= idx ? t2('whyDone') : next.length === 0 ? t2('whyFinal') : t2('whyOrder', { next: nextNames });
  }
  const history = Object.fromEntries(
    Object.entries(lifecycleHistory(detail)).map(([k, v]) => [k, { actor: actorName(v.actor), time: hhmm(v.at) }]),
  );

  return (
    <div className="flex flex-col gap-2" data-testid="lifecycle">
      <LifecycleBar
        current={current}
        allowed={allowed}
        history={history}
        why={why}
        busy={patch.isPending}
        onStep={(to) => patch.mutate({ action: 'transition', to })}
        // steps share the width (labels wrap) so all eight stay visible at 1366 px; 2 rows of 4 in a narrow drawer
        className={cn('[&>li]:min-w-0', compact && 'grid grid-cols-4 gap-y-2 overflow-visible')}
      />
      <div className="flex flex-wrap items-center gap-2">
        {patch.error && <p role="alert" className="text-sm text-status-danger">{patch.error.message}</p>}
        {next.includes('CANCELLED') && (
          <Button variant="ghost" size="sm" className="ms-auto text-muted-foreground" onClick={() => setCancelOpen(true)}>
            <Ban aria-hidden />
            {t2('cancel')}
          </Button>
        )}
      </div>
      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t2('cancelTitle')}
        description={t2('cancelHint')}
        busy={patch.isPending}
        error={cancelOpen ? patch.error?.message : null}
        onConfirm={(reason) => patch.mutate({ action: 'transition', to: 'CANCELLED', reason }, { onSuccess: () => setCancelOpen(false) })}
      />
    </div>
  );
}
