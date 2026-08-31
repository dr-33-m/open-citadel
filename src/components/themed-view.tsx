import React from 'react';
import { View, type ViewProps } from 'react-native';
import { withUniwind } from 'uniwind';

import { useThemeTokens } from '@/hooks/use-theme-tokens';

export type SurfaceLevel = 'base' | 'low' | 'mid' | 'highest';

export type ThemedViewProps = ViewProps & {
  surface?: SurfaceLevel;
};

/** The surface ladder, expressed as PanelUI tokens rather than a JS palette:
 * the page, the raised card, the inset well, the strongest step. */
const SURFACE_TOKENS = [
  '--color-background',
  '--color-card',
  '--color-muted',
  '--color-surface-tertiary',
] as const;

/** `surface` prop -> index into `SURFACE_TOKENS`. */
const SURFACE_LEVEL: Record<SurfaceLevel, 0 | 1 | 2 | 3> = {
  base: 0,
  low: 1,
  mid: 2,
  highest: 3,
};

function ThemedViewBase({
  style,
  surface = 'base',
  ...otherProps
}: ThemedViewProps) {
  // Shared token context rather than a subscription per instance — see
  // `hooks/use-theme-tokens`.
  const tokens = useThemeTokens();
  const surfaceColor = tokens[SURFACE_TOKENS[SURFACE_LEVEL[surface]]];

  return (
    <View
      style={[{ backgroundColor: surfaceColor }, style]}
      {...otherProps}
    />
  );
}

/**
 * `className` does nothing on a plain custom component wrapping RN's `View`
 * — Uniwind only auto-instruments React Native's own built-ins, not
 * components an app defines on top of them. `withUniwind` retrofits that
 * support once, here, so `<ThemedView className="...">` works for layout
 * classes the same way as it would on a raw `View`. The `surface` prop above
 * still sets its own background; a `bg-*` class in `className` will layer on
 * top of (and typically override) it, same as any other `style` composition.
 */
export const ThemedView = withUniwind(ThemedViewBase);
