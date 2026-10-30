/**
 * Outbox runner: drives every open alert through the chain (HTTPS → SMS GW1 → GW2 → contacts, docs/04 §3.3).
 * All channels are injected, so the tests run this exact code with fakes, including "killed mid-chain": a new
 * runner on the same store picks up where the old one stopped.
 *
 * The in-memory map is the single source of truth while the app runs; every change goes through `mutate`
 * (synchronous read-modify-write on the latest item, then an ordered write to the store), so an SMS result event that
 * lands during a slow HTTPS attempt is never overwritten by it.
 */
import { applySmsResult, applySmsSendError, giveUp, parseMsgId, planSms, type ChainConfig } from './chain';
import { alertOpen, attemptHttps, GIVE_UP_MS, isDue, isOpen, normalizeItem, type AttemptDeps, type OutboxItem, type OutboxStore } from './outbox';
import { smsErrorCode, type SmsChannel } from '../channels/sms-core';

export interface RunnerDeps {
  store: OutboxStore;
  now(): number;
  https: Omit<AttemptDeps, 'now'>;
  sms: SmsChannel;
  /** read at every tick: Settings may change while an alert is open */
  config(): ChainConfig & { subscriptionId: number | null };
  /** the human-readable text for emergency contacts */
  humanText(item: OutboxItem): string;
  publish?(item: OutboxItem): void;
}

export type Runner = ReturnType<typeof createRunner>;

export function createRunner(d: RunnerDeps) {
  const items = new Map<string, OutboxItem>();
  let writes: Promise<void> = Promise.resolve();
  let sub: { remove(): void } | null = null;
  let busy = false;

  const save = (i: OutboxItem) => {
    items.set(i.id, i);
    d.publish?.(i);
    writes = writes.then(() => d.store.put(i));
    return writes;
  };

  /** read-modify-write on the LATEST item; `fn` returning the same object = no change */
  async function mutate(id: string, fn: (i: OutboxItem) => OutboxItem): Promise<OutboxItem | null> {
    const cur = items.get(id);
    if (!cur) return null;
    const next = fn(cur);
    if (next !== cur) await save(next);
    return next;
  }

  async function step(id: string, force: boolean) {
    const it = items.get(id);
    if (!it || !alertOpen(it)) return;
    if (d.now() - it.createdAt > GIVE_UP_MS) {
      await mutate(id, (i) => giveUp(i, d.now()));
      return;
    }
    if (force ? isOpen(it) : isDue(it, d.now())) {
      const done = await attemptHttps(it, { ...d.https, now: d.now });
      await mutate(id, (i) => ({ ...i, https: done.https, ack: i.ack ?? done.ack, ackAt: i.ackAt ?? done.ackAt }));
    }
    const cfg = d.config();
    let send: ReturnType<typeof planSms>['send'] = [];
    // marked `sending` and persisted BEFORE Android gets them: a kill right after leaves a record to time out and resend
    await mutate(id, (i) => {
      const p = planSms(i, d.now(), cfg, () => d.humanText(i));
      send = p.send;
      return p.item;
    });
    for (const s of send) {
      try {
        await d.sms.send(s.to, s.text, { id: s.msgId, subscriptionId: cfg.subscriptionId });
      } catch (e) {
        await mutate(id, (i) => applySmsSendError(i, s.msgId, smsErrorCode(e), d.now()));
      }
    }
  }

  return {
    get: (id: string) => items.get(id) ?? null,
    list: () => [...items.values()].sort((a, b) => b.createdAt - a.createdAt),
    mutate,

    /** load the persisted outbox and start listening for SMS results */
    async load() {
      for (const i of await d.store.list()) items.set(i.id, normalizeItem(i));
      sub ??= d.sms.onResult((r) => {
        const p = parseMsgId(r.id);
        if (p) void mutate(p.id, (i) => applySmsResult(i, r, d.now()));
      });
    },

    /** a new alert: persisted before anything is sent */
    add: (item: OutboxItem) => save(item),

    /** one pass over every open alert; serialised (a call during a pass is skipped). force = retry HTTPS now. */
    async tick(force = false) {
      if (busy) return;
      busy = true;
      try {
        for (const id of [...items.keys()]) await step(id, force);
      } finally {
        busy = false;
      }
    },

    /** wait for pending store writes (tests, and before the app is backgrounded) */
    flush: () => writes,

    dispose() {
      sub?.remove();
      sub = null;
    },
  };
}
