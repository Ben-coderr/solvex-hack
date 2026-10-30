/**
 * App timings that are not detector thresholds (those are `PARAMS` in @sellekni/detector). ASSUMPTIONS, sourced
 * starting points: Apple (10 + 30 s) and Google (60 s) crash-detection countdowns.
 */
export const COUNTDOWN = {
  /** countdown before an automatic alert (s) */
  seconds: 30,
  /** demo mode shortens it and SAYS SO on screen */
  demoSeconds: 10,
} as const;

/** Requested sensor period. 100 Hz leaves headroom over the detector's 45 Hz floor (docs/13 §2.4); Android caps at 200 Hz. */
export const SENSOR_INTERVAL_MS = 10;
/** Battery < 10 %: 50 Hz, still above the floor (docs/03 §6: reduce sampling, keep detection). */
export const LOW_BATTERY_SENSOR_INTERVAL_MS = 20;
