import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
  Newsreader_700Bold,
  Newsreader_700Bold_Italic,
} from '@expo-google-fonts/newsreader';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';

import { runMigrations } from '@/db/migrations';
import { useColors } from '@/hooks/use-colors';
import { useSettingsStore } from '@/stores/settings';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    Newsreader_700Bold,
    Newsreader_700Bold_Italic,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  const [dbReady, setDbReady] = useState(false);
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const theme = useSettingsStore((s) => s.theme);
  const colors = useColors();

  useEffect(() => {
    runMigrations()
      .then(() => loadSettings())
      .then(() => setDbReady(true));
  }, []);

  const navTheme = useMemo(
    () => ({
      ...(theme === 'light' ? DefaultTheme : DarkTheme),
      colors: {
        ...(theme === 'light' ? DefaultTheme.colors : DarkTheme.colors),
        background: colors.surface.base,
        card: colors.surface.low,
        text: colors.text.primary,
        border: 'transparent',
        primary: colors.primary.default,
      },
    }),
    [theme, colors]
  );

  useEffect(() => {
    if (fontsLoaded && dbReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, dbReady]);

  if (!fontsLoaded || !dbReady) return null;

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface.base } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="reader/[id]"
          options={{
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="section/[type]"
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="collection/[id]"
          options={{
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />
      </Stack>
    </ThemeProvider>
  );
}
