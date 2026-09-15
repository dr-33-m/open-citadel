import { Uniwind, useUniwind } from 'uniwind';

import { useSettingsStore, type AppTheme } from '@/stores/settings';

/**
 * Vendored stand-in for PanelUI's `useTheme`/`useThemeMode` hooks
 * (https://panelui.dev/docs/hooks/use-theme), which ship with the
 * `panelui-native` package. This project installs PanelUI as copied source
 * instead, so the hooks are implemented here against the same machinery
 * PanelUI itself uses: Uniwind's runtime. The API matches the docs so call
 * sites read the same either way.
 *
 * One deliberate difference: the active theme is *persisted* in the settings
 * store (and bridged to Uniwind in `app/_layout.tsx`), rather than living in
 * Uniwind alone — a theme choice has to survive a restart. `setTheme` writes
 * the store and lets the bridge apply it, so there is exactly one writer.
 *
 * This app runs a single theme family — Citadel Frame, with only the `light`
 * and `dark` variants declared in `src/theme.css` — so `family` is a fixed
 * value and family-switching throws the same way PanelUI throws for a theme
 * that was never registered. A `system` mode would need the store extended
 * and a three-way picker in Settings first.
 */

export type CitadelThemeFamily = {
  id: string;
  name: string;
};

export const CITADEL_FAMILY: CitadelThemeFamily = {
  id: 'citadel',
  name: 'Citadel Frame',
};

export type Mode = 'light' | 'dark';

/** Reads the active theme name and sets it — the documented `useTheme` API. */
export function useTheme() {
  const { theme } = useUniwind();
  const setTheme = useSetTheme();

  return {
    /** Active theme name, e.g. `'dark'`. */
    theme,
    setTheme,
  };
}

function useSetTheme() {
  const storeTheme = useSettingsStore((s) => s.theme);
  const setStoredTheme = useSettingsStore((s) => s.setTheme);

  return (name: AppTheme | 'system') => {
    if (name === 'system') {
      // Following the device is a Uniwind-level concept; the store has no
      // `system` value yet, so this applies immediately but does not persist.
      Uniwind.setTheme('system');
      return;
    }

    if (name !== storeTheme) void setStoredTheme(name);
  };
}

/**
 * Treats family and light/dark as separate axes — the documented
 * `useThemeMode` API. The family is always Citadel Frame here, so a sun/moon
 * toggle only ever touches the mode.
 */
export function useThemeMode() {
  const { theme } = useUniwind();
  const setTheme = useSetTheme();

  const mode: Mode = theme === 'light' ? 'light' : 'dark';

  return {
    /** Active family — always Citadel Frame in this app. */
    family: CITADEL_FAMILY,
    mode,
    setFamily: (id: string) => {
      if (id !== CITADEL_FAMILY.id) {
        throw new Error(
          `useThemeMode: theme family '${id}' is not registered. This app declares only '${CITADEL_FAMILY.id}' (see src/theme.css).`,
        );
      }
    },
    setMode: (next: Mode) => setTheme(next),
    /** Flip dark ↔ light, staying inside the current family. */
    toggleMode: () => setTheme(theme === 'light' ? 'dark' : 'light'),
  };
}
