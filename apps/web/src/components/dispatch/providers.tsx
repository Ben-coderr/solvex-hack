'use client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

type RealtimeState = 'connecting' | 'live' | 'down';
const RealtimeCtx = createContext<RealtimeState>('connecting');
export const useRealtimeState = () => useContext(RealtimeCtx);

const TABLES = ['incidents', 'reports', 'assessments', 'prealerts'] as const;

/** Realtime → TanStack Query invalidation: the server stays the single source of truth, pushes only say "refetch". */
function RealtimeBridge({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<RealtimeState>('connecting');
  useEffect(() => {
    const sb = supabaseBrowser();
    let ch = sb.channel('dispatch');
    for (const table of TABLES) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
        const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as { id?: string; incident_id?: string };
        const incidentId = table === 'incidents' ? row.id : row.incident_id;
        qc.invalidateQueries({ queryKey: ['incidents'] });
        if (incidentId) qc.invalidateQueries({ queryKey: ['incident', incidentId] });
        if (table === 'prealerts') qc.invalidateQueries({ queryKey: ['hospital'] });
      });
    }
    ch.subscribe((s) => setState(s === 'SUBSCRIBED' ? 'live' : s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED' ? 'down' : 'connecting'));
    return () => {
      sb.removeChannel(ch);
    };
  }, [qc]);
  return <RealtimeCtx.Provider value={state}>{children}</RealtimeCtx.Provider>;
}

export function DispatchProviders({ children }: { children: ReactNode }) {
  // Realtime does the pushing; polling every 15 s is only the safety net when the socket is down.
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchInterval: 15_000, retry: 1 } } }));
  return (
    <QueryClientProvider client={qc}>
      <RealtimeBridge>{children}</RealtimeBridge>
    </QueryClientProvider>
  );
}
