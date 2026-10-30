'use client';
import type { IngestAck } from '@sellekni/api-contract';
import type { Band, Confidence, Flag, LoadStatus, RankedHospital } from '@sellekni/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Channel } from '@/components/ui/channel-badge';
import { api } from './api';

// Wire shapes of the /api routes as the browser receives them (dates are ISO strings).

export type IncidentStatus =
  | 'RECEIVED' | 'ACKNOWLEDGED' | 'DISPATCHED' | 'EN_ROUTE' | 'ON_SCENE' | 'TRANSPORTING' | 'AT_HOSPITAL' | 'CLOSED'
  | 'CANCELLED' | 'MERGED';

export interface QueueItem {
  id: string; status: IncidentStatus; band: Band; nsi: number; conf: Confidence; lat: number; lon: number;
  plus_code: string | null; crashed_at: string; first_channel: Channel; merged_count: number; hospital_id: string | null;
  created_at: string; updated_at: string; unconfirmed_auto: boolean;
}
export interface UnparsedItem { id: string; channel: Channel; raw: string; parse_error: string; received_at: string }

export interface Reason { code: string; points: number; text: string; red?: boolean }
export interface AssessmentInputs {
  flags?: Flag[]; persons?: number; vehicles?: number; dvKmh?: number; peakG?: number; rollover?: boolean;
  spo2?: number; hr?: number; independentReports?: number;
}
export interface AuditEvent {
  id: string; incident_id?: string | null; actor: string; action: string; before: unknown; after: unknown; reason: string | null; at: string;
}
export interface PrealertRow { id: string; hospital_id: string; channel: 'web' | 'sms'; body: string; sent_at: string; acked_at: string | null; acked_by: string | null }
export interface IncidentDetail {
  incident: QueueItem & { band_override: Band | null; assigned_unit: string | null };
  assessment: { version: number; band: Band; nsi: number; conf: Confidence; reasons: Reason[]; inputs: AssessmentInputs; created_at: string } | null;
  reports: Array<{ id: string; client_id: string | null; channel: Channel; source: string; raw: string; parse_error: string | null; received_at: string }>;
  prealerts: PrealertRow[];
  audit: AuditEvent[];
  callback: string | null;
}

export type EtaProvider = 'osrm' | 'ors' | 'haversine';
export interface Recommendations {
  required: string[];
  mode: 'direct' | 'stabilise_transfer' | 'no_candidate';
  items: RankedHospital[];
  nearestEd: RankedHospital | null;
  note: string;
  etaProvider: Record<string, EtaProvider>;
  etaNotes: string[];
  coords: Record<string, { lat: number; lon: number }>;
  incident: { lat: number; lon: number };
}

export type Probe = 'ok' | 'down' | 'sim' | 'off';
export interface SystemStatus { db: Probe; smsGateway: Probe; osrm: Probe; checkedAt: string }

export interface IncomingPrealert {
  id: string; incident_id: string; channel: string; sent_at: string; acked_at: string | null; acked_by: string | null;
  band: Band; nsi: number; conf: Confidence; status: IncidentStatus; crashed_at: string;
  reasons: Reason[] | null; inputs: AssessmentInputs | null; eta_min: number | null;
}

// ───────────── queries ─────────────

export const useQueue = () =>
  useQuery({ queryKey: ['incidents'], queryFn: () => api<{ incidents: QueueItem[]; unparsed: UnparsedItem[] }>('/api/incidents') });

export const useIncident = (id: string | null) =>
  useQuery({ queryKey: ['incident', id], queryFn: () => api<IncidentDetail>(`/api/incidents/${id}`), enabled: !!id });

export const useRecommendations = (id: string | null, band?: Band) =>
  // keyed by band too: an override changes the required capabilities
  useQuery({ queryKey: ['incident', id, 'recs', band], queryFn: () => api<Recommendations>(`/api/incidents/${id}/recommendations`), enabled: !!id, refetchInterval: false });

export const useSystemStatus = () =>
  useQuery({ queryKey: ['status'], queryFn: () => api<SystemStatus>('/api/status'), refetchInterval: 10_000 });

export interface HospitalPoint { id: string; name: string; level: 'A' | 'B' | 'C'; lat: number; lon: number }
export const useHospitals = () =>
  useQuery({ queryKey: ['hospitals'], queryFn: () => api<{ set: 'demo' | 'national'; hospitals: HospitalPoint[] }>('/api/hospitals'), staleTime: Infinity });

export const useHealth = () =>
  useQuery({ queryKey: ['health'], queryFn: () => api<{ ok: true; demo: boolean; time: string; offlineTiles: boolean }>('/api/health'), refetchInterval: 10_000, retry: 0 });

export const useAudit = (incident: string | null) =>
  useQuery({ queryKey: ['audit', incident], queryFn: () => api<{ events: AuditEvent[] }>(`/api/audit${incident ? `?incident=${incident}` : ''}`) });

export const useIncoming = (hospitalId: string) =>
  useQuery({
    queryKey: ['hospital', hospitalId],
    queryFn: () => api<{ incoming: IncomingPrealert[]; status: { status: LoadStatus; setAt: number } | null }>(`/api/hospitals/${hospitalId}/prealerts`),
  });

// ───────────── mutations (every one is a human click; the server audits it) ─────────────

export type Patch =
  | { action: 'transition'; to: IncidentStatus; reason?: string }
  | { action: 'override_band'; band: Band | null; reason: string }
  | { action: 'set_hospital'; hospital_id: string; reason?: string };

export function usePatchIncident(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Patch) => api(`/api/incidents/${id}`, { method: 'PATCH', json: p }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['incident', id] });
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}

export function usePrealert(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hospitalId: string) => api<{ etaMin: number }>(`/api/incidents/${id}/prealert`, { method: 'POST', json: { hospital_id: hospitalId } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['incident', id] }),
  });
}

export function useIngest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { kind: 'paste'; text: string } | { kind: 'sim'; scenario: string }) =>
      v.kind === 'paste'
        ? api<IngestAck>('/api/sms/paste', { method: 'POST', json: { text: v.text } })
        : api<{ text: string; ack: IngestAck }>('/api/demo/replay', { method: 'POST', json: { scenario: v.scenario } }).then((r) => r.ack),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  });
}

/** Lifecycle history for the bar: who moved the incident to each step, and when (from the audit trail). */
export function lifecycleHistory(d: IncidentDetail): Record<string, { actor: string; at: string }> {
  const h: Record<string, { actor: string; at: string }> = { RECEIVED: { actor: d.incident.first_channel, at: d.incident.created_at } };
  for (const e of d.audit) {
    const to = (e.after as { status?: string } | null)?.status;
    if (e.action === 'incident.transition' && to) h[to] = { actor: e.actor, at: e.at };
  }
  return h;
}

/** Strip the role prefix from audit actors ("dispatcher:Dispatcher (demo)" → "Dispatcher (demo)"). */
export const actorName = (a: string) => a.replace(/^(dispatcher|hospital|admin):/, '');
