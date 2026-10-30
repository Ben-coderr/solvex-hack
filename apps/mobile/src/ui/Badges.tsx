import type { Confidence } from '@najda/shared';
import { Check, CheckCheck, ClipboardPaste, CloudOff, Eye, FlaskConical, Globe, MessageSquareText, Play, RefreshCw, Wifi, X, type LucideIcon } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { FONT, T, useTheme, type Palette } from './theme';
import { useUiText } from './text';

export type Channel = 'https' | 'sms' | 'paste' | 'witness' | 'sim';
export type ChannelStatus = 'sent' | 'retrying' | 'acked' | 'failed';
const CH_ICON: Record<Channel, LucideIcon> = { https: Globe, sms: MessageSquareText, paste: ClipboardPaste, witness: Eye, sim: FlaskConical };
const ST: Record<ChannelStatus, [LucideIcon, keyof Palette]> = {
  sent: [Check, 'statusInfo'], retrying: [RefreshCw, 'statusWarn'], acked: [CheckCheck, 'statusOk'], failed: [X, 'statusDanger'],
};

const pill = (c: Palette) => ({ flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'center' as const, gap: 6, borderWidth: 1, borderColor: c.line, borderRadius: T.radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' as const });

/** Channel × delivery status: icon + word (alert status screen rows). */
export function ChannelBadge({ channel, status, mode }: { channel: Channel; status?: ChannelStatus; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const txt = useUiText();
  const Icon = CH_ICON[channel];
  const st = status ? ST[status] : null;
  return (
    <View style={pill(c)}>
      <Icon size={16} color={c.muted} />
      <Text style={{ fontFamily: FONT.ui, fontSize: T.fontSize.sm, color: c.text }}>{txt.channel[channel]}</Text>
      {st && status && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {(() => { const SI = st[0]; return <SI size={14} color={c[st[1]] as string} />; })()}
          <Text style={{ fontFamily: FONT.ui, fontSize: T.fontSize.sm, color: c[st[1]] as string }}>{txt.channelStatus[status]}</Text>
        </View>
      )}
    </View>
  );
}

/** H/M/L as three bars + the word: never colour alone. */
export function ConfidencePill({ conf, mode }: { conf: Confidence; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const txt = useUiText();
  const level = { L: 1, M: 2, H: 3 }[conf];
  return (
    <View style={pill(c)}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
        {[1, 2, 3].map((i) => <View key={i} style={{ width: 4, height: 4 + i * 3, borderRadius: 1, backgroundColor: i <= level ? c.text : c.line }} />)}
      </View>
      <Text style={{ fontFamily: FONT.ui, fontSize: T.fontSize.sm, color: c.text }}>{txt.confidence[conf]}</Text>
    </View>
  );
}

export type ConnectivityMode = 'online' | 'sms_only' | 'offline' | 'replay' | 'replay_box' | 'demo';
const MODE: Record<ConnectivityMode, LucideIcon> = { online: Wifi, sms_only: MessageSquareText, offline: CloudOff, replay: Play, replay_box: Play, demo: FlaskConical };

/** Persistent strip on every screen: connectivity, and REPLAY / DEMO impossible to miss. */
export function StatusBanner({ mode: m, theme }: { mode: ConnectivityMode; theme?: 'light' | 'dark' }) {
  const { c } = useTheme(theme);
  const txt = useUiText();
  const Icon = MODE[m];
  const strong = m === 'replay' || m === 'replay_box' || m === 'demo';
  const fg = strong ? c.onBrand : m === 'sms_only' ? c.statusInfo : m === 'offline' ? c.statusWarn : c.muted;
  return (
    <View accessibilityRole="summary" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 16, paddingVertical: 8,
      backgroundColor: strong ? c.brandFill : 'transparent', borderBottomWidth: 1, borderColor: strong ? c.brandFill : fg }}>
      <Icon size={16} color={fg} />
      <Text style={{ flexShrink: 1, fontFamily: strong ? FONT.uiSemibold : FONT.ui, fontSize: T.fontSize.sm, color: fg }}>{txt.status[m]}</Text>
    </View>
  );
}
