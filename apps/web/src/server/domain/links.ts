import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Capability-link tokens (docs/04 §4, docs/11 #4). A 5-char incident id is guessable; `k` is not:
 * HMAC-SHA256(secret, purpose:v1:id), base64url, 22 chars (132 bits). Stateless: nothing to store, nothing to reset;
 * rotating LINK_SIGNING_SECRET revokes every link at once.
 */
export type LinkPurpose = 'witness' | 'crew';

const TOKEN_LEN = 22;

const mac = (secret: string, msg: string) => createHmac('sha256', secret).update(msg).digest('base64url').slice(0, TOKEN_LEN);

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function linkToken(purpose: LinkPurpose, id: string, secret: string): string {
  return mac(secret, `${purpose}:v1:${id}`);
}

export function verifyLinkToken(purpose: LinkPurpose, id: string, k: string | null | undefined, secret: string): boolean {
  if (!k || k.length !== TOKEN_LEN) return false;
  return same(k, linkToken(purpose, id, secret));
}

/**
 * Expiring variant (crew link, D9): `<exp in s, base36>.<HMAC(purpose:v1:id:exp)>`. The expiry is signed, so it
 * cannot be edited; the same HMAC scheme as the witness link (one secret, no JWT library for one claim).
 */
export function expiringLinkToken(purpose: LinkPurpose, id: string, expiresAtMs: number, secret: string): string {
  const exp = Math.floor(expiresAtMs / 1000).toString(36);
  return `${exp}.${mac(secret, `${purpose}:v1:${id}:${exp}`)}`;
}

export type ExpiringCheck = { ok: true; expiresAt: Date } | { ok: false; why: 'invalid' | 'expired' };

/** Signature first: a forged token is `invalid` whatever its date; only a genuine one can be `expired`. */
export function verifyExpiringLinkToken(
  purpose: LinkPurpose, id: string, k: string | null | undefined, secret: string, nowMs = Date.now(),
): ExpiringCheck {
  const m = /^([0-9a-z]{1,9})\.([A-Za-z0-9_-]{22})$/.exec(k ?? '');
  if (!m || !same(m[2]!, mac(secret, `${purpose}:v1:${id}:${m[1]}`))) return { ok: false, why: 'invalid' };
  const expiresAt = new Date(parseInt(m[1]!, 36) * 1000);
  return expiresAt.getTime() > nowMs ? { ok: true, expiresAt } : { ok: false, why: 'expired' };
}

/** ~100 m: 3 decimals of a degree is ≤ 111 m of latitude. What a public page may show of a victim's position. */
export const coarse = (deg: number) => Math.round(deg * 1000) / 1000;
