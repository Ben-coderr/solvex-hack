/**
 * Hospital recommendation. S(h) = 0.45·T + 0.35·C + 0.15·L + 0.05·A  (weights are ASSUMPTIONS).
 *   T = max(0, 1 − ETA/60)           time
 *   C = |required ∩ capabilities| / |required|   capability match
 *   L = status load: OK 1.0 · BUSY 0.5 · SATURATED 0.1 · UNKNOWN 0.6 (statuses expire to UNKNOWN after 6 h)
 *   A = level: A 1.0 · B 0.5 · C 0.0
 * Decision support only: the dispatcher always picks the destination.
 */
import type { Band, Flag } from './types';

export type Capability =
  | 'ed24' | 'general_surgery' | 'trauma_surgery' | 'ct' | 'icu' | 'neurosurgery' | 'pediatrics' | 'burns';
export type HospitalLevel = 'A' | 'B' | 'C';
export type LoadStatus = 'OK' | 'BUSY' | 'SATURATED' | 'UNKNOWN';

export interface HospitalRecord {
  id: string;
  name: string;
  level: HospitalLevel;
  lat: number;
  lon: number;
  capabilities: Capability[];
}
export interface StatusRecord { status: LoadStatus; /** epoch ms */ setAt: number }

export const WEIGHTS = { time: 0.45, capability: 0.35, load: 0.15, level: 0.05 } as const;
export const MAX_ETA_MIN = 90;
export const LEVEL_A_GATE_MIN = 60;
export const CAPABILITY_GATE = 0.75;
export const STATUS_TTL_H = 6;
const LOAD_VALUE: Record<LoadStatus, number> = { OK: 1.0, BUSY: 0.5, SATURATED: 0.1, UNKNOWN: 0.6 };
const LEVEL_VALUE: Record<HospitalLevel, number> = { A: 1.0, B: 0.5, C: 0.0 };

export function requiredCapabilities(band: Band, flags: readonly Flag[] = []): Capability[] {
  const req: Capability[] =
    band === 'R' ? ['ed24', 'trauma_surgery', 'ct', 'icu']
    : band === 'O' ? ['ed24', 'general_surgery', 'ct']
    : ['ed24'];
  if (flags.includes('U') || flags.includes('N')) req.push('neurosurgery');
  if (flags.includes('C')) req.push('pediatrics');
  if (flags.includes('F')) req.push('burns');
  return req;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0088;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Last-resort ETA: straight-line distance x 1.4 detour factor at 60 km/h  =>  1.4 min per km. */
export const fallbackEtaMin = (km: number): number => km * 1.4;

export interface RankInput {
  band: Band;
  flags?: readonly Flag[];
  incident: { lat: number; lon: number };
  hospitals: readonly HospitalRecord[];
  /** ETA in minutes keyed by hospital id (OSRM /table or ORS). Missing ids fall back to haversine. */
  etaMin?: Readonly<Record<string, number>>;
  statuses?: Readonly<Record<string, StatusRecord>>;
  /** epoch ms; injected so results are deterministic in tests */
  now: number;
}

export interface RankedHospital {
  hospitalId: string;
  name: string;
  level: HospitalLevel;
  etaMin: number;
  etaSource: 'provided' | 'fallback';
  /** rounded to 2 decimals for display; ordering uses the unrounded value */
  score: number;
  parts: { T: number; C: number; L: number; A: number };
  missing: Capability[];
  status: LoadStatus;
  statusAgeH: number | null;
  flags: Array<'STABILISE_THEN_TRANSFER' | 'SATURATED' | 'STATUS_UNKNOWN' | 'ETA_ESTIMATED'>;
  explanation: string;
}

export interface Recommendation {
  required: Capability[];
  mode: 'direct' | 'stabilise_transfer' | 'no_candidate';
  /** top 3 shown to the dispatcher */
  items: RankedHospital[];
  all: RankedHospital[];
  /** the closest emergency department regardless of rank (so the dispatcher never loses sight of it) */
  nearestEd: RankedHospital | null;
  note: string;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function rankHospitals(input: RankInput): Recommendation {
  const required = requiredCapabilities(input.band, input.flags);
  const scored: Array<RankedHospital & { raw: number; cRaw: number }> = [];

  for (const h of input.hospitals) {
    const provided = input.etaMin?.[h.id];
    const eta = provided ?? fallbackEtaMin(haversineKm(input.incident.lat, input.incident.lon, h.lat, h.lon));
    if (!(eta <= MAX_ETA_MIN)) continue;

    const missing = required.filter((c) => !h.capabilities.includes(c));
    const T = Math.max(0, 1 - eta / 60);
    const C = (required.length - missing.length) / required.length;

    const st = input.statuses?.[h.id];
    const ageH = st ? (input.now - st.setAt) / 3_600_000 : null;
    const fresh = st && ageH !== null && ageH >= 0 && ageH <= STATUS_TTL_H;
    const status: LoadStatus = fresh ? st.status : 'UNKNOWN';
    const L = LOAD_VALUE[status];
    const A = LEVEL_VALUE[h.level];
    const raw = WEIGHTS.time * T + WEIGHTS.capability * C + WEIGHTS.load * L + WEIGHTS.level * A;

    const flags: RankedHospital['flags'] = [];
    if (provided === undefined) flags.push('ETA_ESTIMATED');
    if (status === 'SATURATED') flags.push('SATURATED');
    if (status === 'UNKNOWN') flags.push('STATUS_UNKNOWN');

    const capText =
      missing.length === 0
        ? `all ${required.length} capabilities`
        : `${required.length - missing.length} of ${required.length} capabilities (missing: ${missing.join(', ')})`;
    scored.push({
      hospitalId: h.id, name: h.name, level: h.level,
      etaMin: Math.round(eta), etaSource: provided === undefined ? 'fallback' : 'provided',
      score: r2(raw), raw, cRaw: C, parts: { T: r2(T), C: r2(C), L, A }, missing,
      status, statusAgeH: ageH === null ? null : Math.round(ageH * 10) / 10, flags,
      explanation: `${h.name}: ${capText}, ${Math.round(eta)} min.` + (missing.length ? ' Risk of secondary transfer.' : ''),
    });
  }

  const byScore = (a: { raw: number }, b: { raw: number }) => b.raw - a.raw;
  scored.sort(byScore);

  let mode: Recommendation['mode'] = 'direct';
  let ordered = scored;
  let note = 'Decision support only — dispatcher selects destination.';

  if (scored.length === 0) {
    mode = 'no_candidate';
    note = `No facility within ${MAX_ETA_MIN} min — contact SAMU regulation. ${note}`;
  } else if (input.band === 'R') {
    const levelAReachable = scored.some((h) => h.level === 'A' && h.etaMin <= LEVEL_A_GATE_MIN);
    if (levelAReachable) {
      // Critical patient + a Level-A facility in reach: facilities that cover >= 75% of the needs go first.
      ordered = [...scored.filter((h) => h.cRaw >= CAPABILITY_GATE), ...scored.filter((h) => h.cRaw < CAPABILITY_GATE)];
    } else {
      mode = 'stabilise_transfer';
      const b = scored.filter((h) => h.level === 'B');
      ordered = [...b, ...scored.filter((h) => h.level !== 'B')];
      for (const h of b) h.flags.push('STABILISE_THEN_TRANSFER');
      note = `No Level-A facility within ${LEVEL_A_GATE_MIN} min — stabilise at the best Level-B facility and plan a transfer. ${note}`;
    }
  }

  const strip = ({ raw: _raw, cRaw: _c, ...rest }: RankedHospital & { raw: number; cRaw: number }): RankedHospital => rest;
  const all = ordered.map(strip);
  const edCandidates = scored.filter((h) => input.hospitals.find((x) => x.id === h.hospitalId)?.capabilities.includes('ed24'));
  const nearest = [...edCandidates].sort((a, b) => a.etaMin - b.etaMin)[0];
  return { required, mode, items: all.slice(0, 3), all, nearestEd: nearest ? strip(nearest) : null, note };
}
