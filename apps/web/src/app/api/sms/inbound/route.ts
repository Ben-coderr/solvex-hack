import type { NextRequest } from 'next/server';
import { BRAND } from '@/brand';
import { formatHHMM, parseStatusSms } from '@/server/domain';
import { env } from '@/server/env';
import { clientIp, fail, json, limited, readRaw } from '@/server/http';
import { statusFromSms } from '@/server/services/hospitals';
import { ingest } from '@/server/services/ingest';
import { deliverOutbox } from '@/server/services/outbox';
import { LIMITS } from '@/server/services/rate-limit';
import { senderHash } from '@/server/services/sender';
import { parseInbound, verifySignature } from '@/server/services/sms/gateway';
import { captureWebhook } from '@/server/services/sms/capture';
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
  await captureWebhook(raw.raw, req.headers);

  let body: unknown;
  try {
    body = JSON.parse(raw.raw);
  } catch {
    body = null;
  }
  const now = new Date();
  const msg = parseInbound(body, now);
  if (msg.kind === 'ignored') return json({ stored: false, ignored: msg.event });

  // Per-sender flood limit (docs/05 §7) counts every SMS, status updates included (each reply costs SIM credit).
  const hash = msg.kind === 'sms' && msg.from ? senderHash(`sms:${msg.from}`) : null;
  const flood = hash ? limited(`sms-sender:${hash}`, LIMITS.smsPerSender) : null;

  // D14: a hospital's status SMS, from its registered number only; anything else falls through to ingest.
  const st = msg.kind === 'sms' && msg.from && !flood ? parseStatusSms(msg.text, BRAND.smsVerb) : null;
  if (st && msg.kind === 'sms' && msg.from &&
      (await statusFromSms(st.hospitalId, st.status, msg.from, `${BRAND.smsName} STATUT ${st.hospitalId} ${st.status} ENREGISTRE ${formatHHMM(now)}. Valable 6 h.`))) {
    void deliverOutbox().catch(() => undefined);
    return json({ stored: true, status_update: st });
  }

  const store = postgresStore();
  const ack =
    msg.kind === 'invalid'
      ? await ingest({ kind: 'text', channel: 'sms', text: raw.raw, receivedAt: now, senderHash: null, replyTo: null, quarantine: 'bad_webhook_payload' }, store)
      : await ingest({
          kind: 'text', channel: 'sms', text: msg.text, receivedAt: msg.receivedAt, senderHash: hash, replyTo: msg.from,
          ...(flood && { quarantine: 'rate_limited' as const }),
        }, store);

  void deliverOutbox().catch(() => undefined); // ACK SMS after commit; failures stay visible in sms_outbox
  return json({ stored: true, ...ack });
}
