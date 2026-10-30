import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Capability-link tokens (docs/04 §4, docs/11 #4). A 5-char incident id is guessable; `k` is not:
 * HMAC-SHA256(secret, purpose:v1:id), base64url, 22 chars (132 bits). Stateless: nothing to store, nothing to reset;
 * rotating LINK_SIGNING_SECRET revokes every link at once.
 */
export type LinkPurpose = 'witness';

const TOKEN_LEN = 22;

export function linkToken(purpose: LinkPurpose, id: string, secret: string): string {
  return createHmac('sha256', secret).update(`${purpose}:v1:${id}`).digest('base64url').slice(0, TOKEN_LEN);
}

export function verifyLinkToken(purpose: LinkPurpose, id: string, k: string | null | undefined, secret: string): boolean {
  if (!k || k.length !== TOKEN_LEN) return false;
  const a = Buffer.from(k);
  const b = Buffer.from(linkToken(purpose, id, secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** ~100 m: 3 decimals of a degree is ≤ 111 m of latitude. What a public page may show of a victim's position. */
export const coarse = (deg: number) => Math.round(deg * 1000) / 1000;
