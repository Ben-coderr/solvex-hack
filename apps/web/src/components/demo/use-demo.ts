'use client';
import type { IngestAck } from '@sellekni/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

export interface DemoPhones {
  latest: { id: string; band: 'R' | 'O' | 'Y' | 'G' | 'U'; nsi: number; conf: 'H' | 'M' | 'L'; merged_count: number; status: string; created_at: string } | null;
  lastPacket: { raw: string; channel: string; received_at: string } | null;
  witness: { url: string; svg: string } | null;
  sms: Array<{ id: string; to_number: string | null; body: string; purpose: string; status: string; created_at: string }>;
}

export type DemoRun = { scenario: string } | { action: 'witness' | 'duplicate' };

/** Polled every 2 s (docs/17 §2: polling is the Realtime fallback, and good enough for a stage page). */
export const useDemoPhones = () =>
  useQuery({ queryKey: ['demo', 'phones'], queryFn: () => api<DemoPhones>('/api/demo/phones'), refetchInterval: 2000 });

export function useDemoRun(onStart?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (run: DemoRun) => api<{ text: string; ack: IngestAck }>('/api/demo/replay', { method: 'POST', json: run }),
    onMutate: () => onStart?.(),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['demo'] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
    },
  });
}

export function useDemoReset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ms: number; clean: boolean; counts: Record<string, number> }>('/api/demo/reset', { method: 'POST' }),
    onSettled: () => qc.invalidateQueries(),
  });
}

/** "Merged into K7Q2M · ×2" — what the last button did, in words. */
export function useOutcomeText() {
  const t = useTranslations('demo.outcome');
  return (ack: IngestAck) =>
    ack.outcome === 'unparsed'
      ? t('unparsed', { error: ack.error ?? '?' })
      : t(ack.outcome, { id: ack.incident_id ?? '?', count: ack.merged_count ?? 1 });
}
