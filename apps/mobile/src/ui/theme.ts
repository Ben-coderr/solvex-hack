import { tokens, type ThemeMode } from '@najda/tokens';
import { useColorScheme } from 'react-native';
import {
  BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';

/** Pass to expo-font's useFonts() in the root layout. Real weights only: never faux-bold Arabic (docs/06 §3). */
export const FONT_FILES = {
  IBMPlexSansArabic_400Regular, IBMPlexSansArabic_500Medium, IBMPlexSansArabic_600SemiBold,
  IBMPlexMono_400Regular, IBMPlexMono_500Medium,
  BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold,
};

export const FONT = {
  ui: 'IBMPlexSansArabic_400Regular',
  uiMedium: 'IBMPlexSansArabic_500Medium',
  uiSemibold: 'IBMPlexSansArabic_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  display: 'BricolageGrotesque_600SemiBold',
  displayBold: 'BricolageGrotesque_700Bold',
} as const;

/** Same keys in both modes; values widened to string (the token file is `as const`). */
export type Palette = { readonly [K in keyof (typeof tokens.color)['dark']]: string };

/** Night-first: dark unless the phone is explicitly in light mode. `force` for the styleguide. */
export function useTheme(force?: ThemeMode): { mode: ThemeMode; c: Palette } {
  const scheme = useColorScheme();
  const mode: ThemeMode = force ?? (scheme === 'light' ? 'light' : 'dark');
  return { mode, c: tokens.color[mode] };
}

export const T = tokens; // space, radius, size, fontSize, motion
