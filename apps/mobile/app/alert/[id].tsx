import { router, useLocalSearchParams } from 'expo-router';
import { Check, MessageSquareText, Phone, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { hhmm, httpsBadge } from '@/src/components/AlertSummary';
import { Btn, Notice, Screen, Section, Txt } from '@/src/components/kit';
import { EMERGENCY, openDialler } from '@/src/services/alerts';
import { stopDrive } from '@/src/services/drive';
import { useSession } from '@/src/state/session';
import { ChannelBadge, EmptyState, GoldenRing, PacketLine, T, useTheme } from '@/src/ui';

/**
 * Alert status (M5): the packet first (what travelled), one row per channel, "Received by rescuers" on ACK,
 * call buttons, and the "What to say" card. No severity is shown to the person in the car: the band is a hint
 * for the operations room only.
 */
export default function AlertStatus() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useSession((s) => (id ? s.alerts[id] : undefined));
  const replaying = useSession((s) => s.replay !== null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(i);
  }, []);

  const close = async () => {
    if (replaying) await stopDrive();
    router.replace('/');
  };

  if (!item) {
    return (
      <Screen footer={<Btn kind="secondary" label={t('common.close')} onPress={() => router.replace('/')} />}>
        <EmptyState title={t('alert.notFound')} body={t('numbers.complement')} />
      </Screen>
    );
  }

  const h = item.https;
  const httpsText =
    h.state === 'acked' ? t('alert.https_acked')
    : h.state === 'rejected' ? t('alert.https_rejected', { code: h.lastError ?? '' })
    : h.state === 'gave_up' ? t('alert.https_gave_up')
    : h.state === 'retrying' && h.nextAt ? t('alert.https_retrying', { s: Math.max(0, Math.ceil((h.nextAt - now) / 1000)) })
    : t('alert.https_pending');
  const loc = item.json.location;
  const outcome = item.ack?.outcome;

  return (
    <Screen footer={<Btn kind="secondary" label={t('common.close')} onPress={() => void close()} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: T.space[3] }}>
        <Txt v="h1" accessibilityRole="header">{t('alert.title')}</Txt>
        <GoldenRing elapsedMin={(now - item.createdAt) / 60_000} size={56} />
      </View>

      {item.ackAt ? (
        <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: T.space[2], padding: T.space[3], borderWidth: 2, borderColor: c.statusOk, borderRadius: T.radius.md }}>
          <Check size={24} color={c.statusOk} />
          <Txt v="title" style={{ flex: 1 }}>{t('alert.receivedAt', { time: hhmm(item.ackAt) })}</Txt>
        </View>
      ) : (
        <Notice text={t('alert.waiting')} tone="statusInfo" />
      )}
      {outcome === 'merged' && item.ack?.merged_count ? <Txt v="small" tone="muted">{t('alert.merged', { n: item.ack.merged_count })}</Txt> : null}

      <Section title={t('alert.packet')}>
        <PacketLine wire={item.wire} />
      </Section>

      <Section title={t('alert.channels')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space[2] }}>
          {item.diallerOpenedAt ? <Check size={18} color={c.statusOk} /> : <X size={18} color={c.statusWarn} />}
          <Txt style={{ flex: 1 }}>{item.diallerOpenedAt ? t('alert.dialler') : t('alert.diallerNot')}</Txt>
        </View>
        <View style={{ gap: T.space[1] }}>
          <ChannelBadge channel="https" status={httpsBadge(item)} />
          <Txt v="small" tone="muted">{httpsText}</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space[2], opacity: 0.7 }} accessibilityState={{ disabled: true }}>
          <MessageSquareText size={18} color={c.muted} />
          <Txt v="small" tone="muted" style={{ flex: 1 }}>{`${t('alert.sms')} · ${t('alert.smsLater')}`}</Txt>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: T.space[2] }}>
          {[EMERGENCY.civil, EMERGENCY.civilAlt, EMERGENCY.gendarmerie].map((n, i) => (
            <View key={n} style={{ flexGrow: 1, flexBasis: '30%' }}>
              <Btn kind={i === 0 ? 'primary' : 'secondary'} icon={i === 0 ? Phone : undefined} label={i === 0 ? t('numbers.call', { n }) : n} onPress={() => void openDialler(n)} />
            </View>
          ))}
        </View>
      </Section>

      <Section title={t('alert.sayTitle')}>
        {item.locationAgeMin === null ? (
          <Txt>{t('alert.sayWhereNone')}</Txt>
        ) : (
          <>
            <Txt>{t('alert.sayWhere', { plus: loc.plus_code ?? '—', lat: loc.lat.toFixed(5), lon: loc.lon.toFixed(5) })}</Txt>
            {item.locationAgeMin > 2 && <Txt v="small" tone="statusWarn">{t('alert.sayAge', { n: item.locationAgeMin })}</Txt>}
          </>
        )}
        <Txt>{t('alert.sayWho', { p: item.json.scene.persons, v: item.json.scene.vehicles })}</Txt>
        <Txt>{t('alert.sayDanger')}</Txt>
        <Txt>{t('alert.sayCallback')}</Txt>
      </Section>
      <Txt v="small" tone="muted">{t('numbers.complement')}</Txt>
    </Screen>
  );
}
