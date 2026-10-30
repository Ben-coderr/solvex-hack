/**
 * The SMS half of the fallback chain (docs/04 §3.3), as pure functions over an OutboxItem:
 *
 *   HTTPS first (outbox.attemptHttps). After the first failed HTTPS attempt, while there is no ACK:
 *   1. native SMS with the packet to GW1;
 *   2. GW2 when GW1 failed, or was sent but no delivery report came within 60 s, or GW1 is not set;
 *   3. emergency contacts get a human-readable text 60 s after the first gateway SMS (at once if no gateway);
 *   4. a failed message is sent again after 10 s·2ⁿ (cap 5 min); a message with no result 60 s after it was handed
 *      to Android (app killed, radio lost) counts as failed and is sent again;
 *   5. the ACK stops everything; 30 min without one: give up, and say so.
 *   No native channel (not in the build, SEND_SMS refused) → the status screen offers the composer instead.
 *
 * Duplicates are harmless: ingest is idempotent on the incident id.
 */
import { alertOpen, backoffMs, type OutboxItem, type SmsMsg } from './outbox';
import type { SmsResult } from '../channels/sms-core';

export const SMS_RESULT_TIMEOUT_MS = 60_000;
export const SMS_DELIVERY_WAIT_MS = 60_000;

export interface ChainConfig {
  /** native module present AND SEND_SMS granted */
  nativeSms: boolean;
  gw1: string;
  gw2: string;
  contacts: string[];
}

export interface SmsSend { msgId: string; to: string; text: string }

const msgIdOf = (incidentId: string, key: string, attempt: number) => `${incidentId}.${key}.${attempt}`;
/** incident id and destination key from a message id */
export function parseMsgId(msgId: string): { id: string; key: string } | null {
  const [id, key, n] = msgId.split('.');
  return id && key && n ? { id, key } : null;
}

const timedOut = (m: SmsMsg, now: number) => m.state === 'sending' && now - m.lastAt >= SMS_RESULT_TIMEOUT_MS;
const settled = (m: SmsMsg | undefined) => m?.state === 'sent' || m?.state === 'delivered';

/** GW1 is not going to make it on its own: failed, no result, or sent without a delivery report for 60 s */
function struggling(m: SmsMsg | undefined, now: number): boolean {
  if (!m) return true;
  if (m.state === 'failed' || timedOut(m, now)) return true;
  return m.state === 'sent' && m.deliveredAt === null && m.sentAt !== null && now - m.sentAt >= SMS_DELIVERY_WAIT_MS;
}

/**
 * Decide which SMS go out now. Returns the item with those messages marked `sending` (persist it BEFORE sending)
 * and the list to hand to the channel.
 */
export function planSms(item: OutboxItem, now: number, cfg: ChainConfig, humanText: () => string): { item: OutboxItem; send: SmsSend[] } {
  const none = { item, send: [] };
  if (!alertOpen(item) || !cfg.nativeSms) return none;
  // HTTPS goes first: SMS starts only once it has failed at least once (or was refused outright)
  if (item.https.state === 'pending') return none;

  const out = { ...item.smsOut };
  const send: SmsSend[] = [];
  const want = (key: string, to: string, kind: SmsMsg['kind']) => {
    const m = out[key];
    if (m && (m.state === 'sent' || m.state === 'delivered')) return;
    if (m && m.state === 'sending' && !timedOut(m, now)) return;
    if (m && m.state === 'failed' && (m.nextAt ?? 0) > now) return;
    const attempts = (m?.attempts ?? 0) + 1;
    const msgId = msgIdOf(item.id, key, attempts);
    out[key] = {
      key, to, kind, state: 'sending', attempts, msgId, firstAt: m?.firstAt ?? now, lastAt: now,
      sentAt: m?.sentAt ?? null, deliveredAt: null, nextAt: null, code: m && timedOut(m, now) ? 'E_TIMEOUT' : m?.code ?? null,
    };
    send.push({ msgId, to, text: kind === 'packet' ? item.wire : humanText() });
  };

  if (cfg.gw1) want('gw1', cfg.gw1, 'packet');
  if (cfg.gw2 && (!cfg.gw1 || struggling(out.gw1, now))) want('gw2', cfg.gw2, 'packet');

  if (cfg.contacts.length > 0) {
    const gateways = [out.gw1, out.gw2].filter((m): m is SmsMsg => m !== undefined);
    const firstGatewayAt = gateways.length ? Math.min(...gateways.map((m) => m.firstAt)) : null;
    const anyGateway = Boolean(cfg.gw1 || cfg.gw2);
    if (!anyGateway || (firstGatewayAt !== null && now - firstGatewayAt >= SMS_DELIVERY_WAIT_MS)) {
      for (const c of cfg.contacts) want(`contact:${c}`, c, 'human');
    }
  }

  return send.length ? { item: { ...item, smsOut: out }, send } : none;
}

/** Android accepted nothing (permission, no SmsManager…): the message failed and backs off like any other. */
export function applySmsSendError(item: OutboxItem, msgId: string, code: string, now: number): OutboxItem {
  const p = parseMsgId(msgId);
  const m = p && item.smsOut[p.key];
  if (!m || m.msgId !== msgId || settled(m)) return item;
  return { ...item, smsOut: { ...item.smsOut, [m.key]: { ...m, state: 'failed', code, lastAt: now, nextAt: now + backoffMs(m.attempts - 1) } } };
}

/**
 * A result event from the radio. sent/delivered from an OLDER attempt still count (same text, same destination);
 * a failure only counts for the attempt in flight.
 */
export function applySmsResult(item: OutboxItem, r: SmsResult, now: number): OutboxItem {
  const p = parseMsgId(r.id);
  const m = p && item.smsOut[p.key];
  if (!m) return item;
  let next: SmsMsg;
  if (r.status === 'delivered') {
    next = { ...m, state: 'delivered', sentAt: m.sentAt ?? now, deliveredAt: now, nextAt: null, code: null };
  } else if (r.status === 'sent') {
    if (m.state === 'delivered') return item;
    next = { ...m, state: 'sent', sentAt: m.sentAt ?? now, nextAt: null, code: null };
  } else {
    if (m.msgId !== r.id || m.state === 'delivered') return item;
    next = { ...m, state: 'failed', code: r.code == null ? 'E_FAILED' : String(r.code), lastAt: now, nextAt: now + backoffMs(m.attempts - 1) };
  }
  return { ...item, smsOut: { ...item.smsOut, [m.key]: next } };
}

/** 30 min without an ACK: stop. Messages still in flight keep their state (a late delivery report is still shown). */
export function giveUp(item: OutboxItem, now: number): OutboxItem {
  if (!alertOpen(item)) return item;
  const https = item.https.state === 'pending' || item.https.state === 'retrying' ? { ...item.https, state: 'gave_up' as const, nextAt: null } : item.https;
  return { ...item, https, gaveUpAt: now };
}

// ---- what the status screen shows -------------------------------------------------------------------------------

export type RowState =
  | 'waiting' | 'sending' | 'retrying' | 'sent' | 'delivered' | 'acked' | 'failed' | 'rejected' | 'gave_up'
  | 'offered' | 'opened' | 'off';

export interface ChannelRow {
  channel: 'https' | 'gw1' | 'gw2' | 'contacts' | 'composer';
  state: RowState;
  /** attempts so far (retrying n) */
  attempts: number;
  /** time that goes with the state (sent at, delivered at, opened at) */
  at: number | null;
  /** destination number, or "2/3" for contacts */
  detail: string | null;
  code: string | null;
}

const msgRow = (channel: 'gw1' | 'gw2', m: SmsMsg | undefined, configured: string, open: boolean): ChannelRow => {
  if (!configured) return { channel, state: 'off', attempts: 0, at: null, detail: null, code: null };
  if (!m) return { channel, state: open ? 'waiting' : 'off', attempts: 0, at: null, detail: configured, code: null };
  const state: RowState = m.state === 'failed' ? (open ? 'retrying' : 'failed') : m.state;
  const at = m.state === 'delivered' ? m.deliveredAt : m.state === 'sent' ? m.sentAt : m.lastAt;
  return { channel, state, attempts: m.attempts, at, detail: m.to, code: m.code };
};

/** One row per channel, in chain order. The composer row appears only when the native channel cannot be used. */
export function channelRows(item: OutboxItem, cfg: ChainConfig): ChannelRow[] {
  const open = alertOpen(item);
  const h = item.https;
  const https: ChannelRow = {
    channel: 'https',
    state: item.ack ? 'acked' : h.state === 'pending' ? 'sending' : h.state === 'retrying' ? 'retrying' : h.state,
    attempts: h.attempts, at: item.ackAt, detail: null, code: h.lastError,
  };
  const rows: ChannelRow[] = [https];
  if (cfg.nativeSms) {
    rows.push(msgRow('gw1', item.smsOut.gw1, cfg.gw1, open));
    if (cfg.gw2 || item.smsOut.gw2) rows.push(msgRow('gw2', item.smsOut.gw2, cfg.gw2 || item.smsOut.gw2!.to, open));
  } else {
    const to = cfg.gw1 || cfg.gw2;
    rows.push({
      channel: 'composer',
      state: item.sms.composerOpenedAt ? 'opened' : to && open ? 'offered' : 'off',
      attempts: 0, at: item.sms.composerOpenedAt, detail: item.sms.to ?? (to || null), code: null,
    });
  }
  const contacts = Object.values(item.smsOut).filter((m) => m.kind === 'human');
  if (cfg.contacts.length || contacts.length) {
    const total = Math.max(cfg.contacts.length, contacts.length);
    const done = contacts.filter(settled).length;
    const delivered = contacts.filter((m) => m.state === 'delivered').length;
    const state: RowState = contacts.length === 0 ? (open && cfg.nativeSms ? 'waiting' : 'off')
      : delivered === total ? 'delivered'
      : done === total ? 'sent'
      : contacts.some((m) => m.state === 'failed') ? (open ? 'retrying' : 'failed')
      : 'sending';
    const lastAt = contacts.reduce<number | null>((a, m) => Math.max(a ?? 0, m.deliveredAt ?? m.sentAt ?? 0) || a, null);
    rows.push({ channel: 'contacts', state, attempts: Math.max(0, ...contacts.map((m) => m.attempts)), at: lastAt, detail: `${done}/${total}`, code: null });
  }
  return rows;
}
