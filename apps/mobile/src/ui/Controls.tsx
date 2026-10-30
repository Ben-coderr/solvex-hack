import { Car, CircleAlert, Inbox, MapPin, Send, TriangleAlert, Users, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text, View } from 'react-native';
import { FONT, T, useTheme } from './theme';
import { useUiText } from './text';

export type Locale = 'ar' | 'fr' | 'en';

/** ar / fr / en, each labelled in itself; 48 dp targets. The app applies RTL + restart (P4). */
export function LocaleSwitch({ value, onChange, mode }: { value: Locale; onChange: (l: Locale) => void; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const txt = useUiText();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={txt.locale.label}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 4, borderWidth: 1, borderColor: c.line, borderRadius: T.radius.lg, alignSelf: 'flex-start' }}>
      {(['ar', 'fr', 'en'] as const).map((l) => (
        <Pressable key={l} accessibilityRole="radio" accessibilityState={{ checked: l === value }} onPress={() => onChange(l)}
          style={{ minHeight: T.size.touchMin, paddingHorizontal: 16, justifyContent: 'center', borderRadius: T.radius.pill, backgroundColor: l === value ? c.brandFill : 'transparent' }}>
          <Text style={{ fontFamily: FONT.uiMedium, fontSize: T.fontSize.sm, color: l === value ? c.onBrand : c.text }}>{txt.locale[l]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const STEP_ICONS: LucideIcon[] = [Car, Users, TriangleAlert, MapPin, Send];

/** Witness flow progress: 5 pictograms, follows reading direction. */
export function WitnessStepper({ current, mode }: { current: number; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const txt = useUiText();
  return (
    <View accessibilityLabel={txt.witnessProgress(current + 1, 5)} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {STEP_ICONS.map((Icon, i) => {
          const done = i < current, now = i === current;
          return (
            <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }} accessibilityState={{ selected: now }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                borderColor: now ? c.brandFill : done ? c.text : c.line, backgroundColor: now ? c.brandFill : done ? c.text : 'transparent' }}>
                <Icon size={20} color={now ? c.onBrand : done ? c.bg : c.muted} />
              </View>
              <Text style={{ fontFamily: now ? FONT.uiSemibold : FONT.ui, fontSize: 12, color: now ? c.text : c.muted, textAlign: 'center' }}>{txt.witnessSteps[i]}</Text>
            </View>
          );
        })}
      </View>
      <Text style={{ fontFamily: FONT.ui, fontSize: T.fontSize.sm, color: c.muted }}>{txt.witnessProgress(current + 1, 5)}</Text>
    </View>
  );
}

export function EmptyState({ title, body, mode }: { title?: string; body?: string; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const txt = useUiText();
  return (
    <View style={{ gap: 8, padding: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, borderRadius: T.radius.md }}>
      <Inbox size={24} color={c.muted} />
      <Text style={{ fontFamily: FONT.uiMedium, fontSize: T.fontSize.lg, color: c.text }}>{title ?? txt.emptyTitle}</Text>
      <Text style={{ fontFamily: FONT.ui, fontSize: T.fontSize.base, color: c.muted }}>{body ?? txt.emptyBody}</Text>
    </View>
  );
}

export function ErrorState({ onRetry, mode }: { onRetry?: () => void; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const txt = useUiText();
  return (
    <View accessibilityRole="alert" style={{ gap: 8, padding: 24, borderWidth: 1, borderColor: c.statusDanger, borderRadius: T.radius.md }}>
      <CircleAlert size={24} color={c.statusDanger} />
      <Text style={{ fontFamily: FONT.uiMedium, fontSize: T.fontSize.lg, color: c.text }}>{txt.errorTitle}</Text>
      <Text style={{ fontFamily: FONT.ui, fontSize: T.fontSize.base, color: c.muted }}>{txt.errorBody}</Text>
      {onRetry && (
        <Pressable accessibilityRole="button" onPress={onRetry} style={{ minHeight: T.size.touchMin, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 16, borderWidth: 1, borderColor: c.line, borderRadius: T.radius.md }}>
          <Text style={{ fontFamily: FONT.uiMedium, fontSize: T.fontSize.base, color: c.text }}>{txt.retry}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Shimmer placeholder; static when the user asked for reduced motion. */
export function Skeleton({ width, height, mode }: { width: number | `${number}%`; height: number; mode?: 'light' | 'dark' }) {
  const { c } = useTheme(mode);
  const o = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      ]));
      loop.start();
    });
    return () => loop?.stop();
  }, [o]);
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height, opacity: o, borderRadius: 6, backgroundColor: c.raised }} />;
}
