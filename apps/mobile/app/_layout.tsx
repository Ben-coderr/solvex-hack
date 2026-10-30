import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { applyLocale, deviceLocale, initI18n, useUiStrings } from '@/src/i18n';
import { startOutbox } from '@/src/services/alerts';
import { startConnectivity } from '@/src/services/connectivity';
import { useSettings } from '@/src/state/settings';
import { FONT_FILES, UiTextProvider, useTheme } from '@/src/ui';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

/** Settings live in SQLite: wait for them before choosing the language and the first screen. */
function useHydrated() {
  const [done, setDone] = useState(useSettings.persist.hasHydrated());
  useEffect(() => useSettings.persist.onFinishHydration(() => setDone(true)), []);
  return done;
}

export default function RootLayout() {
  const [fonts, fontError] = useFonts(FONT_FILES);
  const hydrated = useHydrated();
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (!hydrated) return;
    const locale = useSettings.getState().locale ?? deviceLocale();
    void initI18n(locale).then(async () => {
      // the stored language and the native direction disagree (first Arabic launch): fix it, which may reload
      if (useSettings.getState().locale && I18nManager.isRTL !== (locale === 'ar')) await applyLocale(locale);
      setI18nReady(true);
    });
    const stopLink = startConnectivity();
    void startOutbox();
    return stopLink;
  }, [hydrated]);

  const ready = fonts && hydrated && i18nReady;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  return <RootNav />;
}

function RootNav() {
  const { mode, c } = useTheme();
  const ui = useUiStrings();
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <SafeAreaProvider>
      <UiTextProvider value={ui}>
        <ThemeProvider value={{ ...base, colors: { ...base.colors, background: c.bg, card: c.surface, text: c.text, border: c.line, primary: c.brandFill } }}>
          <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false, animation: 'fade', animationDuration: 200, contentStyle: { backgroundColor: c.bg } }}>
            <Stack.Screen name="countdown" options={{ gestureEnabled: false, animation: 'none' }} />
            <Stack.Screen name="styleguide" options={{ headerShown: true, title: 'Styleguide' }} />
          </Stack>
        </ThemeProvider>
      </UiTextProvider>
    </SafeAreaProvider>
  );
}
