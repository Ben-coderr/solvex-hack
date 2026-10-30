'use client';
import { List, Map as MapIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Skeleton } from '@/components/ui/states';
import { StatusBanner } from '@/components/ui/status-banner';
import { useHealth, useIncident, useQueue } from '@/lib/dispatch';
import { cn } from '@/lib/utils';
import { AppHeader } from './app-header';
import { IncidentDrawer } from './incident-drawer';
import { IngestButtons } from './ingest-dialogs';
import type { RouteHint } from './incident-map';
import { LifecyclePanel } from './lifecycle';
import { Queue } from './queue';
import { StatusStrip, useConnectivity, type TilesMode } from './status-strip';

// MapLibre touches window/WebGL: client only, with a skeleton the size of the map.
const IncidentMap = dynamic(() => import('./incident-map').then((m) => m.IncidentMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

const NEW_PULSE_MS = 6_000;

function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia('(min-width: 1024px)');
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia('(min-width: 1024px)').matches,
    () => true,
  );
}

/** Ids that appeared after the first load pulse for a few seconds (pin + row), then calm down. */
function useNewIds(ids: readonly string[] | undefined) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!ids) return;
    if (!seen.current) {
      seen.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seen.current!.has(id));
    if (!added.length) return;
    added.forEach((id) => seen.current!.add(id));
    setFresh((s) => new Set([...s, ...added]));
    const timer = setTimeout(() => setFresh((s) => new Set([...s].filter((id) => !added.includes(id)))), NEW_PULSE_MS);
    return () => clearTimeout(timer);
  }, [ids]);
  return fresh;
}

function SelectedLifecycle({ id }: { id: string }) {
  const q = useIncident(id);
  if (!q.data) return <Skeleton className="h-16 w-full" />;
  return <LifecyclePanel detail={q.data} />;
}

/** D1: status strip · queue (360 px) · map · detail drawer (480 px) · lifecycle bar under the map. */
export function Dashboard() {
  const t = useTranslations('app');
  const queue = useQueue();
  const health = useHealth();
  const conn = useConnectivity();
  const desktop = useDesktop();
  // ?i=<id> keeps the open incident across reloads and makes it linkable.
  const [selected, setSelected] = useState<string | null>(useSearchParams().get('i'));
  const [tiles, setTiles] = useState<TilesMode>('online');
  const [route, setRoute] = useState<RouteHint | null>(null);
  const [view, setView] = useState<'list' | 'map'>('list');
  const incidents = queue.data?.incidents;
  const newIds = useNewIds(incidents?.map((i) => i.id));

  const select = useCallback((id: string | null) => {
    setSelected(id);
    setRoute(null);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('i', id);
    else url.searchParams.delete('i');
    window.history.replaceState(null, '', url);
  }, []);
  const onTiles = useCallback((m: TilesMode) => setTiles(m), []);

  const demo = health.data?.demo ?? false;
  const showMap = desktop || view === 'map';

  return (
    <div data-projection className="flex h-dvh flex-col overflow-hidden">
      {demo && <StatusBanner mode="demo" />}
      {conn !== 'online' && <StatusBanner mode={conn} />}
      <AppHeader actions={<IngestButtons demo={demo} onOpenIncident={select} />} />
      <StatusStrip tiles={tiles} className="border-b border-line bg-surface px-4 py-1.5" />

      {!desktop && (
        <div role="tablist" aria-label={t('view')} className="flex border-b border-line bg-surface">
          {(['list', 'map'] as const).map((v) => (
            <button key={v} role="tab" type="button" aria-selected={view === v} onClick={() => setView(v)}
              className={cn('inline-flex min-h-12 flex-1 items-center justify-center gap-2 border-b-2 text-base',
                view === v ? 'border-brand-fill font-semibold' : 'border-transparent text-muted-foreground')}>
              {v === 'list' ? <List aria-hidden className="size-4" /> : <MapIcon aria-hidden className="size-4" />}
              {t(v)}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {(desktop || view === 'list') && (
          <section aria-label={t('queue')} className="min-h-0 w-full shrink-0 overflow-y-auto border-e border-line bg-bg lg:w-[360px]">
            <Queue
              incidents={incidents}
              unparsed={queue.data?.unparsed}
              loading={queue.isLoading}
              error={queue.isError}
              stale={queue.isError && !!queue.data}
              selectedId={selected}
              newIds={newIds}
              onSelect={select}
              onRetry={() => queue.refetch()}
            />
          </section>
        )}
        {showMap && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              <div className="relative min-w-0 flex-1">
                <IncidentMap incidents={incidents ?? []} selectedId={selected} newIds={newIds} route={route} onSelect={select} onTiles={onTiles} />
              </div>
              {selected && desktop && (
                <IncidentDrawer key={selected} id={selected} onClose={() => select(null)} onRoute={setRoute} lifecycleInside={false}
                  className="w-[480px] shrink-0" />
              )}
            </div>
            {selected && desktop && (
              <div className="border-t border-line bg-surface px-4 pt-2 pb-1">
                <SelectedLifecycle id={selected} />
              </div>
            )}
          </div>
        )}
      </div>

      {selected && !desktop && (
        <IncidentDrawer key={selected} id={selected} onClose={() => select(null)} onRoute={setRoute} lifecycleInside
          className="fixed inset-y-0 end-0 z-40 w-full max-w-[480px] shadow-2xl" />
      )}
    </div>
  );
}
