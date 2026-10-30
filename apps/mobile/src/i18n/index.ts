import { reloadAppAsync } from 'expo';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { useMemo } from 'react';
import { initReactI18next, useTranslation } from 'react-i18next';
import { I18nManager } from 'react-native';
import type { UiText } from '../ui';
import { ar } from './ar';
import { en } from './en';
import { fr } from './fr';

export type Locale = 'ar' | 'fr' | 'en';
export const LOCALES: readonly Locale[] = ['ar', 'fr', 'en'];

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
    returnNull: false;
  }
}

/** Phone language if we support it, else French (the most common second language on Algerian phones). */
export function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode;
  return code === 'ar' || code === 'fr' || code === 'en' ? code : 'fr';
}

export function initI18n(locale: Locale) {
  if (i18n.isInitialized) return i18n.changeLanguage(locale);
  return i18n.use(initReactI18next).init({
    lng: locale,
    fallbackLng: 'en',
    resources: { en: { translation: en }, fr: { translation: fr }, ar: { translation: ar } },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

/**
 * Switch language. Arabic needs the native layout direction, which React Native only applies after a restart:
 * forceRTL, then reload. Returns true when a reload was triggered.
 */
export async function applyLocale(locale: Locale): Promise<boolean> {
  await i18n.changeLanguage(locale);
  const rtl = locale === 'ar';
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.forceRTL(rtl);
  await reloadAppAsync('layout direction changed');
  return true;
}

export const isRtl = () => I18nManager.isRTL;

/** Strings for the design-system components (they never hard-code copy). */
export function useUiStrings(): UiText {
  const { t, i18n: inst } = useTranslation();
  const lng = inst.language;
  return useMemo<UiText>(() => {
    const ui = t('ui', { returnObjects: true }) as unknown as typeof en.ui;
    return {
      ...ui,
      bandLabel: (band: string, name: string) => t('ui.bandLabel', { band, name }),
      reason: (code: string, value?: number) =>
        (code in ui.reason ? t(`ui.reason.${code as keyof typeof en.ui.reason}`, { v: value ?? '' }) : code),
      packetInvalid: (code: string) => t('ui.packetInvalid', { code }),
      goldenLabel: (m: number) => t('ui.goldenLabel', { m }),
      countdownLabel: (s: number) => t('ui.countdownLabel', { s }),
      witnessSteps: [...ui.witnessSteps],
      witnessProgress: (c: number, total: number) => t('ui.witnessProgress', { c, t: total }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lng]);
}

export { i18n };
