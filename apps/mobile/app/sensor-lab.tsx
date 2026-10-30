import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { Accelerometer } from 'expo-sensors';
import { Play, Square } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Btn, Field, Notice, Row, Screen, Section, Segmented, Txt } from '@/src/components/kit';
import { isRangeSupported, rangeGFrom, rateStats, type RateStats } from '@/src/sensorlab/stats';
import { resolveRangeG } from '@/src/services/drive';
import { nativeSensorInfoAvailable, readMotionSensors } from '@/src/services/sensor-info';
import { useSession } from '@/src/state/session';
import { useSettings } from '@/src/state/settings';
import { T } from '@/src/ui';

type Hz = 50 | 100 | 200;
type Minutes = 1 | 5;
interface RateRun { hz: Hz; min: Minutes; stats: RateStats | null; at: number }

/**
 * Sensor Lab (M9, cut to T1 + T3 by docs/17 §2): T1 lists the motion sensors as Android reports them and sets the
 * detector's rangeG; T3 measures the REAL sampling rate at a requested 50 / 100 / 200 Hz from sensor timestamps.
 * Screenshot the results into docs/field-notes/. Never stage a crash (docs/13 §7).
 */
export default function SensorLab() {
  useKeepAwake('sensor-lab');
  const { t } = useTranslation();
  const rangeG = useSettings((s) => s.rangeG);
  const rangeSource = useSettings((s) => s.rangeSource);
  const setSettings = useSettings((s) => s.set);
  const driving = useSession((s) => s.drive.active);
  const sensors = useMemo(() => readMotionSensors(), []);
  const [manual, setManual] = useState(rangeG !== null ? String(rangeG) : '');
  const [hz, setHz] = useState<Hz>(100);
  const [minutes, setMinutes] = useState<Minutes>(1);
  const [running, setRunning] = useState<{ until: number; n: number } | null>(null);
  const [runs, setRuns] = useState<RateRun[]>([]);
  const stamps = useRef<number[]>([]);
  const stopRef = useRef<(() => void) | null>(null);

  // T1 from Android as soon as the screen opens (a hand-typed value is kept)
  useEffect(() => { resolveRangeG(); }, []);
  useEffect(() => () => stopRef.current?.(), []);

  const manualG = Number(manual);
  const manualValid = manual.trim() !== '' && Number.isFinite(manualG) && manualG > 0 && manualG <= 400;

  const startRate = () => {
    stamps.current = [];
    Accelerometer.setUpdateInterval(1000 / hz);
    const sub = Accelerometer.addListener((m) => { stamps.current.push(m.timestamp * 1000); });
    const until = Date.now() + minutes * 60_000;
    const tick = setInterval(() => {
      setRunning({ until, n: stamps.current.length });
      if (Date.now() >= until) finish();
    }, 500);
    const finish = () => {
      sub.remove();
      clearInterval(tick);
      stopRef.current = null;
      setRunning(null);
      setRuns((r) => [{ hz, min: minutes, stats: rateStats(stamps.current), at: Date.now() }, ...r]);
    };
    stopRef.current = finish;
    setRunning({ until, n: 0 });
  };

  return (
    <Screen footer={<Btn kind="secondary" label={t('common.back')} onPress={() => router.back()} />}>
      <Txt v="h1" accessibilityRole="header">{t('lab.title')}</Txt>
      <Txt tone="muted">{t('lab.body')}</Txt>
      <Notice text={t('lab.never')} tone="statusInfo" />

      <Section title={t('lab.t1')}>
        <Row label={t('lab.rangeInUse')} value={rangeG === null ? t('common.notSet') : `±${rangeG} g · ${t(`lab.source_${rangeSource ?? 'manual'}`)}`}
          tone={rangeG === null || !isRangeSupported(rangeG) ? 'statusDanger' : 'text'} />
        {rangeG !== null && !isRangeSupported(rangeG) && <Notice text={t('drive.unsupported', { g: rangeG })} tone="statusDanger" />}
        {!nativeSensorInfoAvailable && <Notice text={t('lab.noNative')} tone="statusWarn" />}
        {sensors?.length === 0 && <Notice text={t('lab.noSensors')} tone="statusWarn" />}
        {sensors?.map((s, i) => (
          <View key={`${s.kind}-${s.name}-${i}`} style={{ gap: T.space[1], paddingVertical: T.space[2] }}>
            <Txt v="label" ltr>{`${s.kind}${s.isDefault ? ' · default' : ''}`}</Txt>
            <Txt v="small" tone="muted" ltr>{`${s.name} · ${s.vendor} · v${s.version}`}</Txt>
            <Txt v="mono" ltr>
              {s.kind === 'gyroscope'
                ? `range ${Math.round((s.maximumRange * 180) / Math.PI)} deg/s · res ${s.resolution.toPrecision(3)} rad/s`
                : `range ${s.maximumRange.toFixed(2)} m/s² = ±${rangeGFrom(s.maximumRange)} g · res ${s.resolution.toPrecision(3)} m/s²`}
            </Txt>
            <Txt v="mono" tone="muted" ltr>{`minDelay ${s.minDelayUs} µs${s.minDelayUs > 0 ? ` (≤ ${Math.round(1e6 / s.minDelayUs)} Hz)` : ''} · fifo ${s.fifoMaxEventCount}${s.isWakeUp ? ' · wake-up' : ''}`}</Txt>
          </View>
        ))}
        <Field label={t('lab.manual')} hint={t('lab.manualHint')} value={manual} onChangeText={setManual} keyboardType="decimal-pad" ltr
          {...(manual.trim() !== '' && !manualValid && { error: t('lab.manualInvalid') })} />
        <Btn kind="secondary" disabled={!manualValid} label={t('lab.useManual')}
          onPress={() => setSettings({ rangeG: Math.round(manualG * 10) / 10, rangeSource: 'manual' })} />
        {rangeSource === 'manual' && nativeSensorInfoAvailable && (
          <Btn kind="quiet" label={t('lab.useDevice')} onPress={() => { setSettings({ rangeSource: 'device' }); resolveRangeG(); }} />
        )}
      </Section>

      <Section title={t('lab.t3')}>
        <Txt v="small" tone="muted">{t('lab.t3Body')}</Txt>
        {driving && <Notice text={t('lab.stopDriveFirst')} tone="statusWarn" />}
        <Segmented label={t('lab.requested')} value={hz} onChange={setHz} options={[50, 100, 200].map((v) => ({ value: v as Hz, label: `${v} Hz` }))} />
        <Segmented label={t('lab.duration')} value={minutes} onChange={setMinutes} options={[{ value: 1 as Minutes, label: '1 min' }, { value: 5 as Minutes, label: '5 min' }]} />
        {running ? (
          <>
            <Txt v="mono" ltr>{t('lab.running', { n: running.n, s: Math.max(0, Math.ceil((running.until - Date.now()) / 1000)) })}</Txt>
            <Btn kind="secondary" icon={Square} label={t('lab.stop')} onPress={() => stopRef.current?.()} />
          </>
        ) : (
          <Btn icon={Play} disabled={driving} label={t('lab.start')} onPress={startRate} />
        )}
        {runs.map((r) => (
          <View key={r.at} style={{ gap: T.space[1], paddingVertical: T.space[2] }}>
            <Txt v="label" ltr>{`${r.hz} Hz requested · ${r.min} min`}</Txt>
            {r.stats ? (
              <>
                <Txt v="mono" ltr>{`median ${r.stats.medianHz} Hz (Δt ${r.stats.medianDtMs} ms) · p95 Δt ${r.stats.p95DtMs} ms · max gap ${r.stats.maxGapMs} ms`}</Txt>
                <Txt v="mono" tone="muted" ltr>{`${r.stats.samples} samples in ${r.stats.durationS.toFixed(1)} s`}</Txt>
                <Txt v="small" tone={r.stats.ok ? 'statusOk' : 'statusWarn'}>{r.stats.ok ? t('lab.rateOk') : t('lab.rateLow')}</Txt>
              </>
            ) : (
              <Txt v="small" tone="statusWarn">{t('lab.tooFew')}</Txt>
            )}
          </View>
        ))}
      </Section>
    </Screen>
  );
}
