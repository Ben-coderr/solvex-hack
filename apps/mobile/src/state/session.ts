import type { Decision, RejectKey } from '@sellekni/detector';
import { create } from 'zustand';
import type { OutboxItem } from '../alert/outbox';
import type { Fix } from '../alert/packet';
import { IDLE_SNAPSHOT, type DetectorSnapshot } from '../detector/adapter';
import type { TraceName } from '../replay/bundled-traces';
import type { ReplayRate } from '../replay/engine';

/** Connectivity as PROBED (2 s HEAD /api/health), not as the OS reports it. */
export type Link = 'online' | 'sms_only' | 'offline' | 'unknown';
export type PermState = 'granted' | 'denied' | 'undetermined';
export type DriveError = 'location_denied' | 'no_sensors' | 'no_range';
/** live = a reading in the last 2 s; waiting = subscribed, nothing yet; missing = not on this phone */
export type SensorLive = 'live' | 'waiting' | 'missing' | 'off';

/** What the live sensors show right now (Drive mode, live only): proof they work, never a diagnosis. */
export interface Telemetry {
  sensors: { accelerometer: SensorLive; gyroscope: SensorLive; gps: SensorLive; barometer: SensorLive };
  /** |a| in g, gravity included (≈ 1 at rest); capped by the sensor's range */
  accG: number | null;
  /** highest |a| since Drive mode started or the last reset */
  peakG: number | null;
  /** |ω| in deg/s */
  gyroDps: number | null;
  /** display only: the detector does not use pressure */
  hpa: number | null;
  speedSource: 'gps' | 'computed' | null;
}
export const NO_TELEMETRY: Telemetry = {
  sensors: { accelerometer: 'off', gyroscope: 'off', gps: 'off', barometer: 'off' },
  accG: null, peakG: null, gyroDps: null, hpa: null, speedSource: null,
};

/** Runtime state (not persisted). The outbox is persisted separately (SQLite). */
export interface Session {
  link: Link;
  drive: { active: boolean; live: boolean; error: DriveError | null };
  /** a replay is running (or just ended): every screen shows REPLAY · SYNTHETIC (+ BOX when simulated) */
  replay: { name: TraceName; rate: ReplayRate; progress: number; box: boolean; ended: boolean } | null;
  detector: DetectorSnapshot;
  telemetry: Telemetry;
  /** the detector's last REJECTED event, shown on the Drive screen (the gates working, visibly) */
  lastRejection: { at: number; rejected: RejectKey[] } | null;
  fix: (Fix & { speedKmh: number | null }) | null;
  battery: number | null;
  /** sms = SEND_SMS for the silent channel ('denied' also when the build has no native module) */
  perms: { location: PermState; sms: PermState };
  /** an ALERT decision from the detector, waiting for the countdown screen */
  pending: { decision: Decision; rangeG: number } | null;
  alerts: Record<string, OutboxItem>;
  set(p: Partial<Omit<Session, 'set'>>): void;
}

export const useSession = create<Session>()((set) => ({
  link: 'unknown',
  drive: { active: false, live: false, error: null },
  replay: null,
  detector: IDLE_SNAPSHOT,
  telemetry: NO_TELEMETRY,
  lastRejection: null,
  fix: null,
  battery: null,
  perms: { location: 'undetermined', sms: 'undetermined' },
  pending: null,
  alerts: {},
  set: (p) => set(p),
}));
