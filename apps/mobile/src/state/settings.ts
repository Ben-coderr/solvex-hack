import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Locale } from '../i18n';
import { COUNTDOWN } from '../config';
import { readWithLegacy, STORAGE } from './legacy';

/**
 * User settings (M8), persisted on the phone (SQLite key-value store). The ingest key is a low-value shared
 * secret the server rate-limits anyway; the Supabase service-role key never comes near this app.
 */
export interface Settings {
  locale: Locale | null;
  /** 'system' follows the phone; light is for direct sun, dark for night */
  theme: 'system' | 'light' | 'dark';
  onboarded: boolean;
  serverUrl: string;
  ingestKey: string;
  gw1: string;
  gw2: string;
  /** up to 3 numbers that get a readable SMS when the alert is not confirmed within a minute */
  contacts: string[];
  /** dual-SIM: the subscription that sends alerts, asked once (null = the phone's default SMS SIM) */
  simSubscriptionId: number | null;
  /** what the person chose, shown in Settings: slot (0-based) and carrier at the time */
  simLabel: { slot: number; carrier: string } | null;
  /**
   * The accelerometer's real range in g (Sensor Lab T1): read from Android by the native module, or typed in from
   * the T1 inventory. null = unknown: Drive mode cannot detect until it is set. Under 8 g: SOS and witness only.
   */
  rangeG: number | null;
  rangeSource: 'device' | 'manual' | null;
  demoMode: boolean;
  /** demo only; production is always COUNTDOWN.seconds */
  demoCountdownS: number;
  set(p: Partial<Omit<Settings, 'set'>>): void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      locale: null,
      theme: 'system',
      onboarded: false,
      serverUrl: process.env.EXPO_PUBLIC_SELLEKNI_SERVER_URL ?? '',
      ingestKey: process.env.EXPO_PUBLIC_SELLEKNI_INGEST_KEY ?? '',
      gw1: '',
      gw2: '',
      contacts: [],
      simSubscriptionId: null,
      simLabel: null,
      rangeG: null,
      rangeSource: null,
      demoMode: false,
      demoCountdownS: COUNTDOWN.demoSeconds,
      set: (p) => set(p),
    }),
    {
      name: STORAGE.settings,
      // synchronous: a change is on disk before the next line runs. The language switch reloads the app right after
      // `set` (RTL needs a restart); with the async API that reload beat the write and the language never stuck.
      storage: createJSONStorage(() => ({
        // a build from before the rename saved under the old name: read it once, the next write moves it
        getItem: (k) => (k === STORAGE.settings ? readWithLegacy((x) => Storage.getItemSync(x), k, STORAGE.legacySettings) : Storage.getItemSync(k)),
        setItem: (k, v) => Storage.setItemSync(k, v),
        removeItem: (k) => void Storage.removeItemSync(k),
      })),
      // a value saved EMPTY (first launch before the demo build had one) must not hide the build's default forever
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<Settings>;
        return { ...current, ...s, serverUrl: s.serverUrl || current.serverUrl, ingestKey: s.ingestKey || current.ingestKey };
      },
    },
  ),
);

export const countdownSeconds = (s: Pick<Settings, 'demoMode' | 'demoCountdownS'>) =>
  s.demoMode ? s.demoCountdownS : COUNTDOWN.seconds;

export const PHONE_RE = /^\+?[0-9]{6,15}$/;
export const URL_RE = /^https?:\/\/\S+$/;
