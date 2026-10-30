import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Locale } from '../i18n';
import { COUNTDOWN } from '../config';

/**
 * User settings (M8), persisted on the phone (SQLite key-value store). The ingest key is a low-value shared
 * secret the server rate-limits anyway; the Supabase service-role key never comes near this app.
 */
export interface Settings {
  locale: Locale | null;
  onboarded: boolean;
  serverUrl: string;
  ingestKey: string;
  gw1: string;
  gw2: string;
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
      onboarded: false,
      serverUrl: process.env.EXPO_PUBLIC_NAJDA_SERVER_URL ?? '',
      ingestKey: process.env.EXPO_PUBLIC_NAJDA_INGEST_KEY ?? '',
      gw1: '',
      gw2: '',
      rangeG: null,
      rangeSource: null,
      demoMode: false,
      demoCountdownS: COUNTDOWN.demoSeconds,
      set: (p) => set(p),
    }),
    { name: 'najda.settings.v1', storage: createJSONStorage(() => Storage) },
  ),
);

export const countdownSeconds = (s: Pick<Settings, 'demoMode' | 'demoCountdownS'>) =>
  s.demoMode ? s.demoCountdownS : COUNTDOWN.seconds;

export const PHONE_RE = /^\+?[0-9]{6,15}$/;
export const URL_RE = /^https?:\/\/\S+$/;
