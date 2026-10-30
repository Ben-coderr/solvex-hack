import { router } from 'expo-router';
import { Activity, Battery, Crosshair, FlaskConical, Gauge, Signal, Square } from 'lucide-react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { DriveRing } from '@/src/components/DriveRing';
import { Btn, Notice, Row, Screen, Section, Txt } from '@/src/components/kit';
import { startDrive, stopDrive } from '@/src/services/drive';
import { useSession } from '@/src/state/session';
import { T } from '@/src/ui';

/**
 * Drive mode (M2): status ring, speed / GPS accuracy / sensor rate / battery / probed link, one-tap stop.
 * Foreground only: the screen stays on (keep-awake). Every degraded state says what still works.
 */
export default function Drive() {
  const { t } = useTranslation();
  const drive = useSession((s) => s.drive);
  const det = useSession((s) => s.detector);
  const fix = useSession((s) => s.fix);
  const battery = useSession((s) => s.battery);
  const link = useSession((s) => s.link);
  const replay = useSession((s) => s.replay);
  const rejection = useSession((s) => s.lastRejection);

  // deep link / reload straight onto this screen: start live Drive mode
  useEffect(() => {
    if (!useSession.getState().drive.active) void startDrive();
  }, []);

  const speed = det.speedKmh ?? (replay ? null : fix?.speedKmh ?? null);
  const unsupported = det.state === 'UNSUPPORTED';
  const watching = det.state === 'ARMED' || det.state === 'EVALUATING';
  const stop = async () => {
    await stopDrive();
    router.replace('/');
  };

  return (
    <Screen footer={<Btn testID="drive-stop" big kind="secondary" icon={Square} label={replay ? t('replay.stop') : t('drive.stop')} onPress={() => void stop()} />}>
      <Txt v="h1" accessibilityRole="header">{t('drive.title')}</Txt>
      {replay && (
        <Txt v="mono" tone="muted" ltr>
          {replay.ended ? t('drive.replayEnded', { name: replay.name }) : t('drive.replayOf', { name: replay.name, pct: Math.round(replay.progress * 100) })}
        </Txt>
      )}

      <DriveRing state={drive.error === 'no_range' ? 'UNSUPPORTED' : det.state} armProgress={det.armProgress}
        label={drive.error === 'no_range' ? t('drive.state.NO_RANGE') : t(`drive.state.${det.state}`)}
        hint={unsupported || drive.error === 'no_range' ? t('drive.sosOnly') : watching ? t('drive.armedHint') : t('drive.idleHint')} />

      {drive.error === 'no_range' && (
        <View style={{ gap: T.space[2] }}>
          <Notice text={t('drive.noRange')} tone="statusDanger" />
          <Btn kind="secondary" icon={FlaskConical} label={t('settings.sensorLab')} onPress={() => router.push('/sensor-lab')} />
        </View>
      )}
      {unsupported && <Notice text={t('drive.unsupported', { g: det.rangeG })} tone="statusDanger" />}
      {!det.rateOk && <Notice text={t('drive.lowRate', { hz: det.rateHz ?? 0 })} tone="statusWarn" />}
      {drive.error === 'location_denied' && <Notice text={t('drive.locDenied')} />}
      {drive.error === 'no_sensors' && <Notice text={t('drive.noSensors')} tone="statusDanger" />}
      {drive.live && !drive.error && !unsupported && <Notice text={t('drive.keepOnScreen')} tone="statusInfo" />}
      {battery !== null && battery >= 0 && battery < 0.1 && <Notice text={t('drive.lowBattery')} tone="statusInfo" />}
      {rejection && (
        <Notice tone="statusOk" text={t('drive.rejected', { why: rejection.rejected.map((k) => t(`drive.reject.${k}`)).join(' · ') })} />
      )}

      <Section>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: T.space[2], direction: 'ltr', justifyContent: 'center' }}>
          <Txt v="display">{speed === null ? '—' : String(Math.round(speed))}</Txt>
          <Txt v="title" tone="muted">{t('drive.kmh')}</Txt>
        </View>
        <Row icon={Gauge} label={t('drive.speed')} value={speed === null ? t('drive.noFix') : `${Math.round(speed)} ${t('drive.kmh')}`} />
        <Row icon={Crosshair} label={t('drive.gpsAcc')} value={fix?.accM !== undefined && fix ? `± ${Math.round(fix.accM)} ${t('drive.m')}` : t('drive.noFix')} />
        <Row icon={Activity} label={t('drive.sensor')}
          value={det.rangeG > 0 ? `±${det.rangeG} g · ${det.rateHz === null ? '…' : `${det.rateHz} Hz`}` : '—'}
          tone={det.rateOk ? 'text' : 'statusWarn'} />
        <Row icon={Battery} label={t('drive.battery')} value={battery === null || battery < 0 ? '—' : `${Math.round(battery * 100)} %`} />
        <Row icon={Signal} label={t('drive.link')} value={link === 'unknown' ? '…' : t(`drive.link_${link}`)}
          tone={link === 'online' ? 'statusOk' : link === 'sms_only' ? 'statusInfo' : 'statusWarn'} />
      </Section>
    </Screen>
  );
}
