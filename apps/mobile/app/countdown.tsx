import { toPacketHints, type ReasonKey } from '@najda/detector';
import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, router } from 'expo-router';
import { Check, Siren } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, View } from 'react-native';
import { Btn, Screen, Txt } from '@/src/components/kit';
import { startAlarm, stopAlarm } from '@/src/services/alarm';
import { raiseAlert } from '@/src/services/alerts';
import { resolveCountdown } from '@/src/services/drive';
import { useSession } from '@/src/state/session';
import { countdownSeconds, useSettings } from '@/src/state/settings';
import { CountdownRing, T, useTheme } from '@/src/ui';

/** Most telling first; at most three lines so the screen never scrolls (docs/06 §7). */
const REASON_ORDER: readonly ReasonKey[] = ['rotation', 'impact_at_sensor_limit', 'impact_sustained', 'speed_collapse', 'came_to_stop'];

/**
 * Countdown (M4): full screen, no scroll, two controls only. Alarm + vibration + voice. No answer → alert with
 * flag N. "Send help now" → alert at once (the person is conscious). Back is disabled: only the two buttons decide.
 * It says WHY it triggered (the detector's reason keys, docs/13 §3.4), so "I'm OK" is an informed answer.
 */
export default function Countdown() {
  useKeepAwake('countdown');
  const { t } = useTranslation();
  const { c } = useTheme();
  const pending = useSession((s) => s.pending);
  const demo = useSettings((s) => s.demoMode);
  const total = useSettings((s) => countdownSeconds(s));
  const [remaining, setRemaining] = useState(total);
  const decided = useRef(false);
  const started = useRef(Date.now());

  const finish = async (how: 'ok' | 'send' | 'timeout') => {
    if (decided.current || !pending) return;
    decided.current = true;
    await stopAlarm();
    if (how === 'ok') {
      resolveCountdown();
      router.replace('/drive');
      return;
    }
    const id = await raiseAlert({ source: 'A', hints: toPacketHints(pending.decision, pending.rangeG), noResponse: how === 'timeout' });
    resolveCountdown();
    router.replace({ pathname: '/alert/[id]', params: { id } });
  };

  useEffect(() => {
    if (!pending) return;
    void startAlarm();
    const back = BackHandler.addEventListener('hardwareBackPress', () => true);
    const timer = setInterval(() => {
      const left = total - (Date.now() - started.current) / 1000;
      setRemaining(Math.max(0, left));
      if (left <= 0) void finish('timeout');
    }, 200);
    return () => {
      clearInterval(timer);
      back.remove();
      void stopAlarm();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  if (!pending && !decided.current) return <Redirect href="/" />;
  const reasons = REASON_ORDER.filter((k) => pending?.decision.reasons.includes(k)).slice(0, 3);

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: T.space[5] }}>
        <CountdownRing remaining={remaining} total={total} size={208} />
        <View style={{ alignItems: 'center', gap: T.space[1] }}>
          <Txt v="h1" style={{ textAlign: 'center' }} accessibilityRole="header">{t('countdown.question')}</Txt>
          <Txt v="title" tone="muted" style={{ textAlign: 'center' }}>{t('countdown.otherQuestion')}</Txt>
        </View>
        {reasons.length > 0 && (
          <View accessible accessibilityLabel={`${t('countdown.why')}: ${reasons.map((k) => t(`countdown.reason.${k}`)).join('. ')}`}
            style={{ alignSelf: 'stretch', gap: T.space[1] }}>
            <Txt v="label" tone="muted">{t('countdown.why')}</Txt>
            {reasons.map((k) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: T.space[2] }}>
                <Check size={18} color={c.muted} />
                <Txt style={{ flexShrink: 1 }}>{t(`countdown.reason.${k}`)}</Txt>
              </View>
            ))}
          </View>
        )}
        <Txt v="small" tone="muted" style={{ textAlign: 'center' }}>{demo ? t('countdown.demo', { s: total }) : t('countdown.autoSend')}</Txt>
      </View>
      <View style={{ gap: T.space[3] }}>
        <Btn testID="countdown-ok" big kind="secondary" label={t('countdown.ok')} onPress={() => void finish('ok')} />
        <Btn testID="countdown-send" big icon={Siren} label={t('countdown.send')} onPress={() => void finish('send')} />
      </View>
    </Screen>
  );
}
