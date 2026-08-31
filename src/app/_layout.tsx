import '@/global.css';
// Side-effect import: collapses a library-sourced Reanimated warning that
// would otherwise bury the dev console. See the module for why.
import '@/lib/quiet-reanimated-deps-warning';

import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
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
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useReducedMotion, useSharedValue } from 'react-native-reanimated';
import type { ErrorBoundaryProps } from 'expo-router';

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

import { ApprovalDialog } from '@/components/approval-dialog';
import { MemoryHud } from '@/components/dev/memory-hud';
import { PanelUIProvider } from '@/components/ui/panel-ui-provider';
import { ThemeTokensProvider } from '@/hooks/use-theme-tokens';
import { TransitionStack } from '@/navigation/stack';
import {
  drawerTransition,
  fadeTransition,
  hubTransition,
  sideTransition,
} from '@/navigation/transitions';
import { runMigrations } from '@/db/migrations';
import { useModelStore } from '@/stores/model';
import { useSettingsStore } from '@/stores/settings';
import { useBooksStore } from '@/stores/books';
import { importIncomingFile } from '@/services/book-import';
import { reanchorLocalPaths } from '@/services/path-reanchor';
import { startModelLifecycle, stopModelLifecycle } from '@/services/model-lifecycle';
import { registerTTSBackgroundHandler, setupTTSMediaSession } from '@/services/tts-media-session';
import { Uniwind, useCSSVariable } from 'uniwind';

import { asColor } from '@/utils/colors';

SplashScreen.preventAutoHideAsync();

// Register Android background event handler at module level (before app renders)
registerTTSBackgroundHandler();

// Catches throws from route module evaluation / rendering that would otherwise
// crash the app with an unhandled JS exception on startup.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 items-center justify-center gap-4 p-6">
      <Text className="text-center text-[16px]">{error.message}</Text>
      <Pressable onPress={retry} className="px-4 py-2">
        <Text className="text-[14px] font-semibold">Try again</Text>
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
  const [background, card, foreground, primary, scrim] = useCSSVariable([
    '--color-background',
    '--color-card',
    '--color-foreground',
    '--color-primary',
    '--color-scrim',
  ]);
  // Spatial screen motion is exactly what Reduce Motion asks us to drop, so
  // every screen cross-fades in place instead. Read here rather than per
  // screen so one switch covers the whole navigator.
  const reduceMotion = useReducedMotion();

  // The app's own theme setting is the single source of truth; Uniwind (and
  // therefore every PanelUI token class in the app) follows the OS color
  // scheme by default and knows nothing about it. Bridging here — in a layout
  // effect, before first paint — pins the whole class-driven layer to the
  // setting, and `setTheme` also forces the native `Appearance` to match so
  // platform surfaces (dialogs, sheets) agree with it. Without this, a device
  // in dark mode running the app set to light renders half-dark: class-styled
  // surfaces resolve the OS scheme while anything still themed in JS resolves
  // the setting. `setTheme('light' | 'dark')` also switches off Uniwind's
  // adaptive (follow-the-OS) mode, which is exactly the intent — the user
  // chose a side. A future 'system' setting would call `setTheme('system')`.
  // Applied synchronously, before paint. This must NOT be wrapped in
  // `startTransition`: `Uniwind.setTheme` notifies an external store, and every
  // `useCSSVariable`/`useUniwind` subscriber answers with its own `setState`.
  // Deferring that fan-out to a Transition both delays the repaint (the theme
  // visibly lagging the switch) and drops React's tearing guarantee for the
  // store — which showed up as a blank screen, and as React's own warning
  // "Detected a large number of updates inside startTransition ... concurrent
  // mode guarantees are off the table". The fan-out is the cost to attack (see
  // `hooks/use-theme-tokens`), not the scheduling.
  useLayoutEffect(() => {
    Uniwind.setTheme(theme);
  }, [theme]);

  // Free the on-device engine + image memory when the OS is under pressure or
  // the app is backgrounded — the guard against the long-session black screen.
  useEffect(() => {
    startModelLifecycle();
    return () => stopModelLifecycle();
  }, []);

  useEffect(() => {
    runMigrations()
      // Path repair and settings load both only need the migrated schema, not
      // each other — settings never touches book paths — so they overlap here
      // rather than chaining. `setDbReady` still waits for both, so nothing
      // reads a book/cover before the paths are repaired.
      .then(() => Promise.all([reanchorLocalPaths(), loadSettings()]))
      .then(() => {
        setupTTSMediaSession();
        setDbReady(true);
        // Hydrate the local model list at startup — previously only the
        // Settings screen loaded it, so the chat tab's first open saw an
        // empty store and claimed Samwell wasn't set up. Fire-and-forget:
        // the store's modelsHydrated flag carries the completion signal.
        useModelStore.getState().loadModels().catch((err) => {
          console.error('Model hydration failed:', err);
        });
      })
      .catch((err) => {
        console.error('Startup failed:', err);
        setDbReady(true);
      });
    // `loadSettings` is a stable zustand action; listed to satisfy the lint
    // rule without changing the run-once-on-mount behaviour.
  }, [loadSettings]);

  const navTheme = useMemo(
    () => ({
      ...(theme === 'light' ? DefaultTheme : DarkTheme),
      colors: {
        ...(theme === 'light' ? DefaultTheme.colors : DarkTheme.colors),
        background: asColor(background)!,
        card: asColor(card)!,
        text: asColor(foreground)!,
        border: 'transparent',
        primary: asColor(primary)!,
      },
    }),
    [theme, background, card, foreground, primary]
  );

  useEffect(() => {
    if (fontsLoaded && dbReady) {
      SplashScreen.setOptions({ fade: true, duration: 400 });
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, dbReady]);

  // iOS: import EPUBs opened into the app ("Open in Open Citadel", share sheet,
  // AirDrop). iOS hands us a file:// URL; copy it into the owned folder and sync.
  // Gated on dbReady so syncBooks() has a migrated database.
  useEffect(() => {
    if (process.env.EXPO_OS !== 'ios' || !dbReady) return;

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

  // An interpolator is a worklet and cannot read a CSS variable, so the scrim
  // it dims with is resolved here — into a shared value rather than closed over
  // as a string. Closing over the string made every transition config a
  // function of the live theme, so a theme switch rebuilt all four and the
  // navigator re-registered every screen's options in the same commit as the
  // token cascade. The worklet reads `.value` on the frame it runs instead, so
  // the configs below are built once for the life of the app.
  const scrimValue = useSharedValue('transparent');
  useEffect(() => {
    scrimValue.value = asColor(scrim) ?? 'transparent';
  }, [scrim, scrimValue]);

  const screenTransitions = useMemo(() => {
    if (reduceMotion) {
      const fade = fadeTransition();
      return { hub: fade, side: fade, sideEdge: fade, drawer: fade };
    }
    return {
      hub: hubTransition({ scrim: scrimValue }),
      side: sideTransition({ side: 1, scrim: scrimValue }),
      sideEdge: sideTransition({ side: 1, scrim: scrimValue, edgeOnly: true }),
      drawer: drawerTransition({ scrim: scrimValue }),
    };
  }, [reduceMotion, scrimValue]);

  if (!fontsLoaded || !dbReady) return null;

  return (
    // ThemeTokensProvider wraps everything, PanelUIProvider included, so the
    // portal host that sheets present into resolves its tokens from the same
    // single subscription as the rest of the tree.
    <ThemeTokensProvider>
    {/* PanelUIProvider owns the gesture handler root every gesture recognizer
        in the app needs, plus PanelUI's own portal/toast host and the keyboard
        controller provider. */}
    <PanelUIProvider>
      {/* Every sheet in the app is a @gorhom/bottom-sheet modal (see
          components/ui/sheet), and they present into this provider's own
          portal host. It sits above the navigator rather than inside it, so a
          sheet is drawn over whatever screen opened it and is never clipped by
          that screen's transition. */}
      <BottomSheetModalProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
          {/* Hub and spokes. The hub is one route — Timeline, Library and
              Samwell are pages of a pager inside it (`components/hub/hub-pager`),
              because they are peers and a swipe between peers should track the
              finger rather than push a route. Everything else here is a spoke
              that rises or slides over whichever page is showing.
              `navigation/transitions` holds the choreography; these options only
              say where each screen belongs. */}
          <TransitionStack screenOptions={screenTransitions.side}>
            <TransitionStack.Screen name="index" options={screenTransitions.hub} />
            <TransitionStack.Screen
            name="settings"
            options={{
              ...screenTransitions.drawer,
              // `hide` (the default) detaches a hidden screen's view, and the
              // re-attach layout of this screen's large tree lands in the same
              // burst as the first frames of the rise — the open measured three
              // times the close's jank. `keep` leaves the view attached while
              // hidden, so both directions are a plain translate of a laid-out
              // layer. Its per-open work is settle-gated, so nothing hidden
              // actually runs.
              inactiveBehavior: 'keep',
            }}
          />
            {/* Edge-only: the reader turns pages with the same horizontal
                swipe, so a screen-wide back gesture would eat every page turn. */}
            <TransitionStack.Screen
              name="reader/[id]"
              options={{
                ...screenTransitions.sideEdge,
                // Same reason `settings` above uses it, plus a worse failure of
                // its own. `hide` detaches a hidden screen's view; on re-attach
                // the reader's screen container stopped receiving its animated
                // style, so it stayed at whatever the hidden state last wrote —
                // the visibility-block offset, two viewports down. The screen
                // was then invisible while still laid out full-size and still
                // hit-testing, so it covered the Library and swallowed every
                // touch: the app looked frozen with every thread idle.
                //
                // Measured, not inferred: an un-animated probe painted from the
                // screen's outer wrapper while an identical probe one level in
                // (inside the animated container) did not, with the JS side
                // reporting the block clear the whole time.
                //
                // `keep` never detaches, so there is no re-attach to lose.
                inactiveBehavior: 'keep',
              }}
            />
            <TransitionStack.Screen name="chat/[id]" options={screenTransitions.side} />
            <TransitionStack.Screen name="section/[type]" options={screenTransitions.drawer} />
            <TransitionStack.Screen name="collection/[id]" options={screenTransitions.drawer} />
          </TransitionStack>
          <ApprovalDialog />
          {__DEV__ && <MemoryHud />}
        </ThemeProvider>
      </BottomSheetModalProvider>
    </PanelUIProvider>
    </ThemeTokensProvider>
  );
}
