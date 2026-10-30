import { CROCKFORD } from '../src/dzmsd';
import { encodePlusCode } from '../src/pluscode';
import { BAND_VALUES, CONF_VALUES, FLAG_ORDER, KIND_ORDER, SOURCE_VALUES, type DzmsdPacket } from '../src/types';

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
const subset = <T,>(r: () => number, a: readonly T[], min: number): T[] => {
  let s = a.filter(() => r() < 0.35);
  if (s.length < min) s = [pick(r, a)];
  return s;
};

export function randomPacket(r: () => number): DzmsdPacket {
  const lat = Math.round((18.9 + r() * 18.3) * 1e5) / 1e5;
  const lon = Math.round((-8.7 + r() * 20.7) * 1e5) / 1e5;
  const p: DzmsdPacket = {
    id: Array.from({ length: 5 }, () => CROCKFORD[Math.floor(r() * 32)]).join(''),
    band: pick(r, BAND_VALUES),
    score: Math.floor(r() * 100),
    conf: pick(r, CONF_VALUES),
    lat, lon,
    time: String(Math.floor(r() * 24)).padStart(2, '0') + String(Math.floor(r() * 60)).padStart(2, '0'),
    src: pick(r, SOURCE_VALUES),
    veh: Math.floor(r() * 10), pers: Math.floor(r() * 10),
    kinds: subset(r, KIND_ORDER, 1),
  };
  if (r() < 0.6) p.dv = Math.floor(r() * 130);
  if (r() < 0.6) p.g = Math.floor(r() * 80);
  if (r() < 0.3) p.roll = true;
  if (r() < 0.6) { const f = subset(r, FLAG_ORDER, 1); p.flags = f; }
  if (r() < 0.4) p.hr = 30 + Math.floor(r() * 170);
  if (r() < 0.4) p.spo2 = 70 + Math.floor(r() * 31);
  if (r() < 0.8) p.plus = encodePlusCode(lat, lon);
  return p;
}
