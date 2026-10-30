import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Locale } from '../i18n';
import { DETECTOR_CONFIG } from '../detector/config';

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
  demoMode: boolean;
  /** demo only; production is always DETECTOR_CONFIG.countdownS */
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
      demoMode: false,
      demoCountdownS: DETECTOR_CONFIG.demoCountdownS,
      set: (p) => set(p),
    }),
    { name: 'najda.settings.v1', storage: createJSONStorage(() => Storage) },
  ),
);

export const countdownSeconds = (s: Pick<Settings, 'demoMode' | 'demoCountdownS'>) =>
  s.demoMode ? s.demoCountdownS : DETECTOR_CONFIG.countdownS;

export const PHONE_RE = /^\+?[0-9]{6,15}$/;
export const URL_RE = /^https?:\/\/\S+$/;
