/**
 * Outbox: every alert is persisted BEFORE anything is sent and survives a kill/reboot (SQLite store in the app,
 * memory store in tests). `attemptHttps` is one step of the delivery loop; the app's scheduler calls it when an
 * item is due and immediately on a connectivity change. SMS goes through the system composer (docs/17 §2): the app
 * pre-fills the packet and records when it opened it; the person presses Send. P5 may add the silent native path.
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
  ack: IngestAck | null;
  ackAt: number | null;
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
    ack: null, ackAt: null,
  };
}

/** Items persisted by an older build lack newer fields: fill them so the UI never reads undefined. */
export const normalizeItem = (i: OutboxItem): OutboxItem => ({ ...i, sms: i.sms ?? { composerOpenedAt: null, to: null } });

export const isOpen = (i: OutboxItem) => i.https.state === 'pending' || i.https.state === 'retrying';
export const isDue = (i: OutboxItem, now: number) => isOpen(i) && (i.https.nextAt ?? 0) <= now;

export interface AttemptDeps {
  now(): number;
  probe(): Promise<boolean>;
  post(json: IncidentJson): Promise<PostResult>;
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
  const r = await d.post(item.json);
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
