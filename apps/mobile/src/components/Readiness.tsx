import * as Location from 'expo-location';
import { router, type Href } from 'expo-router';
import { AlertTriangle, Check, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, Pressable, View } from 'react-native';
import { isRangeSupported } from '../sensorlab/stats';
import { nativeSmsReady } from '../services/alerts';
import { useSession } from '../state/session';
import { useSettings } from '../state/settings';
import { T, useTheme } from '../ui';
import { Section, Txt } from './kit';

interface Item { key: string; ok: boolean; label: string; detail: string; fix?: Href }

function Line({ it }: { it: Item }) {
  const { c } = useTheme();
  const Icon: LucideIcon = it.ok ? Check : AlertTriangle;
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space[3], minHeight: T.size.touchMin }}>
      <Icon size={20} color={it.ok ? c.statusOk : c.statusWarn} />
      <View style={{ flex: 1 }}>
        <Txt v="label">{it.label}</Txt>
        <Txt v="small" tone={it.ok ? 'muted' : 'statusWarn'}>{it.detail}</Txt>
      </View>
      {it.fix && <ChevronRight size={18} color={c.muted} style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }} />}
    </View>
  );
  return it.fix
    ? <Pressable testID={`ready-${it.key}`} accessibilityRole="button" onPress={() => router.push(it.fix!)}>{body}</Pressable>
    : body;
}

/** Home: is this phone ready to protect? Each missing piece says what still works and opens the screen that fixes it. */
export function Readiness() {
  const { t } = useTranslation();
  const loc = useSession((s) => s.perms.location);
  const smsPerm = useSession((s) => s.perms.sms);
  const link = useSession((s) => s.link);
  const rangeG = useSettings((s) => s.rangeG);
  const gw = useSettings((s) => s.gw1 || s.gw2);
  const simLabel = useSettings((s) => s.simLabel);
  const setSession = useSession((s) => s.set);

  useEffect(() => {
    void Location.getForegroundPermissionsAsync().then((p) =>
      setSession({ perms: { ...useSession.getState().perms, location: p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied' } }));
  }, [setSession]);

  const native = nativeSmsReady();
  void smsPerm; // re-render when the SMS permission changes (nativeSmsReady reads it)
  const items: Item[] = [
    { key: 'location', ok: loc === 'granted', label: t('ready.location'), detail: loc === 'granted' ? t('ready.locationOk') : t('ready.locationNo'), ...(loc !== 'granted' && { fix: '/onboarding/permissions' as Href }) },
    {
      key: 'detection', ok: rangeG !== null && isRangeSupported(rangeG), label: t('ready.detection'),
      detail: rangeG === null ? t('ready.detectionUnknown') : isRangeSupported(rangeG) ? t('ready.detectionOk', { g: rangeG }) : t('ready.detectionLow', { g: rangeG }),
      fix: '/sensor-lab',
    },
    {
      key: 'sms', ok: native && Boolean(gw), label: t('ready.sms'),
      detail: !gw ? t('ready.smsNoGateway') : native ? (simLabel ? t('ready.smsSim', { slot: simLabel.slot + 1, carrier: simLabel.carrier }) : t('ready.smsOk')) : t('ready.smsComposer'),
      fix: '/settings',
    },
    { key: 'server', ok: link === 'online', label: t('ready.server'), detail: link === 'online' ? t('ready.serverOk') : link === 'unknown' ? t('ready.serverChecking') : t('ready.serverNo'), ...(link !== 'online' && { fix: '/settings' as Href }) },
  ];
  const all = items.every((i) => i.ok);
  return (
    <Section title={all ? t('ready.titleOk') : t('ready.title')}>
      {items.map((it) => <Line key={it.key} it={it} />)}
    </Section>
  );
}
