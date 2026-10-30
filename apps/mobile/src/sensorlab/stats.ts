/**
 * Sensor Lab maths (M9, docs/13 §6.3), pure so it is tested: T1 turns Android's maximumRange (m/s²) into the
 * detector's rangeG; T3 turns sensor timestamps into the real sampling rate (median and p95 of Δt).
 */
import { PARAMS } from '@najda/detector';

/** Android SensorManager.STANDARD_GRAVITY */
export const STANDARD_GRAVITY = 9.80665;

export interface MotionSensor {
  kind: 'accelerometer' | 'accelerometer_uncalibrated' | 'gyroscope';
  name: string;
  vendor: string;
  version: number;
  /** m/s² for accelerometers, rad/s for gyroscopes (Android units) */
  maximumRange: number;
  resolution: number;
  minDelayUs: number;
  maxDelayUs: number;
  fifoMaxEventCount: number;
  isWakeUp: boolean;
  isDefault: boolean;
}

/** maximumRange (m/s²) -> g, one decimal: 78.45 -> 8, 156.9 -> 16. */
export const rangeGFrom = (maximumRangeMs2: number) => Math.round((maximumRangeMs2 / STANDARD_GRAVITY) * 10) / 10;

/** The range the detector should use: the DEFAULT accelerometer's (that is the one expo-sensors listens to). */
export function accelerometerRangeG(sensors: readonly MotionSensor[]): number | null {
  const acc = sensors.find((s) => s.kind === 'accelerometer' && s.isDefault) ?? sensors.find((s) => s.kind === 'accelerometer');
  return acc && acc.maximumRange > 0 ? rangeGFrom(acc.maximumRange) : null;
}

export const isRangeSupported = (rangeG: number) => rangeG >= PARAMS.minRangeG;

export interface RateStats {
  samples: number;
  durationS: number;
  medianHz: number;
  medianDtMs: number;
  p95DtMs: number;
  /** longest gap between two samples (ms): a stall the detector cannot see through */
  maxGapMs: number;
  /** median ≥ PARAMS.minRateHz (45 Hz): the detector's rateOk */
  ok: boolean;
}

/** T3: sampling statistics from sensor timestamps in ms (monotonic). null with fewer than 50 samples. */
export function rateStats(tMs: readonly number[]): RateStats | null {
  const dts: number[] = [];
  for (let i = 1; i < tMs.length; i++) {
    const dt = tMs[i]! - tMs[i - 1]!;
    if (dt > 0) dts.push(dt);
  }
  if (dts.length < 50) return null;
  const sorted = [...dts].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  const medianDtMs = q(0.5);
  const medianHz = 1000 / medianDtMs;
  return {
    samples: tMs.length,
    durationS: (tMs.at(-1)! - tMs[0]!) / 1000,
    medianHz: Math.round(medianHz * 10) / 10,
    medianDtMs: Math.round(medianDtMs * 100) / 100,
    p95DtMs: Math.round(q(0.95) * 100) / 100,
    maxGapMs: Math.round(sorted.at(-1)!),
    ok: medianHz >= PARAMS.minRateHz,
  };
}
