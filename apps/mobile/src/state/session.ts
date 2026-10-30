import { create } from 'zustand';
import type { OutboxItem } from '../alert/outbox';
import type { Fix } from '../alert/packet';
import type { Crash, DetectorSnapshot } from '../detector/detector';
import type { TraceName } from '../detector/synth';
import type { ReplayRate } from '../replay/engine';

/** Connectivity as PROBED (2 s HEAD /api/health), not as the OS reports it. */
export type Link = 'online' | 'sms_only' | 'offline' | 'unknown';
export type PermState = 'granted' | 'denied' | 'undetermined';

/** Runtime state (not persisted). The outbox is persisted separately (SQLite). */
export interface Session {
  link: Link;
  drive: { active: boolean; live: boolean; service: 'running' | 'fallback' | 'off'; error: 'location_denied' | 'no_sensors' | null };
  replay: { name: TraceName; rate: ReplayRate; progress: number } | null;
  detector: DetectorSnapshot;
  fix: (Fix & { speedKmh: number | null }) | null;
  battery: number | null;
  perms: { location: PermState; notifications: PermState };
  /** CONFIRM from the detector, waiting for the countdown screen */
  pendingCrash: Crash | null;
  alerts: Record<string, OutboxItem>;
  set(p: Partial<Omit<Session, 'set'>>): void;
}

export const useSession = create<Session>()((set) => ({
  link: 'unknown',
  drive: { active: false, live: false, service: 'off', error: null },
  replay: null,
  detector: { state: 'IDLE', speed: null, g: 1, armProgress: 0 },
  fix: null,
  battery: null,
  perms: { location: 'undetermined', notifications: 'undetermined' },
  pendingCrash: null,
  alerts: {},
  set: (p) => set(p),
}));
