import * as Location from 'expo-location';
import type { Fix } from '../alert/packet';
import { useSession } from '../state/session';

/**
 * Where the witness is (M6). GPS is automatic: a fresh fix if one comes within `timeoutMs`, else the last known one
 * (sent as is, its age shown), else none: the report still goes out and the dispatcher calls back (docs/03 edge cases).
 */
export type WitnessFix = { fix: Fix | null; kind: 'current' | 'last' | 'none'; denied: boolean };

const toFix = (l: Location.LocationObject): Fix => ({
  lat: l.coords.latitude, lon: l.coords.longitude, at: l.timestamp, ...(l.coords.accuracy !== null && { accM: l.coords.accuracy }),
});

const sessionFix = (): Fix | null => {
  const f = useSession.getState().fix;
  return f ? { lat: f.lat, lon: f.lon, at: f.at, ...(f.accM !== undefined && { accM: f.accM }) } : null;
};

export async function locateWitness(timeoutMs = 10_000): Promise<WitnessFix> {
  let perm = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (perm && !perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (!perm?.granted) {
    const f = sessionFix();
    return { fix: f, kind: f ? 'last' : 'none', denied: true };
  }
  const current = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
  if (current) return { fix: toFix(current), kind: 'current', denied: false };
  const last = await Location.getLastKnownPositionAsync().catch(() => null);
  const f = last ? toFix(last) : sessionFix();
  return { fix: f, kind: f ? 'last' : 'none', denied: false };
}
