import type { Band } from '@najda/shared';
import { BAND_ORDER } from '@najda/ui-core';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
  ChannelBadge, CountdownRing, EmptyState, ErrorState, FONT, GoldenRing, LocaleSwitch, PacketLine, ReasonList,
  Skeleton, SosButton, StatusBanner, T, TriageMarker, useTheme, WitnessStepper,
} from '@/src/ui';

// Mobile design-system QA screen: every component × state, light + dark, LTR + RTL. Synthetic data.
const EX1 = 'NAJDA1 K7Q2M R75H 36.47213,2.82871 T1432 SA V1 P1 KC D71 G38 RO FN HR124 SP89 8F84FRCH+VF #04';
const BAD = EX1.replace('#04', '#05');

function Panel({ mode, rtl, children }: { mode: 'light' | 'dark'; rtl?: boolean; children: (m: 'light' | 'dark') => ReactNode }) {
  const { c } = useTheme(mode);
  return (
    <View testID={`panel-${mode}-${rtl ? 'rtl' : 'ltr'}`} style={{ backgroundColor: c.bg, padding: T.space[4], gap: T.space[4], borderRadius: T.radius.md, borderWidth: 1, borderColor: c.line, direction: rtl ? 'rtl' : 'ltr' }}>
      <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: c.muted }}>{`${mode} · ${rtl ? 'rtl' : 'ltr'}`}</Text>
      {children(mode)}
    </View>
  );
}

function Section({ title, children }: { title: string; children: (m: 'light' | 'dark') => ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: T.space[3] }}>
      <Text style={{ fontFamily: FONT.monoMedium, fontSize: T.fontSize.lg, color: c.text }}>{title}</Text>
      <Panel mode="light">{children}</Panel>
      <Panel mode="dark">{children}</Panel>
      <Panel mode="dark" rtl>{children}</Panel>
    </View>
  );
}

export default function MobileStyleguide() {
  const { c } = useTheme();
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: T.space[4], gap: T.space[7] }}>
      <StatusBanner mode="demo" />
      <Section title="TriageMarker">
        {(m) => (['row', 'pin', 'hero'] as const).map((size) => (
          <View key={size} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            {BAND_ORDER.map((b: Band) => <TriageMarker key={b} band={b} size={size} mode={m} />)}
          </View>
        ))}
      </Section>
      <Section title="PacketLine">{(m) => <><PacketLine wire={EX1} mode={m} /><PacketLine wire={BAD} mode={m} /></>}</Section>
      <Section title="CountdownRing · GoldenRing">
        {(m) => (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <CountdownRing remaining={27} size={160} mode={m} />
            <CountdownRing remaining={4} size={160} mode={m} />
            <GoldenRing elapsedMin={18} mode={m} />
            <GoldenRing elapsedMin={42} paused mode={m} />
          </View>
        )}
      </Section>
      <Section title="SosButton">
        {(m) => (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <SosButton mode={m} />
            <SosButton previewProgress={0.6} mode={m} />
            <SosButton state="sending" mode={m} />
            <SosButton state="sent" mode={m} />
          </View>
        )}
      </Section>
      <Section title="ChannelBadge">
        {(m) => (
          <View style={{ gap: 6 }}>
            <ChannelBadge channel="https" status="retrying" mode={m} />
            <ChannelBadge channel="sms" status="acked" mode={m} />
            <ChannelBadge channel="sms" status="failed" mode={m} />
          </View>
        )}
      </Section>
      <Section title="ReasonList">
        {(m) => <ReasonList conf="H" values={{ dv: 71 }} reasons={[{ code: 'dv', points: 30 }, { code: 'spo2_low', points: 20 }, { code: 'rollover', points: 15 }]} mode={m} />}
      </Section>
      <Section title="StatusBanner">
        {(m) => (['online', 'sms_only', 'offline', 'replay', 'demo'] as const).map((s) => <StatusBanner key={s} mode={s} theme={m} />)}
      </Section>
      <Section title="WitnessStepper · LocaleSwitch">
        {(m) => <><WitnessStepper current={2} mode={m} /><LocaleSwitch value="ar" onChange={() => {}} mode={m} /></>}
      </Section>
      <Section title="States">
        {(m) => <><Skeleton width="70%" height={16} mode={m} /><EmptyState mode={m} /><ErrorState onRetry={() => {}} mode={m} /></>}
      </Section>
    </ScrollView>
  );
}
