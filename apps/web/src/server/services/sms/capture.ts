/**
 * Records real gateway webhooks to build fixtures (P5: "record the real webhook payload"). Off unless
 * SMSGATE_CAPTURE_DIR is set, and never when NODE_ENV=production. Files hold the sender's phone number: they go to a
 * gitignored folder and are anonymised by hand before one is copied into ./fixtures.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '@/server/env';

/** the headers the gateway sets; never cookies or auth */
const KEEP = ['content-type', 'user-agent', 'x-timestamp', 'x-signature'];

export async function captureWebhook(rawBody: string, headers: Headers): Promise<void> {
  const dir = env().SMSGATE_CAPTURE_DIR;
  if (!dir || process.env.NODE_ENV === 'production') return;
  try {
    await mkdir(dir, { recursive: true });
    const kept = Object.fromEntries(KEEP.flatMap((k) => (headers.get(k) ? [[k, headers.get(k)]] : [])));
    let body: unknown = rawBody;
    try { body = JSON.parse(rawBody); } catch { /* keep the raw text */ }
    await writeFile(join(dir, `webhook-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), `${JSON.stringify({ headers: kept, body }, null, 2)}\n`);
  } catch {
    // capture is a dev aid: it must never cost a message
  }
}
