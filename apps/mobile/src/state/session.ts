import type { Decision, RejectKey } from '@najda/detector';
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

/** Runtime state (not persisted). The outbox is persisted separately (SQLite). */
export interface Session {
  link: Link;
  drive: { active: boolean; live: boolean; error: DriveError | null };
  /** a replay is running (or just ended): every screen shows REPLAY · SYNTHETIC (+ BOX when simulated) */
  replay: { name: TraceName; rate: ReplayRate; progress: number; box: boolean; ended: boolean } | null;
  detector: DetectorSnapshot;
  /** the detector's last REJECTED event, shown on the Drive screen (the gates working, visibly) */
  lastRejection: { at: number; rejected: RejectKey[] } | null;
  fix: (Fix & { speedKmh: number | null }) | null;
  battery: number | null;
  perms: { location: PermState };
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
  lastRejection: null,
  fix: null,
  battery: null,
  perms: { location: 'undetermined' },
  pending: null,
  alerts: {},
  set: (p) => set(p),
}));
