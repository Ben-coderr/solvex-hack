/**
 * In-memory sliding-window rate limiter. Good enough for the single-process stage server;
 * a multi-instance deploy (Vercel backup) gets per-instance limits — documented in DECISIONS.md.
 */
export interface Limit { limit: number; windowMs: number }
export type RateResult = { ok: true; remaining: number } | { ok: false; retryAfterS: number };

export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly now: () => number = Date.now) {}

  check(key: string, { limit, windowMs }: Limit): RateResult {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterS: Math.max(1, Math.ceil((recent[0]! + windowMs - t) / 1000)) };
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.sweep(t, windowMs);
    return { ok: true, remaining: limit - recent.length };
  }

  private sweep(t: number, windowMs: number) {
    for (const [k, v] of this.hits) if (v.every((x) => t - x >= windowMs)) this.hits.delete(k);
  }
}

/** Limits per public endpoint (also listed in DECISIONS.md). */
export const LIMITS = {
  /** per API key + IP */
  incidentsJson: { limit: 30, windowMs: 60_000 },
  /** every app together: the per-IP limit can be dodged with a forged X-Forwarded-For, and the key ships in the APK */
  incidentsJsonAll: { limit: 120, windowMs: 60_000 },
  /** per gateway (the phone retries with backoff; generous) */
  smsWebhook: { limit: 120, windowMs: 60_000 },
  /** docs/05 §7: ≤ 3 auto alerts per hour per SMS sender (excess is still STORED, flagged, never dropped) */
  smsPerSender: { limit: 3, windowMs: 3_600_000 },
  /** witness page POST per IP hash: a person reports once or twice, a script is stopped early */
  witnessPerIp: { limit: 5, windowMs: 600_000 },
  /** witness reports per incident: a busy road gives several witnesses, never dozens */
  witnessPerIncident: { limit: 20, windowMs: 3_600_000 },
  /** witness page views per IP hash (refreshes on a bad connection are normal) */
  witnessPagePerIp: { limit: 60, windowMs: 60_000 },
  /** crew update POST per IP hash: a crew re-measures every few minutes on a long transfer */
  crewPerIp: { limit: 20, windowMs: 600_000 },
  /** crew updates per incident (one ambulance, maybe two) */
  crewPerIncident: { limit: 30, windowMs: 3_600_000 },
  /** crew page views per IP hash */
  crewPagePerIp: { limit: 60, windowMs: 60_000 },
  /** dispatcher API per user */
  dispatcher: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, Limit>;
