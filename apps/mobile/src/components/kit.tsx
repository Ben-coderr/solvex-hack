import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { I18nManager, Pressable, ScrollView, Text, TextInput, View, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FONT, T, useTheme } from '../ui';
import type { Palette } from '../ui/theme';
import { AppBanner } from './AppBanner';

/**
 * App-level building blocks for A's screens (not the design system: src/ui stays D's). Tokens only;
 * RTL comes from the native layout direction (I18nManager), so `row` and `start` mirror by themselves.
 */
type Variant = 'body' | 'small' | 'label' | 'title' | 'h1' | 'display' | 'mono';
const V: Record<Variant, { fontFamily: string; fontSize: number; lh: number }> = {
  small: { fontFamily: FONT.ui, fontSize: T.fontSize.sm, lh: 1.5 },
  body: { fontFamily: FONT.ui, fontSize: T.fontSize.base, lh: 1.5 },
  label: { fontFamily: FONT.uiMedium, fontSize: T.fontSize.base, lh: 1.4 },
  title: { fontFamily: FONT.uiSemibold, fontSize: T.fontSize.lg, lh: 1.35 },
  h1: { fontFamily: FONT.uiSemibold, fontSize: T.fontSize.xl, lh: 1.25 },
  display: { fontFamily: FONT.display, fontSize: T.fontSize['4xl'], lh: 1.15 },
  mono: { fontFamily: FONT.mono, fontSize: T.fontSize.sm, lh: 1.5 },
};

export function Txt({ v = 'body', tone = 'text', style, children, ltr, ...rest }: {
  v?: Variant; tone?: keyof Palette; style?: TextStyle; children: ReactNode; ltr?: boolean; numberOfLines?: number; accessibilityRole?: 'header';
}) {
  const { c } = useTheme();
  const base = V[v];
  // Arabic needs ~8 % more line height (docs/06 §3); numerals/mono runs stay LTR inside RTL text
  const lh = Math.round(base.fontSize * base.lh * (I18nManager.isRTL && v !== 'mono' && v !== 'display' ? T.lineHeight.arabicBoost : 1));
  return (
    <Text {...rest} style={[{ fontFamily: base.fontFamily, fontSize: base.fontSize, lineHeight: lh, color: c[tone] as string, textAlign: 'auto' }, ltr && { writingDirection: 'ltr' }, style]}>
      {children}
    </Text>
  );
}

export function Screen({ children, scroll = true, padded = true, footer }: { children: ReactNode; scroll?: boolean; padded?: boolean; footer?: ReactNode }) {
  const { c } = useTheme();
  const pad: ViewStyle = padded ? { padding: T.space[4], gap: T.space[5] } : {};
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <AppBanner />
      {scroll ? (
        <ScrollView contentContainerStyle={[pad, { flexGrow: 1 }]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
      {footer && <View style={{ padding: T.space[4], gap: T.space[3], borderTopWidth: 1, borderColor: c.line }}>{footer}</View>}
    </SafeAreaView>
  );
}

export function Btn({ label, onPress, kind = 'primary', icon: Icon, big, disabled, hint, testID }: {
  label: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'quiet'; icon?: LucideIcon; big?: boolean; disabled?: boolean; hint?: string; testID?: string;
}) {
  const { c } = useTheme();
  const primary = kind === 'primary';
  const fg = disabled ? c.muted : primary ? c.onBrand : c.text;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} accessibilityHint={hint} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({
        minHeight: big ? T.size.touchSos : T.size.touchMin, borderRadius: T.radius.md, paddingHorizontal: T.space[4],
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: T.space[2],
        backgroundColor: disabled ? c.raised : primary ? c.brandFill : kind === 'secondary' ? c.surface : 'transparent',
        borderWidth: kind === 'quiet' ? 0 : 1, borderColor: primary && !disabled ? c.brandFill : c.line,
        opacity: pressed ? 0.85 : 1,
      })}>
      {Icon && <Icon size={big ? 24 : 20} color={fg} />}
      <Text style={{ fontFamily: FONT.uiSemibold, fontSize: big ? T.fontSize.lg : T.fontSize.base, color: fg, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export function Section({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: T.space[3], padding: T.space[4], backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: T.radius.md }}>
      {(title || right) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: T.space[3] }}>
          {title && <Txt v="label" tone="muted" accessibilityRole="header">{title}</Txt>}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

/** Label + value row (Drive mode readouts, settings rows). Value side is LTR-isolated for numbers. */
export function Row({ label, value, icon: Icon, tone = 'text' }: { label: string; value: ReactNode; icon?: LucideIcon; tone?: keyof Palette }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space[3], minHeight: 32 }}>
      {Icon && <Icon size={18} color={c.muted} />}
      <Txt tone="muted" style={{ flex: 1 }}>{label}</Txt>
      {typeof value === 'string' ? <Txt v="label" tone={tone} ltr>{value}</Txt> : value}
    </View>
  );
}

/** Inline notice for degraded states (permission refused, no service…). Status colours only, never triage. */
export function Notice({ text, tone = 'statusWarn', icon: Icon }: { text: string; tone?: 'statusWarn' | 'statusInfo' | 'statusDanger' | 'statusOk'; icon?: LucideIcon }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: T.space[2], padding: T.space[3], borderWidth: 1, borderColor: c[tone], borderRadius: T.radius.sm, alignItems: 'flex-start' }}>
      {Icon && <Icon size={18} color={c[tone]} />}
      <Txt v="small" style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}

/** Labelled text input; the error line replaces the hint. Values like URLs and numbers are LTR. */
export function Field({ label, value, onChangeText, hint, error, ltr, secure, keyboardType, testID }: {
  label: string; value: string; onChangeText: (v: string) => void; hint?: string; error?: string | null; ltr?: boolean; secure?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'url'; testID?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: T.space[1] }}>
      <Txt v="label">{label}</Txt>
      <TextInput testID={testID} value={value} onChangeText={onChangeText} placeholder={hint} placeholderTextColor={c.muted} secureTextEntry={secure}
        autoCapitalize="none" autoCorrect={false} keyboardType={keyboardType} accessibilityLabel={label}
        style={{ minHeight: T.size.touchMin, borderWidth: 1, borderColor: error ? c.statusDanger : c.line, borderRadius: T.radius.sm, paddingHorizontal: T.space[3],
          color: c.text, backgroundColor: c.bg, fontFamily: ltr ? FONT.mono : FONT.ui, fontSize: T.fontSize.base, textAlign: ltr ? 'left' : 'auto', writingDirection: ltr ? 'ltr' : undefined }} />
      {error ? <Txt v="small" tone="statusDanger">{error}</Txt> : null}
    </View>
  );
}

/** Two-to-four choice segmented control, 48 dp per option. */
export function Segmented<V extends string | number>({ value, options, onChange, label }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label: string }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: T.space[1], padding: T.space[1], borderWidth: 1, borderColor: c.line, borderRadius: T.radius.md }}>
      {options.map((o) => (
        <Pressable key={String(o.value)} accessibilityRole="radio" accessibilityState={{ checked: o.value === value }} onPress={() => onChange(o.value)}
          style={{ flex: 1, minHeight: T.size.touchMin, alignItems: 'center', justifyContent: 'center', borderRadius: T.radius.sm, backgroundColor: o.value === value ? c.brandFill : 'transparent' }}>
          <Text style={{ fontFamily: FONT.uiMedium, fontSize: T.fontSize.base, color: o.value === value ? c.onBrand : c.text }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
