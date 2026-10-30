import { haversineKm, type HospitalRecord } from '@sellekni/shared';

/**
 * Which hospitals go to routing + ranking. The national set has ~280 rows: asking OSRM/ORS for all of them on every
 * incident is slow and burns the free ORS quota. Keep the `nearest` closest by straight line, plus the `levelA`
 * closest Level-A ones even when far (the ranking's Level-A gate must still see a CHU 50 km away in the south).
 * Small sets (the synthetic demo) pass through untouched, so the tested worked example does not move.
 */
export function rankingCandidates<T extends HospitalRecord>(
  hospitals: readonly T[], at: { lat: number; lon: number }, nearest = 12, levelA = 3,
): T[] {
  if (hospitals.length <= nearest + levelA) return [...hospitals];
  const byDistance = hospitals
    .map((h) => ({ h, km: haversineKm(at.lat, at.lon, h.lat, h.lon) }))
    .sort((a, b) => a.km - b.km)
    .map((x) => x.h);
  const picked = new Set(byDistance.slice(0, nearest));
  for (const h of byDistance.filter((x) => x.level === 'A').slice(0, levelA)) picked.add(h);
  return byDistance.filter((h) => picked.has(h));
}
