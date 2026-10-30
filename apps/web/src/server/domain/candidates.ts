import { haversineKm, type Capability, type HospitalRecord } from '@sellekni/shared';

/**
 * Which hospitals go to routing + ranking. The national set has ~270 rows: asking OSRM/ORS for all of them on every
 * incident is slow and burns the free ORS quota. Keep, by straight line:
 *   - the `nearest` closest hospitals,
 *   - the `levelA` closest Level-A ones even when far (the ranking's Level-A gate must still see a CHU 50 km away),
 *   - for every capability the case requires (neurosurgery, burns, …), the closest hospital that has it, and the
 *     closest one that has them all: the hospital that can do the job is never cut before it is ranked.
 * Small sets (the synthetic demo) pass through untouched, so the tested worked example does not move.
 */
export function rankingCandidates<T extends HospitalRecord>(
  hospitals: readonly T[], at: { lat: number; lon: number }, required: readonly Capability[] = [], nearest = 12, levelA = 3,
): T[] {
  if (hospitals.length <= nearest + levelA) return [...hospitals];
  const byDistance = hospitals
    .map((h) => ({ h, km: haversineKm(at.lat, at.lon, h.lat, h.lon) }))
    .sort((a, b) => a.km - b.km)
    .map((x) => x.h);
  const picked = new Set(byDistance.slice(0, nearest));
  for (const h of byDistance.filter((x) => x.level === 'A').slice(0, levelA)) picked.add(h);
  for (const c of required) {
    const h = byDistance.find((x) => x.capabilities.includes(c));
    if (h) picked.add(h);
  }
  const complete = byDistance.find((x) => required.every((c) => x.capabilities.includes(c)));
  if (complete) picked.add(complete);
  return byDistance.filter((h) => picked.has(h));
}
