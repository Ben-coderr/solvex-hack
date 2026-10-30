import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Bell, MapPin, MessageSquareText, Volume2, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, PermissionsAndroid, Platform, View } from 'react-native';
import { Btn, Screen, Section, Txt } from '@/src/components/kit';
import { testAlarm } from '@/src/services/alarm';
import { useSession, type PermState } from '@/src/state/session';
import { useSettings } from '@/src/state/settings';
import { T, useTheme } from '@/src/ui';

const needsNotifPerm = Platform.OS === 'android' && Number(Platform.Version) >= 33;

async function notifStatus(): Promise<PermState> {
  if (!needsNotifPerm) return 'granted';
  return (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) ? 'granted' : 'undetermined';
}

function PermCard({ icon: Icon, title, why, state, deniedText, onAllow, laterOnly }: {
  icon: LucideIcon; title: string; why: string; state: PermState; deniedText: string; onAllow?: () => void; laterOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const tone = state === 'granted' ? 'statusOk' : state === 'denied' ? 'statusWarn' : 'muted';
  return (
    <Section>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space[3] }}>
        <Icon size={22} color={c.brandText} />
        <Txt v="title" style={{ flex: 1 }}>{title}</Txt>
        <Txt v="small" tone={tone}>{laterOnly ? t('onboarding.later') : state === 'granted' ? t('onboarding.granted') : state === 'denied' ? t('onboarding.denied') : ''}</Txt>
      </View>
      <Txt v="small" tone="muted">{why}</Txt>
      {(state === 'denied' || laterOnly) && <Txt v="small">{deniedText}</Txt>}
      {!laterOnly && state === 'undetermined' && onAllow && <Btn label={t('onboarding.allow')} onPress={onAllow} />}
      {!laterOnly && state === 'denied' && <Btn kind="secondary" label={t('onboarding.openSettings')} onPress={() => void Linking.openSettings()} />}
    </Section>
  );
}

/** M1 step 3: each permission with its reason; refusing never dead-ends (the degraded mode is described). */
export default function Permissions() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const perms = useSession((s) => s.perms);
  const setSession = useSession((s) => s.set);
  const setSettings = useSettings((s) => s.set);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const loc = await Location.getForegroundPermissionsAsync();
      setSession({ perms: { location: loc.granted ? 'granted' : loc.canAskAgain ? 'undetermined' : 'denied', notifications: await notifStatus() } });
    })();
  }, [setSession]);

  const askLocation = async () => {
    setBusy(true);
    const r = await Location.requestForegroundPermissionsAsync();
    setSession({ perms: { ...useSession.getState().perms, location: r.granted ? 'granted' : 'denied' } });
    setBusy(false);
  };
  const askNotif = async () => {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    setSession({ perms: { ...useSession.getState().perms, notifications: r === 'granted' ? 'granted' : 'denied' } });
  };
  const finish = () => {
    setSettings({ onboarded: true });
    router.replace('/');
  };

  return (
    <Screen footer={<Btn testID="onb-finish" big label={t('onboarding.finish')} disabled={busy} onPress={finish} />}>
      <Txt v="h1" accessibilityRole="header">{t('onboarding.permTitle')}</Txt>
      <Txt tone="muted">{t('onboarding.permBody')}</Txt>
      <PermCard icon={MapPin} title={t('onboarding.locTitle')} why={t('onboarding.locWhy')} state={perms.location} deniedText={t('onboarding.locDenied')} onAllow={() => void askLocation()} />
      {needsNotifPerm && (
        <PermCard icon={Bell} title={t('onboarding.notifTitle')} why={t('onboarding.notifWhy')} state={perms.notifications} deniedText={t('onboarding.notifDenied')} onAllow={() => void askNotif()} />
      )}
      <PermCard icon={MessageSquareText} title={t('onboarding.smsTitle')} why={t('onboarding.smsWhy')} state="undetermined" deniedText={t('onboarding.smsDegraded')} laterOnly />
      <Section>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space[3] }}>
          <Volume2 size={22} color={c.brandText} />
          <Txt v="title" style={{ flex: 1 }}>{t('onboarding.silentTitle')}</Txt>
        </View>
        <Txt v="small" tone="muted">{t('onboarding.silentBody')}</Txt>
        <Btn kind="secondary" label={t('settings.alarmTest')} onPress={() => void testAlarm()} />
      </Section>
    </Screen>
  );
}
