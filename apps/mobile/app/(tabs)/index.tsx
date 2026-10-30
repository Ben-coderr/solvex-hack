import { ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { tokens } from '@najda/tokens';

import { smokePacket } from '@/src/lib/smoke-packet';

// P0 foundations smoke screen: proves @najda/shared and @najda/tokens resolve through Metro.
// Replaced by the real shell in P4 (fonts, i18n and states land there).
export default function SmokeScreen() {
  const c = tokens.color[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { wire, length, max, roundTrip, matchesGolden } = smokePacket();
  const rows: [string, string][] = [
    ['Length', `${length ?? 'not GSM-7'} / ${max}`],
    ['Decodes back', roundTrip ? 'yes' : 'no'],
    ['Matches golden vector', matchesGolden ? 'yes' : 'no'],
  ];

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.container}>
      <Text style={[styles.badge, { color: c.muted, borderColor: c.line }]}>DEMO · P0 smoke check · synthetic data</Text>
      <Text style={[styles.title, { color: c.text }]}>NAJDA</Text>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Text style={[styles.label, { color: c.muted }]}>DZ-MSD packet (encoded by @najda/shared)</Text>
        <Text testID="packet" selectable style={[styles.packet, { color: c.text }]}>
          {wire}
        </Text>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={[styles.label, { color: c.muted }]}>{k}</Text>
            <Text style={[styles.mono, { color: c.text }]}>{v}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: tokens.space[4], paddingTop: tokens.space[7], gap: tokens.space[5] },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[1],
    fontFamily: 'monospace',
    fontSize: 13,
  },
  title: { fontSize: 36, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: tokens.radius.md, padding: tokens.space[4], gap: tokens.space[3] },
  label: { fontSize: 14 },
  packet: { fontFamily: 'monospace', fontSize: 18, lineHeight: 28 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: tokens.space[4] },
  mono: { fontFamily: 'monospace', fontSize: 14 },
});
