import { router } from 'expo-router';
import { Battery, Crosshair, Gauge, Signal, Square } from 'lucide-react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { DriveRing } from '@/src/components/DriveRing';
import { Btn, Notice, Row, Screen, Section, Txt } from '@/src/components/kit';
import { startDrive, stopDrive } from '@/src/services/drive';
import { useSession } from '@/src/state/session';
import { T } from '@/src/ui';

/** Drive mode live (M2): status ring, speed / GPS accuracy / battery / probed link, one-tap stop. */
export default function Drive() {
  const { t } = useTranslation();
  const drive = useSession((s) => s.drive);
  const det = useSession((s) => s.detector);
  const fix = useSession((s) => s.fix);
  const battery = useSession((s) => s.battery);
  const link = useSession((s) => s.link);
  const replay = useSession((s) => s.replay);

  // deep link / reload straight onto this screen: start live Drive mode
  useEffect(() => {
    if (!useSession.getState().drive.active) void startDrive();
  }, []);

  const speed = det.speed ?? (replay ? null : fix?.speedKmh ?? null);
  const armed = det.state !== 'IDLE';
  const stop = async () => {
    await stopDrive();
    router.replace('/');
  };

  return (
    <Screen footer={<Btn testID="drive-stop" big kind="secondary" icon={Square} label={t('drive.stop')} onPress={() => void stop()} />}>
      <Txt v="h1" accessibilityRole="header">{t('drive.title')}</Txt>
      {replay && <Txt v="mono" tone="muted" ltr>{t('drive.replayOf', { name: replay.name, pct: Math.round(replay.progress * 100) })}</Txt>}

      <DriveRing state={det.state} armProgress={det.armProgress} label={t(`drive.state.${det.state}`)}
        hint={armed ? t('drive.armedHint') : t('drive.idleHint')} />

      {drive.error === 'location_denied' && <Notice text={t('drive.locDenied')} />}
      {drive.error === 'no_sensors' && <Notice text={t('drive.noSensors')} tone="statusDanger" />}
      {drive.live && drive.service === 'fallback' && <Notice text={t('drive.noService')} tone="statusInfo" />}
      {battery !== null && battery >= 0 && battery < 0.1 && <Notice text={t('drive.lowBattery')} tone="statusInfo" />}

      <Section>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: T.space[2], direction: 'ltr', justifyContent: 'center' }}>
          <Txt v="display">{speed === null ? '—' : String(Math.round(speed))}</Txt>
          <Txt v="title" tone="muted">{t('drive.kmh')}</Txt>
        </View>
        <Row icon={Gauge} label={t('drive.speed')} value={speed === null ? t('drive.noFix') : `${Math.round(speed)} ${t('drive.kmh')}`} />
        <Row icon={Crosshair} label={t('drive.gpsAcc')} value={fix?.accM !== undefined && fix ? `± ${Math.round(fix.accM)} ${t('drive.m')}` : t('drive.noFix')} />
        <Row icon={Battery} label={t('drive.battery')} value={battery === null || battery < 0 ? '—' : `${Math.round(battery * 100)} %`} />
        <Row icon={Signal} label={t('drive.link')} value={link === 'unknown' ? '…' : t(`drive.link_${link}`)}
          tone={link === 'online' ? 'statusOk' : link === 'sms_only' ? 'statusInfo' : 'statusWarn'} />
      </Section>
    </Screen>
  );
}
