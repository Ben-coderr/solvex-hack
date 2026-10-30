/**
 * Every detector threshold, in ONE place (docs/04 §3.2). ALL values are ASSUMPTIONS to tune with
 * team-recorded drops, brakes and bumps (sensor lab, M9). Sources for the starting points: WreckWatch
 * (4 g floor + speed gate), Apple (10 + 30 s) and Google (60 s) countdowns. Nothing here is validated.
 */
export const DETECTOR_CONFIG = {
  /** ASSUMPTION: GPS speed above which a trip may arm (km/h). */
  armSpeedKmh: 25,
  /** ASSUMPTION: how long speed must stay above `armSpeedKmh` before ARMED (ms). */
  armHoldMs: 10_000,
  /** ASSUMPTION: DISARM after speed < `disarmSpeedKmh` for `disarmHoldMs`. */
  disarmSpeedKmh: 10,
  disarmHoldMs: 180_000,
  /** ASSUMPTION: ring buffer kept while ARMED (ms). */
  bufferMs: 10_000,

  /** ASSUMPTION rule (a): peak ≥ 4 g, ≥ 2.5 g sustained ≥ 30 ms, speed drop ≥ 20 km/h within 3 s. */
  aPeakG: 4,
  aSustainG: 2.5,
  aSustainMs: 30,
  aSpeedDropKmh: 20,
  /** ASSUMPTION rule (b): peak ≥ 8 g and speed drop ≥ 10 km/h within 3 s. */
  bPeakG: 8,
  bSpeedDropKmh: 10,
  /** ASSUMPTION: window after the impact in which the speed drop must appear (ms). */
  speedDropWindowMs: 3_000,
  /** ASSUMPTION rule (c): integrated rotation ≥ 90° within 2 s while speed was > `armSpeedKmh`. */
  rollDeg: 90,
  rollWindowMs: 2_000,

  /** ASSUMPTION: CONFIRM when the vehicle is stopped (< 5 km/h) within 5 s of the CANDIDATE. */
  stopSpeedKmh: 5,
  confirmWindowMs: 5_000,

  /** ASSUMPTION derived physics: dv = max speed 3 s before − min speed 3 s after the impact. */
  dvWindowMs: 3_000,
  /** ASSUMPTION: two impact peaks ≥ `aPeakG`, at least 200 ms apart, within 5 s = multi-impact. */
  multiImpactWindowMs: 5_000,
  multiImpactGapMs: 200,

  /** ASSUMPTION: countdown before an automatic alert (s); demo mode shortens it and SAYS SO. */
  countdownS: 30,
  demoCountdownS: 10,
} as const;

export type DetectorConfig = { readonly [K in keyof typeof DETECTOR_CONFIG]: number };
