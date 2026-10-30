/** Accelerometer in g (specific force, gravity included), gyroscope in deg/s, time in ms. */
export interface Sample { t: number; ax: number; ay: number; az: number; gx: number; gy: number; gz: number }
/** One GPS speed fix. `t` is the ARRIVAL time on the phone (so GPS latency is already inside it). */
export interface GpsFix { t: number; speedKmh: number }

export type DetectorState = 'UNSUPPORTED' | 'IDLE' | 'ARMED' | 'EVALUATING' | 'ALERT';

/** Machine keys: the UI maps them to ar/fr/en sentences (no free text in the detector). */
export type ReasonKey = 'speed_collapse' | 'impact_sustained' | 'impact_at_sensor_limit' | 'rotation' | 'came_to_stop';
export type RejectKey = 'no_gps_history' | 'too_short' | 'no_speed_drop' | 'still_moving' | 'no_rule_matched';

export interface EventMetrics {
  /** Largest |a| seen in the event, in g, CAPPED at the sensor range. Goes into the packet as `G`. */
  peakG: number;
  /** True when the sensor sat at its ceiling: show "≥ N g (sensor limit)", never "N g". */
  sensorLimited: boolean;
  /** Longest contiguous time (ms) with dynamic acceleration above the "high-g" threshold. */
  tHighMs: number;
  /** Total time (ms) with at least one axis at ≥ 95 % of the sensor range. */
  tSaturatedMs: number;
  /** Number of axes with a dynamic excursion >= 1.5 g. A reported CUE, not a gate (see docs/13 §4). */
  axesActive: number;
  /** Integrated |gyro| over [-0.5 s, +2.5 s] around the trigger, in degrees. */
  rotationDeg: number;
  speedBeforeKmh: number;
  speedAfterKmh: number;
  /** Coarse GPS speed drop (km/h). Goes into the packet as `D`. NEVER derived from a clipped accelerometer. */
  dvKmh: number;
  stopped: boolean;
}

export interface Decision {
  kind: 'alert' | 'rejected';
  /** time of the trigger sample (ms) */
  tEventMs: number;
  /** which rule from docs/04 §3.2 fired: (a) sustained impact, (b) strong impact, (c) rollover */
  rule: 'a' | 'b' | 'c' | null;
  reasons: ReasonKey[];
  rejected: RejectKey[];
  metrics: EventMetrics;
}

export interface Trace {
  name: string;
  /** the accelerometer range the trace was generated for (g) */
  rangeG: number;
  rateHz: number;
  samples: Sample[];
  gps: GpsFix[];
  /** what a correct detector must do with this trace */
  expect: 'alert' | 'no-alert';
  note: string;
  synthetic: true;
}

export interface PacketHints { G: number; D: number; RO: boolean; sensorLimited: boolean }
