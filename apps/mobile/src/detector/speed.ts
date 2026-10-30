/**
 * Vehicle speed for the detector. Android's `coords.speed` (Doppler, best) when the phone gives it; many phones give
 * null or -1 (indoors, low speed, some chipsets), and then the detector would never arm. Fallback: distance between
 * two fixes ÷ time, guarded against GPS jitter (a parked phone "moves" a few metres per fix):
 *   - baseline = the NEWEST fix at least 3 s back (≤ 10 s; a longer one would smooth away the crash's speed drop) (at 25 km/h that is ≥ 21 m, well above jitter), both accurate to
 *     ≤ MAX_ACC_M;
 *   - a displacement under JITTER_M (or under the worse accuracy, if smaller) counts as standing still (0 km/h);
 *   - the median of the last 3 computed values, capped at MAX_KMH.
 * Computed speed is coarser than Doppler: the Δv it yields is an estimate (the UI says "computed").
 */
export const MAX_ACC_M = 25;
export const MAX_KMH = 250;
export const JITTER_M = 8;
const MIN_BASE_S = 3;
const MAX_BASE_S = 10;

export interface RawFix { lat: number; lon: number; accM: number | null; at: number; speedMps: number | null }
export interface Speed { kmh: number; source: 'gps' | 'computed' }

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** great-circle distance in metres */
export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

export function createSpeedEstimator() {
  let fixes: RawFix[] = [];
  const recent: number[] = [];
  return {
    update(f: RawFix): Speed | null {
      if (f.speedMps !== null && Number.isFinite(f.speedMps) && f.speedMps >= 0) {
        fixes = [];
        recent.length = 0;
        return { kmh: Math.min(MAX_KMH, f.speedMps * 3.6), source: 'gps' };
      }
      const good = (x: RawFix) => x.accM !== null && x.accM <= MAX_ACC_M;
      fixes = fixes.filter((x) => (f.at - x.at) / 1000 <= MAX_BASE_S);
      if (!good(f)) return null;
      let base: RawFix | undefined;
      for (let i = fixes.length - 1; i >= 0; i--) {
        const x = fixes[i]!;
        if (good(x) && (f.at - x.at) / 1000 >= MIN_BASE_S) {
          base = x;
          break;
        }
      }
      fixes.push(f);
      if (!base) return null;
      const dt = (f.at - base.at) / 1000;
      const d = haversineM(base, f);
      const jitter = Math.min(JITTER_M, Math.max(base.accM!, f.accM!));
      const kmh = d <= jitter ? 0 : Math.min(MAX_KMH, (d / dt) * 3.6);
      recent.push(kmh);
      if (recent.length > 3) recent.shift();
      return { kmh: median(recent), source: 'computed' };
    },
    reset() {
      fixes = [];
      recent.length = 0;
    },
  };
}
