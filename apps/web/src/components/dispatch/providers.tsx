'use client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Health } from '@/server/health';

type RealtimeState = 'connecting' | 'live' | 'down';
const RealtimeCtx = createContext<RealtimeState>('connecting');
export const useRealtimeState = () => useContext(RealtimeCtx);

const TABLES = ['incidents', 'reports', 'assessments', 'prealerts'] as const;
/**
 * One ingest writes 3+ rows (incident, report, assessment): each push used to refetch the whole list, so a burst of
 * 20 arrivals gave 52 list refetches and hit the dispatcher's own rate limit (P7 perf pass). Pushes are now
 * collected for this long and invalidate each query once.
 */
const COALESCE_MS = 250;

/** Realtime → TanStack Query invalidation: the server stays the single source of truth, pushes only say "refetch". */
function RealtimeBridge({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<RealtimeState>('connecting');
  useEffect(() => {
    const sb = supabaseBrowser();
    const pending = new Set<string>(); // JSON query keys
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = (...keys: unknown[][]) => {
      for (const k of keys) pending.add(JSON.stringify(k));
      flushTimer ??= setTimeout(() => {
        flushTimer = null;
        const keys = [...pending].map((k) => JSON.parse(k) as unknown[]);
        pending.clear();
        for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
      }, COALESCE_MS);
    };
    function subscribe(): RealtimeChannel {
      // unique topic: React dev double-mounts, and a reused topic can be closed by the previous unmount
      let ch = sb.channel(`dispatch-${Math.random().toString(36).slice(2)}`);
      for (const table of TABLES) {
        ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
          const row = (p.new && Object.keys(p.new).length ? p.new : p.old) as { id?: string; incident_id?: string };
          const incidentId = table === 'incidents' ? row.id : row.incident_id;
          invalidate(['incidents']);
          if (incidentId) invalidate(['incident', incidentId]);
          // a crew update changes the incident, not the pre-alert: the ED view must follow both (D9)
          if (table === 'prealerts' || table === 'incidents') invalidate(['hospital']);
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
      if (flushTimer) clearTimeout(flushTimer);
      authSub.subscription.unsubscribe();
      if (ch) void sb.removeChannel(ch);
    };
  }, [qc]);

  return <RealtimeCtx.Provider value={state}>{children}</RealtimeCtx.Provider>;
}

/**
 * `health`: the server's /api/health answer rendered into the page. Without it the DEMO banner and the demo links
 * appeared ~170 ms after first paint and pushed the whole dashboard down (CLS 0.11, P7 perf pass).
 */
export function DispatchProviders({ children, health }: { children: ReactNode; health?: Health }) {
  // Realtime does the pushing; polling every 15 s is only the safety net when the socket is down.
  const [qc] = useState(() => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchInterval: 15_000, retry: 1 } } });
    if (health) client.setQueryData(['health'], health);
    return client;
  });
  return (
    <QueryClientProvider client={qc}>
      <RealtimeBridge>{children}</RealtimeBridge>
    </QueryClientProvider>
  );
}
