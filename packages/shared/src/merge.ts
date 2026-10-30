/**
 * Duplicate detection and report merging (pure functions).
 *   Same incident  ⇔  same id  OR  (distance ≤ 300 m AND |Δt| ≤ 10 min)      [ASSUMPTION: tune on field data]
 * Merged inputs feed assess(); each distinct id is an independent report and raises confidence.
 */
import { haversineKm } from './ranking';
import type { AssessmentInput } from './scoring';
import { FLAG_ORDER, KIND_ORDER, type DzmsdPacket, type Flag, type Kind } from './types';

export const MERGE_RADIUS_M = 300;
export const MERGE_WINDOW_MIN = 10;

export interface Locatable { id: string; lat: number; lon: number; at: Date }

export function shouldMerge(a: Locatable, b: Locatable): boolean {
  if (a.id === b.id) return true;
  const meters = haversineKm(a.lat, a.lon, b.lat, b.lon) * 1000;
  const minutes = Math.abs(a.at.getTime() - b.at.getTime()) / 60_000;
  return meters <= MERGE_RADIUS_M && minutes <= MERGE_WINDOW_MIN;
}

export interface MergedIncident {
  /** distinct client ids that contributed (each one = one independent report) */
  ids: string[];
  /** position of the best source: first sensor (A) or manual (M) packet, else the first packet */
  lat: number;
  lon: number;
  plus?: string;
  /** earliest HHMM among the packets (does not handle a merge across midnight; the server resolves full instants) */
  time: string;
  input: AssessmentInput;
}

/**
 * Merge packets in RECEIVE order. A repeated id is an UPDATE of the same report: the last one wins.
 *  dv, g, vehicles, persons → max · rollover → any · flags, kinds → union · vitals → latest value present
 */
export function mergePackets(packets: readonly DzmsdPacket[]): MergedIncident {
  if (packets.length === 0) throw new RangeError('mergePackets: no packets');
  const byId = new Map<string, DzmsdPacket>();
  for (const p of packets) byId.set(p.id, p); // later replaces earlier but keeps first-seen order
  const list = [...byId.values()];

  const flags = new Set<Flag>();
  const kinds = new Set<Kind>();
  let dv: number | undefined, g: number | undefined, roll = false;
  let hr: number | undefined, spo2: number | undefined;
  let veh = 0, pers = 0;
  for (const p of list) {
    p.flags?.forEach((f) => flags.add(f));
    p.kinds.forEach((k) => kinds.add(k));
    if (p.dv !== undefined) dv = Math.max(dv ?? 0, p.dv);
    if (p.g !== undefined) g = Math.max(g ?? 0, p.g);
    if (p.roll) roll = true;
    if (p.hr !== undefined) hr = p.hr;
    if (p.spo2 !== undefined) spo2 = p.spo2;
    veh = Math.max(veh, p.veh);
    pers = Math.max(pers, p.pers);
  }
  const anchor = list.find((p) => p.src === 'A' || p.src === 'M') ?? list[0]!;
  const orderedFlags = FLAG_ORDER.filter((f) => flags.has(f));
  return {
    ids: list.map((p) => p.id),
    lat: anchor.lat, lon: anchor.lon,
    ...(anchor.plus && { plus: anchor.plus }),
    time: list.map((p) => p.time).sort()[0]!,
    input: {
      ...(dv !== undefined && { dvKmh: dv }),
      ...(g !== undefined && { peakG: g }),
      ...(roll && { rollover: true }),
      flags: orderedFlags,
      kinds: KIND_ORDER.filter((k) => kinds.has(k)),
      vehicles: veh, persons: pers,
      ...(hr !== undefined && { hr }),
      ...(spo2 !== undefined && { spo2 }),
      independentReports: list.length,
    },
  };
}
