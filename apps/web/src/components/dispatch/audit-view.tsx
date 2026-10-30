'use client';
import { IncidentId } from '@najda/api-contract';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fieldCls } from '@/components/ui/dialog';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { StatusBanner } from '@/components/ui/status-banner';
import { hhmm } from '@/lib/api';
import { actorName, useAudit, useHealth } from '@/lib/dispatch';
import { cn } from '@/lib/utils';
import { AppHeader } from './app-header';
import { useConnectivity } from './status-strip';

/** before/after as "key: value" lines; nothing hidden, nothing reformatted beyond that. */
function Delta({ v }: { v: unknown }) {
  if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof v !== 'object') return <span className="packet-ltr font-mono">{String(v)}</span>;
  return (
    <dl className="packet-ltr grid grid-cols-[auto_1fr] gap-x-2 font-mono text-sm">
      {Object.entries(v as Record<string, unknown>).map(([k, x]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="[overflow-wrap:anywhere]">{x === null ? '—' : typeof x === 'object' ? JSON.stringify(x) : String(x)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** D7: every automated suggestion and human decision — who, what, before/after, reason, when — filterable by incident. */
export function AuditView() {
  const t = useTranslations();
  const conn = useConnectivity();
  const demo = useHealth().data?.demo ?? false;
  const initial = useSearchParams().get('incident');
  const [filter, setFilter] = useState<string | null>(initial);
  const [draft, setDraft] = useState(initial ?? '');
  const apply = (id: string | null) => {
    setFilter(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('incident', id);
    else url.searchParams.delete('incident');
    window.history.replaceState(null, '', url);
  };
  const q = useAudit(filter);
  const valid = IncidentId.safeParse(draft.trim().toUpperCase()).success;

  return (
    <div data-projection className="flex min-h-dvh flex-col">
      {demo && <StatusBanner mode="demo" />}
      {conn !== 'online' && <StatusBanner mode={conn} />}
      <AppHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
        <h1 className="font-display text-3xl font-semibold">{t('auditPage.title')}</h1>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (valid) apply(draft.trim().toUpperCase()); }}>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">{t('auditPage.filter')}</span>
            <input dir="ltr" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={5} placeholder="K7Q2M" data-testid="audit-filter"
              className={cn(fieldCls, 'min-h-12 w-40 font-mono text-lg uppercase')} />
          </label>
          <Button type="submit" disabled={!valid}><Search aria-hidden />{t('auditPage.apply')}</Button>
          {filter && <Button type="button" variant="ghost" onClick={() => { setDraft(''); apply(null); }}><X aria-hidden />{t('auditPage.all')}</Button>}
        </form>

        {q.isLoading ? (
          <SkeletonRows rows={6} />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : !q.data?.events.length ? (
          <EmptyState title={t('auditPage.empty')} body={t('auditPage.emptyBody')} />
        ) : (
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full min-w-[72rem] text-start text-lg" data-testid="audit-table">
              <thead className="bg-surface text-sm text-muted-foreground">
                <tr>
                  {(['when', 'who', 'what', 'before', 'after', 'reason'] as const).map((c) => (
                    <th key={c} scope="col" className={cn('px-3 py-2 text-start font-medium', (c === 'before' || c === 'after') && 'min-w-64')}>{t(`auditPage.${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.data.events.map((e) => (
                  <tr key={e.id} className="border-t border-line align-top" data-action={e.action}>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="packet-ltr font-display tabular-nums">{hhmm(e.at)}</span>
                      {e.incident_id && !filter && (
                        <button type="button" className="ms-2 font-mono text-sm text-brand-text hover:underline" onClick={() => { setDraft(e.incident_id!); apply(e.incident_id!); }}>
                          {e.incident_id}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">{actorName(e.actor)}</td>
                    <td className="px-3 py-2 font-medium">{t.has(`action.${e.action}`) ? t(`action.${e.action}` as 'action.prealert.sent') : e.action}</td>
                    <td className="px-3 py-2"><Delta v={e.before} /></td>
                    <td className="px-3 py-2"><Delta v={e.after} /></td>
                    <td className="px-3 py-2">{e.reason ?? <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
