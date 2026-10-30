import { ringDash } from '@najda/ui-core';
import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import type { DetectorState } from '../detector/detector';
import { T, useTheme } from '../ui';
import { Txt } from './kit';

/**
 * Drive status ring: IDLE = thin outline that fills as the speed gate is held (10 s > 25 km/h), ARMED = solid brand
 * ring. Brand colour only (a triage hue here would read as a severity). Static: the countdown ring is the only
 * continuous animation in the app.
 */
export function DriveRing({ state, armProgress, label, hint, size = 200 }: { state: DetectorState; armProgress: number; label: string; hint: string; size?: number }) {
  const { c } = useTheme();
  const armed = state !== 'IDLE';
  const { circumference, offset } = ringDash(44, armed ? 1 : armProgress);
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={`${label}. ${hint}`} style={{ alignItems: 'center', gap: T.space[3] }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg viewBox="0 0 100 100" width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
          <G transform="rotate(-90 50 50)">
            <Circle cx="50" cy="50" r="44" fill="none" stroke={c.line} strokeWidth={armed ? 7 : 3} />
            <Circle cx="50" cy="50" r="44" fill="none" stroke={c.brandFill} strokeWidth={armed ? 7 : 3} strokeLinecap="round"
              strokeDasharray={`${circumference}`} strokeDashoffset={offset} />
          </G>
        </Svg>
        <Txt v="h1" tone={armed ? 'brandText' : 'text'} style={{ textAlign: 'center', maxWidth: size * 0.7 }}>{label}</Txt>
      </View>
      <Txt v="small" tone="muted" style={{ textAlign: 'center' }}>{hint}</Txt>
    </View>
  );
}
