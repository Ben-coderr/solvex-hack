/**
 * SYNTHETIC replay traces (no real crash data). Physically plausible shapes, seeded noise, 50 Hz sensors and a
 * 1 Hz GPS speed (sample-and-hold), so the detector sees what a phone in a holder would roughly see.
 * `scripts/make-traces.ts` writes them to data/traces/*.csv; the tests generate them in memory.
 */
import type { Sample } from './detector';

export const TRACE_NAMES = ['rollover_71', 'frontal_45', 'speed_bump', 'hard_brake', 'phone_drop', 'walking'] as const;
export type TraceName = (typeof TRACE_NAMES)[number];

/** Expected outcome, the contract the tests enforce. */
export const TRACE_EXPECTS: Record<TraceName, 'alert' | 'no_alert'> = {
  rollover_71: 'alert', frontal_45: 'alert',
  speed_bump: 'no_alert', hard_brake: 'no_alert', phone_drop: 'no_alert', walking: 'no_alert',
};

const HZ = 50;
const DT = 1000 / HZ;

/** mulberry32: tiny deterministic PRNG, so the CSVs are byte-identical on every machine. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Profile {
  durationMs: number;
  seed: number;
  /** true vehicle speed, km/h */
  speed: (t: number) => number;
  /** extra acceleration (g) on top of gravity (0, 0, 1) and the longitudinal term derived from `speed` */
  accel?: (t: number) => [number, number, number];
  /** gravity direction in the phone frame (default: phone flat in a holder) */
  gravity?: (t: number) => [number, number, number];
  gyro?: (t: number) => [number, number, number];
  /** accelerometer replaced (free fall) */
  override?: (t: number) => [number, number, number] | null;
  vibration?: number;
  noGpsUntil?: number;
}

/** Triangle pulse peaking at `peak` g at `t0`, `width` ms wide at the base. */
const pulse = (t: number, t0: number, width: number, peak: number) => {
  const d = Math.abs(t - t0);
  return d >= width / 2 ? 0 : peak * (1 - d / (width / 2));
};
const ramp = (t: number, t0: number, t1: number, v0: number, v1: number) =>
  t <= t0 ? v0 : t >= t1 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);

function render(p: Profile): Sample[] {
  const rand = rng(p.seed);
  const noise = (amp: number) => (rand() * 2 - 1) * amp;
  const vib = p.vibration ?? 0.04;
  const out: Sample[] = [];
  for (let t = 0; t <= p.durationMs; t += DT) {
    const fix = Math.floor(t / 1000) * 1000; // 1 Hz GPS, latest fix
    const v = p.speed(t);
    // longitudinal acceleration from the speed curve (km/h per s → g), braking = negative x
    const lon = (p.speed(t + DT) - v) / (DT / 1000) / 3.6 / 9.81;
    const [gx0, gy0, gz0] = p.gravity?.(t) ?? [0, 0, 1];
    const [ex, ey, ez] = p.accel?.(t) ?? [0, 0, 0];
    const moving = v > 1 ? vib : 0.01;
    const forced = p.override?.(t) ?? null;
    const a: [number, number, number] = forced ?? [gx0 + lon + ex + noise(moving), gy0 + ey + noise(moving), gz0 + ez + noise(moving)];
    const [wx, wy, wz] = p.gyro?.(t) ?? [0, 0, 0];
    const gyroNoise = v > 1 ? 0.03 : 0.005;
    const gps = p.noGpsUntil !== undefined && t < p.noGpsUntil ? null : Math.max(0, p.speed(fix) + noise(0.4));
    out.push({
      t, ax: a[0], ay: a[1], az: a[2],
      gx: wx + noise(gyroNoise), gy: wy + noise(gyroNoise), gz: wz + noise(gyroNoise),
      speed: gps === null ? null : Math.round(gps * 10) / 10,
    });
  }
  return out;
}

const PROFILES: Record<TraceName, Profile> = {
  /** 71 km/h, side impact 5.5 g at 15 s, one full roll over 1.5 s, stops at 18 s, rests on its roof. */
  rollover_71: {
    durationMs: 30_000, seed: 71,
    speed: (t) => ramp(t, 15_000, 18_000, 71, 0),
    accel: (t) => [0, pulse(t, 15_000, 120, 5.5), 0],
    gyro: (t) => [t >= 15_100 && t < 16_600 ? 4.2 : 0, 0, 0],
    gravity: (t) => {
      const ang = t < 15_100 ? 0 : Math.min(4.2 * ((t - 15_100) / 1000), Math.PI);
      return [0, Math.sin(ang), Math.cos(ang)];
    },
  },
  /** 45 km/h, frontal impact 12 g at 14 s, stopped 1.2 s later. */
  frontal_45: {
    durationMs: 25_000, seed: 45,
    speed: (t) => ramp(t, 14_000, 15_200, 45, 0),
    accel: (t) => [-pulse(t, 14_000, 160, 12), 0, pulse(t, 14_010, 80, 1.5)],
    gyro: (t) => [0, t >= 14_000 && t < 14_300 ? 1.5 : 0, 0],
  },
  /** 50 km/h, slows to 32 km/h, two sharp bumps (the second one peaks above 4 g for ~20 ms), back to 50. */
  speed_bump: {
    durationMs: 30_000, seed: 3,
    speed: (t) => (t < 17_000 ? ramp(t, 15_000, 17_000, 50, 32) : ramp(t, 19_000, 22_000, 32, 50)),
    accel: (t) => [0, 0, pulse(t, 17_500, 60, 2.2) + pulse(t, 17_900, 40, 3.6)],
    gyro: (t) => [0, pulse(t, 17_500, 200, 1.2) + pulse(t, 17_900, 200, 1.4), 0],
  },
  /** 90 km/h, emergency stop at 0.9 g with a 1.6 g lurch, stays stopped. */
  hard_brake: {
    durationMs: 35_000, seed: 90,
    speed: (t) => ramp(t, 15_000, 17_830, 90, 0),
    accel: (t) => [-pulse(t, 17_850, 200, 0.7), 0, 0],
    gyro: (t) => [0, pulse(t, 17_850, 300, 0.6), 0],
  },
  /** 60 km/h, the phone falls out of its holder at 15 s (free fall, tumble, 6.5 g on the floor); the car drives on. */
  phone_drop: {
    durationMs: 30_000, seed: 60,
    speed: () => 60,
    override: (t) => (t >= 15_000 && t < 15_350 ? [0.02, 0.03, 0.04] : null),
    accel: (t) => [0, pulse(t, 15_380, 30, 4.5), pulse(t, 15_380, 30, 4.0)],
    gyro: (t) => [t >= 15_000 && t < 15_500 ? 9 : 0, t >= 15_000 && t < 15_500 ? 3 : 0, 0],
    gravity: (t) => (t >= 15_400 ? [0.05, 0.99, 0.08] : [0, 0, 1]),
  },
  /** 60 s walking at ~5 km/h (steps at 1.8 Hz), the phone is dropped on the pavement at 30 s. No GPS for 4 s. */
  walking: {
    durationMs: 60_000, seed: 5, vibration: 0.05, noGpsUntil: 4_000,
    speed: (t) => (t >= 30_000 && t < 33_000 ? 0 : 5),
    accel: (t) => {
      const step = t >= 30_000 && t < 33_000 ? 0 : 0.35 * Math.sin(2 * Math.PI * 1.8 * (t / 1000));
      return [0.1 * step, 0, step + pulse(t, 30_420, 30, 6.5)];
    },
    override: (t) => (t >= 30_000 && t < 30_400 ? [0.01, 0.02, 0.03] : null),
    gyro: (t) => [
      t >= 30_000 && t < 30_450 ? 8 : 0.8 * Math.sin(2 * Math.PI * 0.9 * (t / 1000)),
      t >= 30_000 && t < 30_450 ? 2 : 0, 0,
    ],
  },
};

export function makeTrace(name: TraceName): Sample[] {
  return render(PROFILES[name]);
}
