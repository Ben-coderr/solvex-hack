import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { BrandMark } from '@/src/components/Brand';
import { Btn, Screen, Txt } from '@/src/components/kit';
import { applyLocale, type Locale } from '@/src/i18n';
import { useSettings } from '@/src/state/settings';
import { LocaleSwitch, T } from '@/src/ui';
import { BRAND } from '@/src/brand';

/** M1 step 1: language. Choosing Arabic flips the native layout direction (one restart, said on screen). */
export default function Language() {
  const { t, i18n } = useTranslation();
  const set = useSettings((s) => s.set);
  const pick = async (l: Locale) => {
    set({ locale: l });
    await applyLocale(l); // may reload the app; settings are already persisted
  };
  return (
    <Screen footer={<Btn testID="onb-continue" label={t('common.continue')} onPress={() => { set({ locale: i18n.language as Locale }); router.push('/onboarding/explain'); }} />}>
      <View style={{ flex: 1, justifyContent: 'center', gap: T.space[5] }}>
        <BrandMark size={96} />
        <Txt v="display" style={{ fontSize: T.fontSize['3xl'] }}>{`${BRAND.nameAr} · ${BRAND.name}`}</Txt>
        <Txt v="h1" accessibilityRole="header">{t('onboarding.langTitle')}</Txt>
        <LocaleSwitch value={i18n.language as Locale} onChange={(l) => void pick(l)} />
        <Txt tone="muted">{t('onboarding.langBody')}</Txt>
        <Txt v="small" tone="muted">{t('onboarding.rtlRestart')}</Txt>
      </View>
    </Screen>
  );
}
