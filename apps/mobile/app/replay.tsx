import { router } from 'expo-router';
import { Play } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Btn, Screen, Segmented, Txt } from '@/src/components/kit';
import { TRACE_EXPECTS, TRACE_NAMES, type TraceName } from '@/src/detector/synth';
import type { ReplayRate } from '@/src/replay/engine';
import { startDrive } from '@/src/services/drive';
import { FONT, T, useTheme } from '@/src/ui';

/** Replay picker (demo): a trace through the same detector as live; REPLAY is shown on every screen meanwhile. */
export default function Replay() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const [name, setName] = useState<TraceName>('rollover_71');
  const [rate, setRate] = useState<ReplayRate>(1);

  const start = async () => {
    await startDrive({ replay: { name, rate } });
    router.replace('/drive');
  };

  return (
    <Screen footer={
      <View style={{ flexDirection: 'row', gap: T.space[3] }}>
        <View style={{ flex: 1 }}><Btn kind="secondary" label={t('common.back')} onPress={() => router.back()} /></View>
        <View style={{ flex: 1 }}><Btn testID="replay-start" icon={Play} label={t('replay.start')} onPress={() => void start()} /></View>
      </View>
    }>
      <Txt v="h1" accessibilityRole="header">{t('replay.title')}</Txt>
      <Txt tone="muted">{t('replay.body')}</Txt>
      <Txt v="small" tone="statusInfo">{t('replay.synthetic')}</Txt>

      <View accessibilityRole="radiogroup" style={{ gap: T.space[2] }}>
        {TRACE_NAMES.map((n) => {
          const on = n === name;
          return (
            <Pressable key={n} testID={`trace-${n}`} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setName(n)}
              style={{ minHeight: T.size.touchMin, padding: T.space[3], borderRadius: T.radius.md, borderWidth: on ? 2 : 1, borderColor: on ? c.brandFill : c.line, backgroundColor: c.surface, gap: T.space[1] }}>
              <Txt v="label" ltr style={{ fontFamily: FONT.monoMedium }}>{n}</Txt>
              <Txt v="small" tone="muted">{TRACE_EXPECTS[n] === 'alert' ? t('replay.expectAlert') : t('replay.expectNone')}</Txt>
            </Pressable>
          );
        })}
      </View>

      <Txt v="label">{t('replay.rate')}</Txt>
      <Segmented label={t('replay.rate')} value={rate} onChange={setRate} options={[{ value: 1, label: '1×' }, { value: 4, label: '4×' }]} />
    </Screen>
  );
}
