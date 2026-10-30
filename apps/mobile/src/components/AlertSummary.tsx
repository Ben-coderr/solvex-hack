import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { OutboxItem } from '../alert/outbox';
import { ChannelBadge, FONT, T, type ChannelStatus } from '../ui';
import { Txt } from './kit';

export const httpsBadge = (i: OutboxItem): ChannelStatus =>
  i.https.state === 'acked' ? 'acked' : i.https.state === 'pending' || i.https.state === 'retrying' ? 'retrying' : 'failed';

export const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** One-line alert summary: id (mono, LTR) · time · internet channel status. */
export function AlertSummary({ item }: { item: OutboxItem }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: T.space[2] }}>
      <View style={{ flexDirection: 'row', gap: T.space[3], alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Txt v="label" ltr style={{ fontFamily: FONT.monoMedium }}>{item.id}</Txt>
        <Txt v="small" tone="muted" ltr>{hhmm(item.createdAt)}</Txt>
      </View>
      {item.ackAt ? <Txt v="small" tone="statusOk">{t('alert.receivedAt', { time: hhmm(item.ackAt) })}</Txt> : <ChannelBadge channel="https" status={httpsBadge(item)} />}
    </View>
  );
}
