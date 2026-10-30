import type { NextRequest } from 'next/server';
import { env } from '@/server/env';
import { clientIp, fail, json, limited, readRaw } from '@/server/http';
import { ingest } from '@/server/services/ingest';
import { deliverOutbox } from '@/server/services/outbox';
import { LIMITS } from '@/server/services/rate-limit';
import { senderHash } from '@/server/services/sender';
import { parseInbound, verifySignature } from '@/server/services/sms/gateway';
import { postgresStore } from '@/server/services/store-postgres';

/**
 * Webhook of "SMS Gateway for Android" (HMAC-SHA256 signed). Contract with the gateway:
 * 200 only AFTER the message is stored (parsed or not). Any 5xx makes the phone retry (10 s, doubling).
 */
export async function POST(req: NextRequest) {
  const slow = limited(`sms-webhook:${clientIp(req)}`, LIMITS.smsWebhook);
  if (slow) return slow;
  const raw = await readRaw(req);
  if (!raw.ok) return raw.res;

  const sig = verifySignature(raw.raw, req.headers.get('x-timestamp'), req.headers.get('x-signature'), env().SMSGATE_WEBHOOK_SECRET);
  if (!sig.ok) return fail(401, `webhook signature ${sig.why}`); // not from our gateway: not a message to keep

  let body: unknown;
  try {
    body = JSON.parse(raw.raw);
  } catch {
    body = null;
  }
  const now = new Date();
  const msg = parseInbound(body, now);
  if (msg.kind === 'ignored') return json({ stored: false, ignored: msg.event });

  const store = postgresStore();
  const ack =
    msg.kind === 'invalid'
      ? await ingest({ kind: 'text', channel: 'sms', text: raw.raw, receivedAt: now, senderHash: null, replyTo: null, quarantine: 'bad_webhook_payload' }, store)
      : await (async () => {
          const hash = msg.from ? senderHash(`sms:${msg.from}`) : null;
          const flood = hash ? limited(`sms-sender:${hash}`, LIMITS.smsPerSender) : null;
          return ingest({
            kind: 'text', channel: 'sms', text: msg.text, receivedAt: msg.receivedAt, senderHash: hash, replyTo: msg.from,
            ...(flood && { quarantine: 'rate_limited' as const }),
          }, store);
        })();

  void deliverOutbox().catch(() => undefined); // ACK SMS after commit; failures stay visible in sms_outbox
  return json({ stored: true, ...ack });
}
