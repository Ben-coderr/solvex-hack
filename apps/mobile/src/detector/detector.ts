/**
 * Crash detection state machine (docs/04 §3.2). PURE TypeScript: no React, no Expo, no clock, no randomness.
 * The same code runs on live sensors and on replayed CSV traces, so a trace gives the same decisions every time.
 *
 *   IDLE ──speed > 25 km/h for 10 s──▶ ARMED ──rule a|b|c──▶ CANDIDATE ──stopped within 5 s──▶ COUNTDOWN
 *                                        ▲                       │ not stopped                      │
 *                                        └───────────────────────┘                        resolve('ok' → ARMED,
 *   ARMED ──speed < 10 km/h for 3 min──▶ IDLE                                                     'alerted' → IDLE)
 */
import { DETECTOR_CONFIG, type DetectorConfig } from './config';

/** One sensor reading. Units: t ms · acceleration in g (gravity included) · gyro rad/s · GPS speed km/h (null = no fix yet). */
export interface Sample {
  t: number;
  ax: number; ay: number; az: number;
  gx: number; gy: number; gz: number;
  speed: number | null;
}

export type DetectorState = 'IDLE' | 'ARMED' | 'CANDIDATE' | 'COUNTDOWN';
/** a: sustained ≥ 4 g + speed drop ≥ 20 · b: ≥ 8 g + speed drop ≥ 10 · c: rollover ≥ 90° in 2 s at speed */
export type CandidateRule = 'a' | 'b' | 'c';

/** Derived physics handed to the alert (rounded only when it becomes a packet). */
export interface Crash {
  tImpact: number;
  rule: CandidateRule;
  dvKmh: number;
  peakG: number;
  rollover: boolean;
  multiImpact: boolean;
}

export type DetectorEvent =
  | { type: 'armed'; t: number }
  | { type: 'disarmed'; t: number }
  | { type: 'candidate'; t: number; rule: CandidateRule }
  | { type: 'rejected'; t: number; reason: 'not_stopped' }
  | { type: 'confirm'; t: number; crash: Crash }
  | { type: 'resolved'; t: number; outcome: 'ok' | 'alerted' };

export interface DetectorSnapshot {
  state: DetectorState;
  /** last known GPS speed, km/h */
  speed: number | null;
  /** last |a| in g */
  g: number;
  /** 0..1 progress of the speed gate while IDLE (UI ring) */
  armProgress: number;
}

export interface Detector {
  push(s: Sample): DetectorEvent[];
  /** The countdown ended: the user said "I'm OK", or an alert went out. */
  resolve(outcome: 'ok' | 'alerted', t: number): DetectorEvent[];
  snapshot(): DetectorSnapshot;
}

const RAD2DEG = 180 / Math.PI;
/** Ignore gaps in the sensor stream when integrating (a paused stream must not look like a rotation). */
const MAX_DT_MS = 100;

interface Impact {
  t0: number;
  peak: number;
  sustainMs: number;
  run: number;
}

export function createDetector(cfg: DetectorConfig = DETECTOR_CONFIG): Detector {
  let state: DetectorState = 'IDLE';
  let speed: number | null = null;
  let g = 1;
  let prevT: number | null = null;
  let aboveSince: number | null = null;
  let belowSince: number | null = null;
  // ring buffers (bufferMs): speed and |a| per sample, rotation increments for the rollover window
  let speeds: { t: number; v: number }[] = [];
  let mags: { t: number; g: number }[] = [];
  let rot: { t: number; deg: number }[] = [];
  let rotSum = 0;
  let rollSeenAt: number | null = null;
  let crossings: number[] = [];
  let wasAbove = false;
  let impact: Impact | null = null;
  let candidate: { t: number; tImpact: number; rule: CandidateRule } | null = null;

  const maxSpeed = (from: number, to: number) =>
    speeds.reduce((m, p) => (p.t >= from && p.t <= to ? Math.max(m, p.v) : m), -Infinity);
  const minSpeed = (from: number, to: number) =>
    speeds.reduce((m, p) => (p.t >= from && p.t <= to ? Math.min(m, p.v) : m), Infinity);
  const peakG = (from: number, to: number) => mags.reduce((m, p) => (p.t >= from && p.t <= to ? Math.max(m, p.g) : m), 0);

  function toArmed() {
    state = 'ARMED';
    belowSince = null;
    impact = null;
    candidate = null;
  }

  function toIdle() {
    state = 'IDLE';
    aboveSince = null;
    impact = null;
    candidate = null;
  }

  function becomeCandidate(t: number, tImpact: number, rule: CandidateRule): DetectorEvent {
    state = 'CANDIDATE';
    candidate = { t, tImpact, rule };
    return { type: 'candidate', t, rule };
  }

  function crashAt(now: number, c: { tImpact: number; rule: CandidateRule }): Crash {
    const before = maxSpeed(c.tImpact - cfg.dvWindowMs, c.tImpact);
    const after = minSpeed(c.tImpact, Math.min(now, c.tImpact + cfg.dvWindowMs));
    const dv = Number.isFinite(before) && Number.isFinite(after) ? Math.max(0, before - after) : 0;
    const peaks = crossings.filter((x) => Math.abs(x - c.tImpact) <= cfg.multiImpactWindowMs);
    let distinct = 0;
    let last = -Infinity;
    for (const x of peaks) {
      if (x - last >= cfg.multiImpactGapMs) distinct++;
      last = x;
    }
    return {
      tImpact: c.tImpact,
      rule: c.rule,
      dvKmh: dv,
      peakG: peakG(c.tImpact - 1_000, now),
      rollover: rollSeenAt !== null && rollSeenAt >= c.tImpact - cfg.rollWindowMs,
      multiImpact: distinct >= 2,
    };
  }

  function record(s: Sample) {
    const dt = prevT === null ? 0 : Math.min(Math.max(0, s.t - prevT), MAX_DT_MS);
    prevT = s.t;
    if (s.speed !== null && Number.isFinite(s.speed)) speed = s.speed;
    g = Math.hypot(s.ax, s.ay, s.az);
    const w = Math.hypot(s.gx, s.gy, s.gz);

    const horizon = s.t - cfg.bufferMs;
    if (speed !== null) speeds.push({ t: s.t, v: speed });
    mags.push({ t: s.t, g });
    if (speeds.length && speeds[0]!.t < horizon) speeds = speeds.filter((p) => p.t >= horizon);
    if (mags.length && mags[0]!.t < horizon) mags = mags.filter((p) => p.t >= horizon);

    const deg = w * (dt / 1000) * RAD2DEG;
    rot.push({ t: s.t, deg });
    rotSum += deg;
    while (rot.length && rot[0]!.t <= s.t - cfg.rollWindowMs) rotSum -= rot.shift()!.deg;
    if (rotSum >= cfg.rollDeg) rollSeenAt = s.t;

    const above = g >= cfg.aPeakG;
    if (above && !wasAbove) crossings.push(s.t);
    wasAbove = above;
    crossings = crossings.filter((x) => x >= horizon);

    if (impact) impact.run = g >= cfg.aSustainG ? impact.run + dt : 0;
    if (impact) impact.sustainMs = Math.max(impact.sustainMs, impact.run);
  }

  function armedStep(s: Sample): DetectorEvent[] {
    const t = s.t;
    if (speed !== null && speed < cfg.disarmSpeedKmh) {
      belowSince ??= t;
      if (t - belowSince > cfg.disarmHoldMs) {
        toIdle();
        return [{ type: 'disarmed', t }];
      }
    } else belowSince = null;

    // rule (c): rollover while moving
    if (rotSum >= cfg.rollDeg && maxSpeed(t - cfg.dvWindowMs, t) > cfg.armSpeedKmh) {
      return [becomeCandidate(t, impact?.t0 ?? t, 'c')];
    }

    if (!impact && g >= cfg.aPeakG) impact = { t0: t, peak: g, sustainMs: 0, run: 0 };
    if (!impact) return [];
    impact.peak = Math.max(impact.peak, g);
    const pre = maxSpeed(impact.t0 - cfg.dvWindowMs, impact.t0);
    const post = minSpeed(impact.t0, t);
    const drop = Number.isFinite(pre) && Number.isFinite(post) ? pre - post : 0;
    if (impact.peak >= cfg.bPeakG && drop >= cfg.bSpeedDropKmh) return [becomeCandidate(t, impact.t0, 'b')];
    if (impact.peak >= cfg.aPeakG && impact.sustainMs >= cfg.aSustainMs && drop >= cfg.aSpeedDropKmh)
      return [becomeCandidate(t, impact.t0, 'a')];
    if (t - impact.t0 > cfg.speedDropWindowMs) impact = null; // a bump or a dropped phone: no speed drop followed
    return [];
  }

  return {
    push(s) {
      record(s);
      switch (state) {
        case 'IDLE': {
          if (speed !== null && speed > cfg.armSpeedKmh) {
            aboveSince ??= s.t;
            if (s.t - aboveSince >= cfg.armHoldMs) {
              toArmed();
              return [{ type: 'armed', t: s.t }];
            }
          } else aboveSince = null;
          return [];
        }
        case 'ARMED':
          return armedStep(s);
        case 'CANDIDATE': {
          const c = candidate!;
          if (speed !== null && speed < cfg.stopSpeedKmh) {
            state = 'COUNTDOWN';
            return [{ type: 'confirm', t: s.t, crash: crashAt(s.t, c) }];
          }
          if (s.t - c.t > cfg.confirmWindowMs) {
            toArmed();
            return [{ type: 'rejected', t: s.t, reason: 'not_stopped' }];
          }
          return [];
        }
        case 'COUNTDOWN':
          return []; // the UI owns the countdown; the buffers keep filling
      }
    },
    resolve(outcome, t) {
      if (state !== 'COUNTDOWN') return [];
      if (outcome === 'ok') toArmed();
      else toIdle();
      return [{ type: 'resolved', t, outcome }];
    },
    snapshot() {
      const armProgress =
        state !== 'IDLE' ? 1 : aboveSince === null || prevT === null ? 0 : Math.min(1, (prevT - aboveSince) / cfg.armHoldMs);
      return { state, speed, g, armProgress };
    },
  };
}

/** Run a whole trace through a fresh detector (tests, replay previews). */
export function runTrace(samples: readonly Sample[], cfg: DetectorConfig = DETECTOR_CONFIG): DetectorEvent[] {
  const d = createDetector(cfg);
  const out: DetectorEvent[] = [];
  for (const s of samples) out.push(...d.push(s));
  return out;
}
