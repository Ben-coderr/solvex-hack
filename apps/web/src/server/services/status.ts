import 'server-only';
import { sql as getSql } from '../db';
import { env } from '../env';

export type Probe = 'ok' | 'down' | 'sim' | 'off';
export interface SystemStatus { db: Probe; smsGateway: Probe; osrm: Probe; checkedAt: string }

/** `strict`: only 2xx counts (OSRM); otherwise any non-5xx answer means the device is there (gateway behind Basic auth). */
async function reachable(url: string, strict = false, ms = 1500): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    return strict ? r.ok : r.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Status strip probes. `sim` = simulated gateway (labelled, not hidden); `off` = not configured. */
export async function systemStatus(): Promise<SystemStatus> {
  const e = env();
  const [db, gw, osrm] = await Promise.all([
    getSql()`select 1`.then(() => true, () => false),
    e.SMSGATE_MODE === 'sim' ? Promise.resolve(null) : e.SMSGATE_BASE_URL ? reachable(e.SMSGATE_BASE_URL) : Promise.resolve(false),
    // A tiny OSRM route near the demo origin; macOS port 5000 answers 403 (AirPlay) → down.
    e.OSRM_URL ? reachable(`${e.OSRM_URL.replace(/\/$/, '')}/route/v1/driving/2.82871,36.47213;2.83,36.48?overview=false`, true) : Promise.resolve(null),
  ]);
  return {
    db: db ? 'ok' : 'down',
    smsGateway: gw === null ? 'sim' : gw ? 'ok' : 'down',
    osrm: osrm === null ? 'off' : osrm ? 'ok' : 'down',
    checkedAt: new Date().toISOString(),
  };
}
