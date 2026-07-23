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
import * as Linking from 'expo-linking';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';

import { ApprovalDialog } from '@/components/approval-dialog';
import { runMigrations } from '@/db/migrations';
import { useColors } from '@/hooks/use-colors';
import { useSettingsStore } from '@/stores/settings';
import { useBooksStore } from '@/stores/books';
import { importIncomingFile } from '@/services/book-import';
import { reanchorLocalPaths } from '@/services/path-reanchor';
import { registerTTSBackgroundHandler, setupTTSMediaSession } from '@/services/tts-media-session';

SplashScreen.preventAutoHideAsync();

// Register Android background event handler at module level (before app renders)
registerTTSBackgroundHandler();

// Catches throws from route module evaluation / rendering that would otherwise
// crash the app with an unhandled JS exception on startup.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 16, textAlign: 'center' }}>{error.message}</Text>
      <Pressable onPress={retry} style={{ paddingVertical: 8, paddingHorizontal: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: '600' }}>Try again</Text>
      </Pressable>
    </View>
  );
}

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
      // Repair stale iOS container paths before anything reads books/covers.
      .then(() => reanchorLocalPaths())
      .then(() => loadSettings())
      .then(() => {
        setupTTSMediaSession();
        setDbReady(true);
      })
      .catch((err) => {
        console.error('Startup failed:', err);
        setDbReady(true);
      });
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

  // iOS: import EPUBs opened into the app ("Open in Open Citadel", share sheet,
  // AirDrop). iOS hands us a file:// URL; copy it into the owned folder and sync.
  // Gated on dbReady so syncBooks() has a migrated database.
  useEffect(() => {
    if (Platform.OS !== 'ios' || !dbReady) return;

    const handleUrl = async (url: string | null) => {
      if (!url || !url.startsWith('file://')) return;
      const dest = await importIncomingFile(url);
      if (!dest) return;
      const store = useBooksStore.getState();
      await store.initLibrary();
      await store.syncBooks();
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [dbReady]);

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
      <ApprovalDialog />
    </ThemeProvider>
  );
}
