import { packetView, type PacketToken } from '@najda/ui-core';
import { StyleSheet, Text, View } from 'react-native';
import { FONT, T, useTheme, type Palette } from './theme';
import { useUiText } from './text';

function chipStyle(tok: PacketToken, c: Palette) {
  return [
    s.chip,
    { borderColor: c.line, backgroundColor: c.raised },
    tok.state === 'suspect' && { borderStyle: 'dashed' as const, borderColor: c.statusWarn },
    tok.state === 'invalid' && { borderColor: c.statusDanger },
  ];
}

/** One DZ-MSD token as a monospace chip ("the packet IS the UI"). */
export function PacketChip({ token, mode }: { token: PacketToken; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const strong = token.kind === 'id' || token.kind === 'assessment';
  const quiet = token.kind === 'magic' || token.kind === 'crc';
  return (
    <View style={chipStyle(token, c)}>
      <Text style={[s.chipText, { color: token.state === 'invalid' ? c.statusDanger : quiet ? c.muted : c.text, fontFamily: strong ? FONT.monoMedium : FONT.mono }]}>
        {token.text}
      </Text>
    </View>
  );
}

/** Full packet: chips that wrap (always LTR, also in Arabic), "93/160", GSM-7 badge, decoder verdict. */
export function PacketLine({ wire, mode }: { wire: string; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const txt = useUiText();
  const v = packetView(wire);
  const fits = v.length !== null && v.length <= v.max;
  const verdict = v.decoded.ok ? null : v.decoded.code === 'checksum_mismatch' ? txt.packetCrc : txt.packetInvalid(v.decoded.code);
  return (
    <View style={{ gap: T.space[2] }} accessible accessibilityLabel={wire}>
      <View style={s.meta}>
        <Text style={[s.counter, { color: c.muted }]}>{`${v.length ?? wire.length}/${v.max}`}</Text>
        <Text style={[s.badge, { color: fits && v.basicGsm7 ? c.muted : c.statusDanger, borderColor: fits && v.basicGsm7 ? c.line : c.statusDanger }]}>
          {v.length === null ? txt.packetNotGsm7 : !fits ? txt.packetTooLong : txt.packetGsm7}
        </Text>
      </View>
      <View style={s.chips}>
        {v.tokens.map((t, i) => <PacketChip key={`${i}-${t.text}`} token={t} mode={mode} />)}
      </View>
      {verdict && <Text style={{ color: c.statusDanger, fontFamily: FONT.ui, fontSize: T.fontSize.sm }}>{verdict}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  // Packet text never mirrors: force LTR layout for the chip row even when the app is RTL.
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, direction: 'ltr' },
  chip: { borderWidth: 1, borderRadius: T.radius.sm / 2, paddingHorizontal: 6, paddingVertical: 4 },
  chipText: { fontSize: 15, letterSpacing: -0.2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: T.space[3] },
  counter: { fontFamily: FONT.mono, fontSize: T.fontSize.sm, writingDirection: 'ltr' },
  badge: { fontFamily: FONT.mono, fontSize: T.fontSize.xs, borderWidth: 1, borderRadius: T.radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
});
