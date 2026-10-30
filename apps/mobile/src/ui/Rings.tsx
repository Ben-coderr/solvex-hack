import { GOLDEN_SPAN_MIN, GOLDEN_TICKS, goldenFraction, ringDash } from '@najda/ui-core';
import { Text, View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { FONT, useTheme } from './theme';
import { useUiText } from './text';

/** Minutes since impact over the first hour (ticks 10/30/60). Brand colour, never a triage hue. */
export function GoldenRing({ elapsedMin, size = 64, paused, mode }: { elapsedMin: number; size?: number; paused?: boolean; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const txt = useUiText();
  const { circumference, offset } = ringDash(42, goldenFraction(elapsedMin));
  const minutes = Math.floor(Math.max(0, elapsedMin));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={txt.goldenLabel(minutes)} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg viewBox="0 0 100 100" width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
        {/* rotate inside the SVG: an explicit origin, identical on Android, iOS and web */}
        <G transform="rotate(-90 50 50)">
        <Circle cx="50" cy="50" r="42" fill="none" stroke={c.line} strokeWidth="6" />
        <Circle cx="50" cy="50" r="42" fill="none" stroke={paused ? c.muted : c.brandFill} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${circumference}`} strokeDashoffset={offset} />
        {GOLDEN_TICKS.map((m) => {
          const a = (m / GOLDEN_SPAN_MIN) * 2 * Math.PI;
          return <Line key={m} x1={50 + 34 * Math.cos(a)} y1={50 + 34 * Math.sin(a)} x2={50 + 50 * Math.cos(a)} y2={50 + 50 * Math.sin(a)} stroke={c.text} strokeWidth="3" />;
        })}
        </G>
      </Svg>
      <Text style={{ fontFamily: FONT.display, fontSize: size * 0.3, color: c.text }}>{minutes}</Text>
      <Text style={{ fontFamily: FONT.ui, fontSize: 10, color: c.muted, marginTop: -4 }}>{txt.min}</Text>
    </View>
  );
}

/** Countdown before an automatic alert; last 5 s thicker, full-contrast ring. The parent ticks `remaining`. */
export function CountdownRing({ remaining, total = 30, size = 240, mode }: { remaining: number; total?: number; size?: number; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const txt = useUiText();
  const secs = Math.max(0, Math.ceil(remaining));
  const urgent = secs <= 5;
  const { circumference, offset } = ringDash(44, remaining / total);
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={txt.countdownLabel(secs)} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg viewBox="0 0 100 100" width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
        {/* rotate inside the SVG: an explicit origin, identical on Android, iOS and web */}
        <G transform="rotate(-90 50 50)">
        <Circle cx="50" cy="50" r="44" fill="none" stroke={c.line} strokeWidth={urgent ? 8 : 5} />
        <Circle cx="50" cy="50" r="44" fill="none" stroke={urgent ? c.text : c.brandFill} strokeWidth={urgent ? 8 : 5} strokeLinecap="round"
          strokeDasharray={`${circumference}`} strokeDashoffset={offset} />
        </G>
      </Svg>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, direction: 'ltr' }}>
        <Text style={{ fontFamily: FONT.display, fontSize: size * 0.32, color: c.text }}>{secs}</Text>
        <Text style={{ fontFamily: FONT.ui, fontSize: 20, color: c.muted }}>{txt.sec}</Text>
      </View>
      {urgent && <Text style={{ position: 'absolute', bottom: size * 0.14, fontFamily: FONT.uiMedium, fontSize: 14, color: c.text }}>{txt.sending}</Text>}
    </View>
  );
}
