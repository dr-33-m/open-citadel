import React from 'react';
import { Text, type TextProps } from 'react-native';
import { withUniwind } from 'uniwind';

import { useThemeTokens } from '@/hooks/use-theme-tokens';
import { typography, type TypographyVariant } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  type?: TypographyVariant;
  color?: string;
  italic?: boolean;
};

function ThemedTextBase({
  style,
  type = 'bodyMd',
  color,
  italic,
  ...rest
}: ThemedTextProps) {
  // Default text colour resolves the live theme token rather than any JS
  // palette, so it re-resolves on every theme switch exactly when the
  // class-driven layer around it does — one theming driver for the whole app.
  // Read from the shared token context, not a subscription of its own: this
  // component is instantiated per row, and a per-instance subscription is what
  // made a theme flip cost hundreds of separate updates (see
  // `hooks/use-theme-tokens`).
  // Unconditional: `color` may be supplied on one render and not the next, and
  // a hook behind a ternary would change the hook order between them.
  const tokens = useThemeTokens();
  const resolvedColor = color !== undefined ? color : tokens['--color-foreground'];
  const typeStyle = typography[type];

  return (
    <Text
      style={[
        typeStyle,
        { color: resolvedColor },
        italic && { fontStyle: 'italic' },
        style,
      ]}
      {...rest}
    />
  );
}

/**
 * `className` does nothing on a plain custom component wrapping RN's `Text`
 * — Uniwind only auto-instruments React Native's own built-ins, not
 * components an app defines on top of them. `withUniwind` retrofits that
 * support once, here, so `<ThemedText className="...">` works for layout
 * classes (padding, flex, etc.) the same as it would on a raw `Text`. Colour
 * still goes through the `color` prop above, not className — resolve a
 * semantic token to a literal value with `useCSSVariable` first (see
 * rules/styling.md: "resolve a dynamic colour with useCSSVariable, never by
 * reading a hex out of the theme").
 */
export const ThemedText = withUniwind(ThemedTextBase);
