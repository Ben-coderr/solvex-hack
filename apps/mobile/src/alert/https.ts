/**
 * HTTPS channel (docs/04 §3.3): a 2 s HEAD /api/health probe (not "connected" according to the OS), then
 * POST /api/incidents with x-najda-key (8 s). The HTTP response IS the ACK. `fetch` is injected for tests.
 */
import { IngestAck, type IncidentJson } from '@najda/api-contract';

export type Fetch = (url: string, init: { method: string; headers?: Record<string, string>; body?: string; signal: AbortSignal }) =>
  Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

export const PROBE_TIMEOUT_MS = 2_000;
export const POST_TIMEOUT_MS = 8_000;

const join = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await run(ctl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** true only when OUR server answered within 2 s (captive portals and "connected, no internet" fail here). */
export async function probeHealth(fetchFn: Fetch, baseUrl: string): Promise<boolean> {
  if (!baseUrl) return false;
  try {
    const res = await withTimeout(PROBE_TIMEOUT_MS, (signal) => fetchFn(join(baseUrl, '/api/health'), { method: 'HEAD', signal }));
    return res.ok;
  } catch {
    return false;
  }
}

export type PostResult =
  | { ok: true; ack: IngestAck }
  | { ok: false; kind: 'network' | 'timeout' | 'bad_response'; status?: number }
  | { ok: false; kind: 'rejected'; status: number };

/** 4xx other than 408/429 will not get better by retrying the same body (bad key, invalid JSON). */
const retryable = (status: number) => status >= 500 || status === 408 || status === 429;

export async function postIncident(fetchFn: Fetch, baseUrl: string, key: string, body: IncidentJson): Promise<PostResult> {
  try {
    const res = await withTimeout(POST_TIMEOUT_MS, (signal) =>
      fetchFn(join(baseUrl, '/api/incidents'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-najda-key': key },
        body: JSON.stringify(body),
        signal,
      }),
    );
    if (!res.ok) return retryable(res.status) ? { ok: false, kind: 'network', status: res.status } : { ok: false, kind: 'rejected', status: res.status };
    const ack = IngestAck.safeParse(await res.json());
    return ack.success ? { ok: true, ack: ack.data } : { ok: false, kind: 'bad_response', status: res.status };
  } catch (e) {
    return { ok: false, kind: (e as { name?: string })?.name === 'AbortError' ? 'timeout' : 'network' };
  }
}
