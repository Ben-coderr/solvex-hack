import type { Band, Confidence, DzmsdPacket } from '@sellekni/shared';
import type { CrewVitals } from '../domain/crew';
import type { ClientHint } from '../domain/json-packet';

export type Channel = 'https' | 'sms' | 'paste' | 'witness' | 'sim' | 'crew';
export type ReportSource = 'auto' | 'witness' | 'sos' | 'crew' | 'unknown';
export type IncidentStatus =
  | 'RECEIVED' | 'ACKNOWLEDGED' | 'DISPATCHED' | 'EN_ROUTE' | 'ON_SCENE'
  | 'TRANSPORTING' | 'AT_HOSPITAL' | 'CLOSED' | 'CANCELLED' | 'MERGED';

export interface IncidentRow {
  id: string;
  status: IncidentStatus;
  /** what the dashboard shows: the dispatcher's override if any, else the computed band */
  band: Band;
  /** set only by a human override (reason audited); survives re-assessment */
  bandOverride: Band | null;
  nsi: number;
  conf: Confidence;
  lat: number;
  lon: number;
  plusCode: string | null;
  crashedAt: Date;
  firstChannel: Channel;
  mergedCount: number;
}

/** What `reports.parsed` holds: the decoded packet, decoder warnings, and the phone's own estimate (audit only). */
export interface ParsedReport {
  packet: DzmsdPacket;
  warnings: string[];
  hint: ClientHint | null;
}

/** What `reports.parsed` holds for a crew update (D9): the values typed by the crew; there is no packet. */
export interface CrewReport {
  crew: CrewVitals;
}

export interface StoredReport {
  id: string;
  incidentId: string | null;
}

export interface NewReport {
  incidentId: string | null;
  clientId: string | null;
  channel: Channel;
  source: ReportSource;
  raw: string;
  parsed: ParsedReport | CrewReport | null;
  parseError: string | null;
  senderHash: string | null;
  receivedAt: Date;
}

export interface NewAssessment {
  incidentId: string;
  band: Band;
  nsi: number;
  conf: Confidence;
  reasons: unknown;
  inputs: unknown;
  engineVersion: string;
}

export interface AuditEvent {
  incidentId: string | null;
  actor: string;
  action: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export interface OutboundSms {
  to: string;
  body: string;
  purpose: 'ack' | 'prealert' | 'status_reply' | 'crew_update';
  incidentId: string | null;
}

/** Everything ingest needs from storage, inside ONE transaction. Postgres in production, in-memory in unit tests. */
export interface IngestTx {
  /** Serialises concurrent ingests so two nearby first reports cannot both create an incident. */
  lockIngest(): Promise<void>;
  /** Exact re-delivery: same client id (or none, for unparsed), channel, raw text and (unparsed only) sender. */
  findDuplicate(q: { clientId: string | null; channel: Channel; raw: string; senderHash: string | null }): Promise<StoredReport | null>;
  /** Incident that already holds a report with this packet id (FOR UPDATE). */
  findIncidentByClientId(clientId: string): Promise<IncidentRow | null>;
  /** Open incident within MERGE_RADIUS_M and ±MERGE_WINDOW_MIN of `at`, earliest first (FOR UPDATE). */
  findMergeCandidate(lat: number, lon: number, at: Date): Promise<IncidentRow | null>;
  /** Decoded packets of an incident in receive order (crew updates have none). */
  listPackets(incidentId: string): Promise<DzmsdPacket[]>;
  /** Crew updates of an incident in receive order (D9). */
  listCrewVitals(incidentId: string): Promise<CrewVitals[]>;
  insertIncident(row: IncidentRow): Promise<void>;
  updateIncident(id: string, patch: Partial<Omit<IncidentRow, 'id'>>): Promise<void>;
  insertReport(r: NewReport): Promise<string>;
  /** Inserts the next version and returns it. */
  insertAssessment(a: NewAssessment): Promise<number>;
  latestAssessmentVersion(incidentId: string): Promise<number | null>;
  appendAudit(e: AuditEvent): Promise<void>;
  enqueueSms(m: OutboundSms): Promise<void>;
}

export interface IngestStore {
  transaction<T>(fn: (tx: IngestTx) => Promise<T>): Promise<T>;
}
