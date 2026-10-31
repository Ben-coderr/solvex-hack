import type { AssessmentSummary, IncidentJson, IngestAck } from '@sellekni/api-contract';
import {
  assess, decodeDzmsd, formatHHMM, generateIncidentId, mergePackets, resolveCrashTime, withCrew,
  type Assessment, type CrewVitals, type DzmsdPacket,
} from '../domain';
import { packetFromJson, rawFromJson, type ClientHint } from '../domain/json-packet';
import type { Channel, IncidentRow, IngestStore, IngestTx, ReportSource } from './ingest-store';
import { BRAND } from '../../brand';

export type InboundMessage =
  | {
      kind: 'text';
      channel: Extract<Channel, 'sms' | 'paste' | 'sim'>;
      /** exactly as received; stored raw even when it does not parse */
      text: string;
      receivedAt: Date;
      senderHash: string | null;
      /** sender number for the ACK SMS (sms channel only); goes to sms_outbox, never into reports */
      replyTo: string | null;
      /** stored raw with this code instead of decoding (e.g. 'rate_limited'): kept and shown, never creates an incident */
      quarantine?: 'rate_limited' | 'bad_webhook_payload';
    }
  | {
      kind: 'json';
      channel: Extract<Channel, 'https' | 'witness'>;
      body: IncidentJson;
      receivedAt: Date;
      senderHash: string | null;
      /** witness link (D10): join THIS incident whatever the distance/time window, while it is open (else the normal merge rule) */
      target?: string;
    };

const CLOSED: ReadonlySet<string> = new Set(['CLOSED', 'CANCELLED', 'MERGED']);

const SOURCE_OF: Record<DzmsdPacket['src'], ReportSource> = { A: 'auto', W: 'witness', M: 'sos' };

/**
 * The ingest pipeline (docs/04 §6, docs/05 §3.5, §4). One transaction:
 * decode → (unparsed: store raw, still succeed) → idempotency → same id? update : merge candidate? merge : create
 * → mergePackets → assess() server-side → incident + report + assessment(version+1) + audit (+ ACK SMS).
 */
export function ingest(msg: InboundMessage, store: IngestStore): Promise<IngestAck> {
  return store.transaction(async (tx) => {
    await tx.lockIngest();

    let packet: DzmsdPacket;
    let warnings: string[] = [];
    let hint: ClientHint | null;
    let crashedAt: Date;
    let raw: string;

    if (msg.kind === 'json') {
      raw = rawFromJson(msg.body);
      ({ packet, hint, crashedAt } = packetFromJson(msg.body));
    } else {
      raw = msg.text;
      if (msg.quarantine) return storeUnparsed(tx, msg, msg.quarantine);
      const decoded = decodeDzmsd(msg.text);
      if (!decoded.ok) return storeUnparsed(tx, msg, decoded.code);
      packet = decoded.packet;
      warnings = decoded.warnings;
      hint = { band: packet.band, score: packet.score, conf: packet.conf };
      crashedAt = resolveCrashTime(packet.time, msg.receivedAt);
    }

    const dup = await tx.findDuplicate({ clientId: packet.id, channel: msg.channel, raw, senderHash: null });
    if (dup) {
      const inc = dup.incidentId ? await tx.findIncidentByClientId(packet.id) : null;
      return ack('duplicate', dup.id, inc, null, null, msg.receivedAt);
    }

    const sameId = await tx.findIncidentByClientId(packet.id);
    const linked = msg.kind === 'json' && msg.target && !sameId ? await tx.findIncidentByClientId(msg.target) : null;
    const target = linked && !CLOSED.has(linked.status) ? linked : null;
    const candidate = sameId ?? target ?? (await tx.findMergeCandidate(packet.lat, packet.lon, crashedAt));
    const outcome = sameId ? 'updated' : candidate ? 'merged' : 'created';

    const packets = candidate ? [...(await tx.listPackets(candidate.id)), packet] : [packet];
    const merged = mergePackets(packets);
    // a later report must not drop what the crew measured (D9): their values stay on top of every re-merge
    const input = withCrew(merged.input, candidate ? await tx.listCrewVitals(candidate.id) : []);
    const a = assess(input);

    const next: IncidentRow = {
      id: candidate?.id ?? packet.id,
      status: candidate?.status ?? 'RECEIVED',
      band: candidate?.bandOverride ?? a.band,
      bandOverride: candidate?.bandOverride ?? null,
      nsi: a.score,
      conf: a.conf,
      lat: merged.lat,
      lon: merged.lon,
      plusCode: merged.plus ?? null,
      crashedAt: candidate && candidate.crashedAt < crashedAt ? candidate.crashedAt : crashedAt,
      firstChannel: candidate?.firstChannel ?? msg.channel,
      mergedCount: merged.ids.length,
    };

    const before = candidate ? snapshot(candidate) : null; // capture before the row changes
    if (candidate) {
      const { id: _id, ...patch } = next;
      await tx.updateIncident(candidate.id, patch);
    } else {
      await tx.insertIncident(next);
    }

    const reportId = await tx.insertReport({
      incidentId: next.id,
      clientId: packet.id,
      channel: msg.channel,
      source: SOURCE_OF[packet.src],
      raw,
      parsed: { packet, warnings, hint },
      parseError: null,
      senderHash: msg.senderHash,
      receivedAt: msg.receivedAt,
    });

    const version = await tx.insertAssessment({
      incidentId: next.id,
      band: a.band,
      nsi: a.score,
      conf: a.conf,
      reasons: a.reasons,
      inputs: { ...input, reportIds: merged.ids, clientHint: hint },
      engineVersion: a.engineVersion,
    });

    await tx.appendAudit({
      incidentId: next.id,
      actor: 'system',
      action: { created: 'incident.created', merged: 'incident.report_merged', updated: 'incident.report_updated' }[outcome],
      before,
      after: { ...snapshot(next), report_id: reportId, client_id: packet.id, channel: msg.channel, assessment_version: version },
      reason: null,
    });

    if (msg.kind === 'text' && msg.channel === 'sms' && msg.replyTo) {
      await tx.enqueueSms({
        to: msg.replyTo,
        body: `${BRAND.smsName} RECU ${packet.id} ${formatHHMM(msg.receivedAt)}. Appelez le 14 si vous pouvez.`,
        purpose: 'ack',
        incidentId: next.id,
      });
    }

    return ack(outcome, reportId, next, summary(a, version), null, msg.receivedAt);
  });
}

export type CrewAck = {
  incident_id: string;
  report_id: string;
  before: { band: IncidentRow['band']; nsi: number; conf: IncidentRow['conf'] };
  assessment: AssessmentSummary;
};

/**
 * D9 crew update (docs/05 §2.1, flow E): store the crew's values as a report (channel/source `crew`), re-run assess()
 * on the merged packets with every crew update on top, write assessment(version+1) + audit. Physiology can raise the
 * band to R; a dispatcher's band override still wins. `null` = no such incident, or it is closed.
 */
export function crewUpdate(
  msg: { incidentId: string; vitals: CrewVitals; receivedAt: Date; senderHash: string | null },
  store: IngestStore,
): Promise<CrewAck | null> {
  return store.transaction(async (tx) => {
    await tx.lockIngest();
    const inc = await tx.findIncidentByClientId(msg.incidentId);
    if (!inc || inc.id !== msg.incidentId || CLOSED.has(inc.status)) return null;

    const merged = mergePackets(await tx.listPackets(inc.id));
    const input = withCrew(merged.input, [...(await tx.listCrewVitals(inc.id)), msg.vitals]);
    const a = assess(input);
    const next: IncidentRow = { ...inc, band: inc.bandOverride ?? a.band, nsi: a.score, conf: a.conf };
    const before = snapshot(inc); // capture before the row changes
    await tx.updateIncident(inc.id, { band: next.band, nsi: next.nsi, conf: next.conf });

    const reportId = await tx.insertReport({
      incidentId: inc.id,
      clientId: generateIncidentId(), // a fresh id: each update is its own report (reports need one when parsed)
      channel: 'crew',
      source: 'crew',
      raw: JSON.stringify({ v: 1, crew: msg.vitals }),
      parsed: { crew: msg.vitals },
      parseError: null,
      senderHash: msg.senderHash,
      receivedAt: msg.receivedAt,
    });
    const version = await tx.insertAssessment({
      incidentId: inc.id,
      band: a.band,
      nsi: a.score,
      conf: a.conf,
      reasons: a.reasons,
      inputs: { ...input, reportIds: merged.ids, clientHint: null },
      engineVersion: a.engineVersion,
    });
    await tx.appendAudit({
      incidentId: inc.id,
      actor: 'crew',
      action: 'incident.crew_update',
      before,
      after: { ...snapshot(next), report_id: reportId, vitals: msg.vitals, assessment_version: version },
      reason: null,
    });
    return {
      incident_id: inc.id,
      report_id: reportId,
      before: { band: before.band, nsi: before.nsi, conf: before.conf },
      assessment: summary(a, version),
    };
  });
}

async function storeUnparsed(tx: IngestTx, msg: Extract<InboundMessage, { kind: 'text' }>, code: string): Promise<IngestAck> {
  const dup = await tx.findDuplicate({ clientId: null, channel: msg.channel, raw: msg.text, senderHash: msg.senderHash });
  if (dup) return ack('unparsed', dup.id, null, null, code, msg.receivedAt);

  const reportId = await tx.insertReport({
    incidentId: null,
    clientId: null,
    channel: msg.channel,
    source: 'unknown',
    raw: msg.text,
    parsed: null,
    parseError: code,
    senderHash: msg.senderHash,
    receivedAt: msg.receivedAt,
  });
  await tx.appendAudit({
    incidentId: null,
    actor: 'system',
    action: 'report.unparsed',
    before: null,
    after: { report_id: reportId, error: code, channel: msg.channel },
    reason: null,
  });
  if (msg.channel === 'sms' && msg.replyTo && !msg.quarantine) {
    await tx.enqueueSms({
      to: msg.replyTo,
      body: `${BRAND.smsName}: message recu mais illisible. Appelez le 14.`,
      purpose: 'ack',
      incidentId: null,
    });
  }
  return ack('unparsed', reportId, null, null, code, msg.receivedAt);
}

const snapshot = (i: IncidentRow) => ({
  status: i.status, band: i.band, nsi: i.nsi, conf: i.conf, merged_count: i.mergedCount,
});

export function summary(a: Assessment, version: number): AssessmentSummary {
  return {
    version,
    band: a.band,
    nsi: a.score,
    conf: a.conf,
    reasons: a.reasons.map((r) => ({ code: r.code, text: r.text, points: r.points })),
    ...(a.capNote && { cap_note: a.capNote }),
    disclaimer: a.disclaimer,
    engine_version: a.engineVersion,
  };
}

function ack(
  outcome: IngestAck['outcome'],
  reportId: string,
  incident: IncidentRow | null,
  assessment: AssessmentSummary | null,
  error: string | null,
  receivedAt: Date,
): IngestAck {
  return {
    outcome,
    report_id: reportId,
    incident_id: incident?.id ?? null,
    merged_count: incident?.mergedCount ?? null,
    assessment,
    error,
    received_at: receivedAt.toISOString(),
  };
}
