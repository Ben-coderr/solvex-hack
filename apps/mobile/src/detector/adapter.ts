/**
 * The thin adapter between the phone and `@sellekni/detector` (packages/detector/README.md). Pure TypeScript, no React,
 * no Expo imports, so the live sensors, the replay engine and the tests drive the SAME code path:
 *   samples / GPS fixes on ONE time base (ms) -> Detector -> decisions -> the app (countdown) -> acknowledge().
 * The detector itself is never re-implemented here: this file converts units and clocks, and keeps a UI snapshot.
 */
import { Detector, PARAMS, type Decision, type DetectorState, type GpsFix, type Sample } from '@sellekni/detector';

export const RAD_TO_DEG = 180 / Math.PI;

/** What the Drive screen shows. Derived from the detector's public getters plus the last GPS speed. */
export interface DetectorSnapshot {
  state: DetectorState;
  rangeG: number;
  /** median sampling rate over the last ~200 samples; null until enough samples have arrived */
  rateHz: number | null;
  /** false => below PARAMS.minRateHz the detector misses crashes: warn, never pretend to protect */
  rateOk: boolean;
  speedKmh: number | null;
  /** 0..1 of the 10 s speed gate (UI only; the detector decides arming itself) */
  armProgress: number;
}

export const IDLE_SNAPSHOT: DetectorSnapshot = { state: 'IDLE', rangeG: 0, rateHz: null, rateOk: true, speedKmh: null, armProgress: 0 };

export interface DetectorHost {
  readonly detector: Detector;
  pushSample(s: Sample): Decision[];
  pushGps(fix: GpsFix): Decision[];
  snapshot(): DetectorSnapshot;
  /** the countdown ended (I'm OK or alert sent): resume watching */
  acknowledge(): void;
}

export function createDetectorHost(rangeG: number): DetectorHost {
  const detector = new Detector(rangeG);
  let speedKmh: number | null = null;
  let fastSince: number | null = null;
  let lastT = 0;

  return {
    detector,
    pushSample(s) {
      lastT = Math.max(lastT, s.t);
      return detector.pushSample(s);
    },
    pushGps(fix) {
      lastT = Math.max(lastT, fix.t);
      speedKmh = fix.speedKmh;
      fastSince = fix.speedKmh >= PARAMS.armSpeedKmh ? (fastSince ?? fix.t) : null;
      return detector.pushGps(fix);
    },
    snapshot() {
      const hz = detector.measuredRateHz;
      const state = detector.state;
      return {
        state,
        rangeG,
        rateHz: Number.isNaN(hz) ? null : Math.round(hz),
        rateOk: detector.rateOk,
        speedKmh,
        armProgress:
          state === 'UNSUPPORTED' ? 0
          : state !== 'IDLE' ? 1
          : fastSince === null ? 0 : Math.min(1, (lastT - fastSince) / PARAMS.armHoldMs),
      };
    },
    acknowledge: () => detector.acknowledge(),
  };
}

/**
 * expo-sensors timestamps are in SECONDS on the sensor's own clock (Android: since boot). GPS fixes are stamped with
 * their ARRIVAL time (Date.now()), as the detector requires. This maps sensor time onto the arrival clock with the
 * smallest observed delivery delay, so JS-bridge batching does not distort the sample spacing (the measured rate).
 * A sensor clock that goes back, or a delay jump of more than 1 s (sensor restart, clock change), re-anchors it.
 */
export function createSensorClock() {
  let offset: number | null = null;
  let lastRaw = -Infinity;
  return {
    toMs(sensorSeconds: number, arrivalMs: number): number {
      const raw = sensorSeconds * 1000;
      const o = arrivalMs - raw;
      if (offset === null || o < offset || o - offset > 1000 || raw < lastRaw) offset = o;
      lastRaw = raw;
      return Math.round((raw + offset) * 10) / 10;
    },
  };
}

/** expo-sensors readings -> one detector Sample (accelerometer in g with gravity; gyroscope rad/s -> deg/s). */
export function toSample(t: number, a: { x: number; y: number; z: number }, gyroRad: { x: number; y: number; z: number }): Sample {
  return { t, ax: a.x, ay: a.y, az: a.z, gx: gyroRad.x * RAD_TO_DEG, gy: gyroRad.y * RAD_TO_DEG, gz: gyroRad.z * RAD_TO_DEG };
}

/** A GPS speed reading (m/s, null or negative = unknown) -> a detector fix stamped with its arrival time; null = skip. */
export function toGpsFix(speedMps: number | null | undefined, arrivalMs: number): GpsFix | null {
  if (speedMps === null || speedMps === undefined || !Number.isFinite(speedMps) || speedMps < 0) return null;
  return { t: arrivalMs, speedKmh: speedMps * 3.6 };
}
