'use client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
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
    function subscribe(): RealtimeChannel {
      // unique topic: React dev double-mounts, and a reused topic can be closed by the previous unmount
      let ch = sb.channel(`dispatch-${Math.random().toString(36).slice(2)}`);
      for (const table of TABLES) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
          const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as { id?: string; incident_id?: string };
          const incidentId = table === 'incidents' ? row.id : row.incident_id;
          qc.invalidateQueries({ queryKey: ['incidents'] });
          if (incidentId) qc.invalidateQueries({ queryKey: ['incident', incidentId] });
          if (table === 'prealerts') qc.invalidateQueries({ queryKey: ['hospital'] });
        });
      }
      return ch.subscribe((s) => {
        setState(s === 'SUBSCRIBED' ? 'live' : s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED' ? 'down' : 'connecting');
        // anything missed while (re)connecting: refetch once
        if (s === 'SUBSCRIBED') qc.invalidateQueries();
      });
    }

    let cancelled = false;
    let ch: RealtimeChannel | null = null;
    // Keep the socket's JWT in step with the session (token refresh, sign-out).
    const { data: authSub } = sb.auth.onAuthStateChange((_e, session) => {
      void sb.realtime.setAuth(session?.access_token ?? null);
    });
    // On a full page load the session is read from cookies asynchronously: joining before that sends no token,
    // Realtime evaluates RLS as anon and silently delivers nothing. So: session first, then subscribe.
    void sb.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      await sb.realtime.setAuth(data.session?.access_token ?? null);
      if (cancelled) return;
      ch = subscribe();
    });
    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (ch) void sb.removeChannel(ch);
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
