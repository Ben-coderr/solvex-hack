import { Check, CheckCheck, Clock, Globe, MessageSquareText, RefreshCw, Send, Users, X, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import type { ChannelRow, RowState } from '../alert/chain';
import { T, useTheme } from '../ui';
import { hhmm } from './AlertSummary';
import { Txt } from './kit';

const CH_ICON: Record<ChannelRow['channel'], LucideIcon> = { https: Globe, gw1: MessageSquareText, gw2: MessageSquareText, contacts: Users, composer: MessageSquareText };
/** icon + word for every state, never colour alone; status.* tokens only (triage colours are reserved) */
type Tone = 'muted' | 'statusInfo' | 'statusWarn' | 'statusOk' | 'statusDanger';
const ST: Record<RowState, [LucideIcon, Tone]> = {
  waiting: [Clock, 'muted'], sending: [Send, 'statusInfo'], retrying: [RefreshCw, 'statusWarn'], sent: [Check, 'statusInfo'],
  delivered: [CheckCheck, 'statusOk'], acked: [CheckCheck, 'statusOk'], failed: [X, 'statusDanger'], rejected: [X, 'statusDanger'],
  gave_up: [X, 'statusDanger'], offered: [Clock, 'statusWarn'], opened: [Check, 'statusInfo'], off: [Clock, 'muted'],
};

/** One line per channel of the chain (docs/04 §3.3): what it is, where it is, since when. */
export function ChannelRows({ rows, now, nextAt }: { rows: ChannelRow[]; now: number; nextAt: number | null }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  return (
    <View style={{ gap: T.space[2] }}>
      {rows.map((r) => {
        const Icon = CH_ICON[r.channel];
        const [SI, tone] = ST[r.state];
        const status = t(`alert.st.${r.state}`, {
          n: r.attempts, time: r.at ? hhmm(r.at) : '', code: r.code ?? '',
        });
        const retryS = r.channel === 'https' && r.state === 'retrying' && nextAt ? Math.max(0, Math.ceil((nextAt - now) / 1000)) : null;
        return (
          <View key={r.channel} testID={`row-${r.channel}`} accessible accessibilityLabel={`${t(`alert.row.${r.channel}`)}: ${status}`}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: T.space[2], minHeight: 32 }}>
            <Icon size={18} color={c.muted} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="label">{t(`alert.row.${r.channel}`)}</Txt>
              {r.detail && r.channel !== 'https' ? <Txt v="small" tone="muted" ltr>{r.detail}</Txt> : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <SI size={14} color={c[tone]} />
                <Txt v="small" tone={tone}>{status}</Txt>
              </View>
              {retryS !== null && <Txt v="small" tone="muted">{t('alert.retryIn', { s: retryS })}</Txt>}
              {r.state === 'failed' || r.state === 'retrying' ? (r.code && r.channel !== 'https' ? <Txt v="small" tone="muted" ltr>{r.code}</Txt> : null) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
