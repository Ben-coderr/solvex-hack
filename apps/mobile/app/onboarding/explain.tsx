import { router } from 'expo-router';
import { Activity, MapPin, MessageSquareText, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Btn, Screen, Txt } from '@/src/components/kit';
import { T, useTheme } from '@/src/ui';

const PAGES: { icon: LucideIcon; title: 'e1Title' | 'e2Title' | 'e3Title'; body: 'e1Body' | 'e2Body' | 'e3Body' }[] = [
  { icon: Activity, title: 'e1Title', body: 'e1Body' },
  { icon: MapPin, title: 'e2Title', body: 'e2Body' },
  { icon: MessageSquareText, title: 'e3Title', body: 'e3Body' },
];

/** M1 step 2: three-screen explainer (detects · shares location · sends SMS), honest about the limits. */
export default function Explain() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const [i, setI] = useState(0);
  const p = PAGES[i]!;
  const Icon = p.icon;
  const next = () => (i < PAGES.length - 1 ? setI(i + 1) : router.push('/onboarding/permissions'));
  return (
    <Screen footer={
      <View style={{ flexDirection: 'row', gap: T.space[3] }}>
        <View style={{ flex: 1 }}><Btn kind="secondary" label={t('common.back')} onPress={() => (i > 0 ? setI(i - 1) : router.back())} /></View>
        <View style={{ flex: 1 }}><Btn testID="onb-next" label={t('common.continue')} onPress={next} /></View>
      </View>
    }>
      <View style={{ flex: 1, justifyContent: 'center', gap: T.space[5] }}>
        <Txt v="small" tone="muted">{t('onboarding.steps', { c: i + 1, t: PAGES.length })}</Txt>
        <View style={{ width: 72, height: 72, borderRadius: T.radius.lg, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={36} color={c.brandText} />
        </View>
        <Txt v="h1" accessibilityRole="header">{t(`onboarding.${p.title}`)}</Txt>
        <Txt>{t(`onboarding.${p.body}`)}</Txt>
        <View style={{ flexDirection: 'row', gap: T.space[2] }} accessibilityElementsHidden>
          {PAGES.map((_, k) => <View key={k} style={{ width: k === i ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? c.brandFill : c.line }} />)}
        </View>
      </View>
    </Screen>
  );
}
