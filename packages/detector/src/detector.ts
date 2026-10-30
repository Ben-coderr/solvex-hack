import type { Decision, DetectorState, EventMetrics, GpsFix, PacketHints, ReasonKey, RejectKey, Sample } from './types';

/**
 * Range-aware crash-event detector (reference implementation of docs/04 §3.2 + docs/13).
 * Pure, deterministic, zero dependencies: the same code runs live on the phone and in replay.
 *
 * EVERY number below is an ASSUMPTION to be tuned with recorded data (docs/13 §7). They are
 * named so that tests, docs and the Sensor Lab can refer to them.
 */
export const PARAMS = {
  armSpeedKmh: 25,       // GPS speed that must be held to arm
  armHoldMs: 10_000,
  disarmSpeedKmh: 10,    // below this for disarmHoldMs -> IDLE
  disarmHoldMs: 180_000,
  triggerG: 4,           // dynamic acceleration that opens an event
  highG: 2.5,            // "high-g" level used for the duration rule
  strongG: 8,            // rule (b)
  minHighMs: 30,         // rule (a): sustained impact (potholes/drops are shorter)
  minHighStrongMs: 20,   // rule (b): a one-sample glitch can never alert
  gapToleranceMs: 15,    // ripples inside one impact do not split it
  satFrac: 0.95,         // |a_axis| >= satFrac * range counts as saturated
  minRangeG: 8,          // below this the detector refuses to run (UNSUPPORTED)
  dropAKmh: 20,          // rule (a): speed collapse within 3 s
  dropBKmh: 10,          // rule (b)
  rollDeg: 90,           // rule (c)
  stopKmh: 5,            // "came to a stop"
  evalDelayMs: 8_000,    // judged this long after the trigger: 5 s (docs/04) + ~3 s budget for GPS lag (~0.8 s assumed) and 1 Hz fixes
  baselineTauMs: 1_000,  // gravity/orientation baseline (EMA)
  axisG: 1.5,            // an axis counts as "active" above this dynamic excursion
  minRateHz: 45,         // measured sensor rate below this => rateOk=false (25 Hz missed 9/20 synthetic frontal crashes)
  requireStop: 1,        // 1 = the vehicle must come to a stop (set 0 only in ablation tests)
} as const;
export type Params = { -readonly [K in keyof typeof PARAMS]: number };

interface Pending {
  t0: number;
  peakMag: number; peakDm: number;
  run: number; gap: number; best: number;
  sat: number;
  axisMax: [number, number, number];
  rot: number;
}

const mag3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

export class Detector {
  readonly rangeG: number;
  private p: Params;
  private _state: DetectorState;
  private base: [number, number, number] | null = null;
  private tPrev: number | null = null;
  private ring: Sample[] = [];
  private gps: GpsFix[] = [];
  private fastSince: number | null = null;
  private lowSince: number | null = null;
  private pending: Pending | null = null;
  private dts: number[] = [];

  constructor(rangeG: number, params: Partial<Params> = {}) {
    this.rangeG = rangeG;
    this.p = { ...PARAMS, ...params } as Params;
    this._state = rangeG >= this.p.minRangeG ? 'IDLE' : 'UNSUPPORTED';
  }

  get state(): DetectorState { return this._state; }
  /** false => the phone's accelerometer is too limited: offer SOS / witness mode only (and say why). */
  get supported(): boolean { return this._state !== 'UNSUPPORTED'; }

  /** Measured sampling rate (Hz) over the last ~200 samples; NaN until enough samples have arrived. */
  get measuredRateHz(): number {
    if (this.dts.length < 50) return NaN;
    const sorted = [...this.dts].sort((a, b) => a - b);
    return 1000 / sorted[Math.floor(sorted.length / 2)]!;
  }
  /** false => below 50 Hz the detector misses real crashes (docs/13 §6): warn the user, do not pretend to protect them. */
  get rateOk(): boolean { return Number.isNaN(this.measuredRateHz) || this.measuredRateHz >= this.p.minRateHz; }

  /** The thresholds actually used for THIS sensor: min(threshold, 0.95*range - 1 g gravity headroom). */
  eff(thresholdG: number): number { return Math.min(thresholdG, this.p.satFrac * this.rangeG - 1); }

  /** Call after the countdown screen finished (the app decided), to resume watching. */
  acknowledge(): void { if (this._state === 'ALERT') this._state = 'ARMED'; }

  pushGps(fix: GpsFix): Decision[] {
    if (!this.supported) return [];
    this.gps.push(fix);
    while (this.gps.length && fix.t - this.gps[0]!.t > 20_000) this.gps.shift();
    this.updateArming(fix);
    return this.finalizeIfDue(fix.t);
  }

  pushSample(s: Sample): Decision[] {
    if (!this.supported) return [];
    // a sensor glitch (NaN/Infinity) or a duplicate/older timestamp must never poison the state
    if (![s.t, s.ax, s.ay, s.az, s.gx, s.gy, s.gz].every(Number.isFinite)) return [];
    if (this.tPrev !== null && s.t <= this.tPrev) return [];
    const dtRaw = this.tPrev === null ? 0 : s.t - this.tPrev;
    const gap = dtRaw > 1000; // timestamp glitch or sensor stall: do not integrate across it
    const dt = gap ? 0 : dtRaw;
    this.tPrev = s.t;
    if (dt > 0) { this.dts.push(dt); if (this.dts.length > 200) this.dts.shift(); }

    this.ring.push(s);
    while (this.ring.length && s.t - this.ring[0]!.t > 2_000) this.ring.shift();

    if (!this.base) this.base = [s.ax, s.ay, s.az];
    const da: [number, number, number] = [s.ax - this.base[0], s.ay - this.base[1], s.az - this.base[2]];
    const dm = mag3(da[0], da[1], da[2]);
    if (dm < 0.5 && dt > 0) { // follow gravity/orientation only while quiet
      const k = Math.min(1, dt / this.p.baselineTauMs);
      this.base = [this.base[0] + k * da[0], this.base[1] + k * da[1], this.base[2] + k * da[2]];
    }

    const mag = mag3(s.ax, s.ay, s.az);
    const w = mag3(s.gx, s.gy, s.gz);
    const satNow = Math.max(Math.abs(s.ax), Math.abs(s.ay), Math.abs(s.az)) >= this.p.satFrac * this.rangeG;

    if (this.pending) {
      this.track(this.pending, s, dt, dm, mag, w, satNow, da);
    } else if (this._state === 'ARMED' && dm >= this.eff(this.p.triggerG)) {
      this.pending = this.open(s, dm, mag, satNow, da);
      this._state = 'EVALUATING';
    }
    return this.finalizeIfDue(s.t);
  }

  // ------------------------------------------------------------------ internals
  private updateArming(f: GpsFix): void {
    if (this._state === 'EVALUATING' || this._state === 'ALERT') return;
    if (f.speedKmh >= this.p.armSpeedKmh) {
      if (this.fastSince === null) this.fastSince = f.t;
      if (this._state === 'IDLE' && f.t - this.fastSince >= this.p.armHoldMs) this._state = 'ARMED';
    } else {
      this.fastSince = null;
    }
    if (this._state === 'ARMED') {
      if (f.speedKmh < this.p.disarmSpeedKmh) {
        if (this.lowSince === null) this.lowSince = f.t;
        if (f.t - this.lowSince >= this.p.disarmHoldMs) { this._state = 'IDLE'; this.lowSince = null; }
      } else this.lowSince = null;
    }
  }

  private open(s: Sample, dm: number, mag: number, satNow: boolean, da: [number, number, number]): Pending {
    let rot = 0;
    for (let i = 1; i < this.ring.length; i++) {
      const a = this.ring[i - 1]!, b = this.ring[i]!;
      if (b.t >= s.t - 500 && b.t - a.t > 0 && b.t - a.t <= 1000) rot += mag3(b.gx, b.gy, b.gz) * (b.t - a.t) / 1000;
    }
    const p: Pending = { t0: s.t, peakMag: mag, peakDm: dm, run: 0, gap: 0, best: 0, sat: 0, axisMax: [0, 0, 0], rot };
    this.track(p, s, 0, dm, mag, mag3(s.gx, s.gy, s.gz), satNow, da, true);
    return p;
  }

  private track(p: Pending, s: Sample, dt: number, dm: number, mag: number, w: number, satNow: boolean, da: [number, number, number], first = false): void {
    p.peakDm = Math.max(p.peakDm, dm);
    p.peakMag = Math.max(p.peakMag, mag);
    const high = dm >= this.eff(this.p.highG);
    const step = first ? Math.max(dt, 1000 / 100) : dt; // the opening sample counts as one nominal 10 ms
    if (high) { p.run += p.gap + step; p.gap = 0; p.best = Math.max(p.best, p.run); }
    else { p.gap += dt; if (p.gap > this.p.gapToleranceMs) { p.run = 0; p.gap = 0; } }
    if (satNow) p.sat += step;
    for (let i = 0; i < 3; i++) p.axisMax[i] = Math.max(p.axisMax[i]!, Math.abs(da[i]!));
    if (s.t <= p.t0 + 2_500) p.rot += w * dt / 1000;
  }

  private finalizeIfDue(now: number): Decision[] {
    const pd = this.pending;
    if (!pd || now < pd.t0 + this.p.evalDelayMs) return [];
    this.pending = null;
    const d = this.judge(pd);
    this._state = d.kind === 'alert' ? 'ALERT' : 'ARMED';
    return [d];
  }

  private judge(pd: Pending): Decision {
    const P = this.p;
    const t0 = pd.t0;
    const before = this.gps.filter((f) => f.t >= t0 - 4_000 && f.t <= t0 - 500).map((f) => f.speedKmh);
    // speed collapse is measured over the whole evaluation window: "3 s" (docs/04) plus the GPS-latency budget
    const afterW = this.gps.filter((f) => f.t >= t0 + 500 && f.t <= t0 + P.evalDelayMs).map((f) => f.speedKmh);
    const stopW = this.gps.filter((f) => f.t >= t0 + 500 && f.t <= t0 + P.evalDelayMs).map((f) => f.speedKmh);
    const haveGps = before.length > 0 && afterW.length > 0;
    const speedBefore = before.length ? Math.max(...before) : NaN;
    const speedAfter = afterW.length ? Math.min(...afterW) : NaN;
    const dv = haveGps ? Math.max(0, speedBefore - speedAfter) : 0;
    const stopped = stopW.some((v) => v < P.stopKmh);
    const sensorLimited = pd.sat >= 10;
    const axesActive = pd.axisMax.filter((v) => v >= this.eff(P.axisG)).length;

    const metrics: EventMetrics = {
      peakG: Math.round(Math.min(pd.peakMag, this.rangeG) * 10) / 10,
      sensorLimited,
      tHighMs: Math.round(pd.best),
      tSaturatedMs: Math.round(pd.sat),
      axesActive,
      rotationDeg: Math.round(pd.rot),
      speedBeforeKmh: Number.isFinite(speedBefore) ? Math.round(speedBefore) : 0,
      speedAfterKmh: Number.isFinite(speedAfter) ? Math.round(speedAfter) : 0,
      dvKmh: Math.round(dv),
      stopped,
    };

    const strong = pd.peakDm >= this.eff(P.strongG);
    const ruleA = pd.peakDm >= this.eff(P.triggerG) && pd.best >= P.minHighMs && dv >= P.dropAKmh;
    const ruleB = strong && pd.best >= P.minHighStrongMs && dv >= P.dropBKmh;
    const ruleC = pd.rot >= P.rollDeg && Number.isFinite(speedBefore) && speedBefore > P.armSpeedKmh;
    const rule: Decision['rule'] = ruleA ? 'a' : ruleB ? 'b' : ruleC ? 'c' : null;

    if (rule && (stopped || P.requireStop === 0)) {
      const reasons: ReasonKey[] = [];
      if (dv >= P.dropBKmh) reasons.push('speed_collapse');
      if (pd.best >= P.minHighMs) reasons.push('impact_sustained');
      if (sensorLimited) reasons.push('impact_at_sensor_limit');
      if (rule === 'c' || pd.rot >= P.rollDeg) reasons.push('rotation');
      reasons.push('came_to_stop');
      return { kind: 'alert', tEventMs: t0, rule, reasons, rejected: [], metrics };
    }

    const rejected: RejectKey[] = [];
    if (!haveGps) rejected.push('no_gps_history');
    if (haveGps && pd.best < P.minHighStrongMs) rejected.push('too_short');
    else if (haveGps && pd.best < P.minHighMs && !ruleB) rejected.push('too_short');
    if (haveGps && dv < P.dropBKmh) rejected.push('no_speed_drop');
    if (haveGps && !stopped) rejected.push('still_moving');
    if (!rejected.length) rejected.push('no_rule_matched');
    return { kind: 'rejected', tEventMs: t0, rule: null, reasons: [], rejected, metrics };
  }
}

/** Values for the DZ-MSD tokens `G`, `D`, `RO`. G is capped at the sensor range by construction. */
export function toPacketHints(d: Decision, rangeG: number): PacketHints {
  return {
    G: Math.min(Math.round(d.metrics.peakG), Math.floor(rangeG)),
    D: Math.min(d.metrics.dvKmh, 999),
    RO: d.metrics.rotationDeg >= PARAMS.rollDeg,
    sensorLimited: d.metrics.sensorLimited,
  };
}
