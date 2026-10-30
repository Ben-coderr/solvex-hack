import * as Haptics from 'expo-haptics';
import { Redirect, router } from 'expo-router';
import { ChevronRight, FlaskConical, Phone, PlayCircle, Settings as SettingsIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, View } from 'react-native';
import { BrandLockup } from '@/src/components/Brand';
import { DriveRing } from '@/src/components/DriveRing';
import { Readiness } from '@/src/components/Readiness';
import { Btn, Screen, Section, Txt } from '@/src/components/kit';
import { AlertSummary } from '@/src/components/AlertSummary';
import { EMERGENCY, openDialler, raiseAlert } from '@/src/services/alerts';
import { startDrive } from '@/src/services/drive';
import { useSession } from '@/src/state/session';
import { useSettings } from '@/src/state/settings';
import { EmptyState, SosButton, T, useTheme, type SosState } from '@/src/ui';

/** Home (M2 entry, M7 SOS): one primary action (Drive mode), SOS held 1.5 s, last alert, call 14. */
export default function Home() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const onboarded = useSettings((s) => s.onboarded);
  const demo = useSettings((s) => s.demoMode);
  const drive = useSession((s) => s.drive);
  const det = useSession((s) => s.detector);
  const alerts = useSession((s) => s.alerts);
  const last = useMemo(() => Object.values(alerts).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null, [alerts]);
  const [sos, setSos] = useState<SosState>('idle');

  if (!onboarded) return <Redirect href="/onboarding" />;

  const armed = drive.active && (det.state === 'ARMED' || det.state === 'EVALUATING' || det.state === 'ALERT');
  const Chevron = ChevronRight;

  const sendSos = async () => {
    setSos('sending');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const id = await raiseAlert({ source: 'M' });
    setSos('sent');
    router.push({ pathname: '/alert/[id]', params: { id } });
    setTimeout(() => setSos('idle'), 3_000);
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BrandLockup />
        <Pressable testID="open-settings" accessibilityRole="button" accessibilityLabel={t('home.settings')} onPress={() => router.push('/settings')}
          style={{ width: T.size.touchMin, height: T.size.touchMin, alignItems: 'center', justifyContent: 'center' }}>
          <SettingsIcon size={24} color={c.text} />
        </Pressable>
      </View>

      <DriveRing state={drive.active ? det.state : 'IDLE'} armProgress={drive.active ? det.armProgress : 0}
        label={armed ? t('home.ringArmed') : t('home.ringIdle')} hint={armed ? t('home.ringArmedHint') : t('home.ringIdleHint')} />

      <Btn testID="drive-start" big label={drive.active ? t('home.driveOpen') : t('home.driveStart')}
        onPress={() => { if (!drive.active) void startDrive(); router.push('/drive'); }} />

      <View style={{ alignItems: 'center', gap: T.space[2] }}>
        <SosButton state={sos} onConfirm={() => void sendSos()} />
        <Txt v="small" tone="muted" style={{ textAlign: 'center' }}>{t('home.sosHint')}</Txt>
      </View>

      <Readiness />

      <Section title={t('home.lastAlert')}>
        {last ? (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/alert/[id]', params: { id: last.id } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: T.space[3], minHeight: T.size.touchMin }}>
            <View style={{ flex: 1 }}><AlertSummary item={last} /></View>
            <Chevron size={20} color={c.muted} style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }} />
          </Pressable>
        ) : (
          <EmptyState title={t('home.noAlert')} body={t('numbers.complement')} />
        )}
      </Section>

      <View style={{ gap: T.space[3] }}>
        <Btn kind="secondary" icon={Phone} label={t('numbers.call', { n: EMERGENCY.civil })} onPress={() => void openDialler(EMERGENCY.civil)} />
        {/* stacked, not side by side: half a phone width wrapped "Replay a trip (demo)" onto two ragged lines */}
        <Btn kind="quiet" icon={FlaskConical} label={t('settings.sensorLab')} onPress={() => router.push('/sensor-lab')} />
        {demo && <Btn testID="open-replay" kind="quiet" icon={PlayCircle} label={t('home.replay')} onPress={() => router.push('/replay')} />}
      </View>
    </Screen>
  );
}
