import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, router } from 'expo-router';
import { Siren } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, View } from 'react-native';
import { Btn, Screen, Txt } from '@/src/components/kit';
import { startAlarm, stopAlarm } from '@/src/services/alarm';
import { raiseAlert } from '@/src/services/alerts';
import { resolveCountdown } from '@/src/services/drive';
import { useSession } from '@/src/state/session';
import { countdownSeconds, useSettings } from '@/src/state/settings';
import { CountdownRing, T } from '@/src/ui';

/**
 * Countdown (M4): full screen, no scroll, two controls only. Alarm + vibration + voice. No answer → alert with
 * flag N. "Send help now" → alert at once (the person is conscious). Back is disabled: only the two buttons decide.
 */
export default function Countdown() {
  useKeepAwake('countdown');
  const { t } = useTranslation();
  const crash = useSession((s) => s.pendingCrash);
  const demo = useSettings((s) => s.demoMode);
  const total = useSettings((s) => countdownSeconds(s));
  const [remaining, setRemaining] = useState(total);
  const decided = useRef(false);
  const started = useRef(Date.now());

  const finish = async (how: 'ok' | 'send' | 'timeout') => {
    if (decided.current || !crash) return;
    decided.current = true;
    await stopAlarm();
    if (how === 'ok') {
      resolveCountdown('ok');
      router.replace('/drive');
      return;
    }
    const id = await raiseAlert({ source: 'A', crash, noResponse: how === 'timeout' });
    resolveCountdown('alerted');
    router.replace({ pathname: '/alert/[id]', params: { id } });
  };

  useEffect(() => {
    if (!crash) return;
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
  }, [crash]);

  if (!crash && !decided.current) return <Redirect href="/" />;

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: T.space[5] }}>
        <CountdownRing remaining={remaining} total={total} size={240} />
        <View style={{ alignItems: 'center', gap: T.space[1] }}>
          <Txt v="h1" style={{ textAlign: 'center' }} accessibilityRole="header">{t('countdown.question')}</Txt>
          <Txt v="title" tone="muted" style={{ textAlign: 'center' }}>{t('countdown.otherQuestion')}</Txt>
        </View>
        <Txt v="small" tone="muted" style={{ textAlign: 'center' }}>{demo ? t('countdown.demo') : t('countdown.autoSend')}</Txt>
      </View>
      <View style={{ gap: T.space[3] }}>
        <Btn testID="countdown-ok" big kind="secondary" label={t('countdown.ok')} onPress={() => void finish('ok')} />
        <Btn testID="countdown-send" big icon={Siren} label={t('countdown.send')} onPress={() => void finish('send')} />
      </View>
    </Screen>
  );
}
