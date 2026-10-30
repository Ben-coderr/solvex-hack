import { MERGE_RADIUS_M, MERGE_WINDOW_MIN, haversineKm, type DzmsdPacket } from '@sellekni/shared';
import type {
  AuditEvent, IncidentRow, IngestStore, IngestTx, NewAssessment, NewReport, OutboundSms,
} from '../ingest-store';

interface State {
  incidents: IncidentRow[];
  reports: Array<NewReport & { id: string }>;
  assessments: Array<NewAssessment & { version: number }>;
  audit: AuditEvent[];
  outbox: OutboundSms[];
}

const CLOSED = new Set(['CLOSED', 'CANCELLED', 'MERGED']);

/** Test double with the same semantics as the Postgres store (incl. rollback when the callback throws). */
export class MemoryStore implements IngestStore {
  state: State = { incidents: [], reports: [], assessments: [], audit: [], outbox: [] };
  /** set to make the N-th insertReport throw (atomicity tests) */
  failOnInsertReport = false;
  private seq = 0;

  async transaction<T>(fn: (tx: IngestTx) => Promise<T>): Promise<T> {
    const backup = structuredClone(this.state);
    try {
      return await fn(this.tx());
    } catch (e) {
      this.state = backup;
      throw e;
    }
  }

  private tx(): IngestTx {
    const s = () => this.state;
    return {
      lockIngest: async () => {},
      findDuplicate: async ({ clientId, channel, raw, senderHash }) => {
        const r = s().reports.find(
          (x) => x.clientId === clientId && x.channel === channel && x.raw === raw &&
            (clientId !== null || (x.senderHash ?? '') === (senderHash ?? '')),
        );
        return r ? { id: r.id, incidentId: r.incidentId } : null;
      },
      findIncidentByClientId: async (clientId) => {
        const r = s().reports.find((x) => x.clientId === clientId && x.incidentId);
        const id = r?.incidentId ?? clientId;
        return s().incidents.find((i) => i.id === id) ?? null;
      },
      findMergeCandidate: async (lat, lon, at) =>
        s().incidents
          .filter((i) => !CLOSED.has(i.status))
          .filter((i) => haversineKm(lat, lon, i.lat, i.lon) * 1000 <= MERGE_RADIUS_M)
          .filter((i) => Math.abs(i.crashedAt.getTime() - at.getTime()) <= MERGE_WINDOW_MIN * 60_000)
          .sort((a, b) => a.crashedAt.getTime() - b.crashedAt.getTime())[0] ?? null,
      listPackets: async (incidentId) =>
        s().reports.filter((r) => r.incidentId === incidentId && r.parsed).map((r) => r.parsed!.packet as DzmsdPacket),
      insertIncident: async (row) => {
        s().incidents.push({ ...row });
      },
      updateIncident: async (id, patch) => {
        const i = s().incidents.find((x) => x.id === id)!;
        Object.assign(i, patch);
      },
      insertReport: async (r) => {
        if (this.failOnInsertReport) throw new Error('simulated failure');
        const id = `r${++this.seq}`;
        s().reports.push({ ...r, id });
        return id;
      },
      insertAssessment: async (a) => {
        const version = s().assessments.filter((x) => x.incidentId === a.incidentId).length + 1;
        s().assessments.push({ ...a, version });
        return version;
      },
      latestAssessmentVersion: async (incidentId) =>
        s().assessments.filter((x) => x.incidentId === incidentId).length || null,
      appendAudit: async (e) => {
        s().audit.push(e);
      },
      enqueueSms: async (m) => {
        s().outbox.push(m);
      },
    };
  }
}
