/**
 * ETA chain (docs/04 §7): OSRM /table (2.5 s) → OpenRouteService matrix (2.5 s, free key) → haversine × 1.4.
 * Every ETA carries its source. Only routed results are cached (eta_cache, ~100 m grid cell);
 * the haversine fallback is computed by rankHospitals() itself and flagged ETA_ESTIMATED there.
 */
export type EtaSource = 'osrm' | 'ors' | 'haversine';
export interface Eta { minutes: number; km: number | null; source: EtaSource }
export interface LatLon { lat: number; lon: number }
export interface Destination extends LatLon { id: string }

export interface EtaCache {
  get(originKey: string, ids: readonly string[]): Promise<Record<string, Eta>>;
  put(originKey: string, etas: Record<string, Eta>): Promise<void>;
}

export interface RoutingConfig {
  osrmUrl?: string | undefined;
  orsKey?: string | undefined;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** ~100 m cell: 3 decimals ≈ 111 m of latitude, ≈ 89 m of longitude at Algeria's latitudes. */
export const cellKey = (o: LatLon): string => `${o.lat.toFixed(3)},${o.lon.toFixed(3)}`;

const toMinutes = (seconds: number) => Math.ceil(seconds / 60);

interface MatrixResponse { durations?: (number | null)[][]; distances?: (number | null)[][] }

/** Row 0 of an OSRM/ORS matrix → ETAs for each destination (null = unroutable, skipped). */
export function parseMatrix(
  res: MatrixResponse, dests: readonly Destination[], source: Exclude<EtaSource, 'haversine'>, distanceUnit: 'm' | 'km',
): Record<string, Eta> {
  const durations = res.durations?.[0];
  if (!durations) throw new Error(`${source}: no durations in response`);
  const distances = res.distances?.[0];
  const out: Record<string, Eta> = {};
  dests.forEach((d, i) => {
    const s = durations[i + 1]; // index 0 is the origin itself
    if (typeof s !== 'number' || !Number.isFinite(s)) return;
    const dist = distances?.[i + 1];
    out[d.id] = {
      minutes: toMinutes(s),
      km: typeof dist === 'number' ? (distanceUnit === 'm' ? dist / 1000 : dist) : null,
      source,
    };
  });
  return out;
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await run(ctl.signal);
  } finally {
    clearTimeout(t);
  }
}

export async function osrmTable(origin: LatLon, dests: readonly Destination[], cfg: RoutingConfig): Promise<Record<string, Eta>> {
  const f = cfg.fetch ?? fetch;
  const coords = [origin, ...dests].map((p) => `${p.lon},${p.lat}`).join(';');
  const url = `${cfg.osrmUrl!.replace(/\/$/, '')}/table/v1/driving/${coords}?sources=0&annotations=duration,distance`;
  return withTimeout(cfg.timeoutMs ?? 2500, async (signal) => {
    const res = await f(url, { signal });
    if (!res.ok) throw new Error(`osrm: HTTP ${res.status}`);
    const body = (await res.json()) as MatrixResponse & { code?: string };
    if (body.code !== 'Ok') throw new Error(`osrm: ${body.code ?? 'bad response'}`);
    return parseMatrix(body, dests, 'osrm', 'm');
  });
}

export async function orsMatrix(origin: LatLon, dests: readonly Destination[], cfg: RoutingConfig): Promise<Record<string, Eta>> {
  const f = cfg.fetch ?? fetch;
  return withTimeout(cfg.timeoutMs ?? 2500, async (signal) => {
    const res = await f('https://api.openrouteservice.org/v2/matrix/driving-car', {
      method: 'POST',
      signal,
      headers: { Authorization: cfg.orsKey!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [origin, ...dests].map((p) => [p.lon, p.lat]),
        sources: [0],
        metrics: ['duration', 'distance'],
        units: 'km',
      }),
    });
    if (!res.ok) throw new Error(`ors: HTTP ${res.status}`);
    return parseMatrix((await res.json()) as MatrixResponse, dests, 'ors', 'km');
  });
}

export interface EtaReport {
  /** routed ETAs only (feed rankHospitals' `etaMin`); hospitals missing here fall back to haversine × 1.4 */
  etas: Record<string, Eta>;
  /** why a provider was skipped or failed, for the status strip / logs (no secrets) */
  notes: string[];
}

export async function getEtas(
  origin: LatLon, dests: readonly Destination[], cfg: RoutingConfig, cache?: EtaCache,
): Promise<EtaReport> {
  const key = cellKey(origin);
  const notes: string[] = [];
  const etas: Record<string, Eta> = cache ? await cache.get(key, dests.map((d) => d.id)) : {};
  let missing = dests.filter((d) => !etas[d.id]);

  const providers: Array<[Exclude<EtaSource, 'haversine'>, boolean, typeof osrmTable]> = [
    ['osrm', Boolean(cfg.osrmUrl), osrmTable],
    ['ors', Boolean(cfg.orsKey), orsMatrix],
  ];
  for (const [name, configured, call] of providers) {
    if (missing.length === 0) break;
    if (!configured) {
      notes.push(`${name}: not configured`);
      continue;
    }
    try {
      const got = await call(origin, missing, cfg);
      Object.assign(etas, got);
      if (cache && Object.keys(got).length) await cache.put(key, got);
      missing = missing.filter((d) => !got[d.id]);
    } catch (e) {
      notes.push(e instanceof Error ? e.message : `${name}: failed`);
    }
  }
  if (missing.length) notes.push(`haversine x1.4 for ${missing.length} facilit${missing.length === 1 ? 'y' : 'ies'}`);
  return { etas, notes };
}
