import { ringDash } from '@najda/ui-core';
import { Check, Loader } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { FONT, T, useTheme } from './theme';
import { useUiText } from './text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type SosState = 'idle' | 'sending' | 'sent';

/**
 * Hold-to-confirm SOS (docs/03 M7): 1.5 s, ring fills, early release = nothing. 128 dp (>= 72), brand fill, never red.
 * Haptics/alarm belong to the screen (P4). Screen readers confirm with the 'activate' action (no hold gesture).
 */
export function SosButton({ state = 'idle', onConfirm, holdMs = 1500, previewProgress, mode }: {
  state?: SosState; onConfirm?: () => void; holdMs?: number; previewProgress?: number; mode?: 'light' | 'dark';
}) {
  const { c } = useTheme(mode);
  const txt = useUiText();
  const progress = useRef(new Animated.Value(previewProgress ?? 0)).current;
  const [holding, setHolding] = useState((previewProgress ?? 0) > 0);
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const r = 46;
  const { circumference } = ringDash(r, 0);
  useEffect(() => () => anim.current?.stop(), []);

  const begin = () => {
    if (state !== 'idle') return;
    setHolding(true);
    anim.current = Animated.timing(progress, { toValue: 1, duration: holdMs, easing: Easing.linear, useNativeDriver: false });
    anim.current.start(({ finished }) => {
      setHolding(false);
      progress.setValue(0);
      if (finished) onConfirm?.();
    });
  };
  const cancel = () => {
    anim.current?.stop();
    setHolding(false);
    progress.setValue(0);
  };

  const label = state === 'sending' ? txt.sos.sending : state === 'sent' ? txt.sos.sent : holding ? txt.sos.pressed : txt.sos.hint;
  const sent = state === 'sent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: state !== 'idle' }}
      accessibilityHint={txt.sos.idle}
      onPressIn={begin}
      onPressOut={cancel}
      onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'activate') onConfirm?.(); }}
      accessibilityActions={[{ name: 'activate' }]}
      style={{ width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center',
        backgroundColor: sent ? c.raised : c.brandFill, borderWidth: sent ? 2 : 0, borderColor: c.statusOk }}
    >
      <Svg viewBox="0 0 100 100" width={128} height={128} style={{ position: 'absolute', top: 0, left: 0 }}>
        {/* rotate inside the SVG: an explicit origin, identical on Android, iOS and web */}
        <G transform="rotate(-90 50 50)">
        <AnimatedCircle cx="50" cy="50" r={r} fill="none" stroke={c.onBrand} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${circumference}`} opacity={holding ? 1 : 0}
          strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })} />
        </G>
      </Svg>
      {state === 'sending' ? <Loader color={c.onBrand} size={32} />
        : sent ? <Check color={c.statusOk} size={32} />
        : <Text style={{ fontFamily: FONT.displayBold, fontSize: T.fontSize['2xl'], color: c.onBrand, letterSpacing: 1 }}>SOS</Text>}
      <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: sent ? c.text : c.onBrand, textAlign: 'center', maxWidth: 96 }}>{label}</Text>
    </Pressable>
  );
}

