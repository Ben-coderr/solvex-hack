import type { GpsFix, Sample, Trace } from './types';

/**
 * Synthetic, deterministic phone traces. EVERYTHING here is a MODEL, not measured data:
 *  - pulses are half-sine (a common idealisation); peak and Δv are the inputs, the duration is solved from them
 *  - peak levels for frontal crashes follow the order of magnitude of published full-frontal tests
 *    (36-46 g at 56 km/h, Locey et al. 2012) but are NOT claimed to reproduce any vehicle
 *  - the phone sees the vehicle signal rotated into a random mount orientation, clipped at the sensor range
 * Use them to test LOGIC and to make the stage demo reproducible. Replace them with real recorded traces (docs/13 §7).
 */
export type Mount = 'aligned' | 'tilted' | 'pocket';
export interface SynthOptions { rangeG: number; seed: number; rateHz?: number; mount?: Mount; gpsLagMs?: number }
export const SCENARIOS = [
  'frontal_45', 'rollover_71',
  'speed_bump', 'hard_brake', 'phone_drop', 'pothole_80', 'pothole_then_stop', 'door_slam', 'walking_pocket', 'fender_bender_12',
] as const;
export type ScenarioName = (typeof SCENARIOS)[number];

const G = 9.81;
const D2R = Math.PI / 180;

export function rng(seed: number): () => number { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());

type M3 = [[number, number, number], [number, number, number], [number, number, number]];
const mul = (A: M3, B: M3): M3 => A.map((_, i) => [0, 1, 2].map((j) => A[i]![0]! * B[0]![j]! + A[i]![1]! * B[1]![j]! + A[i]![2]! * B[2]![j]!)) as M3;
const Rx = (a: number): M3 => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const Ry = (a: number): M3 => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const Rz = (a: number): M3 => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const apply = (M: M3, v: [number, number, number]): [number, number, number] =>
  [0, 1, 2].map((i) => M[i]![0]! * v[0] + M[i]![1]! * v[1] + M[i]![2]! * v[2]) as [number, number, number];

function mountMatrix(mount: Mount, r: () => number): M3 {
  const j = (deg: number) => (r() * 2 - 1) * deg * D2R;
  if (mount === 'aligned') return mul(Rz(j(3)), mul(Ry(j(3)), Rx(j(3))));
  if (mount === 'tilted') return mul(Rz((Math.floor(r() * 4) * 90) * D2R + j(10)), mul(Ry(j(25)), Rx(j(25))));
  return mul(Rz(r() * 2 * Math.PI), mul(Ry(Math.asin(r() * 2 - 1)), Rx(r() * 2 * Math.PI)));
}

const halfSine = (tRel: number, T: number, peak: number) => (tRel >= 0 && tRel <= T ? peak * Math.sin((Math.PI * tRel) / T) : 0);
/** half-sine duration (s) that removes exactly v0 km/h with the given peak (g):  v = (2/pi) * peak * g * T */
export const pulseDuration = (v0Kmh: number, peakG: number) => ((v0Kmh / 3.6) * Math.PI) / (2 * peakG * G);

interface Frame {
  along: number; lat: number; vert: number;          // vehicle-frame kinematic acceleration (g); along<0 = braking
  rollDeg?: number;                                  // body roll angle (deg) -> gravity direction + roll rate
  supported?: number;                                // fraction of gravity felt (1 normal, ~0.4 tumbling)
  pitchRate?: number; yawRate?: number;              // deg/s bursts
  freefall?: number;                                 // 0..1: scale the whole specific force towards 0 (phone in free fall)
  phone?: [number, number, number];                  // extra specific force added in the PHONE frame (drop impacts)
}
interface Scenario { v0: number; durationS: number; expect: Trace['expect']; note: string; mount?: Mount; profile: (t: number, v: number) => Frame }

function scenario(name: ScenarioName): Scenario {
  const T = 20; // event time (s)
  switch (name) {
    case 'frontal_45': {
      const peak = 32, d = pulseDuration(45, peak);
      return { v0: 45, durationS: 30, expect: 'alert', note: `full-frontal, Δv 45 km/h, half-sine ${peak} g / ${(d * 1000).toFixed(0)} ms, stops dead`,
        profile: (t) => { const p = halfSine(t - T, d, peak); return { along: -p, lat: 0.15 * p, vert: 0.1 * p, pitchRate: p > 0 ? 40 : 0 }; } };
    }
    case 'rollover_71': {
      const d = 0.06, rollStart = T + 0.05, rollRate = 330, rollEnd = rollStart + 1.1;
      return { v0: 71, durationS: 30, expect: 'alert', note: 'kerb trip 20 g / 60 ms, ~360° roll in 1.1 s, two ground impacts 9 g, slides to a stop',
        profile: (t, v) => {
          const roll = t < rollStart ? 0 : t < rollEnd ? (t - rollStart) * rollRate : rollRate * 1.1;
          const tumbling = t >= rollStart && t < rollEnd;
          const ground = halfSine(t - (T + 0.4), 0.04, 9) + halfSine(t - (T + 0.8), 0.04, 9);
          return { along: t >= T && v > 0 ? -0.5 : 0, lat: halfSine(t - T, d, 20), vert: ground, rollDeg: roll, supported: tumbling ? 0.4 : 1 };
        } };
    }
    case 'speed_bump': {
      return { v0: 50, durationS: 30, expect: 'no-alert', note: 'brakes 50->25 km/h, then a hard bump 6 g / 60 ms; never stops (the stop gate is what rejects it)',
        profile: (t) => ({ along: t >= 14 && t < 16.02 ? -0.35 : 0, lat: 0, vert: halfSine(t - 18, 0.06, 6), pitchRate: t >= 18 && t < 18.2 ? 40 : 0 }) };
    }
    case 'hard_brake': {
      return { v0: 90, durationS: 30, expect: 'no-alert', note: '90 km/h to 0 at 0.8 g: a big speed change with no impact',
        profile: (t, v) => ({ along: t >= 15 && v > 0 ? -0.8 : 0, lat: 0, vert: 0 }) };
    }
    case 'phone_drop': {
      return { v0: 60, durationS: 30, expect: 'no-alert', note: 'phone falls off the seat: 0.3 s free fall then 3 band-limited impacts (clipped at the range); the car keeps going',
        profile: (t) => {
          const ff = t >= 18 && t < 18.3 ? 0.95 : 0;
          const hit = halfSine(t - 18.3, 0.015, 60) + halfSine(t - 18.36, 0.012, 25) + halfSine(t - 18.42, 0.012, 10);
          return { along: 0, lat: 0, vert: 0, freefall: ff, phone: [hit * 0.6, hit * 0.5, hit * 0.62] };
        } };
    }
    case 'pothole_80': {
      return { v0: 60, durationS: 30, expect: 'no-alert', note: 'pothole at 60 km/h: 6 g / 20 ms vertical, speed unchanged',
        profile: (t) => ({ along: 0, lat: 0, vert: halfSine(t - 18, 0.02, 6), pitchRate: t >= 18 && t < 18.15 ? 60 : 0 }) };
    }
    case 'pothole_then_stop': {
      return { v0: 60, durationS: 30, expect: 'no-alert', note: 'pothole 6 g / 20 ms, then the driver brakes hard to a red light and stops: speed collapse + stop are both true, ONLY the duration gate rejects it',
        profile: (t, v) => ({ along: t >= 19.2 && v > 0 ? -0.8 : 0, lat: 0, vert: halfSine(t - 18, 0.02, 6), pitchRate: t >= 18 && t < 18.15 ? 60 : 0 }) };
    }
    case 'door_slam': {
      return { v0: 0, durationS: 20, expect: 'no-alert', note: 'parked car, door slam 3 g / 30 ms: never armed',
        profile: (t) => ({ along: 0, lat: 0.6 * halfSine(t - 10, 0.03, 3), vert: 0 }) };
    }
    case 'walking_pocket': {
      return { v0: 5, durationS: 20, expect: 'no-alert', mount: 'pocket', note: 'phone in a pocket, walking 5 km/h: never armed',
        profile: (t) => ({ along: 0, lat: 0.5 * Math.sin(2 * Math.PI * 0.95 * t), vert: 1.6 * Math.sin(2 * Math.PI * 1.9 * t), pitchRate: 80 * Math.sin(2 * Math.PI * 0.95 * t) }) };
    }
    case 'fender_bender_12': {
      const peak = 8, d = pulseDuration(12, peak);
      return { v0: 12, durationS: 30, expect: 'no-alert', note: 'KNOWN LIMITATION: 12 km/h shunt, below the 25 km/h speed gate, deliberately not detected (witness/SOS cover it)',
        profile: (t) => ({ along: -halfSine(t - T, d, peak), lat: 0, vert: 0 }) };
    }
  }
}

export function makeTrace(name: ScenarioName, o: SynthOptions): Trace {
  const sc = scenario(name);
  const rate = o.rateHz ?? 100;
  const dt = 1 / rate;
  const r = rng(o.seed * 7919 + SCENARIOS.indexOf(name) * 104729 + 1);
  const M = mountMatrix(o.mount ?? sc.mount ?? 'tilted', r);
  const phase = r() * dt;              // sub-sample phase so a short pulse is not always sampled at its peak
  const lag = o.gpsLagMs ?? 800;
  const n = Math.round(sc.durationS * rate);

  let v = sc.v0, prevRoll = 0, vib: [number, number, number] = [0, 0, 0];
  const speed: number[] = [];
  const samples: Sample[] = [];
  const clip = (x: number, R: number) => Math.max(-R, Math.min(R, x));
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const f = sc.profile(t + phase, v);
    v = Math.max(0, v + f.along * G * 3.6 * dt);
    speed.push(v);
    const th = (f.rollDeg ?? 0) * D2R, sup = f.supported ?? 1;
    const rollRate = ((f.rollDeg ?? 0) - prevRoll) / dt; prevRoll = f.rollDeg ?? 0;
    const ff = 1 - (f.freefall ?? 0); // specific force in the VEHICLE frame (g): kinematic part + the part of gravity the body feels
    const sf: [number, number, number] = [f.along * ff, (f.lat + sup * Math.sin(th)) * ff, (f.vert + sup * Math.cos(th)) * ff];
    const moving = v > 5 ? 1 : 0;
    vib = vib.map((x) => 0.8 * x + 0.6 * gauss(r) * 0.05 * moving) as [number, number, number];
    const body = apply(M, sf);
    const ph = f.phone ?? [0, 0, 0];
    const ax = clip(body[0] + ph[0] + vib[0] + 0.012 * gauss(r), o.rangeG);
    const ay = clip(body[1] + ph[1] + vib[1] + 0.012 * gauss(r), o.rangeG);
    const az = clip(body[2] + ph[2] + vib[2] + 0.012 * gauss(r), o.rangeG);
    const gyro = apply(M, [rollRate, f.pitchRate ?? 0, f.yawRate ?? 0]);
    samples.push({
      t: Math.round(t * 1000), ax: +ax.toFixed(4), ay: +ay.toFixed(4), az: +az.toFixed(4),
      gx: +clip(gyro[0] + 0.5 * gauss(r), 2000).toFixed(2), gy: +clip(gyro[1] + 0.5 * gauss(r), 2000).toFixed(2), gz: +clip(gyro[2] + 0.5 * gauss(r), 2000).toFixed(2),
    });
  }
  const gps: GpsFix[] = [];
  for (let tk = 250; tk < sc.durationS * 1000; tk += 1000) {
    const idx = Math.max(0, Math.min(n - 1, Math.round(((tk - lag) / 1000) * rate)));
    gps.push({ t: tk, speedKmh: Math.max(0, +(speed[idx]! + 0.4 * gauss(r)).toFixed(1)) });
  }
  return { name, rangeG: o.rangeG, rateHz: rate, samples, gps, expect: sc.expect, note: sc.note, synthetic: true };
}

/** Time of the (true) event in a scenario, for tests/docs. */
export const EVENT_TIME_S = 20;
