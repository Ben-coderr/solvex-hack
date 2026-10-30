/**
 * Outbox: every alert is persisted BEFORE anything is sent and survives a kill/reboot (SQLite store in the app,
 * memory store in tests). `attemptHttps` is the HTTPS step of the chain; `chain.ts` plans the SMS steps and
 * `runner.ts` drives both (docs/04 §3.3). Every channel's state is persisted in the item, so a killed app resumes
 * where it was; re-sending after a kill is harmless because ingest is idempotent on the incident id.
 */
import type { IncidentJson, IngestAck } from '@najda/api-contract';
import type { PostResult } from './https';

export type HttpsState = 'pending' | 'retrying' | 'acked' | 'rejected' | 'gave_up';

export interface OutboxItem {
  id: string;
  wire: string;
  json: IncidentJson;
  createdAt: number;
  /** null = no fix at all when the alert was built */
  locationAgeMin: number | null;
  diallerOpenedAt: number | null;
  https: { state: HttpsState; attempts: number; nextAt: number | null; lastError: string | null };
  /** Android never reports whether a composer SMS was actually sent: only that we opened it, and to whom */
  sms: { composerOpenedAt: number | null; to: string | null };
  /** silent SMS, one entry per destination: 'gw1', 'gw2', 'contact:<number>' */
  smsOut: Record<string, SmsMsg>;
  ack: IngestAck | null;
  ackAt: number | null;
  /** 30 min without an ACK: nothing more is sent, and the screen says so */
  gaveUpAt: number | null;
}

export type SmsMsgState = 'sending' | 'sent' | 'delivered' | 'failed';

export interface SmsMsg {
  key: string;
  to: string;
  /** packet = the DZ-MSD wire to a gateway; human = readable text to an emergency contact */
  kind: 'packet' | 'human';
  state: SmsMsgState;
  attempts: number;
  /** `${incidentId}.${key}.${attempt}`: the native result event carries it */
  msgId: string;
  firstAt: number;
  lastAt: number;
  sentAt: number | null;
  deliveredAt: number | null;
  /** when a failed message may be sent again */
  nextAt: number | null;
  code: string | null;
}

export interface OutboxStore {
  put(item: OutboxItem): Promise<void>;
  get(id: string): Promise<OutboxItem | null>;
  /** newest first */
  list(): Promise<OutboxItem[]>;
}

export const BACKOFF_BASE_MS = 10_000;
export const BACKOFF_CAP_MS = 5 * 60_000;
export const GIVE_UP_MS = 30 * 60_000;

/** 10 s · 2ⁿ, capped at 5 min (docs/04 §3.3). n = attempts already made, starting at 0. */
export const backoffMs = (n: number) => Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, n));

export function newItem(id: string, wire: string, json: IncidentJson, now: number, locationAgeMin: number | null): OutboxItem {
  return {
    id, wire, json, createdAt: now, locationAgeMin, diallerOpenedAt: null,
    https: { state: 'pending', attempts: 0, nextAt: now, lastError: null },
    sms: { composerOpenedAt: null, to: null },
    smsOut: {},
    ack: null, ackAt: null, gaveUpAt: null,
  };
}

/** Items persisted by an older build lack newer fields: fill them so the UI never reads undefined. */
export const normalizeItem = (i: OutboxItem): OutboxItem => ({
  ...i, sms: i.sms ?? { composerOpenedAt: null, to: null }, smsOut: i.smsOut ?? {}, gaveUpAt: i.gaveUpAt ?? null,
});

/** the HTTPS channel still has work to do */
export const isOpen = (i: OutboxItem) => i.https.state === 'pending' || i.https.state === 'retrying';
/** the alert as a whole: no ACK yet and not given up (a rejected HTTPS post still leaves SMS to try) */
export const alertOpen = (i: OutboxItem) => i.ack === null && i.gaveUpAt === null;
export const isDue = (i: OutboxItem, now: number) => isOpen(i) && (i.https.nextAt ?? 0) <= now;

export interface AttemptDeps {
  now(): number;
  probe(): Promise<boolean>;
  /** full JSON, 8 s */
  post(json: IncidentJson): Promise<PostResult>;
  /** compact JSON, 15 s: tried when the full post timed out or the network dropped (not when it was rejected) */
  postCompact?(json: IncidentJson): Promise<PostResult>;
}

/** The same contract with the optional blocks removed (medical profile, device info): what scoring needs, < 1 KB. */
export function compactJson(json: IncidentJson): IncidentJson {
  const { medical: _m, device: _d, ...rest } = json;
  return rest;
}

/** One HTTPS delivery attempt. Returns the updated item (the caller persists it). Never throws. */
export async function attemptHttps(item: OutboxItem, d: AttemptDeps): Promise<OutboxItem> {
  if (!isOpen(item)) return item;
  const start = d.now();
  if (start - item.createdAt > GIVE_UP_MS) {
    return { ...item, https: { ...item.https, state: 'gave_up', nextAt: null } };
  }
  const retry = (err: string): OutboxItem => {
    const n = item.https.attempts;
    return { ...item, https: { state: 'retrying', attempts: n + 1, nextAt: d.now() + backoffMs(n), lastError: err } };
  };
  if (!(await d.probe())) return retry('no_connection');
  let r = await d.post(item.json);
  if (!r.ok && r.kind !== 'rejected' && d.postCompact) r = await d.postCompact(compactJson(item.json));
  if (r.ok) {
    return { ...item, ack: r.ack, ackAt: d.now(), https: { state: 'acked', attempts: item.https.attempts + 1, nextAt: null, lastError: null } };
  }
  if (r.kind === 'rejected') {
    // kept in the outbox (never dropped); P5's SMS row still carries the same packet
    return { ...item, https: { state: 'rejected', attempts: item.https.attempts + 1, nextAt: null, lastError: `http_${r.status}` } };
  }
  return retry(r.status ? `${r.kind}_${r.status}` : r.kind);
}

export function memoryStore(): OutboxStore & { items: Map<string, OutboxItem> } {
  const items = new Map<string, OutboxItem>();
  return {
    items,
    put: async (i) => { items.set(i.id, structuredClone(i)); },
    get: async (id) => structuredClone(items.get(id) ?? null),
    list: async () => [...items.values()].sort((a, b) => b.createdAt - a.createdAt).map((i) => structuredClone(i)),
  };
}
