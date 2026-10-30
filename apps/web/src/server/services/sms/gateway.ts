/**
 * Everything specific to "SMS Gateway for Android" (capcom6, docs.sms-gate.app) lives here.
 * CONFIRMED from the docs: event names, payload nesting, HMAC-SHA256(rawBody + X-Timestamp) in X-Signature (hex),
 *   ±5 min timestamp window, local send = POST http://<phone>:8080/message with Basic auth,
 *   body { textMessage: { text }, phoneNumbers: [...] }.
 * UNCONFIRMED until recorded from a device (P5): exact `receivedAt` format; the response body of POST /message.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const SIGNATURE_WINDOW_S = 300;

export function signBody(rawBody: string, timestamp: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody + timestamp).digest('hex');
}

export type SignatureCheck = { ok: true } | { ok: false; why: 'missing' | 'stale' | 'mismatch' };

export function verifySignature(
  rawBody: string, timestamp: string | null, signature: string | null, secret: string, nowMs = Date.now(),
): SignatureCheck {
  if (!timestamp || !signature) return { ok: false, why: 'missing' };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > SIGNATURE_WINDOW_S) return { ok: false, why: 'stale' };
  const expected = Buffer.from(signBody(rawBody, timestamp, secret), 'hex');
  const given = Buffer.from(signature.trim().toLowerCase(), 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, why: 'mismatch' };
  return { ok: true };
}

const Webhook = z.object({
  event: z.string(),
  id: z.string().optional(),
  deviceId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

const Received = z.object({
  messageId: z.string().optional(),
  // `message` per the docs; `text` accepted in case a version differs.
  message: z.string().optional(),
  text: z.string().optional(),
  // `sender` per the docs; `phoneNumber` was the name in the old plan (never confirmed).
  sender: z.string().optional(),
  phoneNumber: z.string().optional(),
  simNumber: z.number().nullable().optional(),
  receivedAt: z.string().optional(),
});

export type Inbound =
  | { kind: 'sms'; from: string | null; text: string; receivedAt: Date; messageId: string | null }
  | { kind: 'ignored'; event: string }
  | { kind: 'invalid'; why: string };

/** Parse the webhook JSON. `now` is used when the phone's timestamp is missing, unparseable or in the future. */
export function parseInbound(body: unknown, now = new Date()): Inbound {
  const w = Webhook.safeParse(body);
  if (!w.success) return { kind: 'invalid', why: 'not a gateway webhook' };
  if (w.data.event !== 'sms:received') return { kind: 'ignored', event: w.data.event };
  const p = Received.safeParse(w.data.payload ?? {});
  if (!p.success) return { kind: 'invalid', why: 'bad sms:received payload' };
  const text = p.data.message ?? p.data.text;
  if (text === undefined) return { kind: 'invalid', why: 'sms:received without message text' };
  const t = p.data.receivedAt ? new Date(p.data.receivedAt) : null;
  const receivedAt = t && Number.isFinite(t.getTime()) && t.getTime() <= now.getTime() + 60_000 ? t : now;
  return {
    kind: 'sms',
    from: p.data.sender ?? p.data.phoneNumber ?? null,
    text,
    receivedAt,
    messageId: p.data.messageId ?? null,
  };
}

export interface GatewayConfig {
  mode: 'local' | 'cloud' | 'sim';
  baseUrl?: string | undefined;
  user?: string | undefined;
  password?: string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export type SendResult = { status: 'sent' | 'simulated' } | { status: 'failed'; error: string };

/** Send one SMS. `sim` only logs (the outbox row records it as simulated). */
export async function sendSms(to: string, text: string, cfg: GatewayConfig): Promise<SendResult> {
  if (cfg.mode === 'sim') return { status: 'simulated' };
  if (cfg.mode === 'cloud') return { status: 'failed', error: 'cloud mode not implemented (use local or sim)' };
  if (!cfg.baseUrl) return { status: 'failed', error: 'SMSGATE_BASE_URL not set' };
  const f = cfg.fetch ?? fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs ?? 8000);
  try {
    const res = await f(`${cfg.baseUrl.replace(/\/$/, '')}/message`, {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${cfg.user ?? ''}:${cfg.password ?? ''}`).toString('base64')}`,
      },
      body: JSON.stringify({ textMessage: { text }, phoneNumbers: [to] }),
    });
    return res.ok ? { status: 'sent' } : { status: 'failed', error: `gateway HTTP ${res.status}` };
  } catch (e) {
    return { status: 'failed', error: e instanceof Error ? e.message : 'gateway unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
